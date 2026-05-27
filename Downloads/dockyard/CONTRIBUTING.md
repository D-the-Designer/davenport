# Contributing to Dockyard

Dockyard is open to contributions. Read this first.

## Philosophy

Dockyard is **production infrastructure**, not a startup product. Every contribution should make it faster, more reliable, or more useful to working designers, editors, and production teams. Features that add complexity without adding workflow value will be declined.

## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/dockyard.git
cd dockyard
npm install
npm run electron:dev
```

## Project Structure

```
dockyard/
├── electron/
│   ├── main.cjs        # Electron main process, IPC handlers, SQLite
│   └── preload.cjs     # Context bridge — exposes API to renderer
├── src/
│   ├── main.jsx        # React entry point
│   └── App.jsx         # Full UI — all components in one file for MVP
├── public/
│   └── entitlements.mac.plist
├── .github/
│   └── workflows/
│       ├── ci.yml      # Lint + build on push/PR
│       └── release.yml # Build installers on tag push
├── index.html
├── vite.config.js
└── package.json
```

## Dev Workflow

- `npm run electron:dev` — runs Vite dev server + Electron with hot reload
- `npm run build` — Vite build only (for testing renderer output)
- `npm run electron:build:mac` / `:win` / `:linux` — produce installers

## Submitting PRs

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-thing`
3. Keep commits focused and descriptive
4. Open a PR against `main` with a clear description of what and why

## Priorities for Contribution

High value:
- Real thumbnail generation (sharp, canvas)
- Real audio waveform from file buffer (Web Audio API)
- Drag-out to external apps (Electron `startDragging`)
- Dock export as `.dockyard.zip` (JSZip or archiver)
- Dock import / package unpacking
- Prompt block linking to assets

Lower priority for MVP:
- Cloud sync
- Collaboration
- Plugin system
