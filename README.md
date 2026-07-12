# Davenport

Desktop peripheral suite for creative and AI-generative workflows. Migrating from Electron to Tauri (Rust backend, OS-native webview).

**Currently building: Files** — see `MIGRATION_CONTEXT.md` for the locked migration sequence, must-preserve behavior, and priority order.

- `/src`, `/src-tauri` — active Tauri build (v2, React + TypeScript + Vite)
- `/legacy-electron` — the working Electron build (v0.2). Reference this when porting logic; do not delete until the Tauri port covers its functionality.
- `MIGRATION_CONTEXT.md` — read this first if you're picking up this repo cold.

Desktop only, permanently.
