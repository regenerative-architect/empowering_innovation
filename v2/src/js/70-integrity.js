/* SECTION 15 · INTEGRITY: LEDGER, ENCRYPTED BACKUPS, SIGNING
   Purpose : give policy teams, auditors and schools three honest trust tools, all in the browser:
             (1) a hash-chained LEDGER of decisions, evidence, corrections and null results,
             (2) PASSPHRASE-ENCRYPTED backups (PBKDF2-SHA-256 600,000 iterations → AES-GCM-256),
             (3) optional SIGNATURES (ECDSA P-256; the private key is non-extractable and never leaves
                 this browser) so a recipient can check a file was not altered after signing.
   What they prove, and what they do not (also shown in the UI):
     - A ledger is tamper-EVIDENT, not tamper-proof: any edit to an old entry breaks every later hash, which
       anyone holding an earlier head hash (or a signed export) can detect. It cannot stop someone deleting
       the whole ledger, and it cannot prove that what was written is true.
     - Encryption protects a file at rest. A lost passphrase cannot be recovered by anyone.
     - A signature proves the content matches what the key holder signed, NOT who that person is. Compare the
       fingerprint through a second channel you trust.
   Extend  : add an entry type to LEDGER_TYPES; add a payload type to signPayload callers.
   Outcome : auditable records and private backups without servers, accounts or trust in a third party. */
(function () {
  'use strict';
  const U = EP.util, S = EP.sanitize, $ = U.$, t = (k, v) => EP.t(k, v);
  const L = (en, es, fr) => [en, es, fr];
  const LEDGER_TYPES = ['decision', 'evidence', 'correction', 'null-result', 'review', 'note'];
  const ZERO = '0'.repeat(64), KDF_ITER = 600000, MAX_ENTRIES = 2000;

  EP.i18n.register({
    'ig.eyebrow': L('TRUST WITHOUT A SERVER', 'CONFIANZA SIN SERVIDOR', 'CONFIANCE SANS SERVEUR'), 'ig.title': L('Ledger, encryption and signatures', 'Registro, cifrado y firmas', 'Registre, chiffrement et signatures'),
    'ig.lede': L('Three tools that work offline. Each states what it proves and what it does not.', 'Tres herramientas que funcionan sin conexión. Cada una indica qué demuestra y qué no.', 'Trois outils qui fonctionnent hors ligne. Chacun indique ce qu’il prouve et ce qu’il ne prouve pas.'),
    'ig.ledger': L('Decision & evidence ledger', 'Registro de decisiones y evidencia', 'Registre des décisions et des preuves'), 'ig.ledger.note': L('Append-only and hash-chained: each entry includes the hash of the one before it. Corrections are added, never edited in place. This makes silent edits detectable; it does not prove the entries are true or stop the whole ledger from being deleted.', 'Solo se añade y está encadenado por hash: cada entrada incluye el hash de la anterior. Las correcciones se añaden, nunca se editan. Esto hace detectables las ediciones silenciosas; no prueba que las entradas sean ciertas ni impide borrar todo el registro.', 'Ajout seul et chaîné par hachage : chaque entrée contient le hachage de la précédente. Les corrections s’ajoutent, jamais ne modifient. Les modifications silencieuses deviennent détectables ; cela ne prouve pas que les entrées sont vraies ni n’empêche de supprimer tout le registre.'),
    'ig.type': L('Entry type', 'Tipo de entrada', 'Type d’entrée'), 'ig.t.decision': L('Decision', 'Decisión', 'Décision'), 'ig.t.evidence': L('Evidence', 'Evidencia', 'Preuve'), 'ig.t.correction': L('Correction (of an earlier entry)', 'Corrección (de una entrada anterior)', 'Correction (d’une entrée antérieure)'), 'ig.t.null-result': L('Null or negative result', 'Resultado nulo o negativo', 'Résultat nul ou négatif'), 'ig.t.review': L('Review', 'Revisión', 'Revue'), 'ig.t.note': L('Note', 'Nota', 'Note'),
    'ig.text': L('What happened or was decided (no personal data)', 'Qué ocurrió o se decidió (sin datos personales)', 'Ce qui s’est passé ou a été décidé (sans données personnelles)'), 'ig.ref': L('Refers to entry #', 'Se refiere a la entrada n.º', 'Concerne l’entrée n°'), 'ig.add': L('Append to ledger', 'Añadir al registro', 'Ajouter au registre'), 'ig.verify': L('Verify chain', 'Verificar cadena', 'Vérifier la chaîne'),
    'ig.export': L('Export ledger', 'Exportar registro', 'Exporter le registre'), 'ig.head': L('Head hash (copy it to a trusted person as an anchor)', 'Hash de cabecera (cópielo a una persona de confianza como ancla)', 'Hachage de tête (copiez-le à une personne de confiance comme ancre)'), 'ig.entries': L('Entries', 'Entradas', 'Entrées'), 'ig.empty': L('No entries yet.', 'Aún no hay entradas.', 'Aucune entrée pour l’instant.'),
    'ig.ok': L('Chain intact: {n} entries verified.', 'Cadena íntegra: {n} entradas verificadas.', 'Chaîne intacte : {n} entrées vérifiées.'), 'ig.broken': L('Chain BROKEN at entry #{n}: it was changed after it was written.', 'Cadena ROTA en la entrada n.º {n}: se modificó después de escribirse.', 'Chaîne ROMPUE à l’entrée n°{n} : elle a été modifiée après écriture.'), 'ig.needText': L('Write what happened first.', 'Escriba primero qué ocurrió.', 'Écrivez d’abord ce qui s’est passé.'), 'ig.needRef': L('A correction must refer to an earlier entry.', 'Una corrección debe referirse a una entrada anterior.', 'Une correction doit concerner une entrée antérieure.'),
    'ig.full': L('Ledger is full (2,000 entries). Export it and start a new one.', 'El registro está lleno (2000 entradas). Expórtelo y empiece uno nuevo.', 'Le registre est plein (2 000 entrées). Exportez-le et démarrez-en un nouveau.'), 'ig.audit': L('Check a ledger file (auditor)', 'Comprobar un archivo de registro (auditoría)', 'Vérifier un fichier de registre (audit)'), 'ig.audit.note': L('Verifies the chain of any exported ledger without importing it.', 'Verifica la cadena de cualquier registro exportado sin importarlo.', 'Vérifie la chaîne de tout registre exporté sans l’importer.'),
    'ig.enc': L('Encrypted backup', 'Copia cifrada', 'Sauvegarde chiffrée'), 'ig.enc.note': L('Encrypts a full private backup with a passphrase you choose. There is no recovery: if you forget it, the file cannot be opened by anyone.', 'Cifra una copia privada completa con una frase que usted elige. No hay recuperación: si la olvida, nadie podrá abrir el archivo.', 'Chiffre une sauvegarde privée complète avec une phrase secrète de votre choix. Aucune récupération : si vous l’oubliez, personne ne pourra ouvrir le fichier.'),
    'ig.pass': L('Passphrase (12+ characters; four random words is a good choice)', 'Frase de contraseña (12+ caracteres; cuatro palabras al azar es buena opción)', 'Phrase secrète (12+ caractères ; quatre mots au hasard est un bon choix)'), 'ig.pass2': L('Repeat passphrase', 'Repita la frase', 'Répétez la phrase'), 'ig.nr': L('I understand there is no recovery if I lose this passphrase', 'Entiendo que no hay recuperación si pierdo esta frase', 'Je comprends qu’il n’y a aucune récupération si je perds cette phrase'),
    'ig.short': L('Use at least 12 characters.', 'Use al menos 12 caracteres.', 'Utilisez au moins 12 caractères.'), 'ig.mismatch': L('The two passphrases differ.', 'Las dos frases difieren.', 'Les deux phrases diffèrent.'), 'ig.ack': L('Tick the box to continue.', 'Marque la casilla para continuar.', 'Cochez la case pour continuer.'), 'ig.strength': L('Strength: {s}', 'Fortaleza: {s}', 'Robustesse : {s}'), 'ig.s.weak': L('weak', 'débil', 'faible'), 'ig.s.fair': L('fair', 'aceptable', 'correcte'), 'ig.s.good': L('good', 'buena', 'bonne'),
    'ig.encDone': L('Encrypted backup downloaded.', 'Copia cifrada descargada.', 'Sauvegarde chiffrée téléchargée.'), 'ig.encWorking': L('Encrypting… this takes a moment on purpose.', 'Cifrando… tarda un momento a propósito.', 'Chiffrement… cela prend un instant volontairement.'), 'ig.decTitle': L('Encrypted backup', 'Copia cifrada', 'Sauvegarde chiffrée'), 'ig.decIntro': L('Enter the passphrase to open this file. It is used only in this browser and is never stored.', 'Introduzca la frase para abrir este archivo. Solo se usa en este navegador y nunca se guarda.', 'Saisissez la phrase pour ouvrir ce fichier. Elle n’est utilisée que dans ce navigateur et jamais enregistrée.'),
    'ig.decBad': L('Wrong passphrase or damaged file.', 'Frase incorrecta o archivo dañado.', 'Phrase incorrecte ou fichier endommagé.'), 'ig.decOpen': L('Open', 'Abrir', 'Ouvrir'),
    'ig.sign': L('Signing key (optional)', 'Clave de firma (opcional)', 'Clé de signature (facultatif)'), 'ig.sign.note': L('A signature lets someone check that a file was not changed after you signed it. It proves the key, not the person: share your fingerprint through a second trusted channel. The private key never leaves this browser and cannot be exported.', 'Una firma permite comprobar que un archivo no cambió después de firmarlo. Prueba la clave, no a la persona: comparta su huella por un segundo canal de confianza. La clave privada nunca sale de este navegador y no puede exportarse.', 'Une signature permet de vérifier qu’un fichier n’a pas changé après signature. Elle prouve la clé, pas la personne : partagez votre empreinte par un second canal de confiance. La clé privée ne quitte jamais ce navigateur et ne peut pas être exportée.'),
    'ig.k.create': L('Create signing key', 'Crear clave de firma', 'Créer une clé de signature'), 'ig.k.none': L('No signing key on this device.', 'No hay clave de firma en este dispositivo.', 'Aucune clé de signature sur cet appareil.'), 'ig.k.fp': L('Fingerprint', 'Huella', 'Empreinte'), 'ig.k.del': L('Delete key', 'Eliminar clave', 'Supprimer la clé'), 'ig.k.delConfirm': L('Delete the signing key? Files you signed before can still be verified, but you cannot sign new ones with this identity.', '¿Eliminar la clave de firma? Los archivos firmados antes aún pueden verificarse, pero no podrá firmar nuevos con esta identidad.', 'Supprimer la clé de signature ? Les fichiers signés avant restent vérifiables, mais vous ne pourrez plus en signer de nouveaux avec cette identité.'),
    'ig.k.signLedger': L('Sign and download the ledger', 'Firmar y descargar el registro', 'Signer et télécharger le registre'), 'ig.k.signFile': L('Sign a JSON file…', 'Firmar un archivo JSON…', 'Signer un fichier JSON…'), 'ig.k.verify': L('Verify a signed file…', 'Verificar un archivo firmado…', 'Vérifier un fichier signé…'), 'ig.k.signed': L('Signed file downloaded.', 'Archivo firmado descargado.', 'Fichier signé téléchargé.'), 'ig.k.good': L('Signature valid. The content matches what the key {fp} signed on {d}. This does not tell you who holds the key.', 'Firma válida. El contenido coincide con lo que firmó la clave {fp} el {d}. Esto no dice quién posee la clave.', 'Signature valide. Le contenu correspond à ce que la clé {fp} a signé le {d}. Cela ne dit pas qui détient la clé.'), 'ig.k.bad': L('Signature INVALID or file altered.', 'Firma NO válida o archivo alterado.', 'Signature INVALIDE ou fichier modifié.'),
    'ig.k.created': L('Signing key created.', 'Clave de firma creada.', 'Clé de signature créée.'), 'ig.k.memory': L('Keys cannot be kept in memory-only mode; this one will vanish when you close the tab.', 'Las claves no pueden conservarse en modo solo memoria; esta desaparecerá al cerrar la pestaña.', 'Les clés ne peuvent pas être conservées en mode mémoire seule ; celle-ci disparaîtra à la fermeture de l’onglet.'), 'ig.k.nocrypto': L('Web Crypto is unavailable in this context (needs https, localhost or a file).', 'Web Crypto no está disponible en este contexto (requiere https, localhost o un archivo).', 'Web Crypto est indisponible dans ce contexte (nécessite https, localhost ou un fichier).')
  });

  /* LEDGER --------------------------------------------------------------------------------------------------- */
  const entryHash = e => U.sha256(U.canonical({ seq: e.seq, at: e.at, type: e.type, text: e.text, refs: e.refs, prev: e.prev }));
  let entries = [];
  const ledger = EP.ledger = {
    entries: () => entries.slice(), head: () => entries.length ? entries[entries.length - 1].hash : ZERO,
    async build(list, type, text, refs) { const prev = list.length ? list[list.length - 1].hash : ZERO; const e = { seq: list.length + 1, at: U.now(), type: S.pick(type, LEDGER_TYPES, 'note'), text: S.text(text, 600), refs: (refs || []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= list.length).slice(0, 4), prev }; e.hash = await entryHash(e); return e; },
    async verify(list) { let prev = ZERO; for (let i = 0; i < list.length; i++) { const e = list[i]; if (!e || e.seq !== i + 1 || e.prev !== prev || (await entryHash(e)) !== e.hash) return { ok: false, brokenAt: i + 1, count: list.length }; prev = e.hash; } return { ok: true, count: list.length, head: prev }; },
    async append(type, text, refs) { if (entries.length >= MAX_ENTRIES) throw new Error(t('ig.full')); const e = await ledger.build(entries, type, text, refs); entries.push(e); await EP.store.put('meta', { v: 1, entries }, 'ledger'); EP.emit('ledger:change'); EP.emit('activity', { type: e.type === 'correction' ? 'correction' : e.type === 'null-result' ? 'nullResult' : 'ledger' }); return e; },
    file: () => ({ schema: 'empowerment-ledger/1', exportedAt: U.now(), headHash: ledger.head(), count: entries.length, note: 'Hash-chained. Tamper-evident, not tamper-proof.', entries }),
    sanitizeFile(j) { if (!j || j.schema !== 'empowerment-ledger/1' || !Array.isArray(j.entries) || j.entries.length > MAX_ENTRIES) throw new Error('not a ledger file'); return j.entries.map((e, i) => ({ seq: Number(e.seq), at: S.iso(e.at), type: S.pick(e.type, LEDGER_TYPES, 'note'), text: S.text(e.text, 600), refs: (Array.isArray(e.refs) ? e.refs : []).map(Number).filter(Number.isInteger).slice(0, 4), prev: S.line(e.prev, 64), hash: S.line(e.hash, 64) })); }
  };

  /* ENCRYPTION ------------------------------------------------------------------------------------------------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  async function deriveKey(pass, salt, iter) { const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
  const aad = (iter, created) => enc.encode('empowerment-encrypted-backup/1|PBKDF2-SHA256|' + iter + '|' + created);
  async function encryptJson(obj, pass, iter = KDF_ITER) {
    if (!crypto.subtle) throw new Error(t('ig.k.nocrypto')); const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), created = U.now();
    const key = await deriveKey(pass, salt, iter); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(iter, created) }, key, enc.encode(JSON.stringify(obj)));
    return { schema: 'empowerment-encrypted-backup/1', kdf: 'PBKDF2-SHA256', iter, alg: 'AES-GCM-256', created, salt: U.toB64(salt), iv: U.toB64(iv), ct: U.toB64(ct), note: 'Encrypted with a passphrase. There is no recovery if the passphrase is lost.' };
  }
  async function decryptJson(file, pass) {
    if (!file || file.schema !== 'empowerment-encrypted-backup/1' || file.kdf !== 'PBKDF2-SHA256') throw new Error('unsupported file'); const iter = S.num(file.iter, { min: 1000, max: 5000000, int: true, fallback: KDF_ITER });
    const key = await deriveKey(pass, U.fromB64(String(file.salt)), iter); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: U.fromB64(String(file.iv)), additionalData: aad(iter, String(file.created)) }, key, U.fromB64(String(file.ct))); return JSON.parse(dec.decode(pt));
  }
  const strength = p => { let pool = 0; if (/[a-z]/.test(p)) pool += 26; if (/[A-Z]/.test(p)) pool += 26; if (/\d/.test(p)) pool += 10; if (/[^\w\s]/.test(p)) pool += 20; if (/\s/.test(p)) pool += 4; if (/[^\x00-\x7F]/.test(p)) pool += 30; const bits = Math.log2(Math.max(2, pool)) * p.length * (new Set(p).size / Math.max(1, p.length) < 0.4 ? 0.4 : 1); return bits < 45 ? 'weak' : bits < 70 ? 'fair' : 'good'; };
  async function decryptInteractive(file) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const v = await EP.ui.form({ title: t('ig.decTitle'), intro: t('ig.decIntro') + (attempt ? '\n\n' + t('ig.decBad') : ''), fields: [{ id: 'pass', label: t('ig.pass').split(' (')[0], type: 'password', max: 200 }], submit: t('ig.decOpen'), validate: x => x.pass ? null : t('ig.short') }); if (!v) return null;
      try { return await decryptJson(file, v.pass); } catch { /* wrong passphrase: ask again */ }
    }
    EP.ui.toast(t('ig.decBad')); return null;
  }
  async function exportEncrypted() {
    if (!crypto.subtle) return EP.ui.toast(t('ig.k.nocrypto'));
    const msg = U.el('div', { class: 'small', 'aria-live': 'polite' }); const v = await EP.ui.form({ title: t('ig.enc'), intro: t('ig.enc.note'), wide: false, fields: [{ id: 'p1', label: t('ig.pass'), type: 'password', max: 200 }, { id: 'p2', label: t('ig.pass2'), type: 'password', max: 200 }, { id: 'ack', label: t('ig.nr'), type: 'checkbox' }], submit: t('data.enc'),
      validate: x => x.p1.length < 12 ? t('ig.short') : x.p1 !== x.p2 ? t('ig.mismatch') : !x.ack ? t('ig.ack') : null }); if (!v) return;
    EP.ui.toast(t('ig.encWorking')); try { const file = await encryptJson(EP.core.exportState(true), v.p1); EP.ui.download(JSON.stringify(file), 'empowerment_protocol_private_encrypted.json', 'application/json'); EP.settings.set('lastBackupAt', U.now()); EP.emit('activity', { type: 'encryptedBackup' }); EP.emit('activity', { type: 'backup' }); EP.ui.toast(t('ig.encDone')); } catch (e) { EP.ui.toast(e.message); }
  }

  /* SIGNING ------------------------------------------------------------------------------------------------------ */
  const ecdsa = { name: 'ECDSA', hash: 'SHA-256' };
  const fingerprintOf = async jwk => (await U.sha256(U.canonical({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))).slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  async function generateKey(persist) {
    if (!crypto.subtle) throw new Error(t('ig.k.nocrypto')); const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']); const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const rec = { privateKey: pair.privateKey, publicKey: pair.publicKey, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, createdAt: U.now(), fp: await fingerprintOf(jwk) }; if (persist) await EP.store.put('keys', rec, 'signing'); return rec;
  }
  const getKey = async () => { try { return (await EP.store.get('keys', 'signing')) || null; } catch { return null; } };
  async function signPayload(payload, key) { const body = U.canonical(payload); const sig = await crypto.subtle.sign(ecdsa, key.privateKey, enc.encode(body)); return { schema: 'empowerment-signed/1', signedAt: U.now(), payload, signature: U.toB64(sig), publicKey: key.jwk, fingerprint: key.fp, note: 'Signature proves the content matches what this key signed, not who holds the key.' }; }
  async function verifySigned(pkg) {
    if (!pkg || pkg.schema !== 'empowerment-signed/1' || !pkg.publicKey || !pkg.signature) throw new Error('not a signed file'); const jwk = { kty: 'EC', crv: 'P-256', x: String(pkg.publicKey.x), y: String(pkg.publicKey.y), ext: true };
    const pub = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); const ok = await crypto.subtle.verify(ecdsa, pub, U.fromB64(String(pkg.signature)), enc.encode(U.canonical(pkg.payload))); return { ok, fp: await fingerprintOf(jwk), signedAt: pkg.signedAt };
  }

  /* UI ----------------------------------------------------------------------------------------------------------- */
  const msg = (id, text, cls) => { const e = $(id); if (!e) return; e.textContent = text; e.className = 'small ' + (cls || ''); };
  async function renderLedger() {
    const list = $('ledgerList'); if (!list) return; const rev = entries.slice().reverse().slice(0, 60);
    list.replaceChildren(...(rev.length ? rev.map(e => U.el('div', { class: 'tool-item' }, U.el('div', {}, U.el('span', { class: 'pill', text: '#' + e.seq }), ' ', U.el('span', { class: 'pill ' + (e.type === 'correction' || e.type === 'null-result' ? 'mid' : ''), text: t('ig.t.' + e.type).split(' (')[0] }), ' ', U.el('small', { text: EP.fmt.dateTime(e.at) })), U.el('p', { text: e.text }), U.el('div', { class: 'meta mono', text: (e.refs.length ? '↩ #' + e.refs.join(', #') + ' · ' : '') + e.hash.slice(0, 16) + '…' }))) : [U.el('p', { class: 'small', text: t('ig.empty') })]));
    const h = $('ledgerHead'); if (h) h.textContent = ledger.head(); const rs = $('ledgerRef'); if (rs) rs.replaceChildren(U.el('option', { value: '', text: '—' }), ...entries.slice(-30).reverse().map(e => U.el('option', { value: String(e.seq), text: '#' + e.seq + ' ' + e.text.slice(0, 50) })));
    const cnt = $('ledgerCount'); if (cnt) cnt.textContent = t('ig.entries') + ': ' + entries.length;
  }
  async function renderKey() {
    const box = $('keyInfo'); if (!box) return; const k = await getKey(); const mk = $('keyCreate'), md = $('keyDelete'), ms = $('keySignLedger');
    if (mk) mk.hidden = !!k; for (const b of [md, ms]) if (b) b.hidden = !k; const wrap = $('keySignFileWrap'); if (wrap) wrap.hidden = !k;
    box.replaceChildren(...(k ? [U.el('p', {}, t('ig.k.fp') + ': ', U.el('span', { class: 'mono', text: k.fp })), U.el('p', { class: 'small', text: EP.fmt.dateTime(k.createdAt) })] : [U.el('p', { class: 'small', text: t('ig.k.none') })]));
  }
  function wire() {
    $('ledgerAdd')?.addEventListener('click', async () => {
      const type = $('ledgerType').value, text = $('ledgerText').value.trim(), ref = $('ledgerRef').value; if (!text) return msg('ledgerMsg', t('ig.needText'), 'status-warn'); if (type === 'correction' && !ref) return msg('ledgerMsg', t('ig.needRef'), 'status-warn'); if (!EP.rate.allow('ledger', { capacity: 6, perSec: 0.5 })) return;
      try { await ledger.append(type, text, ref ? [ref] : []); $('ledgerText').value = ''; msg('ledgerMsg', t('f.saved'), 'status-ok'); } catch (e) { msg('ledgerMsg', e.message, 'status-bad'); }
    });
    $('ledgerVerify')?.addEventListener('click', async () => { const r = await ledger.verify(entries); msg('ledgerMsg', r.ok ? t('ig.ok', { n: r.count }) : t('ig.broken', { n: r.brokenAt }), r.ok ? 'status-ok' : 'status-bad'); });
    $('ledgerExport')?.addEventListener('click', () => EP.ui.download(JSON.stringify(ledger.file(), null, 2), 'empowerment_ledger_' + U.localDay() + '.json', 'application/json'));
    $('ledgerCopyHead')?.addEventListener('click', () => EP.ui.copy(ledger.head()));
    $('ledgerAudit')?.addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { if (f.size > 2 * 1024 * 1024) throw new Error('size'); const j = JSON.parse(await f.text()); const list = ledger.sanitizeFile(j); const r = await ledger.verify(list); const headOk = !j.headHash || j.headHash === r.head; msg('auditMsg', r.ok && headOk ? t('ig.ok', { n: r.count }) : t('ig.broken', { n: r.brokenAt || r.count }), r.ok && headOk ? 'status-ok' : 'status-bad'); } catch (err) { msg('auditMsg', err.message, 'status-bad'); } e.target.value = ''; });
    $('exportEncBtn')?.addEventListener('click', exportEncrypted); $('exportEncBtn2')?.addEventListener('click', exportEncrypted);
    $('keyCreate')?.addEventListener('click', async () => { try { await generateKey(EP.store.mode === 'indexeddb'); if (EP.store.mode !== 'indexeddb') EP.ui.toast(t('ig.k.memory')); else EP.ui.toast(t('ig.k.created')); renderKey(); } catch (e) { EP.ui.toast(e.message); } });
    $('keyDelete')?.addEventListener('click', async () => { if (await EP.ui.confirm(t('ig.k.delConfirm'), { danger: true, ok: t('ig.k.del') })) { await EP.store.del('keys', 'signing'); renderKey(); } });
    $('keySignLedger')?.addEventListener('click', async () => { const k = await getKey(); if (!k) return; const pkg = await signPayload(ledger.file(), k); EP.ui.download(JSON.stringify(pkg, null, 2), 'empowerment_ledger_signed_' + U.localDay() + '.json', 'application/json'); EP.ui.toast(t('ig.k.signed')); });
    $('keySignFile')?.addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; if (!f) return; const k = await getKey(); try { if (!k) throw new Error(t('ig.k.none')); if (f.size > 8 * 1024 * 1024) throw new Error('size'); const pkg = await signPayload(JSON.parse(await f.text()), k); EP.ui.download(JSON.stringify(pkg, null, 2), f.name.replace(/\.json$/i, '') + '.signed.json', 'application/json'); EP.ui.toast(t('ig.k.signed')); } catch (err) { msg('signMsg', err.message, 'status-bad'); } e.target.value = ''; });
    $('keyVerify')?.addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { const r = await verifySigned(JSON.parse(await f.text())); msg('signMsg', r.ok ? t('ig.k.good', { fp: r.fp, d: EP.fmt.dateTime(r.signedAt) }) : t('ig.k.bad'), r.ok ? 'status-ok' : 'status-bad'); } catch (err) { msg('signMsg', t('ig.k.bad') + ' ' + err.message, 'status-bad'); } e.target.value = ''; });
  }
  EP.integrity = { ledger, encryptJson, decryptJson, decryptInteractive, exportEncrypted, generateKey, signPayload, verifySigned, fingerprintOf, strength, KDF_ITER, LEDGER_TYPES };
  EP.search.register('ledger', () => entries.map(e => ({ id: 'lg-' + e.seq, kind: 'toc.integrity', title: '#' + e.seq + ' ' + e.text.slice(0, 80), text: e.text, go: { sel: '#ledgerList' } })));

  EP.module('integrity', async () => {
    try { const saved = await EP.store.get('meta', 'ledger'); entries = saved && Array.isArray(saved.entries) ? saved.entries : []; const v = await ledger.verify(entries); if (!v.ok) EP.log.warn('Ledger chain verification failed at entry ' + v.brokenAt); } catch { entries = []; }
    const sel = $('ledgerType'); if (sel) sel.replaceChildren(...LEDGER_TYPES.map(x => U.el('option', { value: x, text: t('ig.t.' + x) })));
    wire(); renderLedger(); renderKey();
    EP.on('ledger:change', renderLedger); EP.on('lang', () => { const s = $('ledgerType'); if (s) { const v = s.value; s.replaceChildren(...LEDGER_TYPES.map(x => U.el('option', { value: x, text: t('ig.t.' + x) }))); s.value = v; } renderLedger(); renderKey(); });
    EP.on('data:wiped', () => { entries = []; renderLedger(); });
  }, { order: 58 });
})();
