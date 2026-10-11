/* SECTION 17 · BOOTSTRAP
   Purpose : start everything in a defined order with fault isolation, and wire the few document-wide
             behaviours that belong to no single module (link handling, guide buttons, hash changes).
   Order   : settings + language (kernel) → module 'scenario-models' (adds the cost model before the core
             renders selects) → 'core' (v3 engines + workspace load) → nav, data, search, HUD, tools, …
   Extend  : register new features with EP.module(name, init, {order}); never start work at script load.
   Outcome : one failing module is logged and skipped; the page, your data and every other tool keep working. */
(function () {
  'use strict';
  const U = EP.util;

  /* The v3 core is started as a module so the others can rely on loaded state. */
  EP.module('core', async () => {
    const loaded = new Promise(res => { const off = EP.on('state:loaded', () => { off(); res(); }); });
    EP.core.init();
    await Promise.race([loaded, U.sleep(6000)]);
  }, { order: 5 });

  const domReady = new Promise(res => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', res, { once: true }); else res(); });

  /* Delegated link handling: tool links open the right tab; in-page anchors open collapsed parents. */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a'); if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    if (a.dataset.tool) { e.preventDefault(); EP.tools.open(a.dataset.tool); return; }
    const h = a.getAttribute('href'); if (!h || h.length < 2 || h[0] !== '#') return;
    let target = null; try { target = document.getElementById(decodeURIComponent(h.slice(1))); } catch { target = null; }
    if (target) { e.preventDefault(); EP.nav.reveal(target); }
  });
  window.addEventListener('hashchange', () => { let t = null; try { t = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { t = null; } if (t) EP.nav.reveal(t, { hash: false }); });

  EP.module('guide', () => {
    const q = id => U.$(id);
    q('guideExpand')?.addEventListener('click', () => U.qsa('#guide details.chapter').forEach(d => d.open = true));
    q('guideCollapse')?.addEventListener('click', () => U.qsa('#guide details.chapter').forEach(d => d.open = false));
    q('guidePrint')?.addEventListener('click', () => { const clone = q('guide').cloneNode(true); clone.querySelectorAll('.px-band,.toolbar,button,.note-btn,.listen-btn,[id^="bn-"]').forEach(n => n.remove()); clone.querySelectorAll('details').forEach(d => d.open = true); EP.analytics.record('print', { scope: 'guide' }); EP.ui.printSheet(clone, EP.t('guide.title')); });
  }, { order: 31 });

  EP.module('final-i18n', () => { EP.i18n.apply(document); EP.on('lang', () => EP.i18n.apply(document)); }, { order: 99 });

  (async function start() {
    try { await EP.ready; await domReady; await EP.runModules(); document.documentElement.setAttribute('data-ready', '1'); }
    catch (e) { try { EP.log.error('start', e); } catch { /* nothing else to do */ } document.documentElement.setAttribute('data-ready', 'failed'); }
  })();
})();
