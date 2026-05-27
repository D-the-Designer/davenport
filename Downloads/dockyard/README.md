# DOCKYARD

**Universal floating asset dock for designers, artists, editors, filmmakers, and production teams.**

Dockyard is a local-first desktop application that lives alongside your other tools — a persistent, always-available asset layer that works with Adobe apps, Blender, Figma, VSCode, DAWs, and anything else you run. Think of it as a production tool wall: drag assets in, organize them into docks, and drag them out into any application.

```
DOCK: IMAGES  [24]  ●  LOCAL · OFFLINE READY          14:22:07 ●
```

---

## What It Does

- **Drag assets in** from anywhere — file dialog or drop
- **Organize into docks** — Images, Audio, Typography, Prompts, Documents, or your own
- **Preview and inspect** — type-aware thumbnails, metadata, tags, notes, prompt blocks
- **Drag assets out** into any application as normal files
- **Persist everything** — SQLite database, local filesystem, no cloud required
- **Run always-on-top** — PIN mode keeps Dockyard visible above your working apps
- **Compact strip mode** — collapse to a minimal floating tray

---

## Download

Go to [**Releases**](https://github.com/YOUR_USERNAME/dockyard/releases) and grab the installer for your platform:

| Platform | File |
|----------|------|
| macOS (Apple Silicon + Intel) | `Dockyard-0.1.0.dmg` |
| Windows | `Dockyard-Setup-0.1.0.exe` |
| Linux | `Dockyard-0.1.0.AppImage` |

### macOS note
If macOS says the app is from an unidentified developer:  
`System Settings → Privacy & Security → Open Anyway`

### Linux note
Make the AppImage executable before running:
```bash
chmod +x Dockyard-0.1.0.AppImage
./Dockyard-0.1.0.AppImage
```

---

## Run From Source

**Requirements:** Node.js 18 or 20, npm

```bash
git clone https://github.com/YOUR_USERNAME/dockyard.git
cd dockyard
npm install
npm run electron:dev
```

The app opens a native window. Your data is stored at `~/Dockyard/`.

---

## Build Installers Locally

```bash
# macOS (.dmg — must run on macOS)
npm run electron:build:mac

# Windows (.exe — must run on Windows or use CI)
npm run electron:build:win

# Linux (.AppImage — must run on Linux or use CI)
npm run electron:build:linux
```

Output goes to `dist-electron/`.

---

## Data & Storage

Dockyard stores everything locally in `~/Dockyard/`:

```
~/Dockyard/
├── dockyard.db      # SQLite database — all docks and asset metadata
├── assets/          # Copies of imported files
└── exports/         # Dock manifests and export packages
```

No account. No cloud. No telemetry. The database is a standard SQLite file — open it with any SQLite browser if you need to.

---

## Asset Types

| Type | Formats |
|------|---------|
| Image | PNG, JPG, JPEG, WEBP, GIF |
| Vector | SVG |
| Audio | MP3, WAV, AIFF, OGG, M4A |
| Video | MP4, MOV |
| Document | TXT, MD, PDF |
| Prompt | Text-based prompt blocks (stored as metadata) |
| Font | OTF, TTF *(planned)* |
| Color | Swatch assets *(planned)* |

---

## Architecture

```
dockyard/
├── electron/
│   ├── main.cjs       # Main process: window, IPC, SQLite, file I/O
│   └── preload.cjs    # Context bridge: exposes safe API to renderer
├── src/
│   ├── main.jsx       # React entry point
│   └── App.jsx        # All UI components
├── public/
│   └── entitlements.mac.plist
├── .github/
│   └── workflows/
│       ├── ci.yml         # Build check on push/PR
│       └── release.yml    # Multi-platform installer build on tag
├── index.html
├── vite.config.js
└── package.json
```

**Stack:** Electron · React · Vite · SQLite (better-sqlite3) · Monospace terminal UI

---

## Releasing a New Version

1. Update `version` in `package.json`
2. Add an entry to `CHANGELOG.md`
3. Commit and tag:

```bash
git add .
git commit -m "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

GitHub Actions builds `.dmg`, `.exe`, and `.AppImage` automatically and attaches them to the release.

---

## Roadmap

**v0.2 — Core completions**
- [ ] Real image thumbnails (sharp)
- [ ] Audio waveform from file buffer (Web Audio API)
- [ ] Drag-out to external apps (Electron `startDragging`)
- [ ] Dock export as `.dockyard.zip`
- [ ] Dock import / package unpacking
- [ ] Prompt block linking to assets

**v0.3 — Polish**
- [ ] Edge docking / snap to screen edge
- [ ] Multi-dock drag tray in compact mode
- [ ] Keyboard shortcuts
- [ ] Asset relationship linking

**v0.4 — Power features**
- [ ] Semantic search (CLIP embeddings, local)
- [ ] Color palette extraction from images
- [ ] Font preview rendering
- [ ] LUT / brush / shader asset types
- [ ] Optional cloud sync (Dropbox / S3)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Dockyard is **production infrastructure**. Contributions that make it faster, more reliable, and more useful to working production teams are welcome. Features that add social layers, cloud dependencies, or startup-product aesthetics are out of scope.

---

## License

MIT — see [LICENSE](LICENSE).

---

```
YOUR ASSETS. YOUR SYSTEM. ANYWHERE.
```
