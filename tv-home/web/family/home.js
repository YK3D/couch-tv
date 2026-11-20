// The family home: starts the parts in family/*.js and draws the clock, the dates, the prayer strip,
// the weather, the sky, the app row, the app library and Home settings. Keys go to whatever is on top.
(function () {
  "use strict";
  var FH = window.FH, $ = FH.el;
  FH.Prayer = window.Prayer;

  // ---------- one 1920x1080 stage, scaled to the screen ----------
  function fitStage() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1;
    FH.scale = s;
    $("stage").style.transform = s === 1 ? "" : "scale(" + s + ")";
  }

  // ---------- prayer times for today ----------
  function prayerCfg() {
    var c = FH.cfg, p = c.prayer || {}, country = c.place.country;
    return {
      lat: c.place.lat, lng: c.place.lng, timezone: c.place.timezone,
      method: p.method && p.method !== "auto" ? p.method : FH.Prayer.methodFor(country),
      asr: p.asr && p.asr !== "auto" ? p.asr : FH.Prayer.asrFor(country),
      highLat: p.high_lat || "angle", hijriAdjust: +p.hijri_adjust || 0, offsets: p.offsets || {}
    };
  }
  function refreshDay() {
    var now = FH.now();
    FH.day = FH.Prayer.day(prayerCfg(), now);
    // after Isha, "next" is tomorrow's Fajr
    FH.tomorrow = FH.Prayer.day(prayerCfg(), now + 86400000);
    drawPrayers();
  }

  function two(n) { return (n < 10 ? "0" : "") + n; }
  function hhmm(ms, small) {
    var p = FH.Prayer.localParts(ms, FH.cfg.place.timezone), h = p.hh;
    var h24 = FH.cfg.clock_24h === null || FH.cfg.clock_24h === undefined ? !!FH.cfg.home.clock_24h : FH.cfg.clock_24h;
    if (h24) return two(h) + ":" + two(p.mm);
    var ap = h < 12 ? "AM" : "PM";
    if (FH.cfg.language === "ar") ap = h < 12 ? "ص" : "م";
    h = h % 12 || 12;
    return h + ":" + two(p.mm) + (small ? "<small>" + ap + "</small>" : " " + ap);
  }

  // ---------- the strip of prayers ----------
  var prNodes = {};
  function drawPrayers() {
    var list = $("pr-list"), html = "", friday = FH.day.date.dow === 5;
    FH.day.list.forEach(function (p) {
      var id = p.id === "dhuhr" && friday ? "jumuah" : p.id;
      html += '<div class="pr" data-id="' + p.id + '"><div class="pr-n">' + FH.esc(FH.t(id)) +
        (FH.cfg.language === "ar" ? "" : '<span class="ar">' + FH.AR_NAMES[id] + "</span>") +
        '</div><div class="pr-t">' + (p.at ? hhmm(p.at) : "--") + "</div></div>";
    });
    list.innerHTML = html;
    prNodes = {};
    Array.prototype.forEach.call(list.children, function (n) { prNodes[n.getAttribute("data-id")] = n; });
    tickPrayers(true);
  }

  function nextPrayer(now) {
    var all = FH.day.list.concat(FH.tomorrow.list.map(function (p) { return { id: p.id, at: p.at, tomorrow: true }; }));
    for (var i = 0; i < all.length; i++) if (all[i].at && all[i].at > now) return all[i];
    return null;
  }

  var lastNext = "";
  function tickPrayers(force) {
    var now = FH.now(), nx = nextPrayer(now), a = FH.cfg.adhan;
    FH.day.list.forEach(function (p) {
      var n = prNodes[p.id];
      if (!n) return;
      var c = "pr" + (p.at && p.at <= now ? " past" : "") + (nx && !nx.tomorrow && nx.id === p.id ? " next" : "") +
        (p.id !== "sunrise" && (!a.on || !a.prayers[p.id]) ? " off" : "");
      if (n.className !== c) n.className = c;
    });
    if (!nx) return;
    var friday = FH.Prayer.localParts(nx.at, FH.cfg.place.timezone).dow === 5 && nx.id === "dhuhr";
    var mins = Math.max(0, Math.round((nx.at - now) / 60000)), inText;
    if (mins < 1) inText = FH.t("now");
    else if (mins < 60) inText = FH.t("in") + " " + mins + " " + (FH.cfg.language === "ar" ? "دقيقة" : "min");
    else inText = FH.t("in") + " " + Math.floor(mins / 60) + (FH.cfg.language === "ar" ? " س " : "h ") + two(mins % 60) + (FH.cfg.language === "ar" ? " د" : "m");
    var key = nx.id + inText;
    if (key !== lastNext || force) {
      lastNext = key;
      $("next-label").textContent = FH.t("next");
      $("next-name").textContent = FH.t(friday ? "jumuah" : nx.id) + "  " + hhmm(nx.at);
      $("next-in").textContent = inText;
    }
    var p = FH.Prayer.localParts(now, FH.cfg.place.timezone);
    $("pr-fill").style.transform = "scaleX(" + ((p.hh * 60 + p.mm) / 1440).toFixed(4) + ")";
  }

  // ---------- clock and dates ----------
  var lastMinute = -1;
  function tickClock() {
    var now = FH.now(), p = FH.Prayer.localParts(now, FH.cfg.place.timezone);
    if (p.mm === lastMinute) return;
    lastMinute = p.mm;
    $("time").innerHTML = hhmm(now, true);
    var days = FH.t("days"), months = FH.t("months");
    $("date").textContent = FH.cfg.language === "ar" ? days[p.dow] + " " + p.d + " " + months[p.m - 1] + " " + p.y
      : days[p.dow] + " " + p.d + " " + months[p.m - 1] + " " + p.y;
    if (!FH.day || FH.day.date.d !== p.d) refreshDay();
    var h = FH.day.hijri;
    $("hijri").textContent = h.d + " " + FH.HIJRI_MONTHS[h.m - 1] + " " + h.y + " هـ";
    tickPrayers();
    sky();
  }

  // ---------- the sky: which part of the day it is, from today's sun ----------
  var PHASES = ["night", "dawn", "day", "golden", "dusk"];
  function phaseAt(now) {
    var t = FH.day.times, H = 3600000;
    if (FH.param("phase")) return FH.param("phase");
    if (!t.sunrise || !t.sunset) return "day";
    if (now < (t.fajr || t.sunrise - H)) return "night";
    if (now < t.sunrise + 0.6 * H) return "dawn";
    if (now < t.sunset - 1.2 * H) return "day";
    if (now < t.sunset + 0.15 * H) return "golden";
    if (now < (t.isha || t.sunset + 1.3 * H)) return "dusk";
    return "night";
  }
  var lastPhase = "";
  function sky() {
    var now = FH.now(), ph = phaseAt(now);
    if (ph !== lastPhase) {
      var first = !lastPhase;
      lastPhase = ph;
      if (first) { $("sky").className = "sky instant"; setTimeout(function () { $("sky").className = "sky"; }, 100); }
      Array.prototype.forEach.call(document.querySelectorAll(".sky-layer"), function (n) {
        var on = n.getAttribute("data-phase") === ph;
        if (on && !n.style.backgroundImage) n.style.backgroundImage = "url(family/bg/" + (FH.cfg.background || "mountain") + "-" + ph + ".jpg)";
        n.className = "sky-layer" + (on ? " on" : "");
      });
      document.body.setAttribute("data-phase", ph);
    }
    // a soft glow where the sun is: left in the morning, right in the evening, gone at night
    var t = FH.day.times, g = $("sun-glow");
    if (t.sunrise && t.sunset && now > t.sunrise - 1800000 && now < t.sunset + 1800000) {
      var f = Math.max(0, Math.min(1, (now - t.sunrise) / (t.sunset - t.sunrise)));
      var alt = Math.sin(f * Math.PI);
      g.style.setProperty("--sx", (12 + 76 * f).toFixed(1) + "%");
      g.style.setProperty("--sy", (62 - 44 * alt).toFixed(1) + "%");
      g.style.setProperty("--sa", (0.32 * (1 - alt) + 0.06).toFixed(2));
    } else g.style.setProperty("--sa", "0");
  }

  // ---------- weather (Open-Meteo, no key; every 20 minutes) ----------
  var ICONS = {
    sun: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="#ffd166"/><g stroke="#ffd166" stroke-width="4" stroke-linecap="round"><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13 13l6 6M45 45l6 6M13 51l6-6M45 19l6-6"/></g></svg>',
    moon: '<svg viewBox="0 0 64 64"><path d="M42 44A18 18 0 0 1 26 14a18 18 0 1 0 22 26 18 18 0 0 1-6 4z" fill="#e9e4d4"/></svg>',
    cloud: '<svg viewBox="0 0 64 64"><path d="M20 48h26a11 11 0 0 0 0-22 15 15 0 0 0-28 4 9 9 0 0 0 2 18z" fill="#dfe6ee"/></svg>',
    part: '<svg viewBox="0 0 64 64"><circle cx="24" cy="22" r="10" fill="#ffd166"/><path d="M22 50h24a10 10 0 0 0 0-20 13 13 0 0 0-25 3 8.5 8.5 0 0 0 1 17z" fill="#dfe6ee"/></svg>',
    rain: '<svg viewBox="0 0 64 64"><path d="M20 40h26a11 11 0 0 0 0-22 15 15 0 0 0-28 4 9 9 0 0 0 2 18z" fill="#cfd8e3"/><g stroke="#7dd3fc" stroke-width="4" stroke-linecap="round"><path d="M24 46l-3 8M34 46l-3 8M44 46l-3 8"/></g></svg>',
    fog: '<svg viewBox="0 0 64 64"><g stroke="#dfe6ee" stroke-width="5" stroke-linecap="round"><path d="M12 24h40M8 34h44M14 44h36"/></g></svg>',
    snow: '<svg viewBox="0 0 64 64"><path d="M20 40h26a11 11 0 0 0 0-22 15 15 0 0 0-28 4 9 9 0 0 0 2 18z" fill="#e8eef5"/><g fill="#fff"><circle cx="24" cy="50" r="3"/><circle cx="34" cy="54" r="3"/><circle cx="44" cy="50" r="3"/></g></svg>',
    storm: '<svg viewBox="0 0 64 64"><path d="M20 38h26a11 11 0 0 0 0-22 15 15 0 0 0-28 4 9 9 0 0 0 2 18z" fill="#aeb8c6"/><path d="M34 40l-8 12h7l-4 10 11-14h-7l4-8z" fill="#ffd166"/></svg>'
  };
  function iconFor(code, day) {
    if (code === 0 || code === 1) return day ? "sun" : "moon";
    if (code === 2) return day ? "part" : "cloud";
    if (code === 3) return "cloud";
    if (code === 45 || code === 48) return "fog";
    if (code >= 71 && code <= 77) return "snow";
    if (code >= 95) return "storm";
    if (code >= 51) return "rain";
    return "cloud";
  }
  function descFor(code) {
    var W = FH.t("wx"), best = 0;
    for (var k in W) if (W.hasOwnProperty(k) && +k <= code && +k >= best) best = +k;
    return W[best] || "";
  }
  FH.showWeather = function (w) {
    if (!w) {   // no forecast yet (no internet): the place alone, no empty numbers
      $("wx-icon").innerHTML = ""; $("wx-temp").textContent = ""; $("wx-desc").textContent = "";
      $("wx-place").textContent = FH.cfg.place.name;
      return;
    }
    var unit = (FH.cfg.home.wx_unit === "f") ? "°F" : "°";
    $("wx-icon").innerHTML = ICONS[iconFor(w.code, w.day)];
    $("wx-temp").textContent = Math.round(w.temp) + unit;
    $("wx-desc").textContent = descFor(w.code) + "  ·  " + FH.t("hi") + " " + Math.round(w.max) + "°  " + FH.t("lo") + " " + Math.round(w.min) + "°";
    $("wx-place").textContent = FH.cfg.place.name;
  };
  function weather() {
    var P = FH.cfg.place;
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + P.lat + "&longitude=" + P.lng +
      "&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto" +
      (FH.cfg.home.wx_unit === "f" ? "&temperature_unit=fahrenheit" : "");
    FH.getJSON(url, function (j) {
      if (!j || !j.current) { FH.showWeather(FH.get("wx", null)); return; }
      var w = { temp: j.current.temperature_2m, code: j.current.weather_code, day: !!j.current.is_day,
                max: j.daily.temperature_2m_max[0], min: j.daily.temperature_2m_min[0] };
      FH.set("wx", w);
      FH.showWeather(w);
    });
  }

  // ---------- apps ----------
  // The pinned row (family.apps): each entry is matched against the TV's own list by name, so it works
  // whatever id Samsung or LG gives the app. Known ones also match the Android names couch-tv uses.
  var KNOWN = {
    youtube: { pkg: /^com\.google\.android\.youtube\.tv$/, name: /^youtube$/i, label: "YouTube", color: "#ff0033" },
    netflix: { pkg: /^com\.netflix\.ninja$/, name: /netflix/i, label: "Netflix", color: "#e50914" },
    shahid: { pkg: /shahid/i, name: /shahid|شاهد/i, label: "Shahid", color: "#31d07f" },
    smarters: { pkg: /smarters/i, name: /smarters/i, label: "IPTV Smarters", color: "#4f8cff" }
  };
  FH.allApps = function () {
    var list = [];
    try { list = JSON.parse(window.TVOS && TVOS.apps ? TVOS.apps() : "[]") || []; } catch (e) {}
    return list.map(function (a) { return { pkg: a.package, label: a.label || a.name || a.package }; });
  };
  function findApp(key, apps) {
    var k = KNOWN[String(key).toLowerCase()];
    for (var i = 0; i < apps.length; i++) {
      var a = apps[i];
      if (k ? (k.pkg.test(a.pkg) || k.name.test(a.label)) : a.label.toLowerCase().indexOf(String(key).toLowerCase()) >= 0) return a;
    }
    return null;
  }
  function iconOf(pkg) { try { return window.TVOS && TVOS.iconUrl ? TVOS.iconUrl(pkg) : null; } catch (e) { return null; } }
  function face(a, label, color, glyphOnly) {
    var icon = !glyphOnly && a ? iconOf(a.pkg) : null;
    return '<div class="face"' + (color ? ' style="background:' + color + '"' : "") + ">" +
      (icon ? '<img src="' + FH.esc(icon) + '" alt="" decoding="async">' : '<div class="glyph">' + FH.esc(label) + "</div>") + "</div>";
  }
  FH.launch = function (pkg, label) {
    var done = false;
    try { done = window.TVOS && TVOS.launch ? TVOS.launch(pkg) : false; } catch (e) {}
    if (!done && FH.bridge) { FH.api("POST", "/api/launch", { app: pkg }, null); done = true; }
    if (!done) FH.toast((FH.cfg.language === "ar" ? "افتح " : "Open ") + label + (FH.cfg.language === "ar" ? " من قائمة تطبيقات التلفاز" : " from the TV's own app list"));
  };

  function drawDock() {
    var apps = FH.allApps(), html = "", pinned = {};
    (FH.cfg.apps || []).slice(0, 4).forEach(function (key) {
      var a = findApp(key, apps), k = KNOWN[String(key).toLowerCase()] || {};
      var label = a ? a.label : (k.label || key);
      if (a) pinned[a.pkg] = 1;
      html += '<div class="tile f" data-app="' + FH.esc(a ? a.pkg : "") + '" data-label="' + FH.esc(label) + '">' +
        face(a, label, a && iconOf(a.pkg) ? "" : (k.color || "")) + '<div class="name">' + FH.esc(label) + (a ? "" : " ·  " + (FH.cfg.language === "ar" ? "غير مثبت" : "not installed")) + "</div></div>";
    });
    html += '<div class="tile small f" data-go="library"><div class="face"><div class="glyph">⋯<small>' + FH.esc(FH.t("all_apps")) + "</small></div></div></div>";
    html += '<div class="tile small f" data-go="games"><div class="face"><div class="glyph">◆<small>' + FH.esc(FH.t("games")) + "</small></div></div></div>";
    html += '<div class="tile small f" data-go="settings"><div class="face"><div class="glyph">⚙<small>' + FH.esc(FH.t("settings")) + "</small></div></div></div>";
    $("dock").innerHTML = html;
    $("down-hint").textContent = FH.t("down");
    FH.pinned = pinned;
  }

  function drawLibrary() {
    var apps = FH.allApps().slice().sort(function (a, b) { return a.label.localeCompare(b.label); });
    var html = "";
    apps.forEach(function (a) {
      var icon = iconOf(a.pkg);
      html += '<div class="lib-app f" data-app="' + FH.esc(a.pkg) + '" data-label="' + FH.esc(a.label) + '">' +
        (icon ? '<img src="' + FH.esc(icon) + '" alt="" decoding="async">' : '<div class="glyph">' + FH.esc(a.label) + "</div>") + "</div>";
    });
    $("lib-apps-title").textContent = FH.t("all_apps");
    $("lib-grid").innerHTML = html;
    $("lib-games-title").textContent = FH.t("games");
    var g = "";
    FH.games.list.forEach(function (x) {
      g += '<div class="game-tile f" data-game="' + x.id + '" style="background:#333;background:' + x.color + '"><canvas></canvas><b>' +
        FH.esc(FH.cfg.language === "ar" ? x.title_ar : x.title) + "</b><span>" + FH.esc(FH.cfg.language === "ar" ? x.title : x.title_ar) + "</span></div>";
    });
    $("lib-games").innerHTML = g;
    Array.prototype.forEach.call($("lib-games").querySelectorAll(".game-tile"), function (n) { FH.games.icon(n.querySelector("canvas"), n.getAttribute("data-game")); });
  }

  // ---------- the two switches: Haram sound and the adhan ----------
  function drawToggles() {
    var h = $("tg-haram"), a = $("tg-adhan"), hOn = !FH.haram.muted, aOn = FH.cfg.adhan.on;
    h.querySelector(".tg-text").textContent = FH.t("haram") + " · " + (hOn ? FH.t("on") : FH.t("off"));
    a.querySelector(".tg-text").textContent = FH.t("adhan") + " · " + (aOn ? FH.t("on") : FH.t("off"));
    h.className = h.className.replace(/\s*\bis-off\b/g, "") + (hOn ? "" : " is-off");
    a.className = a.className.replace(/\s*\bis-off\b/g, "") + (aOn ? "" : " is-off");
    h.setAttribute("aria-checked", hOn ? "true" : "false");
    a.setAttribute("aria-checked", aOn ? "true" : "false");
  }

  // ---------- Home settings ----------
  var SET = { tab: 0 };
  function cycle(list, cur, dir) { var i = list.indexOf(cur); i = (i < 0 ? 0 : i + (dir || 1) + list.length) % list.length; return list[i]; }
  function settingsTabs() {
    var c = FH.cfg, muez = FH.adhan.catalogue();
    var mName = function (id) { var m = null; muez.forEach(function (x) { if (x.id === id) m = x; }); m = m || muez[0]; return m ? (c.language === "ar" && m.name_ar ? m.name_ar : m.name) : "—"; };
    var methods = ["auto"].concat(Object.keys(FH.Prayer.METHODS));
    return [
      { id: "s_adhan", rows: [
        { label: FH.t("adhan"), value: c.adhan.on ? FH.t("on") : FH.t("off"), act: function () { FH.saveMine("adhan.on", !c.adhan.on); } },
        { label: FH.t("s_muezzin"), value: mName(c.adhan.muezzin), act: function (d) { if (muez.length) FH.saveMine("adhan.muezzin", cycle(muez.map(function (m) { return m.id; }), c.adhan.muezzin || muez[0].id, d)); } },
        { label: FH.t("s_fajr_muezzin"), value: mName(c.adhan.fajr_muezzin || c.adhan.muezzin), act: function (d) { if (muez.length) FH.saveMine("adhan.fajr_muezzin", cycle(muez.map(function (m) { return m.id; }), c.adhan.fajr_muezzin || c.adhan.muezzin || muez[0].id, d)); } },
        { label: FH.t("s_volume"), value: c.adhan.volume + "%", act: function (d) { FH.saveMine("adhan.volume", cycle([100, 90, 80, 70, 60, 50, 40, 30], +c.adhan.volume, d)); } },
        { label: FH.t("s_fajr_volume"), value: c.adhan.fajr_volume + "%", act: function (d) { FH.saveMine("adhan.fajr_volume", cycle([100, 90, 80, 70, 60, 50, 40, 30], +c.adhan.fajr_volume, d)); } }
      ].concat(["fajr", "dhuhr", "asr", "maghrib", "isha"].map(function (p) {
        return { label: FH.t(p), value: c.adhan.prayers[p] ? FH.t("on") : FH.t("off"), act: function () { FH.saveMine("adhan.prayers." + p, !c.adhan.prayers[p]); } };
      })).concat([{ label: FH.t("s_try"), value: "▶", act: function () { closeSettings(); FH.adhan.start("dhuhr", true); } }]),
        note: muez.length ? FH.t("volume_note") : FH.t("no_adhans") },
      { id: "s_live", rows: [
        { label: FH.t("haram"), value: FH.haram.muted ? FH.t("off") : FH.t("on"), act: function () { FH.haram.setMuted(!FH.haram.muted); drawToggles(); } },
        { label: FH.t("s_source"), value: FH.t({ tuner: "tuner", dish: "dish", stream: "stream", youtube: "stream", none: "none", demo: "stream" }[FH.haram.kind] || "none"), act: function () {} },
        { label: FH.t("s_saver"), value: +c.haram.data_saver_minutes ? c.haram.data_saver_minutes + " " + FH.t("s_minutes") : FH.t("s_never"), act: function (d) { FH.saveMine("haram.data_saver_minutes", cycle([10, 20, 30, 60, 0], +c.haram.data_saver_minutes, d)); FH.haram.activity(); } }
      ], note: "" },
      { id: "s_prayer", rows: [
        { label: FH.t("s_method"), value: (c.prayer.method === "auto" || !c.prayer.method ? FH.t("auto") + " · " : "") + FH.Prayer.METHODS[prayerCfg().method].name, act: function (d) { FH.saveMine("prayer.method", cycle(methods, c.prayer.method || "auto", d)); refreshDay(); } },
        { label: FH.t("s_asr"), value: FH.t(prayerCfg().asr), act: function (d) { FH.saveMine("prayer.asr", cycle(["auto", "standard", "hanafi"], c.prayer.asr || "auto", d)); refreshDay(); } },
        { label: FH.t("s_hijri"), value: (+c.prayer.hijri_adjust > 0 ? "+" : "") + (+c.prayer.hijri_adjust || 0), act: function (d) { FH.saveMine("prayer.hijri_adjust", cycle([-2, -1, 0, 1, 2], +c.prayer.hijri_adjust || 0, d)); refreshDay(); lastMinute = -1; tickClock(); } }
      ], note: c.place.name + " · " + c.place.lat.toFixed(3) + ", " + c.place.lng.toFixed(3) },
      { id: "s_look", rows: [
        { label: FH.t("s_bg"), value: FH.t(c.background), act: function (d) { FH.saveMine("background", cycle(["mountain", "volcano", "hills"], c.background, d)); Array.prototype.forEach.call(document.querySelectorAll(".sky-layer"), function (n) { n.style.backgroundImage = ""; }); lastPhase = ""; sky(); } },
        { label: FH.t("s_speed"), value: FH.t(c.speed === "lite" ? "lite" : c.speed === "full" ? "full" : "auto"), act: function (d) { FH.saveMine("speed", cycle(["auto", "lite", "full"], c.speed, d)); speed(); } },
        { label: FH.t("s_lang"), value: c.language === "ar" ? "العربية" : "English", act: function () { FH.saveMine("language", c.language === "ar" ? "en" : "ar"); location.reload(); } },
        { label: FH.t("s_classic"), value: "→", act: function () { location.href = "index.html" + location.search; } }
      ], note: "" }
    ];
  }
  function drawSettings() {
    var tabs = settingsTabs(), html = "";
    $("set-title").textContent = FH.t("s_title");
    tabs.forEach(function (t, i) { html += '<div class="set-tab f' + (i === SET.tab ? " sel" : "") + '" data-tab="' + i + '">' + FH.esc(FH.t(t.id)) + "</div>"; });
    $("set-tabs").innerHTML = html;
    var tab = tabs[SET.tab];
    $("set-head").textContent = FH.t(tab.id);
    html = "";
    tab.rows.forEach(function (r, i) { html += '<div class="set-row f" data-row="' + i + '"><span>' + FH.esc(r.label) + '</span><span class="v">' + FH.esc(r.value) + "</span></div>"; });
    $("set-rows").innerHTML = html;
    $("set-note").textContent = tab.note || "";
    SET.rows = tab.rows;
  }
  function openSettings() {
    SET.tab = 0;
    drawSettings();
    $("settings").className = "overlay settings open";
    FH.screen = "settings";
    FH.haram.hide();
    FH.focus.scan($("settings"));
    FH.focus.set($("set-rows").children[0] || $("set-tabs").children[0]);
  }
  function closeSettings() {
    $("settings").className = "overlay settings";
    drawToggles();
    drawPrayers();
    FH.afterOverlay();
  }
  // Settings: Up and Down move; on a row, OK or Right changes it (each value goes round), Left goes to the
  // list of sections; on a section, Right or OK goes into its rows.
  function settingsKey(k) {
    var n = FH.focus.cur, i;
    if (k === "back") { closeSettings(); return; }
    if (n && /set-row/.test(n.className)) {
      if (k === "ok" || k === "right") {
        i = +n.getAttribute("data-row");
        SET.rows[i].act(1);
        if (FH.screen !== "settings") return;
        drawSettings();
        FH.focus.scan($("settings"));
        FH.focus.set($("set-rows").children[i]);
        return;
      }
      if (k === "left") { FH.focus.set($("set-tabs").children[SET.tab]); return; }
      FH.focus.move(k);
      return;
    }
    if (n && /set-tab/.test(n.className)) {
      if (k === "ok" || k === "right") { if ($("set-rows").children[0]) FH.focus.set($("set-rows").children[0]); return; }
      if ((k === "up" || k === "down") && FH.focus.move(k) && /set-tab/.test(FH.focus.cur.className)) {
        SET.tab = +FH.focus.cur.getAttribute("data-tab");
        drawSettings();
        FH.focus.scan($("settings"));
        FH.focus.set($("set-tabs").children[SET.tab]);
      }
    }
  }

  // ---------- screens and keys ----------
  FH.screen = "home";
  var homeFocus = null;
  function showHome(focusOn) {
    FH.screen = "home";
    $("slide").className = "slide";
    FH.haram.show();
    setTimeout(function () {
      FH.focus.scan($("page-home"));
      FH.focus.set(focusOn || homeFocus || $("dock").children[0]);
    }, FH.cfg.speed === "lite" ? 0 : 60);
  }
  function showLibrary(toGames) {
    homeFocus = FH.focus.cur;
    FH.screen = "library";
    $("slide").className = "slide down";
    FH.haram.hide();
    FH.focus.scan($("page-library"));
    // read positions as they will be after the slide (one page lower)
    FH.focus.rects.forEach(function (r) { r.y -= 1080; r.t -= 1080; r.b -= 1080; });
    var first = toGames ? $("lib-games").children[0] : ($("lib-grid").children[0] || $("lib-games").children[0]);
    FH.focus.set(first);
  }
  FH.afterOverlay = function () {
    if (FH.screen === "adhan" || FH.adhan.on) return;
    if ($("slide").className.indexOf("down") >= 0) { FH.screen = "library"; FH.focus.scan($("page-library")); FH.focus.set(homeFocus && $("page-library").contains(homeFocus) ? homeFocus : $("lib-games").children[0]); return; }
    showHome(homeFocus);
  };

  function activate(n) {
    if (!n) return;
    var go = n.getAttribute("data-go"), app = n.getAttribute("data-app"), game = n.getAttribute("data-game"), board = n.getAttribute("data-board");
    if (go === "library") showLibrary(false);
    else if (go === "games") showLibrary(true);
    else if (go === "settings") { homeFocus = n; openSettings(); }
    else if (app !== null) { if (app) FH.launch(app, n.getAttribute("data-label")); else FH.toast((FH.cfg.language === "ar" ? "ثبّت " : "Install ") + n.getAttribute("data-label") + (FH.cfg.language === "ar" ? " من متجر تطبيقات التلفاز أولًا" : " from the TV's app store first"), 5000); }
    else if (game) { homeFocus = n; FH.screen = "game"; FH.games.open(game); }
    else if (board !== null) { homeFocus = n; FH.screen = "board"; FH.haram.hide(); FH.boards.open(+board); }
    else if (n.id === "live") {
      if (FH.haram.stopped || !FH.haram.playing) FH.haram.resume();
      else { FH.screen = "live"; FH.haram.full(true); }
    } else if (n.id === "tg-haram") { FH.haram.setMuted(!FH.haram.muted); drawToggles(); }
    else if (n.id === "tg-adhan") { FH.saveMine("adhan.on", !FH.cfg.adhan.on); drawToggles(); tickPrayers(true); }
  }

  function onKey(e) {
    var k = FH.keyOf(e);
    if (!k) return;
    e.preventDefault();
    FH.haram.activity();
    if (FH.adhan.on) { FH.adhan.key(k); return; }
    if (FH.screen === "game") { FH.games.key(k); return; }
    if (FH.screen === "settings") { settingsKey(k); return; }
    if (FH.screen === "board") { if (k === "back" || k === "ok") { FH.boards.close(); FH.afterOverlay(); } return; }
    if (FH.screen === "live") { if (k === "back" || k === "ok") { FH.haram.full(false); FH.screen = "home"; } return; }
    if (FH.screen === "library") {
      if (k === "back") { showHome(homeFocus); return; }
      if (k === "ok") { activate(FH.focus.cur); return; }
      if (!FH.focus.move(k) && k === "up") showHome(homeFocus);
      return;
    }
    // the home
    if (k === "ok") { activate(FH.focus.cur); return; }
    if (k === "back") { FH.focus.set($("dock").children[0]); return; }
    var inDock = FH.focus.cur && FH.focus.cur.parentNode === $("dock");
    if (!FH.focus.move(k) && k === "down" && inDock) showLibrary(false);
  }

  // ---------- speed ----------
  // Lite on a TV that cannot keep up: the first three seconds' frame times decide (or Home settings).
  function speed() {
    var s = FH.cfg.speed;
    if (s === "lite") { document.body.className = "lite"; return; }
    if (s === "full") { document.body.className = ""; return; }
    if (FH.get("slow", null) !== null) { document.body.className = FH.get("slow") ? "lite" : ""; return; }
    var frames = 0, start = 0;
    function f(t) {
      if (!start) start = t;
      frames++;
      if (t - start < 3000) { requestAnimationFrame(f); return; }
      var slow = (t - start) / frames > 28;   // under about 35 frames a second
      FH.set("slow", slow);
      document.body.className = slow ? "lite" : "";
    }
    requestAnimationFrame(f);
  }

  // ---------- start ----------
  function start() {
    FH.loadConfig();
    document.documentElement.setAttribute("lang", FH.cfg.language);
    fitStage();
    window.addEventListener("resize", function () { fitStage(); FH.focus.scan(FH.focus.root || $("page-home")); });
    speed();
    // Samsung sends the media keys only to an app that asks for them
    try { ["MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop"].forEach(function (k) { tizen.tvinputdevice.registerKey(k); }); } catch (e) {}

    refreshDay();
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(function () { tickPrayers(); }, 30000);
    weather();
    setInterval(weather, 20 * 60000);

    FH.boards.start();
    FH.haram.start();
    drawToggles();
    drawDock();
    drawLibrary();
    FH.adhan.startLoop();

    document.addEventListener("keydown", onKey);
    showHome($("dock").children[0]);
    // coming back from Netflix and the rest: the TV's app list may have changed
    window.tv = { resume: function () { drawDock(); drawLibrary(); if (FH.screen === "home") showHome(homeFocus); } };
    if (FH.onStarted) FH.onStarted();
  }

  if (FH.demo && !window.FH_DEMO_LOADED) {
    var s = document.createElement("script");
    s.src = "family/demo.js";
    s.onload = start;
    document.body.appendChild(s);
  } else start();
})();
