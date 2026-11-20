// The relay on this computer, for trying the whiteboards without Cloudflare, and for the tests:
//
//   DRAW_KEY=draw-test TV_KEY=tv-test node relay/src/dev-server.mjs [port]     (default 8787)
//
// It serves the phone page (relay/public) and the same rooms as the Worker (room.js), kept in memory
// only. It has its own small WebSocket server (no packages to install). Not for the internet: it has no
// TLS. Phones away from home need the Cloudflare one (relay/README.md).
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Room, sameKey } from "./room.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "..", "public");
const PORT = +(process.argv[2] || process.env.PORT || 8787);
const DRAW_KEY = process.env.DRAW_KEY || "", TV_KEY = process.env.TV_KEY || "";
const ID = /^[A-Za-z0-9_-]{1,32}$/;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

function memoryStore() {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    put: (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); },
    list: (prefix) => new Map([...m].filter(([k]) => k.startsWith(prefix))),
  };
}
const rooms = new Map();   // household -> {room, socks:Set}
function roomOf(h) {
  if (!rooms.has(h)) rooms.set(h, { room: new Room(memoryStore()), socks: new Set() });
  return rooms.get(h);
}

// ---------- a small WebSocket (RFC 6455: text frames, ping, close) ----------
function frame(text, op = 1) {
  const data = Buffer.from(text);
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255])
    : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([head, data]);
}
function wrap(socket, onText, onClose) {
  let buf = Buffer.alloc(0), closed = false;
  const s = {
    send: (t) => { if (!closed) socket.write(frame(t)); },
    close: () => { if (!closed) { closed = true; try { socket.end(frame("", 8)); } catch {} onClose(); } },
  };
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, masked = buf[1] & 128;
      let n = buf[1] & 127, at = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); at = 4; }
      else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); at = 10; }
      if (n > 1 << 20) { s.close(); return; }
      const need = at + (masked ? 4 : 0) + n;
      if (buf.length < need) return;
      let data = buf.subarray(at + (masked ? 4 : 0), need);
      if (masked) { const k = buf.subarray(at, at + 4); data = Buffer.from(data.map((b, i) => b ^ k[i % 4])); }
      buf = buf.subarray(need);
      if (op === 8) { s.close(); return; }
      if (op === 9) { socket.write(frame(data.toString(), 10)); continue; }
      if (op === 1) { const t = data.toString(); if (t === "ping") s.send("pong"); else onText(t); }
    }
  });
  socket.on("close", () => { if (!closed) { closed = true; onClose(); } });
  socket.on("error", () => {});
  return s;
}

function tellPhones(r) {
  const on = {};
  for (const o of r.socks) if (o.conn.role === "tv") on[o.conn.tv] = true;
  const msg = JSON.stringify({ t: "tvs", tvs: r.room.tvList(on) });
  for (const o of r.socks) if (o.conn.role === "phone") o.ws.send(msg);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let file = path.normalize(path.join(PUBLIC, u.pathname === "/" ? "index.html" : u.pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

server.on("upgrade", async (req, socket) => {
  const u = new URL(req.url, "http://x"), q = u.searchParams, h = q.get("h") || "", role = q.get("role"), k = q.get("k") || "";
  const refuse = (code, why) => { socket.end(`HTTP/1.1 ${code} ${why}\r\n\r\n`); };
  if (u.pathname !== "/ws" || !ID.test(h)) return refuse(403, "Forbidden");
  if (role === "tv" ? !(sameKey(k, TV_KEY) && ID.test(q.get("tv") || "")) : role === "phone" ? !sameKey(k, DRAW_KEY) : true) return refuse(403, "Forbidden");
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const r = roomOf(h);
  await r.room.load();
  const o = { conn: role === "tv" ? { role: "tv", tv: q.get("tv") } : { role: "phone", tvs: [] } };
  let queue = Promise.resolve();
  o.ws = wrap(socket, (text) => {
    queue = queue.then(async () => {
      const out = await r.room.handle(o.conn, text);
      if (out.conn) o.conn = out.conn;
      for (const m of out.reply || []) o.ws.send(JSON.stringify(m));
      if (out.phones) tellPhones(r);
      for (const { tv, msg } of out.out || []) {
        const t = JSON.stringify(msg);
        for (const x of r.socks) {
          if (x === o) continue;
          if (x.conn.role === "tv" ? x.conn.tv === tv : x.conn.tvs.indexOf(tv) >= 0) x.ws.send(t);
        }
      }
    });
  }, () => { r.socks.delete(o); if (o.conn.role === "tv") tellPhones(r); });
  r.socks.add(o);
  if (o.conn.role === "tv") { r.room.tv(o.conn.tv); o.ws.send(JSON.stringify(r.room.hello(o.conn.tv))); tellPhones(r); }
  else tellPhones(r);
});

server.listen(PORT, () => console.log(`family relay on http://localhost:${PORT} (phone page at /, sockets at /ws)`));
