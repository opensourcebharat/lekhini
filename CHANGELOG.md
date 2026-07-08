# Changelog

All notable changes to Lekhini are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] — 2026-07-08

### Fixed
- **Linux/Wayland capture** — screenshots on multi-monitor Wayland could
  grab the wrong display (`display_id` is empty under the PipeWire
  portal); capture now falls back to positional display matching.
- Capture failures on Windows/Linux now surface an error message instead
  of failing silently (the permission panel only exists on macOS).
- Overlay and toolbar re-assert always-on-top on Windows/Linux, where
  the macOS-only `screen-saver` window level doesn't apply and other
  topmost windows could cover them.
- Saved-path hint now shortens Windows home folders (`C:\Users\…`) too.

### Changed
- Keyboard-shortcut hints adapt to the platform — `Ctrl+Z`, `Ctrl+Enter`
  etc. on Windows/Linux instead of hardcoded macOS glyphs (`⌘⇧Z`).
- Native-looking fonts on every OS (system-ui first: SF Pro / Segoe UI /
  Ubuntu…), with a matching cross-platform monospace stack.
- Settings and chat panels use thin, theme-tinted scrollbars.
- Hairline borders rounded to whole pixels so they survive 125%/150%
  display scaling on Windows.
- AI chat answers, saved file paths, and error messages are now
  selectable/copyable.

### Accessibility (new)
- Keyboard focus rings on all toolbar controls (`:focus-visible`).
- Color swatches are real buttons, keyboard-reachable with ARIA labels;
  icon-only buttons gained ARIA labels.
- `prefers-reduced-motion` disables pulse animations and transitions.

## [1.1.0] — 2026-05-29

### AI (new)
- **Ask AI on a snip** — capture a region and get it *solved/answered*
  (math, code, questions, errors), not just described. A dockable chat
  panel streams the response.
- **Local-first routing** — on-device models via [Ollama](https://ollama.com)
  with a first-run setup wizard; optional cloud providers as fallback.
- **Providers**: Ollama (local), Anthropic Claude, OpenAI, Google Gemini,
  DeepSeek (text), and Sarvam AI (Indic-strong Vision OCR → LLM solve).
- **Autocorrect** for typed text and recognized handwriting (per-kind
  toggles), **handwriting recognition** (drawn ink → text via a vision
  model), and **trader chart analysis** from drawn levels.
- **On-device learning (RAG)** — accepted corrections are remembered
  locally to personalize suggestions; nothing leaves the machine.
- **Per-profile** system prompts and model overrides in Settings → AI.
- Follow-up questions retain full conversation context (image/OCR carried
  across turns) until a new snip starts a fresh conversation.

### Auto-update (new)
- Background auto-update from GitHub Releases via `electron-updater`:
  downloads in the background and applies on quit. Settings → Updates adds
  an automatic-updates toggle, a manual check, and restart-to-update.
  (macOS auto-update activates once the build is signed + notarized.)

### Build & release (new)
- Tag-driven release automation: `npm run release[:minor|:major]` bumps
  the version, rolls the changelog, commits, tags, and pushes.
- GitHub Actions builds macOS / Windows / Linux on a `v*` tag and
  publishes installers + update manifests to GitHub Releases.
- macOS builds now also emit a `.zip` (for Squirrel.Mac auto-update).

## [1.0.0] — 2026-05-20

Initial open-source release of Lekhini, by
[Open Source Bharat](https://opensourcebharat.org). MIT licensed.
Made in India.

### Drawing tools
- Pencil — graphite-textured stroke with hard tip, uniform width, pressure-free.
  Graphite color is the tool's identity; changing color auto-promotes to pen.
- Pen — clean inked stroke with pressure-driven thinning and soft tapers.
- Highlighter — flat-width marker with multiply blend.
- Eraser — width-aware ring cursor, size persists per-tool.
- Shapes — H/V line, trendline (Shift snap to common angles), Fibonacci
  retracement, rectangle, ellipse, arrow, text.
- Hand tool — select, move, and edit committed strokes/shapes.
- Snip — region capture with annotations baked into the saved PNG.

### Toolbar
- Vertical (default) and horizontal layouts. Layout choice persists.
- Tool-aware dynamic cursors (pencil, pen, highlighter, eraser ring).
- Per-tool thickness memory; inline thickness popup with 4 preset chips.
- Status dot indicator (green = drawing, red = idle), click to toggle.
- Profile selector: General, Teacher, Trader.
- Theme: dark / light. Settings panel with profile + appearance options.
- Dynamic window sizing — toolbar shrinks/grows to its content.
- Collapse icon to minimize toolbar to a single pill.

### Engine
- Transparent always-on-top overlay with one BrowserWindow per display.
- Click-through by default; toggles to drawing surface via `⌘⇧D`.
- `perfect-freehand` strokes with input pre-smoothing tuned per tool.
- Two-canvas rendering (committed + live) for sub-frame stroke updates.
- Snapshot-based undo/redo (capped at 100 entries).

### Persistence
- Orientation, theme, profile, active tool, color, and per-tool widths
  persist across restarts via `electron-store` with schema-tolerant
  hydration (older installs auto-migrate).

### Platform
- macOS (signed/notarized .dmg via electron-builder).
- Windows and Linux build targets are wired but unsigned.

[Unreleased]: https://github.com/opensourcebharat/lekhini/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/opensourcebharat/lekhini/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/opensourcebharat/lekhini/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/opensourcebharat/lekhini/releases/tag/v1.0.0
