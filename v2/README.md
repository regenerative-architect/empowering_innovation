# Empowerment Recursive Innovation OS · v4.0

A local-first, offline-capable workspace that helps **policy makers, corporate decision makers, teachers and students** turn evidence into safe, accountable action. One standalone `index.html`: no account, no tracking, no external fonts, nothing sent anywhere unless you choose.

**Open `index.html` in a modern browser (double-click works).** To host it, serve this folder over HTTPS or localhost.

## What is in v4

**Built on v3 (kept, working):** ten empowerment engines, evidence library, project builder and workspace, innovation genome foundry, model lab, research studio, protocol, field intelligence.

**New decision and learning tools**
- **Decision toolkit:** Brief studio (policy / corporate / classroom, print-ready, "limits and unknowns" cannot vanish) · Decision matrix with safeguard (veto) criteria, rank-stability test and "what would flip it" · Pilot designer with sample-size calculator (two rates, two means, survey, clustered designs) · Stakeholder map that flags groups who are affected but not heard · Risk register with early-warning signs · **Anti-Inversion check** (how could a helpful feature be flipped into surveillance, coercion, exclusion or extraction?) · Logic model with "unexamined arrow" detection.
- **Model lab upgrade:** discounted cost-per-outcome model and a **seeded Monte Carlo** view (percentiles, histogram, tornado chart, saved runs). Reproducible; labelled "not a forecast".
- **Classroom mode:** teacher class kits (plain files, no student data) · student passport with consent-gated hand-in packets (nickname only; digest-checked) · formative teacher review with no ranking and no total scores · youth-safe mode.

**Platform**
- Long-form **Field Guide** with parallax bands (CSS scroll-driven animation, JS fallback, reduced-motion aware) and collapsible chapters · sticky contents rail with scroll-spy · reading progress · **client-side search and command palette** (Ctrl/Cmd+K, accent-folding, typo tolerance, searches your own records) · **gamification HUD** (XP, forgiving streak, weekly quests, badges; no leaderboards, resettable) · **constellation** state visualiser (`<ep-constellation>`, text alternative included) · lens chooser and role pathways · labelled example data (one click to remove).
- **EN / ES / FR interface**, live switching, stored locally (ES/FR drafted for this build: have fluent speakers review before public release; research text stays English).
- Accessibility: keyboard-complete, dialogs via `<dialog>`, ARIA tabs/combobox, high-contrast and dyslexia-friendly modes, text size, reduced motion, forced-colors support, read-aloud, print stylesheet and print-sheet mode, noscript fallback.

**Trust**
- **Hash-chained ledger** (decisions, evidence, corrections, null results) with an auditor check · **passphrase-encrypted backups** (PBKDF2-SHA-256 600,000 iterations + AES-GCM) · optional **ECDSA signatures** (non-extractable key) · **restore points** before imports, conflicts and deletes · **multi-tab safety** (stale tabs cannot silently overwrite) · **System check**: capability matrix, module health, **network transparency** (every host contacted), local-only analytics viewer (off by default, exportable, erasable), accessibility scan, 22 self-tests.
- Strict **Content-Security-Policy with script hashes** (no `unsafe-inline` for scripts).

## Two editions
| File | Network behaviour |
|---|---|
| `index.html` | Full edition. Makes **no** requests by default. Optional internet rooms (Trystero) and local model download (WebLLM) load pinned code only after a consent dialog. |
| `strict/index.html` | **Air-gapped edition** for locked-down schools and agencies. No network code; CSP forbids all connections. |

## Behaviour changes from v3 you should know about
1. **Nothing auto-connects.** v3 joined a public Nostr room on entering the workspace. v4 requires a click and consent (it reveals your IP address to relays and peers).
2. **Peer data is quarantined.** Records from other people wait in an inbox until you accept them; large revision jumps are flagged; peers are rate limited.
3. **Fixed privacy bug:** v3 shared "local only" records when a peer requested a room snapshot. v4 shares only records whose scope equals the room.
4. **Fixed model id:** v3's `SmolLM2-135M-Instruct-q4f32_1-MLC` is not in WebLLM 0.2.85's prebuilt list; v4 offers only verified ids and re-checks them against the loaded library.
5. **Works from a file:** v3 loaded behaviour from external module files that browsers refuse on `file://` (the splash could stick). Everything is now inline.
6. **No automatic service-worker registration.** Offline cache/install is opt-in (Data & privacy) and applies to hosted copies only.
7. Data migrates automatically from v3 databases (left untouched; delete them from Data & privacy once verified).

## Zero-Harm and Anti-Inversion
Visible in the footer and as an HTML comment in `index.html`. The tools aid human judgement; they do not decide, rank people or approve anything. The harm-boundary filter and the Anti-Inversion check reduce casual misuse and surface blind spots; they are **not** safety guarantees.

## Build, test, extend
```bash
python3 tools/build.py          # assembles dist/ (both editions, CSP hashes, static checks, zip)
python3 tests/smoke.py          # needs: pip install playwright && playwright install chromium
python3 tests/features.py
python3 tests/deep.py           # migration, multi-tab, encryption, classroom, collaboration, layouts, modes
python3 tests/resilience.py     # hosted offline cache, blocked IndexedDB, JavaScript off
```
The build **fails** on: `eval`/`new Function`/`document.write`, inline handlers, unregistered i18n keys, duplicate ids, dead in-page links.
- *Add a tool:* `EP.ext.define()` for its records, `EP.tools.register()` for its UI, `EP.search.register()` for search, `EP.emit('activity', {type})` for the HUD.
- *Add a model:* add to `MODELS` (fields + `fn`); it appears in the calculator and Monte Carlo.
- *Add a language:* append a code to `LANGS` and a slot to each `EP.i18n.register` row (missing text falls back to English; a self-test checks every key).
- *Add a quest or badge:* `QUESTS` / `BADGES` in `src/js/36-hud.js`.
- Source is in `src/` (CSS, JS modules, section HTML, data); `tools/patch_core.py` shows every change made to the v3 core.

## Honest limits
- Tested with Playwright/Chromium only (desktop and mobile viewports, offline, blocked storage, JS off). Firefox and Safari are untested.
- The optional internet-room and local-model paths could not be exercised in the build sandbox (no access to the CDN, relays or model hosts). Their API calls were checked against the published Trystero 0.25.3 and WebLLM 0.2.85 type definitions; test them on your own network before relying on them.
- External publisher links are carried over from the v3 research snapshot (20 Sep 2026); only the links added in v4 were re-checked. A hosted deployment should run a link checker.
- Not a formal WCAG audit, security audit or translation review.
- Educational and planning software only; qualified practitioners decide high-stakes matters.

Licence: MIT (see `LICENSE`). Attributions: `ATTRIBUTIONS.md` and the in-app Attributions section.
