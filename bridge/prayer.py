"""Prayer times and the Hijri date for the family home's adhan (docs/FAMILY.md).

The same sums as tv-home/web/family/prayer.js, so the bridge and the TV agree to the minute on when
each adhan is due (tests/test_family_prayer.py checks both against each other and against AlAdhan's
published times). The angles are AlAdhan's for each method (api.aladhan.com/v1/methods, checked
20 Nov 2026). Everything is UTC instants; the home's zone only says which day it is.
"""
import json
import math
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))

METHODS = {
    "MWL": {"name": "Muslim World League", "fajr": 18, "isha": 17},
    "ISNA": {"name": "Islamic Society of North America", "fajr": 15, "isha": 15},
    "EGYPT": {"name": "Egyptian General Authority of Survey", "fajr": 19.5, "isha": 17.5},
    "MAKKAH": {"name": "Umm al-Qura, Makkah", "fajr": 18.5, "ishaMin": 90, "ramadanIshaMin": 120},
    "KARACHI": {"name": "University of Islamic Sciences, Karachi", "fajr": 18, "isha": 18},
    "TEHRAN": {"name": "Institute of Geophysics, Tehran", "fajr": 17.7, "isha": 14, "maghribAngle": 4.5},
    "GULF": {"name": "Gulf Region", "fajr": 19.5, "ishaMin": 90},
    "KUWAIT": {"name": "Kuwait", "fajr": 18, "isha": 17.5},
    "QATAR": {"name": "Qatar", "fajr": 18, "ishaMin": 90},
    "SINGAPORE": {"name": "Majlis Ugama Islam Singapura", "fajr": 20, "isha": 18},
    "FRANCE": {"name": "Union des Organisations Islamiques de France", "fajr": 12, "isha": 12},
    "TURKEY": {"name": "Diyanet, Turkey", "fajr": 18, "isha": 17},
    "RUSSIA": {"name": "Spiritual Administration of Muslims of Russia", "fajr": 16, "isha": 15},
    "DUBAI": {"name": "Dubai", "fajr": 18.2, "isha": 18.2, "tune": {"dhuhr": 3, "maghrib": 3}},
    "JAKIM": {"name": "JAKIM, Malaysia", "fajr": 20, "isha": 18},
    "TUNISIA": {"name": "Tunisia", "fajr": 18, "isha": 18},
    "ALGERIA": {"name": "Algeria", "fajr": 18, "isha": 17},
    "KEMENAG": {"name": "Kemenag, Indonesia", "fajr": 20, "isha": 18},
    "MOROCCO": {"name": "Morocco", "fajr": 19, "isha": 17},
    "PORTUGAL": {"name": "Comunidade Islamica de Lisboa", "fajr": 18, "maghribMin": 3, "ishaMin": 77},
    "JORDAN": {"name": "Awqaf, Jordan", "fajr": 18, "maghribMin": 5, "isha": 18},
}

BY_COUNTRY = {
    "SA": "MAKKAH", "YE": "MAKKAH", "AE": "DUBAI", "KW": "KUWAIT", "QA": "QATAR", "BH": "GULF", "OM": "GULF",
    "EG": "EGYPT", "SD": "EGYPT", "LY": "EGYPT", "SY": "EGYPT", "LB": "EGYPT", "IQ": "EGYPT", "PS": "EGYPT",
    "JO": "JORDAN", "TR": "TURKEY", "DZ": "ALGERIA", "TN": "TUNISIA", "MA": "MOROCCO", "PK": "KARACHI",
    "IN": "KARACHI", "BD": "KARACHI", "AF": "KARACHI", "MY": "JAKIM", "SG": "SINGAPORE", "BN": "SINGAPORE",
    "ID": "KEMENAG", "FR": "FRANCE", "RU": "RUSSIA", "US": "ISNA", "CA": "ISNA", "PT": "PORTUGAL", "IR": "TEHRAN",
}
HANAFI = {"PK", "IN", "BD", "AF"}
NAMES = ("fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha")


def method_for(country):
    return BY_COUNTRY.get(str(country or "").upper(), "MWL")


def asr_for(country):
    return "hanafi" if str(country or "").upper() in HANAFI else "standard"


def _fix(a, b):
    a = a - b * math.floor(a / b)
    return a + b if a < 0 else a


def _sin(d): return math.sin(math.radians(d))
def _cos(d): return math.cos(math.radians(d))
def _tan(d): return math.tan(math.radians(d))
def _asin(x): return math.degrees(math.asin(x))
def _acos(x): return math.degrees(math.acos(x))
def _atan2(y, x): return math.degrees(math.atan2(y, x))
def _acot(x): return math.degrees(math.atan(1 / x))


def julian(y, m, d):
    if m <= 2:
        y -= 1
        m += 12
    a = math.floor(y / 100)
    b = 2 - a + math.floor(a / 4)
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + d + b - 1524.5


def _sun(jd):
    D = jd - 2451545.0
    g = _fix(357.529 + 0.98560028 * D, 360)
    q = _fix(280.459 + 0.98564736 * D, 360)
    L = _fix(q + 1.915 * _sin(g) + 0.020 * _sin(2 * g), 360)
    e = 23.439 - 0.00000036 * D
    ra = _atan2(_cos(e) * _sin(L), _cos(L)) / 15
    return _asin(_sin(e) * _sin(L)), q / 15 - _fix(ra, 24)


def times(y, m, d, lat, lng, method="MWL", asr="standard", elevation=0, high_lat="angle",
          ramadan=False, offsets=None):
    """The day's prayers as UTC milliseconds (None where the sun never gets there)."""
    meth = METHODS.get(method) or METHODS["MWL"]
    lat, lng = float(lat), float(lng)
    jd0 = julian(y, m, d) - lng / (15 * 24)
    factor = 2 if asr == "hanafi" else 1
    rise_set = 0.833 + 0.0347 * math.sqrt(max(0.0, float(elevation or 0)))

    def noon(t):
        return _fix(12 - _sun(jd0 + t / 24)[1], 24)

    def at(angle, t, before):
        decl, eqt = _sun(jd0 + t / 24)
        c = (-_sin(angle) - _sin(decl) * _sin(lat)) / (_cos(decl) * _cos(lat))
        if c > 1 or c < -1:
            return math.nan
        T = _acos(c) / 15
        n = _fix(12 - eqt, 24)
        return n - T if before else n + T

    def asr_at(t):
        decl, _ = _sun(jd0 + t / 24)
        return at(-_acot(factor + _tan(abs(lat - decl))), t, False)

    def f(v, dflt):
        return dflt if math.isnan(v) else v

    t = {"fajr": 5.0, "sunrise": 6.0, "dhuhr": 12.0, "asr": 13.0, "sunset": 18.0, "maghrib": 18.0, "isha": 18.0}
    for _ in range(2):
        t = {
            "fajr": at(meth["fajr"], f(t["fajr"], 5), True),
            "sunrise": at(rise_set, f(t["sunrise"], 6), True),
            "dhuhr": noon(f(t["dhuhr"], 12)),
            "asr": asr_at(f(t["asr"], 13)),
            "sunset": at(rise_set, f(t["sunset"], 18), False),
            "maghrib": at(meth["maghribAngle"], f(t["maghrib"], 18), False) if meth.get("maghribAngle")
            else at(rise_set, f(t["maghrib"], 18), False),
            "isha": at(meth["isha"], f(t["isha"], 18), False) if meth.get("isha")
            else at(rise_set, f(t["isha"], 18), False),
        }
    if not meth.get("maghribAngle"):
        t["maghrib"] = t["sunset"] + (meth.get("maghribMin") or 0) / 60
    if not meth.get("isha"):
        t["isha"] = t["maghrib"] + ((ramadan and meth.get("ramadanIshaMin")) or meth.get("ishaMin") or 90) / 60

    if high_lat != "none" and not math.isnan(t["sunrise"]) and not math.isnan(t["sunset"]):
        night = _fix(t["sunrise"] - t["sunset"], 24)

        def share(angle):
            if high_lat == "middle":
                return night / 2
            if high_lat == "seventh":
                return night / 7
            return angle / 60 * night
        fp = share(meth["fajr"])
        if math.isnan(t["fajr"]) or _fix(t["sunrise"] - t["fajr"], 24) > fp:
            t["fajr"] = t["sunrise"] - fp
        if meth.get("isha"):
            ip = share(meth["isha"])
            if math.isnan(t["isha"]) or _fix(t["isha"] - t["sunset"], 24) > ip:
                t["isha"] = t["sunset"] + ip

    base = datetime(y, m, d, tzinfo=timezone.utc).timestamp() * 1000
    # the method's own minutes (Dubai's, as AlAdhan publishes them), then the home's own offsets
    off = dict(meth.get("tune") or {})
    for k, v in (offsets or {}).items():
        off[k] = float(off.get(k) or 0) + float(v or 0)
    out = {}
    for k, v in t.items():
        if math.isnan(v):
            out[k] = None
            continue
        ms = base + (v - lng / 15) * 3600000 + float(off.get(k) or 0) * 60000
        # nearest minute, halves up, the same as JavaScript's Math.round
        out[k] = int(math.floor(ms / 60000 + 0.5)) * 60000
    return out


# ---------- Hijri (Umm al-Qura, the table tv-home/tools/make-hijri-table.mjs writes) ----------
_TABLE = None


def _table():
    global _TABLE
    if _TABLE is None:
        try:
            with open(os.path.join(HERE, "hijri_table.json")) as fh:
                _TABLE = json.load(fh)["years"]
        except (OSError, ValueError, KeyError):
            _TABLE = []
    return _TABLE


def jdn_of(y, m, d):
    return math.floor(julian(y, m, d) + 0.5)


def hijri(jdn, adjust=0):
    jdn += int(adjust or 0)
    rows = _table()
    for i in range(len(rows) - 1, -1, -1):
        if rows[i][1] <= jdn:
            if i == len(rows) - 1 and jdn - rows[i][1] > 355:
                break
            day = jdn - rows[i][1]
            for mo in range(12):
                length = 30 if (rows[i][2] >> mo) & 1 else 29
                if day < length:
                    return {"y": rows[i][0], "m": mo + 1, "d": day + 1}
                day -= length
            break
    # arithmetic calendar outside the table
    l = jdn - 1948440 + 10632
    n = (l - 1) // 10631
    l = l - 10631 * n + 354
    j = ((10985 - l) // 5316) * ((50 * l) // 17719) + (l // 5670) * ((43 * l) // 15238)
    l = l - ((30 - j) // 15) * ((17719 * j) // 50) - (j // 16) * ((15238 * j) // 43) + 29
    hm = (24 * l) // 709
    hd = l - (709 * hm) // 24
    return {"y": 30 * n + j - 30, "m": hm, "d": hd}


def day(cfg, now_ms):
    """The home's prayers for the day `now_ms` falls on in cfg["timezone"]: {date, hijri, times}."""
    tz = ZoneInfo(cfg.get("timezone") or "UTC")
    local = datetime.fromtimestamp(now_ms / 1000, tz)
    h = hijri(jdn_of(local.year, local.month, local.day), cfg.get("hijri_adjust", 0))
    t = times(local.year, local.month, local.day, cfg["lat"], cfg["lng"], method=cfg.get("method", "MWL"),
              asr=cfg.get("asr", "standard"), elevation=cfg.get("elevation", 0),
              high_lat=cfg.get("high_lat", "angle"), ramadan=h["m"] == 9, offsets=cfg.get("offsets"))
    return {"date": local.date().isoformat(), "hijri": h, "times": t}
