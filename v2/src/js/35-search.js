/* SECTION 6 · CLIENT-SIDE SEARCH & COMMAND PALETTE
   Purpose : find anything (sections, chapters, engines, sources, glossary terms, methods, your own
             projects/evidence/tool records) and run commands, entirely in the browser.
   How     : documents are tokenised (accent-folded, Intl.Segmenter when available), weighted by field
             (title > kind > text), matched by exact / prefix / one-typo rules, AND-combined, and ranked
             with an IDF-style score. Index builds lazily when idle and rebuilds when content changes.
   Extend  : EP.search.register('name', () => [{id, kind, title, text, go:{sel|run}}]) from any module;
             add a command to commands() below. Prefix a query with ">" to search commands only.
   Outcome : keyboard-first navigation (Ctrl/Cmd+K or "/"), screen-reader friendly combobox/listbox,
             nothing indexed ever leaves the page. */
(function () {
  'use strict';
  const U = EP.util, t = (k, v) => EP.t(k, v);

  EP.i18n.register({
    'srch.title': ['Search and commands', 'Búsqueda y comandos', 'Recherche et commandes'], 'srch.ph': ['Search sections, sources, terms, your records… (type > for commands)', 'Buscar secciones, fuentes, términos, sus registros… (escriba > para comandos)', 'Rechercher sections, sources, termes, vos enregistrements… (tapez > pour les commandes)'],
    'srch.none': ['No matches. Try fewer or simpler words.', 'Sin resultados. Pruebe con menos palabras o más simples.', 'Aucun résultat. Essayez moins de mots, plus simples.'], 'srch.recent': ['Recent', 'Recientes', 'Récents'], 'srch.hint': ['↑↓ move · Enter open · Esc close · > commands', '↑↓ mover · Enter abrir · Esc cerrar · > comandos', '↑↓ naviguer · Entrée ouvrir · Échap fermer · > commandes'],
    'srch.results': ['{n} results', '{n} resultados', '{n} résultats'], 'srch.building': ['Indexing…', 'Indexando…', 'Indexation…'],
    'k.section': ['Section', 'Sección', 'Section'], 'k.chapter': ['Chapter', 'Capítulo', 'Chapitre'], 'k.engine': ['Engine', 'Motor', 'Moteur'], 'k.source': ['Source', 'Fuente', 'Source'], 'k.term': ['Term', 'Término', 'Terme'], 'k.method': ['Method', 'Método', 'Méthode'],
    'k.project': ['Project', 'Proyecto', 'Projet'], 'k.evidence': ['Evidence', 'Evidencia', 'Preuve'], 'k.genome': ['Genome', 'Genoma', 'Génome'], 'k.command': ['Command', 'Comando', 'Commande'], 'k.record': ['Record', 'Registro', 'Enregistrement'],
    'cmd.settings': ['Open settings', 'Abrir ajustes', 'Ouvrir les réglages'], 'cmd.theme': ['Toggle dark / light theme', 'Cambiar tema oscuro / claro', 'Basculer thème sombre / clair'], 'cmd.print': ['Print this page', 'Imprimir esta página', 'Imprimer cette page'],
    'cmd.export': ['Download a backup (JSON)', 'Descargar una copia (JSON)', 'Télécharger une sauvegarde (JSON)'], 'cmd.restore': ['Create a restore point', 'Crear un punto de restauración', 'Créer un point de restauration'], 'cmd.demo': ['Load example data', 'Cargar datos de ejemplo', 'Charger des données d’exemple'],
    'cmd.lens': ['Choose my lens', 'Elegir mi perspectiva', 'Choisir ma perspective'], 'cmd.hud': ['Show / hide progress HUD', 'Mostrar / ocultar panel de progreso', 'Afficher / masquer le tableau de progression'], 'cmd.motion': ['Reduce motion', 'Reducir movimiento', 'Réduire les animations'],
    'cmd.lang': ['Switch language to {l}', 'Cambiar idioma a {l}', 'Passer la langue en {l}'], 'cmd.tests': ['Run system self-tests', 'Ejecutar autopruebas del sistema', 'Lancer les autotests du système'], 'cmd.tool': ['Open tool: {n}', 'Abrir herramienta: {n}', 'Ouvrir l’outil : {n}'],
    'cmd.top': ['Go to top', 'Ir arriba', 'Aller en haut']
  });

  /* TOKENISATION --------------------------------------------------------------------------------- */
  const fold = s => Array.from(String(s ?? '')).map(c => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()).join('');
  let seg = null; try { if (Intl.Segmenter) seg = new Intl.Segmenter(undefined, { granularity: 'word' }); } catch {}
  const tokens = s => {
    const f = fold(s);
    if (seg) { const out = []; for (const x of seg.segment(f)) if (x.isWordLike) out.push(x.segment); return out; }
    return f.match(/[\p{L}\p{N}]+/gu) || [];
  };
  const lev1 = (a, b) => { /* true when edit distance ≤ 1 (insert, delete, substitute, or adjacent swap) */
    if (a === b) return true; const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) { if (a.slice(i + 1) === b.slice(i + 1)) return true; return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); }
    return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  };

  /* INDEX ---------------------------------------------------------------------------------------- */
  const providers = new Map(); let docs = [], df = new Map(), termList = [], dirty = true, building = null;
  const trim = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  function coreDocs() {
    const out = [], core = EP.core; if (!core) return out;
    for (const s of U.qsa('main > section[id]')) {
      const clone = s.cloneNode(true); clone.querySelectorAll('script,style,button,select,input,textarea,.callout[id^="bn-"],ep-constellation').forEach(n => n.remove());
      out.push({ id: 'sec:' + s.id, kind: 'k.section', title: EP.nav.title(s.id), text: trim(clone.textContent, 6000), go: { sel: '#' + s.id } });
    }
    for (const c of U.qsa('main details.chapter[id]')) out.push({ id: 'ch:' + c.id, kind: 'k.chapter', title: trim(c.querySelector('summary')?.textContent, 140), text: trim(c.textContent, 3000), go: { sel: '#' + c.id } });
    for (const e of core.ENGINES) out.push({ id: 'eng:' + e.id, kind: 'k.engine', title: e.name, text: trim([e.subtitle, e.problem, e.mechanism, e.research, e.science].join(' '), 1800), go: { sel: '#engine-' + e.id, run: () => { const m = U.$('atlasSearch'); if (m && m.value) { m.value = ''; m.dispatchEvent(new Event('input')); } } } });
    for (const s of core.SOURCES) out.push({ id: 'src:' + s.id, kind: 'k.source', title: s.title, text: trim([s.id, s.org, s.year, s.take, s.limit].join(' '), 900), go: { run: () => { const i = U.$('sourceSearch'); if (i) { i.value = s.id; i.dispatchEvent(new Event('input')); } EP.nav.reveal('#sourceList'); } } });
    for (const [term, def] of core.GLOSSARY) out.push({ id: 'gl:' + term, kind: 'k.term', title: term, text: def, go: { sel: '#glossary' } });
    for (const [name, def, ex] of core.METHOD_CARDS) out.push({ id: 'me:' + name, kind: 'k.method', title: name, text: trim(def + ' ' + ex, 700), go: { sel: '#methods' } });
    for (const p of core.state.projects) out.push({ id: 'pr:' + p.id, kind: 'k.project', title: p.title, text: trim(p.problem + ' ' + p.context, 900), go: { run: () => { core.openProject(p.id); EP.nav.reveal('#projectDetail'); } } });
    for (const n of core.state.evidence) out.push({ id: 'ev:' + n.id, kind: 'k.evidence', title: trim(n.claim, 110) || n.type, text: trim(n.claim + ' ' + n.limits, 900), go: { sel: '#evidenceNotes' } });
    for (const g of core.state.genomes) out.push({ id: 'ge:' + g.id, kind: 'k.genome', title: g.title, text: trim(g.problem + ' ' + (g.goal || ''), 900), go: { sel: '#innovation' } });
    return out;
  }
  function build() {
    const all = coreDocs();
    for (const [, fn] of providers) { try { for (const d of fn() || []) all.push({ ...d, kind: d.kind || 'k.record' }); } catch (e) { EP.log.warn('search provider', e); } }
    df = new Map(); const tl = new Set();
    docs = all.map(d => {
      const tf = new Map(); const add = (str, w) => { for (const tk of tokens(str)) { tf.set(tk, (tf.get(tk) || 0) + w); tl.add(tk); } };
      add(d.title, 6); add(t(d.kind), 1.5); add(d.text, 1);
      for (const k of tf.keys()) df.set(k, (df.get(k) || 0) + 1);
      return { ...d, tf, ftitle: fold(d.title) };
    });
    termList = [...tl].sort(); dirty = false;
  }
  function ensure() {
    if (!dirty && docs.length) return Promise.resolve();
    if (!building) building = new Promise(res => { const run = () => { try { build(); } catch (e) { EP.log.error('search build', e); } building = null; res(); }; (window.requestIdleCallback ? requestIdleCallback(run, { timeout: 800 }) : setTimeout(run, 0)); });
    return building;
  }
  const markDirty = U.debounce(() => { dirty = true; }, 200);

  function query(q, { limit = 40 } = {}) {
    const qt = tokens(q).slice(0, 8); if (!qt.length) return [];
    const N = docs.length || 1;
    const matchSets = qt.map(tok => {
      const m = new Map(); /* term → quality */
      for (const term of termList) {
        if (term === tok) m.set(term, 1); else if (tok.length >= 2 && term.startsWith(tok)) m.set(term, 0.7);
      }
      if (!m.size && tok.length >= 5) for (const term of termList) if (lev1(tok, term)) m.set(term, 0.45);
      return m;
    });
    const res = [];
    for (const d of docs) {
      let score = 0, ok = true;
      for (const m of matchSets) {
        let best = 0; for (const [term, q] of m) { const w = d.tf.get(term); if (w) best = Math.max(best, q * w * (1 + Math.log((N + 1) / ((df.get(term) || 1) + 0.5)))); }
        if (!best) { ok = false; break; } score += best;
      }
      if (!ok) continue;
      const fq = fold(q).trim(); if (fq && d.ftitle.includes(fq)) score *= 1.6; if (d.ftitle.startsWith(fq)) score *= 1.25;
      res.push({ d, score });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, limit).map(r => ({ ...r.d, score: r.score, qt }));
  }
  function snippet(d, qt) {
    const text = d.text || ''; if (!text) return [];
    const ft = fold(text); let at = -1; for (const tk of qt) { const i = ft.indexOf(tk); if (i >= 0 && (at < 0 || i < at)) at = i; }
    const start = Math.max(0, (at < 0 ? 0 : at) - 40), raw = text.slice(start, start + 150), fr = fold(raw), spans = [];
    for (const tk of qt) { let i = 0; while ((i = fr.indexOf(tk, i)) >= 0) { spans.push([i, i + tk.length]); i += tk.length; } }
    spans.sort((a, b) => a[0] - b[0]); const merged = []; for (const s of spans) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push([...s]); }
    const out = []; let pos = 0; if (start > 0) out.push('… ');
    for (const [a, b] of merged) { if (a > pos) out.push(raw.slice(pos, a)); out.push(U.el('mark', { text: raw.slice(a, b) })); pos = b; }
    out.push(raw.slice(pos)); if (start + 150 < text.length) out.push(' …'); return out;
  }

  /* COMMANDS ---------------------------------------------------------------------------------------- */
  function commands() {
    const cmd = (id, label, run) => ({ id: 'cmd:' + id, kind: 'k.command', title: label, text: '', ftitle: fold(label), tf: new Map(), go: { run } });
    const list = [
      cmd('settings', t('cmd.settings'), () => EP.settingsUI.open()), cmd('theme', t('cmd.theme'), () => EP.settings.set('theme', EP.settings.resolvedTheme() === 'dark' ? 'light' : 'dark')),
      cmd('print', t('cmd.print'), () => window.print()), cmd('export', t('cmd.export'), () => { U.$('fullExport').checked = true; U.$('exportBtn').click(); }),
      cmd('restore', t('cmd.restore'), () => U.$('restoreNow').click()), cmd('demo', t('cmd.demo'), () => EP.demo && EP.demo.load()), cmd('lens', t('cmd.lens'), () => EP.roles && EP.roles.choose()),
      cmd('hud', t('cmd.hud'), () => EP.settings.set('hud', !EP.settings.get('hud'))), cmd('motion', t('cmd.motion'), () => EP.settings.set('motion', 'reduce')), cmd('tests', t('cmd.tests'), () => { EP.nav.reveal('#system'); EP.system && EP.system.runAll(); }),
      cmd('top', t('cmd.top'), () => EP.nav.reveal('#home'))
    ];
    for (const l of EP.i18n.LANGS) list.push(cmd('lang-' + l, t('cmd.lang', { l: EP.i18n.NAMES[l] }), () => EP.i18n.set(l)));
    if (EP.tools) for (const tool of EP.tools.list()) list.push(cmd('tool-' + tool.id, t('cmd.tool', { n: tool.title() }), () => EP.tools.open(tool.id)));
    return list;
  }

  /* PALETTE UI --------------------------------------------------------------------------------------- */
  let dlg = null, input = null, listEl = null, foot = null, items = [], active = 0;
  async function recents() { try { return (await EP.store.get('meta', 'recentSearch')) || []; } catch { return []; } }
  async function pushRecent(q) { q = q.trim(); if (q.length < 2) return; try { const r = (await recents()).filter(x => x !== q); r.unshift(q); await EP.store.put('meta', r.slice(0, 6), 'recentSearch'); } catch {} }
  function go(d) {
    close();
    const g = d.go || {}; EP.analytics.record('search', { kind: d.kind });
    if (g.sel) EP.nav.reveal(g.sel);
    if (g.run) { try { g.run(); } catch (e) { EP.log.error('search action', e); } }
  }
  function renderItems(list, qt) {
    items = list; active = 0; listEl.replaceChildren();
    if (!list.length) { listEl.append(U.el('li', { role: 'presentation', style: 'cursor:default;display:block' }, U.el('span', { class: 'snip', text: t('srch.none') }))); return; }
    list.forEach((d, i) => {
      const li = U.el('li', { id: 'sr-' + i, role: 'option', 'aria-selected': String(i === 0) }, U.el('span', { class: 'kind', text: t(d.kind) }), U.el('span', {}, U.el('span', { class: 'title', text: d.title }), qt && d.text ? U.el('span', { class: 'snip' }, ...snippet(d, qt)) : null), U.el('span', { class: 'kind', text: '' }));
      li.addEventListener('click', () => { pushRecent(input.value); go(d); }); li.addEventListener('mousemove', () => setActive(i)); listEl.append(li);
    });
    input.setAttribute('aria-activedescendant', 'sr-0');
  }
  function setActive(i) {
    if (!items.length) return; active = (i + items.length) % items.length;
    U.qsa('li[role="option"]', listEl).forEach((li, k) => li.setAttribute('aria-selected', String(k === active)));
    const li = U.$('sr-' + active); if (li) { li.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', li.id); }
  }
  async function run() {
    const raw = input.value; const cmdOnly = raw.trim().startsWith('>'); const q = cmdOnly ? raw.trim().slice(1) : raw;
    if (!raw.trim()) {
      const r = await recents(); listEl.replaceChildren();
      const cmds = commands().slice(0, 8); items = cmds; active = 0;
      if (r.length) { listEl.append(U.el('li', { role: 'presentation', style: 'cursor:default;display:block' }, U.el('span', { class: 'kind', text: t('srch.recent') }), ...r.map(x => U.el('button', { type: 'button', style: 'margin:.15rem .3rem', text: x, onclick: () => { input.value = x; run(); input.focus(); } })))); }
      renderItems(cmds, null); foot.firstChild.textContent = t('srch.hint'); return;
    }
    let found;
    if (cmdOnly) { const fq = fold(q).trim(); found = commands().filter(c => !fq || c.ftitle.includes(fq)); renderItems(found, null); }
    else { await ensure(); found = query(q); renderItems(found, tokens(q)); }
    foot.firstChild.textContent = found.length ? t('srch.results', { n: found.length }) : t('srch.hint');
  }
  function ensureDialog() {
    if (dlg) return; if (typeof HTMLDialogElement !== 'function') return;
    input = U.el('input', { type: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'srList', 'aria-autocomplete': 'list', 'aria-label': t('srch.title'), placeholder: t('srch.ph'), autocomplete: 'off', spellcheck: 'false', maxlength: 120, enterkeyhint: 'go' });
    listEl = U.el('ul', { id: 'srList', role: 'listbox', 'aria-label': t('srch.title') });
    foot = U.el('div', { class: 'foot' }, U.el('span', { text: t('srch.hint') }), U.el('button', { type: 'button', text: t('ui.close'), onclick: () => close() }));
    dlg = U.el('dialog', { class: 'palette', 'aria-label': t('srch.title') }, input, listEl, foot); document.body.append(dlg);
    input.addEventListener('input', U.debounce(run, 90));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActive(0); } else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActive(items.length - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) { pushRecent(input.value); go(items[active]); } }
    });
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    dlg.addEventListener('close', () => { input.value = ''; });
  }
  function open() {
    if (typeof HTMLDialogElement !== 'function') { EP.nav.reveal('#sourceSearch'); return; }
    if (!EP.rate.allow('palette', { capacity: 8, perSec: 4 }, true)) return;
    ensureDialog(); if (!dlg.open) dlg.showModal(); input.placeholder = t('srch.ph'); input.value = ''; run(); input.focus(); ensure();
  }
  function close() { if (dlg && dlg.open) dlg.close(); }

  EP.search = { register(name, fn) { providers.set(name, fn); dirty = true; }, open, close, query, ensure, markDirty, tokens, fold, lev1, get size() { return docs.length; } };

  EP.module('search', () => {
    document.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName) || ''; const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(); }
    });
    EP.on('state:render', markDirty); EP.on('lang', () => { dirty = true; if (dlg) { dlg.remove(); dlg = null; } }); EP.on('ext:change', markDirty);
    setTimeout(ensure, 1500);
  }, { order: 40 });
})();
