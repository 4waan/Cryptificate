# Cryptificate brand

The mark is a 4x4 AES-like state read as a wide trail: one active byte (the researcher's change), the column it reaches after MixColumns (1 + 4 = branch number 5), and the rest of the state. The fully inked state is the completion mark, ∎.

## Files

| File | Use |
|---|---|
| `logo.svg`, `logo.png` | Horizontal lockup for light backgrounds. The PNG is 1200 px wide, transparent. |
| `logo-dark.svg`, `logo-dark.png` | Lockup for dark backgrounds. |
| `mark.svg`, `mark-dark.svg`, `mark-512.png` | Mark alone, 24 px and up. |
| `mark-mono.svg` | One ink on screen. Uses `currentColor` at 100 / 55 / 18 % for byte / column / state. |
| `mark-stamp.svg` | One ink with no tints (stamps, embroidery, laser). The active byte is framed, its column solid, the state dotted. |
| `favicon.svg` | Pixel-snapped 16 px mark. Switches palette with `prefers-color-scheme`. |
| `favicon.ico`, `favicon-32.png` | Hand-snapped 16, 32 and 48 px frames, light palette. |
| `apple-touch-icon.png` | 180 px, opaque white. |
| `certified.svg` | ∎, every byte in ink. Use it for "proof checked" badges and to end evidence reports. It is not a logo. |
| `social-card.png` | 1280x640 repository and Open Graph preview. |
| `banner.svg` | 900x220 README diagram of the flow. Uses real text in the system font stack and follows the reader's light or dark theme. |
| `tools/generate.py`, `tools/render.cjs` | Rebuild everything above with `python3 assets/brand/tools/generate.py`. |

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
  <img alt="Cryptificate" src="assets/brand/logo.svg" height="48">
</picture>

<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Colours

| Role | Light | Dark |
|---|---|---|
| Ink: wordmark, active column, ∎ | `#0D0F0D` | `#F2F4F1` |
| Accent (matcha): the active byte and the first i dot | `#7FA65A` | `#A3C97B` |
| State tint | `#C9CEC6` (1.6:1 on white) | `#353B35` (1.7:1 on `#0A0B0A`) |
| State tint, favicon and small sizes | `#C9CEC6` | `#3A3F3A` |
| Secondary text | `#4A5048` | `#B9BFB7` |
| Background | `#FFFFFF`, paper `#F6F7F4` | `#0A0B0A` |
| Accent as text (light only) | `#4E7530` (5.4:1 on white) | `#A3C97B` (10.5:1 on `#0A0B0A`) |

- The identity is black, white and neutral greys plus one colour, matcha. Matcha always means the researcher's change, the active input, or a proved result. It never means an error. Counterexamples and failures are shown in high-contrast black and white with an icon and a word, never in a second hue.
- `#7FA65A` on white is 2.8:1. That is fine for the byte and the i dot, which sit next to the full-contrast ink, but use `#4E7530` for any small text.
- The accent appears in the wordmark only on the dot of the first i, and nowhere else.

## Construction

- The mark sits on a 64-unit square. Bytes are 12 units on a 16-unit pitch, with a 2-unit margin and a 0.75-unit corner radius. The mark is exact at 32, 64 and 512 px.
- The wordmark is Inter Display SemiBold, outlined, with square i dots. Its cap height is 36 units and is centred on the mark (mark : cap height = 60 : 36 = 5 : 3). The gap from the last byte column to the C is 24 units.
- Favicon: 3 px bytes on a 4 px pitch make a 15 px glyph. Even padding inside 16 px would need half pixels, so the glyph is anchored top-left. The free row and column fall right and bottom, which keeps the active byte on pixel (0, 0) and adds a pixel before the tab title. The same SVG stays crisp at 32 and 48 px. The 32 px raster frame uses the master geometry (6 px bytes, 1 px margin all round). The 48 px frame (9 px bytes, 3 px gaps) starts 1 px in.

## Clear space and minimum size

- Clear space is one byte pitch (16 units, a quarter of the mark's height) on every side of the mark or lockup, measured from the outer bytes and the type.
- The lockup is at least 20 px tall. Below that, use the mark alone.
- `mark.svg` is at least 24 px. Below 24 px, use `favicon.svg` or the snapped PNG frames, and only at 16, 32 or 48 px.
- Do not recolour single bytes, change the radius, add gradients or shadows, or set the wordmark in another face.

## Motion and secondary graphics

- **State sequence:** active byte, then the column, then the full state, then ∎. Hold each step about 160 ms. With `prefers-reduced-motion`, show only the last frame.
- **Replay wire:** a single path through all 16 bytes (an order-2 Hilbert curve), for replay progress and section dividers. Keep it out of the logo.
