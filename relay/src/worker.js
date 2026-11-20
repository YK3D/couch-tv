// The family whiteboards' relay on Cloudflare (free plan): a Worker that serves the phone page
// (public/) and hands each WebSocket to the household's Durable Object, which keeps the boards.
// Deploy: relay/README.md. Keys (wrangler secret put): DRAW_KEY for the phones, TV_KEY for the TVs
// (read only). Optional HOUSEHOLD: the one household this relay serves.
import { DurableObject } from "cloudflare:workers";
import { Room, sameKey } from "./room.js";

const ID = /^[A-Za-z0-9_-]{1,32}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/ws") return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket only", { status: 426 });
    const q = url.searchParams, h = q.get("h") || "", role = q.get("role"), k = q.get("k") || "";
    if (!ID.test(h) || (env.HOUSEHOLD && h !== env.HOUSEHOLD)) return new Response("Unknown household", { status: 403 });
    if (role === "tv") {
      if (!sameKey(k, env.TV_KEY || "") || !ID.test(q.get("tv") || "")) return new Response("Wrong key", { status: 403 });
    } else if (role === "phone") {
      if (!sameKey(k, env.DRAW_KEY || "")) return new Response("Wrong key", { status: 403 });
    } else return new Response("Bad role", { status: 400 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(h));
    return stub.fetch(request);
  },
};

export class FamilyRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const s = ctx.storage;
    this.room = new Room({
      get: (k) => s.get(k),
      put: (k, v) => s.put(k, v),
      list: (prefix) => s.list({ prefix }),
    });
    // keep-alives are answered without waking the object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(() => this.room.load());
  }

  conns() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, conn: ws.deserializeAttachment() || {} }));
  }

  online(gone) {
    const on = {};
    for (const { ws, conn } of this.conns()) if (conn.role === "tv" && ws !== gone) on[conn.tv] = true;
    return on;
  }

  tellPhones(gone) {
    const msg = JSON.stringify({ t: "tvs", tvs: this.room.tvList(this.online(gone)) });
    for (const { ws, conn } of this.conns()) if (conn.role === "phone") try { ws.send(msg); } catch {}
  }

  async fetch(request) {
    const q = new URL(request.url).searchParams;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const conn = q.get("role") === "tv" ? { role: "tv", tv: q.get("tv") } : { role: "phone", tvs: [] };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(conn);
    if (conn.role === "tv") {
      this.room.tv(conn.tv);
      server.send(JSON.stringify(this.room.hello(conn.tv)));
    } else server.send(JSON.stringify({ t: "tvs", tvs: this.room.tvList(this.online()) }));
    if (conn.role === "tv") this.tellPhones();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    const conn = ws.deserializeAttachment() || {};
    const r = await this.room.handle(conn, typeof data === "string" ? data : new TextDecoder().decode(data));
    if (r.conn) ws.serializeAttachment(r.conn);
    for (const m of r.reply || []) ws.send(JSON.stringify(m));
    if (r.phones) this.tellPhones();
    for (const { tv, msg } of r.out || []) {
      const text = JSON.stringify(msg);
      for (const o of this.conns()) {
        if (o.ws === ws) continue;
        const watching = o.conn.role === "tv" ? o.conn.tv === tv : (o.conn.tvs || []).indexOf(tv) >= 0;
        if (watching) try { o.ws.send(text); } catch {}
      }
    }
  }

  async webSocketClose(ws, code) {
    const conn = ws.deserializeAttachment() || {};
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    if (conn.role === "tv") this.tellPhones(ws);
  }

  async webSocketError(ws) {
    try { ws.close(1011, "error"); } catch {}
  }
}
