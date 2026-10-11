/* ==========================================================================
   EMPOWERMENT OS v4 · KERNEL
   One small, dependency-free toolbox shared by every module through the global `EP`.
   Modules never reach into each other: they talk through EP.on / EP.emit and EP.* services.
   Sections: K1 utilities+bus · K2 sanitizers · K3 rate limits · K4 log+error boundary ·
             K5 feature detection · K6 storage · K7 settings · K8 i18n · K9 UI helpers ·
             K10 local-only analytics · K11 workspace extension registry
   ========================================================================== */
'use strict';
const EP = window.EP = window.EP || {};
EP.version = '4.0.0';
EP.schema = 3;
/* Build profile (replaced by tools/build.py): 'full' = optional opt-in network add-ons are available;
   'strict' = air-gapped edition, no network code paths, CSP forbids connections entirely. */
EP.profile = '__EP_PROFILE__';
EP.strict = EP.profile === 'strict';

/* MODULE REGISTRY --------------------------------------------------------------------------
   Purpose: every feature registers an init function; a failure in one module is logged and isolated
            so the rest of the platform keeps working (graceful degradation, not a blank page).
   Extend : EP.module('my-tool', () => { …wire DOM… }, { after: ['core'] }).
   Outcome: deterministic start-up order + a per-module health list shown in System check. */
EP.modules = [];
EP.module = (name, init, opts = {}) => { EP.modules.push({ name, init, order: opts.order ?? 50, status: 'pending', error: '' }); };
EP.runModules = async () => {
  const list = EP.modules.slice().sort((a, b) => a.order - b.order);
  for (const m of list) {
    try { await m.init(); m.status = 'ok'; }
    catch (e) { m.status = 'failed'; m.error = String(e && e.message || e).slice(0, 200); try { EP.log.error('module ' + m.name, e); } catch {} }
  }
  EP.emit('app:ready', list.map(m => ({ name: m.name, status: m.status })));
};

/* K1 · UTILITIES + EVENT BUS ------------------------------------------------
   Purpose: tiny pure helpers and a publish/subscribe bus.
   Extend : add pure helpers to EP.util (no DOM side effects).  Outcome: small modules. */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const U = EP.util = {
  $: id => document.getElementById(id),
  qs: (sel, root = document) => root.querySelector(sel),
  qsa: (sel, root = document) => Array.from(root.querySelectorAll(sel)),
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]),
  clamp: (n, lo, hi) => Math.min(hi, Math.max(lo, n)),
  now: () => new Date().toISOString(),
  localDay(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  uid: () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  debounce(fn, ms = 150) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; },
  fold: s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  toB64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); },
  fromB64(str) { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; },
  hex: buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join(''),
  async sha256(text) { if (!crypto.subtle) return ''; return U.hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); },
  /* Stable JSON (sorted keys) so hashes are reproducible across browsers. */
  canonical(obj) { return JSON.stringify(obj, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((o, key) => (o[key] = v[key], o), {}) : v); },
  /* Deterministic PRNG (mulberry32): same seed → same simulation, which makes results reproducible. */
  seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  hash32(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
  /* Minimal DOM builder: text is always inserted as text nodes (never as HTML). */
  /* nn(): drop null/undefined/false so conditional nodes never print as the text "null" via replaceChildren/append */
  nn: (...a) => a.flat(Infinity).filter(x => x != null && x !== false),
  el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) { if (kid == null || kid === false) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
    return e;
  },
  svg(tag, attrs = {}, text) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  }
};
const listeners = new Map();
EP.on = (evt, fn) => { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return () => listeners.get(evt)?.delete(fn); };
EP.emit = (evt, detail) => { for (const fn of [...(listeners.get(evt) || [])]) { try { fn(detail); } catch (e) { EP.log.error('listener:' + evt, e); } } };

/* K2 · SANITIZERS -------------------------------------------------------------
   Purpose: every string that enters the workspace passes through here.
   Removes control characters and bidirectional-override characters (used to disguise text),
   normalises Unicode, and enforces length limits. Rendering is separately HTML-escaped. */
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const S = EP.sanitize = {
  text(v, max = 1000) { return String(v ?? '').normalize('NFC').replace(CTRL, '').replace(/\r\n?/g, '\n').slice(0, max); },
  line(v, max = 200) { return S.text(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max); },
  id(v) { const s = String(v ?? ''); return /^[A-Za-z0-9_.~:-]{3,160}$/.test(s) ? s : null; },
  num(v, { min = -1e12, max = 1e12, int = false, fallback = 0 } = {}) { let n = Number(v); if (v === '' || v == null || !Number.isFinite(n)) return fallback; n = U.clamp(n, min, max); return int ? Math.round(n) : n; },
  pick(v, list, fallback = list[0]) { return list.includes(v) ? v : fallback; },
  url(v) { const s = String(v ?? '').trim(); if (!s) return ''; try { const u = new URL(s); return u.protocol === 'https:' ? u.href.slice(0, 1100) : ''; } catch { return ''; } },
  iso(v) { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : U.now(); },
  day(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : ''; },
  bool: v => v === true || v === 'true' || v === 1 || v === '1' || v === 'on'
};

/* K3 · GENTLE RATE LIMITS -----------------------------------------------------
   Purpose: token buckets that slow accidental floods (double-clicks, loops, hostile peers)
            without punishing normal use. Extend: EP.rate.allow('name',{capacity,perSec}).
   Outcome : callers get false when too fast; the UI shows a calm "slow down" message. */
EP.rate = (() => {
  const buckets = new Map();
  const make = ({ capacity = 5, perSec = 1 } = {}) => {
    let tokens = capacity, last = performance.now();
    return {
      take(n = 1) { const t = performance.now(); tokens = Math.min(capacity, tokens + (t - last) / 1000 * perSec); last = t; if (tokens >= n) { tokens -= n; return true; } return false; },
      waitMs() { return Math.max(0, Math.ceil((1 - tokens) / perSec * 1000)); }
    };
  };
  const gate = (name, cfg) => { if (!buckets.has(name)) buckets.set(name, make(cfg)); return buckets.get(name); };
  return { make, gate, allow(name, cfg, quiet = false) { const ok = gate(name, cfg).take(); if (!ok && !quiet) EP.ui.toast(EP.t('ui.slowDown')); return ok; } };
})();

/* K4 · LOG RING + ERROR BOUNDARY ----------------------------------------------
   Purpose: keep a small in-memory diagnostic trail that is shown (never sent) in System Check.
   Nothing is written to the network; nothing persists beyond the tab. */
EP.log = (() => {
  const ring = []; let toasted = false;
  const push = (level, ...a) => { ring.push({ at: U.now(), level, msg: a.map(x => (x && x.message) ? x.message : String(x)).join(' ').slice(0, 400) }); if (ring.length > 200) ring.shift(); };
  return {
    entries: () => ring.slice(), info: (...a) => push('info', ...a), warn: (...a) => push('warn', ...a),
    error(...a) { push('error', ...a); if (!toasted && EP.ui) { toasted = true; EP.ui.toast(EP.t('ui.unexpected')); } },
    clear: () => { ring.length = 0; }
  };
})();
window.addEventListener('error', e => EP.log.error('error', e.message, (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => EP.log.error('rejection', e.reason));

/* K5 · FEATURE DETECTION ------------------------------------------------------
   Purpose: report which platform capabilities exist so every feature can degrade gracefully.
   Extend : add one line to `probes`. Outcome: honest capability matrix in System Check. */
EP.features = (() => {
  const probes = [
    ['indexedDB', 'IndexedDB (durable local state)', () => !!window.indexedDB, 'Falls back to LocalStorage, then memory-only with an export warning.'],
    ['broadcast', 'BroadcastChannel (multi-tab sync)', () => 'BroadcastChannel' in window, 'Tabs will not notify each other; the revision check still prevents silent overwrites.'],
    ['crypto', 'Web Crypto (hashing, encryption, signing)', () => !!(window.crypto && crypto.subtle), 'Encrypted backups and ledger hashes need a secure context (https or file/localhost).'],
    ['compression', 'Compression Streams', () => 'CompressionStream' in window, 'Not used for core features.'],
    ['locks', 'Web Locks', () => !!(navigator.locks && navigator.locks.request), 'Optional; writes are already atomic through IndexedDB transactions.'],
    ['storageEstimate', 'Storage estimate', () => !!(navigator.storage && navigator.storage.estimate), 'Quota bar is hidden.'],
    ['storagePersist', 'Persistent storage request', () => !!(navigator.storage && navigator.storage.persist), 'Browser may evict data under storage pressure; export backups.'],
    ['serviceWorker', 'Service worker (install/offline cache)', () => 'serviceWorker' in navigator && location.protocol !== 'file:', 'Single-file offline use still works; install/caching needs https or localhost.'],
    ['speech', 'Speech synthesis (read aloud)', () => 'speechSynthesis' in window, 'Read-aloud buttons are hidden.'],
    ['webgpu', 'WebGPU (optional local AI)', () => 'gpu' in navigator, 'Deterministic planner is used instead of a model.'],
    ['dialog', '<dialog> element', () => typeof HTMLDialogElement === 'function', 'Falls back to inline panels.'],
    ['popover', 'Popover API', () => typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype, 'Panels toggle with hidden attributes.'],
    ['inert', 'inert attribute', () => 'inert' in HTMLElement.prototype, 'Splash cannot isolate background content for assistive tech.'],
    ['scrollTimeline', 'CSS scroll-driven animation', () => !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()')), 'JavaScript drives the reading-progress bar instead.'],
    ['viewTransitions', 'View Transitions API', () => typeof document.startViewTransition === 'function', 'Theme/language switch happens without a cross-fade.'],
    ['segmenter', 'Intl.Segmenter (multilingual search)', () => !!(Intl && Intl.Segmenter), 'Search uses a Unicode regex tokenizer.'],
    ['fileSave', 'File System Access (save-as)', () => 'showSaveFilePicker' in window, 'Standard downloads are used.'],
    ['share', 'Web Share', () => 'share' in navigator, 'Copy/download buttons remain.'],
    ['canvas', 'Canvas 2D (constellation)', () => !!document.createElement('canvas').getContext, 'A text list replaces the constellation.']
  ];
  const cache = {};
  return {
    list() { return probes.map(([id, label, test, fallback]) => { let ok = false; try { ok = !!test(); } catch { ok = false; } cache[id] = ok; return { id, label, ok, fallback }; }); },
    has(id) { if (!(id in cache)) { const p = probes.find(x => x[0] === id); try { cache[id] = !!(p && p[2]()); } catch { cache[id] = false; } } return cache[id]; }
  };
})();

/* K6 · STORAGE (IndexedDB with memory fallback) -----------------------------
   Purpose: ONE database (`empowerment_os_v4`) for state, rolling history, settings, HUD,
            analytics, collaboration records, the peer quarantine and optional signing keys.
   Extend : add a store to STORE_DEFS and bump DB_VERSION (upgrade only adds; never deletes).
   Outcome: durable, transactional local persistence; v3 data is imported once, never altered. */
const DB_NAME = 'empowerment_os_v4', DB_VERSION = 1;
const STORE_DEFS = {
  state: {}, history: { keyPath: 'id', autoIncrement: true }, settings: {},
  analytics: { keyPath: 'id', autoIncrement: true }, records: { keyPath: 'id' },
  quarantine: { keyPath: 'id' }, keys: {}, meta: {}
};
EP.store = (() => {
  const mem = Object.fromEntries(Object.keys(STORE_DEFS).map(k => [k, new Map()]));
  const seq = Object.fromEntries(Object.keys(STORE_DEFS).map(k => [k, 0]));
  let db = null, mode = 'pending';
  const open = () => new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => { for (const [name, opts] of Object.entries(STORE_DEFS)) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, opts); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('IndexedDB open failed'));
    r.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });
  const ready = (async () => {
    if (!window.indexedDB) { mode = 'memory'; return; }
    try {
      db = await open(); mode = 'indexeddb';
      db.onversionchange = () => { try { db.close(); } catch {} db = null; mode = 'memory'; EP.log.warn('Database closed for an upgrade in another tab; reload to continue saving.'); };
    } catch (e) { mode = 'memory'; EP.log.warn('IndexedDB unavailable; using memory only', e); }
  })();
  const run = (store, txMode, fn) => ready.then(() => new Promise((resolve, reject) => {
    if (!db) return reject(new Error('no-db'));
    const tx = db.transaction(store, txMode);
    let out; try { out = fn(tx.objectStore(store)); } catch (e) { return reject(e); }
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error || new Error('transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  }));
  const keyOf = (store, value, key) => { const kp = STORE_DEFS[store].keyPath; if (kp) return value[kp]; return key; };
  const api = {
    ready, get mode() { return mode; }, get db() { return db; }, name: DB_NAME,
    async get(store, key) { await ready; if (!db) return structuredClone(mem[store].get(key)); return run(store, 'readonly', s => s.get(key)); },
    async put(store, value, key) {
      await ready;
      if (!db) { let k = keyOf(store, value, key); if (k === undefined) { k = ++seq[store]; if (STORE_DEFS[store].keyPath) value = { ...value, [STORE_DEFS[store].keyPath]: k }; } mem[store].set(k, structuredClone(value)); return value; }
      return run(store, 'readwrite', s => STORE_DEFS[store].keyPath ? s.put(value) : s.put(value, key));
    },
    /* update(): atomic read-modify-write inside ONE readwrite transaction. fn(old) returns
       {write?: value, result?: any}; omit `write` to leave the record untouched. This is what makes
       the multi-tab revision check race-free. */
    async update(store, key, fn) {
      await ready;
      if (!db) { const old = structuredClone(mem[store].get(key)); const r = fn(old) || {}; if ('write' in r) mem[store].set(key, structuredClone(r.write)); return r.result; }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite'), os = tx.objectStore(store); let out;
        const g = os.get(key);
        g.onsuccess = () => { try { const r = fn(g.result) || {}; out = r.result; if ('write' in r) { if (STORE_DEFS[store].keyPath) os.put(r.write); else os.put(r.write, key); } } catch (e) { try { tx.abort(); } catch {} reject(e); } };
        tx.oncomplete = () => resolve(out); tx.onerror = () => reject(tx.error || new Error('update failed')); tx.onabort = () => reject(tx.error || new Error('update aborted'));
      });
    },
    async del(store, key) { await ready; if (!db) { mem[store].delete(key); return; } return run(store, 'readwrite', s => s.delete(key)); },
    async all(store) { await ready; if (!db) return [...mem[store].values()].map(v => structuredClone(v)); return run(store, 'readonly', s => s.getAll()); },
    async keys(store) { await ready; if (!db) return [...mem[store].keys()]; return run(store, 'readonly', s => s.getAllKeys()); },
    async count(store) { await ready; if (!db) return mem[store].size; return run(store, 'readonly', s => s.count()); },
    async clear(store) { await ready; if (!db) { mem[store].clear(); return; } return run(store, 'readwrite', s => s.clear()); },
    async deleteDatabase() {
      await ready; try { db?.close(); } catch {} db = null;
      await new Promise(res => { try { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
      for (const m of Object.values(mem)) m.clear(); mode = 'memory';
    }
  };
  return api;
})();

/* K7 · SETTINGS ---------------------------------------------------------------
   Purpose: every preference in one validated object, stored in IndexedDB and mirrored to a small
            localStorage cache (EP_BOOT_KEYS) so the next page load paints correctly.
   Extend : add a default (and, for enums, a VALID list). Outcome: get/set with validation + events. */
const DEFAULT_PREFS = {
  theme: 'auto', lang: 'auto', fontScale: 100, lineHeight: 'normal', letterSpacing: 'normal', motion: 'auto', contrast: 'auto',
  dyslexia: false, underline: false, splash: 'session', hud: true, tocRail: true, parallax: true, analytics: false,
  role: '', lensAsked: false, youthSafe: false, autoJoinPublic: false, voice: '', speechRate: 1, backupCadenceDays: 30, lastBackupAt: '', publicConsentAt: ''
};
const VALID = {
  theme: ['auto', 'dark', 'light', 'hc'], lang: ['auto', 'en', 'es', 'fr'], lineHeight: ['normal', 'relaxed', 'loose'],
  letterSpacing: ['normal', 'wide', 'wider'], motion: ['auto', 'reduce', 'full'], contrast: ['auto', 'more'],
  splash: ['session', 'always', 'never'], role: ['', 'policy', 'corporate', 'educator', 'student', 'community']
};
const EP_BOOT_KEYS = ['theme', 'lang', 'fontScale', 'lineHeight', 'letterSpacing', 'motion', 'contrast', 'dyslexia', 'underline', 'splash'];
EP.settings = (() => {
  let prefs = { ...DEFAULT_PREFS }, loaded = false;
  const norm = (k, v) => {
    if (!(k in DEFAULT_PREFS)) return undefined;
    const d = DEFAULT_PREFS[k];
    if (VALID[k]) return VALID[k].includes(v) ? v : d;
    if (typeof d === 'boolean') return S.bool(v);
    if (k === 'fontScale') return S.num(v, { min: 85, max: 150, int: true, fallback: 100 });
    if (k === 'speechRate') return S.num(v, { min: 0.6, max: 1.6, fallback: 1 });
    if (k === 'backupCadenceDays') return S.num(v, { min: 7, max: 365, int: true, fallback: 30 });
    return S.line(v, 200);
  };
  const persist = U.debounce(async () => { try { await EP.store.put('settings', prefs, 'prefs'); } catch (e) { EP.log.warn('settings not saved', e); } }, 120);
  const mirror = () => { try { const b = {}; for (const k of EP_BOOT_KEYS) b[k] = prefs[k]; localStorage.setItem('ep4_boot', JSON.stringify(b)); } catch {} };
  let mq = null;
  const resolvedTheme = () => prefs.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : prefs.theme;
  function applyToDocument() {
    const r = document.documentElement;
    r.setAttribute('data-theme', resolvedTheme());
    r.style.setProperty('--font-scale', String(prefs.fontScale / 100));
    const setAttr = (n, on, v = '1') => on ? r.setAttribute(n, v) : r.removeAttribute(n);
    setAttr('data-motion', prefs.motion !== 'auto', prefs.motion);
    setAttr('data-contrast', prefs.contrast !== 'auto', prefs.contrast);
    setAttr('data-dyslexia', prefs.dyslexia); setAttr('data-underline', prefs.underline);
    setAttr('data-lh', prefs.lineHeight !== 'normal', prefs.lineHeight); setAttr('data-ls', prefs.letterSpacing !== 'normal', prefs.letterSpacing);
    setAttr('data-parallax', prefs.parallax, 'on'); setAttr('data-youth', prefs.youthSafe);
    document.body && document.body.toggleAttribute('data-hud-off', !prefs.hud);
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', getComputedStyle(r).getPropertyValue('--bg').trim() || '#091714');
  }
  const api = {
    ready: EP.store.ready.then(async () => {
      try { const saved = await EP.store.get('settings', 'prefs'); if (saved && typeof saved === 'object') for (const k of Object.keys(DEFAULT_PREFS)) if (k in saved) prefs[k] = norm(k, saved[k]); } catch (e) { EP.log.warn('settings load', e); }
      loaded = true; mirror(); applyToDocument();
      if (!mq && window.matchMedia) { mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener?.('change', () => { if (prefs.theme === 'auto') applyToDocument(); }); }
      EP.emit('settings:ready', { ...prefs });
    }),
    get: k => prefs[k], all: () => ({ ...prefs }), resolvedTheme, applyToDocument, get loaded() { return loaded; },
    set(k, v) {
      const n = norm(k, v); if (n === undefined || n === prefs[k]) return false;
      prefs[k] = n; if (EP_BOOT_KEYS.includes(k)) mirror(); persist(); applyToDocument();
      EP.emit('settings:change', { key: k, value: n }); EP.emit('settings:' + k, n); return true;
    },
    setMany(obj) { let any = false; for (const [k, v] of Object.entries(obj)) any = api.set(k, v) || any; return any; },
    async reset() { const keep = { lastBackupAt: prefs.lastBackupAt }; prefs = { ...DEFAULT_PREFS, ...keep }; mirror(); await EP.store.put('settings', prefs, 'prefs'); applyToDocument(); EP.emit('settings:reset'); }
  };
  return api;
})();
window.addEventListener('ep:splash-pref', e => EP.settings.set('splash', e.detail));

/* K8 · INTERNATIONALISATION ---------------------------------------------------
   Purpose: EN / ES / FR interface strings + Intl formatting. Dictionary shape: key → [en, es, fr].
   Extend : register more entries with EP.i18n.register({key:[en,es,fr]}); add a language by
            appending its code to LANGS and one more array slot per key. Missing → English.
   Outcome: the interface and every v4 tool switch language live; deep research content stays in
            English (stated openly in the UI). Community-authored translations are recommended for
            Indigenous languages and are deliberately not machine-generated here. */
EP.i18n = (() => {
  const LANGS = ['en', 'es', 'fr'], NAMES = { en: 'English', es: 'Español', fr: 'Français' }, dict = {};
  let cur = 'en';
  const detect = () => { const p = EP.settings.get('lang'); if (p && p !== 'auto') return p; for (const l of (navigator.languages || [navigator.language || 'en'])) { const c = String(l).slice(0, 2).toLowerCase(); if (LANGS.includes(c)) return c; } return 'en'; };
  const t = (key, vars) => {
    const row = dict[key]; let s = row ? (row[LANGS.indexOf(cur)] || row[0]) : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  };
  function apply(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) { const v = t(el.dataset.i18n); if (el.textContent !== v) el.textContent = v; }
    for (const el of root.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of el.dataset.i18nAttr.split(';')) { const [attr, key] = pair.split(':').map(x => x.trim()); if (attr && key) el.setAttribute(attr, t(key)); }
    }
  }
  function setLang(lang) {
    cur = LANGS.includes(lang) ? lang : detect();
    document.documentElement.lang = cur;
    document.title = t('meta.title');
    apply(document);
    EP.emit('lang', cur);
  }
  const fmt = {
    number: (n, o) => new Intl.NumberFormat(cur, o).format(n),
    date: (d, o = { dateStyle: 'medium' }) => new Intl.DateTimeFormat(cur, o).format(new Date(d)),
    dateTime: d => new Intl.DateTimeFormat(cur, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)),
    list: a => new Intl.ListFormat(cur, { style: 'long', type: 'conjunction' }).format(a),
    bytes: n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'
  };
  return {
    LANGS, NAMES, dict, register(obj) { Object.assign(dict, obj); }, t, apply, fmt,
    get lang() { return cur; }, set: lang => { if (lang !== EP.settings.get('lang')) EP.settings.set('lang', lang); setLang(lang); },
    init() { setLang(detect()); }
  };
})();
EP.t = EP.i18n.t; EP.fmt = EP.i18n.fmt;

/* K9 · UI HELPERS -------------------------------------------------------------
   toast · announce (screen-reader live region) · dialog/confirm/form (native <dialog>) ·
   tabs (ARIA tablist with arrow keys) · download · copy. Extend: add helpers here, keep them
   framework-free. Outcome: consistent, keyboard-accessible interaction patterns. */
EP.ui = (() => {
  let toastTimer;
  function toast(msg, ms = 4400) {
    const el = U.$('toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
  function announce(msg) { const el = U.$('epLive'); if (!el) return; el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); }
  let dlgSeq = 0;
  function dialog({ title = '', body = '', actions = [{ id: 'ok', label: EP.t('ui.ok'), primary: true }], wide = false, className = '', initialFocus = '', onOpen } = {}) {
    return new Promise(resolve => {
      const tid = 'epDlgT' + (++dlgSeq);
      const dlg = U.el('dialog', { class: 'ep-dialog' + (wide ? ' wide' : '') + (className ? ' ' + className : ''), 'aria-labelledby': tid });
      const inner = U.el('div', { class: 'ep-dialog-inner' });
      const bodyEl = U.el('div', { class: 'ep-dialog-body' });
      if (typeof body === 'string') { for (const para of body.split('\n\n')) bodyEl.append(U.el('p', { text: para })); } else if (body) bodyEl.append(body);
      const foot = U.el('div', { class: 'ep-dialog-actions' }, actions.map(a => U.el('button', { type: 'button', class: (a.primary ? 'primary ' : '') + (a.danger ? 'danger' : ''), dataset: { act: a.id }, text: a.label })));
      inner.append(U.el('h2', { id: tid, text: title }), bodyEl, foot); dlg.append(inner); document.body.append(dlg);
      let closed = false;
      const finish = v => { if (closed) return; closed = true; try { if (dlg.open) dlg.close(); } catch {} dlg.remove(); resolve(v); };
      foot.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) finish(b.dataset.act); });
      dlg.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
      dlg.addEventListener('click', e => { if (e.target === dlg) finish(null); });
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      if (onOpen) onOpen(dlg, finish);
      const focusEl = (initialFocus && dlg.querySelector(initialFocus)) || foot.querySelector('.primary') || foot.querySelector('button');
      focusEl && focusEl.focus();
    });
  }
  async function confirm(message, { title = EP.t('ui.confirm'), ok = EP.t('ui.ok'), cancel = EP.t('ui.cancel'), danger = false } = {}) {
    const r = await dialog({ title, body: message, actions: [{ id: 'cancel', label: cancel }, { id: 'ok', label: ok, primary: !danger, danger }] });
    return r === 'ok';
  }
  /* form(): promise-based modal form. fields: [{id,label,type,help,minLength,required,value,options}] → values | null */
  function form({ title, intro = '', fields = [], submit = EP.t('ui.ok'), validate, wide = false, danger = false }) {
    const wrap = U.el('div', { class: 'ep-form' });
    if (intro) for (const p of intro.split('\n\n')) wrap.append(U.el('p', { class: 'small', text: p }));
    const inputs = {}; const msg = U.el('p', { class: 'ep-form-msg', role: 'alert' });
    fields.forEach((f, i) => {
      const id = 'epF' + (++dlgSeq) + '_' + i;
      let input;
      if (f.type === 'select') input = U.el('select', { id }, (f.options || []).map(o => U.el('option', { value: o[0], text: o[1] })));
      else if (f.type === 'textarea') input = U.el('textarea', { id, rows: 4, maxlength: f.max || 2000 });
      else if (f.type === 'checkbox') input = U.el('input', { id, type: 'checkbox' });
      else input = U.el('input', { id, type: f.type || 'text', autocomplete: 'off', spellcheck: 'false', minlength: f.minLength || null, maxlength: f.max || 200 });
      if (f.value != null && f.type !== 'checkbox') input.value = f.value;
      if (f.type === 'checkbox') input.checked = !!f.value;
      inputs[f.id] = input;
      wrap.append(f.type === 'checkbox'
        ? U.el('label', { class: 'check', for: id }, input, U.el('span', { text: f.label }))
        : U.el('div', { class: 'field' }, U.el('label', { for: id, text: f.label }), input, f.help ? U.el('small', { text: f.help }) : null));
    });
    wrap.append(msg);
    return new Promise(resolve => {
      dialog({
        title, body: wrap, wide, actions: [{ id: 'cancel', label: EP.t('ui.cancel') }, { id: 'ok', label: submit, primary: !danger, danger }],
        onOpen: (dlg, finish) => {
          const read = () => Object.fromEntries(fields.map(f => [f.id, f.type === 'checkbox' ? inputs[f.id].checked : inputs[f.id].value]));
          const tryOk = () => { const v = read(); const err = validate ? validate(v) : null; if (err) { msg.textContent = err; return false; } finish('ok:' + JSON.stringify(v)); return true; };
          dlg.querySelector('[data-act="ok"]').addEventListener('click', e => { e.stopImmediatePropagation(); tryOk(); }, true);
          dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); tryOk(); } });
          const first = Object.values(inputs)[0]; first && first.focus();
        }
      }).then(r => resolve(r && r.startsWith('ok:') ? JSON.parse(r.slice(3)) : null));
    });
  }
  function tabs(root) {
    const list = root.querySelector('[role="tablist"]'); if (!list) return null;
    const tabsEl = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus = false) => {
      for (const t of tabsEl) { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; const p = document.getElementById(t.getAttribute('aria-controls')); if (p) p.hidden = !on; }
      if (focus) tab.focus(); EP.emit('tab', { root, id: tab.id });
    };
    list.addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t) select(t); });
    list.addEventListener('keydown', e => {
      const i = tabsEl.indexOf(document.activeElement); if (i < 0) return;
      const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabsEl.length - 1 };
      if (e.key in map) { e.preventDefault(); select(tabsEl[(map[e.key] + tabsEl.length) % tabsEl.length], true); }
    });
    select(tabsEl.find(t => t.getAttribute('aria-selected') === 'true') || tabsEl[0]);
    return { select: id => { const t = tabsEl.find(x => x.id === id); if (t) select(t); } };
  }
  function download(content, filename, type = 'text/plain;charset=utf-8') {
    if (!EP.rate.allow('download', { capacity: 6, perSec: 0.5 })) return false;
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = U.el('a', { href: url, download: filename, hidden: true }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    EP.emit('download', { filename, size: blob.size }); EP.analytics.record('download', { type: filename.split('.').pop() });
    return true;
  }
  async function copy(text) {
    if (!text) return false;
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); toast(EP.t('ui.copied')); return true; } } catch {}
    const ta = U.el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); toast(ok ? EP.t('ui.copied') : EP.t('ui.copyFail')); return ok;
  }
  /* Print a prepared HTML sheet (policy brief, worksheet) without printing the whole app. */
  function printSheet(node, title = document.title) {
    const sheet = U.$('printSheet'); if (!sheet) return;
    sheet.replaceChildren(node instanceof Node ? node.cloneNode(true) : U.el('div', { text: String(node) }));
    document.body.setAttribute('data-print', 'sheet');
    const prevTitle = document.title; document.title = title;
    const done = () => { document.body.removeAttribute('data-print'); document.title = prevTitle; sheet.replaceChildren(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 30);
  }
  return { toast, announce, dialog, confirm, form, tabs, download, copy, printSheet };
})();

/* K10 · LOCAL-ONLY ANALYTICS (optional, transparent, resettable) ---------------
   Purpose: help a team see which tools they actually use — without anyone else ever seeing it.
   Guarantees: OFF by default; forced OFF in youth-safe mode; events stay in this browser's
   IndexedDB; there is no network code path for analytics anywhere in this file; the viewer shows
   the raw events; one click exports or erases them. */
EP.analytics = (() => {
  const MAX = 5000;
  const enabled = () => EP.settings.get('analytics') === true && !EP.settings.get('youthSafe');
  const meta = m => { const o = {}; if (m && typeof m === 'object') for (const [k, v] of Object.entries(m).slice(0, 6)) o[S.line(k, 30)] = (typeof v === 'number' || typeof v === 'boolean') ? v : S.line(v, 60); return o; };
  return {
    enabled,
    async record(name, m) {
      if (!enabled() || !EP.settings.loaded) return;
      if (!EP.rate.allow('analytics', { capacity: 60, perSec: 3 }, true)) return;
      try {
        await EP.store.put('analytics', { at: U.now(), day: U.localDay(), name: S.line(name, 60), meta: meta(m) });
        if (Math.random() < 0.02 && (await EP.store.count('analytics')) > MAX) { const ks = await EP.store.keys('analytics'); for (const k of ks.slice(0, 500)) await EP.store.del('analytics', k); }
      } catch { /* analytics must never break the app */ }
    },
    events: async (limit = 200) => (await EP.store.all('analytics')).slice(-limit).reverse(),
    async summary() {
      const ev = await EP.store.all('analytics'); const byName = {}, byDay = {};
      for (const e of ev) { byName[e.name] = (byName[e.name] || 0) + 1; byDay[e.day] = (byDay[e.day] || 0) + 1; }
      return { total: ev.length, byName, byDay };
    },
    async export() { return { schema: 'empowerment-local-analytics/1', generatedAt: U.now(), note: 'Local-only usage counters. Never transmitted by this app.', events: await EP.store.all('analytics') }; },
    reset: () => EP.store.clear('analytics')
  };
})();

/* K11 · WORKSPACE EXTENSION REGISTRY ------------------------------------------
   Purpose: v4 tools keep their records in `state.ext.<name>` (arrays of plain objects). Each tool
            declares a sanitizer so backups, imports, snapshots and merges validate every record.
   Extend : EP.ext.define('myTool', { limit:200, sanitize(item){ …return clean|null }, redact(item){…} });
   Outcome: new tools inherit persistence, export/import, redaction and history for free. */
EP.ext = (() => {
  const defs = new Map();
  return {
    define(name, def) { defs.set(name, { limit: 300, keyed: true, share: false, sanitize: x => x, redact: null, mergeMode: 'newer', ...def }); },
    names: () => [...defs.keys()], def: name => defs.get(name),
    empty() { const o = {}; for (const n of defs.keys()) o[n] = []; return o; },
    sanitizeAll(raw) {
      const out = {}, ignored = []; const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      for (const [name, d] of defs) {
        const arr = Array.isArray(src[name]) ? src[name].slice(0, d.limit) : []; const seen = new Set(); out[name] = [];
        for (const it of arr) { let c = null; try { c = d.sanitize(it); } catch { c = null; } if (!c) continue; if (d.keyed) { if (!c.id || seen.has(c.id)) continue; seen.add(c.id); } out[name].push(c); }
      }
      for (const k of Object.keys(src)) if (!defs.has(k)) ignored.push(k);
      return { ext: out, ignored };
    },
    redactAll(ext) {
      const out = {};
      for (const [name, d] of defs) { const items = (ext && ext[name]) || []; out[name] = d.redact ? items.map(d.redact).filter(Boolean) : (d.share ? items : []); }
      return out;
    },
    mergeAll(local, incoming) {
      const out = {};
      for (const [name, d] of defs) {
        const a = (local && local[name]) || [], b = (incoming && incoming[name]) || [];
        if (d.mergeMode === 'ifEmpty') { out[name] = a.length ? a : b; continue; }
        const map = new Map(a.map(x => [x.id, x]));
        for (const x of b) { const cur = map.get(x.id); if (!cur || !cur.updatedAt || !x.updatedAt || x.updatedAt >= cur.updatedAt) map.set(x.id, x); }
        out[name] = [...map.values()].slice(0, d.limit);
      }
      return out;
    },
    counts(ext) { const o = {}; for (const n of defs.keys()) o[n] = ((ext && ext[n]) || []).length; return o; }
  };
})();

/* Kick off settings → language → first render as early as possible. */
EP.ready = (async () => { await EP.settings.ready; EP.i18n.init(); })();
