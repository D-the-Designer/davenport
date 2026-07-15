# Davenport — State of the Build
### Handoff document, compiled 2026-07-14, for GPT Sol to continue build work

This document reconciles decisions made across several separate sessions (Claude, and at least one other tool/session referred to as a "Tauri 2 contract handoff"). Some items below are locked and safe to build against. Some are **flagged as open** — genuinely contradictory or superseded state that needs a human decision before that specific piece is built. Read the flagged section before touching Board, the session log, or Desk's scope.

---

## 1. Priority right now

D needs **Files, Notes, and View** working for real, immediate use (a novel rewrite, "Company Man," is blocked on Notes specifically). Board and the newer Deck/Pad work are explicitly paused — not abandoned, just not urgent. Do not let Board or Deck work block or delay Files/Notes/View.

**Critical path:** Files runtime verification → Notes build (no open architecture questions, should move fast) → View (harder, see §3).

---

## 2. Naming (locked, confirmed no conflicts in informal search)

- **Manufacturer/company name:** Daventools
- **Product name:** Davenport (suite) / Davenport Desk
- Byline: *"Davenport Desk by Daventools"*
- Trademark landscape checked informally (not legal advice): original A.H. Davenport furniture co. is defunct/genericized, no conflict. Closest live marks are Davenport Group (IT managed services, unrelated space) and Davenport Manufacturing Group LLC (2024 trademark application covering software design, but their actual business is metal fabrication — unrelated). Formal clearance search recommended before commercial launch.

---

## 3. Build status per tool

| Tool | Status |
|---|---|
| **Files** | Code-complete. `davenport-core` Rust crate (atomic file utils, deterministic naming, `.davenport/index.sqlite` rebuildable index, typed command registry for GUI/CLI/agent parity), CLI binary with full parity, Tauri 2 shell + React/Vite frontend (List view, F-key strip, drag in/out, PIN/NARROW, breadcrumbs). All seven §27.5 acceptance criteria passed via `cargo test`. **Never runtime-verified in a live webview** — needs an actual dev environment (Claude Code or similar), not a chat interface. |
| **Notes** | Not built. No open architectural questions remain. Next in build sequence immediately after Files is runtime-verified. Should move fast once unblocked. |
| **Board** | Drafted into spec today (§10.3, link-only model: manifest + native text blocks, asset items are links into one paired Files project, never copies — this was a real correction, the old v1.0 doc said Board copied assets, that was wrong and has been fixed). **However:** a separate, more recent session referred to Board as reclassified — "moved from v1 Trio to commercial module candidate, pushed to LATER." That reclassification is not reflected in the current spec draft and has not been confirmed as still-current by D. **Do not treat Board as urgent or blocking** regardless of which status is correct — D has explicitly deprioritized it for now. |
| **View** | Not built. The hard one. Working hypothesis (documented, unconfirmed): View may not need a separate browser engine — Tauri windows are already OS-native webviews, so View could be the same webview primitive every other tool's window uses, pointed at an external URL with a persistent cookie store instead of Davenport's own UI. Native-window-attachment remains an open spike requiring frontier-level reasoning, not standard build work. Attribution-capture validation against real target sites is a related, also-unresolved spike. |
| **Draw, Palette, Album, Reel, Post, Tray, Case, Terminal** | Spec'd (v1.0 doc), not built, not currently on the critical path. |
| **Desk** | See §5 below — recently got real architectural definition (Desk/Drawer/Cabinet), but there's also a "Desk Core vs. Controlled Desk" split from another session that isn't fully reconciled with that. Flagged in §6. |

---

## 4. Tech stack (confirmed, no open questions)

- **Tauri 2**, Rust backend, OS-native webview
- **React + Vite + TypeScript** frontend
- **SQLite** via Tauri plugin (rusqlite) — `.davenport/index.sqlite`, per-project, rebuildable index only, never a source of truth. Real files in real folders are ground truth.
- Repo: `D-the-Designer/dockyard` (private, legacy name retained), branch `main`
- GitHub workflow: API-direct (fetch SHA → PUT content), never git credentials; tokens generated fresh and revoked immediately after each session
- Typography: Share Tech Mono. Palette: phosphor green `#4AFC6A` on near-black `#080C09`, amber `#D4A832` (audio indicators only, one-job reservation), alert-red (suppressed-notification indicators only, same one-job discipline)
- Migration: Electron → Tauri already confirmed correct; Flutter assessed and ruled out
- Four-way parity requirement on every durable operation: keyboard / accessibility / CLI / agent

---

## 5. Architecture vocabulary — locked today, drafted into spec §12.7

**Desk, Drawer, Cabinet — Container Hierarchy:**

- **Desk** = invisible container holding arranged tool instances (Drawers). Sits beneath the working surface in z-order — the primary whitelisted app stays topmost, Desk and its contents sit beneath as scaffolding. Multiple Desks can be open simultaneously, each with its own whitelisted primary app pinned above it.
- **Drawer** = invisible per-instance chrome wrapper (grab strips, PIN/NARROW, breadcrumb, COPY) that every tool instance lives in. Formalizes the existing "window" language from §12.3.
- **Cabinet** = fixed to Desk, native to Files only (not a generic structure — Board, Notes, etc. have no Cabinet). Holds Files' RAW/WORKING/APPROVED/FINAL containers.
- Opening something = pulling an asset out of Cabinet, or a tool out of a Drawer, onto the working surface.

This vocabulary is also now reflected in §10.3 (Board) and §10.7 (View): both tools live in Drawers, neither has a Cabinet.

**Davenport Deck** (renamed from an earlier "Davenport Pad" concept): a constrained Desk shell, not a separate product — "every Deck is a Desk, not every Desk is a Deck." One primary surface (single whitelisted external app, or one Davenport module) surrounded by small "Caddies" (compact per-module presentations). Form-factor classes: Full Deck, Panel Deck, Pen Deck, Strip Deck, Ticker Deck, Glance Deck — all configs of one system, not separate products. Shares the same runtime/state/provenance/logging/permissions as Desk; must never fork project truth into a separate store. **Not yet reconciled with Pad's prior formalization — see §6.**

---

## 6. Open items — need a decision before building, flagged rather than resolved

**A. Board's status is ambiguous.** Current spec draft treats it as an active v1 tool (six-tool ship scope: Files, Notes, Board, Draw, View, Desk). A separate, more recent session logged it as reclassified to "commercial module candidate, pushed to LATER" (§26.2 reference). Not urgent to resolve since D has deprioritized Board regardless — but whoever picks this up should know the spec draft and that other session disagree on Board's category.

**B. Two names may be circling one feature: the Desk-level activity log.** This conversation locked the name **"black box"** for a Desk-level append-only activity log (activate/deactivate, whitelisted app pinned, Drawers opened/closed, dock changes, Desk switches) — feature not yet drafted, only the name is locked. A separate, more recent session describes `davenport.sessionlog` evolving into **`.davenport/operations.jsonl`** — semantic operation logging with a RECORDED / OPERATOR NOTE / INFERRED / PROPOSED provenance ladder. These may be the same feature at two different levels of design maturity, or genuinely separate (Files-level per-operation log vs. Desk-level session log). Needs one reconciled model, not two parallel logs both claiming authority.

**C. Desk Core vs. Controlled Desk.** One session split Desk into "Desk Core" (arrange/restore — ships first) and "Controlled Desk" (notification suppression, app whitelist/punch-through — deferred, platform-permitting). This maps suspiciously well onto today's work: the Desk/Drawer/Cabinet container hierarchy (§12.7, arranging and holding tool instances) sounds like Desk Core; the whitelist-enforcement and z-order/punch-through material in §10.13 sounds like Controlled Desk. **Suggested reading, not confirmed:** treat §12.7 as Desk Core (buildable now), treat whitelist/notification-suppression as Controlled Desk (deferred spike). Worth confirming rather than assuming.

**D. Pad's prior formalization vs. the new Deck white paper.** Before this rename, "Pad" had already been formalized in another session as a named module with its own MVP acceptance criteria and spike questions, flagged as a commercial candidate — more developed than a circle-back idea. The Deck white paper handed off today is a fuller architectural treatment but was developed independently. These need to be reconciled into one spec, not treated as two separate proposals landing on the same name.

**E. COPY behavior in Notes may be stale in the v1.0 doc.** Current spec text (§8.2, §10.2) describes COPY toggling between rendered output and raw Markdown source. A separate session corrected this: COPY never changes editing mode — rendering/preview are separate commands. This correction has not been applied to the spec draft.

**F. "Caddy" has two different weights right now.** An early circle-back note describes a small thing holding tool links and lightweight tools (eyedropper, workspace app links) — light, unlocked. The Deck white paper's Caddy is a full compact-module-presentation system (Files Caddy, Agent Caddy, Queue Caddy, etc.) with its own view tiers. Likely the same idea maturing, not two ideas — worth merging explicitly.

None of A–F block Files, Notes, or View. They matter for Board, Desk's fuller scope, and Deck — all currently non-urgent.

---

## 7. Source documents

- `Davenport-UX-Spec-v1.0.docx` — the working spec document (this session's edits: Daventools/Davenport Desk naming, §12.7 Desk/Drawer/Cabinet, Board link-model correction, View webview-primitive hypothesis)
- `Davenport-Trio-Overview.docx` — earlier product overview (Files/Notes/Board framing, predates the six-tool ship scope)
- Davenport Deck White Paper v0.1 (external, handed off separately) — full Deck architecture, not yet integrated into the spec doc
- A separate "Tauri 2 contract handoff" session referenced a `v1.2` spec with sections up through §27 (Phase 0 contracts, build canon, milestone definitions) that is **not the same document** as the v1.0 docx above — sections referenced there (§19–27, §24.2, §26.2, §27.1, §27.2) don't exist in the v1.0 draft. Whoever has access to that v1.2 document should treat it as more current than v1.0 for anything it actually covers, and the v1.0 doc as authoritative for everything else until reconciled.

---

*Compiled from this session's work plus cross-referenced past conversations. Items in §6 are flagged, not resolved — they reflect genuine open forks in the project's history across sessions, not errors to silently pick a side on.*
