# Changelog

## 4.0.0 · 2026-10-10

### Added
- Decision toolkit: Brief studio, Decision matrix (veto criteria, rank stability, flip analysis), Pilot designer + sample-size calculator, Stakeholder map, Risk register + Anti-Inversion check, Logic model.
- Model lab: discounted cost-per-outcome model; seeded Monte Carlo (percentiles, histogram, tornado, saved runs).
- Classroom mode: class kits, student passport, consent-gated submission packets, formative review (no ranking).
- Field Guide (7 chapters) with parallax bands; sticky contents rail; reading progress; builder notes (purpose / extend / outcome) on every section.
- Client-side search and command palette; gamification HUD; constellation visualiser; lens chooser and pathways; example data.
- EN / ES / FR interface; settings dialog (theme, text size, spacing, dyslexia-friendly, contrast, motion, parallax, splash, backup cadence, youth-safe mode); read-aloud.
- Hash-chained ledger, encrypted backups, optional signatures, restore points, multi-tab revision safety.
- System check (capabilities, module health, network transparency, local analytics viewer, accessibility scan, 22 self-tests).
- Strict Content-Security-Policy with script hashes; air-gapped edition (`strict/index.html`).
- Reproducible build with static checks; test suites (smoke, features, deep, resilience).

### Changed
- Persistence moved to one IndexedDB (`empowerment_os_v4`); v3 data migrates automatically and is left untouched.
- Splash controller is inline, persists "do not show again", never traps focus.
- Core: toasts/downloads/navigation/theme delegated to v4 modules; deletes snapshot a restore point first; no startup toast.
- Collaboration rewritten (see behaviour changes). Local AI rewritten (blob worker, streaming, stop, unload).

### Fixed
- Stuck splash on `file://` (external module scripts).
- v3 shared "local only" records in room snapshots.
- Non-existent WebLLM model id in v3.
- Silent last-write-wins between browser tabs.
- Domain brief / source cards no longer depend on `fetch` of local JSON.

### Removed / now opt-in
- Automatic public-room connection on entry (now consent-gated, off in youth-safe and strict modes).
- Automatic service-worker registration (now a button).
- Third-party runtime hosts are never contacted unless the person starts an optional feature.
