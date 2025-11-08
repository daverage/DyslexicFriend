#!/usr/bin/env python3
"""
EasyType Sans – Static + Variable Builder
=========================================
Creates:
  • build/EasyTypeSans.ttf          (Regular static, FLOW=1)
  • build/EasyTypeSans-Bold.ttf     (Bold static,   FLOW=1)
  • build/EasyTypeSans-VF.ttf       (Variable: wght 400–700, FLOW 0–1)
  • build/demo.html                 (Static demo)

Requirements:
    pip install fonttools requests
    (optional) brew install ttfautohint
"""

import os, requests, subprocess, platform, shutil, unicodedata, textwrap
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
from fontTools.varLib import build as varLib_build

# ------------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------------

OUT_DIR = "build"
os.makedirs(OUT_DIR, exist_ok=True)

URL_BASE = "https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/"
REGULAR_TTF_NAME = "NotoSans-Regular.ttf"
BOLD_TTF_NAME    = "NotoSans-Bold.ttf"

EASYTYPE_REG = os.path.join(OUT_DIR, "EasyTypeSans.ttf")
EASYTYPE_BLD = os.path.join(OUT_DIR, "EasyTypeSans-Bold.ttf")
EASYTYPE_VF  = os.path.join(OUT_DIR, "EasyTypeSans-VF.ttf")

# Entry anchoring
ENTRY_BAND_DEFAULT    = 0.3   # leftmost 30% of glyph width affected
ENTRY_GLOBAL_STRENGTH = 0.7   # overall scaler

# Comfort spacing
COMFORT_SPACING_FACTOR = 1.14

# Micro spacing tweaks (in em fraction)
MICRO_SPACING_EM = {
    "m": +0.010, "w": +0.009, "M": +0.012, "W": +0.012,
    "g": +0.008, "G": +0.010, "Q": +0.010, "8": +0.010, "0": +0.006,
    "n": +0.006, "h": +0.006, "u": +0.006, "r": +0.004, "b": -0.06,
    "p": +0.004, "q": +0.004,
    # tighten around o/O instead of widening
    "o": -0.002,
    "O": -0.009,

    "e": -0.0, "a": +0.004, "s": +0.004,
    "i": -0.005, "l": -0.006, "I": -0.006, "1": -0.006, "|": -0.006,
    "t": -0.004, "f": -0.003, "j": -0.003, ":": -0.003, ";": -0.003,
    "L": -0.07,
}

# Per-shape anchoring strength
ANCHOR_SHAPES = {
    # lowercase
    "a": 0.35,
    "b": 0.18,
    "c": 0.40,
    "d": 0.27,
    "e": 0.38,
    "f": 0.14,
    "g": 0.30,
    "h": 0.18,
    "i": 0.10,
    "j": 0.12,
    "k": 0.14,
    "l": 0.10,
    "m": 0.22,
    "n": 0.20,
    "o": 0.36,
    "p": 0.27,
    "q": 0.27,
    "r": 0.20,
    "s": 0.28,
    "t": 0.18,
    "u": 0.25,
    "v": 0.16,
    "w": 0.18,
    "x": 0.12,
    "y": 0.18,
    "z": 0.14,

    # uppercase (generally milder)
    "A": 0.10,  # keep visually neutral
    "B": 0.26,
    "C": 0.28,
    "D": 0.26,
    "E": 0.28,
    "F": 0.26,
    "G": 0.28,
    "H": 0.24,
    "I": 0.00,  # vertical, no anchoring
    "J": 0.26,
    "K": 0.26,
    "L": 0.28,
    "M": 0.26,
    "N": 0.26,
    "O": 0.28,
    "P": 0.26,
    "Q": 0.28,
    "R": 0.26,
    "S": 0.28,
    "T": 0.24,
    "U": 0.26,
    "V": 0.22,
    "W": 0.24,
    "X": 0.20,
    "Y": 0.22,
    "Z": 0.20,
}

VERSION_STR = "Version 1.200; OFLO"

# ------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------

def get_base_letter(ch: str) -> str:
    """Return a lowercase 'base' letter for a character, e.g. 'á' -> 'a'."""
    decomp = unicodedata.normalize("NFD", ch)
    for c in decomp:
        if c.isalpha():
            return c.lower()
    return ch.lower()

def download_font(ttf_name: str) -> str:
    url = URL_BASE + ttf_name
    dest = os.path.join(OUT_DIR, ttf_name)
    if not os.path.exists(dest):
        print(f"→ Downloading {ttf_name}")
        r = requests.get(url)
        r.raise_for_status()
        with open(dest, "wb") as f:
            f.write(r.content)
    else:
        print(f"✓ {ttf_name} already exists")
    return dest

def set_glyph_coordinates(glyph, coords, endPts, flags):
    if len(coords) != len(flags):
        if len(coords) > len(flags):
            flags = list(flags) + [flags[-1]] * (len(coords) - len(flags))
        else:
            flags = list(flags)[:len(coords)]
    glyph.coordinates = GlyphCoordinates(coords)
    glyph.endPtsOfContours = endPts
    glyph.flags = flags

# ------------------------------------------------------------------
# FONT MODS (FLOW = 1 master behaviour)
# ------------------------------------------------------------------

def apply_optical_anchoring(tt, entry_band=ENTRY_BAND_DEFAULT,
                            global_strength=ENTRY_GLOBAL_STRENGTH):
    """
    Entry-anchoring for selected glyphs, including accented forms.

    Priority:
      1) If the exact character (ch) is in ANCHOR_SHAPES, use that value.
      2) Else, look up base letter (á -> a, Ç -> c) in ANCHOR_SHAPES.
    """
    if "glyf" not in tt:
        raise RuntimeError("Font has no glyf table.")

    glyf = tt["glyf"]
    cmap = tt.getBestCmap() or {}
    glyph_strength = {}

    for code, gname in cmap.items():
        ch = chr(code)
        base = get_base_letter(ch)

        strength_key = None
        if ch in ANCHOR_SHAPES:
            strength_key = ch
        elif base in ANCHOR_SHAPES:
            strength_key = base

        if not strength_key:
            continue

        glyph_strength[gname] = ANCHOR_SHAPES[strength_key] * global_strength

    for gname, strength in glyph_strength.items():
        g = glyf[gname]
        if getattr(g, "isComposite", lambda: True)():
            continue
        if not hasattr(g, "getCoordinates"):
            continue

        try:
            coords, endPts, flags = g.getCoordinates(glyf)
        except Exception:
            continue
        if not coords:
            continue

        x_min = min(x for x, _ in coords)
        x_max = max(x for x, _ in coords)
        width = x_max - x_min or 1

        new_coords = []
        for x, y in coords:
            ratio = (x - x_min) / width  # 0 = left, 1 = right
            if ratio <= entry_band:
                t = 1.0 - (ratio / entry_band)
                x2 = x - strength * t * width
            else:
                x2 = x
            new_coords.append((int(x2), int(y)))

        set_glyph_coordinates(g, new_coords, endPts, flags)

    print(f"✓ Entry anchoring applied to {len(glyph_strength)} glyphs "
          f"(band={entry_band:.2f}, strength×={global_strength:.2f})")

def apply_comfort_spacing(tt: TTFont, factor: float = COMFORT_SPACING_FACTOR):
    hmtx = tt["hmtx"].metrics
    for g in list(hmtx.keys()):
        w, lsb = hmtx[g]
        hmtx[g] = (int(round(w * factor)),
                   int(round(lsb * factor)))
    print(f"✓ Comfort spacing applied (factor={factor:.3f})")

def apply_micro_spacing(tt, level: float = 1.0):
    """
    level = 0.0 → off, 1.0 → as specified in MICRO_SPACING_EM.
    """
    upm = tt["head"].unitsPerEm
    cmap = tt.getBestCmap() or {}
    hmtx = tt["hmtx"].metrics

    glyph_delta = {}

    for code, gname in cmap.items():
        ch = chr(code)
        base = get_base_letter(ch)

        key = None
        if ch in MICRO_SPACING_EM:
            key = ch
        elif base in MICRO_SPACING_EM:
            key = base

        if key is None:
            continue

        em_frac = MICRO_SPACING_EM[key] * level
        du = int(round(em_frac * upm))
        glyph_delta[gname] = du

    def nudge_glyph(gname, du):
        if gname not in hmtx:
            return
        w, lsb = hmtx[gname]
        hmtx[gname] = (max(1, w + du), lsb + du // 2)

    for gname, du in glyph_delta.items():
        nudge_glyph(gname, du)

    print(f"✓ Micro-spacing applied to {len(glyph_delta)} glyphs (level={level:.2f})")

def auto_hint(path_in, path_out) -> bool:
    ttfautohint_path = shutil.which("ttfautohint")
    if not ttfautohint_path:
        print("⚠ ttfautohint not found; skipping hinting")
        return False

    args = [ttfautohint_path]
    if platform.system() == "Darwin":
        args += ["-a", "qsq", "--windows-compatibility"]
    elif platform.system() == "Windows":
        args += ["--windows-compatibility"]
    else:
        args += ["--hinting-range-min=8", "--hinting-range-max=50"]
    args += [path_in, path_out]

    subprocess.run(args, check=False)
    print(f"✓ Hinting complete → {path_out}")
    return True

# ------------------------------------------------------------------
# BUILD STATIC WEIGHTS (FLOW=1)
# ------------------------------------------------------------------

def process_static_weight(src_path: str, out_path: str,
                          subfamily: str, weight_value: int,
                          entry_strength: float = ENTRY_GLOBAL_STRENGTH):
    tt = TTFont(src_path)

    print(f"\n→ Processing static {subfamily} from {os.path.basename(src_path)}")
    apply_optical_anchoring(tt, entry_band=ENTRY_BAND_DEFAULT,
                            global_strength=entry_strength)
    apply_comfort_spacing(tt, COMFORT_SPACING_FACTOR)
    apply_micro_spacing(tt, level=1.0)

    # Naming
    nm = tt["name"]
    family = "EasyType Sans"
    full   = f"{family} {subfamily}"
    nm.setName(family, 1, 3, 1, 1033)
    nm.setName(subfamily, 2, 3, 1, 1033)
    nm.setName(full, 4, 3, 1, 1033)
    nm.setName(VERSION_STR, 5, 3, 1, 1033)
    nm.setName(full.replace(" ", ""), 6, 3, 1, 1033)

    if "OS/2" in tt:
        tt["OS/2"].usWeightClass = weight_value

    tmp = out_path.replace(".ttf", "-tmp.ttf")
    tt.save(tmp)

    if auto_hint(tmp, out_path):
        os.remove(tmp)
    else:
        shutil.move(tmp, out_path)

    print(f"✓ Static {subfamily} written → {out_path}")

# ------------------------------------------------------------------
# BUILD VF MASTERS (FLOW 0 and FLOW 1, Regular & Bold)
# ------------------------------------------------------------------

def make_vf_master(src_path: str, out_path: str,
                   weight_value: int,
                   flow_level: float):
    """
    flow_level:
      0.0 → plain Noto (spacing=1.0, no anchoring, no micro)
      1.0 → full EasyType modifications
    """
    tt = TTFont(src_path)
    print(f"  • Master {os.path.basename(out_path)} @ wght={weight_value}, FLOW={flow_level}")

    if flow_level > 0.0:
        apply_optical_anchoring(tt, entry_band=ENTRY_BAND_DEFAULT,
                                global_strength=ENTRY_GLOBAL_STRENGTH * flow_level)
        apply_comfort_spacing(tt, 1.0 + (COMFORT_SPACING_FACTOR - 1.0) * flow_level)
        apply_micro_spacing(tt, level=flow_level)

    if "OS/2" in tt:
        tt["OS/2"].usWeightClass = weight_value

    tt.save(out_path)

def build_variable_font(reg_src: str, bold_src: str, vf_path: str):
    """
    Build variable font with axes:
      wght: 400–700
      FLOW: 0–1
    Masters:
      (wght 400, FLOW 0) from regular base
      (wght 400, FLOW 1) from regular EasyType
      (wght 700, FLOW 0) from bold base
      (wght 700, FLOW 1) from bold EasyType
    """
    print("\n→ Building variable font masters")

    # Master filenames (relative to OUT_DIR)
    m_R0 = "EasyTypeSans-VF-F0W400.ttf"
    m_R1 = "EasyTypeSans-VF-F1W400.ttf"
    m_B0 = "EasyTypeSans-VF-F0W700.ttf"
    m_B1 = "EasyTypeSans-VF-F1W700.ttf"

    path_R0 = os.path.join(OUT_DIR, m_R0)
    path_R1 = os.path.join(OUT_DIR, m_R1)
    path_B0 = os.path.join(OUT_DIR, m_B0)
    path_B1 = os.path.join(OUT_DIR, m_B1)

    # Create masters
    make_vf_master(reg_src,  path_R0, weight_value=400, flow_level=0.0)
    make_vf_master(reg_src,  path_R1, weight_value=400, flow_level=1.0)
    make_vf_master(bold_src, path_B0, weight_value=700, flow_level=0.0)
    make_vf_master(bold_src, path_B1, weight_value=700, flow_level=1.0)

    # Designspace file (masters are in OUT_DIR, paths are relative)
    ds_path = os.path.join(OUT_DIR, "EasyTypeSans-VF.designspace")
    ds_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<designspace format="4.0">
  <axes>
    <axis tag="wght" name="Weight" minimum="400" maximum="700" default="400">
      <map input="400" output="400"/>
      <map input="700" output="700"/>
    </axis>
    <axis tag="FLOW" name="Flow" minimum="0" maximum="1" default="0"/>
  </axes>
  <sources>
    <source filename="{m_R0}" name="F0W400">
      <location>
        <dimension name="Weight" xvalue="400"/>
        <dimension name="Flow"   xvalue="0"/>
      </location>
      <copyLib>true</copyLib>
      <copyInfo>true</copyInfo>
      <copyFeatures>true</copyFeatures>
    </source>
    <source filename="{m_R1}" name="F1W400">
      <location>
        <dimension name="Weight" xvalue="400"/>
        <dimension name="Flow"   xvalue="1"/>
      </location>
    </source>
    <source filename="{m_B0}" name="F0W700">
      <location>
        <dimension name="Weight" xvalue="700"/>
        <dimension name="Flow"   xvalue="0"/>
      </location>
    </source>
    <source filename="{m_B1}" name="F1W700">
      <location>
        <dimension name="Weight" xvalue="700"/>
        <dimension name="Flow"   xvalue="1"/>
      </location>
    </source>
  </sources>
  <instances>
    <!-- Named instances: Regular, Medium, Bold at FLOW=1 -->
    <instance familyname="EasyType Sans" stylename="Regular" filename="EasyTypeSansVF-Instance-Regular.ttf">
      <location>
        <dimension name="Weight" xvalue="400"/>
        <dimension name="Flow"   xvalue="1"/>
      </location>
    </instance>
    <instance familyname="EasyType Sans" stylename="Medium" filename="EasyTypeSansVF-Instance-Medium.ttf">
      <location>
        <dimension name="Weight" xvalue="500"/>
        <dimension name="Flow"   xvalue="1"/>
      </location>
    </instance>
    <instance familyname="EasyType Sans" stylename="Bold" filename="EasyTypeSansVF-Instance-Bold.ttf">
      <location>
        <dimension name="Weight" xvalue="700"/>
        <dimension name="Flow"   xvalue="1"/>
      </location>
    </instance>
  </instances>
</designspace>
"""
    with open(ds_path, "w", encoding="utf-8") as f:
        f.write(textwrap.dedent(ds_xml))
    print(f"✓ Designspace written → {ds_path}")

    # Build VF
    print("→ Running varLib.build()")
    vf, _, _ = varLib_build(ds_path)
    # Naming tweak for VF
    nm = vf["name"]
    nm.setName("EasyType Sans VF", 1, 3, 1, 1033)
    nm.setName("Regular",          2, 3, 1, 1033)
    nm.setName("EasyType Sans VF", 4, 3, 1, 1033)
    nm.setName(VERSION_STR + "; VF", 5, 3, 1, 1033)
    nm.setName("EasyTypeSansVF",   6, 3, 1, 1033)

    vf.save(vf_path)
    print(f"✓ Variable font written → {vf_path}")

# ------------------------------------------------------------------
# DEMO HTML (static EasyType vs Noto)
# ------------------------------------------------------------------

KERNNING_STRESS_TEXT = (
    "AVATAR WAFFLE MIX QUICKLY JUMPS OVER BOLD FROGS. "
    "Fixing kerning requires observing pairs like VA, Ta, We, To, Yo, "
    "and adjusting spacing around narrow letters such as i, l, and r. "
    "Watch for collisions in combinations like ff, fi, fl, fj, and fj. "
    "Lowercase words like minimum, illumination, and millennium expose rhythm. "
    "0123456789 ! ? . , : ; – — “ ” « » ( ) [ ] {{ }} $ € £ ¥ % ‰ + – × ÷ = ≠ < > ~ ^ "
    "Franz jagt im komplett verwahrlosten Taxi quer durch Bayern. "
    "Portez ce vieux whisky au juge blond qui fume. "
    "Zażółć gęślą jaźń. "
    "El pingüino Wenceslao hizo kilómetros bajo frío extremo. "
    "Pijamalı hasta yağız şoföre çabucak güvendi."
)

def write_demo(build_dir: str):
    demo_path = os.path.join(build_dir, "demo.html")
    html = f"""<!doctype html><html lang="en"><meta charset="utf-8">
<title>EasyType Sans – Demo</title>
<style>
@font-face {{
  font-family:'EasyType Sans';
  src:url('EasyTypeSans.ttf') format('truetype');
  font-weight:400;
  font-style:normal;
}}
@font-face {{
  font-family:'EasyType Sans';
  src:url('EasyTypeSans-Bold.ttf') format('truetype');
  font-weight:700;
  font-style:normal;
}}
body {{
  font-family:'EasyType Sans', system-ui, -apple-system, 'Noto Sans', sans-serif;
  font-size:18px; line-height:1.6;
  color:#141414; background:#fafafa;
  max-width:70ch; margin:2rem auto; padding:0 1rem;
}}
h1{{font-size:1.9rem;margin-bottom:.25rem}}
h2{{font-size:1.1rem;margin:1.5rem 0 .25rem;text-transform:uppercase;
   letter-spacing:.12em;font-weight:600;color:#444}}
.card{{background:#fff;border-radius:12px;padding:1rem 1.25rem;
      box-shadow:0 2px 8px rgba(0,0,0,.06);margin-top:1rem}}
.sample{{margin-top:.5rem}}
.note{{font-size:.8rem;color:#666;margin-top:.6rem}}
strong{{font-weight:700}}
em{{font-style:italic}}
</style>

<h1>EasyType Sans – FLOW anchoring + spacing</h1>

<div class="card">
  <h2>EasyType Sans (Regular + Bold)</h2>
  <p class="sample">
    {KERNNING_STRESS_TEXT}
  </p>
  <p class="sample">
    This is <strong>bold EasyType text</strong>, this is <em>italic EasyType text</em>,
    and this is <strong><em>bold italic EasyType text</em></strong>.
  </p>
  <div class="note">Noto-based, with entry anchoring + comfort spacing + micro-spacing.</div>
</div>

<div class="card" style="font-family:'Noto Sans', system-ui, sans-serif;">
  <h2>Noto Sans baseline (Regular + Bold)</h2>
  <p class="sample">
    {KERNNING_STRESS_TEXT}
  </p>
  <p class="sample">
    This is <strong>bold baseline text</strong>, this is <em>italic baseline text</em>,
    and this is <strong><em>bold italic baseline text</em></strong>.
  </p>
  <div class="note">Unmodified Noto Sans (Regular/Bold) for comparison.</div>
</div>

</html>"""
    with open(demo_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✓ Demo written → {demo_path}")

# ------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------

def main():
    reg_src  = download_font(REGULAR_TTF_NAME)
    bold_src = download_font(BOLD_TTF_NAME)

    # STATIC: FLOW=1 regular + bold
    process_static_weight(
        reg_src,
        EASYTYPE_REG,
        "Regular",
        400,
        entry_strength=ENTRY_GLOBAL_STRENGTH
    )

    process_static_weight(
        bold_src,
        EASYTYPE_BLD,
        "Bold",
        700,
        entry_strength=ENTRY_GLOBAL_STRENGTH * 0.8  # slightly softer in bold
    )

    # VARIABLE: wght + FLOW axes
    build_variable_font(reg_src, bold_src, EASYTYPE_VF)

    #write_demo(OUT_DIR)
    #print("\n✅ Done: static + VF built in ./build")

if __name__ == "__main__":
    main()
