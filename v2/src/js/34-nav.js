/* SECTION 4 · NAVIGATION, CONTENTS RAIL, PROGRESS, PARALLAX & BUILDER NOTES
   Purpose : (1) header group links + sticky, collapsible table of contents with scroll-spy,
             (2) reading-progress bar (CSS scroll-driven animation where supported, JS otherwise),
             (3) parallax bands that respect reduced-motion and the user's setting,
             (4) ⓘ "Builder notes" on every section: purpose · how to extend · expected outcome,
             (5) wiring for header controls (theme, language, lens, settings, print, search).
   Extend  : add a section to GROUPS and give it an id + data-toc-group; add its notes with
             EP.notes.set(id, {purpose, extend, outcome}); add a toc.<id> string.
   Outcome : any section is two keystrokes away, the reader always knows where they are, and the
             page never scrolls sideways or traps keyboard focus. */
(function () {
  'use strict';
  const U = EP.util, $ = U.$;

  const GROUPS = [
    { id: 'start', key: 'grp.start', sections: ['home', 'guide', 'principles'] },
    { id: 'understand', key: 'grp.understand', sections: ['engines', 'evidence', 'field-intelligence', 'advanced-guides', 'institution-matrix', 'advanced-sources-section'] },
    { id: 'build', key: 'grp.build', sections: ['builder', 'workspace', 'innovation', 'toolkit', 'simulator', 'research'] },
    { id: 'learn', key: 'grp.learn', sections: ['classroom'] },
    { id: 'collab', key: 'grp.collab', sections: ['collaboration', 'local-ai'] },
    { id: 'trust', key: 'grp.trust', sections: ['protocol', 'integrity', 'data', 'system', 'attributions'] }
  ];

  /* BUILDER NOTES: short, developer-facing explanations shown from the ⓘ button on each section. */
  const notes = {};
  EP.notes = { set: (id, n) => { notes[id] = n; }, get: id => notes[id] };
  const N = (id, purpose, extend, outcome) => EP.notes.set(id, { purpose, extend, outcome });
  N('home', 'First impression, workspace dashboard, lens chooser and next-best actions.', 'Add a stat tile in home.html and update it from renderHUD or a state:render listener.', 'A newcomer knows what this is, what stays private, and what to do in the next five minutes.');
  N('guide', 'Long-form field guide: the recursive innovation cycle, decision hygiene, evidence, Zero-Harm and Anti-Inversion.', 'Add a <details class="chapter"> inside #guide; keep claims sourced or clearly labelled as practice guidance.', 'Policy, school and community readers share one vocabulary before they use the tools.');
  N('principles', 'The v3 principles that every engine inherits.', 'Edit the cards in principles.html; keep each principle testable.', 'Consistent, inspectable ground rules.');
  N('engines', 'Atlas of the ten empowerment engines with search and filters.', 'Add an engine object to ENGINES in the core script and a source entry in SOURCES.', 'People find the engine that matches a real need and see its limits.');
  N('evidence', 'Local evidence log with limits and a contradiction record.', 'Evidence notes live in state.evidence; add fields in hydrateEvidence() and renderEvidence().', 'Claims are tied to sources and stated limitations.');
  N('builder', 'Turns a need into a field-ready project with consent, baseline, tasks and stop rules.', 'Add a template in buildProject(); keep a null option and a stop rule in every template.', 'A reviewable project plan rather than an enthusiasm.');
  N('workspace', 'Projects, checklists and measured outcomes stored locally.', 'Add observation fields in renderProjectDetail().', 'A documented record of what actually happened.');
  N('innovation', 'Recursive Innovation Foundry: genomes, method candidates, human review, packets.', 'Add a method family to MORPH or ACTION_STAGES; packets are validated by safeGenome().', 'Ideas become reviewable, forkable, auditable records.');
  N('toolkit', 'Decision toolkit: brief studio, decision matrix, pilot designer, stakeholder map, risk & anti-inversion, logic model.', 'Register a tool with EP.ext.define() and add a tab in 40-toolkit.js; keep outputs print-ready.', 'Decision-grade documents that show uncertainty, trade-offs and who is affected.');
  N('simulator', 'Transparent scenario models plus a seeded Monte Carlo view.', 'Add a model to MODELS (fields + fn) and it appears in both the calculator and the Monte Carlo panel.', 'Ranges and sensitivities instead of false precision.');
  N('research', 'Deterministic research-question and prompt generator (no invented studies).', 'Extend RESEARCH_AXES in the core script.', 'Better questions before any literature search.');
  N('classroom', 'Teacher kits, student passport and formative review, all local.', 'Add a rubric criterion in 48-classroom.js RUBRIC; kits are plain JSON and contain no student data.', 'Students are co-investigators; teachers keep control of data.');
  N('collaboration', 'Voluntary peer exchange: same-device rooms, optional internet rooms, quarantine inbox.', 'Add an action in 50-multiplayer.js; every incoming record must pass sanitise → rate limit → quarantine.', 'Sharing that is consented, bounded and reviewable.');
  N('local-ai', 'Optional in-browser language model with a deterministic fallback and a harm-boundary filter.', 'Add a verified model id to MODEL_CHOICES (checked against the library list at load).', 'Drafting help that never sends your text to a server.');
  N('protocol', 'The portable protocol that independent implementations can follow.', 'Add a protocol field with a version bump and a migration note.', 'Interoperability without lock-in.');
  N('integrity', 'Tamper-evident ledger, encrypted backups and optional signing.', 'Add a ledger entry type in 70-integrity.js LEDGER_TYPES.', 'Audit trails that are honest about what they can and cannot prove.');
  N('data', 'Backup, import, restore points, storage and deletion controls.', 'New collections are included automatically once registered with EP.ext.define().', 'You can always leave, restore, or erase.');
  N('system', 'System check: capabilities, storage, network transparency, self-tests, local analytics.', 'Add a probe in kernel K5 or a test in 80-system.js TESTS.', 'Failures are visible and explained, not hidden.');
  N('attributions', 'Credits, licences and what was adapted from open patterns.', 'Add a row for any new library or pattern, with its licence.', 'Nothing borrowed goes unacknowledged.');

  const sectionEls = () => U.qsa('main > section[id]');
  EP.nav = { GROUPS, sections: () => sectionEls().map(s => ({ id: s.id, el: s })), title: id => { const k = 'toc.' + id; const v = EP.t(k); if (v !== k) return v; const h = document.querySelector('#' + CSS.escape(id) + ' h2'); return h ? h.textContent.trim() : id; } };
  /* reveal(): the one routine every feature uses to bring something into view: opens collapsed
     <details> ancestors, switches hidden tab panels, scrolls (respecting reduced motion), moves
     focus for keyboard and screen-reader users, and flashes the target briefly. */
  let userScrollAt = 0; for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.addEventListener(ev, () => { userScrollAt = Date.now(); }, { passive: true, capture: true });
  EP.nav.reveal = (target, opts = {}) => {
    const startedAt = Date.now();
    const el = typeof target === 'string' ? document.querySelector(target) : target; if (!el) return false;
    for (let n = el; n; n = n.parentElement) {
      if (n.tagName === 'DETAILS' && !n.open) n.open = true;
      if (n.getAttribute && n.getAttribute('role') === 'tabpanel' && n.hidden) { const tab = document.querySelector('[aria-controls="' + n.id + '"]'); if (tab) tab.click(); }
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-motion') === 'reduce';
    el.scrollIntoView({ block: opts.block || 'start', behavior: reduce ? 'auto' : 'smooth' });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch {}
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700);
    if (el.id && opts.hash !== false) { try { history.replaceState(null, '', '#' + el.id); } catch {} }
    /* content-visibility sections change height as they render: re-align once after the scroll settles */
    setTimeout(() => { const top = el.getBoundingClientRect().top, want = (parseFloat(getComputedStyle(el).scrollMarginTop) || 0); if (userScrollAt < startedAt && !opts.block && Math.abs(top - want) > 80 && document.contains(el)) el.scrollIntoView({ block: 'start', behavior: 'auto' }); }, reduce ? 80 : 950);
    return true;
  };

  /* HEADER GROUP LINKS + TOC ------------------------------------------------------------ */
  function present(group) { return group.sections.filter(id => document.getElementById(id)); }
  function buildGroupNav() {
    const nav = $('groupNav'); if (!nav) return;
    nav.replaceChildren(...GROUPS.map(g => { const first = present(g)[0]; return first ? U.el('a', { href: '#' + first, dataset: { group: g.id }, text: EP.t(g.key) }) : null; }).filter(Boolean));
  }
  function buildToc(container, closeOnPick) {
    container.replaceChildren();
    for (const g of GROUPS) {
      const ids = present(g); if (!ids.length) continue;
      const d = U.el('details', { open: '' }, U.el('summary', { text: EP.t(g.key) }));
      for (const id of ids) d.append(U.el('a', { href: '#' + id, dataset: { toc: id }, onclick: () => { if (closeOnPick) closeOnPick(); } , text: EP.nav.title(id) }));
      container.append(d);
    }
    if (!closeOnPick) container.append(U.el('div', { class: 'toc-tools' },
      U.el('button', { type: 'button', onclick: () => U.qsa('main details.chapter, main details.module').forEach(d => d.open = true), text: EP.t('ui.expandAll') }),
      U.el('button', { type: 'button', onclick: () => U.qsa('main details.chapter, main details.module').forEach(d => d.open = false), text: EP.t('ui.collapseAll') })));
    markCurrent(currentId);
  }
  let currentId = 'home';
  function markCurrent(id) {
    currentId = id;
    for (const a of U.qsa('[data-toc]')) { if (a.dataset.toc === id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); }
    const g = GROUPS.find(x => x.sections.includes(id));
    for (const a of U.qsa('#groupNav a')) { if (g && a.dataset.group === g.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
  }
  function setupScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    const visible = new Map();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) { if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top); else visible.delete(e.target.id); }
      if (!visible.size) return;
      const best = [...visible.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0][0];
      if (best !== currentId) markCurrent(best);
    }, { rootMargin: '-25% 0px -60% 0px', threshold: 0 });
    sectionEls().forEach(s => io.observe(s));
  }

  /* READING PROGRESS ---------------------------------------------------------------------- */
  function setupProgress() {
    const bar = $('readProgress'); if (!bar) return;
    if (EP.features.has('scrollTimeline')) { bar.classList.add('native'); return; }
    const upd = () => { const h = document.documentElement; const max = h.scrollHeight - h.clientHeight; bar.style.setProperty('--p', max > 0 ? String(U.clamp(h.scrollTop / max, 0, 1)) : '0'); };
    let ticking = false; window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { upd(); ticking = false; }); } }, { passive: true }); upd();
  }

  /* PARALLAX (JS fallback only when CSS scroll-driven animation is unavailable) -------------- */
  function setupParallax() {
    if (EP.features.has('scrollTimeline')) return;
    const bands = U.qsa('.px-band'); if (!bands.length || !('IntersectionObserver' in window)) return;
    const live = new Set(); let ticking = false;
    const frame = () => {
      ticking = false;
      if (document.documentElement.getAttribute('data-motion') === 'reduce' || document.documentElement.getAttribute('data-parallax') !== 'on') return;
      const vh = window.innerHeight;
      for (const b of live) { const r = b.getBoundingClientRect(); b.style.setProperty('--py', String(Math.round((r.top + r.height / 2) - vh / 2))); }
    };
    const io = new IntersectionObserver(es => { for (const e of es) { if (e.isIntersecting) live.add(e.target); else live.delete(e.target); } frame(); }, { rootMargin: '10% 0px' });
    bands.forEach(b => io.observe(b));
    window.addEventListener('scroll', () => { if (!ticking && live.size) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  }

  /* BUILDER NOTES (ⓘ) ---------------------------------------------------------------------- */
  function attachNotes() {
    for (const s of sectionEls()) {
      const n = notes[s.id]; if (!n || s.querySelector(':scope .note-btn')) continue;
      const head = s.querySelector('.section-head h2') || s.querySelector('h2'); if (!head) continue;
      const id = 'bn-' + s.id;
      const btn = U.el('button', { type: 'button', class: 'note-btn no-print', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': EP.t('ui.builderNotes') + ' · ' + EP.nav.title(s.id), title: EP.t('ui.builderNotes'), text: 'ⓘ', style: 'margin-left:.5rem;padding:.05rem .45rem;border-radius:999px;font-size:.8rem' });
      const box = U.el('div', { id, class: 'callout no-print', hidden: '' },
        U.el('p', {}, U.el('strong', { text: 'Purpose: ' }), n.purpose), U.el('p', {}, U.el('strong', { text: 'How to extend: ' }), n.extend), U.el('p', {}, U.el('strong', { text: 'Expected outcome: ' }), n.outcome));
      btn.addEventListener('click', () => { const open = box.hidden; box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
      head.append(btn); (head.closest('.section-head') || head.parentElement).after(box);
    }
  }

  /* HEADER CONTROLS ---------------------------------------------------------------------------- */
  function wireHeader() {
    const roleSel = $('roleSelect'), langSel = $('langSelect');
    $('themeBtn')?.addEventListener('click', () => { const next = EP.settings.resolvedTheme() === 'dark' ? 'light' : 'dark'; EP.settings.set('theme', next); EP.ui.announce(next); EP.analytics.record('theme', { theme: next }); });
    $('settingsBtn')?.addEventListener('click', () => EP.settingsUI && EP.settingsUI.open());
    $('printBtn')?.addEventListener('click', () => { EP.analytics.record('print', { scope: 'page' }); window.print(); });
    $('searchBtn')?.addEventListener('click', () => EP.search && EP.search.open());
    $('tocBtn')?.addEventListener('click', () => { const body = U.el('div', { class: 'toc', style: 'display:block;position:static;max-height:none;border:0;padding:0' }); EP.ui.dialog({ title: EP.t('ui.contents'), body, actions: [{ id: 'close', label: EP.t('ui.close'), primary: true }], onOpen: (dlg, finish) => buildToc(body, () => finish('nav')) }); });
    langSel?.addEventListener('change', () => EP.i18n.set(langSel.value));
    roleSel?.addEventListener('change', () => EP.settings.set('role', roleSel.value));
    const syncSel = () => { if (langSel) langSel.value = EP.settings.get('lang'); if (roleSel) roleSel.value = EP.settings.get('role'); };
    EP.on('settings:ready', syncSel); EP.on('settings:lang', syncSel); EP.on('settings:role', syncSel); EP.on('settings:reset', syncSel); syncSel();
    const banner = $('syncBanner');
    EP.on('state:stale', () => { if (banner) banner.hidden = false; });
    $('syncReload')?.addEventListener('click', async () => { await EP.core.reloadFromStore(); if (banner) banner.hidden = true; });
    $('syncDismiss')?.addEventListener('click', () => { if (banner) banner.hidden = true; });
    const bar = document.querySelector('.topbar');
    if (bar && 'ResizeObserver' in window) new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', Math.ceil(bar.getBoundingClientRect().height) + 'px')).observe(bar);
    window.addEventListener('online', () => { const c = $('connectionStatus'); if (c) c.textContent = EP.t('net.online'); });
    window.addEventListener('offline', () => { const c = $('connectionStatus'); if (c) c.textContent = EP.t('net.offline'); });
    const c = $('connectionStatus'); if (c) c.textContent = navigator.onLine ? EP.t('net.online') : EP.t('net.offline');
    /* Printing: open collapsed sections so nothing is silently missing from paper, then restore. */
    let restore = [];
    window.addEventListener('beforeprint', () => { restore = U.qsa('details:not([open])'); restore.forEach(d => d.open = true); });
    window.addEventListener('afterprint', () => { restore.forEach(d => d.open = false); restore = []; });
  }

  EP.i18n.register({
    'net.online': ['Browser reports online. External links may work; the app itself never needs them.', 'El navegador indica que hay conexión. Los enlaces externos pueden funcionar; la aplicación nunca los necesita.', 'Le navigateur signale une connexion. Les liens externes peuvent fonctionner ; l’application n’en a jamais besoin.'],
    'net.offline': ['Offline: every embedded tool still works; publisher links cannot load.', 'Sin conexión: todas las herramientas integradas siguen funcionando; los enlaces de editoriales no cargan.', 'Hors ligne : tous les outils intégrés fonctionnent ; les liens des éditeurs ne se chargent pas.']
  });

  EP.module('nav', () => {
    buildGroupNav(); buildToc($('toc')); setupScrollSpy(); setupProgress(); setupParallax(); attachNotes(); wireHeader();
    EP.on('lang', () => { buildGroupNav(); buildToc($('toc')); markCurrent(currentId); U.qsa('.note-btn').forEach(b => b.remove()); U.qsa('[id^="bn-"]').forEach(b => b.remove()); attachNotes(); });
    if (location.hash) { const t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) setTimeout(() => t.scrollIntoView(), 50); }
  }, { order: 20 });
})();
