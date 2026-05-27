# Changelog

All notable changes to Dockyard are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — Initial MVP Release

### Added
- Four-panel UI: sidebar dock list, asset grid, inspector, top bar
- SQLite-backed persistent storage (`~/Dockyard/dockyard.db`)
- Local asset import via file dialog and drag-and-drop
- Five default docks on first run: Images, Audio & Music, Typography, Prompt Library, Documents
- Asset types: image, vector, audio, video, font, color, prompt, document, code, other
- Per-asset metadata: title, tags, notes, source, license, prompt block
- Tag editor with add/remove
- Search and type filter per dock
- Grid view with adjustable thumbnail sizes
- List view with tabular layout
- Inspector panel with META / PROMPT / SOURCE tabs
- Audio waveform display and play/pause toggle (visual mock)
- Always-on-top / PIN mode
- Compact strip mode
- Dock export (manifest JSON)
- New dock creation with name, description, accent color
- Asset deletion
- Open file in native system app
- Phosphor green CRT terminal aesthetic
- GitHub Actions: CI on push, multi-platform release build on tag

### Known Limitations
- Thumbnails are placeholder renders, not actual image previews
- Audio playback is UI mock only (no actual audio engine yet)
- Drag-out to external apps not yet implemented (requires Electron `startDragging`)
- Dock export produces manifest JSON, not full `.dockyard.zip` package
- No dock import yet
- No semantic search, CLIP embeddings, or color clustering
