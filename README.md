# Lekhini

> लेखनी — Sanskrit for *"pen"*. A free, open-source on-screen
> annotation overlay for macOS, Windows, and Linux. A project of
> [Open Source Bharat](https://opensourcebharat.org). Made in
> India · 2026.

Lekhini lets you draw, write, highlight, and annotate anywhere on
your screen — on top of any application — with a pencil, pen,
highlighter, eraser, and a full set of shape tools. Built for
teachers, presenters, traders, and anyone who needs to mark up live
content without switching apps.

## Highlights

- **Pencil + Pen as distinct tools.** Pencil is graphite-textured with
  uniform width and abrupt taper; pen is smooth ink with
  pressure-driven thinning. Selecting a color while pencil is active
  auto-switches to pen — a clean mental model.
- **Highlighter, eraser, hand (move/select), shapes** (H/V line,
  trendline with Shift-snap, Fibonacci retracement, rectangle,
  ellipse, arrow, text), and **screen snip** with annotations baked
  into the saved PNG.
- **Vertical or horizontal toolbar**, both adapt to content. Vertical
  is the default. The choice is remembered.
- **Tool-aware cursors** that track the active color and width.
- **Per-tool thickness memory** with a quick-pick inline popup.
- **Profiles** — General (default), Teacher, Trader — each surfacing a
  curated tool set.
- **Multi-monitor**, transparent always-on-top overlay, click-through
  by default with a hotkey to toggle drawing.
- **Undo/redo, clear, screenshot**, all from the toolbar or global
  hotkeys.

## Tech stack

- **Electron 32** — true transparent always-on-top overlay,
  click-through with event forwarding, built-in screen capture
- **SolidJS** — fine-grained signals for the toolbar / UI chrome (no
  VDOM re-renders during draw)
- **TypeScript** + **Vite** + `vite-plugin-electron`
- **`perfect-freehand`** for pen strokes (pressure, velocity-tapered
  polygons), with per-tool input pre-smoothing
- **Zustand** vanilla store with snapshot-based undo/redo history
- **`electron-store`** for persisted orientation / theme / per-tool
  widths / active tool / color, with schema-tolerant hydration
- **`electron-builder`** for notarized `.dmg` (and `nsis` /
  `AppImage` for Windows / Linux)

## Architecture

- One **transparent `BrowserWindow` per display** (so Retina /
  non-Retina mixes get correct `devicePixelRatio` per screen).
- Each overlay defaults to click-through ON (`setIgnoreMouseEvents(true,
  { forward: true })`) so the app underneath stays interactive. Toggle
  draw mode (or click the status dot) and clicks land on the overlay.
- A separate **floating toolbar window** (opaque, rounded, draggable)
  hosts the tool palette so it never participates in click-through
  gymnastics.
- A **hub** in the main process owns active tool / draw mode / color +
  width / orientation / profile and broadcasts to all overlays.
- Two-canvas rendering per overlay: a `committed` layer (only redrawn
  on undo/redo/erase) and a `live` layer (cleared every frame) for the
  in-progress stroke.
- All strokes & shapes are kept as a vector `Item` array — undo/redo
  is a snapshot of that array (capped at 100 entries).
- Pointer events captured via `pointerrawupdate` + `getCoalescedEvents()`
  for sub-frame precision, batched on `requestAnimationFrame`.

## Project layout

```
src/
├── main/                          # Electron main process
│   ├── main.ts                    # app lifecycle, display enumeration
│   ├── preload.ts                 # contextBridge -> window.pen
│   ├── hub.ts                     # cross-window state + broadcast
│   ├── persistence.ts             # electron-store wrapper
│   ├── windows/
│   │   ├── overlay.ts             # transparent per-display window factory
│   │   └── toolbar.ts             # floating toolbar window + IPC
│   ├── hotkeys.ts                 # globalShortcut + relay IPC
│   ├── capture.ts                 # desktopCapturer -> save PNG
│   └── permissions.ts             # Screen Recording + Accessibility checks
├── renderer/
│   ├── overlay/                   # overlay window content
│   │   ├── App.tsx                # Solid root, pipeline wiring
│   │   ├── store.ts               # zustand store + undo/redo
│   │   ├── cursors.ts             # dynamic tool-aware cursor builders
│   │   ├── canvas/                # CommittedLayer, LiveLayer, drawItem, pointer pipeline
│   │   └── tools/                 # pencil, pen, highlighter, eraser, line, …
│   └── toolbar/                   # floating toolbar (Solid)
└── shared/                        # types + constants used by both processes
```

## Running locally

```bash
npm install
npm run dev          # starts Vite + Electron with HMR
```

> **Node 26 install note**: `extract-zip` (Electron's postinstall
> extractor) can silently fail to extract nested `.framework` bundles
> on Node 26.x — `node_modules/electron/dist/Electron.app/Contents/Frameworks/`
> ends up empty and Electron fails to launch with `Library not loaded:
> @rpath/Electron Framework.framework`. If you see this, run
> `npm run fix:electron` to re-extract the cached zip with the system
> `unzip` tool. Node 22 LTS does not hit this bug.

On first launch, macOS will prompt for **Screen Recording** (used only
for the screenshot export) and **Accessibility** (used so global
hotkeys work while other apps are focused). Both are optional — denying
Screen Recording just disables screenshot export; denying Accessibility
disables global hotkeys while another app is focused.

If permissions are denied and you want to grant them later:

- System Settings → Privacy & Security → **Screen Recording**
- System Settings → Privacy & Security → **Accessibility**

After granting, quit and relaunch the app.

## Default hotkeys

| Shortcut | Action |
| --- | --- |
| `⌘⇧D` | Toggle draw mode (click-through on/off) |
| `⌘⇧S` | Screenshot + save annotated PNG |
| `⌘⇧C` | Clear current display |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `Q` | Pencil |
| `P` | Pen |
| `H` | Highlighter |
| `E` | Eraser |
| `L` | Horizontal line |
| `T` | Trendline (hold `Shift` to snap to 15° / 30° / 45° / 60° / 75° / 90°) |
| `F` | Fibonacci retracement |
| `R` | Region selector |
| `A` | Arrow |
| `X` | Text |

## Profiles

- **General** — pencil, pen, eraser, hand, line, arrow, text,
  rectangle, ellipse, snip.
- **Teacher** — adds highlighter for presentations.
- **Trader** — chart-specific: trendline (Shift-snap), Fibonacci
  retracement, region selector.

Switch profile from **Settings → Profile**. The choice is remembered.

## Building installers

```bash
# macOS — set these in your shell for signed/notarized builds
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
export CSC_LINK="path/to/DeveloperIDApplication.p12"
export CSC_KEY_PASSWORD="..."

npm run build:mac       # produces release/Lekhini-1.0.0-arm64.dmg (+ x64)
npm run build:win       # produces release/Lekhini Setup 1.0.0.exe
npm run build:linux     # produces release/Lekhini-1.0.0.AppImage
```

Unsigned local builds (no notarization):

```bash
npm run build:unpacked
```

GitHub Actions on `macos-14` is the recommended CI target — same
`npm run build` command, with the secrets above set as repo secrets.

## Hard constraint: macOS fullscreen Spaces

If you put an app into **native fullscreen** (the green-button-with-Cmd
+ Ctrl+F, which moves the app into its own Space), no overlay tool —
Lekhini, Epic Pen, or anything else — can reliably float above it. The
Space is sandboxed.

**Workaround**: use **maximized non-fullscreen** windows. If you
absolutely need fullscreen, disable *"Displays have separate Spaces"*
in System Settings → Desktop & Dock, or use Stage Manager.

## Adding a new tool

1. Create `src/renderer/overlay/tools/<your-tool>.ts` exporting a
   `Tool` (see `pen.ts` for the shape).
2. Add the tool to `src/renderer/overlay/tools/registry.ts`.
3. Add an entry to `ALL_TOOLS` in `src/renderer/toolbar/App.tsx` (id,
   label, hint, icon).
4. Add a hotkey entry in `src/shared/constants.ts` `TOOL_HOTKEYS`.
5. If it needs new shape data, extend the `Item` union in
   `src/shared/types.ts` and add a renderer case in
   `src/renderer/overlay/canvas/drawItem.ts`.

## Contributing

Lekhini is community-owned by
[Open Source Bharat](https://opensourcebharat.org). Issues, ideas,
and pull requests are all welcome at
<https://github.com/opensourcebharat/lekhini>.

For releasing changes once they're merged, see
[RELEASING.md](./RELEASING.md).

## License

MIT — see [LICENSE](./LICENSE). Free for anyone to use, modify, and
distribute, including commercially. Made in India · 2026.

## Versioning

Lekhini follows [Semantic Versioning](https://semver.org). The current
version lives in `package.json` and is shown in **Settings → About**.
Release process and policy: see [RELEASING.md](./RELEASING.md).
