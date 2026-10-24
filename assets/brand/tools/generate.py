#!/usr/bin/env python3
"""Rebuild the Cryptificate brand assets in assets/brand/.

    python3 assets/brand/tools/generate.py            # SVGs, then PNGs and favicon.ico
    python3 assets/brand/tools/generate.py --svg-only # SVGs only

SVG output needs fontTools and uharfbuzz plus Inter Display SemiBold and Inter
Regular (OFL; set INTER_DIR if they are not in /usr/share/fonts/opentype/inter).
The wordmark and the social-card line are converted to outlines, so the
outputs do not depend on installed fonts. Raster output also needs Pillow and
Node with Playwright's Chromium (render.cjs; set NODE_PATH if Playwright is
installed globally).

Geometry: the mark lives on a 64-unit square. Bytes are 12 units on a
16-unit pitch with a 2-unit margin, so the mark is exact at 32, 64 and 512 px.
The favicon uses a separate 16 px pixel-snapped grid (3 px bytes, 1 px gaps).
"""
import argparse
import json
import math
import os
import struct
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent
INTER_DIR = Path(os.environ.get("INTER_DIR", "/usr/share/fonts/opentype/inter"))
WORDMARK_FONT = INTER_DIR / "InterDisplay-SemiBold.otf"
TAGLINE_FONT = INTER_DIR / "Inter-Regular.otf"

PALETTE = {
    "light": dict(ink="#0D0F0D", accent="#7FA65A", tint="#C9CEC6", fav_tint="#C9CEC6", bg="#FFFFFF"),
    "dark": dict(ink="#F2F4F1", accent="#A3C97B", tint="#353B35", fav_tint="#3A3F3A", bg="#0A0B0A"),
}
ACCENT_TEXT = "#4E7530"  # the accent when it has to carry small text on light backgrounds
MUTED = {"light": "#4A5048", "dark": "#B9BFB7"}  # secondary text
PAPER = "#F6F7F4"  # social card background

PITCH, CELL, PAD = 16, 12, 2  # mark units
RX = 0.75  # byte corner radius in mark units: a paper state diagram, not an app grid
CAP = 36  # wordmark cap height in mark units (mark 60 : cap 36 = 5 : 3)
GAP = 24  # visible gap between the last byte column and the C, in mark units
TAGLINE = "The verification workbench for changes to your cipher's diffusion layer"
SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif"


def num(v):
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


# ---- state grid -------------------------------------------------------------

def role(r, c):
    """Wide trail: the active byte, its column after MixColumns (1 + 4 = branch number 5), the rest of the state."""
    if (r, c) == (0, 0):
        return "active"
    return "column" if c == 0 else "state"


def cells(x0=0.0, y0=0.0, scale=1.0, pitch=PITCH, cell=CELL, pad=PAD):
    for r in range(4):
        for c in range(4):
            yield r, c, x0 + (pad + pitch * c) * scale, y0 + (pad + pitch * r) * scale, cell * scale


def grid(fill, x0=0.0, y0=0.0, scale=1.0, rx=None, attr="fill", indent="  "):
    """fill(r, c) -> colour or class name."""
    rx = RX if rx is None else rx
    out = []
    for r, c, x, y, s in cells(x0, y0, scale):
        corner = f' rx="{num(rx * scale)}"' if rx else ""
        out.append(f'<rect x="{num(x)}" y="{num(y)}" width="{num(s)}" height="{num(s)}"{corner} {attr}="{fill(r, c)}"/>')
    return ("\n" + indent).join(out)


def palette_fill(p):
    return lambda r, c: {"active": p["accent"], "column": p["ink"], "state": p["tint"]}[role(r, c)]


def mark_svg(p):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Cryptificate">
  <title>Cryptificate</title>
  <!-- Wide trail: one active byte (the change), its column after MixColumns (1 + 4 = branch number 5), the full 4x4 state -->
  {grid(palette_fill(p))}
</svg>
"""


def mono_svg():
    ladder = {"active": "1", "column": "0.55", "state": "0.18"}
    body = grid(lambda r, c: ladder[role(r, c)], attr="fill-opacity", indent="    ")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Cryptificate">
  <title>Cryptificate</title>
  <!-- Single ink on screen: inherits currentColor; active byte 100 %, column 55 %, state 18 % -->
  <g fill="currentColor">
    {body}
  </g>
</svg>
"""


def stamp_svg():
    """Strict one colour, no tints (stamps, embroidery, laser): solid column, framed active byte, dotted state.
    Square corners: the radius means nothing at the sizes these are made."""
    out = []
    for r, c, x, y, s in cells():
        rl = role(r, c)
        if rl == "column":
            out.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}"/>')
        elif rl == "active":
            # 2-unit frame, 2-unit knock-out, 4-unit core: still one of the four column bytes, but marked
            out.append(
                f'<path fill-rule="evenodd" d="M{x} {y}h{s}v{s}h-{s}z M{x + 2} {y + 2}v8h8v-8z"/>'
                f'<rect x="{x + 4}" y="{y + 4}" width="4" height="4"/>'
            )
        else:
            out.append(f'<rect x="{x + 4}" y="{y + 4}" width="4" height="4"/>')
    body = "\n    ".join(out)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Cryptificate">
  <title>Cryptificate</title>
  <!-- Strict one colour, no tints: the active byte is framed, its column solid, the rest of the state dotted -->
  <g fill="currentColor">
    {body}
  </g>
</svg>
"""


def themed_style():
    """Byte classes a (active), c (column), t (state) in the light palette, switched by prefers-color-scheme."""
    L, D = PALETTE["light"], PALETTE["dark"]
    return (
        f".a{{fill:{L['accent']}}}.c{{fill:{L['ink']}}}.t{{fill:{L['fav_tint']}}}"
        f"@media (prefers-color-scheme:dark){{.a{{fill:{D['accent']}}}.c{{fill:{D['ink']}}}.t{{fill:{D['fav_tint']}}}}}"
    )


def favicon_svg():
    cls = {"active": "a", "column": "c", "state": "t"}
    rects = []
    for r in range(4):
        for c in range(4):
            rects.append(f'<rect class="{cls[role(r, c)]}" x="{4 * c}" y="{4 * r}" width="3" height="3"/>')
    body = "\n  ".join(rects)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges">
  <title>Cryptificate</title>
  <!-- Pixel-snapped: 3 px bytes on a 4 px pitch, anchored top-left (the free pixel row and column fall right and bottom).
       Crisp at 16, 32 and 48 px. Colours follow the system light or dark setting. -->
  <style>{themed_style()}</style>
  {body}
</svg>
"""


def certified_svg():
    body = grid(lambda r, c: "c", attr="class")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Certified">
  <title>Certified</title>
  <!-- Completion mark: every byte of the state in ink, the end-of-proof square. Not a logo; use it for "proof checked". -->
  <style>{themed_style()}</style>
  {body}
</svg>
"""


# ---- wordmark ---------------------------------------------------------------

def shape(fontpath, text, size_cap, tracking=0, dotless=False):
    """Outline `text` with HarfBuzz shaping. Returns path data (baseline at y=0), advance width, ink bounds, i-dot slots."""
    import uharfbuzz as hb
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont

    tt = TTFont(str(fontpath))
    gs = tt.getGlyphSet()
    s = size_cap / tt["OS/2"].sCapHeight
    font = hb.Font(hb.Face(hb.Blob.from_file_path(str(fontpath))))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"liga": False, "calt": False, "kern": True})
    order = tt.getGlyphOrder()
    dotless_i = next((n for n in ("dotlessi", "idotless", "uni0131") if n in gs), None)
    x, paths, dots = 0, [], []
    bounds = BoundsPen(None)
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        if dotless and text[info.cluster] == "i" and dotless_i:
            name = dotless_i
            dots.append((x + pos.x_offset) * s)
        pen = SVGPathPen(gs, ntos=num)
        tf = (s, 0, 0, -s, (x + pos.x_offset) * s, 0)
        gs[name].draw(TransformPen(pen, tf))
        gs[name].draw(TransformPen(bounds, tf))
        paths.append(pen.getCommands())
        x += pos.x_advance + tracking
    return dict(d=" ".join(paths), advance=(x - tracking) * s, bounds=bounds.bounds, dots=dots, s=s)


def lockup_parts(p):
    """Mark + wordmark on a 64-unit-high canvas. Returns (svg body, width)."""
    w = shape(WORDMARK_FONT, "Cryptificate", CAP, tracking=-8, dotless=True)
    base = 32 + CAP / 2  # cap height centred on the mark
    tx = PAD + 60 + GAP - w["bounds"][0]
    s = w["s"]
    tittles = []
    for i, xo in enumerate(w["dots"]):
        side = 252 * s  # Inter's i-dot width, drawn square to match the bytes
        col = p["accent"] if i == 0 else p["ink"]  # only the first i carries the accent
        tittles.append(
            f'<rect x="{num(tx + xo + 238 * s - side / 2)}" y="{num(base - 1490 * s)}" '
            f'width="{num(side)}" height="{num(side)}" fill="{col}"/>'
        )
    width = math.ceil((tx + w["bounds"][2] + PAD) * 2) / 2
    body = f"""<g>
    {grid(palette_fill(p), indent="    ")}
  </g>
  <path fill="{p['ink']}" transform="translate({num(tx)} {num(base)})" d="{w['d']}"/>
  {chr(10).join("  " + t for t in tittles).strip()}"""
    return body, width


def logo_svg(p):
    body, width = lockup_parts(p)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(width)} 64" width="{num(width)}" height="64" role="img" aria-label="Cryptificate">
  <title>Cryptificate</title>
  {body}
</svg>
"""


def social_card_svg():
    p = PALETTE["light"]
    W, H = 1280, 640
    body, width = lockup_parts(p)
    scale = 780 / width
    t = shape(TAGLINE_FONT, TAGLINE, 24)
    # optical centre a little above the middle: lockup (60 units visible), 64 px air, tagline cap height
    group = 60 * scale + 64 + 24
    top = 312 - group / 2
    lx, ly = (W - width * scale) / 2, top - PAD * scale
    base = top + 60 * scale + 64 + 24
    tw = t["bounds"][2] - t["bounds"][0]
    tx = (W - tw) / 2 - t["bounds"][0]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="{PAPER}"/>
  <g transform="translate({num(lx)} {num(ly)}) scale({round(scale, 5)})">
  {body}
  </g>
  <path fill="{MUTED['light']}" transform="translate({num(tx)} {num(base)})" d="{t['d']}"/>
</svg>
"""


# ---- README banner -----------------------------------------------------------

def banner_svg():
    L, D = PALETTE["light"], PALETTE["dark"]
    W, H = 900, 220
    cw, gap = 204, 28  # four cards and three arrows fill the width exactly
    padx, pady = 20, 22
    ch = pady + 60 + 32 + 24 + 19 + 4 + pady  # glyph, title, two lines of detail
    top = (H - ch) // 2
    bars = (2, 4, 3, 1)  # bytes lit per column, bottom up: a strip of timings
    stations = [
        ("Your change", ["matrix, circuit, offsets,", "S-box or field layer"], lambda r, c: {"active": "a"}.get(role(r, c), "t")),
        ("Lean-checked claims", ["equivalence \u00b7 MDS", "offsets \u00b7 activity"], lambda r, c: {"active": "a", "column": "c"}.get(role(r, c), "t")),
        ("Rust measurements", ["paired native timings", "on the recorded machine"], lambda r, c: "c" if 3 - r < bars[c] else "t"),
        ("Replayable bundle", ["inputs, proofs, pins and", "raw timings in one file"], lambda r, c: "c"),
    ]
    parts = []
    for i, (title, sub, fill) in enumerate(stations):
        x = i * (cw + gap)
        gx, gy = x + padx, top + pady  # the 4x4 glyph at master scale: 12 px bytes, 16 px pitch
        rects = "".join(
            f'<rect class="{fill(r, c)}" x="{num(cx)}" y="{num(cy)}" width="{num(s)}" height="{num(s)}" rx="{num(RX)}"/>'
            for r, c, cx, cy, s in cells(gx - PAD, gy - PAD)
        )
        ty = gy + 60 + 32
        lines = "".join(f'<tspan x="{gx}" dy="{0 if j == 0 else 19}">{t}</tspan>' for j, t in enumerate(sub))
        parts.append(
            f"""<g>
    <rect class="card" x="{x + 0.5}" y="{top + 0.5}" width="{cw - 1}" height="{ch - 1}" rx="6"/>
    {rects}
    <text class="ttl" x="{gx}" y="{ty}">{title}</text>
    <text class="sub" y="{ty + 24}">{lines}</text>
  </g>"""
        )
        if i < 3:
            ax0, ax1, ay = x + cw + 6, x + cw + gap - 6, gy + 30
            parts.append(f'<path class="arrow" d="M{ax0} {ay}H{ax1}M{ax1 - 5} {ay - 5}l5 5-5 5"/>')
    body = "\n  ".join(parts)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="title desc">
  <title id="title">How Cryptificate works</title>
  <desc id="desc">Your change to a matrix, circuit, row offsets, S-box or prime-field layer goes to Lean-checked claims (circuit equivalence, MDS, row offsets, activity bound), then to native Rust measurements, and ends in a replayable evidence bundle.</desc>
  <style>
    text{{font-family:{SANS}}}
    .ttl{{font-size:15px;font-weight:600;fill:{L['ink']}}}
    .sub{{font-size:13.5px;fill:{MUTED['light']}}}
    .card{{fill:#F6F7F4;stroke:#DFE3DC}}
    .arrow{{fill:none;stroke:#8A9187;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}}
    .a{{fill:{L['accent']}}}.c{{fill:{L['ink']}}}.t{{fill:{L['tint']}}}
    @media (prefers-color-scheme:dark){{
      .ttl{{fill:{D['ink']}}}.sub{{fill:{MUTED['dark']}}}
      .card{{fill:#111311;stroke:#262A26}}
      .a{{fill:{D['accent']}}}.c{{fill:{D['ink']}}}.t{{fill:{D['fav_tint']}}}
    }}
  </style>
  {body}
</svg>
"""


# ---- rasters ----------------------------------------------------------------

def hinted_favicon_svg(px, p, offset, cell, pitch):
    fill = palette_fill(dict(p, tint=p["fav_tint"]))
    rects = []
    for r in range(4):
        for c in range(4):
            rects.append(f'<rect x="{offset + pitch * c}" y="{offset + pitch * r}" width="{cell}" height="{cell}" fill="{fill(r, c)}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {px} {px}" width="{px}" height="{px}" shape-rendering="crispEdges">{"".join(rects)}</svg>'


def touch_icon_svg():
    p = PALETTE["light"]
    # 180 px, opaque: bytes 24 px on a 32 px pitch, the grid centred (iOS masks the corners itself)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
  <rect width="180" height="180" fill="{p['bg']}"/>
  {grid(palette_fill(p), x0=30 - 2 * 2, y0=30 - 2 * 2, scale=2)}
</svg>"""


def write_ico(path, pngs):
    """ICO with PNG-compressed entries, one per hand-snapped size."""
    head = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries, blobs = b"", b""
    for size, data in pngs:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        blobs += data
    path.write_bytes(head + entries + blobs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--svg-only", action="store_true")
    args = ap.parse_args()
    L, D = PALETTE["light"], PALETTE["dark"]
    files = {
        "mark.svg": mark_svg(L),
        "mark-dark.svg": mark_svg(D),
        "mark-mono.svg": mono_svg(),
        "mark-stamp.svg": stamp_svg(),
        "certified.svg": certified_svg(),
        "favicon.svg": favicon_svg(),
        "logo.svg": logo_svg(L),
        "logo-dark.svg": logo_svg(D),
        "banner.svg": banner_svg(),
    }
    for name, text in files.items():
        (OUT / name).write_text(text)
    if args.svg_only:
        return

    from PIL import Image

    tmp = Path(tempfile.mkdtemp(prefix="cryptificate-brand-"))
    src = {
        "favicon-16": hinted_favicon_svg(16, L, 0, 3, 4),
        "favicon-32": hinted_favicon_svg(32, L, 1, 6, 8),
        "favicon-48": hinted_favicon_svg(48, L, 1, 9, 12),
        "apple-touch-icon": touch_icon_svg(),
        "social-card": social_card_svg(),
    }
    for k, v in src.items():
        (tmp / f"{k}.svg").write_text(v)
    logo_w = float(files["logo.svg"].split('viewBox="0 0 ')[1].split(" ")[0])
    jobs = [
        dict(svg=str(OUT / "logo.svg"), out=str(OUT / "logo.png"), w=1200, h=round(1200 * 64 / logo_w)),
        dict(svg=str(OUT / "logo-dark.svg"), out=str(OUT / "logo-dark.png"), w=1200, h=round(1200 * 64 / logo_w)),
        dict(svg=str(OUT / "mark.svg"), out=str(OUT / "mark-512.png"), w=512, h=512),
        dict(svg=str(tmp / "favicon-32.svg"), out=str(OUT / "favicon-32.png"), w=32, h=32),
        dict(svg=str(tmp / "favicon-16.svg"), out=str(tmp / "favicon-16.png"), w=16, h=16),
        dict(svg=str(tmp / "favicon-48.svg"), out=str(tmp / "favicon-48.png"), w=48, h=48),
        dict(svg=str(tmp / "apple-touch-icon.svg"), out=str(OUT / "apple-touch-icon.png"), w=180, h=180),
        dict(svg=str(tmp / "social-card.svg"), out=str(OUT / "social-card.png"), w=1280, h=640),
    ]
    (tmp / "jobs.json").write_text(json.dumps(jobs))
    subprocess.run(["node", str(Path(__file__).with_name("render.cjs")), str(tmp / "jobs.json")], check=True)

    pngs = []
    for size, f in ((16, tmp / "favicon-16.png"), (32, OUT / "favicon-32.png"), (48, tmp / "favicon-48.png")):
        buf = BytesIO()
        Image.open(f).convert("RGBA").save(buf, "PNG", optimize=True)
        pngs.append((size, buf.getvalue()))
    write_ico(OUT / "favicon.ico", pngs)
    for f in ("logo.png", "logo-dark.png", "mark-512.png", "favicon-32.png", "apple-touch-icon.png"):
        im = Image.open(OUT / f)
        im.save(OUT / f, "PNG", optimize=True)
    Image.open(OUT / "social-card.png").convert("RGB").save(OUT / "social-card.png", "PNG", optimize=True)


if __name__ == "__main__":
    main()
