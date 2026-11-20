"""The family home on the bridge: config.json's "family" section is checked (bridge/family_settings.py),
reaches the TV page (config.public), and the adhan pauses the app on screen, brings the home forward
and goes back to the app afterwards (bridge/family.py), with stand-in TVs.

    python3 tests/test_family_bridge.py
"""
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "bridge"))
import family_settings as fs  # noqa: E402
import prayer  # noqa: E402

GOOD = {
    "members": [{"id": "dad", "name": "Dad", "color": "#3b82f6"}, {"id": "mum", "name": "Mum <script>"}],
    "relay": {"url": "wss://couch-family.example.workers.dev", "household": "home1", "tv_key": "tv-key-123456789"},
    "adhan": {"muezzin": "alafasy", "prayers": {"asr": False}, "never": ["com.webos.app.hdmi"]},
    "haram": {"stream_url": "https://example.com/live/master.m3u8", "data_saver_minutes": 15},
}


class Settings(unittest.TestCase):
    def test_clean(self):
        c = fs.clean(GOOD)
        self.assertEqual([m["id"] for m in c["members"]], ["dad", "mum"])
        self.assertEqual(c["members"][1]["name"], "Mum script", "markup is taken out of names")
        self.assertEqual(c["members"][1]["color"], "#ec4899", "a missing colour gets the default")
        self.assertFalse(c["adhan"]["prayers"]["asr"])
        self.assertTrue(c["adhan"]["prayers"]["fajr"])
        self.assertEqual(c["haram"]["data_saver_minutes"], 15)
        self.assertEqual(c["apps"], ["youtube", "netflix", "shahid", "smarters"])
        self.assertIsNone(fs.clean(None))

    def test_the_example_file_is_valid(self):
        ex = json.loads((ROOT / "examples" / "family.config.json").read_text())
        c = fs.clean(ex["family"])
        self.assertEqual(len(c["members"]), 4)
        for t in ex["tvs"]:
            self.assertTrue(fs.clean_tv(t["family"])["haram"])

    def test_refuses(self):
        bad = [
            {"members": [{"id": "a"}] * 2},
            {"members": [{"id": f"m{i}"} for i in range(5)]},
            {"relay": {"url": "javascript:alert(1)", "household": "h", "tv_key": "x" * 20}},
            {"relay": {"url": "wss://r.example.dev", "household": "home", "tv_key": "short"}},
            {"relay": {"url": "wss://r.example.dev", "household": "home", "tv_key": "x" * 20, "draw_key": "y" * 20}},
            {"haram": {"stream_url": "file:///etc/passwd"}},
            {"haram": {"youtube": "not-an-id"}},
            {"haram": {"tuner_channel": "12; rm"}},
            {"prayer": {"method": "NOPE"}},
        ]
        for b in bad:
            with self.assertRaises(fs.FamilyError, msg=json.dumps(b)):
                fs.clean(b)

    def test_public_carries_it_to_the_tv(self):
        cfg = {"tvs": [{"id": "living", "name": "Living room", "kind": "samsung", "ip": "192.0.2.5",
                        "family": {"haram": {"samsung_tuner": True, "tuner_channel": "105"}}},
                       {"id": "majlis", "name": "Majlis", "kind": "lg", "ip": "192.0.2.6"}],
               "weather": {"lat": 24.7, "lon": 46.7, "place": "Riyadh", "timezone": "Asia/Riyadh"},
               "family": GOOD}
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "config.json")
            with open(p, "w") as f:
                json.dump(cfg, f)
            code = "import json, config; print(json.dumps(config.public()))"
            out = subprocess.run([sys.executable, "-c", code], cwd=ROOT / "bridge", capture_output=True, text=True,
                                 env={**os.environ, "COUCH_CONFIG": p, "COUCH_DATA": d})
        self.assertEqual(out.returncode, 0, out.stderr)
        pub = json.loads(out.stdout)
        self.assertEqual(pub["family"]["relay"]["household"], "home1")
        living = next(t for t in pub["tvs"] if t["id"] == "living")
        self.assertEqual(living["family"], {"haram": {"samsung_tuner": True, "tuner_channel": "105"}})
        self.assertNotIn("family", next(t for t in pub["tvs"] if t["id"] == "majlis"))


class FakeTV:
    kind = "samsung"

    def __init__(self, front="com.netflix.ninja", on=True):
        self.front, self.on, self.calls = front, on, []

    def is_on(self):
        return self.on

    async def front_package(self):
        return self.front

    async def key(self, name, hold=False):
        self.calls.append(("key", name))

    async def launch_package(self, pkg):
        self.calls.append(("launch", pkg))
        self.front = pkg

    async def wait_for_app(self, pkgs, timeout=8.0):
        return self.front if self.front in pkgs else None


class AdhanOverApps(unittest.TestCase):
    def setUp(self):
        import config
        import family
        self.family = family
        self.saved = config.FAMILY
        config.FAMILY = fs.clean(GOOD)
        family.asyncio.sleep = self._nosleep   # no real waiting in the tests

    def tearDown(self):
        import config
        config.FAMILY = self.saved
        self.family.asyncio.sleep = asyncio.sleep

    async def _nosleep(self, *_):
        return None

    def run_(self, coro):
        return asyncio.run(coro)

    def test_pauses_brings_home_and_goes_back_playing(self):
        tv = FakeTV("com.netflix.ninja")
        a = self.family.Adhan("living", tv)
        self.run_(a.interrupt("dhuhr"))
        self.assertEqual(tv.calls, [("key", "pause"), ("launch", "app.couchtv.launcher")])
        self.assertEqual(a.state(), {"package": "com.netflix.ninja", "prayer": "dhuhr"})
        tv.calls.clear()
        self.assertTrue(self.run_(a.back(play=True)))
        self.assertEqual(tv.calls, [("launch", "com.netflix.ninja"), ("key", "play")])
        self.assertIsNone(a.state(), "offered back only once")

    def test_back_without_play_leaves_it_paused(self):
        tv = FakeTV("net.mbc.shahid")
        a = self.family.Adhan("living", tv)
        self.run_(a.interrupt("maghrib"))
        tv.calls.clear()
        self.run_(a.back(play=False))
        self.assertEqual(tv.calls, [("launch", "net.mbc.shahid")])

    def test_leaves_alone(self):
        for tv in (FakeTV("app.couchtv.launcher"), FakeTV(on=False), FakeTV("com.webos.app.hdmi2")):
            a = self.family.Adhan("x", tv)
            self.run_(a.interrupt("isha"))
            self.assertEqual(tv.calls, [], tv.front)

    def test_the_tvs_own_screen_gets_the_home_without_a_pause(self):
        tv = FakeTV(None)
        a = self.family.Adhan("x", tv)
        self.run_(a.interrupt("fajr"))
        self.assertEqual(tv.calls, [("launch", "app.couchtv.launcher")])
        self.assertIsNone(a.state(), "nothing to go back to")

    def test_due(self):
        cfg = {"lat": 21.4225, "lng": 39.8262, "timezone": "Asia/Riyadh", "method": "MAKKAH", "asr": "standard"}
        t = prayer.times(2026, 11, 20, 21.4225, 39.8262, method="MAKKAH")
        self.assertEqual(self.family.due(t["dhuhr"] + 10000, set(), cfg), ("2026-11-20:dhuhr", "dhuhr"))
        self.assertIsNone(self.family.due(t["dhuhr"] + 10000, {"2026-11-20:dhuhr"}, cfg), "once a day")
        self.assertIsNone(self.family.due(t["dhuhr"] + 120000, set(), cfg), "too late")
        self.assertIsNone(self.family.due(t["asr"] + 5000, set(), cfg), "Asr is switched off in GOOD")
        self.assertIsNone(self.family.due(t["sunrise"] + 5000, set(), cfg), "no adhan at sunrise")

    def test_tune_types_the_channel(self):
        tv = FakeTV("x")
        a = self.family.Adhan("living", tv)
        self.assertTrue(self.run_(a.tune("105")))
        self.assertEqual(tv.calls, [("key", "KEY_TV"), ("key", "1"), ("key", "0"), ("key", "5"), ("key", "enter"),
                                    ("launch", "app.couchtv.launcher")])
        self.assertFalse(self.run_(a.tune("105")), "not again within ten minutes")


if __name__ == "__main__":
    unittest.main()
