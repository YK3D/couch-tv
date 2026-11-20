// The live broadcast from Masjid al-Haram in the middle of the family home.
//
// Where the picture comes from (family.haram in config.json, docs/FAMILY.md):
//   "tuner"   Samsung only: the TV's own satellite tuner, shown in the tile with tizen.tvwindow. It shows
//             whatever channel the tuner is on, so the TV must be left on the Quran channel (or the bridge
//             tunes it at switch-on, family.haram.tuner_channel). Samsung withdrew the channel-changing API
//             for apps in 2024, so the app itself cannot change the channel. Uses no internet.
//   "dish"     a stream from a computer at home with a satellite tuner (scripts/haram-lan-stream.sh): for the
//             LG, the same satellite dish, no internet.
//   "stream"  an internet HLS address you are allowed to use. The lowest picture size of at least 360 lines
//             is picked from the playlist, and it plays only while the home is on screen (data saver).
//   "youtube" a YouTube video id for the live broadcast. YouTube picks the quality by the player's size.
// A Samsung cannot pass its tuner on to another TV: the tuner draws on its own video plane, which no app
// can read, so "stream the Samsung to the LG" is not possible; "dish" is the way to share one dish.
(function () {
  "use strict";
  var FH = window.FH;
  var H = FH.haram = { kind: "none", playing: false, muted: false, ducked: false, hidden: false, stopped: false };
  var media = null, video = null, frame = null, idleT = null, failT = null;

  function tile() { return FH.el("live"); }
  function cls(on, name) {
    var n = tile();
    n.className = n.className.replace(new RegExp("\\s*\\b" + name + "\\b", "g"), "") + (on ? " " + name : "");
  }
  function cover(text) { FH.el("live-cover-text").textContent = text || ""; }

  H.pick = function () {
    var c = FH.cfg.haram || {}, s = c.source || "auto";
    if (s !== "auto") return s;
    if (FH.platform === "samsung" && c.samsung_tuner) return "tuner";
    if (c.dish_url) return "dish";
    if (c.stream_url) return "stream";
    if (c.youtube) return "youtube";
    return "none";
  };

  // ---------- Samsung's tuner ----------
  function rectOf(n) {
    var r = n.getBoundingClientRect();
    return [Math.round(r.left) + "px", Math.round(r.top) + "px", Math.round(r.width) + "px", Math.round(r.height) + "px"];
  }
  function tunerShow(full) {
    try {
      tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (info) {
        var src = null;
        ((info && info.connected) || []).forEach(function (s) { if (s.type === "TV" && !src) src = s; });
        if (!src) { cover(FH.t("live_tuner_off")); cls(false, "playing"); return; }
        tizen.tvwindow.setSource(src, function () {
          var rect = full ? ["0px", "0px", "1920px", "1080px"] : rectOf(FH.el("live-media"));
          tizen.tvwindow.show(function () { H.playing = true; cls(true, "playing"); applyMute(); },
            function () { cover(FH.t("live_tuner_off")); }, rect, "MAIN", "FRONT");
        }, function () { cover(FH.t("live_tuner_off")); });
      }, function () { cover(FH.t("live_tuner_off")); });
    } catch (e) { cover(FH.t("live_tuner_off")); }
  }
  function tunerHide() {
    H.playing = false;
    cls(false, "playing");
    try { tizen.tvwindow.hide(function () {}, function () {}); } catch (e) {}
    masterMute(false);
  }
  // Samsung has no way to quieten only the tuner's sound in a window: the TV's own mute is all there is
  // (tizen.tvaudiocontrol, which Samsung marks old since 2020 and may refuse). So "Haram sound off" on a
  // Samsung mutes the TV while the home is on screen, and it is always undone when anything else opens.
  var masterMuted = false;
  function masterMute(on) {
    if (on === masterMuted) return;
    try { tizen.tvaudiocontrol.setMute(on); masterMuted = on; } catch (e) { masterMuted = false; }
  }

  // ---------- a stream (HLS) ----------
  // Picks the smallest picture of at least 360 lines from a master playlist, so the TV does not climb to
  // 1080p for a 960 pixel tile. If the playlist cannot be read (no CORS, a plain media playlist), it plays
  // the address as given.
  function lowVariant(url, done) {
    FH.getText(url, function (text) {
      if (!text || text.indexOf("#EXT-X-STREAM-INF") < 0) { done(url); return; }
      var lines = text.split(/\r?\n/), best = null, any = null;
      for (var i = 0; i < lines.length; i++) {
        var m = /^#EXT-X-STREAM-INF:(.*)$/.exec(lines[i]);
        if (!m) continue;
        var bw = +((/BANDWIDTH=(\d+)/.exec(m[1]) || [])[1] || 0), h = +((/RESOLUTION=\d+x(\d+)/.exec(m[1]) || [])[1] || 0);
        var uri = (lines[i + 1] || "").trim();
        if (!uri || uri.charAt(0) === "#") continue;
        var v = { bw: bw, h: h, uri: uri };
        if (!any || bw < any.bw) any = v;
        if (h >= 360 && (!best || bw < best.bw)) best = v;
      }
      var pick = best || any;
      if (!pick) { done(url); return; }
      done(/^https?:/.test(pick.uri) ? pick.uri : url.replace(/[^\/?#]*([?#].*)?$/, "") + pick.uri);
    });
  }
  FH.getText = function (url, done) {
    var x = new XMLHttpRequest();
    try { x.open("GET", url); } catch (e) { done(null); return; }
    x.timeout = 8000;
    x.onload = function () { done(x.status === 200 ? x.responseText : null); };
    x.onerror = x.ontimeout = function () { done(null); };
    x.send();
  };

  function videoPlay(url) {
    if (!video) {
      video = document.createElement("video");
      video.setAttribute("playsinline", "");
      video.setAttribute("preload", "none");
      video.addEventListener("playing", function () { H.playing = true; cls(true, "playing"); clearTimeout(failT); });
      video.addEventListener("error", function () { failed(); });
      video.addEventListener("stalled", function () { clearTimeout(failT); failT = setTimeout(failed, 20000); });
      media.appendChild(video);
    }
    cover(FH.t("live_loading"));
    video.muted = H.muted || H.ducked;
    lowVariant(url, function (u) {
      if (H.stopped) return;
      video.src = u;
      var p = video.play();
      if (p && p.catch) p.catch(function () { failed(); });
    });
  }
  function videoStop() {
    H.playing = false;
    cls(false, "playing");
    if (video) { try { video.pause(); } catch (e) {} video.removeAttribute("src"); try { video.load(); } catch (e) {} }
  }
  var failures = 0;
  function failed() {
    videoStop();
    cover(FH.t("live_failed"));
    failures++;
    clearTimeout(failT);
    failT = setTimeout(function () { if (!H.stopped && !H.hidden) H.resume(); }, Math.min(300000, 15000 * failures));
  }

  // ---------- YouTube ----------
  function ytPlay(id) {
    if (!frame) {
      frame = document.createElement("iframe");
      frame.setAttribute("allow", "autoplay; encrypted-media");
      frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      media.appendChild(frame);
    }
    // YouTube refuses to play inside a packaged TV app with no referrer (its error 153). Through the bridge
    // the page that holds the player has a normal address, so that is tried first.
    var q = "v=" + encodeURIComponent(id) + "&mute=" + (H.muted || H.ducked ? 1 : 0);
    frame.src = FH.bridge ? FH.bridge + "/tv/family/yt.html?" + q
      : "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&controls=0&playsinline=1&enablejsapi=1&mute=" + (H.muted ? 1 : 0);
    H.playing = true;
    cls(true, "playing");
  }
  function ytStop() { H.playing = false; cls(false, "playing"); if (frame) frame.src = "about:blank"; }
  function ytMute(on) {
    if (!frame || !frame.contentWindow) return;
    try { frame.contentWindow.postMessage(JSON.stringify({ event: "command", func: on ? "mute" : "unMute", args: [] }), "*"); } catch (e) {}
  }

  // ---------- one switch for all sources ----------
  function applyMute() {
    var quiet = H.muted || H.ducked;
    if (H.kind === "tuner") masterMute(H.muted && !H.ducked && !H.hidden);
    else if (video) video.muted = quiet;
    else if (frame) ytMute(quiet);
    cls(H.muted, "muted");
  }

  H.resume = function () {
    H.stopped = false;
    if (H.hidden) return;
    if (H.kind === "tuner") tunerShow(H.isFull);
    else if (H.kind === "dish") videoPlay(FH.cfg.haram.dish_url);
    else if (H.kind === "stream") videoPlay(FH.cfg.haram.stream_url);
    else if (H.kind === "youtube") ytPlay(FH.cfg.haram.youtube);
    else if (H.kind === "demo" && FH.demoLive) { FH.demoLive(media); H.playing = true; cls(true, "playing"); }
    H.activity();
  };
  H.stop = function (why) {
    H.stopped = true;
    clearTimeout(idleT);
    if (H.kind === "tuner") tunerHide();
    else if (H.kind === "youtube") ytStop();
    else if (H.kind !== "demo") videoStop();
    if (why === "saver") cover(FH.t("live_paused"));
  };

  // the home is covered (an overlay, the app list) or not on screen: a tuner plane would sit on top of
  // everything, and a stream nobody sees only costs data
  H.hide = function () {
    if (H.hidden) return;
    H.hidden = true;
    clearTimeout(idleT);
    if (H.kind === "tuner") tunerHide();
    else if (H.kind === "youtube") ytStop();
    else if (H.kind !== "demo") videoStop();
  };
  H.show = function () { if (!H.hidden) return; H.hidden = false; if (!H.stopped && H.kind !== "none") H.resume(); };

  // the adhan: the broadcast goes quiet until it is over. A tuner plane is hidden (it would cover the adhan screen).
  H.duck = function (on) {
    H.ducked = on;
    if (H.kind === "tuner") { if (on) tunerHide(); else if (!H.hidden) tunerShow(H.isFull); }
    applyMute();
  };

  H.setMuted = function (on) {
    H.muted = on;
    FH.saveMine("haram.muted", on);
    applyMute();
  };

  H.full = function (on) {
    H.isFull = on;
    cls(on, "full");
    if (H.kind === "tuner" && H.playing) tunerShow(on);
  };

  // data saver: a stream stops after family.haram.data_saver_minutes with no key pressed (0: never)
  H.activity = function () {
    clearTimeout(idleT);
    var min = +FH.cfg.haram.data_saver_minutes || 0;
    if (!min || H.kind === "tuner" || H.kind === "demo" || H.kind === "none") return;
    idleT = setTimeout(function () { H.stop("saver"); }, min * 60000);
  };

  H.start = function () {
    media = FH.el("live-media");
    H.kind = FH.demo ? "demo" : H.pick();
    H.muted = !!FH.cfg.haram.muted;
    FH.el("live-tag-text").textContent = FH.t("live");
    cls(H.kind === "tuner", "tuner");
    if (H.kind === "none") { cover(FH.t("live_none")); return; }
    // Samsung: the bridge puts the tuner on the Quran channel (family.haram.tuner_channel), at most every 6 hours,
    // since Samsung no longer lets an app change channel itself (bridge/family.py)
    if (H.kind === "tuner" && FH.cfg.haram.tuner_channel && FH.bridge && FH.now() - FH.get("tunedAt", 0) > 6 * 3600000) {
      FH.set("tunedAt", FH.now());
      FH.api("POST", "/api/family/tune", {}, null);
    }
    H.resume();
    applyMute();
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { H.hide(); masterMute(false); } else H.show();
    });
    window.addEventListener("pagehide", function () { masterMute(false); });
  };
})();
