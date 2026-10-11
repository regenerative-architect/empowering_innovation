/* SECTION 7 · GAMIFICATION HUD + CONSTELLATION STATE VISUALISER
   Purpose : a light, honest progress layer. It rewards *documented practice* (asking, measuring,
             checking safeguards, recording nulls and corrections), never volume or real-world impact.
   Design  : - XP = v3 formula (from your records) + capped bonus for new tools (daily cap, diminishing
               returns, so grinding does not pay);  - streaks forgive one rest day per week and never
               shame; - weekly quests are chosen deterministically from the ISO week (same for everyone);
             - no leaderboards, no social comparison, no notifications; - data is counts and timestamps
               stored in IndexedDB 'meta/hud', resettable in one click.
   Extend  : add a badge to BADGES (id, icon, test), a quest to QUESTS (matching event types), an event
             weight to XP_BONUS; modules report work with EP.emit('activity', {type}).
   Outcome : motivation that supports good method. The <ep-constellation> element draws the same state
             as stars (engines, tools) with a text alternative and reduced-motion support. */
(function () {
  'use strict';
  const U = EP.util, $ = U.$, t = (k, v) => EP.t(k, v);

  const XP_BONUS = { brief: 12, briefShared: 4, decision: 10, pilot: 10, stakeholder: 6, risk: 6, inversion: 15, logic: 8, scenario: 6, kit: 10, passport: 8, review: 6, ledger: 4, correction: 10, nullResult: 12, backup: 5, encryptedBackup: 8, import: 4, accept: 3, project: 0, evidence: 0, observation: 0, taskDone: 0 };
  const DAILY_CAP = 60;
  const QUESTS = [
    ['q-null', ['nullResult', 'correction'], 'q.null'], ['q-inversion', ['inversion'], 'q.inversion'], ['q-evidence', ['evidence'], 'q.evidence'], ['q-observe', ['observation'], 'q.observe'],
    ['q-map', ['stakeholder'], 'q.map'], ['q-compare', ['decision'], 'q.compare'], ['q-range', ['scenario'], 'q.range'], ['q-ledger', ['ledger', 'correction'], 'q.ledger'],
    ['q-backup', ['backup', 'encryptedBackup'], 'q.backup'], ['q-reflect', ['passport'], 'q.reflect'], ['q-pilot', ['pilot'], 'q.pilot'], ['q-brief', ['brief'], 'q.brief'], ['q-risk', ['risk', 'inversion'], 'q.risk']
  ];
  const BADGES = [
    ['b-pilot', '🌱', c => c.projects >= 1], ['b-observe', '📏', c => c.obs >= 1], ['b-evidence', '🔎', c => c.evidence >= 1], ['b-three', '🧩', c => c.projects >= 3], ['b-ten', '🛠️', c => c.tasks >= 10],
    ['b-cartographer', '🗺️', c => c.ext.stakeholders >= 3], ['b-guardian', '🛡️', c => c.ext.inversions >= 1], ['b-skeptic', '🧐', c => c.has('nullResult') || c.has('correction')], ['b-explainer', '📣', c => c.has('briefShared')],
    ['b-reflector', '🪞', c => c.ext.passport >= 3], ['b-steward', '🔐', c => c.has('encryptedBackup')], ['b-balancer', '⚖️', c => c.vetoDecision], ['b-replicator', '🔁', c => c.has('accept') || c.has('import')]
  ];

  EP.i18n.register({
    'hud.pill': ['Level {l} · {x} XP', 'Nivel {l} · {x} XP', 'Niveau {l} · {x} XP'], 'hud.open': ['Open progress panel', 'Abrir panel de progreso', 'Ouvrir le tableau de progression'], 'hud.title': ['Practice progress', 'Progreso de práctica', 'Progression de la pratique'],
    'hud.next': ['{n} XP to level {l}', '{n} XP para el nivel {l}', '{n} XP pour le niveau {l}'], 'hud.streak': ['{n}-day streak', 'Racha de {n} días', 'Série de {n} jours'], 'hud.nostreak': ['No streak yet. Any documented activity starts one.', 'Aún sin racha. Cualquier actividad documentada la inicia.', 'Pas encore de série. Toute activité documentée en lance une.'],
    'hud.rest': ['One rest day per week is forgiven.', 'Se perdona un día de descanso por semana.', 'Un jour de repos par semaine est pardonné.'], 'hud.restBtn': ['Mark today as a rest day', 'Marcar hoy como día de descanso', 'Marquer aujourd’hui comme jour de repos'],
    'hud.quests': ['This week’s quests', 'Misiones de esta semana', 'Défis de la semaine'], 'hud.badges': ['Badges', 'Insignias', 'Badges'], 'hud.locked': ['Locked', 'Bloqueada', 'Verrouillé'], 'hud.none': ['No badges earned yet', 'Aún sin insignias', 'Aucun badge pour l’instant'],
    'hud.about': ['What is recorded: counts and timestamps of your activities, stored only in this browser. No leaderboards, no sharing, no notifications. Badges recognise documented practice, never real-world impact.', 'Qué se registra: recuentos y marcas de tiempo de sus actividades, solo en este navegador. Sin clasificaciones, sin compartir, sin notificaciones. Las insignias reconocen práctica documentada, nunca impacto real.', 'Ce qui est enregistré : décomptes et horodatages de vos activités, uniquement dans ce navigateur. Pas de classement, de partage ni de notification. Les badges reconnaissent la pratique documentée, jamais l’impact réel.'],
    'hud.reset': ['Reset HUD data', 'Restablecer datos del panel', 'Réinitialiser les données du tableau'], 'hud.reset.confirm': ['Erase XP bonus, streak, quests and badges history? Your projects and records are not touched.', '¿Borrar bonus de XP, racha, misiones e historial de insignias? Sus proyectos y registros no se tocan.', 'Effacer bonus XP, série, défis et historique des badges ? Vos projets et enregistrements ne sont pas touchés.'],
    'hud.questDone': ['Quest complete: {q}', 'Misión cumplida: {q}', 'Défi accompli : {q}'], 'hud.badgeNew': ['New badge: {b}', 'Nueva insignia: {b}', 'Nouveau badge : {b}'], 'hud.today': ['Today: {n} activities', 'Hoy: {n} actividades', 'Aujourd’hui : {n} activités'],
    'q.null': ['Record a null result or a correction', 'Registre un resultado nulo o una corrección', 'Consignez un résultat nul ou une correction'], 'q.inversion': ['Run an Anti-Inversion check', 'Haga una comprobación anti-inversión', 'Faites un contrôle anti-inversion'], 'q.evidence': ['Add an evidence note with its limits', 'Añada una nota de evidencia con sus límites', 'Ajoutez une note de preuve avec ses limites'],
    'q.observe': ['Log a measurement or observation', 'Registre una medición u observación', 'Enregistrez une mesure ou une observation'], 'q.map': ['Map who is affected (stakeholders)', 'Mapee a quién afecta (partes interesadas)', 'Cartographiez les personnes concernées'], 'q.compare': ['Compare options in a decision matrix', 'Compare opciones en una matriz de decisión', 'Comparez des options dans une matrice de décision'],
    'q.range': ['Save a Monte Carlo range', 'Guarde un rango Monte Carlo', 'Enregistrez une plage Monte Carlo'], 'q.ledger': ['Add a ledger entry or correction', 'Añada una entrada o corrección al registro', 'Ajoutez une entrée ou une correction au registre'], 'q.backup': ['Back up your workspace', 'Haga una copia de su espacio', 'Sauvegardez votre espace'],
    'q.reflect': ['Write a passport reflection', 'Escriba una reflexión en el pasaporte', 'Rédigez une réflexion dans le passeport'], 'q.pilot': ['Design a pilot with a sample size', 'Diseñe un piloto con tamaño de muestra', 'Concevez un pilote avec taille d’échantillon'], 'q.brief': ['Draft a one-page brief', 'Redacte un resumen de una página', 'Rédigez une note d’une page'], 'q.risk': ['Add a risk with an early-warning sign', 'Añada un riesgo con una señal de alerta', 'Ajoutez un risque avec un signal d’alerte'],
    'b-pilot': ['Pilot initiated', 'Piloto iniciado', 'Pilote lancé'], 'b-observe': ['Observation logged', 'Observación registrada', 'Observation consignée'], 'b-evidence': ['Evidence noted', 'Evidencia anotada', 'Preuve notée'], 'b-three': ['Three projects', 'Tres proyectos', 'Trois projets'], 'b-ten': ['Ten documented tasks', 'Diez tareas documentadas', 'Dix tâches documentées'],
    'b-cartographer': ['Cartographer', 'Cartógrafo', 'Cartographe'], 'b-guardian': ['Guardian', 'Guardián', 'Gardien'], 'b-skeptic': ['Skeptic', 'Escéptico', 'Sceptique'], 'b-explainer': ['Explainer', 'Divulgador', 'Vulgarisateur'], 'b-reflector': ['Reflector', 'Reflexivo', 'Réflexif'], 'b-steward': ['Steward', 'Custodio', 'Gardien des données'], 'b-balancer': ['Balancer', 'Equilibrador', 'Équilibriste'], 'b-replicator': ['Replicator', 'Replicador', 'Réplicateur'],
    'bc-pilot': ['Create a project', 'Cree un proyecto', 'Créer un projet'], 'bc-observe': ['Log one observation', 'Registre una observación', 'Consigner une observation'], 'bc-evidence': ['Add an evidence note', 'Añada una nota de evidencia', 'Ajouter une note de preuve'], 'bc-three': ['Have three projects', 'Tenga tres proyectos', 'Avoir trois projets'], 'bc-ten': ['Complete ten checklist tasks', 'Complete diez tareas', 'Terminer dix tâches'],
    'bc-cartographer': ['Map three stakeholders', 'Mapee tres partes interesadas', 'Cartographier trois parties prenantes'], 'bc-guardian': ['Complete an Anti-Inversion check', 'Complete una comprobación anti-inversión', 'Terminer un contrôle anti-inversion'], 'bc-skeptic': ['Record a null result or correction', 'Registre un resultado nulo o corrección', 'Consigner un résultat nul ou une correction'],
    'bc-explainer': ['Print or download a brief', 'Imprima o descargue un resumen', 'Imprimer ou télécharger une note'], 'bc-reflector': ['Write three passport reflections', 'Escriba tres reflexiones', 'Rédiger trois réflexions'], 'bc-steward': ['Make an encrypted backup', 'Haga una copia cifrada', 'Faire une sauvegarde chiffrée'], 'bc-balancer': ['Compare options with a safeguard (veto) criterion', 'Compare opciones con un criterio de salvaguarda (veto)', 'Comparer des options avec un critère de sauvegarde (veto)'], 'bc-replicator': ['Import or accept shared work', 'Importe o acepte trabajo compartido', 'Importer ou accepter un travail partagé']
  });

  /* STATE ------------------------------------------------------------------------------------------ */
  let hud = null, open = false, saveT = null;
  const fresh = () => ({ v: 1, bonus: 0, base: null, events: [], days: {}, badges: {}, quests: {}, rest: {}, best: 0 });
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => EP.store.put('meta', hud, 'hud').catch(() => {}), 400); };
  const weekKey = (d = new Date()) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return x.getUTCFullYear() + '-W' + String(Math.ceil(((x - y0) / 864e5 + 1) / 7)).padStart(2, '0'); };
  const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return U.localDay(x); };
  function questsFor(wk) {
    const rnd = U.seeded(U.hash32(wk)); const pool = QUESTS.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.slice(0, 3);
  }
  const counts = () => {
    const s = EP.core.state, ext = {}; for (const n of EP.ext.names()) ext[n] = (s.ext && s.ext[n] || []).length;
    const typeSet = new Set(hud.events.map(e => e.type));
    return { projects: s.projects.length, evidence: s.evidence.length, obs: s.projects.reduce((n, p) => n + p.observations.length, 0), tasks: s.projects.reduce((n, p) => n + p.tasks.filter(x => x.done).length, 0), ext, has: x => typeSet.has(x), vetoDecision: (s.ext?.decisions || []).some(d => (d.criteria || []).some(c => c.veto)) };
  };
  const baseXp = () => { const c = counts(); return c.projects * 10 + c.tasks * 3 + c.obs * 5 + c.evidence * 4; };
  const totalXp = () => baseXp() + (hud ? hud.bonus : 0);
  const levelOf = xp => 1 + Math.floor(Math.sqrt(xp / 50));
  const xpFor = lvl => 50 * (lvl - 1) * (lvl - 1);

  function streakInfo() {
    const active = new Set(hud.events.map(e => e.day)); const rest = new Set(Object.keys(hud.rest)); let s = 0, grace = true, since = 99; const cur = new Date(); const today = U.localDay(cur);
    if (!active.has(today)) cur.setDate(cur.getDate() - 1);
    for (let i = 0; i < 400; i++) {
      const k = U.localDay(cur);
      if (active.has(k)) { s++; since++; if (since >= 7) grace = true; }
      else if (rest.has(k)) { /* declared rest day: neither counts nor breaks */ }
      else if (grace) { grace = false; since = 0; }
      else break;
      cur.setDate(cur.getDate() - 1);
    }
    return s;
  }

  function record(type, meta) {
    if (!hud) return; const day = U.localDay(); const d = hud.days[day] || (hud.days[day] = { bonus: 0, types: {} });
    const n = (d.types[type] = (d.types[type] || 0) + 1); let w = XP_BONUS[type] || 0; if (n > 5) w = 0; else if (n > 2) w = Math.round(w / 2);
    w = Math.max(0, Math.min(w, DAILY_CAP - d.bonus)); d.bonus += w; hud.bonus += w;
    hud.events.push({ at: U.now(), day, type: String(type).slice(0, 30) }); if (hud.events.length > 400) hud.events.splice(0, hud.events.length - 400);
    for (const k of Object.keys(hud.days).sort().slice(0, Math.max(0, Object.keys(hud.days).length - 45))) delete hud.days[k];
    hud.best = Math.max(hud.best || 0, streakInfo()); evaluate(); save(); EP.emit('hud:update');
  }
  function evaluate() {
    const c = counts(), wk = weekKey(), ws = weekStart(); let toasted = false;
    for (const [id, icon, test] of BADGES) { if (!hud.badges[id]) { let ok = false; try { ok = !!test(c); } catch {} if (ok) { hud.badges[id] = U.now(); if (!hud.base) continue; EP.ui.toast(t('hud.badgeNew', { b: icon + ' ' + t(id) })); toasted = true; } } }
    const q = hud.quests[wk] || (hud.quests[wk] = { ids: questsFor(wk).map(x => x[0]), done: {} });
    for (const [id, types] of questsFor(wk).map(x => [x[0], x[1]])) {
      if (q.done[id]) continue; if (hud.events.some(e => e.day >= ws && types.includes(e.type))) { q.done[id] = U.now(); hud.bonus += 15; if (!toasted) EP.ui.toast(t('hud.questDone', { q: t(QUESTS.find(z => z[0] === id)[2]) })); }
    }
    for (const k of Object.keys(hud.quests).sort().slice(0, Math.max(0, Object.keys(hud.quests).length - 8))) delete hud.quests[k];
  }
  function diffState(silent) {
    const c = counts(); const cur = { p: c.projects, e: c.evidence, o: c.obs, t: c.tasks };
    if (!hud.base || silent) { hud.base = cur; return; }
    const b = hud.base; hud.base = cur; const evs = [];
    if (cur.p > b.p) evs.push('project'); if (cur.e > b.e) evs.push('evidence'); if (cur.o > b.o) evs.push('observation'); if (cur.t > b.t) evs.push('taskDone');
    for (const e of evs) record(e);
  }

  /* HUD UI --------------------------------------------------------------------------------------------- */
  let pill, panel, root;
  function renderPill() {
    if (!pill) return; const xp = totalXp(), lvl = levelOf(xp), lo = xpFor(lvl), hi = xpFor(lvl + 1), s = streakInfo();
    pill.replaceChildren(...U.nn(U.el('span', { text: t('hud.pill', { l: lvl, x: EP.fmt.number(xp) }) }), U.el('progress', { max: hi - lo, value: Math.min(hi - lo, xp - lo), 'aria-hidden': 'true' }), s > 0 ? U.el('span', { text: '🔥' + s, 'aria-label': t('hud.streak', { n: s }) }) : null));
    pill.setAttribute('aria-label', t('hud.open'));
  }
  function renderPanel() {
    if (!panel || panel.hidden) return; const xp = totalXp(), lvl = levelOf(xp), lo = xpFor(lvl), hi = xpFor(lvl + 1), s = streakInfo(), wk = weekKey(), c = counts(), day = U.localDay();
    const q = hud.quests[wk] || { ids: questsFor(wk).map(x => x[0]), done: {} };
    panel.replaceChildren(
      U.el('h3', { text: t('hud.title') }),
      U.el('p', {}, U.el('strong', { text: t('hud.pill', { l: lvl, x: EP.fmt.number(xp) }) }), U.el('br'), U.el('small', { class: 'small', text: t('hud.next', { n: hi - xp, l: lvl + 1 }) })),
      U.el('progress', { max: hi - lo, value: xp - lo, style: 'width:100%;accent-color:var(--accent)' }),
      U.el('p', { class: 'small', text: s ? t('hud.streak', { n: s }) + ' · ' + t('hud.rest') : t('hud.nostreak') }),
      U.el('p', { class: 'small', text: t('hud.today', { n: hud.events.filter(e => e.day === day).length }) }),
      U.el('button', { type: 'button', text: t('hud.restBtn'), onclick: () => { hud.rest[U.localDay()] = true; save(); EP.emit('hud:update'); } }),
      U.el('h3', { text: t('hud.quests') }),
      ...q.ids.map(id => { const def = QUESTS.find(z => z[0] === id); const done = !!q.done[id]; return U.el('div', { class: 'hud-quest' + (done ? ' done' : '') }, U.el('span', { 'aria-hidden': 'true', text: done ? '✅' : '◻️' }), U.el('span', { text: t(def[2]) }), U.el('span', { class: 'pill ' + (done ? 'good' : ''), text: done ? '+15' : '15' })); }),
      U.el('h3', { text: t('hud.badges') }),
      U.el('ul', { style: 'list-style:none;padding:0' }, ...BADGES.map(([id, icon]) => { const got = hud.badges[id]; return U.el('li', { style: 'margin:.25rem 0;' + (got ? '' : 'opacity:.6') }, U.el('span', { 'aria-hidden': 'true', text: (got ? icon : '🔒') + ' ' }), U.el('strong', { text: t(id) }), ' ', U.el('small', { class: 'small', text: got ? '' : '· ' + t('bc-' + id.slice(2)) })); })),
      U.el('p', { class: 'small', text: t('hud.about') }),
      U.el('button', { type: 'button', class: 'danger', text: t('hud.reset'), onclick: async () => { if (!(await EP.ui.confirm(t('hud.reset.confirm'), { danger: true, ok: t('hud.reset') }))) return; const base = hud.base; hud = fresh(); hud.base = base; evaluate(); save(); EP.emit('hud:update'); } }));
  }
  function renderHero() {
    const xp = totalXp(); const xe = $('xp'), le = $('level'); if (xe) xe.textContent = EP.fmt.number(xp); if (le) le.textContent = String(levelOf(xp));
    const bl = $('badgeList'); if (bl) { const got = BADGES.filter(b => hud.badges[b[0]]); bl.replaceChildren(...(got.length ? got.map(b => U.el('span', { class: 'chip', title: t('bc-' + b[0].slice(2)), text: b[1] + ' ' + t(b[0]) })) : [U.el('span', { class: 'chip', text: t('hud.none') })])); }
  }
  function renderAll() { renderPill(); renderPanel(); renderHero(); }
  function build() {
    root = U.el('div', { class: 'hud no-print', id: 'hud' });
    pill = U.el('button', { type: 'button', class: 'hud-pill', 'aria-expanded': 'false', 'aria-controls': 'hudPanel' });
    panel = U.el('div', { class: 'hud-panel', id: 'hudPanel', role: 'region', 'aria-label': t('hud.title'), hidden: '' });
    pill.addEventListener('click', () => { open = !open; panel.hidden = !open; pill.setAttribute('aria-expanded', String(open)); renderPanel(); if (open) EP.analytics.record('hud'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { open = false; panel.hidden = true; pill.setAttribute('aria-expanded', 'false'); pill.focus(); } });
    root.append(panel, pill); document.body.append(root);
  }

  EP.hud = { record, totalXp, levelOf, streak: () => hud ? streakInfo() : 0, get data() { return hud; }, weekKey, questsFor, QUESTS, BADGES, XP_BONUS };

  EP.module('hud', async () => {
    try { hud = (await EP.store.get('meta', 'hud')) || fresh(); } catch { hud = fresh(); } if (!hud.v) hud = fresh();
    build(); diffState(true); evaluate(); renderAll();
    EP.on('activity', e => record(e.type, e));
    EP.on('state:render', () => { diffState(false); evaluate(); renderAll(); });
    for (const ev of ['state:loaded', 'state:reloaded', 'state:migrated']) EP.on(ev, () => { diffState(true); evaluate(); renderAll(); });
    EP.on('hud:update', renderAll); EP.on('lang', renderAll); EP.on('data:wiped', () => { hud = fresh(); diffState(true); renderAll(); });
  }, { order: 60 });

  /* ================================ CONSTELLATION ================================================== */
  EP.i18n.register({
    'cst.label': ['Constellation of your workspace: {a} of {n} engines and {m} of {k} tools have activity.', 'Constelación de su espacio: {a} de {n} motores y {m} de {k} herramientas tienen actividad.', 'Constellation de votre espace : {a} moteurs sur {n} et {m} outils sur {k} ont de l’activité.'],
    'cst.text': ['Text view of the constellation', 'Vista de texto de la constelación', 'Vue textuelle de la constellation'], 'cst.items': ['{n} items', '{n} elementos', '{n} éléments'], 'cst.core': ['Protocol core', 'Núcleo del protocolo', 'Cœur du protocole'], 'cst.tool': ['tool', 'herramienta', 'outil']
  });
  const TOOL_STARS = [['briefs', 'tool.brief'], ['decisions', 'tool.decision'], ['pilots', 'tool.pilot'], ['stakeholders', 'tool.stakeholders'], ['risks', 'tool.risk'], ['logic', 'tool.logic'], ['kits', 'tool.kits'], ['passport', 'tool.passport']];
  function model() {
    const core = EP.core, s = core.state, nodes = [], edges = [], nowMs = Date.now(), recent = ms => ms && nowMs - ms < 30 * 864e5;
    const engs = core.ENGINES; const rx = 0.37, ry = 0.36;
    engs.forEach((e, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / engs.length; const own = { p: s.projects.filter(p => p.engine === e.id), ev: s.evidence.filter(x => x.domain === e.id), g: s.genomes.filter(x => x.engine === e.id) };
      const count = own.p.length + own.ev.length + own.g.length; let last = 0; for (const p of own.p) { last = Math.max(last, Date.parse(p.created) || 0); for (const o of p.observations) last = Math.max(last, Date.parse(o.date) || 0); } for (const x of own.ev) last = Math.max(last, Date.parse(x.date) || 0); for (const g of own.g) last = Math.max(last, Date.parse(g.updated) || 0);
      nodes.push({ id: 'e:' + e.id, label: e.icon + ' ' + e.name, x: 0.5 + rx * Math.cos(a), y: 0.5 + ry * Math.sin(a), r: 3 + Math.min(7, Math.sqrt(count) * 2.2), glow: count ? (recent(last) ? 1 : 0.55) : 0.16, count, kind: 'engine', phase: i * 1.7, sel: '#engine-' + e.id });
    });
    const tools = TOOL_STARS.filter(([n]) => EP.ext.names().includes(n)); const tr = 0.17;
    tools.forEach(([name, key], i) => { const a = Math.PI / 2 + i * 2 * Math.PI / tools.length + 0.4; const cnt = (s.ext && s.ext[name] || []).length; nodes.push({ id: 't:' + name, label: t(key), x: 0.5 + tr * 1.35 * Math.cos(a), y: 0.5 + tr * Math.sin(a), r: 2.4 + Math.min(4, Math.sqrt(cnt) * 1.6), glow: cnt ? 1 : 0.14, count: cnt, kind: 'tool', phase: i * 2.3, sel: '#toolkit', tool: name }); });
    nodes.push({ id: 'core', label: t('cst.core'), x: 0.5, y: 0.5, r: 5.5, glow: 1, count: 0, kind: 'core', phase: 0, sel: '#protocol' });
    const by = Object.fromEntries(nodes.map(n => [n.id, n]));
    for (const e of engs) for (const l of e.links) if (e.id < l) edges.push([by['e:' + e.id], by['e:' + l], 0.16]);
    for (const n of nodes) if (n.kind === 'engine' && n.count) edges.push([by.core, n, 0.28]); for (const n of nodes) if (n.kind === 'tool' && n.count) edges.push([by.core, n, 0.28]);
    const a = nodes.filter(n => n.kind === 'engine' && n.count).length, m = nodes.filter(n => n.kind === 'tool' && n.count).length;
    return { nodes, edges, summary: t('cst.label', { a, n: engs.length, m, k: tools.length }) };
  }
  const instances = new Set();
  class EPConstellation extends HTMLElement {
    connectedCallback() {
      if (this._init) { instances.add(this); this.refresh(); return; } this._init = true; instances.add(this);
      this.canvas = U.el('canvas', { role: 'img' }); this.tip = U.el('div', { class: 'c-tip', hidden: '' }); this.det = U.el('details', {}, U.el('summary', { text: t('cst.text') }), this.list = U.el('ul', { class: 'mini-list' }));
      this.append(this.canvas, this.tip, this.det); this.hover = null; this.raf = 0; this.visible = true; this.t0 = performance.now();
      this.canvas.addEventListener('pointermove', e => this.onMove(e)); this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.tip.hidden = true; this.draw(); }); this.canvas.addEventListener('click', e => { const n = this.hit(e); if (n) this.go(n); });
      if ('ResizeObserver' in window) { this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(this.canvas); }
      if ('IntersectionObserver' in window) { this.io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; this.loop(); }, { threshold: 0.05 }); this.io.observe(this); }
      this._vis = () => this.loop(); document.addEventListener('visibilitychange', this._vis);
      this.refresh();
    }
    disconnectedCallback() { instances.delete(this); cancelAnimationFrame(this.raf); this.raf = 0; this.ro?.disconnect(); this.io?.disconnect(); document.removeEventListener('visibilitychange', this._vis); this._init = false; }
    motion() { return !(matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-motion') === 'reduce') && document.visibilityState === 'visible' && this.visible; }
    refresh() {
      if (!EP.core) return; this.m = model(); this.canvas.setAttribute('aria-label', this.m.summary);
      this.list.replaceChildren(...this.m.nodes.map(n => U.el('li', {}, U.el('a', { href: n.sel, text: n.label, onclick: ev => { ev.preventDefault(); this.go(n); } }), ' · ' + t('cst.items', { n: n.count }))));
      this.draw(); this.loop();
    }
    loop() { cancelAnimationFrame(this.raf); this.raf = 0; if (!this.motion()) return; const step = ts => { this.draw(ts); this.raf = this.motion() ? requestAnimationFrame(step) : 0; }; this.raf = requestAnimationFrame(step); }
    go(n) { if (n.kind === 'tool' && EP.tools) EP.tools.open(n.tool); else EP.nav.reveal(n.sel); }
    pos(n, w, h) { return [n.x * w, n.y * h]; }
    hit(e) { if (!this.m) return null; const r = this.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 18; for (const n of this.m.nodes) { const [px, py] = this.pos(n, r.width, r.height); const d = Math.hypot(px - x, py - y) - n.r; if (d < bd) { bd = d; best = n; } } return best; }
    onMove(e) { const n = this.hit(e); if (n !== this.hover) { this.hover = n; this.draw(); } if (n) { const r = this.canvas.getBoundingClientRect(); const [px, py] = this.pos(n, r.width, r.height); this.tip.textContent = n.label + (n.count ? ' · ' + t('cst.items', { n: n.count }) : ''); this.tip.style.left = px + 'px'; this.tip.style.top = py + 'px'; this.tip.hidden = false; this.canvas.style.cursor = 'pointer'; } else { this.tip.hidden = true; this.canvas.style.cursor = ''; } }
    draw(ts) {
      if (!this.m || !this.canvas.isConnected) return; const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim() || '#9be8b2', ink = col('--ink'), accent = col('--accent'), accent2 = col('--accent2'), line = col('--line'), warn = col('--warning');
      const tt = ts ? (ts - this.t0) / 1000 : 0, lg = this.dataset.size === 'lg';
      g.lineWidth = 1; for (const [a, b, al] of this.m.edges) { const [x1, y1] = this.pos(a, w, h), [x2, y2] = this.pos(b, w, h); g.globalAlpha = al + (this.hover && (this.hover === a || this.hover === b) ? .35 : 0); g.strokeStyle = line; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
      for (const n of this.m.nodes) {
        const [x, y] = this.pos(n, w, h); const tw = ts ? 0.8 + 0.2 * Math.sin(tt * 1.6 + n.phase) : 0.9; const a = Math.min(1, n.glow * tw); const color = n.kind === 'engine' ? accent : n.kind === 'tool' ? accent2 : warn;
        g.globalAlpha = a * 0.35; const rad = n.r * (this.hover === n ? 4.2 : 3.2); const grad = g.createRadialGradient(x, y, 0, x, y, rad); grad.addColorStop(0, color); grad.addColorStop(1, 'transparent'); g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fill();
        g.globalAlpha = Math.max(0.35, a); g.fillStyle = color; g.beginPath();
        if (n.kind === 'tool') { g.moveTo(x, y - n.r); g.lineTo(x + n.r, y); g.lineTo(x, y + n.r); g.lineTo(x - n.r, y); g.closePath(); } else g.arc(x, y, n.r, 0, 6.2832); g.fill();
        if (n.glow < 0.2) { g.globalAlpha = .6; g.strokeStyle = color; g.lineWidth = 1; g.stroke(); }
        if ((lg || this.hover === n) && n.kind !== 'core') { g.globalAlpha = this.hover === n || n.glow > .5 ? 1 : .6; g.fillStyle = ink; g.font = (lg ? 11 : 10) + 'px system-ui,sans-serif'; g.textAlign = x > w / 2 ? 'left' : 'right'; g.fillText(n.label.replace(/^\S+\s/, ''), x + (x > w / 2 ? 1 : -1) * (n.r + 5), y + 3); }
      }
      g.globalAlpha = 1;
    }
  }
  if (!customElements.get('ep-constellation')) customElements.define('ep-constellation', EPConstellation);
  EP.constellation = { model, refreshAll: () => instances.forEach(i => i.refresh()) };
  EP.module('constellation', () => {
    const lg = $('constellationLarge'); if (lg) lg.dataset.size = 'lg';
    for (const ev of ['state:render', 'state:loaded', 'state:reloaded', 'hud:update', 'ext:change', 'lang', 'settings:theme', 'settings:motion', 'settings:reset']) EP.on(ev, U.debounce(() => EP.constellation.refreshAll(), 80));
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => EP.constellation.refreshAll());
    EP.constellation.refreshAll();
  }, { order: 61 });
})();
