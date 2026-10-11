/* SECTION 0 · BOOT (runs in <head>, before first paint)
   Purpose : apply the user's saved theme, language and accessibility preferences from a tiny
             localStorage mirror so the page never flashes the wrong theme or text size.
   Extend  : add a key to EP_BOOT_KEYS in kernel (10-kernel.js) AND handle it here.
   Outcome : instant, flicker-free personalisation. The authoritative copy of every
             preference lives in IndexedDB; this mirror is only a cache. No network, no cookies. */
(function () {
  var r = document.documentElement;
  try {
    var b = JSON.parse(localStorage.getItem('ep4_boot') || '{}');
    var th = b.theme || 'auto';
    if (th === 'auto') th = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    r.setAttribute('data-theme', th);
    if (b.lang && b.lang !== 'auto') r.lang = b.lang;
    if (b.fontScale) r.style.setProperty('--font-scale', String(Math.min(1.6, Math.max(0.8, b.fontScale / 100))));
    if (b.motion && b.motion !== 'auto') r.setAttribute('data-motion', b.motion);
    if (b.contrast && b.contrast !== 'auto') r.setAttribute('data-contrast', b.contrast);
    if (b.dyslexia) r.setAttribute('data-dyslexia', '1');
    if (b.underline) r.setAttribute('data-underline', '1');
    if (b.lineHeight && b.lineHeight !== 'normal') r.setAttribute('data-lh', b.lineHeight);
    if (b.letterSpacing && b.letterSpacing !== 'normal') r.setAttribute('data-ls', b.letterSpacing);
  } catch (e) { /* storage blocked: defaults apply */ }
  r.classList.add('js');
})();
