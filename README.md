# DAVENPORT FILES v0.2

**Local-first asset manager for every program, every file type, every workflow.**

---

## Install & Run

**Requirements:** Node.js 18+, npm

```bash
unzip davenport-files-v0.2.zip
cd davenport-files-v2
npm install
npm run electron:dev
```

App opens as a native window. Data stored at `~/Davenport Files/`.

## What's New in v0.2

- Real drag-in from Finder — drop files directly onto the asset grid or strip
- Real drag-out to any app — drag assets into Photoshop, Blender, Word, anything
- Assets auto-renamed on import — Container-Name_001.ext
- Original filename stored in metadata automatically
- WebP → PNG auto-conversion
- Sharp thumbnail generation for images
- Infinitely nestable containers
- Three view modes — Grid, List, Manifest
- Manifest view — pre-export audit table
- Asset states — RAW / WORKING / APPROVED / FINAL
- Container export as .davenport-files.zip
- Container import from .davenport-files.zip
- Prompt blocks with copy-to-clipboard
- F9 hide/show · F2 jump to Raw
- Full phosphor green CRT palette

## Build Installers

```bash
npm run electron:build:mac    # .dmg
npm run electron:build:win    # .exe
npm run electron:build:linux  # .AppImage
```

## Data Location

```
~/Davenport Files/
├── davenport-files.db       SQLite database
├── assets/           All imported files (renamed)
├── thumbnails/       Generated previews
└── exports/          .davenport-files.zip packages
```

## License

MIT
