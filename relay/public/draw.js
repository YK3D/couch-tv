// The phone side of the family whiteboards. Pick a TV (or both) and whose board, then draw: each stroke
// goes to the relay in small pieces every 40 ms, so the TV draws it as it is drawn. Same coordinates as
// the TV (tv-home/web/family/board.js): ten-thousandths of the board's width, the board 3:2.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed", "#ec4899", "#0ea5e9"];
  var SIZES = [4, 8, 16];          // thousandths of the board's width
  var ERASER = 40;

  // ---------- the family link: #h=<household>&k=<draw key>[&r=<relay address>], kept on this phone ----------
  var link = {};
  location.hash.replace(/^#/, "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) link[p[0]] = decodeURIComponent(p[1] || ""); });
  function keep(k, v) { try { localStorage.setItem("fb." + k, JSON.stringify(v)); } catch (e) {} }
  function kept(k, d) { try { var v = localStorage.getItem("fb." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  if (link.h && link.k) {
    keep("link", { h: link.h, k: link.k, r: link.r || "" });
    history.replaceState(null, "", location.pathname + location.search);   // the key leaves the address bar
  }
  var L = kept("link", null);

  // ---------- state ----------
  var S = {
    tvs: [], targets: kept("targets", []), member: kept("member", ""), color: kept("color", COLORS[0]),
    size: kept("size", 1), eraser: false, boards: {}, mine: [], ws: null, online: false
  };

  // ---------- drawing a board ----------
  var canvas = $("board"), ctx = canvas.getContext("2d");
  function fit() {
    var r = canvas.getBoundingClientRect(), k = Math.min(3, window.devicePixelRatio || 1);
    var W = Math.round(r.width * k), H = Math.round(r.height * k);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    ctx.setTransform(W / 10000, 0, 0, W / 10000, 0, 0);
  }
  function path(s, from) {
    var p = s.p, n = p.length;
    if (n < 2) return;
    ctx.globalCompositeOperation = s.e ? "destination-out" : "source-over";
    ctx.strokeStyle = ctx.fillStyle = s.e ? "#000" : s.c;
    ctx.lineWidth = s.w * 10;
    ctx.lineCap = ctx.lineJoin = "round";
    if (n === 2) { ctx.beginPath(); ctx.arc(p[0], p[1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
    var len = 0, j, i;
    for (j = 2; j < n; j += 2) len += Math.abs(p[j] - p[j - 2]) + Math.abs(p[j + 1] - p[j - 1]);
    ctx.beginPath();
    i = Math.max(0, (from || 0) - 2);
    ctx.moveTo(p[i], p[i + 1]);
    if (from || len / (n / 2 - 1) > 260) { for (i += 2; i < n; i += 2) ctx.lineTo(p[i], p[i + 1]); }
    else {
      for (i = 2; i < n - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
      ctx.lineTo(p[n - 2], p[n - 1]);
    }
    ctx.stroke();
  }
  function board() {
    var tv = S.targets[0];
    var b = (S.boards[tv] || {})[S.member];
    if (!b) { b = { strokes: [], at: 0 }; if (tv) { S.boards[tv] = S.boards[tv] || {}; S.boards[tv][S.member] = b; } }
    return b;
  }
  function paint() {
    fit();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
    board().strokes.forEach(function (s) { path(s); });
    ctx.globalCompositeOperation = "source-over";
  }

  // ---------- the relay ----------
  function send(o) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); }
  var retry = 1000, pingT = null;
  function connect() {
    if (!L) { $("join").className = "sheet open"; return; }
    var base = L.r || (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
    var ws = new WebSocket(base.replace(/^http/, "ws").replace(/\/+$/, "") + "/ws?role=phone&h=" + encodeURIComponent(L.h) + "&k=" + encodeURIComponent(L.k));
    S.ws = ws;
    ws.onopen = function () {
      retry = 1000; S.online = true; status();
      clearInterval(pingT);
      pingT = setInterval(function () { if (ws.readyState === 1) ws.send("ping"); }, 25000);
    };
    ws.onmessage = function (e) {
      if (e.data === "pong") return;
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === "tvs") { S.tvs = m.tvs || []; drawTvs(); drawPeople(); subscribe(); }
      else if (m.t === "hello") { S.boards[m.tv] = m.boards || {}; if (m.tv === S.targets[0]) paint(); }
      else if (m.tv) apply(m);
    };
    ws.onclose = function () {
      if (S.ws !== ws) return;
      S.online = false; status(); clearInterval(pingT);
      setTimeout(connect, retry); retry = Math.min(30000, retry * 2);
    };
  }
  // someone else drawing on the same board (or the same person on another phone)
  function apply(m) {
    var bs = S.boards[m.tv] = S.boards[m.tv] || {}, b = bs[m.m] = bs[m.m] || { strokes: [], at: 0 }, k, s = null;
    if (m.t === "seg") {
      for (k = b.strokes.length - 1; k >= 0; k--) if (b.strokes[k].id === m.id) { s = b.strokes[k]; break; }
      if (!s) { s = { id: m.id, c: m.c, w: m.w, e: m.e, p: [] }; b.strokes.push(s); }
      var from = s.p.length;
      s.p = s.p.concat(m.p);
      if (m.tv === S.targets[0] && m.m === S.member) { fit(); path(s, from); ctx.globalCompositeOperation = "source-over"; }
      return;
    }
    if (m.t === "undo") for (k = b.strokes.length - 1; k >= 0; k--) if (b.strokes[k].id === m.id) { b.strokes.splice(k, 1); break; }
    if (m.t === "clear") b.strokes = [];
    if (m.tv === S.targets[0] && m.m === S.member) paint();
  }
  function subscribe() {
    var ids = S.tvs.map(function (t) { return t.id; });
    S.targets = S.targets.filter(function (t) { return ids.indexOf(t) >= 0; });
    if (!S.targets.length && ids.length) S.targets = [ids[0]];
    keep("targets", S.targets);
    send({ t: "sub", tvs: S.targets });
    drawTvs();
    drawPeople();
  }
  function status() {
    $("conn").className = "conn" + (S.online ? " on" : "");
    $("conn-text").textContent = S.online ? "Connected" : "Connecting…";
  }

  // ---------- pickers ----------
  function chip(label, on, color, extra) {
    var b = document.createElement("button");
    b.className = "chip";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", on ? "true" : "false");
    b.innerHTML = (color ? '<i style="background:' + color + '"></i>' : "") + "<span></span>" + (extra ? '<span class="off">' + extra + "</span>" : "");
    b.querySelector("span").textContent = label;
    return b;
  }
  function drawTvs() {
    var row = $("tvs");
    row.innerHTML = "";
    S.tvs.forEach(function (t) {
      var b = chip(t.name, S.targets.length === 1 && S.targets[0] === t.id, null, t.online ? "" : "off");
      b.onclick = function () { S.targets = [t.id]; subscribe(); paint(); };
      row.appendChild(b);
    });
    if (S.tvs.length > 1) {
      var both = chip("Both TVs", S.targets.length === S.tvs.length);
      both.onclick = function () { S.targets = S.tvs.map(function (t) { return t.id; }); subscribe(); paint(); };
      row.appendChild(both);
    }
  }
  function members() {
    var tv = null;
    S.tvs.forEach(function (t) { if (t.id === S.targets[0]) tv = t; });
    return (tv && tv.members) || [];
  }
  function drawPeople() {
    var row = $("people"), list = members();
    row.innerHTML = "";
    if (list.length && !list.some(function (m) { return m.id === S.member; })) { S.member = list[0].id; keep("member", S.member); }
    list.forEach(function (m) {
      var b = chip(m.name, m.id === S.member, m.color);
      b.onclick = function () { S.member = m.id; keep("member", m.id); S.mine = []; drawPeople(); paint(); };
      row.appendChild(b);
    });
  }
  function drawTools() {
    var c = $("colors"), z = $("sizes");
    c.innerHTML = ""; z.innerHTML = "";
    COLORS.forEach(function (col) {
      var b = document.createElement("button");
      b.className = "color"; b.style.background = col; b.setAttribute("aria-label", "Colour " + col);
      b.setAttribute("aria-pressed", !S.eraser && col === S.color ? "true" : "false");
      b.onclick = function () { S.color = col; S.eraser = false; keep("color", col); drawTools(); };
      c.appendChild(b);
    });
    SIZES.forEach(function (w, i) {
      var b = document.createElement("button");
      b.className = "size"; b.setAttribute("aria-label", ["Thin", "Medium", "Thick"][i]);
      b.setAttribute("aria-pressed", i === S.size ? "true" : "false");
      b.innerHTML = '<i style="width:' + (6 + i * 6) + "px;height:" + (6 + i * 6) + 'px"></i>';
      b.onclick = function () { S.size = i; keep("size", i); drawTools(); };
      z.appendChild(b);
    });
    $("eraser").setAttribute("aria-pressed", S.eraser ? "true" : "false");
  }

  // ---------- drawing with a finger ----------
  var cur = null, pending = [], flushT = null;
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3); }
  function pt(e) {
    var r = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / r.width * 10000), Math.round((e.clientY - r.top) / r.width * 10000)];
  }
  function flush() {
    if (!cur || !pending.length) return;
    send({ t: "seg", m: S.member, id: cur.id, c: cur.c, w: cur.w, e: cur.e, p: pending });
    pending = [];
  }
  canvas.addEventListener("pointerdown", function (e) {
    if (!S.member || !S.targets.length) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    var p = pt(e);
    cur = { id: uid(), c: S.color, w: S.eraser ? ERASER : SIZES[S.size], e: S.eraser ? 1 : 0, p: p.slice() };
    board().strokes.push(cur);
    pending = p.slice();
    fit(); path(cur);
    flushT = setInterval(flush, 40);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!cur) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (var i = 0; i < evs.length; i++) {
      var p = pt(evs[i]), n = cur.p.length;
      if (Math.abs(p[0] - cur.p[n - 2]) + Math.abs(p[1] - cur.p[n - 1]) < 18) continue;
      cur.p.push(p[0], p[1]);
      pending.push(p[0], p[1]);
      if (pending.length >= 380) flush();
      fit(); path(cur, n); ctx.globalCompositeOperation = "source-over";
    }
  });
  function up() {
    if (!cur) return;
    clearInterval(flushT);
    flush();
    send({ t: "end", m: S.member, id: cur.id });
    S.mine.push([cur.id]);
    cur = null;
    paint();   // the stroke again, smoothed
  }
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  // ---------- the buttons ----------
  $("eraser").onclick = function () { S.eraser = !S.eraser; drawTools(); };
  $("undo").onclick = function () {
    var ids = S.mine.pop();
    if (!ids) {   // nothing of this phone's: take this board's last stroke
      var b = board();
      if (!b.strokes.length) return;
      ids = [b.strokes[b.strokes.length - 1].id];
    }
    var b2 = board();
    ids.forEach(function (id) {
      send({ t: "undo", m: S.member, id: id });
      for (var k = b2.strokes.length - 1; k >= 0; k--) if (b2.strokes[k].id === id) { b2.strokes.splice(k, 1); break; }
    });
    paint();
  };
  $("clear").onclick = function () {
    var who = "";
    members().forEach(function (m) { if (m.id === S.member) who = m.name; });
    if (!window.confirm("Clear " + (who ? who + "'s" : "this") + " board" + (S.targets.length > 1 ? " on both TVs" : "") + "?")) return;
    send({ t: "clear", m: S.member });
    board().strokes = [];
    S.mine = [];
    paint();
  };

  // ---------- a typed note, drawn in the stroke font, below what is there ----------
  $("note").onclick = function () { $("note-sheet").className = "sheet open"; setTimeout(function () { $("note-text").focus(); }, 50); };
  $("note-cancel").onclick = function () { $("note-sheet").className = "sheet"; };
  $("note-add").onclick = function () {
    var text = $("note-text").value.trim();
    $("note-sheet").className = "sheet";
    if (!text) return;
    var b = board(), low = 300;
    b.strokes.forEach(function (s) { for (var i = 1; i < s.p.length; i += 2) if (s.p[i] > low) low = s.p[i]; });
    var y = low > 300 ? low + 500 : 400;
    if (y > 5600) y = 400;   // a full board: start again at the top
    var ids = [], c = S.eraser ? COLORS[0] : S.color;
    window.StrokeFont.write(text, { x: 400, y: y, size: 620, maxWidth: 9200 }).forEach(function (p) {
      var s = { id: uid(), c: c, w: SIZES[1], e: 0, p: p };
      b.strokes.push(s);
      ids.push(s.id);
      for (var i = 0; i < p.length; i += 380) send({ t: "seg", m: S.member, id: s.id, c: s.c, w: s.w, e: 0, p: p.slice(i, i + 380) });
      send({ t: "end", m: S.member, id: s.id });
    });
    S.mine.push(ids);
    $("note-text").value = "";
    paint();
  };

  window.addEventListener("resize", paint);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && (!S.ws || S.ws.readyState > 1)) connect(); });
  drawTools();
  status();
  connect();
  paint();
})();
