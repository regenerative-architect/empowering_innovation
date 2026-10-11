/* SECTION 1b · NETWORK TRANSPARENCY
   Purpose : the base app makes NO network requests. Optional features (internet rooms, local-model
             download) are the only code that may. All of them go through EP.net so that:
             (1) every connection is logged with its host and purpose (never room names, never content),
             (2) System check can show exactly which hosts this session contacted, and
             (3) the air-gapped ("strict") edition refuses all of it.
   Extend  : load a new optional dependency ONLY via EP.net.importModule(url, purpose); fetch via
             EP.net.fetch(url, purpose). Never call fetch / import / WebSocket directly in a feature.
   Outcome : "No hidden telemetry" is checkable by anyone with one click, not just a promise. */
(function () {
  'use strict';
  const U = EP.util;
  const log = []; let wsWatched = false;
  const hostOf = url => { try { const u = new URL(url, location.href); return u.host || u.protocol; } catch { return String(url).slice(0, 60); } };
  const record = (kind, url, purpose) => { log.push({ at: U.now(), kind, host: hostOf(url), purpose: String(purpose || '').slice(0, 90) }); if (log.length > 300) log.shift(); EP.emit('net:log'); };
  const guard = () => { if (EP.strict) throw new Error('Network features are disabled in the air-gapped edition.'); };
  EP.net = {
    log: () => log.slice(), record,
    async importModule(url, purpose) { guard(); record('module', url, purpose); return import(/* @vite-ignore */ url); },
    async fetch(url, purpose, opts) { guard(); record('fetch', url, purpose); return fetch(url, opts); },
    watchWebSockets() {
      if (wsWatched || EP.strict || !window.WebSocket) return; wsWatched = true; const Orig = window.WebSocket;
      function Watched(url, protocols) { try { record('websocket', String(url), 'peer-discovery relay'); } catch { /* logging must never block */ } return protocols === undefined ? new Orig(url) : new Orig(url, protocols); }
      Watched.prototype = Orig.prototype; for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Watched[k] = Orig[k]; window.WebSocket = Watched;
    },
    /* Everything the browser actually fetched from another host this page-load (scripts, fetches, workers). */
    observed() {
      const out = new Map();
      try { for (const e of performance.getEntriesByType('resource')) { let u; try { u = new URL(e.name); } catch { continue; } if (!/^https?:$/.test(u.protocol)) continue; if (u.host === location.host && location.host) continue; const k = u.host + '|' + e.initiatorType; out.set(k, (out.get(k) || 0) + 1); } } catch { /* optional API */ }
      return [...out.entries()].map(([k, n]) => { const [host, type] = k.split('|'); return { host, type, count: n }; });
    },
    get strict() { return EP.strict; }
  };
})();
