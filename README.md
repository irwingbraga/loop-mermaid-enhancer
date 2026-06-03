# Loop Mermaid Enhancer

A Chrome (MV3) extension that improves the Mermaid diagram experience in
Microsoft Loop (`loop.cloud.microsoft`).

## What it adds

- **Floating toolbar** on every Mermaid preview pane (appears on hover):
  - `⛶` **Fullscreen** — large modal with proper pan + zoom (wheel, drag, keys).
  - `{ }` **Copy SVG** — markup to clipboard.
  - `📋` **Copy PNG** — PNG to clipboard (2× scale).
  - `↓` **Download PNG** — `.png` file (2× scale).
- **Fullscreen modal** powered by [svg-pan-zoom]:
  - Scroll = zoom, drag = pan, `+ / - / 0 / R / Esc` keyboard shortcuts.
  - Copy / Download SVG and PNG from the modal too.
- **H ↔ V split toggle** while editing — flips the editor/preview layout between
  side-by-side (Loop's default) and stacked.

## Why these design choices

Loop pre-renders Mermaid server-side into an `<svg>` placed inside a same-origin
`srcdoc` iframe (`iframe[id^="codePreviewIframe"]`). We can read it directly, so:

- **No `mermaid.js` bundle** — we reuse Loop's SVG. Smaller extension, perfect
  theme parity, no re-render lag.
- **No theme detection on the SVG itself** — Loop's iframe already inherits the
  Fluent design tokens; our toolbar/modal piggy-back on the same CSS variables
  (`--colorNeutralBackground1`, etc.) so they auto-match.

Stable DOM hooks we depend on (all of these survived the latest Loop release as
of June 2026):

| Hook | Purpose |
|---|---|
| `div.scriptor-component-code-block` | Outer code block |
| `#language-selector[value="Mermaid"]` | Identify Mermaid blocks |
| `[role="region"][aria-label*="Mermaid generated"]` | Preview pane |
| `div.unsafe-content` | Pan/zoom transform host |
| `iframe[id^="codePreviewIframe"]` | Source SVG container |
| `[aria-label="Editor container"]` / `[aria-label="Code editor"]` | Edit-mode editor |

We **never** depend on Loop's Griffel atomic class hashes (`___xxx`, `fxxx`) —
they change with every release.

## Install (dev / unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked**.
4. Pick `/Users/irwingbraga/src/loop-mermaid-enhancer`.
5. Open a Loop page with a Mermaid block — hover the diagram to see the toolbar.

## File layout

```
loop-mermaid-enhancer/
├── manifest.json
├── icons/                  # 16/48/128 placeholder PNGs (replace anytime)
├── vendor/
│   └── svg-pan-zoom.min.js # ~30 KB
└── src/
    ├── detect.js           # DOM selectors + SVG extraction
    ├── theme.js            # Light/dark detection from Fluent tokens
    ├── export.js           # Serialize / copy / download SVG & PNG
    ├── modal.js            # Fullscreen viewer
    ├── toolbar.js          # Per-preview floating toolbar
    ├── sxs-toggle.js       # Edit-mode split direction toggle
    ├── content.js          # Orchestrator (MutationObserver)
    └── styles.css
```

## Debugging

Open DevTools on a Loop page — a `window.__LME` object exposes:
- `__LME.scan()` — re-scan now.
- `__LME.detect.findAllMermaidBlocks()` — list current blocks.
- `__LME.detect.readPreviewSvg(block)` — grab a block's `<svg>`.

If the toolbar doesn't appear, the most likely cause is that Loop has renamed a
selector. Check the table above against current DOM and update `src/detect.js`.

## Known limitations / next steps

- The **Copy PNG** path uses `navigator.clipboard.write` — supported in Chromium,
  not in Safari/Firefox without polyfills.
- We currently don't re-render Mermaid ourselves. If Loop ever fails to render a
  diagram (e.g. syntax error), the toolbar's actions will warn (`!`). A future
  enhancement could bundle `mermaid.js` as a fallback renderer.
- The H↔V toggle changes `flex-direction` on the split parent; very long source
  files in vertical mode may need an explicit `min-height` per pane — adjust in
  `styles.css` if needed.
- Icons are placeholder glyphs; drop in real PNGs whenever.

[svg-pan-zoom]: https://github.com/bumbu/svg-pan-zoom
