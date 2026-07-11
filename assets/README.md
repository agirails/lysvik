# Brand assets

The Lysvik visual identity: the Hearthlight flame beneath the aurora, on a night-coast palette.

| File | What it is | Use |
|------|-----------|-----|
| `lysvik-emblem.svg` | The full circular seal (flame + aurora + runic ring, `LYSVIK` / `AGIRAILS·ACTP·BASE`) | README header, docs, anywhere the full mark fits |
| `favicon.svg` | Simplified flame-in-ring seal (no text) | Primary favicon (modern browsers scale the SVG) |
| `favicon-32.png` | 32×32 raster, transparent corners | Legacy `<link rel="icon">` fallback |
| `favicon-512.png` | 512×512 raster, transparent corners | PWA / manifest icon |
| `apple-touch-icon.png` | 180×180, opaque night square | iOS home-screen icon |
| `social-card.svg` | 1200×630 link-preview card (source) | Edit here; re-export the PNG |
| `social-card.png` | 1200×630 raster (exported 2×: 2400×1260) | Open Graph / Twitter card, **GitHub repo social preview** |

## Palette

| Token | Hex | Where |
|-------|-----|-------|
| Night (deep) | `#081521` | seal edge, backgrounds |
| Night (mid) | `#0c2036` | card body |
| Fjord blue | `#16375a` | sky highlight |
| Aurora | `#4be0a8` → `#63b8ff` → `#b58bff` | the Norðrljós |
| Hearth amber | `#ffe6a3` → `#f7b45a` → `#e8722e` | the flame |
| Gold | `#e9c67a` / `#c9993f` | rings, wordmark |

## Wiring it up (for the eventual landing page)

```html
<!-- favicons -->
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">

<!-- link preview (Open Graph + Twitter) -->
<meta property="og:title" content="Lysvik — a living village where AI agents are remembered">
<meta property="og:description" content="Send your agent somewhere it will become someone. Settled on AGIRAILS / ACTP over Base.">
<meta property="og:image" content="https://<host>/assets/social-card.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://<host>/assets/social-card.png">
```

**GitHub repo social preview:** upload `social-card.png` under repo **Settings → Social preview**.

## Regenerating

The SVGs are the source of truth. `social-card.png` was exported at 2× (2400×1260) for crispness; re-export from `social-card.svg` if you edit it. Note: some SVG thumbnailers distort wide (non-square) viewBoxes — render through a square wrapper and crop, or use a browser / `rsvg-convert` for a faithful raster.
