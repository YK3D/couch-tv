// The adhan on the family home: when each prayer comes in, the live broadcast goes quiet, the adhan plays at
// the TV's own volume (the volume setting is its share of that), and the screen says which prayer it is.
// OK or Play stops it; Back stops it and stays on the home.
//
// Netflix, YouTube, Shahid and the rest: neither Samsung nor LG lets an app play sound or show anything over
// another app, so the bridge does it (bridge/family.py): it pauses the show, brings this home forward, and
// when the adhan is over (or OK or Play is pressed) it opens the show again and, for OK and Play, presses
// Play. With no bridge the adhan plays only while the home itself is on screen.
//
// Recordings: family/adhan/list.js names them; scripts/get-adhan.py downloads them into family/adhan/mine/
// (git ignored) and levels their loudness, so one muezzin is not twice as loud as another.
(function () {
  "use strict";
  var FH = window.FH;
  var A = FH.adhan = { on: false };
  var audio = null, prayerId = null, back = null, doneT = null, closeT = null, preview = false;
  var DUA = "اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلَاةِ الْقَائِمَةِ، آتِ مُحَمَّدًا الْوَسِيلَةَ وَالْفَضِيلَةَ، وَابْعَثْهُ مَقَامًا مَحْمُودًا الَّذِي وَعَدْتَهُ";
  var WINDOW = 120000;   // an adhan starts if the home is on screen within 2 minutes of the time

  A.catalogue = function () {
    var have = window.FH_ADHANS_HAVE || [], out = [];
    (window.FH_ADHANS || []).concat(window.FH_ADHANS_EXTRA || []).forEach(function (a) {
      if (a.mine || have.indexOf(a.id) >= 0 || FH.demo) out.push(a);
    });
    return out;
  };
  function byId(id) {
    var list = A.catalogue();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }
  A.pickFor = function (prayer) {
    var c = FH.cfg.adhan;
    var who = byId(prayer === "fajr" && c.fajr_muezzin ? c.fajr_muezzin : c.muezzin);
    if (!who) return null;
    var file = prayer === "fajr" && who.fajr_file ? who.fajr_file : who.file;
    return { who: who, file: "family/" + file };
  };

  function el(id) { return FH.el(id); }
  function today() { var p = FH.Prayer.localParts(FH.now(), FH.cfg.place.timezone); return p.y + "-" + p.m + "-" + p.d; }
  function handled(id) { return FH.get("adhan.done", {})[today() + ":" + id]; }
  function markHandled(id) {
    var d = FH.get("adhan.done", {}), k = today() + ":" + id, out = {};
    out[k] = 1;
    for (var x in d) if (d.hasOwnProperty(x) && x.indexOf(today()) === 0) out[x] = 1;   // only today's are kept
    FH.set("adhan.done", out);
  }

  // ---------- due? (every 10 seconds, and whenever the home comes back on screen) ----------
  A.check = function () {
    var c = FH.cfg.adhan;
    if (A.on || !c.on || !FH.day) return;
    var now = FH.now();
    FH.day.list.forEach(function (p) {
      if (p.id === "sunrise" || !p.at || !c.prayers[p.id]) return;
      if (now >= p.at && now - p.at < WINDOW && !handled(p.id)) A.start(p.id);
    });
  };

  A.start = function (id, test) {
    markHandled(id);
    A.on = true;
    preview = !!test;
    prayerId = id;
    back = null;
    if (FH.games && FH.games.pause) FH.games.pause();
    FH.haram.duck(true);
    var o = el("adhan"), pick = A.pickFor(id), c = FH.cfg.adhan;
    var friday = FH.Prayer.localParts(FH.now(), FH.cfg.place.timezone).dow === 5 && id === "dhuhr";
    el("adhan-name").textContent = FH.t(friday ? "jumuah" : id) + "  ·  " + FH.AR_NAMES[friday ? "jumuah" : id];
    el("adhan-who").textContent = pick ? (FH.cfg.language === "ar" && pick.who.name_ar ? pick.who.name_ar : pick.who.name) : "";
    el("adhan-dua").textContent = c.dua ? DUA : "";
    el("adhan-hint").textContent = FH.t("stop_adhan");
    el("adhan-bar-fill").style.transform = "scaleX(0)";
    o.className = "overlay adhan open";
    FH.screen = "adhan";

    // did the bridge pause a show to bring the home forward?
    if (!test) FH.api("GET", "/api/family/adhan/state", null, function (j) {
      if (j && j.ok && j.interrupted && A.on) { back = j.interrupted; el("adhan-hint").textContent = FH.t("stop_adhan_back"); }
    });

    if (!audio) {
      audio = el("adhan-audio");
      audio.addEventListener("timeupdate", function () {
        if (audio.duration) el("adhan-bar-fill").style.transform = "scaleX(" + Math.min(1, audio.currentTime / audio.duration).toFixed(3) + ")";
      });
      audio.addEventListener("ended", function () { if (A.on) finished(); });
      audio.addEventListener("error", function () { if (A.on && !preview) { clearTimeout(doneT); doneT = setTimeout(finished, 45000); } });
    }
    if (pick) {
      audio.src = pick.file;
      // the TV's own volume is the loudness; this is the adhan's share of it (Fajr can be gentler)
      audio.volume = Math.max(0.05, Math.min(1, ((id === "fajr" ? c.fajr_volume : c.volume) || 100) / 100));
      var p = audio.play();
      if (p && p.catch) p.catch(function () { clearTimeout(doneT); doneT = setTimeout(finished, 45000); });
      if (test) { clearTimeout(doneT); doneT = setTimeout(function () { A.stop("back"); }, 15000); }
    } else {
      FH.toast(FH.t("no_adhans"), 8000);
      clearTimeout(doneT);
      doneT = setTimeout(finished, 45000);
    }
  };

  // the adhan came to its end: the dua for a little while, then back to the show (if one was paused)
  function finished() {
    clearTimeout(doneT);
    try { audio.pause(); } catch (e) {}
    el("adhan").className = "overlay adhan open done";
    el("adhan-bar-fill").style.transform = "scaleX(1)";
    var c = FH.cfg.adhan;
    if (back && c.return_after) el("adhan-hint").textContent = FH.t("adhan_done");
    clearTimeout(closeT);
    closeT = setTimeout(function () { A.stop(back && c.return_after ? "return" : "back"); }, c.dua ? 25000 : 4000);
  }

  // how: "play" (OK or Play: back to the show, playing), "return" (back to the show, still paused), "back" (stay here)
  A.stop = function (how) {
    if (!A.on) return;
    A.on = false;
    clearTimeout(doneT);
    clearTimeout(closeT);
    try { audio.pause(); audio.removeAttribute("src"); audio.load(); } catch (e) {}
    el("adhan").className = "overlay adhan";
    FH.screen = "home";
    FH.haram.duck(false);
    if (back && how !== "back") FH.api("POST", "/api/family/adhan/return", { play: how === "play" }, null);
    else if (!preview) FH.api("POST", "/api/family/adhan/return", { stay: true }, null);
    back = null;
    preview = false;
    if (FH.afterOverlay) FH.afterOverlay();
  };

  A.key = function (k) {
    if (k === "ok" || k === "play") { A.stop(back ? "play" : "back"); return true; }
    if (k === "back" || k === "stop") { A.stop("back"); return true; }
    return true;   // nothing else moves while the adhan is on
  };

  A.startLoop = function () {
    setInterval(A.check, 10000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) setTimeout(A.check, 600); });
    setTimeout(A.check, 1500);
  };
})();
