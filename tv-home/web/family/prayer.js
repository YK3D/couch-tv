// Prayer times, sunrise and the Hijri date for the family home, worked out on the TV with no
// network (the bridge has the same sums in bridge/prayer.py; tests/test_family_prayer.py checks the
// two agree, and both against AlAdhan's published times).
//
// The sun's position comes from the standard low precision formulas (the US Naval Observatory's
// "approximate solar coordinates", good to about a minute of time). Each prayer is the moment the
// sun reaches an angle below or above the horizon, as each authority defines it; the angles are
// the ones AlAdhan publishes for each method (api.aladhan.com/v1/methods, checked 20 Nov 2026).
//
// Everything is in UTC instants (milliseconds), so the TV's own clock zone never matters: the home's
// zone (weather.timezone in config.json) is only used to say which day it is and to show the times.
// Plain ES5: it runs on 2017 Samsung and 2018 LG browsers.
(function () {
  "use strict";

  var RAD = Math.PI / 180;
  function sin(d) { return Math.sin(d * RAD); }
  function cos(d) { return Math.cos(d * RAD); }
  function tan(d) { return Math.tan(d * RAD); }
  function asin(x) { return Math.asin(x) / RAD; }
  function acos(x) { return Math.acos(x) / RAD; }
  function atan2(y, x) { return Math.atan2(y, x) / RAD; }
  function acot(x) { return Math.atan(1 / x) / RAD; }
  function fix(a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; }

  // Fajr and Isha are degrees below the horizon; a number with "min" is minutes after Maghrib.
  // maghrib: minutes after sunset (0 = at sunset) or degrees.
  var METHODS = {
    MWL: { name: "Muslim World League", fajr: 18, isha: 17 },
    ISNA: { name: "Islamic Society of North America", fajr: 15, isha: 15 },
    EGYPT: { name: "Egyptian General Authority of Survey", fajr: 19.5, isha: 17.5 },
    MAKKAH: { name: "Umm al-Qura, Makkah", fajr: 18.5, ishaMin: 90, ramadanIshaMin: 120 },
    KARACHI: { name: "University of Islamic Sciences, Karachi", fajr: 18, isha: 18 },
    TEHRAN: { name: "Institute of Geophysics, Tehran", fajr: 17.7, isha: 14, maghribAngle: 4.5 },
    GULF: { name: "Gulf Region", fajr: 19.5, ishaMin: 90 },
    KUWAIT: { name: "Kuwait", fajr: 18, isha: 17.5 },
    QATAR: { name: "Qatar", fajr: 18, ishaMin: 90 },
    SINGAPORE: { name: "Majlis Ugama Islam Singapura", fajr: 20, isha: 18 },
    FRANCE: { name: "Union des Organisations Islamiques de France", fajr: 12, isha: 12 },
    TURKEY: { name: "Diyanet, Turkey", fajr: 18, isha: 17 },
    RUSSIA: { name: "Spiritual Administration of Muslims of Russia", fajr: 16, isha: 15 },
    DUBAI: { name: "Dubai", fajr: 18.2, isha: 18.2, tune: { dhuhr: 3, maghrib: 3 } },
    JAKIM: { name: "JAKIM, Malaysia", fajr: 20, isha: 18 },
    TUNISIA: { name: "Tunisia", fajr: 18, isha: 18 },
    ALGERIA: { name: "Algeria", fajr: 18, isha: 17 },
    KEMENAG: { name: "Kemenag, Indonesia", fajr: 20, isha: 18 },
    MOROCCO: { name: "Morocco", fajr: 19, isha: 17 },
    PORTUGAL: { name: "Comunidade Islamica de Lisboa", fajr: 18, maghribMin: 3, ishaMin: 77 },
    JORDAN: { name: "Awqaf, Jordan", fajr: 18, maghribMin: 5, isha: 18 }
  };

  // The method most mosques in each country follow. Anything not listed: Muslim World League.
  var BY_COUNTRY = {
    SA: "MAKKAH", YE: "MAKKAH", AE: "DUBAI", KW: "KUWAIT", QA: "QATAR", BH: "GULF", OM: "GULF",
    EG: "EGYPT", SD: "EGYPT", LY: "EGYPT", SY: "EGYPT", LB: "EGYPT", IQ: "EGYPT", PS: "EGYPT",
    JO: "JORDAN", TR: "TURKEY", DZ: "ALGERIA", TN: "TUNISIA", MA: "MOROCCO", PK: "KARACHI",
    IN: "KARACHI", BD: "KARACHI", AF: "KARACHI", MY: "JAKIM", SG: "SINGAPORE", BN: "SINGAPORE",
    ID: "KEMENAG", FR: "FRANCE", RU: "RUSSIA", US: "ISNA", CA: "ISNA", PT: "PORTUGAL", IR: "TEHRAN"
  };
  // Hanafi Asr (shadow twice the length) is the usual one in these countries; Shafi'i elsewhere.
  var HANAFI = { PK: 1, IN: 1, BD: 1, AF: 1 };

  function methodFor(country) { return BY_COUNTRY[String(country || "").toUpperCase()] || "MWL"; }
  function asrFor(country) { return HANAFI[String(country || "").toUpperCase()] ? "hanafi" : "standard"; }

  // ---------- the sun ----------
  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var a = Math.floor(y / 100), b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
  }

  function sun(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360);
    var q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    var e = 23.439 - 0.00000036 * D;
    var ra = atan2(cos(e) * sin(L), cos(L)) / 15;
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(ra, 24) };
  }

  // ---------- one day ----------
  // times(): the day's prayers as UTC milliseconds. o: {y, m, d, lat, lng, elevation, method,
  // asr ("standard" or "hanafi"), highLat ("angle", "middle", "seventh", "none"), ramadan, offsets}
  function times(o) {
    var m = METHODS[o.method] || METHODS.MWL;
    var lat = +o.lat, lng = +o.lng;
    var jd0 = julian(o.y, o.m, o.d) - lng / (15 * 24);
    var factor = o.asr === "hanafi" ? 2 : 1;
    var riseSet = 0.833 + 0.0347 * Math.sqrt(Math.max(0, +o.elevation || 0));

    // hours of local mean time (UT + lng/15); each value is worked out at its own moment
    function noon(t) { return fix(12 - sun(jd0 + t / 24).eqt, 24); }
    function at(angle, t, before) {
      var s = sun(jd0 + t / 24);
      var c = (-sin(angle) - sin(s.decl) * sin(lat)) / (cos(s.decl) * cos(lat));
      if (c > 1 || c < -1) return NaN;   // the sun never gets there today (far north or south)
      var T = acos(c) / 15, n = fix(12 - s.eqt, 24);
      return n + (before ? -T : T);
    }
    function asrAt(t) {
      var s = sun(jd0 + t / 24);
      return at(-acot(factor + tan(Math.abs(lat - s.decl))), t, false);
    }

    var t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
    for (var i = 0; i < 2; i++) {   // the second pass uses the sun's place at each first answer
      var f = function (v, d) { return isNaN(v) ? d : v; };
      t = {
        fajr: at(m.fajr, f(t.fajr, 5), true),
        sunrise: at(riseSet, f(t.sunrise, 6), true),
        dhuhr: noon(f(t.dhuhr, 12)),
        asr: asrAt(f(t.asr, 13)),
        sunset: at(riseSet, f(t.sunset, 18), false),
        maghrib: m.maghribAngle ? at(m.maghribAngle, f(t.maghrib, 18), false) : at(riseSet, f(t.maghrib, 18), false),
        isha: m.isha ? at(m.isha, f(t.isha, 18), false) : at(riseSet, f(t.isha, 18), false)
      };
    }
    if (!m.maghribAngle) t.maghrib = t.sunset + (m.maghribMin || 0) / 60;
    if (!m.isha) t.isha = t.maghrib + ((o.ramadan && m.ramadanIshaMin) || m.ishaMin || 90) / 60;

    // far from the equator in summer the sun may never get 18 degrees down: use a share of the night
    var rule = o.highLat || "angle";
    if (rule !== "none" && !isNaN(t.sunrise) && !isNaN(t.sunset)) {
      var night = fix(t.sunrise - t.sunset, 24);
      var share = function (angle) {
        if (rule === "middle") return night / 2;
        if (rule === "seventh") return night / 7;
        return angle / 60 * night;
      };
      var fp = share(m.fajr);
      if (isNaN(t.fajr) || fix(t.sunrise - t.fajr, 24) > fp) t.fajr = t.sunrise - fp;
      if (m.isha) {
        var ip = share(m.isha);
        if (isNaN(t.isha) || fix(t.isha - t.sunset, 24) > ip) t.isha = t.sunset + ip;
      }
    }

    // the method's own minutes (Dubai's, as AlAdhan publishes them), then the home's own offsets
    var base = Date.UTC(o.y, o.m - 1, o.d), out = {}, off = {}, mine = o.offsets || {}, key;
    for (key in m.tune || {}) if (m.tune.hasOwnProperty(key)) off[key] = m.tune[key];
    for (key in mine) if (mine.hasOwnProperty(key)) off[key] = (+off[key] || 0) + (+mine[key] || 0);
    for (var k in t) {
      if (!t.hasOwnProperty(k)) continue;
      if (isNaN(t[k])) { out[k] = null; continue; }
      var ms = base + (t[k] - lng / 15) * 3600000 + (+off[k] || 0) * 60000;
      out[k] = Math.round(ms / 60000) * 60000;   // to the nearest minute, as mosques print them
    }
    return out;
  }

  // ---------- which day it is at home ----------
  // {y, m, d, hh, mm, ss, dow} of an instant in an IANA zone; the TV's own zone if Intl cannot.
  var fmtCache = {};
  function localParts(ms, tz) {
    var d = new Date(ms);
    if (tz) {
      try {
        var f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
          minute: "2-digit", second: "2-digit", hour12: false, weekday: "short" }));
        var s = f.format(d);   // "Fri, 11/20/2026, 07:05:03"
        var x = /(\w{3}),? (\d{2})\/(\d{2})\/(\d{4}),? (\d{2}):(\d{2}):(\d{2})/.exec(s);
        if (x) {
          return { y: +x[4], m: +x[2], d: +x[3], hh: (+x[5]) % 24, mm: +x[6], ss: +x[7],
                   dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(x[1]) };
        }
      } catch (e) {}
    }
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: d.getHours(),
             mm: d.getMinutes(), ss: d.getSeconds(), dow: d.getDay() };
  }

  // ---------- the Hijri date (Umm al-Qura, from hijri-table.js) ----------
  function jdnOf(y, m, d) { return Math.floor(julian(y, m, d) + 0.5); }
  function hijri(jdn, adjust) {
    jdn += adjust || 0;
    var T = window.HIJRI_UQ;
    if (T && T.years && T.years.length) {
      var rows = T.years;
      for (var i = rows.length - 1; i >= 0; i--) {
        if (rows[i][1] <= jdn) {
          if (i === rows.length - 1 && jdn - rows[i][1] > 355) break;   // past the table
          var day = jdn - rows[i][1];
          for (var mo = 0; mo < 12; mo++) {
            var len = (rows[i][2] >> mo) & 1 ? 30 : 29;
            if (day < len) return { y: rows[i][0], m: mo + 1, d: day + 1 };
            day -= len;
          }
          break;
        }
      }
    }
    // outside the table: the arithmetic (tabular) calendar, which can be a day out
    var l = jdn - 1948440 + 10632, n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    var j = Math.floor((10985 - l) / 5316) * Math.floor(50 * l / 17719) + Math.floor(l / 5670) * Math.floor(43 * l / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor(17719 * j / 50) - Math.floor(j / 16) * Math.floor(15238 * j / 43) + 29;
    var hm = Math.floor(24 * l / 709), hd = l - Math.floor(709 * hm / 24), hy = 30 * n + j - 30;
    return { y: hy, m: hm, d: hd };
  }

  var NAMES = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

  // The day's list for the home: [{id, at}] plus Friday's Dhuhr called Jumu'ah by the caller.
  function day(cfg, ms) {
    var p = localParts(ms, cfg.timezone);
    var h = hijri(jdnOf(p.y, p.m, p.d), cfg.hijriAdjust);
    var t = times({ y: p.y, m: p.m, d: p.d, lat: cfg.lat, lng: cfg.lng, elevation: cfg.elevation,
                    method: cfg.method, asr: cfg.asr, highLat: cfg.highLat, ramadan: h.m === 9,
                    offsets: cfg.offsets });
    return { date: p, hijri: h, times: t, list: NAMES.map(function (n) { return { id: n, at: t[n] }; }) };
  }

  window.Prayer = { METHODS: METHODS, methodFor: methodFor, asrFor: asrFor, times: times, day: day,
                    localParts: localParts, hijri: hijri, jdnOf: jdnOf, NAMES: NAMES };
})();
