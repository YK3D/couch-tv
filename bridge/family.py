"""The family home's adhan on top of other apps (docs/FAMILY.md), for Samsung and LG TVs.

Neither Samsung nor LG lets an app play sound or show anything over Netflix, YouTube, Shahid or any other
app, and couch-tv's page is paused while another app is in front. So at each prayer time the bridge:

1. sees what is on screen; if the TV is off, or the family home is already in front, it does nothing
   (the home plays the adhan by itself);
2. presses Pause for the app in front (a stream pauses; live TV and inputs just carry on underneath);
3. brings the family home forward, which plays the adhan (tv-home/web/family/adhan.js);
4. when the adhan is over, or someone presses OK or Play on it, the home calls /api/family/adhan/return:
   the bridge opens the app again and, for OK and Play, presses Play.

Also /api/family/tune (Samsung, family.haram.tuner_channel): the TV's tuner is switched to the Quran
channel once after the TV comes on, because Samsung no longer lets an app change channel itself.
"""
import asyncio
import logging
import time

import config
import prayer

log = logging.getLogger("family")
HOME_PACKAGE = "app.couchtv.launcher"
KINDS = ("samsung", "lg")
STATE_FRESH = 15 * 60      # a paused show is only offered back this long after the adhan
DUE_WINDOW = 60            # seconds after the time in which the bridge still acts


def settings():
    return config.FAMILY or {}


def prayer_cfg():
    f, w = settings(), config.WEATHER
    p = f.get("prayer") or {}
    country = config.COUNTRY
    return {"lat": w["lat"], "lng": w["lon"], "timezone": config.TIMEZONE,
            "method": p.get("method") if p.get("method") not in (None, "auto") else prayer.method_for(country),
            "asr": p.get("asr") if p.get("asr") not in (None, "auto") else prayer.asr_for(country),
            "high_lat": p.get("high_lat", "angle"), "hijri_adjust": p.get("hijri_adjust", 0),
            "offsets": p.get("offsets") or {}}


def due(now_ms, done, cfg=None):
    """The prayer whose adhan is due now (within DUE_WINDOW of its time) and not yet handled, or None."""
    a = settings().get("adhan") or {}
    if not a.get("on", True):
        return None
    d = prayer.day(cfg or prayer_cfg(), now_ms)
    for name in prayer.NAMES:
        at = d["times"].get(name)
        if name == "sunrise" or not at or not (a.get("prayers") or {}).get(name, True):
            continue
        key = f"{d['date']}:{name}"
        if 0 <= now_ms - at < DUE_WINDOW * 1000 and key not in done:
            return key, name
    return None


class Adhan:
    """One TV's side of it."""

    def __init__(self, tv_id, tv):
        self.tv_id, self.tv = tv_id, tv
        self.done = set()
        self.interrupted = None     # {"package", "prayer", "at"}
        self.tuned_at = 0

    async def loop(self):
        while True:
            try:
                hit = due(time.time() * 1000, self.done)
                if hit:
                    key, name = hit
                    self.done.add(key)
                    if len(self.done) > 20:
                        self.done = {k for k in self.done if k[:10] == key[:10]}
                    await self.interrupt(name)
            except Exception as e:  # a TV that is not answering must not stop the loop
                log.warning("%s: adhan: %s", self.tv_id, e)
            await asyncio.sleep(10)

    async def interrupt(self, name):
        a = settings().get("adhan") or {}
        if not a.get("interrupt_apps", True) or self.tv.is_on() is not True:
            return
        try:
            front = await self.tv.front_package()
        except Exception:
            front = None
        if front == HOME_PACKAGE:
            return   # the home is on screen: it plays the adhan itself
        if front and any(p in front for p in a.get("never") or []):
            log.info("%s: %s is on screen and in family.adhan.never: no adhan over it", self.tv_id, front)
            return
        self.interrupted = {"package": front, "prayer": name, "at": time.time()}
        if front:
            try:
                await self.tv.key("pause")
            except Exception as e:
                log.info("%s: pause for the adhan: %s", self.tv_id, e)
            await asyncio.sleep(0.7)
        log.info("%s: %s adhan, bringing the family home forward over %s", self.tv_id, name, front or "the TV's own screen")
        await self.tv.launch_package(HOME_PACKAGE)

    def state(self):
        i = self.interrupted
        if not i or time.time() - i["at"] > STATE_FRESH or not i.get("package"):
            return None
        return {"package": i["package"], "prayer": i["prayer"]}

    async def back(self, play):
        i, self.interrupted = self.state(), None
        if not i:
            return False
        await self.tv.launch_package(i["package"])
        got = await self.tv.wait_for_app({i["package"]}, timeout=10)
        if got and play:
            await asyncio.sleep(1.5)   # the app shows its paused player first
            await self.tv.key("play")
        return bool(got)

    async def tune(self, channel):
        """Samsung: the tuner to the Quran channel (the TV's own number for it), then the home again."""
        if time.time() - self.tuned_at < 600:
            return False
        self.tuned_at = time.time()
        await self.tv.key("KEY_TV")
        await asyncio.sleep(3)
        for d in channel:
            await self.tv.key(d)
            await asyncio.sleep(0.35)
        await self.tv.key("enter")
        await asyncio.sleep(3)
        await self.tv.launch_package(HOME_PACKAGE)
        return True


CONTROLLERS = {}


def start(tvs, for_tv):
    """Called once by the bridge at start: one loop per Samsung and LG TV, when config.json has "family"."""
    if not config.FAMILY:
        return []
    tasks = []
    for tv_id, t in tvs.items():
        if getattr(t, "kind", "") not in KINDS:
            continue
        CONTROLLERS[tv_id] = Adhan(tv_id, t)
        tasks.append(for_tv(tv_id, CONTROLLERS[tv_id].loop))
    if tasks:
        log.info("family home: adhan over other apps on %s", ", ".join(CONTROLLERS))
    return tasks


def routes(r, current_tv_id, ok, ApiError, body):
    async def h_state(request):
        c = CONTROLLERS.get(current_tv_id())
        return ok(interrupted=c.state() if c else None, times=prayer.day(prayer_cfg(), time.time() * 1000)["times"]
                  if config.FAMILY else None)

    async def h_return(request):
        data = await body(request)
        c = CONTROLLERS.get(current_tv_id())
        if not c or data.get("stay"):
            if c:
                c.interrupted = None
            return ok(back=False)
        return ok(back=await c.back(bool(data.get("play"))))

    async def h_tune(request):
        c = CONTROLLERS.get(current_tv_id())
        ch = ((settings().get("haram") or {}).get("tuner_channel") or "")
        tv_ch = ""
        for t in config.TVS:
            if t["id"] == current_tv_id():
                tv_ch = (((t.get("family") or {}).get("haram") or {}).get("tuner_channel") or "")
        ch = tv_ch or ch
        if not c or getattr(c.tv, "kind", "") != "samsung" or not ch:
            # only the TV page asks this, never the phone remote, so there is no message key to translate
            raise ApiError(400, "no tuner channel for this TV (family.haram.tuner_channel)")
        return ok(tuned=await c.tune(ch))

    r.add_get("/api/family/adhan/state", h_state)
    r.add_post("/api/family/adhan/return", h_return)
    r.add_post("/api/family/tune", h_tune)
