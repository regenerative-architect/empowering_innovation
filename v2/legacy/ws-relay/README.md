# Optional WebSocket relay adapter

This directory is deliberately **not** part of the default GitHub Pages path. The browser app uses Trystero 0.25.3 with Nostr discovery by default and can switch focused rooms to MQTT, BitTorrent or IPFS.

Use this adapter only if you deliberately want a self-hosted WebSocket signaling option. It does not replace WebRTC data channels and it is not a TURN server.

```bash
cd legacy/ws-relay
npm install
npm start
```

Then adapt the browser strategy to `@trystero-p2p/ws-relay` and provide your own `relayConfig.urls`. Do not commit private credentials. For networks where direct WebRTC cannot establish a peer connection, configure a proper TURN service separately.
