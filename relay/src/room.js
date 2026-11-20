// The family whiteboards' meeting point: one room per household, holding each TV's four boards. Phones
// draw into it (from home or anywhere), TVs read from it. The same logic runs in the Cloudflare Durable
// Object (worker.js) and in the local test server (dev-server.mjs); it never touches a network itself.
//
// Messages (JSON, one per WebSocket frame):
//   phone -> room  {t:"sub", tvs:[ids]}                     which TV(s) this phone draws on and watches
//                  {t:"seg", m, id, c, w, e, p:[x,y,...]}   part of a stroke (m: whose board)
//                  {t:"end", m, id} {t:"undo", m, id} {t:"clear", m}
//   tv    -> room  {t:"meta", tv:{id,name}, members:[{id,name,color}]}
//   room  -> both  {t:"hello", tv, boards:{m:{strokes,at}}}  the whole of one TV's boards
//                  {t:"tvs", tvs:[{id,name,members,online}]} (phones) the TVs the household has
//                  the phone messages above, passed on with {tv, at} added
// Coordinates are ten-thousandths of the board's width (x 0..10000, y 0..6667); widths are thousandths.

export const LIMITS = {
  frame: 32768,          // bytes in one message
  segPoints: 400,        // numbers in one "seg" (200 points)
  strokePoints: 8000,    // numbers in one stroke
  boardPoints: 120000,   // numbers on one board; the oldest strokes go first
  boardStrokes: 600,
  tvs: 8,
  members: 4,
};

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

function cleanId(v) { return typeof v === "string" && ID.test(v) ? v : null; }
function cleanName(v) { return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").slice(0, 40) : ""; }

export class Room {
  // store: {get(key) -> value|undefined, put(key, value), list(prefix) -> Map}; all may be async
  constructor(store, now = () => Date.now()) {
    this.store = store;
    this.now = now;
    this.tvs = {};           // tv id -> {meta:{id,name,members}, boards:{m:{strokes,at,points}}}
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    const all = await this.store.list("tv:");
    for (const [key, value] of all) {
      const [, tv, part] = key.split(":");
      if (!cleanId(tv)) continue;
      const t = this.tv(tv);
      if (part === "meta") t.meta = value;
      else if (cleanId(part)) t.boards[part] = Object.assign({ strokes: [], at: 0 }, value, { points: count(value.strokes || []) });
    }
    this.loaded = true;
  }

  tv(id) {
    if (!this.tvs[id]) this.tvs[id] = { meta: { id, name: id, members: [] }, boards: {} };
    return this.tvs[id];
  }

  board(tv, m) {
    const t = this.tv(tv);
    if (!t.boards[m]) t.boards[m] = { strokes: [], at: 0, points: 0 };
    return t.boards[m];
  }

  tvList(online) {
    return Object.keys(this.tvs).slice(0, LIMITS.tvs).map((id) => ({
      id, name: this.tvs[id].meta.name || id, members: this.tvs[id].meta.members || [], online: !!online[id],
    }));
  }

  hello(tv) {
    const t = this.tv(tv), boards = {};
    for (const m of Object.keys(t.boards)) boards[m] = { strokes: t.boards[m].strokes, at: t.boards[m].at };
    return { t: "hello", tv, boards };
  }

  async save(tv, m) {
    const b = this.tvs[tv] && this.tvs[tv].boards[m];
    if (b) await this.store.put(`tv:${tv}:${m}`, { strokes: b.strokes, at: b.at });
  }

  // A message from a connection. conn: {role: "tv"|"phone", tv (a TV's own id), tvs (a phone's targets)}.
  // Returns {out: [{tv, msg}], conn (changed attachment, if any), reply: [msg]}; out goes to every
  // connection watching that TV (except the sender).
  async handle(conn, raw) {
    if (typeof raw !== "string" || raw.length > LIMITS.frame) return { reply: [{ t: "error", error: "too big" }] };
    let msg;
    try { msg = JSON.parse(raw); } catch { return { reply: [{ t: "error", error: "not JSON" }] }; }
    if (!msg || typeof msg !== "object") return {};
    await this.load();

    if (conn.role === "tv") {
      if (msg.t !== "meta") return {};   // a TV only ever describes itself
      const t = this.tv(conn.tv);
      const members = Array.isArray(msg.members) ? msg.members.slice(0, LIMITS.members).map((x) => ({
        id: cleanId(x && x.id), name: cleanName(x && x.name), color: COLOR.test(x && x.color) ? x.color : "#888888",
      })).filter((x) => x.id) : [];
      t.meta = { id: conn.tv, name: cleanName(msg.tv && msg.tv.name) || conn.tv, members };
      await this.store.put(`tv:${conn.tv}:meta`, t.meta);
      return { phones: true };
    }

    // a phone
    if (msg.t === "sub") {
      const tvs = (Array.isArray(msg.tvs) ? msg.tvs : []).map(cleanId).filter((x) => x && this.tvs[x]).slice(0, LIMITS.tvs);
      return { conn: Object.assign({}, conn, { tvs }), reply: tvs.map((tv) => this.hello(tv)) };
    }
    const m = cleanId(msg.m);
    const targets = conn.tvs || [];
    if (!m || !targets.length) return {};
    const at = this.now();
    const out = [];

    if (msg.t === "seg") {
      const id = cleanId(msg.id), c = COLOR.test(msg.c) ? msg.c : "#111111";
      const w = Math.max(1, Math.min(80, Math.round(+msg.w || 6))), e = msg.e ? 1 : 0;
      if (!id || !Array.isArray(msg.p) || msg.p.length > LIMITS.segPoints || msg.p.length % 2) return {};
      const p = [];
      for (let i = 0; i < msg.p.length; i++) {
        const v = Math.round(+msg.p[i]);
        if (!Number.isFinite(v)) return {};
        p.push(Math.max(0, Math.min(i % 2 ? 6667 : 10000, v)));
      }
      for (const tv of targets) {
        const b = this.board(tv, m);
        let s = null;
        for (let k = b.strokes.length - 1; k >= 0 && k >= b.strokes.length - 4; k--) if (b.strokes[k].id === id) { s = b.strokes[k]; break; }
        if (!s) {
          s = { id, c, w, e, p: [] };
          b.strokes.push(s);
        }
        if (s.p.length + p.length > LIMITS.strokePoints) continue;
        for (const v of p) s.p.push(v);
        b.points += p.length;
        b.at = at;
        trim(b);
        out.push({ tv, msg: { t: "seg", tv, m, id, c: s.c, w: s.w, e: s.e, p, at } });
      }
    } else if (msg.t === "end" || msg.t === "undo") {
      const id = cleanId(msg.id);
      if (!id) return {};
      for (const tv of targets) {
        const b = this.board(tv, m);
        if (msg.t === "undo") {
          for (let k = b.strokes.length - 1; k >= 0; k--) if (b.strokes[k].id === id) { b.points -= b.strokes[k].p.length; b.strokes.splice(k, 1); break; }
          b.at = at;
        }
        await this.save(tv, m);
        out.push({ tv, msg: { t: msg.t, tv, m, id, at } });
      }
    } else if (msg.t === "clear") {
      for (const tv of targets) {
        const b = this.board(tv, m);
        b.strokes = [];
        b.points = 0;
        b.at = at;
        await this.save(tv, m);
        out.push({ tv, msg: { t: "clear", tv, m, at } });
      }
    }
    return { out };
  }
}

function count(strokes) { let n = 0; for (const s of strokes) n += (s.p || []).length; return n; }
function trim(b) {
  while (b.strokes.length > 1 && (b.points > LIMITS.boardPoints || b.strokes.length > LIMITS.boardStrokes)) {
    b.points -= b.strokes[0].p.length;
    b.strokes.shift();
  }
}

// Keys compared in constant time, so a wrong key takes as long as a right one.
export function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
