# Empowerment Protocol — Recursive Innovation OS v3

A GitHub Pages-ready, local-first research / innovation / multidisciplinary collaboration workspace.

## Deploy

Upload the folder contents to the root of a GitHub Pages repository and publish from that branch/folder. HTTPS is required for service-worker installation and normally for WebGPU. Opening `index.html` directly with `file://` still exposes the embedded knowledge/tools, but service workers and some module/network features will not operate.

## Collaboration architecture

- **Default public commons:** Trystero 0.25.3 + Nostr discovery, joined when the user enters the workspace.
- **Focused rooms:** selectable Nostr, MQTT, BitTorrent or IPFS discovery.
- **Data plane:** WebRTC browser-to-browser channels after discovery.
- **Same-device fallback:** BroadcastChannel on the same origin, no Trystero/network required.
- **State:** IndexedDB records + revision/conflict-aware synchronization + snapshot-on-peer-join.
- **Identity:** peer IDs and self-entered roles are explicitly unverified.
- **Passwords:** optional Trystero room password for encrypted session descriptions; do not treat it as identity verification.
- **TURN:** optional runtime fields; direct WebRTC does not traverse every NAT/firewall. TURN is a fallback relay when required and should not be hidden.
- **Optional legacy adapter:** `legacy/ws-relay/` contains a Node WebSocket signaling relay example, not required by the default app.

## Local AI

WebLLM 0.2.85 can load in a dedicated worker using WebGPU. The default small model is `SmolLM2-360M-Instruct-q4f32_1-MLC`. First use needs internet to download model assets; subsequent availability depends on browser caching/storage. If WebGPU or model loading fails, the app produces a deterministic segmented research/action chain instead of pretending inference occurred.

## PWA / offline

`sw.js` precaches the app shell and local data files. Third-party modules and model artifacts are runtime-cached only after successful online retrieval. The app therefore remains useful offline but does **not** claim first-use multiplayer or first-use model loading works offline.

## Data sovereignty

Collaboration records can be exported/imported as validated JSON. Conflicting same-revision records are preserved as conflict forks rather than silently overwritten. Browser storage is local to the current origin/profile; there is no automatic cross-device persistence beyond active P2P exchange.

## Verification notes

Run `node --check` on JS files and host with any static HTTPS server. Multiplayer must be field-tested across real network pairs because NAT/firewall behavior varies by environment.

## Zero-Harm / Anti-Inversion

Automation is bounded to planning, local computation and voluntary peer exchange. Generated methods are proposals, not authorizations. High-consequence medical, legal, structural, hazardous or rights-sensitive actions require qualified human review, appropriate permissions, consent and stop/rollback rules.
