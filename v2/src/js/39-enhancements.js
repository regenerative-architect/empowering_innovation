/* SECTION 6b · ENHANCEMENTS PORTED FROM v3 (NO FETCH, NO AUTO-REGISTRATION)
   Purpose : v3 loaded domain briefs and source metadata with fetch('./data/*.json'), which fails when the page is
             opened from a file and needs a network-capable origin. v4 embeds that data at build time (see
             tools/build.py: __EP_EMBEDDED_DATA__) and renders it with DOM calls, never innerHTML. v3 also
             registered a service worker automatically; v4 reports status only and registers on request
             (Data & privacy → Install & offline cache).
   Extend  : add records to src/data/*.json and rebuild; or edit the renderers below.
   Outcome : the same content, working offline from a double-clicked file, with no hidden registration. */
(function () {
  'use strict';
  const U = EP.util, S = EP.sanitize, $ = U.$, t = (k, v) => EP.t(k, v);
  const EMBEDDED = __EP_EMBEDDED_DATA__;

  EP.i18n.register({
    'pwa.s.strict': ['Air-gapped edition: no service worker and no network code are included.', 'Edición aislada: no incluye service worker ni código de red.', 'Édition isolée : ni service worker ni code réseau ne sont inclus.'],
    'pwa.s.file': ['Opened from a file: everything already works offline. Install and cache need a hosted copy over HTTPS or localhost (Data & privacy).', 'Abierto desde un archivo: todo ya funciona sin conexión. La instalación y la caché requieren una copia alojada en HTTPS o localhost (Datos y privacidad).', 'Ouvert depuis un fichier : tout fonctionne déjà hors ligne. L’installation et le cache exigent une copie hébergée en HTTPS ou sur localhost (Données et confidentialité).'],
    'pwa.s.active': ['Offline cache is active for this hosted copy.', 'La caché sin conexión está activa para esta copia alojada.', 'Le cache hors ligne est actif pour cette copie hébergée.'],
    'pwa.s.off': ['Hosted copy: offline cache is not enabled. It is opt-in under Data & privacy.', 'Copia alojada: la caché sin conexión no está activada. Es opcional en Datos y privacidad.', 'Copie hébergée : le cache hors ligne n’est pas activé. Il est facultatif dans Données et confidentialité.'],
    'pwa.s.none': ['Service workers are unavailable in this browser. Core local tools still work.', 'Los service workers no están disponibles en este navegador. Las herramientas locales siguen funcionando.', 'Les service workers sont indisponibles dans ce navigateur. Les outils locaux fonctionnent toujours.'],
    'src.snapshot': ['snapshot', 'instantánea', 'instantané'], 'br.method': ['Method', 'Método', 'Méthode'], 'br.collab': ['Collaborators', 'Colaboradores', 'Collaborateurs'], 'br.fail': ['Falsification / failure signal', 'Señal de falsación / fallo', 'Signal de falsification / d’échec']
  });

  function renderDomainBriefs() {
    const target = $('domainBriefGrid'); if (!target) return; const data = EMBEDDED.briefs;
    if (!data || !Array.isArray(data.domains)) return;
    target.replaceChildren(...data.domains.slice(0, 20).map(d => U.el('article', {},
      U.el('h3', { text: S.line(d.name, 80) }),
      U.el('p', {}, U.el('strong', { text: t('br.method') + ': ' }), S.text(d.method, 500)),
      U.el('p', {}, U.el('strong', { text: t('br.collab') + ': ' }), (d.collaborators || []).map(c => S.line(c, 60)).join(' · ')),
      U.el('p', { class: 'small' }, U.el('strong', { text: t('br.fail') + ': ' }), S.text(d.failure_test, 400)))));
  }
  function renderSources() {
    const target = $('advancedSources'); if (!target) return; const data = EMBEDDED.sources; if (!data || !Array.isArray(data.sources)) return;
    target.replaceChildren(...data.sources.slice(0, 40).map(s => { const url = S.url(s.url); const h = U.el('h3', {}, url ? U.el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: S.line(s.title, 120) }) : S.line(s.title, 120)); return U.el('article', { class: 'evidence-card' }, h, U.el('p', { text: S.text(s.notes, 400) }), U.el('small', { text: S.line(s.publisher, 80) + ' · ' + t('src.snapshot') + ' ' + S.line(data.snapshot_date, 12) })); }));
  }

  /* Tooltips for any element carrying data-tooltip (hover, focus; Esc closes). Kept from v3, hardened. */
  function setupTooltips() {
    const tip = U.el('div', { class: 'tooltip-box', id: 'globalTooltip', role: 'tooltip' }); document.body.append(tip); let active = null;
    const close = () => { tip.dataset.open = 'false'; if (active) active.removeAttribute('aria-describedby'); active = null; };
    const open = el => { const text = el.getAttribute('data-tooltip'); if (!text) return; active = el; tip.textContent = text; tip.dataset.open = 'true'; el.setAttribute('aria-describedby', 'globalTooltip'); const r = el.getBoundingClientRect(), pad = 10; tip.style.top = Math.max(pad, Math.min(window.innerHeight - tip.offsetHeight - pad, r.bottom + 8)) + 'px'; tip.style.left = Math.max(pad, Math.min(window.innerWidth - tip.offsetWidth - pad, r.left - 40)) + 'px'; };
    document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tooltip]'); if (el) open(el); });
    document.addEventListener('pointerout', e => { if (e.target.closest && e.target.closest('[data-tooltip]')) close(); });
    document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tooltip]'); if (el) open(el); });
    document.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('[data-tooltip]')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
  async function pwaStatus() {
    const out = $('pwaStatus'); if (!out) return; let key = 'pwa.s.none';
    if (EP.strict) key = 'pwa.s.strict'; else if (location.protocol === 'file:') key = 'pwa.s.file'; else if ('serviceWorker' in navigator) { try { const regs = await navigator.serviceWorker.getRegistrations(); key = regs.length ? 'pwa.s.active' : 'pwa.s.off'; } catch { key = 'pwa.s.off'; } }
    out.textContent = t(key);
  }

  EP.module('enhancements', () => { renderDomainBriefs(); renderSources(); setupTooltips(); pwaStatus(); EP.on('lang', () => { renderDomainBriefs(); renderSources(); pwaStatus(); }); }, { order: 32 });
})();
