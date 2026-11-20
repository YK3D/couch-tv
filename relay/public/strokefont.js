// A hand-lettered single-line font for the whiteboards: the phone's "Type a note" turns typed words into
// strokes with it, so a note looks drawn and sits on the board like any drawing (and can be undone the
// same way). Capital letters, digits and a few marks; small letters are drawn as capitals. Latin only:
// Arabic is drawn by hand. Each glyph is a list of lines on a 4 by 6 grid. Made for couch-tv.
// The same file is in relay/public/ for the phone (tests/test_family_relay.mjs checks they match).
(function (root) {
  "use strict";
  var O = [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]];
  var P = [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]];
  var G = {
    A: [[[0, 6], [2, 0], [4, 6]], [[0.8, 3.6], [3.2, 3.6]]],
    B: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
    C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
    D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
    E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
    F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
    G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3], [2, 3]]],
    H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    I: [[[1, 0], [3, 0]], [[2, 0], [2, 6]], [[1, 6], [3, 6]]],
    J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
    K: [[[0, 0], [0, 6]], [[4, 0], [0, 4]], [[1.3, 3], [4, 6]]],
    L: [[[0, 0], [0, 6], [4, 6]]],
    M: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
    N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
    O: [O],
    P: [P],
    Q: [O, [[2.5, 4.5], [4, 6.2]]],
    R: [P, [[2, 3], [4, 6]]],
    S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
    T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
    U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
    V: [[[0, 0], [2, 6], [4, 0]]],
    W: [[[0, 0], [1, 6], [2, 2], [3, 6], [4, 0]]],
    X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
    Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
    Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
    "0": [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[3.6, 0.8], [0.4, 5.2]]],
    "1": [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
    "2": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
    "3": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1.5, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
    "4": [[[3, 6], [3, 0], [0, 4], [4, 4]]],
    "5": [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
    "6": [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
    "7": [[[0, 0], [4, 0], [1.5, 6]]],
    "8": [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
    "9": [[[4, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6]]],
    "!": [[[2, 0], [2, 4]], [[2, 5.7], [2, 6]]],
    "?": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [2, 3.5], [2, 4.3]], [[2, 5.7], [2, 6]]],
    ".": [[[2, 5.7], [2, 6]]],
    ",": [[[2, 5.4], [1.5, 6.6]]],
    ":": [[[2, 1.8], [2, 2.1]], [[2, 4.8], [2, 5.1]]],
    "-": [[[0.6, 3], [3.4, 3]]],
    "+": [[[0.5, 3], [3.5, 3]], [[2, 1.5], [2, 4.5]]],
    "'": [[[2, 0], [2, 1.5]]],
    "/": [[[4, 0], [0, 6]]],
    "&": [[[4, 6], [1, 2], [1, 1], [2, 0], [3, 1], [3, 2], [0, 4.5], [0, 5], [1, 6], [2.5, 6], [4, 4]]],
    "♥": [[[2, 6], [0, 3], [0, 1], [1, 0], [2, 1], [3, 0], [4, 1], [4, 3], [2, 6]]]
  };
  var ADV = 5.6, LINE = 9;

  // a steady wobble, the same each time for the same text, so a note does not shimmer when redrawn
  function rng(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(t) { var h = 7; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 2147483647; return h; }

  // write("BUY DATES", {x, y, size, maxWidth}) -> [[x, y, x, y, ...], ...] in the board's units
  // (x 0..10000 across, y in the same units down). size is the capital letters' height.
  function write(text, o) {
    o = o || {};
    var size = o.size || 600, u = size / 6, x0 = o.x || 300, y0 = o.y || 300, max = o.maxWidth || (10000 - x0 - 200);
    var wob = o.wobble === undefined ? 0.12 : o.wobble, r = rng(hash(text) + 1), out = [];
    var words = String(text).toUpperCase().split(/(\s+)/), x = x0, y = y0;
    for (var w = 0; w < words.length; w++) {
      var word = words[w];
      if (/^\s+$/.test(word)) {
        if (word.indexOf("\n") >= 0) { x = x0; y += LINE * u; } else x += ADV * u * 0.8;
        continue;
      }
      var width = word.length * ADV * u;
      if (x > x0 && x + width > x0 + max) { x = x0; y += LINE * u; }
      for (var c = 0; c < word.length; c++) {
        var g = G[word.charAt(c)];
        if (g) {
          var slant = (r() - 0.5) * 0.06;
          for (var s = 0; s < g.length; s++) {
            var pts = [];
            for (var p = 0; p < g[s].length; p++) {
              var gx = g[s][p][0], gy = g[s][p][1];
              pts.push(Math.round(x + (gx + (6 - gy) * slant + (r() - 0.5) * wob) * u),
                       Math.round(y + (gy + (r() - 0.5) * wob) * u));
            }
            out.push(pts);
          }
        }
        x += ADV * u;
      }
    }
    return out;
  }

  root.StrokeFont = { write: write, glyphs: G };
})(typeof window !== "undefined" ? window : this);
