# Changelog

## [0.2.0] — v0.2 Release

### Added
- Full SQLite persistence — projects, containers, assets, notes
- Projects with brief (client, scope, deliverables, deadline, status)
- Infinitely nestable containers — containers inside containers
- Default containers on first run: Raw, Working, Brand Package
- Real drag-in from Finder — native file drop with path extraction
- Real drag-out to any app — Electron startDragging() API
- Real file copy to ~/Dockyard/assets/ on import
- Auto-rename on import — assets inherit container name + sequence number
- Original filename stored in metadata automatically
- WebP → PNG auto-conversion on import
- Sharp thumbnail generation for images
- Asset state management — RAW / WORKING / APPROVED / FINAL
- Three view modes — Grid, List, Manifest
- Manifest view — full audit table with ID, name, type, state
- State filter alongside type filter
- Compact strip mode — floating thumbnail tray
- Strip as live drop target
- Container export as .dockyard.zip (archiver)
- Container import from .dockyard.zip (unzipper)
- Prompt block tab with copy-to-clipboard
- Tag editor with add/remove
- Notes field on assets (plain text, auto-save on blur)
- Keyboard shortcuts: F9 hide/show, F2 jump to Raw
- Always-on-top / PIN mode
- Phosphor green CRT aesthetic — full locked palette
- Scanline overlay on all asset thumbnails
- Zero border-radius throughout
- Keyboard bar: F1 CONTAINERS · F2 RAW · F3 SEARCH · F9 HIDE
- Live clock in status bar

### Changed from v0.1
- Docks → Projects + Containers
- Collections replaced by infinitely nestable containers
- All UI text uppercase monospace
- Orange accent replaced with phosphor green (#4AFC6A) palette
- Amber (#D4A832) reserved for audio waveforms only
