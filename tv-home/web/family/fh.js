// The family home's shared parts: its settings, its words (English and Arabic), saving on the TV,
// asking the bridge, and moving the focus with the remote's arrows. The other family/*.js files add
// themselves to window.FH; home.js starts everything. Plain ES5 for 2017 Samsung and 2018 LG browsers.
(function () {
  "use strict";
  var FH = window.FH = {};
  var Q = location.search;
  function param(name) { var m = new RegExp("[?&]" + name + "=([^&]*)").exec(Q); return m ? decodeURIComponent(m[1]) : ""; }
  FH.param = param;
  FH.demo = param("demo") === "1";

  // ---------- the bridge (optional) ----------
  var S = window.COUCH_TIZEN || window.COUCH_WEBOS || {};
  FH.platform = window.COUCH_TIZEN ? "samsung" : window.COUCH_WEBOS ? "lg" : "web";
  if (FH.param("platform")) FH.platform = FH.param("platform");   // for testing in a browser
  FH.bridge = (param("api") || "").replace(/\/+$/, "");
  FH.tvId = param("tv") || S.tv || "";
  FH.key = S.key || "";

  FH.api = function (method, path, body, done) {
    if (!FH.bridge) { if (done) done(null); return; }
    var x = new XMLHttpRequest();
    var sep = path.indexOf("?") < 0 ? "?" : "&";
    x.open(method, FH.bridge + path + (FH.tvId ? sep + "tv=" + encodeURIComponent(FH.tvId) : ""));
    if (FH.key) x.setRequestHeader("Authorization", "Bearer " + FH.key);
    if (body) x.setRequestHeader("Content-Type", "application/json");
    x.timeout = 8000;
    x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} if (done) done(j); };
    x.onerror = x.ontimeout = function () { if (done) done(null); };
    x.send(body ? JSON.stringify(body) : null);
  };

  FH.getJSON = function (url, done) {
    var x = new XMLHttpRequest();
    x.open("GET", url);
    x.timeout = 10000;
    x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} done(x.status === 200 ? j : null); };
    x.onerror = x.ontimeout = function () { done(null); };
    x.send();
  };

  // ---------- kept on this TV ----------
  FH.get = function (k, d) {
    try { var v = localStorage.getItem("family." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
  };
  FH.set = function (k, v) { try { localStorage.setItem("family." + k, JSON.stringify(v)); } catch (e) {} };

  // ---------- settings: config.json's "family" (with this TV's own overrides), then the TV's own choices ----------
  function merge(a, b) {
    var out = {}, k;
    for (k in a) if (a.hasOwnProperty(k)) out[k] = a[k];
    for (k in b) if (b.hasOwnProperty(k)) {
      out[k] = (b[k] && typeof b[k] === "object" && !(b[k] instanceof Array) && a[k] && typeof a[k] === "object") ? merge(a[k], b[k]) : b[k];
    }
    return out;
  }
  FH.merge = merge;

  var DEFAULTS = {
    members: [
      { id: "m1", name: "Board 1", color: "#3b82f6" }, { id: "m2", name: "Board 2", color: "#ef4444" },
      { id: "m3", name: "Board 3", color: "#10b981" }, { id: "m4", name: "Board 4", color: "#f59e0b" }
    ],
    language: "",
    clock_24h: null,
    relay: { url: "", household: "", tv_key: "" },
    prayer: { method: "auto", asr: "auto", high_lat: "angle", hijri_adjust: 0, offsets: {} },
    adhan: { on: true, muezzin: "", fajr_muezzin: "", volume: 100, fajr_volume: 70,
             prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
             interrupt_apps: true, dua: true, return_after: true },
    haram: { source: "auto", samsung_tuner: false, tuner_channel: "", stream_url: "", dish_url: "", youtube: "",
             data_saver_minutes: 20, muted: false },
    apps: ["youtube", "netflix", "shahid", "smarters"],
    background: "mountain",
    speed: "auto"
  };

  FH.loadConfig = function () {
    var C = window.COUCH_CONFIG || {};
    var fam = merge(DEFAULTS, C.family || {});
    var tv = null;
    (C.tvs || []).forEach(function (t) { if (t.id === (FH.tvId || C.default_tv)) tv = t; });
    if (tv && tv.family) fam = merge(fam, tv.family);
    // what the family changed on this TV (Home settings) wins
    fam = merge(fam, FH.get("mine", {}));
    var wx = C.weather || {};
    fam.place = { lat: +wx.lat || 21.4225, lng: +wx.lon || 39.8262, name: wx.place || "Makkah",
                  timezone: wx.timezone || "", country: (C.country || "").toUpperCase() };
    fam.home = C.home || {};
    fam.tvs = (C.tvs || []).map(function (t) { return { id: t.id, name: t.name }; });
    if (!fam.language) fam.language = /^ar/.test((C.home || {}).language || "") ? "ar" : "en";
    FH.cfg = fam;
    return fam;
  };
  FH.saveMine = function (path, value) {
    var mine = FH.get("mine", {}), o = mine, parts = path.split(".");
    for (var i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] && typeof o[parts[i]] === "object" ? o[parts[i]] : {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
    FH.set("mine", mine);
    FH.loadConfig();
  };

  // ---------- words ----------
  var W = {
    en: {
      next: "Next", in: "in", now: "now", fajr: "Fajr", sunrise: "Sunrise", dhuhr: "Dhuhr", jumuah: "Jumu'ah",
      asr: "Asr", maghrib: "Maghrib", isha: "Isha", haram: "Haram", adhan: "Adhan", on: "On", off: "Off",
      live: "Live · Masjid al-Haram", live_paused: "Live paused to save data. Press OK to watch.",
      live_none: "Add the live broadcast in config.json (family.haram), see docs/FAMILY.md.",
      live_tuner_off: "The satellite picture shows when this TV's tuner is on the Quran channel.",
      live_loading: "Connecting to the live broadcast…", live_failed: "The live broadcast is not answering. Trying again soon.",
      board_empty: "Draw from your phone", board_off: "Set up drawing: docs/FAMILY.md", updated: "updated",
      just_now: "just now", min_ago: "min ago", h_ago: "h ago",
      apps: "Apps", all_apps: "All apps", games: "Offline games", settings: "Settings", down: "▼  All apps and games",
      stop_adhan: "Press OK or ▶ to stop the adhan", stop_adhan_back: "Press OK or ▶ to stop the adhan and go back to your show",
      adhan_done: "Going back in a moment. Press OK to stay.",
      big_hint: "Back to close", game_hint: "Arrows to move · OK to pick · Back to leave",
      s_title: "Home settings", s_adhan: "Adhan", s_live: "Live broadcast", s_prayer: "Prayer times", s_look: "Look and speed", s_about: "About",
      s_muezzin: "Muezzin", s_fajr_muezzin: "Fajr muezzin", s_volume: "Adhan volume", s_fajr_volume: "Fajr volume",
      s_try: "Play a short sample", s_method: "Calculation", s_asr: "Asr", s_hijri: "Hijri date",
      s_bg: "Background", s_speed: "Speed", s_lang: "Language", s_classic: "Open the classic couch-tv home",
      s_source: "Source", s_saver: "Data saver", s_minutes: "min", s_never: "Never stop",
      auto: "Automatic", standard: "Standard (Shafi'i, Maliki, Hanbali)", hanafi: "Hanafi", lite: "Lite", full: "Full",
      no_adhans: "No adhan files on this TV yet: run scripts/get-adhan.py on the computer, then build again.",
      volume_note: "The adhan plays at the TV's own volume; this is its share of it.",
      mountain: "Mountain lake", volcano: "Volcano", hills: "Misty hills",
      friday: "Friday", tuner: "Satellite (this TV)", stream: "Internet stream", dish: "Home computer (satellite tuner)", none: "Off",
      days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
      wx: { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain", 71: "Snow", 80: "Showers", 95: "Thunderstorm" },
      hi: "H", lo: "L"
    },
    ar: {
      next: "الصلاة القادمة", in: "بعد", now: "الآن", fajr: "الفجر", sunrise: "الشروق", dhuhr: "الظهر", jumuah: "الجمعة",
      asr: "العصر", maghrib: "المغرب", isha: "العشاء", haram: "الحرم", adhan: "الأذان", on: "تشغيل", off: "إيقاف",
      live: "بث مباشر · المسجد الحرام", live_paused: "أوقفنا البث لتوفير الإنترنت. اضغط موافق للمشاهدة.",
      live_none: "أضف مصدر البث في config.json (family.haram)",
      live_tuner_off: "تظهر الصورة عندما يكون جهاز الاستقبال على قناة القرآن الكريم.",
      live_loading: "جارٍ الاتصال بالبث…", live_failed: "البث لا يستجيب، سنحاول مرة أخرى.",
      board_empty: "ارسم من جوالك", board_off: "إعداد الرسم: docs/FAMILY.md", updated: "آخر تحديث",
      just_now: "الآن", min_ago: "د", h_ago: "س",
      apps: "التطبيقات", all_apps: "كل التطبيقات", games: "ألعاب بدون إنترنت", settings: "الإعدادات", down: "▼  كل التطبيقات والألعاب",
      stop_adhan: "اضغط موافق أو ▶ لإيقاف الأذان", stop_adhan_back: "اضغط موافق أو ▶ لإيقاف الأذان والعودة",
      adhan_done: "سنعود بعد قليل. اضغط موافق للبقاء.",
      big_hint: "رجوع للإغلاق", game_hint: "الأسهم للتحرك · موافق للاختيار · رجوع للخروج",
      s_title: "إعدادات الشاشة", s_adhan: "الأذان", s_live: "البث المباشر", s_prayer: "مواقيت الصلاة", s_look: "الشكل والسرعة", s_about: "حول",
      s_muezzin: "المؤذن", s_fajr_muezzin: "مؤذن الفجر", s_volume: "صوت الأذان", s_fajr_volume: "صوت أذان الفجر",
      s_try: "استمع لمقطع قصير", s_method: "طريقة الحساب", s_asr: "العصر", s_hijri: "التاريخ الهجري",
      s_bg: "الخلفية", s_speed: "السرعة", s_lang: "اللغة", s_classic: "فتح الشاشة الكلاسيكية",
      s_source: "المصدر", s_saver: "توفير البيانات", s_minutes: "د", s_never: "بدون إيقاف",
      auto: "تلقائي", standard: "الجمهور", hanafi: "الحنفي", lite: "خفيف", full: "كامل",
      no_adhans: "لا توجد ملفات أذان بعد: شغّل scripts/get-adhan.py ثم أعد البناء.",
      volume_note: "يعمل الأذان بمستوى صوت التلفاز؛ هذه نسبته منه.",
      mountain: "بحيرة الجبل", volcano: "البركان", hills: "التلال",
      friday: "الجمعة", tuner: "الستلايت (هذا التلفاز)", stream: "بث عبر الإنترنت", dish: "كمبيوتر المنزل (ستلايت)", none: "إيقاف",
      days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
      months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
      wx: { 0: "صافٍ", 1: "صافٍ غالبًا", 2: "غائم جزئيًا", 3: "غائم", 45: "ضباب", 48: "ضباب", 51: "رذاذ", 61: "مطر", 63: "مطر", 65: "مطر غزير", 71: "ثلج", 80: "زخات", 95: "عاصفة رعدية" },
      hi: "ع", lo: "د"
    }
  };
  FH.HIJRI_MONTHS = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  FH.HIJRI_MONTHS_EN = ["Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Akhir", "Jumada al-Ula", "Jumada al-Akhirah", "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qa'dah", "Dhu al-Hijjah"];
  FH.AR_NAMES = { fajr: "الفجر", sunrise: "الشروق", dhuhr: "الظهر", jumuah: "الجمعة", asr: "العصر", maghrib: "المغرب", isha: "العشاء" };
  FH.t = function (k) { var L = W[(FH.cfg && FH.cfg.language) || "en"] || W.en; return L[k] !== undefined ? L[k] : (W.en[k] !== undefined ? W.en[k] : k); };

  FH.el = function (id) { return document.getElementById(id); };
  FH.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); };
  var toastT = null;
  FH.toast = function (text, ms) {
    var n = FH.el("toast");
    n.textContent = text;
    n.className = "toast show";
    clearTimeout(toastT);
    toastT = setTimeout(function () { n.className = "toast"; }, ms || 4000);
  };
  FH.now = function () { return FH.demoNow ? FH.demoNow() : Date.now(); };

  // ---------- the remote ----------
  // Key names, whatever the TV calls them: Samsung Back is 10009, LG Back is 461 (webos.js passes it on as
  // Escape), the media keys differ by model.
  FH.keyOf = function (e) {
    var c = e.keyCode, k = e.key || "";
    if (c === 37 || k === "ArrowLeft") return "left";
    if (c === 38 || k === "ArrowUp") return "up";
    if (c === 39 || k === "ArrowRight") return "right";
    if (c === 40 || k === "ArrowDown") return "down";
    if (c === 13 || k === "Enter" || c === 65376) return "ok";
    if (c === 10009 || c === 461 || c === 8 || k === "Escape" || k === "Backspace" || k === "GoBack") return "back";
    if (c === 415 || c === 10252 || c === 19 || c === 179 || k === "MediaPlayPause" || k === "MediaPlay" || k === "MediaPause" || k === " ") return "play";
    if (c === 413 || k === "MediaStop") return "stop";
    return "";
  };

  // ---------- focus: the nearest thing in the direction pressed ----------
  // Positions are read once each time a screen opens (FH.focus.scan), not on every key press.
  var focus = FH.focus = { list: [], cur: null, rects: [] };
  focus.scan = function (root) {
    focus.root = root;
    focus.list = Array.prototype.slice.call(root.querySelectorAll(".f")).filter(function (n) { return n.offsetParent !== null || n.offsetWidth; });
    var R = FH.scale || 1;
    focus.rects = focus.list.map(function (n) {
      var r = n.getBoundingClientRect();
      return { x: (r.left + r.width / 2) / R, y: (r.top + r.height / 2) / R, l: r.left / R, r: r.right / R, t: r.top / R, b: r.bottom / R };
    });
  };
  focus.set = function (n) {
    if (!n) return;
    if (focus.cur && focus.cur !== n) focus.cur.className = focus.cur.className.replace(/\s*\bfocus\b/g, "");
    focus.cur = n;
    if (!/\bfocus\b/.test(n.className)) n.className += " focus";
    if (focus.onchange) focus.onchange(n);
  };
  focus.move = function (dir) {
    var i = focus.list.indexOf(focus.cur);
    if (i < 0) { focus.set(focus.list[0]); return true; }
    var a = focus.rects[i], best = null, bestScore = 1e9;
    for (var j = 0; j < focus.list.length; j++) {
      if (j === i) continue;
      var b = focus.rects[j], dx = b.x - a.x, dy = b.y - a.y, main, side;
      if (dir === "left") { if (b.r > a.l + 4 && dx >= -4) continue; main = -dx; side = Math.abs(dy); }
      else if (dir === "right") { if (b.l < a.r - 4 && dx <= 4) continue; main = dx; side = Math.abs(dy); }
      else if (dir === "up") { if (b.b > a.t + 4 && dy >= -4) continue; main = -dy; side = Math.abs(dx); }
      else { if (b.t < a.b - 4 && dy <= 4) continue; main = dy; side = Math.abs(dx); }
      if (main <= 0) continue;
      var score = main + side * 2.2;
      if (score < bestScore) { bestScore = score; best = focus.list[j]; }
    }
    if (best) { focus.set(best); return true; }
    return false;
  };
})();
