"""The "family" section of config.json (docs/FAMILY.md), cleaned: what the family home on the TV and
bridge/family.py read. Nothing here talks to anything; config.py calls clean() once at start.

Unknown keys are dropped and every value is checked, so a typo in config.json cannot reach the TV page
as script or as a broken setting. Without a "family" section the family home is off and nothing changes.
"""
import re

ID = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
URL = re.compile(r"^https?://[^\s\"'<>]{3,400}$")
WS_URL = re.compile(r"^(wss?|https?)://[^\s\"'<>/]{3,200}/?$")
KEY = re.compile(r"^[A-Za-z0-9_-]{12,128}$")
YT = re.compile(r"^[A-Za-z0-9_-]{11}$")
METHODS = ("auto", "MWL", "ISNA", "EGYPT", "MAKKAH", "KARACHI", "TEHRAN", "GULF", "KUWAIT", "QATAR", "SINGAPORE",
           "FRANCE", "TURKEY", "RUSSIA", "DUBAI", "JAKIM", "TUNISIA", "ALGERIA", "KEMENAG", "MOROCCO", "PORTUGAL", "JORDAN")
PRAYERS = ("fajr", "dhuhr", "asr", "maghrib", "isha")
SOURCES = ("auto", "tuner", "dish", "stream", "youtube", "none")
DEFAULT_COLORS = ("#3b82f6", "#ec4899", "#10b981", "#f59e0b")


class FamilyError(ValueError):
    pass


def _text(v, n=40):
    return re.sub(r"[\x00-\x1f<>]", "", str(v)).strip()[:n] if isinstance(v, str) else ""


def _int(v, lo, hi, d):
    return v if isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi else d


def _bool(v, d):
    return v if isinstance(v, bool) else d


def _members(raw):
    if raw is None:
        return [{"id": f"m{i + 1}", "name": f"Board {i + 1}", "color": DEFAULT_COLORS[i]} for i in range(4)]
    if not isinstance(raw, list) or not 1 <= len(raw) <= 4:
        raise FamilyError("family.members: a list of 1 to 4 people")
    out, seen = [], set()
    for i, m in enumerate(raw):
        if not isinstance(m, dict) or not ID.match(str(m.get("id", ""))) or m["id"] in seen:
            raise FamilyError(f"family.members[{i}]: needs a unique id (letters, digits, - or _)")
        seen.add(m["id"])
        out.append({"id": m["id"], "name": _text(m.get("name")) or m["id"],
                    "color": m.get("color") if COLOR.match(str(m.get("color", ""))) else DEFAULT_COLORS[i]})
    return out


def _relay(raw):
    raw = raw if isinstance(raw, dict) else {}
    url = str(raw.get("url") or "")
    out = {"url": "", "household": "", "tv_key": ""}
    if not url:
        return out
    if not WS_URL.match(url):
        raise FamilyError("family.relay.url: the relay's address, for example wss://couch-family.you.workers.dev")
    if not ID.match(str(raw.get("household") or "")):
        raise FamilyError("family.relay.household: letters, digits, - or _ (up to 32)")
    if not KEY.match(str(raw.get("tv_key") or "")):
        raise FamilyError("family.relay.tv_key: 12 to 128 letters, digits, - or _ (the relay's TV_KEY)")
    # the draw key never goes in config.json: only the phones have it (in their family link)
    if raw.get("draw_key"):
        raise FamilyError("family.relay.draw_key: leave it out of config.json; it lives only in the phones' family link")
    return {"url": url.rstrip("/"), "household": raw["household"], "tv_key": raw["tv_key"]}


def _prayer(raw):
    raw = raw if isinstance(raw, dict) else {}
    method = raw.get("method", "auto")
    if method not in METHODS:
        raise FamilyError(f"family.prayer.method: one of {', '.join(METHODS)}")
    asr = raw.get("asr", "auto")
    if asr not in ("auto", "standard", "hanafi"):
        raise FamilyError("family.prayer.asr: auto, standard or hanafi")
    offsets = {}
    for k, v in (raw.get("offsets") or {}).items():
        if k in PRAYERS + ("sunrise",) and isinstance(v, (int, float)) and not isinstance(v, bool) and -30 <= v <= 30:
            offsets[k] = v
    return {"method": method, "asr": asr,
            "high_lat": raw.get("high_lat") if raw.get("high_lat") in ("angle", "middle", "seventh", "none") else "angle",
            "hijri_adjust": _int(raw.get("hijri_adjust"), -2, 2, 0), "offsets": offsets}


def _adhan(raw):
    raw = raw if isinstance(raw, dict) else {}
    prayers = raw.get("prayers") if isinstance(raw.get("prayers"), dict) else {}
    never = [p for p in (raw.get("never") or []) if isinstance(p, str) and re.match(r"^[A-Za-z0-9._-]{2,80}$", p)]
    return {"on": _bool(raw.get("on"), True),
            "muezzin": raw.get("muezzin") if ID.match(str(raw.get("muezzin") or "")) else "",
            "fajr_muezzin": raw.get("fajr_muezzin") if ID.match(str(raw.get("fajr_muezzin") or "")) else "",
            "volume": _int(raw.get("volume"), 10, 100, 100), "fajr_volume": _int(raw.get("fajr_volume"), 10, 100, 70),
            "prayers": {p: _bool(prayers.get(p), True) for p in PRAYERS},
            "interrupt_apps": _bool(raw.get("interrupt_apps"), True), "never": never[:20],
            "dua": _bool(raw.get("dua"), True), "return_after": _bool(raw.get("return_after"), True)}


def _haram(raw):
    raw = raw if isinstance(raw, dict) else {}
    source = raw.get("source", "auto")
    if source not in SOURCES:
        raise FamilyError(f"family.haram.source: one of {', '.join(SOURCES)}")
    out = {"source": source, "samsung_tuner": _bool(raw.get("samsung_tuner"), False),
           "tuner_channel": "", "stream_url": "", "dish_url": "", "youtube": "",
           "data_saver_minutes": _int(raw.get("data_saver_minutes"), 0, 240, 20), "muted": _bool(raw.get("muted"), False)}
    ch = str(raw.get("tuner_channel") or "")
    if ch:
        if not re.match(r"^\d{1,5}$", ch):
            raise FamilyError("family.haram.tuner_channel: the channel number on this TV, digits only")
        out["tuner_channel"] = ch
    for k in ("stream_url", "dish_url"):
        v = str(raw.get(k) or "")
        if v:
            if not URL.match(v):
                raise FamilyError(f"family.haram.{k}: an http or https address")
            out[k] = v
    yt = str(raw.get("youtube") or "")
    if yt:
        if not YT.match(yt):
            raise FamilyError("family.haram.youtube: the 11 character video id of the live stream")
        out["youtube"] = yt
    return out


def clean(raw):
    """config.json's "family" -> the cleaned settings, or None when there is no family section."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise FamilyError("family: an object, see docs/FAMILY.md")
    apps = [a for a in (raw.get("apps") or ["youtube", "netflix", "shahid", "smarters"])
            if isinstance(a, str) and 1 <= len(a) <= 40][:4]
    return {
        "members": _members(raw.get("members")),
        "language": raw.get("language") if raw.get("language") in ("en", "ar") else "",
        "clock_24h": raw.get("clock_24h") if isinstance(raw.get("clock_24h"), bool) else None,
        "relay": _relay(raw.get("relay")),
        "prayer": _prayer(raw.get("prayer")),
        "adhan": _adhan(raw.get("adhan")),
        "haram": _haram(raw.get("haram")),
        "apps": [_text(a) for a in apps],
        "background": raw.get("background") if raw.get("background") in ("mountain", "volcano", "hills") else "mountain",
        "speed": raw.get("speed") if raw.get("speed") in ("auto", "lite", "full") else "auto",
    }


def clean_tv(raw):
    """A TV's own "family" overrides in tvs[] (only the live picture differs between TVs)."""
    if not isinstance(raw, dict):
        return None
    out = {}
    if "haram" in raw:
        h = _haram(raw["haram"])
        out["haram"] = {k: v for k, v in h.items() if k in raw["haram"]}
    return out or None
