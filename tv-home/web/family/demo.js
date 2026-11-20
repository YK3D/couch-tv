// family.html?demo=1: the family home with made-up data, for trying it in a browser and for the pictures in
// docs/FAMILY.md. Never loaded on a TV unless the address asks for it. Options:
//   at=HH:MM        the time it starts at (the home's zone), then it runs on from there
//   lang=ar         Arabic
//   view=library | settings | adhan | board | live | game-<id>
//   phase=night | dawn | day | golden | dusk   (otherwise the sky follows the time)
// The live picture is a drawing made here (no photograph or footage of the Haram).
(function () {
  "use strict";
  window.FH_DEMO_LOADED = true;
  var FH = window.FH;
  var TZ = "Asia/Riyadh";

  window.COUCH_CONFIG = {
    country: "SA",
    weather: { lat: 24.7136, lon: 46.6753, place: "Riyadh", timezone: TZ },
    home: { language: FH.param("lang") === "ar" ? "ar" : "en" },
    tvs: [{ id: "living", name: "Living room (Samsung)" }, { id: "majlis", name: "Majlis (LG)" }],
    default_tv: "living",
    family: {
      members: [
        { id: "dad", name: FH.param("lang") === "ar" ? "بابا" : "Dad", color: "#3b82f6" },
        { id: "mum", name: FH.param("lang") === "ar" ? "ماما" : "Mum", color: "#ec4899" },
        { id: "layla", name: FH.param("lang") === "ar" ? "ليلى" : "Layla", color: "#10b981" },
        { id: "yusuf", name: FH.param("lang") === "ar" ? "يوسف" : "Yusuf", color: "#f59e0b" }
      ],
      adhan: { muezzin: "alafasy", fajr_muezzin: "nafees" },
      haram: { data_saver_minutes: 20 }
    }
  };

  // ---------- the clock: a fixed day, from the time asked for ----------
  var at = /^(\d{1,2}):(\d{2})$/.exec(FH.param("at") || "12:47");
  var startReal = Date.now();
  // 20 Nov 2026 in Riyadh (UTC+3)
  var startDemo = Date.UTC(2026, 10, 20, (+at[1]) - 3, +at[2], 0);
  FH.demoNow = function () { return startDemo + (Date.now() - startReal); };

  // ---------- the TV's apps (names only: in a browser there are no logos) ----------
  var APPS = [
    ["com.google.android.youtube.tv", "YouTube"], ["com.netflix.ninja", "Netflix"], ["net.mbc.shahid", "Shahid"],
    ["com.nst.iptvsmarterstvbox", "IPTV Smarters Pro"], ["com.amazon.amazonvideo.livingroom", "Prime Video"],
    ["com.disney.disneyplus", "Disney+"], ["com.osn.go", "OSN+"], ["com.bein.connect", "beIN CONNECT"],
    ["com.spotify.tv.android", "Spotify"], ["com.anghami", "Anghami"], ["com.google.android.youtube.tvkids", "YouTube Kids"],
    ["com.apple.atve", "Apple TV"], ["com.plexapp.android", "Plex"], ["tv.samsung.plus", "Samsung TV Plus"],
    ["browser", "Internet"], ["gallery", "Gallery"], ["quran", "Quran"], ["weyyak", "Weyyak"]
  ];
  var COLORS = { "YouTube": "#ff0033", "Netflix": "#141414", "Shahid": "#0f9d58", "IPTV Smarters Pro": "#1d4ed8" };
  window.TVOS = {
    apps: function () { return JSON.stringify(APPS.map(function (a) { return { package: a[0], label: a[1] }; })); },
    launch: function (pkg) { FH.toast("Opening " + pkg); return true; },
    iconUrl: function () { return null; }
  };

  // weather without the network
  var realGet = FH.getJSON;
  FH.getJSON = function (url, done) {
    if (/open-meteo/.test(url)) {
      done({ current: { temperature_2m: 29, weather_code: 1, is_day: 1 }, daily: { temperature_2m_max: [31], temperature_2m_min: [17] } });
      return;
    }
    realGet(url, done);
  };

  // ---------- drawings for the four boards ----------
  var id = 0;
  function S(color, w, pts, eraser) { return { id: "d" + (++id), c: color, w: w, e: eraser ? 1 : 0, p: pts.map(Math.round) }; }
  function circle(cx, cy, r, n, a0, a1) {
    var p = [], s = a0 || 0, e = a1 === undefined ? Math.PI * 2 : a1;
    for (var i = 0; i <= n; i++) { var a = s + (e - s) * i / n; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    return p;
  }
  function words(text, color, x, y, size, w) {
    return window.StrokeFont.write(text, { x: x, y: y, size: size, maxWidth: 9400 - x }).map(function (p) { return S(color, w || 9, p); });
  }
  function boards() {
    var b = {}, now = FH.demoNow();
    // Dad: the shopping list
    b.dad = { at: now - 22 * 60000, strokes: [].concat(
      words("SHOPPING", "#1d4ed8", 500, 500, 820, 11),
      [S("#1d4ed8", 7, [480, 1500, 5200, 1460])],
      words("MILK", "#111827", 1300, 2050, 620), [S("#16a34a", 9, [600, 2300, 820, 2550, 1080, 2050])],
      words("BREAD", "#111827", 1300, 3150, 620), [S("#16a34a", 9, [600, 3400, 820, 3650, 1080, 3150])],
      words("DATES ♥", "#111827", 1300, 4250, 620),
      [S("#9ca3af", 6, [600, 4350, 1050, 4350, 1050, 4800, 600, 4800, 600, 4350])],
      words("PICK UP 5PM", "#dc2626", 5600, 2200, 420, 8)
    ) };
    // Mum: tonight
    b.mum = { at: now - 4 * 60000, strokes: [].concat(
      words("DINNER 8:30", "#be185d", 500, 500, 760, 11),
      words("AT TETA'S", "#be185d", 500, 1650, 760, 11),
      [S("#ef4444", 14, [7000, 4700, 6200, 3900, 6200, 3300, 6600, 2900, 7000, 3300, 7400, 2900, 7800, 3300, 7800, 3900, 7000, 4700])],
      words("BRING THE KUNAFA", "#374151", 500, 3200, 420, 7),
      [S("#f59e0b", 8, circle(8600, 1100, 520, 30))],
      [S("#f59e0b", 7, [8600, 300, 8600, 450]), S("#f59e0b", 7, [9420, 1100, 9270, 1100]), S("#f59e0b", 7, [7780, 1100, 7930, 1100])]
    ) };
    // Layla: a house, the sun, the family
    var L = [];
    L.push(S("#2563eb", 10, [900, 5600, 900, 3300, 2700, 1900, 4500, 3300, 4500, 5600, 900, 5600]));
    L.push(S("#dc2626", 9, [2200, 5600, 2200, 4300, 3100, 4300, 3100, 5600]));
    L.push(S("#0ea5e9", 8, [1300, 3700, 1900, 3700, 1900, 4200, 1300, 4200, 1300, 3700]));
    L.push(S("#facc15", 12, circle(8300, 1200, 650, 28)));
    for (var r = 0; r < 8; r++) { var a = r * Math.PI / 4; L.push(S("#facc15", 8, [8300 + Math.cos(a) * 850, 1200 + Math.sin(a) * 850, 8300 + Math.cos(a) * 1150, 1200 + Math.sin(a) * 1150])); }
    [[5600, "#7c3aed"], [6700, "#ec4899"], [7700, "#10b981"], [8600, "#f59e0b"]].forEach(function (f, i) {
      var x = f[0], h = i < 2 ? 0 : 450;
      L.push(S(f[1], 8, circle(x, 3500 + h, 330, 18)));
      L.push(S(f[1], 8, [x, 3830 + h, x, 5000]), S(f[1], 8, [x - 400, 4300 + h * 0.5, x + 400, 4300 + h * 0.5]));
      L.push(S(f[1], 8, [x - 330, 5700, x, 5000, x + 330, 5700]));
    });
    L.push(S("#16a34a", 10, [300, 6000, 9700, 5950]));
    b.layla = { at: now - 2 * 3600000, strokes: L };
    // Yusuf: a rocket, the stars, still drawing
    var Y = [];
    Y.push(S("#111827", 10, [3600, 5200, 3600, 2600, 4400, 1100, 5200, 2600, 5200, 5200, 3600, 5200]));
    Y.push(S("#2563eb", 10, circle(4400, 3000, 420, 22)));
    Y.push(S("#dc2626", 10, [3600, 4400, 2900, 5600, 3600, 5200]), S("#dc2626", 10, [5200, 4400, 5900, 5600, 5200, 5200]));
    Y.push(S("#f97316", 12, [3900, 5300, 4150, 6300, 4400, 5500, 4650, 6400, 4900, 5300]));
    [[1200, 1200], [7600, 900], [8600, 3600], [1500, 4400], [6900, 2300]].forEach(function (s) {
      Y.push(S("#eab308", 7, [s[0] - 300, s[1], s[0] + 300, s[1]]), S("#eab308", 7, [s[0], s[1] - 300, s[0], s[1] + 300]));
    });
    Y = Y.concat(words("TO THE", "#7c3aed", 5900, 3900, 520, 8), words("MOON!", "#7c3aed", 5900, 4800, 520, 8));
    b.yusuf = { at: now - 20000, strokes: Y };
    return b;
  }

  // ---------- the live tile: a drawing of the Kaaba and the circling crowd ----------
  FH.demoLive = function (box) {
    if (box.querySelector("canvas")) return;
    var c = document.createElement("canvas");
    c.width = 960; c.height = 540;
    c.style.cssText = "position:absolute;left:0;top:0;width:960px;height:540px;border-radius:22px";
    box.appendChild(c);
    var ctx = c.getContext("2d"), dots = [], i;
    for (i = 0; i < 520; i++) dots.push({ r: 150 + Math.random() * 230, a: Math.random() * Math.PI * 2, s: 0.0016 + Math.random() * 0.0014, w: Math.random() < 0.82 });
    var lastT = 0;
    function frame(t) {
      if (t - lastT > 66) {   // 15 frames a second is plenty for this
        lastT = t;
        var g = ctx.createLinearGradient(0, 0, 0, 540);
        g.addColorStop(0, "#101a2e"); g.addColorStop(0.45, "#26304a"); g.addColorStop(1, "#9a9a9a");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
        // the colonnades and clock tower, far behind
        ctx.fillStyle = "#1b2233";
        ctx.fillRect(0, 150, 960, 70);
        for (i = 0; i < 24; i++) ctx.fillRect(i * 42, 128, 26, 30);
        ctx.fillRect(700, 30, 40, 130); ctx.fillStyle = "#e9c46a"; ctx.beginPath(); ctx.arc(720, 62, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1b2233"; ctx.fillRect(160, 70, 16, 90); ctx.fillRect(810, 80, 16, 80);
        for (i = 0; i < 24; i++) { ctx.fillStyle = "rgba(255,236,190,0.55)"; ctx.fillRect(i * 42 + 8, 175, 10, 18); }
        // the white floor of the mataf
        var fl = ctx.createRadialGradient(480, 380, 40, 480, 380, 520);
        fl.addColorStop(0, "#f2f0ea"); fl.addColorStop(1, "#b9b6ad");
        ctx.fillStyle = fl; ctx.beginPath(); ctx.ellipse(480, 390, 520, 190, 0, 0, Math.PI * 2); ctx.fill();
        // the crowd behind the Kaaba
        dots.sort(function (a, b) { return Math.sin(a.a) - Math.sin(b.a); });
        function crowd(front) {
          for (var k = 0; k < dots.length; k++) {
            var d = dots[k], y = Math.sin(d.a);
            if ((y > 0) !== front) continue;
            var x = 480 + Math.cos(d.a) * d.r * 1.25, yy = 380 + y * d.r * 0.36;
            ctx.fillStyle = d.w ? "rgba(255,255,255,0.92)" : "rgba(60,60,70,0.9)";
            ctx.fillRect(x, yy - 6, 4, 7);
            d.a -= d.s;   // anticlockwise, as the tawaf goes
          }
        }
        crowd(false);
        // the Kaaba
        ctx.fillStyle = "#0b0b0d"; ctx.fillRect(420, 250, 120, 120);
        ctx.fillStyle = "#151518"; ctx.beginPath(); ctx.moveTo(540, 250); ctx.lineTo(585, 270); ctx.lineTo(585, 380); ctx.lineTo(540, 370); ctx.fill();
        ctx.fillStyle = "#c9a646"; ctx.fillRect(420, 276, 120, 9);
        ctx.beginPath(); ctx.moveTo(540, 276); ctx.lineTo(585, 294); ctx.lineTo(585, 302); ctx.lineTo(540, 285); ctx.fill();
        ctx.fillStyle = "#b8963a"; ctx.fillRect(444, 300, 22, 50);
        crowd(true);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  FH.onStarted = function () {
    FH.boards.data = boards();
    FH.boards.live.yusuf = FH.now();
    FH.boards.paintAll();
    var v = FH.param("view"), $ = FH.el;
    if (!v) return;
    setTimeout(function () {
      var ev = function (k) { document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); };
      if (v === "library") ev("ArrowDown"), setTimeout(function () { ev("ArrowDown"); }, 50);
      if (v === "settings") { FH.focus.set($("dock").lastChild); ev("Enter"); }
      if (v === "adhan") FH.adhan.start("dhuhr", true);
      if (v === "board") { FH.focus.set($("board-1")); ev("Enter"); }
      if (v === "live") { FH.focus.set($("live")); }
      if (v === "focus-board") FH.focus.set($("board-2"));
      if (/^game-/.test(v)) { FH.screen = "game"; FH.games.open(v.slice(5)); }
    }, 300);
  };
})();
