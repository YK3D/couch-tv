// The family whiteboards' relay (relay/src/room.js through relay/src/dev-server.mjs): a TV and two phones
// on the local server. A phone sees the TV by name, draws, and the TV gets each piece as it is drawn;
// undo and clear reach the TV; "both TVs" draws on two at once; wrong keys and bad input are refused;
// the stroke font the phone uses is the TV's own.
//
//   node tests/test_family_relay.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 18000 + Math.floor(Math.random() * 2000);
const server = spawn(process.execPath, [path.join(ROOT, "relay/src/dev-server.mjs"), String(PORT)], {
  env: { ...process.env, DRAW_KEY: "draw-secret-1", TV_KEY: "tv-secret-1" }, stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((ok) => server.stdout.once("data", ok));

function client(q) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?${q}`);
  const got = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    got.push(m);
    for (const w of waiters.slice()) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); }
  };
  return {
    ws, got,
    open: () => new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error("refused")); ws.onclose = () => bad(new Error("closed")); }),
    send: (o) => ws.send(JSON.stringify(o)),
    wait: (test, ms = 2000) => {
      const seen = got.find(test);
      if (seen) { got.splice(got.indexOf(seen), 1); return Promise.resolve(seen); }
      return new Promise((ok, bad) => {
        const w = { test, ok: (m) => { clearTimeout(t); got.splice(got.indexOf(m), 1); ok(m); } };
        const t = setTimeout(() => bad(new Error("timed out waiting")), ms);
        waiters.push(w);
      });
    },
  };
}

try {
  // wrong keys are refused before anything else
  await assert.rejects(client("role=phone&h=home1&k=nope").open());
  await assert.rejects(client("role=tv&h=home1&tv=living&k=draw-secret-1").open());   // the phone key is not a TV key

  const tv = client("role=tv&h=home1&tv=living&k=tv-secret-1");
  await tv.open();
  const hello = await tv.wait((m) => m.t === "hello");
  assert.deepEqual(hello.boards, {});
  tv.send({ t: "meta", tv: { id: "living", name: "Living room <b>" }, members: [{ id: "dad", name: "Dad", color: "#3b82f6" }, { id: "x y", name: "bad id" }] });

  const tv2 = client("role=tv&h=home1&tv=majlis&k=tv-secret-1");
  await tv2.open();
  await tv2.wait((m) => m.t === "hello");
  tv2.send({ t: "meta", tv: { id: "majlis", name: "Majlis" }, members: [{ id: "dad", name: "Dad", color: "#3b82f6" }] });

  const phone = client("role=phone&h=home1&k=draw-secret-1");
  await phone.open();
  const list = await phone.wait((m) => m.t === "tvs" && m.tvs.length === 2 && m.tvs.every((t) => t.members.length));
  const living = list.tvs.find((t) => t.id === "living");
  assert.equal(living.name, "Living room b", "names are cleaned");
  assert.equal(living.online, true);
  assert.deepEqual(living.members.map((m) => m.id), ["dad"], "a member with a bad id is dropped");

  // draw on the living room only
  phone.send({ t: "sub", tvs: ["living", "nowhere"] });
  await phone.wait((m) => m.t === "hello" && m.tv === "living");
  phone.send({ t: "seg", m: "dad", id: "s1", c: "#ff0000", w: 8, e: 0, p: [100, 200, 300, 400] });
  const seg = await tv.wait((m) => m.t === "seg");
  assert.deepEqual([seg.m, seg.id, seg.c, seg.w, seg.p], ["dad", "s1", "#ff0000", 8, [100, 200, 300, 400]]);
  phone.send({ t: "seg", m: "dad", id: "s1", p: [99999, -5, 500, 600] });
  const seg2 = await tv.wait((m) => m.t === "seg");
  assert.deepEqual(seg2.p, [10000, 0, 500, 600], "points are kept on the board");
  phone.send({ t: "end", m: "dad", id: "s1" });
  await tv.wait((m) => m.t === "end" && m.id === "s1");
  assert.equal(tv2.got.filter((m) => m.t === "seg").length, 0, "the other TV saw nothing");

  // a second phone joining later gets the stroke in its hello
  const phone2 = client("role=phone&h=home1&k=draw-secret-1");
  await phone2.open();
  await phone2.wait((m) => m.t === "tvs" && m.tvs.length === 2);
  phone2.send({ t: "sub", tvs: ["living"] });
  const h2 = await phone2.wait((m) => m.t === "hello");
  assert.deepEqual(h2.boards.dad.strokes[0].p, [100, 200, 300, 400, 10000, 0, 500, 600]);

  // undo and clear
  phone.send({ t: "undo", m: "dad", id: "s1" });
  await tv.wait((m) => m.t === "undo" && m.id === "s1");
  await phone2.wait((m) => m.t === "undo", 2000);
  phone.send({ t: "clear", m: "dad" });
  await tv.wait((m) => m.t === "clear" && m.m === "dad");

  // both TVs at once
  phone.send({ t: "sub", tvs: ["living", "majlis"] });
  await phone.wait((m) => m.t === "hello" && m.tv === "majlis");
  phone.send({ t: "seg", m: "dad", id: "s2", c: "#00ff00", w: 4, p: [1, 2] });
  await tv.wait((m) => m.t === "seg" && m.id === "s2");
  await tv2.wait((m) => m.t === "seg" && m.id === "s2");

  // bad input changes nothing and breaks nothing
  phone.send({ t: "seg", m: "dad", id: "s3", p: [1, 2, 3] });                  // odd count
  phone.send({ t: "seg", m: "../etc", id: "s3", p: [1, 2] });                  // bad board id
  phone.send({ t: "seg", m: "dad", id: "s3", c: "red;}", p: [1, 2] });         // bad colour: drawn in the default
  const s3 = await tv.wait((m) => m.t === "seg" && m.id === "s3");
  assert.equal(s3.c, "#111111");
  phone.ws.send("not json");
  assert.equal((await phone.wait((m) => m.t === "error")).error, "not JSON");
  // a TV can only describe itself, never draw
  tv.send({ t: "seg", m: "dad", id: "s9", p: [1, 2] });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(tv2.got.filter((m) => m.id === "s9").length, 0);

  // the TV going away shows as offline on the phones
  tv2.ws.close();
  await phone.wait((m) => m.t === "tvs" && m.tvs.find((t) => t.id === "majlis" && !t.online));

  // the phone's stroke font is the TV's
  assert.equal(fs.readFileSync(path.join(ROOT, "relay/public/strokefont.js"), "utf8"),
    fs.readFileSync(path.join(ROOT, "tv-home/web/family/strokefont.js"), "utf8"), "relay/public/strokefont.js is a copy of the TV's");

  for (const c of [tv, phone, phone2]) c.ws.close();
  console.log("family relay: all checks passed");
} finally {
  server.kill();
}
