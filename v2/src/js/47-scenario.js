/* SECTION 10 · MODEL LAB UPGRADE: COST-EFFECTIVENESS + SEEDED MONTE CARLO
   Purpose : v3 offered one-factor sensitivity. v4 adds (1) a fifth model, discounted cost per verified
             outcome, and (2) a Monte Carlo view that lets you give every input a low / base / high range,
             draws thousands of seeded scenarios through the SAME transparent arithmetic, and shows
             percentiles, a histogram and a tornado chart of which inputs matter most.
   Honesty : a Monte Carlo spread shows how YOUR stated input uncertainty propagates through this
             arithmetic. It is not a forecast and not the probability of real-world outcomes. Triangular
             distributions between your low and high values are an assumption. Rejected draws (inputs that
             break a model rule) are counted and reported, never hidden.
   Extend  : add a model to MODELS (fields + fn) and it appears here automatically.
   Outcome : reproducible ranges (same seed → same result), saved runs you can print or cite. */
(function () {
  'use strict';
  const U = EP.util, S = EP.sanitize, $ = U.$, t = (k, v) => EP.t(k, v);
  const L = (en, es, fr) => [en, es, fr];

  EP.i18n.register({
    'sim.title': L('Transparent scenario models', 'Modelos de escenario transparentes', 'Modèles de scénarios transparents'),
    'mc.title': L('Monte Carlo range (seeded)', 'Rango Monte Carlo (con semilla)', 'Plage Monte Carlo (graine fixe)'), 'mc.intro': L('Give each input a plausible low and high. The lab draws many scenarios between them (triangular, peaking at your base value) and passes each through the model above.', 'Dé a cada insumo un mínimo y un máximo plausibles. El laboratorio genera muchos escenarios entre ellos (triangular, con pico en su valor base) y los pasa por el modelo de arriba.', 'Donnez à chaque entrée un minimum et un maximum plausibles. Le laboratoire tire de nombreux scénarios entre eux (triangulaire, avec un pic à votre valeur de base) et les fait passer dans le modèle ci-dessus.'),
    'mc.input': L('Input', 'Insumo', 'Entrée'), 'mc.low': L('Low', 'Mínimo', 'Min.'), 'mc.base': L('Base', 'Base', 'Base'), 'mc.high': L('High', 'Máximo', 'Max.'), 'mc.draws': L('Draws', 'Simulaciones', 'Tirages'), 'mc.seed': L('Seed', 'Semilla', 'Graine'), 'mc.newSeed': L('New seed', 'Nueva semilla', 'Nouvelle graine'),
    'mc.reset': L('Reset ranges from the ± sensitivity slider', 'Restablecer rangos con el control ± de sensibilidad', 'Réinitialiser les plages avec le curseur ± de sensibilité'), 'mc.run': L('Run Monte Carlo', 'Ejecutar Monte Carlo', 'Lancer Monte Carlo'), 'mc.save': L('Save this run', 'Guardar esta ejecución', 'Enregistrer cette exécution'), 'mc.saved': L('Run saved.', 'Ejecución guardada.', 'Exécution enregistrée.'),
    'mc.pct': L('Percentiles', 'Percentiles', 'Percentiles'), 'mc.mean': L('Mean', 'Media', 'Moyenne'), 'mc.rejected': L('{r} of {n} draws were rejected because they broke a model rule (shown for transparency).', '{r} de {n} simulaciones se rechazaron por violar una regla del modelo (se muestra por transparencia).', '{r} tirages sur {n} ont été rejetés car ils violaient une règle du modèle (affiché par transparence).'),
    'mc.hist': L('Distribution of results', 'Distribución de resultados', 'Distribution des résultats'), 'mc.tornado': L('Which inputs matter most (swing from low to high, others at base)', 'Qué insumos importan más (variación de mínimo a máximo, los demás en base)', 'Quelles entrées comptent le plus (variation min. → max., les autres à la base)'),
    'mc.caveat': L('Not a forecast. Shows how your stated input ranges propagate through this arithmetic. Triangular distributions are an assumption; correlations between inputs are ignored.', 'No es un pronóstico. Muestra cómo se propagan sus rangos por esta aritmética. Las distribuciones triangulares son un supuesto; se ignoran las correlaciones entre insumos.', 'Pas une prévision. Montre comment vos plages d’entrée se propagent dans cette arithmétique. Les lois triangulaires sont une hypothèse ; les corrélations entre entrées sont ignorées.'),
    'mc.err': L('Cannot run: {m}', 'No se puede ejecutar: {m}', 'Impossible de lancer : {m}'), 'mc.runs': L('Saved runs', 'Ejecuciones guardadas', 'Exécutions enregistrées'), 'mc.copy': L('Copy summary', 'Copiar resumen', 'Copier le résumé'), 'mc.none': L('No saved runs yet.', 'Aún no hay ejecuciones guardadas.', 'Aucune exécution enregistrée.'),
    'mc.sum': L('{model}: median {p50} {unit}; 80% of draws between {p10} and {p90} (seed {seed}, {n} draws, {r} rejected). Not a forecast.', '{model}: mediana {p50} {unit}; 80% de las simulaciones entre {p10} y {p90} (semilla {seed}, {n} simulaciones, {r} rechazadas). No es un pronóstico.', '{model} : médiane {p50} {unit} ; 80 % des tirages entre {p10} et {p90} (graine {seed}, {n} tirages, {r} rejetés). Pas une prévision.')
  });

  EP.ext.define('scenarios', { limit: 80, sanitize(x) {
    const id = S.id(x.id); if (!id) return null; const ranges = (Array.isArray(x.ranges) ? x.ranges : []).slice(0, 10).map(r => ({ id: S.line(r && r.id, 40), low: S.num(r && r.low), base: S.num(r && r.base), high: S.num(r && r.high) })); const p = x.p || {};
    return { id, createdAt: S.iso(x.createdAt), updatedAt: S.iso(x.updatedAt), model: S.line(x.model, 30), unit: S.line(x.unit, 120), seed: S.num(x.seed, { min: 0, max: 4294967295, int: true }), n: S.num(x.n, { min: 100, max: 100000, int: true, fallback: 5000 }), rejected: S.num(x.rejected, { min: 0, max: 100000, int: true }), ranges, p: { p5: S.num(p.p5), p10: S.num(p.p10), p50: S.num(p.p50), p90: S.num(p.p90), p95: S.num(p.p95), mean: S.num(p.mean) } };
  } });

  /* MODEL EXTENSION (runs before the core initialises, so the selector can use it) -------------------- */
  EP.module('scenario-models', () => {
    const M = EP.core.MODELS, fmt = EP.core.fmt;
    M.costeff = { fields: [['capex', 'Up-front cost', 'currency', 50000, 0, 1e10], ['opex', 'Running cost per year', 'currency per year', 12000, 0, 1e10], ['years', 'Evaluation horizon', 'whole years', 5, 1, 50], ['rate', 'Discount rate', 'fraction per year, e.g. 0.03', 0.03, 0, 0.5], ['outcomes', 'Verified outcomes per year', 'count per year', 400, 0.001, 1e9]], key: 'opex',
      explain: 'Outcomes must be verified, countable results (for example children reached, households connected). Compare alternatives with the same horizon, discount rate and outcome definition. Equity, who bears the cost, and non-monetary effects are not captured.',
      fn: v => { const yrs = Math.round(v.years); let pvCost = v.capex, pvOut = 0; for (let y = 1; y <= yrs; y++) { const d = Math.pow(1 + v.rate, y); pvCost += v.opex / d; pvOut += v.outcomes / d; } if (!(pvOut > 0)) throw new Error('Outcomes must be above zero'); return { value: pvCost / pvOut, unit: 'currency per verified outcome (discounted)', formula: 'PV(costs) = capex + Σ opex/(1+r)^t;  PV(outcomes) = Σ outcomes/(1+r)^t;  ratio = PV(costs) / PV(outcomes)', extra: 'Present value of costs: ' + fmt(pvCost) + '; present value of outcomes: ' + fmt(pvOut) + ' over ' + yrs + ' years. Lower is better only if the outcome is the same kind of result in every option.' }; } };
    const sel = $('modelType'); if (sel && !sel.querySelector('option[value="costeff"]')) sel.append(U.el('option', { value: 'costeff', text: 'Cost per verified outcome (discounted)' }));
  }, { order: 3 });

  /* MONTE CARLO PANEL ------------------------------------------------------------------------------------- */
  let seed = 20260929, last = null; const ranges = {};
  const baseVals = m => Object.fromEntries(m.fields.map(f => [f[0], Number($('model_' + f[0])?.value)]));
  function defaultRanges(name) {
    const m = EP.core.MODELS[name], s = Number($('sensitivity')?.value || 20) / 100, v = baseVals(m); ranges[name] = {};
    for (const [id, , , , min, max] of m.fields) { const b = Number.isFinite(v[id]) ? v[id] : 0; ranges[name][id] = { low: Math.max(min, b * (1 - s)), high: Math.min(max, b * (1 + s)) }; }
  }
  function run(name, n, sd) {
    const m = EP.core.MODELS[name], v = baseVals(m); for (const f of m.fields) if (!Number.isFinite(v[f[0]])) throw new Error(f[1]);
    const R = ranges[name]; const lo = {}, hi = {}; for (const [id] of m.fields) { lo[id] = Math.min(R[id].low, v[id]); hi[id] = Math.max(R[id].high, v[id]); }
    const baseRes = m.fn(v); const rnd = U.seeded(sd); const out = []; let rejected = 0;
    for (let i = 0; i < n; i++) { const d = {}; for (const [id, , , , min, max] of m.fields) d[id] = Math.min(max, Math.max(min, EP.stats.triangular(rnd, lo[id], v[id], hi[id]))); try { const r = m.fn(d); if (Number.isFinite(r.value)) out.push(r.value); else rejected++; } catch { rejected++; } }
    out.sort((a, b) => a - b); if (!out.length) throw new Error('every draw broke a model rule; widen or recheck the ranges');
    const q = p => EP.stats.quantile(out, p); const tornado = [];
    for (const [id, label] of m.fields) { try { const a = m.fn({ ...v, [id]: lo[id] }).value, b = m.fn({ ...v, [id]: hi[id] }).value; tornado.push({ id, label, a, b, swing: Math.abs(b - a) }); } catch { /* range breaks a rule: skip bar */ } }
    tornado.sort((x, y) => y.swing - x.swing);
    return { model: name, unit: baseRes.unit, base: baseRes.value, n, seed: sd, rejected, sorted: out, p: { p5: q(.05), p10: q(.1), p50: q(.5), p90: q(.9), p95: q(.95), mean: EP.stats.mean(out) }, tornado, ranges: m.fields.map(f => ({ id: f[0], low: lo[f[0]], base: v[f[0]], high: hi[f[0]] })) };
  }
  function histSvg(r) {
    const W = 560, H = 190, mL = 10, mB = 28, bins = 30, min = r.sorted[0], max = r.sorted[r.sorted.length - 1], span = max - min || 1, cnt = new Array(bins).fill(0);
    for (const v of r.sorted) cnt[Math.min(bins - 1, Math.floor((v - min) / span * bins))]++; const peak = Math.max(...cnt) || 1, bw = (W - mL * 2) / bins;
    const svg = U.svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': t('mc.hist') + ': P10 ' + EP.fmt.number(r.p.p10, { maximumFractionDigits: 2 }) + ', P50 ' + EP.fmt.number(r.p.p50, { maximumFractionDigits: 2 }) + ', P90 ' + EP.fmt.number(r.p.p90, { maximumFractionDigits: 2 }) });
    cnt.forEach((c, i) => svg.append(U.svg('rect', { x: mL + i * bw + 1, y: H - mB - (H - mB - 14) * c / peak, width: Math.max(1, bw - 2), height: (H - mB - 14) * c / peak, rx: 2, fill: 'var(--accent2)', opacity: .8 })));
    const X = v => mL + (v - min) / span * (W - mL * 2); for (const [k, v, col] of [['P10', r.p.p10, 'var(--warning)'], ['P50', r.p.p50, 'var(--accent)'], ['P90', r.p.p90, 'var(--warning)']]) svg.append(U.svg('line', { x1: X(v), x2: X(v), y1: 8, y2: H - mB, stroke: col, 'stroke-width': 2, 'stroke-dasharray': k === 'P50' ? null : '4 3' }), U.svg('text', { x: X(v), y: H - 12, 'text-anchor': 'middle' }, k));
    svg.append(U.svg('line', { class: 'axis', x1: mL, x2: W - mL, y1: H - mB, y2: H - mB }), U.svg('text', { x: mL, y: H - 1 }, EP.fmt.number(min, { maximumSignificantDigits: 4 })), U.svg('text', { x: W - mL, y: H - 1, 'text-anchor': 'end' }, EP.fmt.number(max, { maximumSignificantDigits: 4 }))); return svg;
  }
  function tornadoSvg(r) {
    const rows = r.tornado.slice(0, 6), W = 560, rowH = 30, H = rows.length * rowH + 24; const lo = Math.min(r.base, ...rows.map(x => Math.min(x.a, x.b))), hi = Math.max(r.base, ...rows.map(x => Math.max(x.a, x.b))), span = hi - lo || 1; const X = v => 205 + (v - lo) / span * (W - 225);
    const svg = U.svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': t('mc.tornado') });
    rows.forEach((x, i) => { const y = 10 + i * rowH; svg.append(U.svg('text', { x: 198, y: y + 15, 'text-anchor': 'end' }, x.label.length > 30 ? x.label.slice(0, 29) + '…' : x.label), U.svg('rect', { x: X(Math.min(x.a, x.b)), y: y + 3, width: Math.max(2, Math.abs(X(x.b) - X(x.a))), height: 18, rx: 4, fill: 'var(--accent2)', opacity: .85 })); });
    svg.append(U.svg('line', { x1: X(r.base), x2: X(r.base), y1: 4, y2: H - 10, stroke: 'var(--accent)', 'stroke-width': 2 }), U.svg('text', { x: X(r.base), y: H - 1, 'text-anchor': 'middle' }, EP.fmt.number(r.base, { maximumSignificantDigits: 4 }))); return svg;
  }
  const summary = r => t('mc.sum', { model: ({ food: 'Food yield', energy: 'Backup electricity', repair: 'Repair vs replace', ecology: 'Tree survival', costeff: 'Cost per outcome' })[r.model] || r.model, p50: EP.fmt.number(r.p.p50, { maximumSignificantDigits: 4 }), unit: r.unit, p10: EP.fmt.number(r.p.p10, { maximumSignificantDigits: 4 }), p90: EP.fmt.number(r.p.p90, { maximumSignificantDigits: 4 }), seed: r.seed, n: EP.fmt.number(r.n), r: r.rejected });

  function renderPanel() {
    const host = $('mcPanel'); if (!host) return; const name = $('modelType').value, m = EP.core.MODELS[name]; if (!m) return; if (!ranges[name]) defaultRanges(name);
    const nSel = U.el('select', { id: 'mcN' }, [1000, 5000, 20000].map(v => U.el('option', { value: v, text: EP.fmt.number(v) }))); nSel.value = '5000';
    const seedIn = U.el('input', { type: 'number', id: 'mcSeed', min: 0, max: 4294967295, step: 1, value: seed }); seedIn.addEventListener('change', () => { seed = S.num(seedIn.value, { min: 0, max: 4294967295, int: true, fallback: seed }); });
    const out = U.el('div', { 'aria-live': 'polite' });
    const rangeInput = (id, label, k) => U.el('input', { type: 'number', step: 'any', value: Number(ranges[name][id][k].toPrecision(6)), 'aria-label': label + ' ' + t('mc.' + k), oninput: e => { const val = Number(e.target.value); if (Number.isFinite(val)) ranges[name][id][k] = val; } });
    const table = U.el('table', { class: 'tbl' },
      U.el('thead', {}, U.el('tr', {}, [t('mc.input'), t('mc.low'), t('mc.base'), t('mc.high')].map(h => U.el('th', { text: h })))),
      U.el('tbody', {}, m.fields.map(([id, label, unit]) => { const base = Number($('model_' + id)?.value); return U.el('tr', {}, U.el('td', { text: label + ' (' + unit + ')' }), U.el('td', {}, rangeInput(id, label, 'low')), U.el('td', { class: 'num', text: Number.isFinite(base) ? EP.fmt.number(base, { maximumSignificantDigits: 6 }) : '—' }), U.el('td', {}, rangeInput(id, label, 'high'))); })));
    const go = () => {
      try { const r = run(name, Number(nSel.value), seed); last = r; draw(r); EP.analytics.record('montecarlo', { model: name }); }
      catch (e) { last = null; out.replaceChildren(U.el('div', { class: 'callout warn', text: t('mc.err', { m: e.message }) })); }
    };
    const draw = r => {
      const f = v => EP.fmt.number(v, { maximumSignificantDigits: 4 });
      out.replaceChildren(...U.nn(U.el('div', { class: 'callout' }, U.el('p', {}, U.el('strong', { text: summary(r) }))), r.rejected ? U.el('p', { class: 'small', text: t('mc.rejected', { r: EP.fmt.number(r.rejected), n: EP.fmt.number(r.n) }) }) : null,
        U.el('div', { class: 'tool-grid two' }, U.el('div', {}, U.el('h4', { text: t('mc.hist') }), histSvg(r), U.el('div', { class: 'table-scroll' }, U.el('table', { class: 'tbl' }, U.el('thead', {}, U.el('tr', {}, ['P5', 'P10', 'P50', 'P90', 'P95', t('mc.mean')].map(h => U.el('th', { text: h })))), U.el('tbody', {}, U.el('tr', {}, [r.p.p5, r.p.p10, r.p.p50, r.p.p90, r.p.p95, r.p.mean].map(v => U.el('td', { class: 'num', text: f(v) }))))))), U.el('div', {}, U.el('h4', { text: t('mc.tornado') }), tornadoSvg(r))),
        U.el('p', { class: 'small', text: t('mc.caveat') }), U.el('div', { class: 'row-actions' }, EP.F.btn(t('mc.save'), () => { try { EP.coll('scenarios').save({ model: r.model, unit: r.unit, seed: r.seed, n: r.n, rejected: r.rejected, ranges: r.ranges, p: r.p }); EP.emit('activity', { type: 'scenario' }); EP.ui.toast(t('mc.saved')); renderPanel(); draw(r); } catch (e) { if (e.message !== 'limit') EP.ui.toast(e.message); } }, 'primary'), EP.F.btn(t('mc.copy'), () => EP.ui.copy(summary(r))), EP.F.btn(t('f.print'), () => { const node = U.el('article', { class: 'brief-sheet' }, U.el('h3', { text: t('mc.title') }), U.el('p', { text: summary(r) }), histSvg(r), tornadoSvg(r), U.el('p', { style: 'font-size:.85rem', text: t('mc.caveat') })); EP.ui.printSheet(node, t('mc.title')); }))));
    };
    const saved = EP.coll('scenarios').all().slice().reverse();
    const list = U.el('div', { class: 'tool-list' }, saved.length ? saved.map(s => U.el('div', { class: 'tool-item' }, U.el('strong', { text: EP.fmt.dateTime(s.createdAt) }), EP.F.exampleTag(s), U.el('div', { class: 'meta', text: summary({ ...s, model: s.model }) }), U.el('div', { class: 'row-actions' }, EP.F.btn(t('f.remove'), async () => { await EP.coll('scenarios').remove(s.id); renderPanel(); }, 'danger')))) : [U.el('p', { class: 'small', text: t('mc.none') })]);
    host.replaceChildren(U.el('h3', { text: t('mc.title') }), U.el('p', { class: 'small', text: t('mc.intro') }), U.el('div', { class: 'table-scroll' }, table), U.el('div', { class: 'field-grid' }, U.el('div', { class: 'field' }, U.el('label', { for: 'mcN', text: t('mc.draws') }), nSel), U.el('div', { class: 'field' }, U.el('label', { for: 'mcSeed', text: t('mc.seed') }), seedIn)), U.el('div', { class: 'row-actions' }, EP.F.btn(t('mc.run'), go, 'primary'), EP.F.btn(t('mc.newSeed'), () => { seed = Math.floor(Math.random() * 4294967295); seedIn.value = seed; }), EP.F.btn(t('mc.reset'), () => { defaultRanges(name); renderPanel(); })), out, U.el('h4', { text: t('mc.runs') }), list);
  }

  EP.module('scenario-mc', () => {
    $('modelType')?.addEventListener('change', () => { delete ranges[$('modelType').value]; setTimeout(renderPanel, 0); });
    $('sensitivity')?.addEventListener('change', () => { const n = $('modelType').value; defaultRanges(n); renderPanel(); });
    $('modelReset')?.addEventListener('click', () => setTimeout(() => { delete ranges[$('modelType').value]; renderPanel(); }, 0));
    for (const ev of ['lang', 'state:loaded', 'state:reloaded']) EP.on(ev, () => renderPanel()); EP.on('ext:change', e => { if (e && e.name === 'scenarios') renderPanel(); });
    renderPanel();
  }, { order: 45 });
  EP.search.register('scenarios', () => EP.coll('scenarios').all().map(s => ({ id: 'sc:' + s.id, kind: 'toc.simulator', title: summary(s).slice(0, 90), text: summary(s), go: { sel: '#mcPanel' } })));
})();
