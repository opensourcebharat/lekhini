# Changelog

All notable changes to Lekhini are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/opensourcebharat/lekhini/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/opensourcebharat/lekhini/releases/tag/v1.0.0
