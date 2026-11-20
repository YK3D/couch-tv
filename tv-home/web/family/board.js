// The four family whiteboards. Each person draws on their own board from their phone (relay/public/draw.html),
// from home or anywhere: the phone and this TV both talk to a small relay on the internet (relay/, a
// Cloudflare Worker), so neither needs the other's network. The TV only reads; it holds a read-only key.
//
// A stroke is {id, c: colour, w: width in thousandths of the board's width, e: 1 for the eraser,
// p: [x, y, x, y, ...]}, both x and y in ten-thousandths of the board's WIDTH (x 0..10000, y 0..6667):
// the boards are 3:2 everywhere, so one uniform scale draws a stroke the same on every phone and TV. The last copy is kept on the TV, so the boards show at once
// when the TV comes on, before the relay answers.
(function () {
  "use strict";
  var FH = window.FH;
  var B = FH.boards = { data: {}, live: {}, ws: null, state: "off" };
  var MAX_STROKES = 600;

  function memberOf(i) { return FH.cfg.members[i] || { id: "m" + (i + 1), name: "", color: "#888" }; }

  // ---------- drawing ----------
  function fit(canvas, w, h) {
    var k = Math.max(1, Math.min(2, (FH.scale || 1) * (window.devicePixelRatio || 1)));
    var W = Math.round(w * k), H = Math.round(h * k);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(W / 10000, 0, 0, W / 10000, 0, 0);   // one scale for both: y is in width units too
    return { ctx: ctx };
  }

  function strokePath(ctx, s, from) {
    var p = s.p, n = p.length;
    if (n < 2) return;
    ctx.globalCompositeOperation = s.e ? "destination-out" : "source-over";
    ctx.strokeStyle = s.e ? "#000" : s.c;
    ctx.fillStyle = s.e ? "#000" : s.c;
    if (n === 2) {   // a dot
      ctx.beginPath();
      ctx.arc(p[0], p[1], ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    var i = Math.max(0, (from || 0) - 2);
    ctx.moveTo(p[i], p[i + 1]);
    // a finger on a phone gives a point every few units: smooth those. Sparse points (a typed note, a
    // straight line) are corners meant as corners, so they are joined straight.
    var len = 0;
    for (var j = 2; j < n; j += 2) len += Math.abs(p[j] - p[j - 2]) + Math.abs(p[j + 1] - p[j - 1]);
    var sparse = len / (n / 2 - 1) > 260;
    if (from || sparse) { for (i += 2; i < n; i += 2) ctx.lineTo(p[i], p[i + 1]); }
    else {
      // smooth: through the midpoints, with each point as the control
      for (i = 2; i < n - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
      ctx.lineTo(p[n - 2], p[n - 1]);
    }
    ctx.stroke();
  }

  function render(canvas, w, h, strokes) {
    var f = fit(canvas, w, h), ctx = f.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (var i = 0; i < strokes.length; i++) {
      ctx.lineWidth = strokes[i].w * 10;   // w thousandths of the width = w * 10 of these units
      strokePath(ctx, strokes[i]);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  B.render = render;

  function tileOf(i) { return FH.el("board-" + i); }
  function idxOf(memberId) {
    for (var i = 0; i < 4; i++) if (memberOf(i).id === memberId) return i;
    return -1;
  }

  function ago(at) {
    if (!at) return "";
    var s = (FH.now() - at) / 1000;
    if (s < 90) return FH.t("just_now");
    if (s < 3600) return Math.round(s / 60) + " " + FH.t("min_ago");
    if (s < 86400) return Math.round(s / 3600) + " " + FH.t("h_ago");
    return "";
  }

  B.paint = function (i) {
    var m = memberOf(i), d = B.data[m.id] || { strokes: [] }, tile = tileOf(i);
    if (!tile) return;
    render(tile.querySelector("canvas"), 390, 260, d.strokes);
    var empty = !d.strokes.length;
    tile.className = tile.className.replace(/\s*\bempty\b/g, "") + (empty ? " empty" : "");
    tile.setAttribute("data-empty", B.state === "none" ? FH.t("board_off") : FH.t("board_empty"));
    if (B.big === i) B.paintBig();
  };
  B.paintAll = function () { for (var i = 0; i < 4; i++) B.paint(i); B.labels(); };

  B.labels = function () {
    for (var i = 0; i < 4; i++) {
      var m = memberOf(i), tile = tileOf(i), d = B.data[m.id] || {};
      if (!tile) continue;
      var tag = tile.querySelector(".board-tag");
      tag.querySelector("i").style.background = m.color;
      tag.querySelector("span").textContent = m.name;
      tag.querySelector("em").textContent = ago(d.at);
      var drawing = !!B.live[m.id];
      tile.className = tile.className.replace(/\s*\blive-ink\b/g, "") + (drawing ? " live-ink" : "");
    }
  };

  // ---------- one board, big ----------
  B.open = function (i) {
    B.big = i;
    var m = memberOf(i), o = FH.el("board-big");
    o.querySelector(".bb-head i").style.background = m.color;
    FH.el("bb-name").textContent = m.name;
    FH.el("bb-when").textContent = ago((B.data[m.id] || {}).at);
    FH.el("bb-hint").textContent = FH.t("big_hint");
    o.className = "overlay board-big open";
    B.paintBig();
  };
  B.paintBig = function () {
    var m = memberOf(B.big);
    render(FH.el("bb-canvas"), 1380, 920, (B.data[m.id] || { strokes: [] }).strokes);
  };
  B.close = function () { B.big = null; FH.el("board-big").className = "overlay board-big"; };

  // ---------- the relay ----------
  var saveT = null;
  function keep() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { FH.set("boards." + (FH.tvId || "tv"), B.data); }, 3000);
  }

  function apply(msg) {
    var m, d, s, i, k;
    if (msg.t === "hello") {
      B.data = {};
      for (k in msg.boards || {}) if (msg.boards.hasOwnProperty(k)) B.data[k] = msg.boards[k];
      B.paintAll();
      keep();
      return;
    }
    m = msg.m;
    i = idxOf(m);
    d = B.data[m] = B.data[m] || { strokes: [] };
    if (msg.t === "seg") {
      s = null;
      for (k = d.strokes.length - 1; k >= 0 && k >= d.strokes.length - 4; k--) if (d.strokes[k].id === msg.id) { s = d.strokes[k]; break; }
      if (!s) {
        s = { id: msg.id, c: msg.c, w: msg.w, e: msg.e ? 1 : 0, p: [] };
        d.strokes.push(s);
        if (d.strokes.length > MAX_STROKES) d.strokes.splice(0, d.strokes.length - MAX_STROKES);
      }
      var from = s.p.length;
      for (k = 0; k < msg.p.length; k++) s.p.push(msg.p[k]);
      d.at = msg.at || FH.now();
      B.live[m] = FH.now();
      if (i >= 0) {
        // only the new piece is drawn, so a stroke appears as it is drawn, at almost no cost
        var tile = tileOf(i), f = fit(tile.querySelector("canvas"), 390, 260);
        f.ctx.lineCap = "round"; f.ctx.lineJoin = "round"; f.ctx.lineWidth = s.w * 10;
        strokePath(f.ctx, s, from || 0);
        f.ctx.globalCompositeOperation = "source-over";
        tile.className = tile.className.replace(/\s*\bempty\b/g, "");
        if (B.big === i) B.paintBig();
      }
      liveLabels();
    } else if (msg.t === "end") {
      delete B.live[m];
      if (i >= 0) B.paint(i);   // redrawn smooth
      keep();
      liveLabels();
    } else if (msg.t === "undo") {
      for (k = d.strokes.length - 1; k >= 0; k--) if (d.strokes[k].id === msg.id) { d.strokes.splice(k, 1); break; }
      d.at = msg.at || FH.now();
      if (i >= 0) B.paint(i);
      keep();
    } else if (msg.t === "clear") {
      d.strokes = [];
      d.at = msg.at || FH.now();
      if (i >= 0) B.paint(i);
      keep();
    }
  }
  B.apply = apply;

  var labelT = null;
  function liveLabels() { if (!labelT) labelT = setTimeout(function () { labelT = null; B.labels(); }, 250); }

  var retry = 2000;
  B.connect = function () {
    var R = FH.cfg.relay || {};
    if (!R.url || !R.household || !window.WebSocket) { B.state = "none"; B.paintAll(); return; }
    var url = R.url.replace(/\/+$/, "").replace(/^http/, "ws") + "/ws?role=tv&h=" + encodeURIComponent(R.household) +
      "&tv=" + encodeURIComponent(FH.tvId || "tv") + "&k=" + encodeURIComponent(R.tv_key || "");
    var ws;
    try { ws = new WebSocket(url); } catch (e) { later(); return; }
    B.ws = ws;
    B.state = "connecting";
    ws.onopen = function () {
      B.state = "on";
      retry = 2000;
      // so the phones can show this TV and its people by name
      ws.send(JSON.stringify({ t: "meta", tv: { id: FH.tvId || "tv", name: tvName() },
        members: FH.cfg.members.slice(0, 4).map(function (m) { return { id: m.id, name: m.name, color: m.color }; }) }));
    };
    ws.onmessage = function (e) { var msg = null; try { msg = JSON.parse(e.data); } catch (x) {} if (msg && msg.t) apply(msg); };
    ws.onclose = function () { if (B.ws === ws) { B.ws = null; B.state = "off"; later(); } };
    ws.onerror = function () {};
  };
  function later() { setTimeout(B.connect, retry); retry = Math.min(60000, retry * 2); }
  function tvName() {
    var n = "";
    (FH.cfg.tvs || []).forEach(function (t) { if (t.id === FH.tvId) n = t.name; });
    return n || (FH.platform === "samsung" ? "Samsung TV" : FH.platform === "lg" ? "LG TV" : "TV");
  }

  B.start = function () {
    B.data = FH.get("boards." + (FH.tvId || "tv"), {}) || {};
    B.paintAll();
    if (!FH.demo) B.connect();
    setInterval(function () {
      var now = FH.now(), k;
      for (k in B.live) if (B.live.hasOwnProperty(k) && now - B.live[k] > 8000) delete B.live[k];
      B.labels();
    }, 30000);
  };
})();
