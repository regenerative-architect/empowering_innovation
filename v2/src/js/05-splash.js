/* SECTION 0b · SPLASH CONTROLLER (self-contained, no dependencies)
   Purpose : run the animated launch screen and ALWAYS let the user through. v3 kept this logic in an
             external module that cannot load from file://, which left the overlay stuck; here it is
             inline, so a double-clicked index.html works.
   Extend  : add a splash step by adding a .splash-step element; timings live in DELAYS below.
   Outcome : (1) shows once per browser session by default (preference: always | session | never),
             (2) traps nothing: background content is `inert` only while the splash is visible,
             (3) Enter, Space, Escape or the 9-second timer all continue, (4) honours reduced motion. */
(function () {
  var splash = document.getElementById('launchSplash');
  if (!splash) return;
  var root = document.documentElement;
  var pref = 'session';
  try { pref = (JSON.parse(localStorage.getItem('ep4_boot') || '{}').splash) || 'session'; } catch (e) {}
  var seen = false;
  try { seen = sessionStorage.getItem('ep4-splash-seen') === '1'; } catch (e) {}
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || root.getAttribute('data-motion') === 'reduce';

  var others = [];
  function lock(on) {
    for (var i = 0; i < document.body.children.length; i++) {
      var el = document.body.children[i];
      if (el === splash || el.tagName === 'SCRIPT' || el.tagName === 'NOSCRIPT') continue;
      if (on) { if (!el.inert) { el.inert = true; others.push(el); } }
    }
    if (!on) { others.forEach(function (el) { el.inert = false; }); others = []; }
  }

  var done = false;
  function finish(reason) {
    if (done) return; done = true;
    var never = document.getElementById('splashNever');
    if (never && never.checked) {
      try { var b = JSON.parse(localStorage.getItem('ep4_boot') || '{}'); b.splash = 'never'; localStorage.setItem('ep4_boot', JSON.stringify(b)); } catch (e) {}
      window.dispatchEvent(new CustomEvent('ep:splash-pref', { detail: 'never' }));
    }
    try { sessionStorage.setItem('ep4-splash-seen', '1'); } catch (e) {}
    splash.setAttribute('aria-hidden', 'true');
    lock(false);
    window.dispatchEvent(new CustomEvent('empowerment:entered', { detail: { reason: reason } }));
    setTimeout(function () { splash.remove(); }, reduce ? 0 : 650);
    var main = document.getElementById('main');
    if (main) { main.setAttribute('tabindex', '-1'); try { main.focus({ preventScroll: true }); } catch (e) {} }
  }

  if (pref === 'never' || (pref === 'session' && seen)) {
    splash.remove();
    window.dispatchEvent(new CustomEvent('empowerment:entered', { detail: { reason: 'skipped-by-preference' } }));
    return;
  }

  lock(true);
  var DELAYS = reduce ? [0, 0, 0] : [500, 1500, 2700];
  Array.prototype.forEach.call(splash.querySelectorAll('.splash-step'), function (el, i) {
    setTimeout(function () { el.setAttribute('data-ready', 'true'); }, DELAYS[i] || 0);
  });
  var enter = document.getElementById('enterWorkspace');
  if (enter) { enter.addEventListener('click', function () { finish('button'); }); setTimeout(function () { try { enter.focus({ preventScroll: true }); } catch (e) {} }, 60); }
  splash.addEventListener('keydown', function (e) { if (e.key === 'Escape') finish('escape'); });
  /* Never trap: generous auto-continue (WCAG: no content is lost, everything remains available below). */
  setTimeout(function () { finish('timer'); }, reduce ? 3500 : 9000);
})();
