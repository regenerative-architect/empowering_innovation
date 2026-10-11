/* SECTION 12 · COLLABORATION (HARDENED)
   Purpose : voluntary exchange of small records between browsers: same-device rooms (BroadcastChannel,
             other tabs of this app), optional internet rooms (Trystero WebRTC, loaded only after explicit
             consent) and plain files.
   v4 changes vs v3 (all deliberate):
     1. NOTHING connects automatically. v3 joined a public Nostr room on entry; v4 requires a click and a
        consent dialog that states what is revealed (IP address to relays and peers; shared records).
     2. QUARANTINE: anything from another person (internet peers, imported files) lands in an inbox and is
        merged only when you accept it. Same-device tabs are your own and merge directly.
     3. FIXED PRIVACY BUG: v3 snapshots included "local only" records. v4 shares ONLY records whose scope
        equals the room, and rejects incoming records whose scope does not match the room they arrived in.
     4. Per-peer token-bucket rate limits, size limits, revision-jump flags (a peer cannot silently win by
        claiming revision 999999), and bounded inbox size.
     5. Youth-safe mode and the air-gapped edition disable internet rooms entirely.
   Extend  : add an action name in joinRemoteRoom; every incoming path MUST call stageIncoming().
   Outcome : sharing that is consented, bounded, reviewable and honest about what it cannot prove. */
(function () {
  'use strict';
  const U = EP.util, S = EP.sanitize, $ = U.$, t = (k, v) => EP.t(k, v);
  const L = (en, es, fr) => [en, es, fr];
  const APP_ID = 'foster-navi-empowerment-recursive-innovation-os-v3', PUBLIC_ROOM = 'empowerment-commons-public-v1', SCHEMA = 'empowerment-collab-record/1';
  const STRATEGIES = { nostr: 'https://esm.sh/trystero@0.25.3?bundle', mqtt: 'https://esm.sh/@trystero-p2p/mqtt@0.25.3?bundle', torrent: 'https://esm.sh/@trystero-p2p/torrent@0.25.3?bundle', ipfs: 'https://esm.sh/@trystero-p2p/ipfs@0.25.3?bundle' };
  const KINDS = ['project', 'task', 'comment', 'decision', 'evidence', 'need', 'resource'], STATUSES = ['proposed', 'active', 'blocked', 'done', 'archived'];
  const MAX_INBOX = 300, MAX_SNAPSHOT = 500, REV_JUMP = 25;

  EP.i18n.register({
    'co.eyebrow': L('VOLUNTARY EXCHANGE', 'INTERCAMBIO VOLUNTARIO', 'ÉCHANGE VOLONTAIRE'), 'co.title': L('Share on purpose, review before you keep', 'Comparta a propósito, revise antes de guardar', 'Partagez volontairement, vérifiez avant de garder'),
    'co.lede': L('Records you choose to share travel between browsers. Nothing is sent unless you press a button, and anything that arrives from someone else waits in your inbox until you accept it.', 'Los registros que elija compartir viajan entre navegadores. No se envía nada salvo que pulse un botón, y todo lo que llega de otra persona espera en su bandeja hasta que lo acepte.', 'Les enregistrements que vous choisissez de partager voyagent entre navigateurs. Rien n’est envoyé sans clic, et tout ce qui vient d’autrui attend dans votre boîte jusqu’à acceptation.'),
    'co.status': L('Status', 'Estado', 'État'), 'co.network': L('Network:', 'Red:', 'Réseau :'), 'co.peers': L('Peers seen:', 'Pares vistos:', 'Pairs vus :'), 'co.records': L('Records:', 'Registros:', 'Enregistrements :'), 'co.inbox': L('Inbox:', 'Bandeja:', 'Boîte :'),
    'co.yourName': L('Your display name', 'Su nombre visible', 'Votre nom affiché'), 'co.nick': L('A nickname others will see (optional; never your full name)', 'Un apodo que otros verán (opcional; nunca su nombre completo)', 'Un pseudonyme que les autres verront (facultatif ; jamais votre nom complet)'), 'co.nickNote': L('Shared only inside rooms you join. Peer IDs are random per session and are not identity credentials.', 'Se comparte solo en las salas a las que se une. Los ID de pares son aleatorios por sesión y no son credenciales de identidad.', 'Partagé uniquement dans les salles que vous rejoignez. Les identifiants de pairs sont aléatoires par session et ne sont pas des preuves d’identité.'),
    'co.internet': L('Internet rooms (optional)', 'Salas por internet (opcional)', 'Salles Internet (facultatif)'), 'co.internetNote': L('Off by default. Turning them on tells you exactly what is shared with whom, and asks first.', 'Desactivadas por defecto. Al activarlas se le indica exactamente qué se comparte y con quién, y se le pregunta antes.', 'Désactivées par défaut. Les activer vous indique exactement ce qui est partagé et avec qui, et demande d’abord.'),
    'co.enable': L('Enable internet rooms…', 'Activar salas por internet…', 'Activer les salles Internet…'), 'co.disable': L('Turn internet rooms off', 'Desactivar salas por internet', 'Désactiver les salles Internet'), 'co.joinPublic': L('Join the public commons', 'Unirse al espacio común público', 'Rejoindre le commun public'), 'co.leavePublic': L('Leave the public commons', 'Salir del espacio común público', 'Quitter le commun public'),
    'co.focusId': L('Focused room ID (3–120 letters, digits, - _ . :)', 'ID de sala enfocada (3–120 letras, dígitos, - _ . :)', 'ID de salle ciblée (3–120 lettres, chiffres, - _ . :)'), 'co.pass': L('Room password (encrypts signalling; share it separately)', 'Contraseña de la sala (cifra la señalización; compártala aparte)', 'Mot de passe de la salle (chiffre la signalisation ; partagez-le séparément)'), 'co.strategy': L('Discovery network', 'Red de descubrimiento', 'Réseau de découverte'),
    'co.turn': L('Optional TURN relay (for strict networks)', 'Relé TURN opcional (para redes estrictas)', 'Relais TURN facultatif (réseaux restrictifs)'), 'co.turnOn': L('Use a TURN server', 'Usar un servidor TURN', 'Utiliser un serveur TURN'), 'co.turnUser': L('TURN username', 'Usuario TURN', 'Nom d’utilisateur TURN'), 'co.turnCred': L('TURN credential (never stored)', 'Credencial TURN (nunca se guarda)', 'Identifiant TURN (jamais enregistré)'),
    'co.join': L('Join focused room', 'Unirse a la sala enfocada', 'Rejoindre la salle ciblée'), 'co.leave': L('Leave focused room', 'Salir de la sala enfocada', 'Quitter la salle ciblée'), 'co.share': L('Share a record', 'Compartir un registro', 'Partager un enregistrement'), 'co.kind': L('Kind', 'Tipo', 'Type'), 'co.scope': L('Who can receive it', 'Quién puede recibirlo', 'Qui peut le recevoir'), 'co.domain': L('Domain', 'Ámbito', 'Domaine'),
    'co.rtitle': L('Title', 'Título', 'Titre'), 'co.body': L('Details (no personal information about other people)', 'Detalles (sin información personal de otras personas)', 'Détails (sans information personnelle sur d’autres personnes)'), 'co.save': L('Save and share to scope', 'Guardar y compartir en el ámbito', 'Enregistrer et partager dans la portée'),
    'co.inboxTitle': L('Inbox: waiting for your review', 'Bandeja: esperando su revisión', 'Boîte : en attente de votre examen'), 'co.inboxNote': L('Records from other people never enter your workspace until you accept them. Text is shown as plain text.', 'Los registros de otras personas nunca entran en su espacio hasta que los acepte. El texto se muestra como texto plano.', 'Les enregistrements d’autrui n’entrent jamais dans votre espace avant acceptation. Le texte est affiché en texte brut.'),
    'co.acceptAll': L('Accept all', 'Aceptar todo', 'Tout accepter'), 'co.rejectAll': L('Reject all', 'Rechazar todo', 'Tout refuser'), 'co.accept': L('Accept', 'Aceptar', 'Accepter'), 'co.reject': L('Reject', 'Rechazar', 'Refuser'), 'co.recordsTitle': L('Records on this device', 'Registros en este dispositivo', 'Enregistrements sur cet appareil'), 'co.peersTitle': L('Peers', 'Pares', 'Pairs'), 'co.files': L('Exchange by file', 'Intercambio por archivo', 'Échange par fichier'),
    'co.export': L('Export records', 'Exportar registros', 'Exporter les enregistrements'), 'co.import': L('Import records (they go to your inbox first)', 'Importar registros (pasan primero a su bandeja)', 'Importer des enregistrements (ils vont d’abord dans votre boîte)'), 'co.log': L('Transport log', 'Registro de transporte', 'Journal de transport'),
    'co.consentTitle': L('Before you connect to the internet', 'Antes de conectarse a internet', 'Avant de vous connecter à Internet'),
    'co.consentBody': L('Internet rooms connect your browser directly to other people’s browsers (WebRTC).\n\nTo find each other, your browser contacts public relay servers. That reveals your IP address to those relays and to the other people in the room.\n\nRecords you share into a room are visible to everyone in it and cannot be recalled. Peer names are self-chosen and unverified, and anyone who knows a room ID can try to join it. Records that arrive from others wait in your inbox until you accept them.\n\nNothing is sent until you press a join button, and you can leave at any time. This is not appropriate for children’s data or for anything confidential.', 'Las salas por internet conectan su navegador directamente con los de otras personas (WebRTC).\n\nPara encontrarse, su navegador contacta servidores de relé públicos. Eso revela su dirección IP a esos relés y a las demás personas de la sala.\n\nLos registros que comparta en una sala son visibles para todos y no pueden retirarse. Los nombres son autoelegidos y no verificados, y cualquiera que conozca el ID de una sala puede intentar unirse. Los registros de otras personas esperan en su bandeja hasta que los acepte.\n\nNo se envía nada hasta que pulse un botón de unirse, y puede salir cuando quiera. No es apropiado para datos de menores ni para nada confidencial.', 'Les salles Internet relient directement votre navigateur à ceux d’autres personnes (WebRTC).\n\nPour se trouver, votre navigateur contacte des serveurs relais publics. Cela révèle votre adresse IP à ces relais et aux autres personnes de la salle.\n\nLes enregistrements partagés dans une salle sont visibles de tous et ne peuvent pas être retirés. Les noms sont choisis librement et non vérifiés, et toute personne connaissant l’ID d’une salle peut tenter de la rejoindre. Les enregistrements reçus attendent dans votre boîte jusqu’à acceptation.\n\nRien n’est envoyé avant que vous ne cliquiez sur un bouton, et vous pouvez quitter à tout moment. Ne convient pas aux données d’enfants ni à rien de confidentiel.'),
    'co.consentOk': L('I understand, enable', 'Entiendo, activar', 'Je comprends, activer'), 'co.blockedYouth': L('Internet rooms are turned off in youth-safe mode. Use files your teacher can see.', 'Las salas por internet están desactivadas en el modo seguro para jóvenes. Use archivos que su docente pueda ver.', 'Les salles Internet sont désactivées en mode jeunesse sûr. Utilisez des fichiers que l’enseignant peut voir.'), 'co.blockedStrict': L('This is the air-gapped edition: network features are not included.', 'Esta es la edición aislada: no incluye funciones de red.', 'Ceci est l’édition isolée : les fonctions réseau ne sont pas incluses.'),
    'co.s.local': L('Local only (never shared)', 'Solo local (nunca se comparte)', 'Local seulement (jamais partagé)'), 'co.s.commons': L('Public commons', 'Espacio común público', 'Commun public'), 'co.s.focus': L('Focused room: {r}', 'Sala enfocada: {r}', 'Salle ciblée : {r}'),
    'co.st.same': L('Same-device room active (other tabs of this app).', 'Sala del mismo dispositivo activa (otras pestañas de esta app).', 'Salle du même appareil active (autres onglets de cette app).'), 'co.st.joined': L('Public commons joined over the internet.', 'Espacio común público unido por internet.', 'Commun public rejoint via Internet.'), 'co.st.err': L('Could not connect: {m}', 'No se pudo conectar: {m}', 'Connexion impossible : {m}'),
    'co.st.offline': L('You are offline. Same-device rooms and files still work.', 'Está sin conexión. Las salas del mismo dispositivo y los archivos siguen funcionando.', 'Vous êtes hors ligne. Les salles du même appareil et les fichiers fonctionnent toujours.'), 'co.net.on': L('online', 'en línea', 'en ligne'), 'co.net.off': L('offline', 'sin conexión', 'hors ligne'), 'co.net.rooms': L('{n} internet room(s) active', '{n} sala(s) por internet activa(s)', '{n} salle(s) Internet active(s)'),
    'co.noPeers': L('No peers seen yet. Open another tab for same-device testing.', 'Aún no se ven pares. Abra otra pestaña para probar en el mismo dispositivo.', 'Aucun pair vu pour l’instant. Ouvrez un autre onglet pour tester sur le même appareil.'), 'co.noRecords': L('No records match.', 'Ningún registro coincide.', 'Aucun enregistrement ne correspond.'), 'co.noInbox': L('Inbox is empty.', 'La bandeja está vacía.', 'La boîte est vide.'),
    'co.f.new': L('new', 'nuevo', 'nouveau'), 'co.f.update': L('updates a record you already have', 'actualiza un registro que ya tiene', 'met à jour un enregistrement existant'), 'co.f.conflict': L('conflicts with your version (kept as a copy)', 'entra en conflicto con su versión (se guarda como copia)', 'en conflit avec votre version (gardé comme copie)'), 'co.f.jump': L('unusually large revision jump', 'salto de revisión inusualmente grande', 'saut de révision inhabituel'),
    'co.accepted': L('Accepted {n}.', 'Aceptados {n}.', '{n} accepté(s).'), 'co.rejected': L('Rejected {n}.', 'Rechazados {n}.', '{n} refusé(s).'), 'co.saved': L('Saved locally and shared to the selected scope where a connection exists.', 'Guardado localmente y compartido en el ámbito elegido donde haya conexión.', 'Enregistré localement et partagé dans la portée choisie lorsqu’une connexion existe.'),
    'co.imported': L('{n} record(s) placed in your inbox for review.', '{n} registro(s) en su bandeja para revisión.', '{n} enregistrement(s) placé(s) dans votre boîte pour examen.'), 'co.importBad': L('Import rejected: {m}', 'Importación rechazada: {m}', 'Import refusé : {m}'), 'co.share1': L('Share again', 'Compartir de nuevo', 'Repartager'), 'co.delete': L('Delete', 'Eliminar', 'Supprimer'),
    'co.badRoom': L('Room ID must be 3–120 characters: letters, digits, - _ . :', 'El ID de sala debe tener 3–120 caracteres: letras, dígitos, - _ . :', 'L’ID de salle doit compter 3–120 caractères : lettres, chiffres, - _ . :'), 'co.migrated': L('Records from v3 were copied into v4.', 'Los registros de v3 se copiaron a v4.', 'Les enregistrements v3 ont été copiés dans v4.'), 'co.dropped': L('Dropped {n} message(s) from a peer sending too fast.', 'Se descartaron {n} mensaje(s) de un par que enviaba demasiado rápido.', '{n} message(s) ignoré(s) : un pair envoyait trop vite.')
  });

  /* STATE --------------------------------------------------------------------------------------------------- */
  const sessionPeer = (() => { try { const o = sessionStorage.getItem('ep4-peer'); if (o) return o; const id = crypto.randomUUID(); sessionStorage.setItem('ep4-peer', id); return id; } catch { return 'peer-' + Date.now().toString(36) + Math.random().toString(36).slice(2); } })();
  let records = [], inbox = []; const peers = new Map(), remoteRooms = new Map(), bcRooms = new Map(), buckets = new Map(); let focusKey = null, publicKey = null, dropped = 0;
  const log = msg => { const el = $('transportLog'); if (!el) return; el.textContent = (new Date().toLocaleTimeString() + ' ' + String(msg).slice(0, 300) + '\n' + el.textContent).slice(0, 6000); };
  const setText = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  const internetAllowed = () => !EP.strict && !EP.settings.get('youthSafe');
  const internetOn = () => internetAllowed() && !!EP.settings.get('publicConsentAt');
  const profile = () => ({ display: S.line($('collabDisplay')?.value || '', 40), note: 'Unverified self-description' });
  const bucketFor = peerId => { if (!buckets.has(peerId)) buckets.set(peerId, EP.rate.make({ capacity: 15, perSec: 1.5 })); return buckets.get(peerId); };

  /* RECORDS -------------------------------------------------------------------------------------------------- */
  function normalize(x) {
    const r = {
      schema: SCHEMA, id: S.id(x.id) || U.uid(), kind: S.pick(x.kind, KINDS, 'comment'), title: S.line(x.title, 160) || 'Untitled', body: S.text(x.body, 7000), domain: S.line(x.domain, 80) || 'cross-domain', entity: S.line(x.entity, 80) || 'community', discipline: S.line(x.discipline, 100) || 'general',
      status: S.pick(x.status, STATUSES, 'proposed'), scope: S.line(x.scope, 120) || 'local', revision: S.num(x.revision, { min: 1, max: 999999, int: true, fallback: 1 }), createdAt: S.iso(x.createdAt), updatedAt: S.iso(x.updatedAt), author: S.line(x.author, 160) || sessionPeer, hash: S.line(x.hash, 128), conflictOf: x.conflictOf ? S.line(x.conflictOf, 160) : null,
      provenance: { source: S.line(x.provenance && x.provenance.source, 80) || 'human-entered', sourcePeer: S.line((x.provenance && x.provenance.sourcePeer) || x.author, 160) || sessionPeer, receivedAt: S.iso(x.provenance && x.provenance.receivedAt) }
    };
    return r;
  }
  const comparable = r => JSON.stringify([r.kind, r.title, r.body, r.domain, r.status, r.revision, r.updatedAt]);
  const hashRecord = r => U.sha256(U.canonical({ id: r.id, kind: r.kind, title: r.title, body: r.body, domain: r.domain, status: r.status, revision: r.revision, updatedAt: r.updatedAt }));
  async function saveRecord(rec, { broadcast = true } = {}) {
    const r = normalize(rec); r.hash = await hashRecord(r); await EP.store.put('records', r);
    const i = records.findIndex(x => x.id === r.id); if (i >= 0) records[i] = r; else records.push(r);
    renderRecords(); updateStatus(); EP.emit('collab:change'); if (broadcast) await broadcastRecord(r); return r;
  }
  /* merge for TRUSTED input (own tabs, or a record the person has just accepted) */
  async function mergeTrusted(input, sourcePeer, transport) {
    const inc = normalize({ ...input, provenance: { ...(input.provenance || {}), sourcePeer, source: transport, receivedAt: U.now() } }); const local = records.find(r => r.id === inc.id);
    if (!local) { await saveRecord(inc, { broadcast: false }); log('Added ' + inc.kind + ' ' + inc.id.slice(0, 8) + ' from ' + transport); return 'added'; }
    if (comparable(local) === comparable(inc)) return 'same';
    if (inc.revision > local.revision) { await saveRecord(inc, { broadcast: false }); return 'updated'; }
    if (inc.revision === local.revision) { inc.id = inc.id + '~conflict~' + String(sourcePeer).slice(0, 8) + '~' + Date.now(); inc.conflictOf = local.id; inc.title = inc.title + ' · conflict copy'; await saveRecord(inc, { broadcast: false }); return 'conflict'; }
    return 'ignored';
  }
  /* QUARANTINE: every record from another person passes here first */
  async function stageIncoming(input, sourcePeer, transport, roomId) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'invalid';
    const inc = normalize({ ...input, provenance: { source: transport, sourcePeer, receivedAt: U.now() } });
    if (inc.scope === 'local' || (roomId && inc.scope !== roomId)) return 'scope-mismatch';
    const local = records.find(r => r.id === inc.id); let flag = 'new';
    if (local) { if (comparable(local) === comparable(inc)) return 'same'; if (inc.revision < local.revision) return 'older'; flag = inc.revision === local.revision ? 'conflict' : 'update'; if (inc.revision - local.revision > REV_JUMP) flag = 'jump'; }
    if (inbox.some(q => q.id === inc.id && comparable(q) === comparable(inc))) return 'queued';
    const item = { ...inc, qid: 'q-' + inc.id.slice(0, 60) + '-' + inc.revision, flag, stagedAt: U.now(), transport: S.line(transport, 40) };
    inbox = inbox.filter(q => q.qid !== item.qid); inbox.push(item); if (inbox.length > MAX_INBOX) inbox = inbox.slice(-MAX_INBOX);
    await EP.store.put('quarantine', { ...item, id: item.qid }); renderInbox(); updateStatus(); return 'staged';
  }
  async function dropFromInbox(qid) { inbox = inbox.filter(q => q.qid !== qid); try { await EP.store.del('quarantine', qid); } catch {} }
  async function acceptItem(q) { const { qid, flag, stagedAt, transport, ...rec } = q; const r = await mergeTrusted(rec, rec.provenance.sourcePeer, 'peer-accepted'); await dropFromInbox(qid); EP.emit('activity', { type: 'accept' }); return r; }

  /* TRANSPORTS ----------------------------------------------------------------------------------------------------- */
  function snapshot(scope) { return { schema: 'empowerment-collab-snapshot/1', exportedAt: U.now(), from: profile(), records: records.filter(r => r.scope === scope).slice(0, MAX_SNAPSHOT) }; }
  async function stageSnapshot(s, peer, transport, roomId) {
    if (!s || s.schema !== 'empowerment-collab-snapshot/1' || !Array.isArray(s.records)) return; let n = 0;
    for (const r of s.records.slice(0, MAX_SNAPSHOT)) { if (!bucketFor(peer).take(0.2)) { dropped++; break; } if ((await stageIncoming(r, peer, transport, roomId)) === 'staged') n++; }
    log('Snapshot from ' + String(peer).slice(0, 8) + ': ' + n + ' record(s) placed in inbox.');
  }
  function ensureBroadcastRoom(roomId) {
    if (!('BroadcastChannel' in window)) return null; if (bcRooms.has(roomId)) return bcRooms.get(roomId);
    const bc = new BroadcastChannel('ep-v3:' + roomId);
    bc.onmessage = async e => {
      const m = e.data || {}; if (typeof m !== 'object' || m.from === sessionPeer || (m.to && m.to !== sessionPeer)) return;
      if (!bucketFor('bc:' + m.from).take()) { dropped++; return; }
      if (m.type === 'hello') { bc.postMessage({ type: 'presence', from: sessionPeer, to: m.from, profile: profile() }); bc.postMessage({ type: 'snapshot', from: sessionPeer, to: m.from, snapshot: snapshot(roomId) }); }
      else if (m.type === 'presence') notePeer(m.from, m.profile, 'same-device', roomId);
      else if (m.type === 'record' && m.record && m.record.scope === roomId) await mergeTrusted(m.record, m.from, 'same-device');
      else if (m.type === 'snapshot' && m.snapshot && Array.isArray(m.snapshot.records)) for (const r of m.snapshot.records.slice(0, MAX_SNAPSHOT)) if (r && r.scope === roomId) await mergeTrusted(r, m.from, 'same-device');
    };
    bc.postMessage({ type: 'hello', from: sessionPeer, profile: profile() }); bcRooms.set(roomId, bc); return bc;
  }
  function notePeer(peerId, prof, transport, roomId) { peers.set(transport + ':' + roomId + ':' + peerId, { peerId, display: S.line(prof && prof.display, 40), transport, roomId, lastSeen: U.now() }); renderPeers(); }
  async function ensureConsent() {
    if (!internetAllowed()) { EP.ui.toast(EP.strict ? t('co.blockedStrict') : t('co.blockedYouth')); return false; }
    if (EP.settings.get('publicConsentAt')) return true;
    const r = await EP.ui.dialog({ title: t('co.consentTitle'), body: t('co.consentBody'), actions: [{ id: 'cancel', label: t('ui.cancel') }, { id: 'ok', label: t('co.consentOk'), primary: true }] });
    if (r !== 'ok') return false; EP.settings.set('publicConsentAt', U.now()); EP.analytics.record('internetConsent'); applyInternetUi(); return true;
  }
  const turnConfig = () => { if (!$('turnEnabled')?.checked) return undefined; const url = $('turnUrl').value.trim(); if (!/^turns?:[\w.-]+(:\d+)?(\?transport=(udp|tcp))?$/i.test(url)) return undefined; const s = { urls: [url] }; const u = $('turnUser').value.trim(); if (u) s.username = u; const c = $('turnCredential').value; if (c) s.credential = c; return [s]; };
  async function joinRemoteRoom({ roomId, strategy = 'nostr', password = '', kind = 'focus' }) {
    if (!(await ensureConsent())) throw new Error('consent');
    if (!navigator.onLine) throw new Error(t('co.st.offline')); const key = kind + ':' + strategy + ':' + roomId; if (remoteRooms.has(key)) return remoteRooms.get(key);
    if (!STRATEGIES[strategy]) throw new Error('Unsupported discovery network'); EP.net.watchWebSockets();
    const mod = await EP.net.importModule(STRATEGIES[strategy], 'Trystero ' + strategy + ' (peer discovery for ' + kind + ' room)');
    const cfg = { appId: APP_ID }; if (password) cfg.password = password; const turn = turnConfig(); if (turn) cfg.turnConfig = turn;
    const room = mod.joinRoom(cfg, roomId, { onJoinError: d => { log('Join error: ' + (d && (d.error && d.error.message || d.error) || 'unknown')); setText('remoteStatus', t('co.st.err', { m: 'WebRTC / network policy (a TURN relay may be needed)' })); } });
    const recordAction = room.makeAction('record'), presenceAction = room.makeAction('presence'), snapshotAction = room.makeAction('snapshot', { kind: 'request', onRequest: () => snapshot(roomId) }); const tr = 'Trystero/' + strategy;
    recordAction.onMessage = (data, ctx) => { const pid = ctx && ctx.peerId; if (!bucketFor(pid).take()) { dropped++; return; } return stageIncoming(data, pid, tr, roomId); };
    presenceAction.onMessage = (data, ctx) => { const pid = ctx && ctx.peerId; if (bucketFor(pid).take()) notePeer(pid, data, tr, roomId); };
    room.onPeerJoin = async pid => { notePeer(pid, {}, tr, roomId); presenceAction.send(profile(), { target: pid }).catch(() => {}); try { const snap = await snapshotAction.request({ want: 'empowerment-collab-snapshot/1' }, { target: pid, timeoutMs: 7000 }); await stageSnapshot(snap, pid, tr, roomId); } catch (err) { log('Snapshot request did not complete: ' + err.message); } };
    room.onPeerLeave = pid => { peers.delete(tr + ':' + roomId + ':' + pid); renderPeers(); };
    const item = { key, kind, roomId, strategy, room, recordAction, presenceAction }; remoteRooms.set(key, item); ensureBroadcastRoom(roomId); log('Joined ' + kind + ' room via ' + strategy + '.'); renderRoomStatus(); updateStatus(); return item;
  }
  async function joinPublic() {
    try { setText('publicRoomStatus', t('ui.loading')); const item = await joinRemoteRoom({ roomId: PUBLIC_ROOM, strategy: 'nostr', kind: 'public' }); publicKey = item.key; setText('publicRoomStatus', t('co.st.joined')); $('publicJoin').hidden = true; $('publicLeave').hidden = false; refreshScopes(); }
    catch (e) { if (e.message !== 'consent') setText('publicRoomStatus', t('co.st.err', { m: e.message })); else setText('publicRoomStatus', t('co.st.same')); }
  }
  function leave(key) { const it = remoteRooms.get(key); try { it && it.room.leave(); } catch {} remoteRooms.delete(key); renderRoomStatus(); updateStatus(); }
  async function connectFocus() {
    const roomId = ($('focusRoomId').value || '').trim(); if (!/^[\w.:-]{3,120}$/.test(roomId)) return setText('remoteStatus', t('co.badRoom'));
    try { setText('remoteStatus', t('ui.loading')); const item = await joinRemoteRoom({ roomId, strategy: $('discoveryStrategy').value, password: $('roomPassword').value, kind: 'focus' }); focusKey = item.key; setText('remoteStatus', t('co.st.joined')); refreshScopes(); }
    catch (e) { if (e.message !== 'consent') { setText('remoteStatus', t('co.st.err', { m: e.message })); ensureBroadcastRoom(roomId); } }
  }
  async function broadcastRecord(r) {
    if (r.scope === 'local') return; const bc = ensureBroadcastRoom(r.scope); if (bc) bc.postMessage({ type: 'record', from: sessionPeer, record: r });
    for (const it of remoteRooms.values()) if (it.roomId === r.scope) { try { await it.recordAction.send(r); } catch (e) { log('Send failed: ' + e.message); } }
  }

  /* RENDERING ------------------------------------------------------------------------------------------------------- */
  function updateStatus() {
    const n = [...remoteRooms.values()].length; setText('networkStatus', (navigator.onLine ? t('co.net.on') : t('co.net.off')) + (n ? ' · ' + t('co.net.rooms', { n }) : '')); setText('peerCount', String(peers.size)); setText('recordCount', String(records.length)); setText('inboxCount', String(inbox.length));
    if (!navigator.onLine) setText('remoteStatus', t('co.st.offline')); if (dropped) { log(t('co.dropped', { n: dropped })); dropped = 0; }
    setText('collabStorageStatus', EP.store.mode === 'indexeddb' ? 'IndexedDB · ' + records.length : EP.store.mode);
  }
  function refreshScopes() {
    const sel = $('recordScope'); if (!sel) return; const cur = sel.value; const opts = [['local', t('co.s.local')], [PUBLIC_ROOM, t('co.s.commons')]]; for (const it of remoteRooms.values()) if (it.kind === 'focus') opts.push([it.roomId, t('co.s.focus', { r: it.roomId })]);
    sel.replaceChildren(...opts.map(([v, l]) => U.el('option', { value: v, text: l }))); sel.value = opts.some(o => o[0] === cur) ? cur : 'local';
  }
  function renderRoomStatus() { const el = $('roomSummary'); if (!el) return; const rooms = [...remoteRooms.values()]; el.replaceChildren(...rooms.map(r => U.el('div', { class: 'row-actions' }, U.el('span', { text: (r.kind === 'public' ? t('co.s.commons') : r.roomId) + ' · ' + r.strategy }), U.el('button', { type: 'button', text: t('co.leave'), onclick: () => { if (r.key === publicKey) { publicKey = null; $('publicJoin').hidden = false; $('publicLeave').hidden = true; } leave(r.key); refreshScopes(); } })))); }
  function renderPeers() { const el = $('peerList'); if (!el) return; const items = [...peers.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)); setText('peerCount', String(items.length)); el.replaceChildren(...(items.length ? items.slice(0, 60).map(p => U.el('div', { class: 'tool-item' }, U.el('strong', { text: p.display || p.peerId.slice(0, 8) }), U.el('div', { class: 'meta', text: p.transport + ' · ' + (p.roomId === PUBLIC_ROOM ? t('co.s.commons') : p.roomId) }))) : [U.el('p', { class: 'small', text: t('co.noPeers') })])); }
  function renderRecords() {
    const el = $('collabRecords'); if (!el) return; const q = EP.search.fold($('recordSearch')?.value || ''), kind = $('recordFilterKind')?.value || 'all';
    const list = records.filter(r => (kind === 'all' || r.kind === kind) && (!q || EP.search.fold([r.title, r.body, r.domain].join(' ')).includes(q))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); setText('recordCount', String(list.length));
    el.replaceChildren(...(list.length ? list.slice(0, 150).map(r => U.el('article', { class: 'tool-item' }, U.el('div', {}, U.el('span', { class: 'pill', text: r.kind }), ' ', U.el('span', { class: 'pill', text: r.scope === 'local' ? t('co.s.local') : r.scope === PUBLIC_ROOM ? t('co.s.commons') : r.scope }), ' ', U.el('span', { class: 'pill', text: r.status }), r.conflictOf ? U.el('span', { class: 'pill mid', text: ' conflict copy' }) : null), U.el('h4', { text: r.title }), U.el('p', { text: r.body }), U.el('div', { class: 'meta', text: r.domain + ' · rev ' + r.revision + ' · ' + EP.fmt.dateTime(r.updatedAt) }),
      U.el('div', { class: 'row-actions' }, ['active', 'done', 'blocked'].map(s => U.el('button', { type: 'button', text: s, onclick: () => saveRecord({ ...r, status: s, revision: r.revision + 1, updatedAt: U.now(), author: sessionPeer }) })), r.scope !== 'local' ? U.el('button', { type: 'button', text: t('co.share1'), onclick: () => broadcastRecord(r) }) : null, U.el('button', { type: 'button', class: 'danger', text: t('co.delete'), onclick: async () => { if (!(await EP.ui.confirm(t('f.deleteConfirm'), { danger: true, ok: t('co.delete') }))) return; records = records.filter(x => x.id !== r.id); await EP.store.del('records', r.id); renderRecords(); updateStatus(); } })))) : [U.el('p', { class: 'small', text: t('co.noRecords') })]));
  }
  function renderInbox() {
    const el = $('inboxList'); if (!el) return; setText('inboxCount', String(inbox.length));
    el.replaceChildren(...(inbox.length ? inbox.slice(0, 80).map(q => U.el('div', { class: 'quarantine-item' }, U.el('div', {}, U.el('span', { class: 'pill', text: q.kind }), ' ', U.el('span', { class: 'pill ' + (q.flag === 'jump' || q.flag === 'conflict' ? 'mid' : ''), text: t('co.f.' + q.flag) })), U.el('h4', { text: q.title }), U.el('p', { text: q.body.slice(0, 600) }), U.el('div', { class: 'meta', text: q.transport + ' · ' + (q.provenance.sourcePeer || '').slice(0, 8) + ' · rev ' + q.revision }), U.el('div', { class: 'row-actions' }, U.el('button', { type: 'button', class: 'primary', text: t('co.accept'), onclick: async () => { await acceptItem(q); renderInbox(); } }), U.el('button', { type: 'button', text: t('co.reject'), onclick: async () => { await dropFromInbox(q.qid); renderInbox(); updateStatus(); } })))) : [U.el('p', { class: 'small', text: t('co.noInbox') })]));
  }
  function applyInternetUi() {
    const allowed = internetAllowed(), on = internetOn(); const ctl = $('internetControls'); if (ctl) ctl.hidden = !on; if ($('internetEnable')) { $('internetEnable').hidden = on; $('internetEnable').disabled = !allowed; } if ($('internetDisable')) $('internetDisable').hidden = !on;
    setText('internetNote', !allowed ? (EP.strict ? t('co.blockedStrict') : t('co.blockedYouth')) : on ? t('co.internetNote').split('.')[0] + '.' : t('co.internetNote'));
    for (const id of ['publicJoin', 'focusConnect']) if ($(id)) $(id).disabled = !allowed;
    if (!allowed) for (const k of [...remoteRooms.keys()]) leave(k);
  }

  /* RECORD CREATE / EXPORT / IMPORT -------------------------------------------------------------------------------- */
  async function createRecord(ev) {
    ev.preventDefault(); const title = $('recordTitle').value.trim(), body = $('recordBody').value.trim(); if (!title || !body) return; if (!EP.rate.allow('collab-create', { capacity: 8, perSec: 0.5 })) return;
    const scope = $('recordScope').value || 'local'; await saveRecord({ id: U.uid(), kind: $('recordKind').value, title, body, domain: $('recordDomain').value, entity: 'community', discipline: 'general', status: 'proposed', scope, revision: 1, createdAt: U.now(), updatedAt: U.now(), author: sessionPeer, provenance: { source: 'human-entered', sourcePeer: sessionPeer, receivedAt: U.now() } });
    ev.currentTarget.reset(); $('recordScope').value = scope; setText('collabFormStatus', t('co.saved')); EP.emit('activity', { type: 'ledger' });
  }
  function exportRecords() { EP.ui.download(JSON.stringify({ schema: 'empowerment-collab-backup/1', exportedAt: U.now(), records }, null, 2), 'empowerment-collab-' + U.localDay() + '.json', 'application/json'); }
  async function importRecords(file) {
    if (file.size > 4 * 1024 * 1024) throw new Error('file over 4 MB'); const data = JSON.parse(await file.text()); if (!data || data.schema !== 'empowerment-collab-backup/1' || !Array.isArray(data.records)) throw new Error('unsupported schema'); let n = 0;
    for (const r of data.records.slice(0, 1000)) { if (!r || typeof r !== 'object') continue; const scope = S.line(r.scope, 120); const res = await stageIncoming({ ...r, scope: scope === 'local' ? 'file-import' : scope }, 'file-import', 'JSON file', null); if (res === 'staged') n++; } return n;
  }

  /* MIGRATION + INIT ------------------------------------------------------------------------------------------------ */
  async function migrateLegacy() {
    try { if ((await EP.store.get('meta', 'collabMigrated')) || !window.indexedDB) return; let created = false; const old = await new Promise(res => { const rq = indexedDB.open('empowerment_recursive_collab_v3'); rq.onupgradeneeded = () => { created = true; }; rq.onerror = () => res(null); rq.onsuccess = () => { const d = rq.result; if (created || !d.objectStoreNames.contains('records')) { d.close(); if (created) try { indexedDB.deleteDatabase('empowerment_recursive_collab_v3'); } catch {} return res(null); } const g = d.transaction('records').objectStore('records').getAll(); g.onsuccess = () => { d.close(); res(g.result || []); }; g.onerror = () => { d.close(); res(null); }; }; });
      if (old && old.length) { for (const r of old.slice(0, 2000)) { const n = normalize(r); n.hash = await hashRecord(n); await EP.store.put('records', n); } log(t('co.migrated')); } await EP.store.put('meta', { at: U.now(), n: old ? old.length : 0 }, 'collabMigrated'); } catch (e) { EP.log.warn('collab migration', e); }
  }
  EP.collab = { async remove(id) { records = records.filter(x => x.id !== id); await EP.store.del('records', id); renderRecords(); updateStatus(); }, normalize, stageIncoming, snapshot, comparable, get inbox() { return inbox.slice(); }, get records() { return records.slice(); }, saveRecord, PUBLIC_ROOM, acceptItem };
  EP.search.register('collab', () => records.filter(r => r.scope === 'local' || true).map(r => ({ id: 'co:' + r.id, kind: 'k.record', title: r.title, text: r.body, go: { sel: '#collabRecords' } })));

  EP.module('collab', async () => {
    if (!('indexedDB' in window) && EP.store.mode !== 'memory') { /* memory-mode store still works */ }
    await migrateLegacy(); records = (await EP.store.all('records')).map(normalize); inbox = (await EP.store.all('quarantine')).map(q => ({ ...normalize(q), qid: q.qid || q.id, flag: S.pick(q.flag, ['new', 'update', 'conflict', 'jump'], 'new'), stagedAt: S.iso(q.stagedAt), transport: S.line(q.transport, 40) }));
    const dom = $('recordDomain'); if (dom) for (const e of EP.core.ENGINES) dom.append(U.el('option', { value: e.id, text: e.icon + ' ' + e.name }));
    ensureBroadcastRoom(PUBLIC_ROOM); refreshScopes(); applyInternetUi(); renderRecords(); renderInbox(); renderPeers(); renderRoomStatus(); updateStatus(); setText('publicRoomStatus', t('co.st.same'));
    $('collabDisplay')?.addEventListener('change', () => { for (const id of bcRooms.keys()) { const bc = bcRooms.get(id); bc.postMessage({ type: 'presence', from: sessionPeer, profile: profile() }); } for (const it of remoteRooms.values()) it.presenceAction.send(profile()).catch(() => {}); });
    $('internetEnable')?.addEventListener('click', async () => { if (await ensureConsent()) applyInternetUi(); });
    $('internetDisable')?.addEventListener('click', () => { for (const k of [...remoteRooms.keys()]) leave(k); publicKey = focusKey = null; EP.settings.set('publicConsentAt', ''); applyInternetUi(); refreshScopes(); setText('publicRoomStatus', t('co.st.same')); });
    $('publicJoin')?.addEventListener('click', joinPublic); $('publicLeave')?.addEventListener('click', () => { if (publicKey) leave(publicKey); publicKey = null; $('publicJoin').hidden = false; $('publicLeave').hidden = true; refreshScopes(); setText('publicRoomStatus', t('co.st.same')); });
    $('focusConnect')?.addEventListener('click', connectFocus); $('focusDisconnect')?.addEventListener('click', () => { if (focusKey) leave(focusKey); focusKey = null; refreshScopes(); setText('remoteStatus', ''); });
    $('collabRecordForm')?.addEventListener('submit', createRecord); $('recordSearch')?.addEventListener('input', U.debounce(renderRecords, 120)); $('recordFilterKind')?.addEventListener('change', renderRecords);
    $('inboxAccept')?.addEventListener('click', async () => { let n = 0; for (const q of inbox.slice()) { await acceptItem(q); n++; } renderInbox(); EP.ui.toast(t('co.accepted', { n })); });
    $('inboxReject')?.addEventListener('click', async () => { const n = inbox.length; for (const q of inbox.slice()) await dropFromInbox(q.qid); renderInbox(); updateStatus(); EP.ui.toast(t('co.rejected', { n })); });
    $('collabExport')?.addEventListener('click', exportRecords);
    $('collabImport')?.addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { const n = await importRecords(f); setText('collabImportStatus', t('co.imported', { n })); renderInbox(); EP.emit('activity', { type: 'import' }); } catch (err) { setText('collabImportStatus', t('co.importBad', { m: err.message })); } e.target.value = ''; });
    window.addEventListener('online', updateStatus); window.addEventListener('offline', updateStatus);
    EP.on('settings:youthSafe', applyInternetUi); EP.on('settings:publicConsentAt', applyInternetUi); EP.on('settings:reset', () => { applyInternetUi(); }); EP.on('lang', () => { refreshScopes(); renderRecords(); renderInbox(); renderPeers(); renderRoomStatus(); updateStatus(); applyInternetUi(); setText('publicRoomStatus', publicKey ? t('co.st.joined') : t('co.st.same')); });
    EP.on('data:wiped', async () => { records = []; inbox = []; renderRecords(); renderInbox(); updateStatus(); });
    $('webgpuStatus') && ($('webgpuStatus').textContent = 'WebGPU: ' + (EP.features.has('webgpu') ? 'available' : 'not available'));
  }, { order: 55 });
})();
