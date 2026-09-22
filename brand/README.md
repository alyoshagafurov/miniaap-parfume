# Brand assets

## `logo-source.jpg`

The logo as supplied by the client (1024×1024 JPEG).

**It has an opaque white background (#FDFDFD) and cannot be placed on the brand
surface as-is** — it would render as a white box on cream. A transparent PNG or,
preferably, an SVG is still outstanding from the client.

### Colours measured from this file

Sampled per element with the antialiasing accounted for: thick strokes (the
wordmark) are read from the most frequent ink pixel, the hairline flourish from
the mean of its deepest 5% of pixels, since every pixel of a 1px line on white
is blended toward white.

| Element | Measured | Direction spec | ΔRGB |
|---|---|---|---|
| `ÁRUMI` wordmark | `#4D522C` | `#4D5527` | 5.8 |
| Gold guilloche rule | `≈#C9A34C` (core `#C8962C`, body `#CBAF6B`) | `#C9A646` | 6.7 |
| `PARFUM & CARE` | `#2B2D2C` neutral graphite | `#23241E` warm | 18.5 |
| Canvas | `#FDFDFD` | `#F8F5EE` | 17.7 |

The direction's olive and gold are confirmed by the logo — both differ by under
7/255 per channel, which is below the perceptual threshold. The measured olive
`#4D522C` is the token this project ships, per the direction's rule that the
logo wins on divergence.

The subtitle and canvas differences are **not** conflicts: the subtitle is a
logo element rather than a body-text token, and a logo file being drawn on white
says nothing about the brand surface.

The braided gold rule beneath the wordmark is the origin of the "golden thread"
divider used throughout the interface.

---

## `logo.png` / `logo.webp` — temporary derivatives

Cropped to the mark's true bounding box (700×360 from the 1024×1024 source, a
1.94 ratio) and the JPEG's near-white paper lifted to **exactly** 255,255,255.

That lift is what makes the temporary display technique work. The supplied file
has an opaque background, so the mark is rendered with:

```css
mix-blend-mode: multiply;
```

Multiplying by pure white is a no-op, so the white field vanishes against the
cream canvas. Left at the JPEG's #FDFDFD it would instead darken the canvas
very slightly and unevenly, because JPEG noise means the "white" is not one
value — visible as faint mottling behind the wordmark. Lifting it also took the
PNG from 126 KB to 95 KB and the WebP to 22 KB, since a field of identical
pixels compresses to almost nothing.

**This is a workaround, not the answer.** It fails anywhere the mark must sit on
a dark or photographic background, because multiply darkens rather than masks.
A transparent PNG or, preferably, an SVG is still outstanding from the client;
when it arrives, delete these derivatives and drop `mix-blend-mode`.

`public/logo.webp` is the served copy.
