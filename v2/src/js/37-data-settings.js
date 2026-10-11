/* SECTION 5 · DATA LIFECYCLE, RESTORE POINTS, SETTINGS & READ-ALOUD
   Purpose : (1) restore points so no import, merge or conflict can destroy work,
             (2) storage visibility (usage, persistence request, backup cadence),
             (3) erase / legacy-cleanup controls, (4) opt-in install + offline cache (hosted use),
             (5) one Settings dialog for accessibility, language, privacy and session choices,
             (6) read-aloud with the browser's own speech engine (nothing is sent anywhere).
   Extend  : add a control to buildSettings(); add a store to wipeAll(); new prefs need a default in
             kernel K7. Everything here works offline.
   Outcome : people can leave, restore or erase on their own terms, and tailor the interface to
             their body and context without asking anyone. */
(function () {
  'use strict';
  const U = EP.util, S = EP.sanitize, $ = U.$, t = (k, v) => EP.t(k, v);
  const LEGACY_DBS = ['foster_navi_empowerment_protocol_v1', 'empowerment_recursive_collab_v3'];

  EP.i18n.register({
    'set.title': ['Settings', 'Ajustes', 'Réglages'], 'set.appearance': ['Appearance', 'Apariencia', 'Apparence'], 'set.theme': ['Colour theme', 'Tema de color', 'Thème de couleur'],
    'set.theme.auto': ['Match my device', 'Igual que mi dispositivo', 'Selon mon appareil'], 'set.theme.dark': ['Dark', 'Oscuro', 'Sombre'], 'set.theme.light': ['Light', 'Claro', 'Clair'], 'set.theme.hc': ['High contrast', 'Alto contraste', 'Contraste élevé'],
    'set.font': ['Text size', 'Tamaño del texto', 'Taille du texte'], 'set.lh': ['Line spacing', 'Interlineado', 'Interligne'], 'set.ls': ['Letter spacing', 'Espaciado de letras', 'Espacement des lettres'],
    'set.normal': ['Normal', 'Normal', 'Normal'], 'set.relaxed': ['Relaxed', 'Amplio', 'Aéré'], 'set.loose': ['Loose', 'Muy amplio', 'Très aéré'], 'set.wide': ['Wide', 'Ancho', 'Large'], 'set.wider': ['Wider', 'Más ancho', 'Plus large'],
    'set.dyslexia': ['Dyslexia-friendly fonts and spacing', 'Tipografía y espaciado para dislexia', 'Polices et espacement adaptés à la dyslexie'], 'set.underline': ['Always underline links', 'Subrayar siempre los enlaces', 'Toujours souligner les liens'],
    'set.contrast': ['Extra contrast for borders and text', 'Más contraste en bordes y texto', 'Contraste renforcé des bordures et du texte'],
    'set.motion': ['Motion', 'Movimiento', 'Mouvement'], 'set.motion.auto': ['Follow my device', 'Según mi dispositivo', 'Selon mon appareil'], 'set.motion.reduce': ['Reduce motion', 'Reducir movimiento', 'Réduire les animations'], 'set.motion.full': ['Allow motion', 'Permitir movimiento', 'Autoriser les animations'],
    'set.parallax': ['Parallax scrolling effects', 'Efectos de desplazamiento parallax', 'Effets de parallaxe au défilement'],
    'set.language': ['Language', 'Idioma', 'Langue'], 'set.session': ['Session & display', 'Sesión y pantalla', 'Session et affichage'], 'set.splash': ['Launch screen', 'Pantalla de inicio', 'Écran de lancement'],
    'set.splash.session': ['Once per browser session', 'Una vez por sesión', 'Une fois par session'], 'set.splash.always': ['Every time', 'Cada vez', 'À chaque fois'], 'set.splash.never': ['Never', 'Nunca', 'Jamais'],
    'set.hud': ['Show the progress HUD', 'Mostrar el panel de progreso', 'Afficher le tableau de progression'], 'set.privacy': ['Privacy & safety', 'Privacidad y seguridad', 'Confidentialité et sécurité'],
    'set.analytics': ['Local-only usage counters (off by default)', 'Contadores de uso solo locales (desactivados por defecto)', 'Compteurs d’usage locaux (désactivés par défaut)'],
    'set.analytics.note': ['Counts which tools you open, stored only in this browser. You can view, export and erase them in System check. Nothing is ever sent.', 'Cuenta qué herramientas abre, solo en este navegador. Puede verlos, exportarlos y borrarlos en la comprobación del sistema. Nunca se envía nada.', 'Compte les outils ouverts, uniquement dans ce navigateur. Vous pouvez les voir, les exporter et les effacer dans la vérification du système. Rien n’est jamais envoyé.'],
    'set.youth': ['Youth-safe mode (classrooms, under 18)', 'Modo seguro para jóvenes (aulas, menores de 18)', 'Mode jeunesse sûr (classes, moins de 18 ans)'],
    'set.youth.note': ['Turns off internet rooms and analytics, and keeps sharing to files your teacher can see. Recommended on shared school devices.', 'Desactiva las salas por internet y la analítica, y limita el intercambio a archivos que su docente puede ver. Recomendado en dispositivos escolares compartidos.', 'Désactive les salles Internet et l’analytique, et limite le partage à des fichiers que l’enseignant peut voir. Recommandé sur les appareils scolaires partagés.'],
    'set.backup': ['Backup reminder every (days)', 'Recordatorio de copia cada (días)', 'Rappel de sauvegarde tous les (jours)'], 'set.reading': ['Reading aloud', 'Lectura en voz alta', 'Lecture à voix haute'], 'set.voice': ['Voice', 'Voz', 'Voix'], 'set.rate': ['Speed', 'Velocidad', 'Vitesse'],
    'set.voice.default': ['Browser default', 'Predeterminada del navegador', 'Par défaut du navigateur'], 'set.resetPrefs': ['Reset all preferences', 'Restablecer todas las preferencias', 'Réinitialiser les préférences'], 'set.system': ['Open System check', 'Abrir comprobación del sistema', 'Ouvrir la vérification du système'],
    'set.saved': ['Preferences are saved in this browser only.', 'Las preferencias se guardan solo en este navegador.', 'Les préférences sont enregistrées uniquement dans ce navigateur.'],
    'data.restore': ['Restore points', 'Puntos de restauración', 'Points de restauration'], 'data.restore.note': ['Automatic snapshots are taken before imports, conflicts and every few minutes of editing. They live in this browser only.', 'Se toman instantáneas automáticas antes de importar, ante conflictos y cada pocos minutos de edición. Viven solo en este navegador.', 'Des instantanés sont créés avant les imports, lors des conflits et toutes les quelques minutes d’édition. Ils restent dans ce navigateur.'],
    'data.restore.now': ['Create restore point now', 'Crear punto de restauración ahora', 'Créer un point de restauration maintenant'], 'data.restore.none': ['No restore points yet.', 'Aún no hay puntos de restauración.', 'Aucun point de restauration pour l’instant.'],
    'data.restore.do': ['Restore', 'Restaurar', 'Restaurer'], 'data.restore.confirm': ['Restore this snapshot? Your current workspace is saved as a new restore point first.', '¿Restaurar esta instantánea? Su espacio actual se guarda antes como nuevo punto de restauración.', 'Restaurer cet instantané ? Votre espace actuel est d’abord enregistré comme point de restauration.'],
    'data.restore.done': ['Snapshot restored.', 'Instantánea restaurada.', 'Instantané restauré.'], 'data.restore.created': ['Restore point created.', 'Punto de restauración creado.', 'Point de restauration créé.'], 'data.restore.empty': ['Nothing to snapshot yet: the workspace is empty.', 'Nada que guardar aún: el espacio está vacío.', 'Rien à enregistrer : l’espace est vide.'],
    'data.storage': ['Storage & persistence', 'Almacenamiento y persistencia', 'Stockage et persistance'], 'data.usage': ['Used by this app:', 'Usado por esta app:', 'Utilisé par cette app :'], 'data.persist': ['Ask the browser to keep my data', 'Pedir al navegador que conserve mis datos', 'Demander au navigateur de conserver mes données'],
    'data.persist.yes': ['The browser has promised to keep this data unless you clear it yourself.', 'El navegador prometió conservar estos datos salvo que usted los borre.', 'Le navigateur s’est engagé à conserver ces données sauf si vous les effacez.'], 'data.persist.no': ['Not guaranteed: the browser may clear this data when space is low. Export backups.', 'No garantizado: el navegador podría borrar estos datos si falta espacio. Exporte copias.', 'Non garanti : le navigateur peut effacer ces données si l’espace manque. Exportez des sauvegardes.'],
    'data.lastBackup': ['Last backup', 'Última copia', 'Dernière sauvegarde'], 'data.never': ['never', 'nunca', 'jamais'], 'data.backupDue': ['A backup is due. Use “Download JSON” or the encrypted backup.', 'Toca hacer una copia. Use «Descargar JSON» o la copia cifrada.', 'Une sauvegarde est due. Utilisez « Télécharger JSON » ou la sauvegarde chiffrée.'],
    'data.legacy': ['Delete legacy v3 databases', 'Eliminar bases de datos heredadas v3', 'Supprimer les bases de données héritées v3'], 'data.legacy.note': ['Your v3 data was copied into v4 and left untouched. Delete the old copies once you have verified your workspace.', 'Sus datos v3 se copiaron a v4 y se dejaron intactos. Elimine las copias antiguas cuando haya verificado su espacio.', 'Vos données v3 ont été copiées dans v4 et laissées intactes. Supprimez les anciennes copies après vérification.'],
    'data.legacy.confirm': ['Permanently delete the old v3 databases from this browser? v4 data is not affected.', '¿Eliminar definitivamente las bases v3 antiguas de este navegador? Los datos v4 no se ven afectados.', 'Supprimer définitivement les anciennes bases v3 de ce navigateur ? Les données v4 ne sont pas touchées.'],
    'data.legacy.done': ['Legacy databases deleted.', 'Bases heredadas eliminadas.', 'Bases héritées supprimées.'], 'data.erase': ['Erase everything…', 'Borrar todo…', 'Tout effacer…'],
    'data.erase.body': ['This deletes every database, preference, key and cache this app created in this browser, including restore points, ledger and signing keys. Backups you exported are not affected and cannot be recalled.\n\nType ERASE to confirm.', 'Esto elimina todas las bases de datos, preferencias, claves y cachés que esta app creó en este navegador, incluidos los puntos de restauración, el registro y las claves de firma. Las copias exportadas no se ven afectadas ni pueden recuperarse.\n\nEscriba ERASE para confirmar.', 'Ceci supprime toutes les bases, préférences, clés et caches créés par cette app dans ce navigateur, y compris points de restauration, registre et clés de signature. Les sauvegardes exportées ne sont pas touchées.\n\nTapez ERASE pour confirmer.'],
    'data.erase.field': ['Confirmation', 'Confirmación', 'Confirmation'], 'data.erase.bad': ['Type ERASE exactly.', 'Escriba ERASE exactamente.', 'Tapez ERASE exactement.'],
    'pwa.title': ['Install & offline cache (hosted copies only)', 'Instalación y caché sin conexión (solo copias alojadas)', 'Installation et cache hors ligne (copies hébergées seulement)'],
    'pwa.note': ['Opening index.html from a file already works offline. If you host this folder on HTTPS or localhost, you can optionally register a service worker to cache it and install it like an app. Nothing is registered unless you press the button.', 'Abrir index.html desde un archivo ya funciona sin conexión. Si aloja esta carpeta en HTTPS o localhost, puede registrar opcionalmente un service worker para guardarla en caché e instalarla como app. No se registra nada salvo que pulse el botón.', 'Ouvrir index.html depuis un fichier fonctionne déjà hors ligne. Si vous hébergez ce dossier en HTTPS ou sur localhost, vous pouvez enregistrer un service worker pour le mettre en cache et l’installer comme une app. Rien n’est enregistré sans votre clic.'],
    'pwa.button': ['Enable offline cache / install', 'Activar caché sin conexión / instalar', 'Activer le cache hors ligne / installer'], 'pwa.unavailable': ['Not available here: needs a hosted copy over HTTPS or localhost with sw.js beside index.html.', 'No disponible aquí: requiere una copia alojada en HTTPS o localhost con sw.js junto a index.html.', 'Indisponible ici : il faut une copie hébergée en HTTPS ou sur localhost avec sw.js à côté de index.html.'],
    'pwa.ok': ['Offline cache registered. If your browser shows an Install option in its menu or address bar, you can install from there.', 'Caché sin conexión registrada. Si su navegador muestra una opción Instalar en el menú o la barra de direcciones, puede instalarla desde allí.', 'Cache hors ligne enregistré. Si votre navigateur propose Installer dans son menu ou sa barre d’adresse, vous pouvez installer depuis là.'], 'pwa.fail': ['Could not register the service worker:', 'No se pudo registrar el service worker:', 'Impossible d’enregistrer le service worker :']
  });

  EP.i18n.register({
    'data.eyebrow': ['OWN YOUR INFORMATION', 'SUS DATOS SON SUYOS', 'VOS DONNÉES VOUS APPARTIENNENT'], 'data.title': ['Backup, import, export and privacy', 'Copia, importación, exportación y privacidad', 'Sauvegarde, import, export et confidentialité'],
    'data.lede': ['You can always leave with a copy, go back to an earlier state, or erase everything.', 'Siempre puede irse con una copia, volver a un estado anterior o borrarlo todo.', 'Vous pouvez toujours partir avec une copie, revenir à un état antérieur ou tout effacer.'],
    'data.export': ['Export workspace', 'Exportar el espacio', 'Exporter l’espace'], 'data.import': ['Import workspace', 'Importar el espacio', 'Importer l’espace'], 'data.lifecycle': ['Data lifecycle', 'Ciclo de vida de los datos', 'Cycle de vie des données'],
    'data.fullExport': ['Include private descriptions, notes, genomes, methods, feedback and toolkit records (private backup)', 'Incluir descripciones privadas, notas, genomas, métodos, comentarios y registros del kit (copia privada)', 'Inclure descriptions privées, notes, génomes, méthodes, retours et enregistrements (sauvegarde privée)'],
    'data.json': ['Download JSON', 'Descargar JSON', 'Télécharger le JSON'], 'data.enc': ['Download encrypted backup…', 'Descargar copia cifrada…', 'Télécharger la sauvegarde chiffrée…'], 'data.brief': ['Download research brief (.txt)', 'Descargar resumen de investigación (.txt)', 'Télécharger la synthèse de recherche (.txt)'],
    'data.pick': ['Select a JSON backup (up to 16 MB; encrypted backups ask for the passphrase)', 'Seleccione una copia JSON (hasta 16 MB; las cifradas piden la contraseña)', 'Choisissez une sauvegarde JSON (16 Mo max ; les sauvegardes chiffrées demandent la phrase secrète)'],
    'data.mode': ['Import mode', 'Modo de importación', 'Mode d’import'], 'data.understand': ['I understand import changes data stored in this browser.', 'Entiendo que importar cambia los datos guardados en este navegador.', 'Je comprends que l’import modifie les données stockées dans ce navigateur.'], 'data.validate': ['Validate and import', 'Validar e importar', 'Valider et importer'],
    'data.deleteWs': ['Delete local workspace…', 'Eliminar el espacio local…', 'Supprimer l’espace local…']
  });

  EP.i18n.register({
    'at.eyebrow': ['SOURCES · LIMITS · ATTRIBUTION', 'FUENTES · LÍMITES · ATRIBUCIÓN', 'SOURCES · LIMITES · ATTRIBUTION'], 'at.title': ['Attributions & licensing', 'Atribuciones y licencia', 'Attributions et licence'],
    'at.zh': ['Zero-Harm & Anti-Inversion: nothing here profiles, ranks or monitors people; nothing leaves the device unless you export or connect on purpose.', 'Cero daño y anti-inversión: nada aquí perfila, clasifica ni vigila a las personas; nada sale del dispositivo salvo que usted exporte o se conecte a propósito.', 'Zéro préjudice et anti-inversion : rien ici ne profile, ne classe ni ne surveille personne ; rien ne quitte l’appareil sans export ou connexion volontaire.'],
    'guide.eyebrow': ['FIELD GUIDE · LONG READ', 'GUÍA DE CAMPO · LECTURA LARGA', 'GUIDE DE TERRAIN · LECTURE LONGUE'], 'guide.title': ['The Recursive Innovation Field Guide', 'La guía de campo de innovación recursiva', 'Le guide de terrain de l’innovation récursive'],
    'guide.lede': ['Seven short chapters that give policy makers, decision makers, teachers and students one shared vocabulary before they use the tools. Practice guidance, not research findings: for evidence, use the Evidence library and primary sources.', 'Siete capítulos breves que dan a responsables de políticas, tomadores de decisiones, docentes y estudiantes un vocabulario común antes de usar las herramientas. Guía de práctica, no hallazgos de investigación: para evidencia, use la biblioteca de evidencia y fuentes primarias.', 'Sept courts chapitres qui donnent aux décideurs, enseignants et élèves un vocabulaire commun avant d’utiliser les outils. Conseils de pratique, pas résultats de recherche : pour les preuves, utilisez la bibliothèque de preuves et les sources primaires.'],
    'guide.langNote': ['The guide is written in English; the interface around it is translated.', 'La guía está escrita en inglés; la interfaz que la rodea está traducida.', 'Le guide est rédigé en anglais ; l’interface qui l’entoure est traduite.'], 'guide.print': ['Print the guide', 'Imprimir la guía', 'Imprimer le guide']
  });

  /* RESTORE POINTS ------------------------------------------------------------------------------ */
  const MAX_HISTORY = 25;
  const countsOf = s => ({ projects: s?.projects?.length || 0, evidence: s?.evidence?.length || 0, genomes: s?.genomes?.length || 0, ext: Object.values(s?.ext || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0) });
  EP.history = {
    MAX: MAX_HISTORY,
    async put(snap, label) {
      try {
        if (!snap) return null; const c = countsOf(snap);
        if (!c.projects && !c.evidence && !c.genomes && !c.ext) return null;
        await EP.store.put('history', { at: U.now(), label: S.line(label || 'Snapshot', 120), counts: c, snapshot: snap });
        const keys = (await EP.store.keys('history')).sort((a, b) => a - b);
        for (const k of keys.slice(0, Math.max(0, keys.length - MAX_HISTORY))) await EP.store.del('history', k);
        EP.emit('history:change'); return true;
      } catch (e) { EP.log.warn('history put', e); return null; }
    },
    snapshot(label) { return EP.history.put(EP.core.stateJSON(), label); },
    async list() { const all = await EP.store.all('history'); return all.map(r => ({ id: r.id, at: r.at, label: r.label, counts: r.counts })).sort((a, b) => b.id - a.id); },
    async restore(id) {
      const rec = await EP.store.get('history', id); if (!rec) throw new Error('Restore point not found');
      const valid = EP.core.validateBackup(rec.snapshot);
      await EP.history.snapshot('Before restoring a restore point');
      EP.core.state = valid; EP.core.clearSelection(); await EP.core.persist(); EP.core.renderAll(); EP.emit('history:change'); EP.emit('state:reloaded');
    },
    async remove(id) { await EP.store.del('history', id); EP.emit('history:change'); },
    async clear() { await EP.store.clear('history'); EP.emit('history:change'); }
  };

  /* DATA LIFECYCLE ------------------------------------------------------------------------------ */
  function deleteIdb(name) { return new Promise(res => { try { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } }); }
  EP.data = {
    async wipeAll() { for (const s of ['history', 'analytics', 'records', 'quarantine', 'meta']) { try { await EP.store.clear(s); } catch {} } EP.emit('data:wiped'); },
    async deleteLegacy() { for (const n of LEGACY_DBS) await deleteIdb(n); try { localStorage.removeItem('fn_ep_backup_v1'); localStorage.removeItem('fn_ep_theme'); } catch {} },
    async legacyPresent() { if (!window.indexedDB || !indexedDB.databases) return null; try { const dbs = await indexedDB.databases(); return dbs.some(d => LEGACY_DBS.includes(d.name)); } catch { return null; } },
    async eraseEverything() {
      await EP.store.deleteDatabase(); await EP.data.deleteLegacy();
      try { for (const k of ['ep4_boot']) localStorage.removeItem(k); sessionStorage.clear(); } catch {}
      try { if ('caches' in window) for (const k of await caches.keys()) if (k.startsWith('empowerment')) await caches.delete(k); } catch {}
      try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch {}
      location.reload();
    },
    hasContent() { const c = countsOf(EP.core.state); return !!(c.projects || c.evidence || c.genomes || c.ext); },
    backupDue() {
      if (!EP.data.hasContent()) return false; const last = EP.settings.get('lastBackupAt'); if (!last) return true;
      return (Date.now() - Date.parse(last)) / 864e5 >= EP.settings.get('backupCadenceDays');
    }
  };

  async function renderRestorePoints() {
    const box = $('restoreList'); if (!box) return;
    const items = await EP.history.list();
    box.replaceChildren(...(items.length ? items.map(r => U.el('div', { class: 'tool-item' },
      U.el('strong', { text: EP.fmt.dateTime(r.at) }), U.el('div', { class: 'meta', text: r.label + ' · ' + r.counts.projects + ' / ' + r.counts.evidence + ' / ' + r.counts.genomes + ' / ' + r.counts.ext }),
      U.el('div', { class: 'row-actions' },
        U.el('button', { type: 'button', text: t('data.restore.do'), onclick: async () => { if (!(await EP.ui.confirm(t('data.restore.confirm'), { ok: t('data.restore.do') }))) return; try { await EP.history.restore(r.id); EP.ui.toast(t('data.restore.done')); } catch (e) { EP.ui.toast(e.message); } } }),
        U.el('button', { type: 'button', class: 'danger', text: t('ui.delete'), onclick: () => EP.history.remove(r.id) })))) : [U.el('p', { class: 'small', text: t('data.restore.none') })]));
  }
  async function renderStorage() {
    const box = $('storageInfo'); if (!box) return; const parts = [];
    try {
      if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); parts.push(U.el('p', {}, t('data.usage') + ' ', U.el('strong', { text: EP.fmt.bytes(e.usage || 0) }), e.quota ? ' / ' + EP.fmt.bytes(e.quota) : '')); if (e.quota) parts.push(U.el('div', { class: 'bar-h', 'aria-hidden': 'true' }, U.el('span', { style: 'width:' + Math.max(1, Math.min(100, 100 * (e.usage || 0) / e.quota)) + '%' }))); }
      if (navigator.storage?.persisted) { const p = await navigator.storage.persisted(); parts.push(U.el('p', { class: 'small ' + (p ? 'status-ok' : 'status-warn'), text: p ? t('data.persist.yes') : t('data.persist.no') })); }
    } catch { /* estimate is optional */ }
    const last = EP.settings.get('lastBackupAt');
    parts.push(U.el('p', { class: 'small', text: t('data.lastBackup') + ': ' + (last ? EP.fmt.dateTime(last) : t('data.never')) }));
    if (EP.data.backupDue()) parts.push(U.el('div', { class: 'callout warn', text: t('data.backupDue') }));
    const legacy = await EP.data.legacyPresent(); const lb = $('delLegacy'); if (lb) lb.hidden = legacy === false;
    box.replaceChildren(...parts);
  }
  function wireDataSection() {
    $('restoreNow')?.addEventListener('click', async () => { if (!EP.data.hasContent()) return EP.ui.toast(t('data.restore.empty')); await EP.history.snapshot('Manual restore point'); EP.ui.toast(t('data.restore.created')); });
    $('persistBtn')?.addEventListener('click', async () => { try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch {} renderStorage(); });
    $('delLegacy')?.addEventListener('click', async () => { if (!(await EP.ui.confirm(t('data.legacy.confirm'), { danger: true, ok: t('ui.delete') }))) return; await EP.data.deleteLegacy(); EP.ui.toast(t('data.legacy.done')); renderStorage(); });
    $('eraseAll')?.addEventListener('click', async () => {
      const v = await EP.ui.form({ title: t('data.erase'), intro: t('data.erase.body'), fields: [{ id: 'phrase', label: t('data.erase.field'), max: 10 }], submit: t('data.erase'), danger: true, validate: x => x.phrase === 'ERASE' ? null : t('data.erase.bad') });
      if (v) await EP.data.eraseEverything();
    });
    EP.on('history:change', renderRestorePoints); EP.on('state:saved', () => { renderStorage(); }); EP.on('lang', () => { renderRestorePoints(); renderStorage(); }); EP.on('settings:lastBackupAt', renderStorage);
    renderRestorePoints(); renderStorage();
  }

  /* OPT-IN INSTALL / OFFLINE CACHE --------------------------------------------------------------- */
  let deferredInstall = null;
  function setupPwa() {
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
    const hosted = !EP.strict && /^https?:$/.test(location.protocol) && 'serviceWorker' in navigator;
    $('installPwa')?.addEventListener('click', async () => {
      if (!hosted) return EP.ui.toast(t('pwa.unavailable'));
      try {
        if (!document.querySelector('link[rel="manifest"]')) document.head.append(U.el('link', { rel: 'manifest', href: './manifest.webmanifest' }));
        await navigator.serviceWorker.register('./sw.js'); EP.ui.toast(t('pwa.ok'));
        if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; }
      } catch (e) { EP.ui.toast(t('pwa.fail') + ' ' + (e.message || e)); }
    });
  }

  /* READ ALOUD ------------------------------------------------------------------------------------- */
  EP.speech = (() => {
    const ok = 'speechSynthesis' in window; let queue = [], speaking = false, btnRef = null;
    const chunks = text => { const out = []; for (const sentence of text.replace(/\s+/g, ' ').match(/[^.!?。]+[.!?。]?/g) || []) { let s = sentence.trim(); while (s.length > 220) { const cut = s.lastIndexOf(' ', 220); out.push(s.slice(0, cut > 40 ? cut : 220)); s = s.slice(cut > 40 ? cut : 220).trim(); } if (s) out.push(s); } return out; };
    function next() {
      if (!queue.length) { speaking = false; btnRef && (btnRef.textContent = '🔊 ' + t('ui.listen')); return; }
      const u = new SpeechSynthesisUtterance(queue.shift()); u.rate = EP.settings.get('speechRate'); u.lang = EP.i18n.lang;
      const v = speechSynthesis.getVoices().find(x => x.name === EP.settings.get('voice')); if (v) u.voice = v;
      u.onend = next; u.onerror = () => { queue = []; next(); }; speechSynthesis.speak(u);
    }
    return {
      ok,
      stop() { if (!ok) return; queue = []; speechSynthesis.cancel(); speaking = false; btnRef && (btnRef.textContent = '🔊 ' + t('ui.listen')); },
      speak(text, btn) { if (!ok) return; if (speaking) { EP.speech.stop(); return; } btnRef = btn || null; queue = chunks(text).slice(0, 400); speaking = true; if (btn) btn.textContent = '■ ' + t('ui.stop'); EP.analytics.record('readAloud'); next(); }
    };
  })();
  function attachListenButtons() {
    if (!EP.speech.ok) return;
    for (const s of U.qsa('main > section[id]')) {
      if (s.querySelector(':scope .listen-btn')) continue; const head = s.querySelector('.section-head h2'); if (!head) continue;
      const b = U.el('button', { type: 'button', class: 'listen-btn no-print', style: 'margin-left:.5rem;font-size:.8rem;padding:.1rem .6rem;border-radius:999px', text: '🔊 ' + t('ui.listen') });
      b.addEventListener('click', () => { const clone = s.cloneNode(true); clone.querySelectorAll('button,.callout[id^="bn-"],script,style,details:not([open]) > :not(summary)').forEach(n => n.remove()); EP.speech.speak(clone.textContent, b); });
      head.after(b);
    }
  }

  /* SETTINGS DIALOG --------------------------------------------------------------------------------- */
  function buildSettings() {
    const P = EP.settings;
    const sel = (key, labelKey, opts, i18nPrefix) => { const id = 'st_' + key; const s = U.el('select', { id }, opts.map(o => U.el('option', { value: o, text: t((i18nPrefix || 'set.' + key) + '.' + o) }))); s.value = P.get(key); s.addEventListener('change', () => { P.set(key, s.value); }); return [U.el('label', { for: id, text: t(labelKey) }), s]; };
    const chk = (key, labelKey, note) => { const id = 'st_' + key; const c = U.el('input', { type: 'checkbox', id }); c.checked = !!P.get(key); c.addEventListener('change', () => { P.set(key, c.checked); }); return U.el('label', { class: 'check', for: id }, c, U.el('span', {}, t(labelKey), note ? U.el('small', { class: 'small', style: 'display:block;color:var(--muted)', text: t(note) }) : null)); };
    const range = (key, labelKey, min, max, step) => { const id = 'st_' + key; const r = U.el('input', { type: 'range', id, min, max, step, value: P.get(key) }); const out = U.el('output', { for: id, text: String(P.get(key)) }); r.addEventListener('input', () => { out.textContent = r.value; P.set(key, Number(r.value)); }); return [U.el('label', { for: id }, t(labelKey) + ': ', out), r]; };
    const voices = U.el('select', { id: 'st_voice' }); const fillVoices = () => { if (!EP.speech.ok) return; const vs = speechSynthesis.getVoices(); voices.replaceChildren(U.el('option', { value: '', text: t('set.voice.default') }), ...vs.map(v => U.el('option', { value: v.name, text: v.name + ' (' + v.lang + ')' }))); voices.value = P.get('voice'); }; fillVoices(); if (EP.speech.ok) speechSynthesis.onvoiceschanged = fillVoices;
    voices.addEventListener('change', () => P.set('voice', voices.value));
    const langSel = U.el('select', { id: 'st_lang' }, [['auto', t('lang.auto')], ['en', 'English'], ['es', 'Español'], ['fr', 'Français']].map(([v, l]) => U.el('option', { value: v, text: l }))); langSel.value = P.get('lang'); langSel.addEventListener('change', () => EP.i18n.set(langSel.value));
    const cad = U.el('input', { type: 'number', id: 'st_cad', min: 7, max: 365, value: P.get('backupCadenceDays') }); cad.addEventListener('change', () => P.set('backupCadenceDays', cad.value));
    const grid = U.el('div', { class: 'settings-grid' },
      U.el('fieldset', {}, U.el('legend', { text: t('set.appearance') }), ...sel('theme', 'set.theme', ['auto', 'dark', 'light', 'hc']), ...range('fontScale', 'set.font', 85, 150, 5), ...sel('lineHeight', 'set.lh', ['normal', 'relaxed', 'loose'], 'set'), ...sel('letterSpacing', 'set.ls', ['normal', 'wide', 'wider'], 'set'), chk('dyslexia', 'set.dyslexia'), chk('underline', 'set.underline'), chk('contrast', 'set.contrast')),
      U.el('fieldset', {}, U.el('legend', { text: t('set.motion') }), ...sel('motion', 'set.motion', ['auto', 'reduce', 'full']), chk('parallax', 'set.parallax'), U.el('label', { for: 'st_lang', text: t('set.language') }), langSel, U.el('p', { class: 'lang-note', text: t('lang.note') })),
      U.el('fieldset', {}, U.el('legend', { text: t('set.session') }), U.el('label', { for: 'st_role', text: t('role.label') }), (() => { const r = U.el('select', { id: 'st_role' }, ['', 'policy', 'corporate', 'educator', 'student', 'community'].map(v => U.el('option', { value: v, text: t(v ? 'role.' + v : 'role.none') }))); r.value = P.get('role'); r.addEventListener('change', () => P.set('role', r.value)); return r; })(), ...sel('splash', 'set.splash', ['session', 'always', 'never']), chk('hud', 'set.hud'), U.el('label', { for: 'st_cad', text: t('set.backup') }), cad),
      U.el('fieldset', {}, U.el('legend', { text: t('set.privacy') }), chk('analytics', 'set.analytics', 'set.analytics.note'), chk('youthSafe', 'set.youth', 'set.youth.note')),
      EP.speech.ok ? U.el('fieldset', {}, U.el('legend', { text: t('set.reading') }), U.el('label', { for: 'st_voice', text: t('set.voice') }), voices, ...range('speechRate', 'set.rate', 0.6, 1.6, 0.1)) : null);
    const foot = U.el('div', { class: 'row-actions' }, U.el('button', { type: 'button', class: 'danger', text: t('set.resetPrefs'), onclick: async () => { await P.reset(); EP.i18n.init(); EP.ui.toast(t('set.saved')); } }), U.el('a', { class: 'button', href: '#system', text: t('set.system'), onclick: () => setTimeout(() => document.querySelector('dialog.ep-dialog')?.dispatchEvent(new Event('cancel')), 0) }));
    return U.el('div', {}, grid, U.el('p', { class: 'small', text: t('set.saved') }), foot);
  }
  EP.settingsUI = { open() { EP.analytics.record('settings'); return EP.ui.dialog({ title: t('set.title'), body: buildSettings(), wide: true, actions: [{ id: 'close', label: t('ui.close'), primary: true }] }); } };

  EP.module('data-settings', () => { wireDataSection(); setupPwa(); attachListenButtons(); EP.on('lang', () => { U.qsa('.listen-btn').forEach(b => b.remove()); attachListenButtons(); }); }, { order: 30 });
})();
