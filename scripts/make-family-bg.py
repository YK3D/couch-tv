"""Make the family home's backgrounds: one picture, five times of day, already blurred.

    python3 scripts/make-family-bg.py            (the three built-in scenes)
    python3 scripts/make-family-bg.py --from my-photo.jpg --name mine

The TV never blurs anything itself (a full-screen CSS blur made a 2022 Samsung freeze, #53): each copy
is blurred and colour-graded here, saved small (960x540; a blur needs no more), and the home fades
between them as the sun moves (night, dawn, day, golden hour, dusk). Writes
tv-home/web/family/bg/<name>-<phase>.jpg. Needs Pillow (bridge/requirements.txt has it).
The built-in scenes are couch-tv's own (tv-home/web/backgrounds/CREDITS.md).
"""
import argparse
import os

from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, "tv-home", "web", "backgrounds")
OUT = os.path.join(ROOT, "tv-home", "web", "family", "bg")
SCENES = {"mountain": "scene-night.jpg", "volcano": "scene-golden.jpg", "hills": "scene-dawn.jpg"}

# per time of day: brightness, colour (saturation), each channel's multiplier, and a sky tint from the top
PHASES = {
    "night": {"bright": 0.42, "sat": 0.55, "mul": (0.70, 0.82, 1.18), "tint": (20, 30, 70), "tint_a": 0.42},
    "dawn": {"bright": 0.86, "sat": 0.95, "mul": (1.10, 0.94, 0.96), "tint": (255, 170, 150), "tint_a": 0.26},
    "day": {"bright": 1.02, "sat": 1.05, "mul": (0.96, 1.00, 1.06), "tint": (150, 200, 255), "tint_a": 0.16},
    "golden": {"bright": 0.92, "sat": 1.15, "mul": (1.18, 0.98, 0.78), "tint": (255, 160, 70), "tint_a": 0.30},
    "dusk": {"bright": 0.64, "sat": 0.85, "mul": (0.98, 0.80, 1.08), "tint": (120, 60, 140), "tint_a": 0.36},
}


def grade(img, p):
    img = ImageEnhance.Brightness(img).enhance(p["bright"])
    img = ImageEnhance.Color(img).enhance(p["sat"])
    r, g, b = img.split()
    mr, mg, mb = p["mul"]
    img = Image.merge("RGB", (r.point(lambda v: min(255, int(v * mr))),
                              g.point(lambda v: min(255, int(v * mg))),
                              b.point(lambda v: min(255, int(v * mb)))))
    # a wash of the sky's colour, strongest at the top
    w, h = img.size
    tint = Image.new("RGB", (w, h), p["tint"])
    mask = Image.linear_gradient("L").resize((w, h)).point(lambda v: int((255 - v) * p["tint_a"]))
    return Image.composite(tint, img, mask)


def make(src, name):
    os.makedirs(OUT, exist_ok=True)
    base = Image.open(src).convert("RGB").resize((960, 540), Image.LANCZOS)
    blurred = base.filter(ImageFilter.GaussianBlur(14))
    for phase, p in PHASES.items():
        out = os.path.join(OUT, f"{name}-{phase}.jpg")
        grade(blurred, p).save(out, "JPEG", quality=80, optimize=True, progressive=True)
        print(f"wrote {os.path.relpath(out, ROOT)} ({os.path.getsize(out) // 1024} KB)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--from", dest="src", help="your own photo (it stays on this computer)")
    ap.add_argument("--name", default="mine", help="the background's name in Home settings (with --from)")
    a = ap.parse_args()
    if a.src:
        make(a.src, a.name)
        return
    for name, file in SCENES.items():
        make(os.path.join(BG, file), name)


if __name__ == "__main__":
    main()
