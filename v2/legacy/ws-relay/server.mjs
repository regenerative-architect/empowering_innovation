// OPTIONAL / LEGACY ADAPTER ONLY.
// The GitHub Pages application does not require this server for Nostr/MQTT/Torrent/IPFS discovery.
import {createWsRelayServer} from '@trystero-p2p/ws-relay/server';
const port=Number(process.env.PORT||8080);
createWsRelayServer({port});
console.log(`Optional Trystero WebSocket relay listening on :${port}`);
