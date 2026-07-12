# Davenport → Tauri Migration: Context for Claude Code

Read this first. It covers decisions made in planning that aren't fully written into the spec doc yet, plus the locked behavior Files must preserve from the Electron build.

## Current State

- Fresh Tauri v2 + React/TypeScript/Vite scaffold generated via `create-tauri-app`, becoming the new root of this repo (`D-the-Designer/dockyard` — legacy name, product is Davenport).
- The existing Electron build (React + Vite + better-sqlite3 + Sharp) has a working Files implementation. **Port its logic — don't rebuild Files from scratch.** Find it in repo history / the pre-migration branch.
- Target stack: Tauri (Rust backend, OS-native webview) + React/Vite frontend (unchanged) + `tauri-plugin-sql`/`rusqlite` for SQLite + Rust `image`/`fast_image_resize` for thumbnails.

## Priority — Read This Before Touching Anything Else

**Files is the tentpole.** Full build, all six migration steps below, before Notes, Board, or anything else. Do not partial-build Files to unblock other tools faster — that tradeoff was explicitly considered and rejected.

## Migration Sequence (locked order)

1. Tauri project + React/Vite frontend wired up — **done** (this scaffold)
2. SQLite via Tauri plugin — prove read/write
3. Filesystem ops — import, rename, thumbnails
4. Window management — grab strips, PIN, NARROW
5. Intra-suite snapping — dock-as-unit in Rust
6. All three view modes — Grid, List, Manifest

## Files — Must-Preserve Behavior

- Three view modes: Grid (visual browsing), List (detail), Manifest (surfaces original filename + import timestamp per auto-rename/metadata spec)
- Assets auto-renamed on import: container name + sequence number. Original filename preserved in metadata, not lost.
- Four states, visible in all view modes: RAW / WORKING / APPROVED / FINAL
- Drag-in from Finder: copies the file, offers to delete the original. **KEEP is the safe default** — never default to deleting the source.
- Files-to-Files duplication is a distinct, valid operation (not the same code path as import).
- Breadcrumb always visible, always links to the real on-disk path. This is Design Rule #1, non-negotiable: "We will ALWAYS show file structure and breadcrumbs and it will link to real file directories. This is NOT modern flat design goo."
- SQLite is index/cache only — thumbnails, state, metadata. **Never the content store.** The files on disk are the actual data; SQLite could be deleted and rebuilt from the filesystem with no data loss.

## Filesystem Layout (target)

```
~/Davenport/
├── [PROJECT]/
│   ├── davenport.config          ← workspace layout, window positions
│   ├── davenport.sessionlog      ← append-only, human-readable activity log
│   └── FILES/
│       ├── RAW/
│       ├── WORKING/
│       ├── APPROVED/
│       └── [USER FOLDERS]/       ← infinitely nestable
├── davenport.sqlite               ← shared across all projects, index/cache only
```

## Object Model (new — decided this session, not yet drafted into spec)

- Every Davenport widget instance addresses exactly one object — no internal tabs, no multi-item switcher. This is an interaction-level guarantee, not just a data-model description.
- Files is **container-scoped**: one instance's single "object" is the project directory itself; the many files inside are the container's contents, not separate objects the widget juggles. Board is the other container-scoped tool in v1.
- Files is the **primary/downstream driver**: every tool whose object is a file (Notes, Board, Draw) writes into the project directory Files manages. Files doesn't need to be open for this to be true.
- View is the one exception — its object is a URL, not a file, so it's a peer inbound source to Files rather than downstream of it. Not relevant to this build phase, noted for context.

## v1 Ship Scope (locked this session)

Files, Notes, Board, Draw, View, Desk. Palette, Album, Reel, Post, Tray, Case, Terminal are fully specced but deferred to v2+. Only Files is in active build right now.

## Aesthetic / Palette (must match exactly)

- 1978 Hazeltine CRT terminal aesthetic. Phosphor green on near-black, Share Tech Mono typeface, ALL CAPS labels, scanline overlay (CSS `repeating-gradient` — zero GPU cost, no WebGL/Canvas for chrome), square corners, no icons, no animation, F-key strip.
- Locked palette tokens — use CSS variables from day one, never hardcode:
  - Primary green: `#4AFC6A` — general UI
  - Near-black: `#080C09` — base background
  - Amber: `#D4A832` — reserved for audio indicators only, one job
  - Alert-red — reserved for suppressed-notification counts only (Desk feature, not relevant to Files, but the color must never be used elsewhere)

## Files Commands (section 16.4 — implement these)

```
^N  New project        ^I  Import files       ^A  Select all
^F  Filter/search       ^G  Grid view          ^L  List view
^T  Manifest view       ^D  Duplicate asset    ^Delete  Trash (confirm)
```
F-key strip: `F1 HELP · F2 RENAME · F3 SEARCH · F4 IMPORT · F5 MOVE · F6 COPY · F7 STATE · F8 DELETE`

Universal commands (every tool, not just Files): `^P` PIN toggle, `^M` NARROW toggle, `^W` close (autosave flush, no dialog), `^Space` command palette. **`^S` does nothing** — no save command exists anywhere in the suite, autosave is the feature.

## Performance Requirement

Hard requirement: performance parity with OS utilities (Notepad-class). Must run on Raspberry Pi and decade-old hardware with no GPU requirements. This is why Tauri was chosen over Electron in the first place — keep an eye on it as Files gets built out.
