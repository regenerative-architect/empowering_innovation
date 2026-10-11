/* SECTION 8 · DECISION TOOLKIT: FRAMEWORK, BRIEF STUDIO, DECISION MATRIX
   Purpose : decision-grade tools for policy makers, corporate decision makers, teachers and students.
             Every tool stores plain, sanitised records in `state.ext.<name>`, so backup, import, restore
             points, search and the HUD work for free.
   Extend  : EP.ext.define('myTool', {limit, sanitize, share?, redact?});  EP.tools.register({id, title, render});
             use EP.F field helpers; call EP.coll('myTool').save(item); emit EP.emit('activity',{type}).
   Honesty : outputs state their limits. Nothing here ranks or scores PEOPLE. Matrices aid deliberation;
             they do not decide. Sample-size and Monte Carlo helpers are exported on EP.stats / EP.mcda
             and covered by System-check self-tests.
   Outcome : print-ready, reproducible documents that show trade-offs, uncertainty and who is affected. */
(function () {
  'use strict';
  const U = EP.util, S = EP.sanitize, t = (k, v) => EP.t(k, v);
  const L = (en, es, fr) => [en, es, fr];

  /* SHARED STRINGS ------------------------------------------------------------------------------------ */
  EP.i18n.register({
    'tk.eyebrow': L('DECISION TOOLKIT', 'KIT DE DECISIÓN', 'BOÎTE À OUTILS DÉCISIONNELLE'), 'tk.title': L('From evidence to an accountable decision', 'De la evidencia a una decisión responsable', 'Des preuves à une décision responsable'),
    'tk.lede': L('Seven tools that keep trade-offs, uncertainty and the people affected in view. Records stay in this browser and are included in your backups.', 'Siete herramientas que mantienen a la vista los equilibrios, la incertidumbre y las personas afectadas. Los registros permanecen en este navegador y se incluyen en sus copias.', 'Sept outils qui gardent en vue les compromis, l’incertitude et les personnes concernées. Les enregistrements restent dans ce navigateur et figurent dans vos sauvegardes.'),
    'tool.brief': L('Brief studio', 'Estudio de resúmenes', 'Atelier de notes'), 'tool.decision': L('Decision matrix', 'Matriz de decisión', 'Matrice de décision'), 'tool.pilot': L('Pilot designer', 'Diseñador de pilotos', 'Concepteur de pilotes'), 'tool.stakeholders': L('Stakeholders', 'Partes interesadas', 'Parties prenantes'),
    'tool.risk': L('Risks & anti-inversion', 'Riesgos y anti-inversión', 'Risques et anti-inversion'), 'tool.logic': L('Logic model', 'Modelo lógico', 'Modèle logique'), 'tool.kits': L('Class kits', 'Kits de clase', 'Kits de classe'), 'tool.passport': L('Passport', 'Pasaporte', 'Passeport'),
    'f.title': L('Title', 'Título', 'Titre'), 'f.new': L('New', 'Nuevo', 'Nouveau'), 'f.saved': L('Saved', 'Guardado', 'Enregistré'), 'f.savedList': L('Saved items', 'Elementos guardados', 'Éléments enregistrés'), 'f.pick': L('— choose —', '— elegir —', '— choisir —'),
    'f.limit': L('Limit reached for this tool. Delete something or export first.', 'Límite alcanzado para esta herramienta. Elimine algo o exporte primero.', 'Limite atteinte pour cet outil. Supprimez ou exportez d’abord.'), 'f.deleteConfirm': L('Delete this item permanently from this browser? A restore point is kept for a while.', '¿Eliminar este elemento de este navegador? Se conserva un punto de restauración un tiempo.', 'Supprimer cet élément de ce navigateur ? Un point de restauration est conservé un temps.'),
    'f.notes': L('Notes', 'Notas', 'Notes'), 'f.name': L('Name', 'Nombre', 'Nom'), 'f.add': L('Add', 'Añadir', 'Ajouter'), 'f.remove': L('Remove', 'Quitar', 'Retirer'), 'f.print': L('Print', 'Imprimir', 'Imprimer'), 'f.copy': L('Copy as Markdown', 'Copiar como Markdown', 'Copier en Markdown'), 'f.dlmd': L('Download .md', 'Descargar .md', 'Télécharger .md'), 'f.dlhtml': L('Download .html', 'Descargar .html', 'Télécharger .html'),
    'f.example': L('Example', 'Ejemplo', 'Exemple'), 'f.disclaimer': L('Draft for deliberation. Not legal, medical, financial or engineering advice.', 'Borrador para deliberación. No es asesoría legal, médica, financiera ni de ingeniería.', 'Ébauche pour délibération. Ne constitue pas un avis juridique, médical, financier ou d’ingénierie.'),
    'f.noPersonal': L('Looks like personal contact information. Use a role or group instead.', 'Parece información de contacto personal. Use un rol o grupo.', 'Cela ressemble à des coordonnées personnelles. Utilisez plutôt un rôle ou un groupe.')
  });

  /* STATISTICS (exported for tests) -------------------------------------------------------------------- */
  const erf = x => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const tt = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * tt - 1.453152027) * tt) + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-x * x); return s * y; };
  const phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
  const zinv = p => { if (!(p > 0 && p < 1)) throw new Error('p must be between 0 and 1'); let lo = -9, hi = 9; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (phi(mid) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  EP.stats = {
    phi, zinv,
    nTwoProp(p1, p2, alpha = 0.05, power = 0.8) { const za = zinv(1 - alpha / 2), zb = zinv(power), pb = (p1 + p2) / 2; return Math.ceil(Math.pow(za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(p1 - p2, 2)); },
    nTwoMean(delta, sd, alpha = 0.05, power = 0.8) { const za = zinv(1 - alpha / 2), zb = zinv(power); return Math.ceil(2 * Math.pow((za + zb) * sd / delta, 2)); },
    nSurvey(margin, p = 0.5, conf = 0.95, pop = 0) { const z = zinv(1 - (1 - conf) / 2); let n = z * z * p * (1 - p) / (margin * margin); if (pop > 0) n = n / (1 + (n - 1) / pop); return Math.ceil(n); },
    deff: (m, icc) => 1 + (m - 1) * icc,
    mean: a => a.reduce((x, y) => x + y, 0) / (a.length || 1),
    quantile(sorted, q) { if (!sorted.length) return NaN; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); },
    normal(rnd) { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    triangular(rnd, a, c, b) { if (b <= a) return a; const u = rnd(), f = (c - a) / (b - a); return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c)); }
  };

  /* COLLECTION HELPER ------------------------------------------------------------------------------------ */
  EP.coll = name => {
    const all = () => { const s = EP.core.state; if (!s.ext) s.ext = {}; return (s.ext[name] ||= []); };
    return {
      all, get: id => all().find(x => x.id === id),
      save(item) {
        const d = EP.ext.def(name); const now = U.now();
        const clean = d.sanitize({ ...item, id: item.id || U.uid(), createdAt: item.createdAt || now, updatedAt: now }); if (!clean) throw new Error('Invalid record');
        const arr = all(), i = arr.findIndex(x => x.id === clean.id);
        if (i >= 0) arr[i] = clean; else { if (arr.length >= d.limit) { EP.ui.toast(t('f.limit')); throw new Error('limit'); } arr.push(clean); }
        EP.core.persist(); EP.emit('ext:change', { name }); return clean;
      },
      async remove(id) { await EP.history.snapshot('Before deleting a ' + name + ' record'); const arr = all(); const i = arr.findIndex(x => x.id === id); if (i >= 0) { arr.splice(i, 1); EP.core.persist(); EP.emit('ext:change', { name }); } }
    };
  };
  const base = x => ({ id: S.id(x.id), createdAt: S.iso(x.createdAt), updatedAt: S.iso(x.updatedAt) });
  /* latest(): the most recently updated saved record, so a tool opens on real work instead of a blank form */
  EP.latest = name => { const a = EP.coll(name).all(); return a.length ? JSON.parse(JSON.stringify(a.slice().sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)))[0])) : null; };
  const PERSONAL = /[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{8,}\d/;
  EP.looksPersonal = s => PERSONAL.test(String(s || ''));

  /* FORM HELPERS -------------------------------------------------------------------------------------------- */
  let fseq = 0;
  EP.F = {
    text(label, value, on, o = {}) { const id = 'ff' + (++fseq); const i = U.el('input', { id, type: o.type || 'text', maxlength: o.max || 200, autocomplete: 'off', spellcheck: o.spell === false ? 'false' : null, list: o.list || null, min: o.min ?? null, step: o.step || null, placeholder: o.ph || null }); if (o.type === 'number' && o.maxv != null) i.max = o.maxv; i.value = value ?? ''; i.addEventListener('input', () => on(i.value)); return { wrap: U.el('div', { class: 'field' }, U.el('label', { for: id, text: label }), i, o.help ? U.el('small', { text: o.help }) : null), input: i }; },
    area(label, value, on, o = {}) { const id = 'ff' + (++fseq); const a = U.el('textarea', { id, rows: o.rows || 3, maxlength: o.max || 1500, placeholder: o.ph || null }); a.value = value ?? ''; a.addEventListener('input', () => on(a.value)); return { wrap: U.el('div', { class: 'field' }, U.el('label', { for: id, text: label }), a, o.help ? U.el('small', { text: o.help }) : null), input: a }; },
    sel(label, value, options, on, o = {}) { const id = 'ff' + (++fseq); const s = U.el('select', { id }, options.map(([v, l]) => U.el('option', { value: v, text: l }))); s.value = value; s.addEventListener('change', () => on(s.value)); return { wrap: U.el('div', { class: 'field' }, U.el('label', { for: id, text: label }), s, o.help ? U.el('small', { text: o.help }) : null), input: s }; },
    chk(label, value, on) { const id = 'ff' + (++fseq); const c = U.el('input', { id, type: 'checkbox' }); c.checked = !!value; c.addEventListener('change', () => on(c.checked)); return { wrap: U.el('label', { class: 'check', for: id }, c, U.el('span', { text: label })), input: c }; },
    btn(label, on, cls = '') { return U.el('button', { type: 'button', class: cls, text: label, onclick: on }); },
    exampleTag: item => String(item.id || '').startsWith('demo-') ? U.el('span', { class: 'example-tag', text: t('f.example') }) : null
  };
  /* Saved-items picker row shared by all tools: select + New + Delete. */
  EP.picker = (name, getTitle, current, onPick, onNew, onDelete) => {
    const items = EP.coll(name).all(); const id = 'pk' + (++fseq);
    const s = U.el('select', { id }, U.el('option', { value: '', text: t('f.pick') }), items.map(x => U.el('option', { value: x.id, text: (String(x.id).startsWith('demo-') && !/^(example|ejemplo|exemple)/i.test(getTitle(x) || '') ? '[' + t('f.example') + '] ' : '') + (getTitle(x) || '—') })));
    s.value = current || ''; s.addEventListener('change', () => onPick(s.value));
    return U.el('div', { class: 'row-actions' }, U.el('label', { for: id, class: 'sr-only', text: t('f.savedList') }), s, EP.F.btn('+ ' + t('f.new'), onNew), current ? EP.F.btn(t('f.remove'), async () => { if (await EP.ui.confirm(t('f.deleteConfirm'), { danger: true, ok: t('f.remove') })) { await onDelete(current); } }, 'danger') : null);
  };

  /* TOOL REGISTRY + TABS ------------------------------------------------------------------------------------- */
  const tools = []; const panels = {}; const hosts = new Map(); let tabHooked = false;
  EP.tools = {
    register(def) { tools.push(def); }, list: () => tools.slice(), get: id => tools.find(x => x.id === id),
    open(id, recordId) {
      const d = EP.tools.get(id); EP.nav.reveal(d && d.group === 'classroom' ? '#classroom' : '#toolkit', { hash: false });
      const tab = document.getElementById('tk-tab-' + id); if (tab) tab.click();
      if (recordId && d && d.select) d.select(recordId);
      EP.analytics.record('tool', { id });
    },
    rerender(id) { const p = panels[id]; const d = EP.tools.get(id); if (p && d && !p.hidden) d.render(p); },
    /* mountHost(): build an ARIA tablist + panels for every registered tool matching `pred` inside #hostId.
       Safe to call again after a language change: it rebuilds from scratch. */
    mountHost(hostId, pred, label) {
      const host = U.$(hostId); if (!host) return; const prevTab = host.querySelector('[role=tab][aria-selected="true"]'); const prevId = prevTab && prevTab.id; host.replaceChildren(); hosts.set(host, hostId);
      const defs = tools.filter(pred); const list = U.el('div', { role: 'tablist', class: 'tabs', 'aria-label': label });
      for (const d of defs) list.append(U.el('button', { type: 'button', role: 'tab', id: 'tk-tab-' + d.id, 'aria-controls': 'tk-panel-' + d.id, 'aria-selected': 'false', tabindex: '-1', text: d.title() }));
      host.append(list); for (const d of defs) { const p = U.el('div', { role: 'tabpanel', id: 'tk-panel-' + d.id, 'aria-labelledby': 'tk-tab-' + d.id, hidden: '' }); panels[d.id] = p; host.append(p); }
      EP.ui.tabs(host);
      if (!tabHooked) { tabHooked = true; EP.on('tab', ({ root, id }) => { if (!hosts.has(root)) return; const tid = id.replace('tk-tab-', ''); const d = EP.tools.get(tid); if (d && panels[tid]) { d.render(panels[tid]); EP.analytics.record('tool', { id: tid }); } }); }
      const first = (prevId && list.querySelector('#' + prevId)) || list.querySelector('[role=tab]'); if (first) first.click();
    },
    mount() { EP.tools.mountHost('toolkitHost', x => x.group !== 'classroom', t('tk.title')); EP.tools.mountHost('classroomHost', x => x.group === 'classroom', t('toc.classroom')); }
  };
  const rerenderAll = () => { for (const d of tools) { const p = panels[d.id]; if (p && !p.hidden) d.render(p); } };

  /* ================================ BRIEF STUDIO ======================================================== */
  EP.i18n.register({
    'br.kind': L('Document type', 'Tipo de documento', 'Type de document'), 'br.kind.policy': L('Policy brief', 'Resumen de política', 'Note de politique'), 'br.kind.corporate': L('Corporate decision memo', 'Memorando de decisión corporativa', 'Note de décision d’entreprise'), 'br.kind.class': L('Classroom project proposal', 'Propuesta de proyecto de aula', 'Proposition de projet de classe'),
    'br.f.title': L('Title', 'Título', 'Titre'), 'br.f.audience': L('Audience and decision owner (a role, not a person)', 'Audiencia y responsable de decidir (un rol, no una persona)', 'Public et responsable de la décision (un rôle, pas une personne)'),
    'br.f.decision': L('Decision needed', 'Decisión requerida', 'Décision à prendre'), 'br.f.problem': L('Problem and context', 'Problema y contexto', 'Problème et contexte'), 'br.f.evidence': L('Evidence and its limits', 'Evidencia y sus límites', 'Preuves et leurs limites'),
    'br.f.options': L('Options compared (include doing nothing)', 'Opciones comparadas (incluya no hacer nada)', 'Options comparées (incluez ne rien faire)'), 'br.f.recommendation': L('Recommendation and why', 'Recomendación y por qué', 'Recommandation et justification'),
    'br.f.kpis': L('Indicators of success (with baseline and target)', 'Indicadores de éxito (con línea base y meta)', 'Indicateurs de réussite (avec référence et cible)'), 'br.f.stop': L('What would change our mind (stop rules)', 'Qué nos haría cambiar de opinión (reglas de parada)', 'Ce qui nous ferait changer d’avis (règles d’arrêt)'),
    'br.f.steps': L('Implementation steps and owners', 'Pasos de implementación y responsables', 'Étapes de mise en œuvre et responsables'), 'br.f.limits': L('Limits and unknowns', 'Límites e incógnitas', 'Limites et inconnues'),
    'br.f.harm': L('I asked how this could be inverted into harm (see Risks & anti-inversion)', 'Me pregunté cómo esto podría invertirse en daño (vea Riesgos y anti-inversión)', 'Je me suis demandé comment cela pourrait être inversé en préjudice (voir Risques et anti-inversion)'),
    'br.opt.name': L('Option name', 'Nombre de la opción', 'Nom de l’option'), 'br.opt.summary': L('What it does, who gains, who bears the cost', 'Qué hace, quién gana, quién asume el costo', 'Ce qu’elle fait, qui y gagne, qui en supporte le coût'), 'br.opt.cost': L('Cost / effort', 'Costo / esfuerzo', 'Coût / effort'), 'br.opt.risks': L('Main risks', 'Riesgos principales', 'Risques principaux'),
    'br.addOpt': L('Add option', 'Añadir opción', 'Ajouter une option'), 'br.insertEv': L('Insert from my evidence notes…', 'Insertar desde mis notas de evidencia…', 'Insérer depuis mes notes de preuves…'), 'br.preview': L('Preview (this is what prints)', 'Vista previa (lo que se imprime)', 'Aperçu (ce qui s’imprime)'),
    'br.check': L('Before you rely on this', 'Antes de confiar en esto', 'Avant de vous y fier'), 'br.c.decision': L('State the decision needed.', 'Indique la decisión requerida.', 'Indiquez la décision à prendre.'), 'br.c.options': L('Compare at least two options.', 'Compare al menos dos opciones.', 'Comparez au moins deux options.'), 'br.c.status': L('Add a “do nothing / status quo” option as a baseline.', 'Añada una opción «no hacer nada / statu quo» como línea base.', 'Ajoutez une option « ne rien faire / statu quo » comme référence.'),
    'br.c.stop': L('Say what evidence would make you stop or change course.', 'Diga qué evidencia le haría parar o cambiar de rumbo.', 'Dites quelles preuves vous feraient arrêter ou changer de cap.'), 'br.c.limits': L('List what is unknown or unverified.', 'Enumere lo que se desconoce o no está verificado.', 'Listez ce qui est inconnu ou non vérifié.'), 'br.c.evidence': L('Cite evidence and say how strong it is.', 'Cite evidencia e indique su solidez.', 'Citez des preuves et indiquez leur solidité.'), 'br.c.harm': L('Run the Anti-Inversion check and tick the box.', 'Haga la comprobación anti-inversión y marque la casilla.', 'Faites le contrôle anti-inversion et cochez la case.'), 'br.c.ok': L('All basic checks are present. This does not make the content correct.', 'Todas las comprobaciones básicas están presentes. Eso no hace correcto el contenido.', 'Tous les contrôles de base sont présents. Cela ne rend pas le contenu exact.'),
    'br.notStated': L('Not yet stated: complete before relying on this brief.', 'Aún sin indicar: complete antes de confiar en este resumen.', 'Pas encore indiqué : complétez avant de vous fier à cette note.'),
    'br.corp.decision': L('Decision requested', 'Decisión solicitada', 'Décision demandée'), 'br.corp.options': L('Alternatives (include the status quo)', 'Alternativas (incluya el statu quo)', 'Alternatives (incluez le statu quo)'), 'br.corp.kpis': L('Success metrics and review date', 'Métricas de éxito y fecha de revisión', 'Indicateurs de réussite et date de revue'),
    'br.class.decision': L('Our project question', 'Nuestra pregunta de proyecto', 'Notre question de projet'), 'br.class.problem': L('Why it matters here', 'Por qué importa aquí', 'Pourquoi cela compte ici'), 'br.class.options': L('Approaches we could take', 'Enfoques posibles', 'Approches possibles'), 'br.class.recommendation': L('Our plan', 'Nuestro plan', 'Notre plan'), 'br.class.kpis': L('How we will know', 'Cómo lo sabremos', 'Comment nous le saurons'), 'br.class.stop': L('What would make us change plan', 'Qué nos haría cambiar de plan', 'Ce qui nous ferait changer de plan'), 'br.class.steps': L('Steps and roles', 'Pasos y roles', 'Étapes et rôles'), 'br.class.limits': L('What we do not know yet', 'Lo que aún no sabemos', 'Ce que nous ignorons encore'),
    'br.foot': L('Prepared with Empowerment OS v4 on {d}. Zero-Harm & Anti-Inversion: ask how this could be misused and who was not consulted.', 'Preparado con Empowerment OS v4 el {d}. Cero daño y anti-inversión: pregunte cómo podría malusarse y a quién no se consultó.', 'Préparé avec Empowerment OS v4 le {d}. Zéro préjudice et anti-inversion : demandez comment cela pourrait être détourné et qui n’a pas été consulté.'),
    'br.harmYes': L('Anti-Inversion check: completed by the author.', 'Comprobación anti-inversión: realizada por el autor.', 'Contrôle anti-inversion : réalisé par l’auteur.'), 'br.harmNo': L('Anti-Inversion check: NOT yet completed.', 'Comprobación anti-inversión: aún NO realizada.', 'Contrôle anti-inversion : PAS encore réalisé.'), 'br.untitled': L('Untitled brief', 'Resumen sin título', 'Note sans titre'), 'br.tableOpt': L('Option', 'Opción', 'Option')
  });
  const BR_KINDS = ['policy', 'corporate', 'class'], BR_TEXT = ['decision', 'problem', 'evidence', 'recommendation', 'kpis', 'stop', 'steps', 'limits'];
  EP.ext.define('briefs', { limit: 60, sanitize(x) {
    const b = base(x); if (!b.id) return null;
    const o = { ...b, title: S.line(x.title, 140), kind: S.pick(x.kind, BR_KINDS), audience: S.line(x.audience, 160), harm: S.bool(x.harm), options: (Array.isArray(x.options) ? x.options : []).slice(0, 4).map(op => ({ name: S.line(op && op.name, 100), summary: S.text(op && op.summary, 600), cost: S.line(op && op.cost, 160), risks: S.text(op && op.risks, 400) })) };
    for (const k of BR_TEXT) o[k] = S.text(x[k], k === 'evidence' ? 2000 : 1200); return o;
  } });
  const brLabel = (kind, key) => { if (kind !== 'policy') { const k = 'br.' + (kind === 'corporate' ? 'corp' : 'class') + '.' + key; const v = t(k); if (v !== k) return v; } return t('br.f.' + key); };
  function briefModel(b) {
    const sec = []; const ns = t('br.notStated');
    const add = (key, text) => sec.push({ key, h: brLabel(b.kind, key), text: (text || '').trim() });
    add('decision', b.decision); add('problem', b.problem); add('evidence', b.evidence);
    sec.push({ key: 'options', h: brLabel(b.kind, 'options'), options: b.options.filter(o => o.name || o.summary) });
    add('recommendation', b.recommendation); add('kpis', b.kpis); add('stop', b.stop); add('steps', b.steps); add('limits', b.limits);
    return { title: b.title || t('br.untitled'), type: t('br.kind.' + b.kind), audience: b.audience, sections: sec, harm: b.harm, ns };
  }
  function briefMarkdown(m) {
    const o = ['# ' + m.title, '', '*' + m.type + (m.audience ? ' · ' + m.audience : '') + '*', ''];
    for (const s of m.sections) { o.push('## ' + s.h, ''); if (s.options) { if (!s.options.length) o.push('_' + m.ns + '_'); else { o.push('| ' + [t('br.tableOpt'), t('br.opt.summary'), t('br.opt.cost'), t('br.opt.risks')].join(' | ') + ' |', '|---|---|---|---|'); for (const x of s.options) o.push('| ' + [x.name, x.summary, x.cost, x.risks].map(v => String(v || '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ') + ' |'); } } else o.push(s.text || '_' + m.ns + '_'); o.push(''); }
    o.push('---', m.harm ? t('br.harmYes') : t('br.harmNo'), '', t('f.disclaimer'), '', t('br.foot', { d: EP.fmt.date(Date.now()) })); return o.join('\n');
  }
  function briefNode(m) {
    const root = U.el('article', { class: 'brief-sheet' }, U.el('h3', { text: m.title }), U.el('p', {}, U.el('em', { text: m.type + (m.audience ? ' · ' + m.audience : '') })));
    for (const s of m.sections) {
      root.append(U.el('h4', { text: s.h }));
      if (s.options) { if (!s.options.length) root.append(U.el('div', { class: 'flag', text: m.ns })); else root.append(U.el('div', { class: 'table-scroll' }, U.el('table', {}, U.el('thead', {}, U.el('tr', {}, [t('br.tableOpt'), t('br.opt.summary'), t('br.opt.cost'), t('br.opt.risks')].map(h => U.el('th', { text: h })))), U.el('tbody', {}, s.options.map(x => U.el('tr', {}, [x.name, x.summary, x.cost, x.risks].map(v => U.el('td', { text: v || '' })))))))); }
      else if (s.text) for (const para of s.text.split(/\n{2,}/)) root.append(U.el('p', { text: para })); else root.append(U.el('div', { class: 'flag', text: m.ns }));
    }
    root.append(U.el('hr'), U.el('p', { class: m.harm ? '' : 'flag', text: m.harm ? t('br.harmYes') : t('br.harmNo') }), U.el('p', { style: 'font-size:.85rem;color:#444', text: t('f.disclaimer') }), U.el('p', { style: 'font-size:.85rem;color:#444', text: t('br.foot', { d: EP.fmt.date(Date.now()) }) })); return root;
  }
  const briefHtmlDoc = m => { const node = briefNode(m); return '<!DOCTYPE html><html lang="' + EP.i18n.lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + U.esc(m.title) + '</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:.35rem .5rem;text-align:left;vertical-align:top}.flag{background:#fff3cd;border-left:4px solid #b58100;padding:.3rem .6rem}h3,h4{color:#0c3a24}</style></head><body>' + node.outerHTML + '</body></html>'; };
  const briefChecks = b => { const c = []; if (!b.decision.trim()) c.push('br.c.decision'); const named = b.options.filter(o => o.name.trim()); if (named.length < 2) c.push('br.c.options'); if (!named.some(o => /status quo|statu quo|do nothing|no action|nothing|hacer nada|ninguna acci|ne rien faire|aucune action/i.test(o.name))) c.push('br.c.status'); if (!b.evidence.trim()) c.push('br.c.evidence'); if (!b.stop.trim()) c.push('br.c.stop'); if (!b.limits.trim()) c.push('br.c.limits'); if (!b.harm) c.push('br.c.harm'); return c; };
  EP.briefs = { model: briefModel, markdown: briefMarkdown, checks: briefChecks };

  let briefDraft = null;
  const blankBrief = kind => ({ id: '', title: '', kind: kind || ({ policy: 'policy', corporate: 'corporate', educator: 'class', student: 'class', community: 'policy' }[EP.settings.get('role')] || 'policy'), audience: '', decision: '', problem: '', evidence: '', options: [{ name: '', summary: '', cost: '', risks: '' }, { name: '', summary: '', cost: '', risks: '' }], recommendation: '', kpis: '', stop: '', steps: '', limits: '', harm: false });
  function renderBrief(host) {
    if (!briefDraft) briefDraft = EP.latest('briefs') || blankBrief(); const b = briefDraft; host.replaceChildren();
    const preview = U.el('div', { 'aria-live': 'polite' }), checks = U.el('div', { 'aria-live': 'polite' });
    const refresh = U.debounce(() => { const m = briefModel(b); preview.replaceChildren(briefNode(m)); const c = briefChecks(b); checks.replaceChildren(U.el('div', { class: 'callout ' + (c.length ? 'warn' : 'ok') }, U.el('strong', { text: t('br.check') }), c.length ? U.el('ul', { class: 'mini-list' }, c.map(k => U.el('li', { text: t(k) }))) : U.el('p', { text: t('br.c.ok') }))); }, 120);
    const on = key => v => { b[key] = v; refresh(); };
    const kind = EP.F.sel(t('br.kind'), b.kind, BR_KINDS.map(k => [k, t('br.kind.' + k)]), v => { b.kind = v; renderBrief(host); }).wrap;
    const form = U.el('div', {}, kind, EP.F.text(t('br.f.title'), b.title, on('title'), { max: 140 }).wrap, EP.F.text(t('br.f.audience'), b.audience, on('audience'), { max: 160 }).wrap);
    for (const k of ['decision', 'problem']) form.append(EP.F.area(brLabel(b.kind, k), b[k], on(k), { rows: k === 'decision' ? 2 : 3, max: 1200 }).wrap);
    const evi = EP.F.area(brLabel(b.kind, 'evidence'), b.evidence, on('evidence'), { rows: 4, max: 2000 }); form.append(evi.wrap);
    const notes = EP.core.state.evidence; if (notes.length) { const pick = U.el('select', { 'aria-label': t('br.insertEv') }, U.el('option', { value: '', text: t('br.insertEv') }), notes.map((n, i) => U.el('option', { value: String(i), text: (EP.core.EBY[n.domain]?.name || n.domain) + ': ' + n.claim.slice(0, 70) }))); pick.addEventListener('change', () => { const n = notes[Number(pick.value)]; if (!n) return; const line = '• ' + n.claim + (n.limits ? ' (Limits: ' + n.limits + ')' : '') + (n.quality ? ' [' + n.quality + ']' : '') + (n.url ? ' ' + n.url : ''); b.evidence = (b.evidence ? b.evidence + '\n' : '') + line; evi.input.value = b.evidence; pick.value = ''; refresh(); }); form.append(pick); }
    form.append(U.el('h4', { text: brLabel(b.kind, 'options') }));
    b.options.forEach((op, i) => form.append(U.el('fieldset', { class: 'tool-item' }, U.el('legend', { text: '#' + (i + 1) }), EP.F.text(t('br.opt.name'), op.name, v => { op.name = v; refresh(); }, { max: 100 }).wrap, EP.F.area(t('br.opt.summary'), op.summary, v => { op.summary = v; refresh(); }, { rows: 2, max: 600 }).wrap, EP.F.text(t('br.opt.cost'), op.cost, v => { op.cost = v; refresh(); }, { max: 160 }).wrap, EP.F.text(t('br.opt.risks'), op.risks, v => { op.risks = v; refresh(); }, { max: 400 }).wrap, b.options.length > 2 ? EP.F.btn(t('f.remove'), () => { b.options.splice(i, 1); renderBrief(host); }) : null)));
    if (b.options.length < 4) form.append(EP.F.btn('+ ' + t('br.addOpt'), () => { b.options.push({ name: '', summary: '', cost: '', risks: '' }); renderBrief(host); }));
    for (const k of ['recommendation', 'kpis', 'stop', 'steps', 'limits']) form.append(EP.F.area(brLabel(b.kind, k), b[k], on(k), { rows: 3, max: 1200 }).wrap);
    form.append(EP.F.chk(t('br.f.harm'), b.harm, v => { b.harm = v; refresh(); }).wrap);
    const save = EP.F.btn(t('ui.save'), () => { try { const s = EP.coll('briefs').save(b); briefDraft = { ...s, options: s.options.map(o => ({ ...o })) }; EP.emit('activity', { type: 'brief' }); EP.ui.toast(t('f.saved')); renderBrief(host); } catch (e) { if (e.message !== 'limit') EP.ui.toast(e.message); } }, 'primary');
    const share = type => () => { const m = briefModel(b); if (type === 'print') EP.ui.printSheet(briefNode(m), m.title); else if (type === 'md') EP.ui.download(briefMarkdown(m), 'brief.md', 'text/markdown;charset=utf-8'); else if (type === 'html') EP.ui.download(briefHtmlDoc(m), 'brief.html', 'text/html;charset=utf-8'); else EP.ui.copy(briefMarkdown(m)); EP.emit('activity', { type: 'briefShared' }); };
    const bar = U.el('div', { class: 'row-actions' }, save, EP.F.btn(t('f.print'), share('print')), EP.F.btn(t('f.dlmd'), share('md')), EP.F.btn(t('f.dlhtml'), share('html')), EP.F.btn(t('f.copy'), share('copy')));
    const picker = EP.picker('briefs', x => x.title, b.id, id => { const s = EP.coll('briefs').get(id); briefDraft = s ? JSON.parse(JSON.stringify(s)) : blankBrief(); renderBrief(host); }, () => { briefDraft = blankBrief(); renderBrief(host); }, async id => { await EP.coll('briefs').remove(id); briefDraft = blankBrief(); renderBrief(host); });
    host.append(picker, U.el('div', { class: 'tool-grid two' }, U.el('div', {}, form, checks, bar), U.el('div', {}, U.el('h4', { text: t('br.preview') }), preview))); refresh();
  }
  EP.tools.register({ id: 'brief', title: () => t('tool.brief'), render: renderBrief, select(id) { const s = EP.coll('briefs').get(id); if (s) { briefDraft = JSON.parse(JSON.stringify(s)); rerenderAll(); } } });
  EP.search.register('briefs', () => EP.coll('briefs').all().map(b => ({ id: 'brief:' + b.id, kind: 'tool.brief', title: b.title || t('br.untitled'), text: [b.decision, b.problem, b.recommendation].join(' '), go: { run: () => EP.tools.open('brief', b.id) } })));

  /* ================================ DECISION MATRIX ====================================================== */
  EP.i18n.register({
    'dm.opts': L('Options', 'Opciones', 'Options'), 'dm.crit': L('Criteria', 'Criterios', 'Critères'), 'dm.weight': L('Weight (1–10)', 'Peso (1–10)', 'Poids (1–10)'), 'dm.veto': L('Safeguard (veto)', 'Salvaguarda (veto)', 'Sauvegarde (veto)'), 'dm.vetoMin': L('Minimum score for safeguard criteria', 'Puntuación mínima para criterios de salvaguarda', 'Note minimale pour les critères de sauvegarde'),
    'dm.addOpt': L('Add option', 'Añadir opción', 'Ajouter une option'), 'dm.addCrit': L('Add criterion', 'Añadir criterio', 'Ajouter un critère'), 'dm.score': L('Score 0–10 (higher is better for the people affected)', 'Puntuación 0–10 (más alto es mejor para las personas afectadas)', 'Note 0–10 (plus haut = mieux pour les personnes concernées)'),
    'dm.total': L('Weighted score (0–100)', 'Puntuación ponderada (0–100)', 'Score pondéré (0–100)'), 'dm.excluded': L('Excluded: fails a safeguard', 'Excluida: no cumple una salvaguarda', 'Exclue : ne respecte pas une sauvegarde'), 'dm.stab': L('Leads in {p}% of {n} perturbed runs', 'Lidera en {p}% de {n} simulaciones perturbadas', 'En tête dans {p}% de {n} simulations perturbées'),
    'dm.stable': L('Stable', 'Estable', 'Stable'), 'dm.leaning': L('Leaning', 'Tendencia', 'Tendance'), 'dm.unclear': L('Unclear: do not treat as decided', 'Poco claro: no lo trate como decidido', 'Peu clair : ne pas considérer comme décidé'),
    'dm.flip': L('If “{c}” mattered {m}× as much as now, “{o}” would lead instead of “{w}”.', 'Si «{c}» importara {m}× más que ahora, «{o}» lideraría en lugar de «{w}».', 'Si « {c} » comptait {m}× plus qu’aujourd’hui, « {o} » passerait devant « {w} ».'), 'dm.noflip': L('No single weight change flips the leader.', 'Ningún cambio de un solo peso cambia al líder.', 'Aucun changement d’un seul poids ne change le leader.'),
    'dm.leader': L('{o} leads with {s}/100.', '{o} lidera con {s}/100.', '{o} est en tête avec {s}/100.'), 'dm.allout': L('Every option fails a safeguard. Revisit the options, not the weights.', 'Todas las opciones incumplen una salvaguarda. Revise las opciones, no los pesos.', 'Toutes les options violent une sauvegarde. Revoyez les options, pas les poids.'),
    'dm.caveat': L('This aids deliberation; it does not decide. Scores are judgments: share the reasoning with the people affected. Perturbation = weights ±35% (log-normal) and scores ±0.75, seeded so results are reproducible.', 'Esto ayuda a deliberar; no decide. Las puntuaciones son juicios: comparta el razonamiento con las personas afectadas. Perturbación = pesos ±35% (log-normal) y puntuaciones ±0,75, con semilla reproducible.', 'Cet outil aide à délibérer ; il ne décide pas. Les notes sont des jugements : partagez le raisonnement avec les personnes concernées. Perturbation = poids ±35 % (log-normal) et notes ±0,75, avec graine reproductible.'),
    'dm.optDefault': L('Option {n}', 'Opción {n}', 'Option {n}'), 'dm.critDefault': L('Criterion {n}', 'Criterio {n}', 'Critère {n}'), 'dm.contrib': L('Contribution by criterion', 'Contribución por criterio', 'Contribution par critère'), 'dm.untitled': L('Untitled matrix', 'Matriz sin título', 'Matrice sans titre')
  });
  EP.ext.define('decisions', { limit: 60, sanitize(x) {
    const b = base(x); if (!b.id) return null; const opts = (Array.isArray(x.options) ? x.options : []).slice(0, 8).map(o => S.line(o, 80)); const crit = (Array.isArray(x.criteria) ? x.criteria : []).slice(0, 12).map(c => ({ name: S.line(c && c.name, 80), weight: S.num(c && c.weight, { min: 1, max: 10, int: true, fallback: 5 }), veto: S.bool(c && c.veto) }));
    if (opts.length < 1 || crit.length < 1) return null; const sc = opts.map((_, i) => crit.map((_, j) => S.num(x.scores && x.scores[i] && x.scores[i][j], { min: 0, max: 10, fallback: 5 })));
    return { ...b, title: S.line(x.title, 140), options: opts, criteria: crit, scores: sc, vetoMin: S.num(x.vetoMin, { min: 0, max: 10, fallback: 3 }), notes: S.text(x.notes, 1000) };
  } });
  const mcda = EP.mcda = {
    evaluate(m) {
      const W = m.criteria.reduce((a, c) => a + c.weight, 0) || 1; const totals = [], contrib = [], excluded = [];
      m.options.forEach((_, i) => { const row = m.criteria.map((c, j) => 100 * (c.weight / W) * (m.scores[i][j] / 10)); contrib.push(row); totals.push(row.reduce((a, b) => a + b, 0)); excluded.push(m.criteria.some((c, j) => c.veto && m.scores[i][j] < m.vetoMin)); });
      return { totals, contrib, excluded, W };
    },
    stability(m, n = 2000) {
      const ev = mcda.evaluate(m); const elig = m.options.map((_, i) => i).filter(i => !ev.excluded[i]); const wins = m.options.map(() => 0); if (!elig.length) return { wins, n, ev, elig };
      const rnd = U.seeded(U.hash32(JSON.stringify([m.options, m.criteria, m.scores, m.vetoMin])));
      for (let it = 0; it < n; it++) {
        const w = m.criteria.map(c => c.weight * Math.exp(0.35 * EP.stats.normal(rnd))); const W = w.reduce((a, b) => a + b, 0); let best = -1, bi = -1;
        for (const i of elig) { let s = 0; for (let j = 0; j < w.length; j++) s += (w[j] / W) * Math.max(0, Math.min(10, m.scores[i][j] + 0.75 * EP.stats.normal(rnd))); if (s > best) { best = s; bi = i; } }
        wins[bi]++;
      }
      return { wins, n, ev, elig };
    },
    flip(m) {
      const ev = mcda.evaluate(m); const el = m.options.map((_, i) => i).filter(i => !ev.excluded[i]).sort((a, b) => ev.totals[b] - ev.totals[a]); if (el.length < 2) return null; const [top, sec] = el; let best = null;
      m.criteria.forEach((c, j) => {
        const d = m.scores[top][j] - m.scores[sec][j]; if (!d) return;
        const rest = m.criteria.reduce((a, cc, k) => k === j ? a : a + cc.weight * (m.scores[top][k] - m.scores[sec][k]), 0);
        const mult = -rest / (c.weight * d); /* weight multiplier at which top and runner-up tie */
        if (mult >= 0 && mult <= 10) { const rel = Math.abs(mult - 1); if (!best || rel < best.rel) best = { criterion: c.name, mult, rel, top, sec }; }
      });
      return best;
    }
  };
  let dmDraft = null;
  const blankDm = () => ({ id: '', title: '', options: [t('dm.optDefault', { n: 1 }), t('dm.optDefault', { n: 2 })], criteria: [{ name: t('dm.critDefault', { n: 1 }), weight: 5, veto: false }, { name: t('dm.critDefault', { n: 2 }), weight: 5, veto: false }], scores: [[5, 5], [5, 5]], vetoMin: 3, notes: '' });
  function renderDecision(host) {
    if (!dmDraft) dmDraft = EP.latest('decisions') || blankDm(); const m = dmDraft; host.replaceChildren(); const out = U.el('div', { 'aria-live': 'polite' });
    if (!m.id) m.id = 'draft-' + (m._tmp || (m._tmp = U.uid().slice(0, 8)));
    const calc = U.debounce(() => {
      const probe = { ...m }; const st = mcda.stability(probe), ev = st.ev; const order = m.options.map((_, i) => i).sort((a, b) => ev.totals[b] - ev.totals[a]);
      const winner = st.elig.slice().sort((a, b) => ev.totals[b] - ev.totals[a])[0]; const nodes = [];
      if (winner === undefined) nodes.push(U.el('div', { class: 'callout danger', text: t('dm.allout') }));
      else { const pct = Math.round(100 * st.wins[winner] / st.n); const lvl = pct >= 80 ? ['good', t('dm.stable')] : pct >= 50 ? ['mid', t('dm.leaning')] : ['bad', t('dm.unclear')]; nodes.push(U.el('div', { class: 'callout' }, U.el('p', {}, U.el('strong', { text: t('dm.leader', { o: m.options[winner], s: ev.totals[winner].toFixed(1) }) })), U.el('p', {}, U.el('span', { class: 'pill ' + lvl[0], text: lvl[1] }), ' ' + t('dm.stab', { p: pct, n: EP.fmt.number(st.n) })))); const f = mcda.flip(probe); nodes.push(U.el('p', { class: 'small', text: f ? t('dm.flip', { c: f.criterion, m: f.mult.toFixed(1), o: m.options[f.sec], w: m.options[f.top] }) : t('dm.noflip') })); }
      nodes.push(U.el('h4', { text: t('dm.contrib') })); for (const i of order) { const bar = U.el('div', { style: 'display:flex;height:16px;border-radius:99px;overflow:hidden;background:var(--panel2)', 'aria-hidden': 'true' }, m.criteria.map((c, j) => U.el('span', { style: 'width:' + ev.contrib[i][j] + '%;background:hsl(' + ((j * 47) % 360) + ' 55% 48%)', title: c.name + ': ' + ev.contrib[i][j].toFixed(1) }))); nodes.push(U.el('div', { class: ev.excluded[i] ? 'tool-item' : '', style: ev.excluded[i] ? 'opacity:.6;margin:.4rem 0' : 'margin:.4rem 0' }, U.el('div', {}, U.el('strong', { text: m.options[i] }), ' ', U.el('span', { text: ev.totals[i].toFixed(1) }), ev.excluded[i] ? U.el('span', { class: 'pill bad', style: 'margin-left:.5rem', text: t('dm.excluded') }) : null), bar)); }
      nodes.push(U.el('div', { class: 'legend' }, m.criteria.map((c, j) => U.el('span', {}, U.el('span', { 'aria-hidden': 'true', style: 'display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;background:hsl(' + ((j * 47) % 360) + ' 55% 48%)' }), c.name)))); nodes.push(U.el('p', { class: 'small', text: t('dm.caveat') })); out.replaceChildren(...nodes);
    }, 150);
    const table = U.el('table', { class: 'tbl' });
    const head = U.el('tr', {}, U.el('th', { text: t('dm.crit') }), U.el('th', { text: t('dm.weight') }), U.el('th', { text: t('dm.veto') }), ...m.options.map((o, i) => U.el('th', {}, U.el('input', { type: 'text', value: o, maxlength: 80, 'aria-label': t('dm.opts') + ' ' + (i + 1), oninput: e => { m.options[i] = e.target.value; calc(); } }), m.options.length > 2 ? EP.F.btn('×', () => { m.options.splice(i, 1); m.scores.splice(i, 1); renderDecision(host); }) : null)));
    table.append(U.el('thead', {}, head)); const tb = U.el('tbody');
    m.criteria.forEach((c, j) => tb.append(U.el('tr', {}, U.el('td', {}, U.el('input', { type: 'text', value: c.name, maxlength: 80, 'aria-label': t('dm.crit') + ' ' + (j + 1), oninput: e => { c.name = e.target.value; calc(); } }), m.criteria.length > 1 ? EP.F.btn('×', () => { m.criteria.splice(j, 1); m.scores.forEach(r => r.splice(j, 1)); renderDecision(host); }) : null), U.el('td', {}, U.el('input', { type: 'number', min: 1, max: 10, value: c.weight, 'aria-label': t('dm.weight') + ' ' + c.name, oninput: e => { c.weight = S.num(e.target.value, { min: 1, max: 10, int: true, fallback: 5 }); calc(); } })), U.el('td', {}, U.el('input', { type: 'checkbox', checked: c.veto ? '' : null, 'aria-label': t('dm.veto') + ' ' + c.name, onchange: e => { c.veto = e.target.checked; calc(); } })), ...m.options.map((_, i) => U.el('td', {}, U.el('input', { type: 'number', min: 0, max: 10, step: 0.5, value: m.scores[i][j], 'aria-label': m.options[i] + ' / ' + c.name, oninput: e => { m.scores[i][j] = S.num(e.target.value, { min: 0, max: 10, fallback: 0 }); calc(); } }))))));
    table.append(tb);
    const actions = U.el('div', { class: 'row-actions' }, m.options.length < 8 ? EP.F.btn('+ ' + t('dm.addOpt'), () => { m.options.push(t('dm.optDefault', { n: m.options.length + 1 })); m.scores.push(m.criteria.map(() => 5)); renderDecision(host); }) : null, m.criteria.length < 12 ? EP.F.btn('+ ' + t('dm.addCrit'), () => { m.criteria.push({ name: t('dm.critDefault', { n: m.criteria.length + 1 }), weight: 5, veto: false }); m.scores.forEach(r => r.push(5)); renderDecision(host); }) : null,
      EP.F.btn(t('ui.save'), () => { try { const keep = String(m.id).startsWith('draft-') ? '' : m.id; const s = EP.coll('decisions').save({ ...m, id: keep }); dmDraft = JSON.parse(JSON.stringify(s)); EP.emit('activity', { type: 'decision', veto: s.criteria.some(c => c.veto) }); EP.ui.toast(t('f.saved')); renderDecision(host); } catch (e) { if (e.message !== 'limit') EP.ui.toast(e.message); } }, 'primary'),
      EP.F.btn(t('f.print'), () => { const node = U.el('div', { class: 'brief-sheet' }, U.el('h3', { text: m.title || t('dm.untitled') }), U.el('div', { class: 'table-scroll' }, table.cloneNode(true)), out.cloneNode(true)); EP.ui.printSheet(node, m.title || t('dm.untitled')); }));
    const picker = EP.picker('decisions', x => x.title, String(m.id).startsWith('draft-') ? '' : m.id, id => { const s = EP.coll('decisions').get(id); dmDraft = s ? JSON.parse(JSON.stringify(s)) : blankDm(); renderDecision(host); }, () => { dmDraft = blankDm(); renderDecision(host); }, async id => { await EP.coll('decisions').remove(id); dmDraft = blankDm(); renderDecision(host); });
    host.append(picker, EP.F.text(t('f.title'), m.title, v => { m.title = v; }, { max: 140 }).wrap, U.el('p', { class: 'small', text: t('dm.score') }), U.el('div', { class: 'table-scroll' }, table), EP.F.text(t('dm.vetoMin'), m.vetoMin, v => { m.vetoMin = S.num(v, { min: 0, max: 10, fallback: 3 }); calc(); }, { type: 'number', min: 0, maxv: 10, step: 0.5 }).wrap, actions, out); calc();
  }
  EP.tools.register({ id: 'decision', title: () => t('tool.decision'), render: renderDecision, select(id) { const s = EP.coll('decisions').get(id); if (s) { dmDraft = JSON.parse(JSON.stringify(s)); rerenderAll(); } } });
  EP.search.register('decisions', () => EP.coll('decisions').all().map(d => ({ id: 'dm:' + d.id, kind: 'tool.decision', title: d.title || t('dm.untitled'), text: d.options.join(' ') + ' ' + d.criteria.map(c => c.name).join(' '), go: { run: () => EP.tools.open('decision', d.id) } })));

  EP.on('tools:reset', () => { if (!briefDraft || !briefDraft.id) briefDraft = null; if (!dmDraft || !dmDraft.id || String(dmDraft.id).startsWith('draft-')) dmDraft = null; });
  EP.module('toolkit', () => { EP.on('ext:change', e => { if (e && e.name === '*') { EP.emit('tools:reset'); rerenderAll(); } }); EP.tools.mount(); EP.on('lang', () => { briefDraft = briefDraft && briefDraft.id ? briefDraft : null; EP.tools.mount(); }); for (const ev of ['state:loaded', 'state:reloaded']) EP.on(ev, () => { briefDraft = null; dmDraft = null; EP.tools.mount(); }); }, { order: 70 });
})();
