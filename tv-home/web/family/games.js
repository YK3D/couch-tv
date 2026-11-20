// Four small games that need no internet, played with the TV remote: arrows and OK, Back to leave.
// All four are drawn here from code (no pictures, no fonts beyond the TV's own), and a screen is only
// drawn again when something on it changes, except Sand Serpent, which moves by itself.
//   Sand Serpent  steer a serpent to the dates; it grows with each one and must not hit itself or the edge
//   Pairs         turn two cards at a time and find the matching shapes
//   Line of Four  drop pieces into seven columns; four in a line wins (against the TV, or two people)
//   X and O       three in a line on a 3x3 board, against the TV
(function () {
  "use strict";
  var FH = window.FH;
  var G = FH.games = { cur: null };
  var W = 1280, H = 800, ctx = null, raf = null, last = 0;

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function text(c, s, x, y, size, color, align) {
    c.fillStyle = color || "#fff";
    c.font = "600 " + size + "px Inter, sans-serif";
    c.textAlign = align || "center";
    c.textBaseline = "middle";
    c.fillText(s, x, y);
  }
  function banner(c, title, sub) {
    c.fillStyle = "rgba(5,7,12,0.78)";
    c.fillRect(0, 0, W, H);
    text(c, title, W / 2, H / 2 - 30, 64, "#e9c46a");
    text(c, sub, W / 2, H / 2 + 40, 30, "rgba(255,255,255,0.8)");
  }
  function score(s) { FH.el("game-score").textContent = s; }

  // ---------------- shapes, shared by Pairs and the tiles ----------------
  function star(c, x, y, r, points, inner) {
    c.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var a = Math.PI * i / points - Math.PI / 2, rad = i % 2 ? r * inner : r;
      if (i) c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); else c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }
  var SHAPES = [
    { c: "#e9c46a", d: function (c, x, y, r) { star(c, x, y, r, 8, 0.72); c.fill(); } },
    { c: "#7dd3fc", d: function (c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = "destination-out"; c.beginPath(); c.arc(x + r * 0.42, y - r * 0.16, r * 0.82, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = "source-over"; } },
    { c: "#f87171", d: function (c, x, y, r) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill(); } },
    { c: "#86efac", d: function (c, x, y, r) { c.beginPath(); for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); } },
    { c: "#c4b5fd", d: function (c, x, y, r) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.95, y + r * 0.8); c.lineTo(x - r * 0.95, y + r * 0.8); c.closePath(); c.fill(); } },
    { c: "#fdba74", d: function (c, x, y, r) { star(c, x, y, r, 5, 0.45); c.fill(); } },
    { c: "#f0abfc", d: function (c, x, y, r) { rr(c, x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, r * 0.35); c.fill(); } },
    { c: "#5eead4", d: function (c, x, y, r) { c.lineWidth = r * 0.34; c.strokeStyle = "#5eead4"; c.beginPath(); c.arc(x, y, r * 0.78, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(x, y, r * 0.24, 0, Math.PI * 2); c.fill(); } }
  ];
  function shape(c, i, x, y, r) { c.fillStyle = SHAPES[i].c; SHAPES[i].d(c, x, y, r); }

  // ================= Sand Serpent =================
  var serpent = {
    id: "serpent", title: "Sand Serpent", title_ar: "ثعبان الرمال", color: "linear-gradient(135deg,#b7791f,#5c3d12)",
    COLS: 32, ROWS: 20, CELL: 40,
    init: function () { var s = this; s.body = [[12, 10], [11, 10], [10, 10]]; s.dir = [1, 0]; s.next = [1, 0]; s.dead = false; s.eaten = 0; s.acc = 0; s.step = 140; s.started = false; s.food = s.place(); score(0); },
    place: function () { for (;;) { var p = [Math.floor(Math.random() * this.COLS), Math.floor(Math.random() * this.ROWS)], hit = false; for (var i = 0; i < this.body.length; i++) if (this.body[i][0] === p[0] && this.body[i][1] === p[1]) hit = true; if (!hit) return p; } },
    key: function (k) {
      var d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[k];
      if (this.dead && k === "ok") { this.init(); return; }
      if (d && !(d[0] === -this.dir[0] && d[1] === -this.dir[1])) { this.next = d; this.started = true; }
      if (k === "ok") this.started = true;
    },
    tick: function (dt) {
      if (this.dead || !this.started) return false;
      this.acc += dt;
      if (this.acc < this.step) return false;
      this.acc = 0;
      this.dir = this.next;
      var h = [this.body[0][0] + this.dir[0], this.body[0][1] + this.dir[1]];
      if (h[0] < 0 || h[1] < 0 || h[0] >= this.COLS || h[1] >= this.ROWS) { this.dead = true; return true; }
      for (var i = 0; i < this.body.length - 1; i++) if (this.body[i][0] === h[0] && this.body[i][1] === h[1]) { this.dead = true; return true; }
      this.body.unshift(h);
      if (h[0] === this.food[0] && h[1] === this.food[1]) { this.eaten++; score(this.eaten); this.food = this.place(); this.step = Math.max(70, this.step - 3); }
      else this.body.pop();
      return true;
    },
    draw: function (c) {
      var C = this.CELL, i;
      c.fillStyle = "#2a1f12"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#31251a";
      for (i = 0; i < this.COLS; i++) for (var j = 0; j < this.ROWS; j++) if ((i + j) % 2) c.fillRect(i * C, j * C, C, C);
      // the date: a brown oval with a shine
      var f = this.food;
      c.fillStyle = "#7c3f12"; c.beginPath(); c.ellipse ? c.ellipse(f[0] * C + C / 2, f[1] * C + C / 2, C * 0.28, C * 0.4, 0.5, 0, Math.PI * 2) : c.arc(f[0] * C + C / 2, f[1] * C + C / 2, C * 0.34, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(255,220,170,0.6)"; c.beginPath(); c.arc(f[0] * C + C / 2 - 4, f[1] * C + C / 2 - 7, 4, 0, Math.PI * 2); c.fill();
      for (i = this.body.length - 1; i >= 0; i--) {
        var b = this.body[i], t = i / Math.max(1, this.body.length);
        c.fillStyle = i === 0 ? "#f4d27a" : "rgb(" + Math.round(222 - 60 * t) + "," + Math.round(180 - 70 * t) + "," + Math.round(90 - 40 * t) + ")";
        rr(c, b[0] * C + 3, b[1] * C + 3, C - 6, C - 6, 12); c.fill();
      }
      var hd = this.body[0];
      c.fillStyle = "#1a1208"; c.beginPath(); c.arc(hd[0] * C + C / 2 + this.dir[0] * 7 - this.dir[1] * 7, hd[1] * C + C / 2 + this.dir[1] * 7 - this.dir[0] * 7, 4, 0, Math.PI * 2); c.fill();
      if (!this.started && !this.dead) banner(c, this.title, FH.cfg.language === "ar" ? "اضغط سهمًا للبدء" : "Press an arrow to start");
      if (this.dead) banner(c, (FH.cfg.language === "ar" ? "النتيجة " : "Dates: ") + this.eaten, FH.cfg.language === "ar" ? "موافق للعب مرة أخرى" : "OK to play again");
    }
  };

  // ================= Pairs =================
  var pairs = {
    id: "pairs", title: "Pairs", title_ar: "الأزواج", color: "linear-gradient(135deg,#1d4ed8,#312e81)",
    init: function () {
      var deck = [], i;
      for (i = 0; i < 8; i++) deck.push(i, i);
      for (i = deck.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
      this.cards = deck.map(function (s) { return { s: s, up: false, done: false }; });
      this.sel = 0; this.open = []; this.moves = 0; this.wait = 0; this.won = false;
      score(0);
    },
    key: function (k) {
      if (this.won) { if (k === "ok") this.init(); return; }
      if (this.wait) return;
      var x = this.sel % 4, y = Math.floor(this.sel / 4);
      if (k === "left" && x > 0) this.sel--;
      if (k === "right" && x < 3) this.sel++;
      if (k === "up" && y > 0) this.sel -= 4;
      if (k === "down" && y < 3) this.sel += 4;
      if (k === "ok") {
        var c = this.cards[this.sel];
        if (c.up || c.done) return;
        c.up = true; this.open.push(this.sel);
        if (this.open.length === 2) {
          this.moves++; score(this.moves);
          var a = this.cards[this.open[0]], b = this.cards[this.open[1]], me = this;
          if (a.s === b.s) { a.done = b.done = true; this.open = []; this.won = this.cards.every(function (q) { return q.done; }); }
          else { this.wait = setTimeout(function () { a.up = b.up = false; me.open = []; me.wait = 0; G.redraw(); }, 900); }
        }
      }
    },
    draw: function (c) {
      c.fillStyle = "#0f1530"; c.fillRect(0, 0, W, H);
      for (var i = 0; i < 16; i++) {
        var x = 270 + (i % 4) * 190, y = 40 + Math.floor(i / 4) * 185, card = this.cards[i];
        rr(c, x, y, 170, 170, 22);
        c.fillStyle = card.done ? "rgba(255,255,255,0.08)" : card.up ? "#1e2747" : "#2b3a7a"; c.fill();
        if (card.up || card.done) { c.globalAlpha = card.done ? 0.45 : 1; shape(c, card.s, x + 85, y + 85, 52); c.globalAlpha = 1; }
        else { c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 3; star(c, x + 85, y + 85, 34, 8, 0.72); c.stroke(); }
        if (i === this.sel) { c.strokeStyle = "#fff"; c.lineWidth = 6; rr(c, x - 6, y - 6, 182, 182, 26); c.stroke(); }
      }
      if (this.won) banner(c, (FH.cfg.language === "ar" ? "أحسنت! " : "Well done! ") + this.moves + (FH.cfg.language === "ar" ? " محاولة" : " turns"), FH.cfg.language === "ar" ? "موافق للعب مرة أخرى" : "OK to play again");
    }
  };

  // ================= Line of Four =================
  var four = {
    id: "four", title: "Line of Four", title_ar: "أربعة في خط", color: "linear-gradient(135deg,#0f766e,#134e4a)",
    init: function () { this.g = []; for (var i = 0; i < 7; i++) this.g.push([]); this.col = 3; this.turn = 1; this.over = 0; this.two = false; this.busy = false; score(""); },
    win: function (g, p) {
      var at = function (x, y) { return x >= 0 && x < 7 && y >= 0 && y < 6 ? g[x][y] : 0; };
      for (var x = 0; x < 7; x++) for (var y = 0; y < 6; y++) {
        if (at(x, y) !== p) continue;
        var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (var d = 0; d < 4; d++) { var n = 1; while (n < 4 && at(x + dirs[d][0] * n, y + dirs[d][1] * n) === p) n++; if (n === 4) return true; }
      }
      return false;
    },
    full: function (g) { for (var i = 0; i < 7; i++) if (g[i].length < 6) return false; return true; },
    drop: function (x, p) { if (this.g[x].length >= 6) return false; this.g[x].push(p); if (this.win(this.g, p)) this.over = p; else if (this.full(this.g)) this.over = 3; return true; },
    cpu: function () {
      var g = this.g, me = this, i;
      function tryMove(x, p) { if (g[x].length >= 6) return false; g[x].push(p); var w = me.win(g, p); g[x].pop(); return w; }
      for (i = 0; i < 7; i++) if (tryMove(i, 2)) return i;          // win now
      for (i = 0; i < 7; i++) if (tryMove(i, 1)) return i;          // stop the player winning
      var order = [3, 2, 4, 1, 5, 0, 6], best = -1;
      for (i = 0; i < 7; i++) {
        var x = order[i];
        if (g[x].length >= 6) continue;
        g[x].push(2);
        var gives = false;
        for (var k = 0; k < 7; k++) if (tryMove(k, 1)) gives = true;   // does it set the player up?
        g[x].pop();
        if (!gives && (best < 0 || Math.random() < 0.25)) best = x;
      }
      if (best >= 0) return best;
      for (i = 0; i < 7; i++) if (g[order[i]].length < 6) return order[i];
      return 0;
    },
    key: function (k) {
      if (this.over) { if (k === "ok") this.init(); return; }
      if (this.busy) return;
      if (k === "left" && this.col > 0) this.col--;
      if (k === "right" && this.col < 6) this.col++;
      if (k === "up") { this.two = !this.two; FH.toast(this.two ? (FH.cfg.language === "ar" ? "لاعبان" : "Two players") : (FH.cfg.language === "ar" ? "ضد التلفاز" : "Against the TV"), 2000); }
      if (k === "ok" || k === "down") {
        if (!this.drop(this.col, this.turn)) return;
        if (this.over) return;
        if (this.two) { this.turn = 3 - this.turn; return; }
        var me = this;
        this.busy = true;
        setTimeout(function () { me.drop(me.cpu(), 2); me.busy = false; G.redraw(); }, 450);
      }
    },
    draw: function (c) {
      c.fillStyle = "#0b1f1e"; c.fillRect(0, 0, W, H);
      var X0 = 290, Y0 = 130, S = 100;
      c.fillStyle = this.turn === 1 ? "#e9c46a" : "#5eead4";
      c.beginPath(); c.arc(X0 + this.col * S + S / 2, 70, 34, 0, Math.PI * 2); c.fill();
      rr(c, X0 - 14, Y0 - 14, 7 * S + 28, 6 * S + 28, 26); c.fillStyle = "#115e59"; c.fill();
      for (var x = 0; x < 7; x++) for (var y = 0; y < 6; y++) {
        var v = this.g[x][5 - y] || 0;
        c.fillStyle = v === 1 ? "#e9c46a" : v === 2 ? "#5eead4" : "#08201f";
        c.beginPath(); c.arc(X0 + x * S + S / 2, Y0 + y * S + S / 2, 38, 0, Math.PI * 2); c.fill();
      }
      var ar = FH.cfg.language === "ar";
      if (this.over) banner(c, this.over === 3 ? (ar ? "تعادل" : "A draw") : this.over === 1 ? (this.two ? (ar ? "فاز الذهبي" : "Gold wins") : (ar ? "فزت!" : "You win!")) : (this.two ? (ar ? "فاز الأخضر" : "Teal wins") : (ar ? "فاز التلفاز" : "The TV wins")), ar ? "موافق للعب مرة أخرى" : "OK to play again");
      else text(c, ar ? "▲ لاعبان أو ضد التلفاز" : "▲ two players or against the TV", W - 40, 40, 22, "rgba(255,255,255,0.5)", "right");
    }
  };

  // ================= X and O =================
  var xo = {
    id: "xo", title: "X and O", title_ar: "إكس أو", color: "linear-gradient(135deg,#9d174d,#4c0519)",
    init: function () { this.b = [0, 0, 0, 0, 0, 0, 0, 0, 0]; this.sel = 4; this.over = 0; this.busy = false; score(""); },
    lines: [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]],
    winner: function (b) {
      for (var i = 0; i < 8; i++) { var l = this.lines[i]; if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return b[l[0]]; }
      return b.indexOf(0) < 0 ? 3 : 0;
    },
    best: function (b, p) {   // minimax: the TV's move (it plays a random move now and then, so children can win)
      var me = this;
      function mm(bb, who) {
        var w = me.winner(bb);
        if (w === 2) return 1; if (w === 1) return -1; if (w === 3) return 0;
        var best = who === 2 ? -2 : 2;
        for (var i = 0; i < 9; i++) if (!bb[i]) { bb[i] = who; var v = mm(bb, 3 - who); bb[i] = 0; best = who === 2 ? Math.max(best, v) : Math.min(best, v); }
        return best;
      }
      var free = [], i, top = -2, pick = -1;
      for (i = 0; i < 9; i++) if (!b[i]) free.push(i);
      if (Math.random() < 0.25) return free[Math.floor(Math.random() * free.length)];
      for (i = 0; i < free.length; i++) { b[free[i]] = p; var v = mm(b, 3 - p); b[free[i]] = 0; if (v > top) { top = v; pick = free[i]; } }
      return pick;
    },
    key: function (k) {
      if (this.over) { if (k === "ok") this.init(); return; }
      if (this.busy) return;
      var x = this.sel % 3, y = Math.floor(this.sel / 3);
      if (k === "left" && x > 0) this.sel--;
      if (k === "right" && x < 2) this.sel++;
      if (k === "up" && y > 0) this.sel -= 3;
      if (k === "down" && y < 2) this.sel += 3;
      if (k === "ok" && !this.b[this.sel]) {
        this.b[this.sel] = 1;
        this.over = this.winner(this.b);
        if (this.over) return;
        var me = this; this.busy = true;
        setTimeout(function () { me.b[me.best(me.b, 2)] = 2; me.over = me.winner(me.b); me.busy = false; G.redraw(); }, 400);
      }
    },
    draw: function (c) {
      c.fillStyle = "#1a0710"; c.fillRect(0, 0, W, H);
      var X0 = 365, Y0 = 70, S = 220;
      c.strokeStyle = "rgba(255,255,255,0.18)"; c.lineWidth = 8; c.lineCap = "round";
      for (var i = 1; i < 3; i++) {
        c.beginPath(); c.moveTo(X0 + i * S, Y0 + 10); c.lineTo(X0 + i * S, Y0 + 3 * S - 10); c.stroke();
        c.beginPath(); c.moveTo(X0 + 10, Y0 + i * S); c.lineTo(X0 + 3 * S - 10, Y0 + i * S); c.stroke();
      }
      for (i = 0; i < 9; i++) {
        var cx = X0 + (i % 3) * S + S / 2, cy = Y0 + Math.floor(i / 3) * S + S / 2;
        if (i === this.sel && !this.over) { rr(c, cx - S / 2 + 14, cy - S / 2 + 14, S - 28, S - 28, 24); c.fillStyle = "rgba(255,255,255,0.08)"; c.fill(); }
        c.lineWidth = 18;
        if (this.b[i] === 1) { c.strokeStyle = "#e9c46a"; c.beginPath(); c.moveTo(cx - 60, cy - 60); c.lineTo(cx + 60, cy + 60); c.moveTo(cx + 60, cy - 60); c.lineTo(cx - 60, cy + 60); c.stroke(); }
        if (this.b[i] === 2) { c.strokeStyle = "#f472b6"; c.beginPath(); c.arc(cx, cy, 64, 0, Math.PI * 2); c.stroke(); }
      }
      var ar = FH.cfg.language === "ar";
      if (this.over) banner(c, this.over === 3 ? (ar ? "تعادل" : "A draw") : this.over === 1 ? (ar ? "فزت!" : "You win!") : (ar ? "فاز التلفاز" : "The TV wins"), ar ? "موافق للعب مرة أخرى" : "OK to play again");
    }
  };

  G.list = [serpent, pairs, four, xo];

  // the little picture on each game's tile
  G.icon = function (canvas, id) {
    var c = canvas.getContext("2d");
    canvas.width = 240; canvas.height = 240;
    c.scale(2, 2);
    if (id === "serpent") { c.fillStyle = "#f4d27a"; for (var i = 0; i < 5; i++) { rr(c, 10 + i * 20, 70, 18, 18, 6); c.fill(); } c.fillStyle = "#7c3f12"; c.beginPath(); c.arc(100, 30, 12, 0, Math.PI * 2); c.fill(); }
    if (id === "pairs") { shape(c, 0, 35, 35, 22); shape(c, 1, 85, 35, 22); shape(c, 2, 35, 85, 22); shape(c, 3, 85, 85, 22); }
    if (id === "four") { for (var k = 0; k < 4; k++) { c.fillStyle = k % 2 ? "#5eead4" : "#e9c46a"; c.beginPath(); c.arc(20 + k * 27, 100 - k * 27, 12, 0, Math.PI * 2); c.fill(); } }
    if (id === "xo") { c.strokeStyle = "#e9c46a"; c.lineWidth = 9; c.lineCap = "round"; c.beginPath(); c.moveTo(15, 15); c.lineTo(55, 55); c.moveTo(55, 15); c.lineTo(15, 55); c.stroke(); c.strokeStyle = "#f472b6"; c.beginPath(); c.arc(85, 85, 22, 0, Math.PI * 2); c.stroke(); }
  };

  // ---------------- running one ----------------
  G.redraw = function () { if (G.cur && ctx) G.cur.draw(ctx); };
  function loop(t) {
    raf = null;
    if (!G.cur || G.paused) return;
    var dt = last ? t - last : 16;
    last = t;
    if (G.cur.tick && G.cur.tick(dt)) G.cur.draw(ctx);
    raf = requestAnimationFrame(loop);
  }
  G.open = function (id) {
    G.list.forEach(function (g) { if (g.id === id) G.cur = g; });
    if (!G.cur) return;
    ctx = FH.el("game-canvas").getContext("2d");
    FH.el("game-title").textContent = FH.cfg.language === "ar" ? G.cur.title_ar : G.cur.title;
    FH.el("game-hint").textContent = FH.t("game_hint");
    FH.el("game").className = "overlay game open";
    G.paused = false;
    G.cur.init();
    G.cur.draw(ctx);
    last = 0;
    if (G.cur.tick) raf = requestAnimationFrame(loop);
  };
  G.key = function (k) {
    if (k === "back") { G.close(); return; }
    if (!G.cur) return;
    G.cur.key(k);
    G.cur.draw(ctx);
    if (G.paused && G.cur.tick) { G.paused = false; last = 0; raf = requestAnimationFrame(loop); }
  };
  G.pause = function () { G.paused = true; if (raf) cancelAnimationFrame(raf); raf = null; };
  G.close = function () {
    G.pause();
    if (G.cur && G.cur.wait) clearTimeout(G.cur.wait);
    G.cur = null;
    FH.el("game").className = "overlay game";
    if (FH.afterOverlay) FH.afterOverlay();
  };
})();
