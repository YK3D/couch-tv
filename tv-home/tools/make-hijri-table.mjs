// Writes the Umm al-Qura calendar table the family home and the bridge use for the Hijri date and for
// Ramadan (Umm al-Qura's Isha is 120 minutes after Maghrib in Ramadan, 90 the rest of the year).
//
//   node tv-home/tools/make-hijri-table.mjs
//
// The table comes from this computer's own ICU (Node's Intl, calendar "islamic-umalqura"), so the TV
// needs no ICU of its own: older Samsung and LG browsers do not all have the Islamic calendars.
// Output: tv-home/web/family/hijri-table.js and bridge/hijri_table.json, the same numbers in both.
// Each year: the Julian day number of 1 Muharram and twelve month lengths packed as bits (1 = 30 days).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIRST = 1440, LAST = 1500;
const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });

function hijriOf(ms) {
  const parts = {};
  for (const p of fmt.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return { y: parseInt(parts.year, 10), m: parseInt(parts.month, 10), d: parseInt(parts.day, 10) };
}
const DAY = 86400000;
const jdnOf = (ms) => Math.floor(ms / DAY) + 2440588;   // 1970-01-01 is JDN 2440588

// walk day by day from well before 1 Muharram FIRST to the end of LAST
let ms = Date.UTC(2018, 0, 1);
const years = {};
let prev = null;
for (;;) {
  const h = hijriOf(ms);
  if (h.y > LAST) break;
  if (h.y >= FIRST && h.d === 1) {
    years[h.y] = years[h.y] || { start: 0, months: [] };
    if (h.m === 1) years[h.y].start = jdnOf(ms);
    if (prev) prev.len = jdnOf(ms) - prev.jdn;
    prev = { y: h.y, m: h.m, jdn: jdnOf(ms) };
    years[h.y].months[h.m - 1] = prev;
  }
  ms += DAY;
}
const out = [];
for (let y = FIRST; y <= LAST; y++) {
  const yr = years[y];
  if (!yr || !yr.start || yr.months.length !== 12 || yr.months.some((m) => !m || !m.len)) {
    if (y === LAST) break;   // the last year's last month has no next month to measure it by
    throw new Error("incomplete year " + y);
  }
  let bits = 0;
  yr.months.forEach((m, i) => { if (m.len === 30) bits |= 1 << i; else if (m.len !== 29) throw new Error("odd month " + y + "/" + (i + 1)); });
  out.push([y, yr.start, bits]);
}
const data = { source: "ICU islamic-umalqura via Node " + process.version, first: out[0][0], years: out };
const js = "// Made by tv-home/tools/make-hijri-table.mjs from ICU's Umm al-Qura calendar. Do not edit.\n" +
  "// Each row: [Hijri year, Julian day number of 1 Muharram, month lengths as bits (bit n set = month n+1 has 30 days)]\n" +
  "window.HIJRI_UQ = " + JSON.stringify({ first: data.first, years: out }) + ";\n";
writeFileSync(join(ROOT, "tv-home", "web", "family", "hijri-table.js"), js);
writeFileSync(join(ROOT, "bridge", "hijri_table.json"), JSON.stringify(data) + "\n");
console.log(`wrote ${out.length} years (${out[0][0]} to ${out[out.length - 1][0]})`);
