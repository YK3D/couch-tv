"""The family home's prayer times: the bridge (bridge/prayer.py) and the TV (tv-home/web/family/prayer.js)
give the same minute for every prayer, and both match AlAdhan's published times
(tests/fixtures/family-prayer-aladhan.json, fetched from api.aladhan.com on 20 Nov 2026): Fajr,
sunrise, Dhuhr, Maghrib and Isha to the minute (one either way for rounding), Asr to within two
minutes. AlAdhan's Asr comes from a slightly different sun model (its other prayers agree with these
sums exactly; its Asr was up to 1 min 3 s later in Cairo and 2 min 3 s later in Paris in November, and
up to 1 min 11 s earlier in Kuwait in March); these use the standard formulas for every prayer.

    python3 tests/test_family_prayer.py
"""
import json
import subprocess
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "bridge"))
import prayer  # noqa: E402

CASES = json.loads((ROOT / "tests" / "fixtures" / "family-prayer-aladhan.json").read_text())["cases"]
KEYS = ("fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha")

JS = r"""
const fs = require('fs'), vm = require('vm');
const ctx = { window: {}, Intl, Date, Math };
vm.createContext(ctx);
for (const f of ['hijri-table.js', 'prayer.js']) vm.runInContext(fs.readFileSync(process.argv[1] + '/' + f, 'utf8'), ctx);
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const P = ctx.window.Prayer;
const out = cases.map(c => {
  const [y, m, d] = c.date.split('-').map(Number);
  const h = P.hijri(P.jdnOf(y, m, d));
  const t = P.times({ y, m, d, lat: c.lat, lng: c.lng, method: c.method, asr: c.asr, ramadan: h.m === 9 });
  const local = P.localParts(Date.UTC(y, m - 1, d, 12), c.timezone);
  return { times: t, hijri: h, local };
});
process.stdout.write(JSON.stringify(out));
"""


def hhmm(ms, tz):
    return datetime.fromtimestamp(ms / 1000, ZoneInfo(tz)).strftime("%H:%M")


def minutes(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def py_times(c):
    y, m, d = map(int, c["date"].split("-"))
    h = prayer.hijri(prayer.jdn_of(y, m, d))
    return prayer.times(y, m, d, c["lat"], c["lng"], method=c["method"], asr=c["asr"], ramadan=h["m"] == 9), h


class PrayerTimes(unittest.TestCase):
    def test_python_matches_aladhan(self):
        for c in CASES:
            t, _ = py_times(c)
            for k in KEYS:
                got, want = minutes(hhmm(t[k], c["timezone"])), minutes(c["aladhan"][k])
                self.assertLessEqual(abs(got - want), 2 if k == "asr" else 1, f"{c['name']} {k}: {hhmm(t[k], c['timezone'])} vs AlAdhan {c['aladhan'][k]}")

    def test_javascript_matches_python_exactly(self):
        res = subprocess.run(["node", "-e", JS, str(ROOT / "tv-home" / "web" / "family")],
                             input=json.dumps(CASES), capture_output=True, text=True, check=True)
        js = json.loads(res.stdout)
        for c, j in zip(CASES, js):
            t, h = py_times(c)
            for k in KEYS + ("sunset",):
                self.assertEqual(j["times"][k], t[k], f"{c['name']} {k}")
            self.assertEqual((j["hijri"]["y"], j["hijri"]["m"], j["hijri"]["d"]), (h["y"], h["m"], h["d"]), c["name"])
            noon = datetime(*map(int, c["date"].split("-")), 12, tzinfo=timezone.utc).astimezone(ZoneInfo(c["timezone"]))
            self.assertEqual((j["local"]["y"], j["local"]["m"], j["local"]["d"], j["local"]["hh"]),
                             (noon.year, noon.month, noon.day, noon.hour), c["name"])

    def test_umm_al_qura_ramadan_isha_is_120_minutes(self):
        c = next(c for c in CASES if c["name"] == "Makkah Ramadan")
        t, h = py_times(c)
        self.assertEqual((h["y"], h["m"], h["d"]), (1448, 9, 15))
        self.assertEqual((t["isha"] - t["maghrib"]) // 60000, 120)

    def test_hijri_today(self):
        # 20 Nov 2026 is 10 Jumada al-Akhirah 1448 (Umm al-Qura; AlAdhan says the same)
        self.assertEqual(prayer.hijri(prayer.jdn_of(2026, 11, 20)), {"y": 1448, "m": 6, "d": 10})

    def test_country_defaults(self):
        self.assertEqual(prayer.method_for("sa"), "MAKKAH")
        self.assertEqual(prayer.method_for("AU"), "MWL")
        self.assertEqual(prayer.asr_for("PK"), "hanafi")
        self.assertEqual(prayer.asr_for("SA"), "standard")

    def test_far_north_summer_still_gives_fajr_and_isha(self):
        # Oslo on 21 June: the sun never goes 18 degrees down, so the angle based share of the night is used
        t = prayer.times(2026, 6, 21, 59.91, 10.75, method="MWL")
        self.assertIsNotNone(t["fajr"])
        self.assertIsNotNone(t["isha"])
        self.assertLess(t["fajr"], t["sunrise"])
        self.assertGreater(t["isha"], t["maghrib"])


if __name__ == "__main__":
    unittest.main()
