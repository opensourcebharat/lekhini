# Contributing to Lekhini

Thanks for thinking about contributing to Lekhini — every fix,
feature, doc improvement, and bug report makes the project better.
Lekhini is community-owned by
[Open Source Bharat](https://opensourcebharat.org) under the MIT
license. Anyone is welcome to participate.

This document covers the practical bits: how to set up a dev
environment, what we expect from a contribution, and how the review /
release flow works.

## Code of Conduct

Before contributing, please read our
[Code of Conduct](./CODE_OF_CONDUCT.md). Lekhini follows the
Contributor Covenant 2.1. Behaviour that violates it will be acted on
regardless of how technically valuable the contribution is.

## Setup

```bash
git clone https://github.com/opensourcebharat/lekhini.git
cd lekhini
npm install
npm run dev          # starts Vite + Electron with HMR
```

Node 22 LTS is the supported version. Node 26 has a known Electron
postinstall issue — see the note in [README.md](./README.md#running-locally).

## Project layout

See [README.md → Project layout](./README.md#project-layout) for the
full file tree. The short version:

- `src/main/` — Electron main process (window factories, hub state,
  hotkeys, capture, persistence)
- `src/renderer/overlay/` — per-display transparent drawing surface
- `src/renderer/toolbar/` — the floating toolbar UI (Solid.js)
- `src/shared/` — types + constants shared between main and renderer

## Reporting bugs

Open an issue at <https://github.com/opensourcebharat/lekhini/issues>
and include:

- Lekhini version (shown in **Settings → About**)
- OS + version (macOS 14.x, Windows 11, Ubuntu 24.04, etc.)
- Steps to reproduce
- What you expected vs. what actually happened
- A screenshot or short screen recording if the bug is visual

For security issues, **do not open a public issue.** See
[SECURITY.md](./SECURITY.md) for how to report privately.

## Proposing a feature

Open an issue describing the use case before writing a large PR. This
saves you time — we may already have plans for that area, or have a
specific direction we want it to take. Small features and bug fixes
can be opened directly as PRs.

## Making changes

1. Fork the repo and create a branch off `main`. Branch name
   convention: `feat/<short-description>`, `fix/<short-description>`,
   `docs/<short-description>`.
2. Make your changes. Keep them focused — one logical change per PR.
3. Run the typecheck before pushing:
   ```bash
   npm run typecheck
   ```
4. If you've changed CSS or interaction, verify your changes in the
   running app (`npm run dev`). Lekhini is a UI tool — typecheck
   alone won't catch visual regressions.
5. Update [CHANGELOG.md](./CHANGELOG.md) under the `[Unreleased]`
   section if your change is user-visible.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org)
prefixes when possible:

- `feat:` — new user-visible feature
- `fix:` — bug fix
- `docs:` — documentation only
- `style:` — formatting / no behavior change
- `refactor:` — code change with no behavior change
- `perf:` — performance improvement
- `test:` — adding/fixing tests
- `chore:` — build / tooling / dependency bumps

Examples:

```
feat: add eraser size persistence
fix: pencil color reset on tool re-selection
docs: clarify Node 22 requirement
```

## Pull requests

When opening a PR, please:

- Reference the issue it fixes (`Fixes #123`).
- Describe what the change does and why.
- Include before/after screenshots for UI changes.
- Keep the diff focused. If you find unrelated cleanups along the way,
  open a separate PR for them.

A maintainer will review your PR. We aim to respond within a week.

## Adding a new tool

If you're adding a new drawing or annotation tool, see the
**Adding a new tool** section in [README.md](./README.md#adding-a-new-tool).

## Releases

Maintainers cut releases following the policy in
[RELEASING.md](./RELEASING.md). Contributors don't need to bump
version numbers in their PRs.

## Questions

If something isn't covered here, open a Discussion at
<https://github.com/opensourcebharat/lekhini/discussions> or ask on
the issue you're working on. We'd rather you ask than guess.

Welcome to the project. 🙌
