"""Get the adhan recordings for the family home, levelled to the same loudness, for your own use at home.

    python3 scripts/get-adhan.py                       download every recording in family/adhan/list.js
    python3 scripts/get-adhan.py --only alafasy,nafees just these
    python3 scripts/get-adhan.py --add makkah ~/Downloads/makkah.mp3 --name "Makkah" --name-ar "الحرم المكي" \\
                                 [--fajr ~/Downloads/makkah-fajr.mp3]
                                                       one of your own (a Fajr recording too, if you have one)
    python3 scripts/get-adhan.py --list                what this computer has

Files go to tv-home/web/family/adhan/mine/ (git ignored: they are not ours to hand out) with have.js, which
tells the home which ones it has. Build the TV app again afterwards (samsung/build.py, lg/build.py) so
they are on the TV: the adhan must play even when the internet is down.

"Matches the TV's volume": the TV's own volume sets how loud the adhan is, like any other sound on it. What
this levels is the recordings themselves, which come mastered far louder than TV (AlAdhan's measured -10.5
to -16 LUFS on 20 Nov 2026; TV programmes are made to -23 LUFS, EBU R128). With ffmpeg on this computer each
is measured and set to -23 LUFS with one steady gain, so the adhan is about as loud as the programme it
interrupts and changing the muezzin never makes it suddenly louder. Without ffmpeg the files are kept as
they are, and it says so.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "tv-home", "web", "family", "adhan")
MINE = os.path.join(DIR, "mine")
ID = re.compile(r"^[a-z0-9-]{2,32}$")


def catalogue():
    """The recordings list.js names: [{id, name, url}]."""
    with open(os.path.join(DIR, "list.js"), encoding="utf-8") as f:
        text = f.read()
    out = []
    for m in re.finditer(r'\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)".*?url:\s*"([^"]+)"', text, re.S):
        out.append({"id": m.group(1), "name": m.group(2), "url": m.group(3)})
    return out


TARGET = -23.0   # LUFS: EBU R128, the loudness TV programmes are made to


def measure(src):
    """(integrated loudness in LUFS, true peak in dBTP) from ffmpeg's loudnorm, which only listens here."""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr
    j = json.loads(out[out.rindex("{"):out.rindex("}") + 1])
    return float(j["input_i"]), float(j["input_tp"])


def level(src, dst, target=None):
    """src -> dst as a 96 kbit/s stereo MP3 at the target loudness; a plain copy without ffmpeg. True if levelled.
    One steady gain for the whole recording (measured, then set), so the adhan keeps its own rise and fall; a
    limiter catches any peak the gain would push past -1 dBTP. It stays stereo: one of AlAdhan's recordings
    has its two channels partly out of phase, and folded to mono it lost 14 dB."""
    if not shutil.which("ffmpeg"):
        shutil.copyfile(src, dst)
        return False
    target = TARGET if target is None else target
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "a.wav")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-ac", "2", "-ar", "44100", wav], check=True)
        loud, peak = measure(wav)
        gain = target - loud
        chain = f"volume={gain:.2f}dB"
        if peak + gain > -1.0:
            chain += ",alimiter=limit=0.891:attack=5:release=80:level=false"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-af", chain, "-b:a", "96k", dst], check=True)
    return True


def download(url, dst):
    req = urllib.request.Request(url, headers={"User-Agent": "couch-tv family home (personal use)"})
    with urllib.request.urlopen(req, timeout=60) as r, open(dst, "wb") as f:
        shutil.copyfileobj(r, f)
    if os.path.getsize(dst) < 20000:
        raise RuntimeError(f"{url} gave only {os.path.getsize(dst)} bytes")


def extras():
    try:
        with open(os.path.join(MINE, "extra.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def write_have():
    have = sorted(n[:-4] for n in os.listdir(MINE) if n.endswith(".mp3") and not n.endswith("-fajr.mp3"))
    extra = extras()
    with open(os.path.join(MINE, "have.js"), "w", encoding="utf-8") as f:
        f.write("// Written by scripts/get-adhan.py: the recordings on this computer (and your own, with --add).\n")
        f.write("window.FH_ADHANS_HAVE = " + json.dumps(have) + ";\n")
        f.write("window.FH_ADHANS_EXTRA = " + json.dumps(extra, ensure_ascii=False) + ";\n")
    return have, extra


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="comma separated ids from list.js")
    ap.add_argument("--add", nargs=2, metavar=("ID", "FILE"), help="your own recording: an id (a-z, 0-9, -) and the file")
    ap.add_argument("--fajr", default="", help="with --add: the Fajr recording (with as-salatu khayrun min an-nawm)")
    ap.add_argument("--name", default="", help="with --add: the muezzin's name")
    ap.add_argument("--name-ar", default="", help="with --add: the name in Arabic")
    ap.add_argument("--list", action="store_true", help="show what this computer has")
    a = ap.parse_args()
    os.makedirs(MINE, exist_ok=True)

    if a.list:
        have, extra = write_have()
        print("on this computer:", ", ".join(have) or "nothing yet")
        return

    if a.add:
        rid, src = a.add
        if not ID.match(rid):
            raise SystemExit("the id: 2 to 32 small letters, digits or -")
        if not os.path.isfile(src):
            raise SystemExit(f"no file at {src}")
        lev = level(src, os.path.join(MINE, rid + ".mp3"))
        entry = {"id": rid, "name": a.name or rid, "name_ar": a.name_ar or "", "file": f"adhan/mine/{rid}.mp3", "mine": True}
        if a.fajr:
            level(a.fajr, os.path.join(MINE, rid + "-fajr.mp3"))
            entry["fajr_file"] = f"adhan/mine/{rid}-fajr.mp3"
        ex = [e for e in extras() if e.get("id") != rid] + [entry]
        with open(os.path.join(MINE, "extra.json"), "w", encoding="utf-8") as f:
            json.dump(ex, f, ensure_ascii=False, indent=1)
        write_have()
        print(f"added {rid}" + (" (levelled)" if lev else " (kept as it is: install ffmpeg to level it)"))
        return

    want = [x for x in a.only.split(",") if x] if a.only else None
    items = [c for c in catalogue() if want is None or c["id"] in want]
    if want and len(items) != len(want):
        raise SystemExit("unknown id; the ones in list.js: " + ", ".join(c["id"] for c in catalogue()))
    levelled_any = False
    with tempfile.TemporaryDirectory() as tmp:
        for c in items:
            raw = os.path.join(tmp, c["id"] + ".raw")
            print(f"{c['name']}: downloading", end="", flush=True)
            try:
                download(c["url"], raw)
            except Exception as e:  # one missing file must not stop the rest
                print(f" ... failed ({e})")
                continue
            levelled_any |= level(raw, os.path.join(MINE, c["id"] + ".mp3"))
            print(" ... done")
    have, _ = write_have()
    print(f"{len(have)} recordings in tv-home/web/family/adhan/mine/. Build the TV app again to put them on the TV.")
    if not levelled_any and items:
        print("ffmpeg is not on this computer, so the recordings were not levelled (some will be louder than others).",
              file=sys.stderr)


if __name__ == "__main__":
    main()
