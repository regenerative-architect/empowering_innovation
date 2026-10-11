/* SECTION 13 · LOCAL AI (OPTIONAL) + HARM-BOUNDARY FILTER
   Purpose : an optional in-browser language model (WebLLM, WebGPU) for drafting plans, with a
             deterministic, inspectable fallback that works with no model at all.
   v4 changes vs v3:
     - works from a double-clicked file: the worker is built from a Blob (v3 needed ./js/webllm-worker.js,
       which browsers refuse to load from file://);
     - model ids were checked against the WebLLM 0.2.85 prebuilt list. v3's "SmolLM2-135M q4f32" does not
       exist in that list and would have failed; the verified 135M build is q0f16. The list is re-checked
       at load time against the library's own prebuiltAppConfig;
     - nothing downloads until you confirm a dialog that names the hosts and the size;
     - streaming output with a Stop button; Unload frees GPU memory;
     - a harm-boundary filter (below) runs BEFORE any generation, model or fallback.
   Honesty : the filter is a coarse, local pattern check. It reduces casual misuse; it cannot catch
             everything and it is not a safety guarantee. Models can invent facts. The output is a draft.
   Extend  : add a model to MODEL_CHOICES only after confirming its id in webllm.prebuiltAppConfig;
             add a pattern to HARM_PATTERNS with a category key and a translated explanation.
   Outcome : drafting help that never sends your text to a server and declines to help harm people. */
(function () {
  'use strict';
  const U = EP.util, S = EP.sanitize, $ = U.$, t = (k, v) => EP.t(k, v);
  const L = (en, es, fr) => [en, es, fr];
  const WEBLLM_URL = 'https://esm.sh/@mlc-ai/web-llm@0.2.85?bundle';
  const MODEL_CHOICES = [
    { id: 'SmolLM2-360M-Instruct-q4f32_1-MLC', mb: 580, f16: false, label: 'SmolLM2 360M (q4f32, most compatible)' },
    { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', mb: 376, f16: true, label: 'SmolLM2 360M (q4f16, smaller, needs shader-f16)' },
    { id: 'SmolLM2-135M-Instruct-q0f16-MLC', mb: 360, f16: true, label: 'SmolLM2 135M (q0f16, tiny, needs shader-f16)' },
    { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', mb: 879, f16: true, label: 'Llama 3.2 1B (q4f16, larger, needs shader-f16)' }
  ];

  EP.i18n.register({
    'ai.eyebrow': L('OPTIONAL · LOCAL MODEL · DETERMINISTIC FALLBACK', 'OPCIONAL · MODELO LOCAL · ALTERNATIVA DETERMINISTA', 'FACULTATIF · MODÈLE LOCAL · REPLI DÉTERMINISTE'), 'ai.title': L('Local R&D and method-of-action synthesizer', 'Sintetizador local de I+D y métodos de acción', 'Synthétiseur local de R&D et de méthodes d’action'),
    'ai.lede': L('The model is optional and runs in your browser. If WebGPU or model files are unavailable, the same screen returns a deterministic, inspectable planning chain and says plainly that no model was used.', 'El modelo es opcional y se ejecuta en su navegador. Si no hay WebGPU o archivos del modelo, la misma pantalla devuelve una cadena de planificación determinista e inspeccionable y dice claramente que no se usó ningún modelo.', 'Le modèle est facultatif et s’exécute dans votre navigateur. Sans WebGPU ou fichiers du modèle, le même écran renvoie une chaîne de planification déterministe et inspectable et indique clairement qu’aucun modèle n’a été utilisé.'),
    'ai.model': L('Local model (sizes are the library’s GPU-memory requirement)', 'Modelo local (los tamaños son el requisito de memoria GPU de la biblioteca)', 'Modèle local (tailles = mémoire GPU requise par la bibliothèque)'), 'ai.challenge': L('Challenge', 'Desafío', 'Défi'), 'ai.ph': L('Describe the problem, population, evidence already known, constraints, desired outcome and unresolved uncertainty.', 'Describa el problema, la población, la evidencia conocida, las restricciones, el resultado deseado y la incertidumbre pendiente.', 'Décrivez le problème, la population, les preuves connues, les contraintes, le résultat visé et l’incertitude restante.'),
    'ai.audience': L('Audience / who will use this', 'Audiencia / quién lo usará', 'Public / qui l’utilisera'), 'ai.idle': L('Model not loaded. Deterministic method generation is ready now.', 'Modelo no cargado. La generación determinista está lista ahora.', 'Modèle non chargé. La génération déterministe est prête.'),
    'ai.load': L('Load local model…', 'Cargar modelo local…', 'Charger le modèle local…'), 'ai.unload': L('Unload model', 'Descargar modelo', 'Décharger le modèle'), 'ai.gen': L('Generate segmented chain', 'Generar cadena segmentada', 'Générer la chaîne segmentée'), 'ai.cancel': L('Stop generating', 'Detener generación', 'Arrêter la génération'), 'ai.out': L('Generated chain / method', 'Cadena / método generado', 'Chaîne / méthode générée'),
    'ai.outIdle': L('Enter a challenge and generate. The fallback produces eight reviewable stages (frame → evidence → mechanisms → methods → experiment → collaboration → execution → review) plus an Anti-Inversion gate.', 'Escriba un desafío y genere. La alternativa produce ocho etapas revisables (marco → evidencia → mecanismos → métodos → experimento → colaboración → ejecución → revisión) más una puerta anti-inversión.', 'Saisissez un défi et générez. Le repli produit huit étapes vérifiables (cadrage → preuves → mécanismes → méthodes → expérience → collaboration → exécution → revue) plus une porte anti-inversion.'),
    'ai.copy': L('Copy output', 'Copiar resultado', 'Copier le résultat'), 'ai.saveBrief': L('Save as brief draft', 'Guardar como borrador de resumen', 'Enregistrer comme brouillon de note'), 'ai.warn': L('Drafts can contain invented details. Verify before adopting or sharing.', 'Los borradores pueden contener detalles inventados. Verifique antes de adoptar o compartir.', 'Les brouillons peuvent contenir des détails inventés. Vérifiez avant d’adopter ou de partager.'),
    'ai.consentTitle': L('Download a local model?', '¿Descargar un modelo local?', 'Télécharger un modèle local ?'),
    'ai.consentBody': L('This downloads model files once (about {mb} MB of GPU memory when running; the download itself can be larger) and stores them in your browser cache. After that it can run offline.\n\nHosts contacted: esm.sh (code), huggingface.co (model weights) and raw.githubusercontent.com (model library). They will see your IP address and which model you requested. Your text is NEVER sent to them; inference happens on your device.\n\nIt needs WebGPU and enough free memory. On shared or school devices, ask first.', 'Esto descarga archivos del modelo una vez (unos {mb} MB de memoria GPU al ejecutarse; la descarga puede ser mayor) y los guarda en la caché del navegador. Después puede funcionar sin conexión.\n\nServidores contactados: esm.sh (código), huggingface.co (pesos del modelo) y raw.githubusercontent.com (biblioteca del modelo). Verán su dirección IP y qué modelo pidió. Su texto NUNCA se les envía; la inferencia ocurre en su dispositivo.\n\nRequiere WebGPU y memoria libre suficiente. En dispositivos compartidos o escolares, pregunte antes.', 'Ceci télécharge les fichiers du modèle une fois (environ {mb} Mo de mémoire GPU en fonctionnement ; le téléchargement peut être plus gros) et les range dans le cache du navigateur. Ensuite il peut fonctionner hors ligne.\n\nHôtes contactés : esm.sh (code), huggingface.co (poids du modèle) et raw.githubusercontent.com (bibliothèque du modèle). Ils verront votre adresse IP et le modèle demandé. Votre texte ne leur est JAMAIS envoyé ; l’inférence se fait sur votre appareil.\n\nIl faut WebGPU et assez de mémoire libre. Sur un appareil partagé ou scolaire, demandez d’abord.'),
    'ai.consentOk': L('Download and load', 'Descargar y cargar', 'Télécharger et charger'), 'ai.noGpu': L('WebGPU is unavailable here. The deterministic chain remains available.', 'WebGPU no está disponible aquí. La cadena determinista sigue disponible.', 'WebGPU est indisponible ici. La chaîne déterministe reste disponible.'), 'ai.offline': L('Offline, and the model is not cached. Use the deterministic chain or reconnect.', 'Sin conexión y el modelo no está en caché. Use la cadena determinista o reconéctese.', 'Hors ligne et modèle non mis en cache. Utilisez la chaîne déterministe ou reconnectez-vous.'),
    'ai.loading': L('Loading the local model… first use downloads files.', 'Cargando el modelo local… el primer uso descarga archivos.', 'Chargement du modèle local… le premier usage télécharge des fichiers.'), 'ai.ready': L('Local model ready: {m}. Inference stays in this browser.', 'Modelo local listo: {m}. La inferencia se queda en este navegador.', 'Modèle local prêt : {m}. L’inférence reste dans ce navigateur.'), 'ai.fail': L('The model could not start: {m}. The deterministic chain remains available.', 'El modelo no pudo iniciarse: {m}. La cadena determinista sigue disponible.', 'Le modèle n’a pas pu démarrer : {m}. La chaîne déterministe reste disponible.'),
    'ai.unloaded': L('Model unloaded; GPU memory released.', 'Modelo descargado; memoria GPU liberada.', 'Modèle déchargé ; mémoire GPU libérée.'), 'ai.generating': L('Generating locally…', 'Generando localmente…', 'Génération locale…'), 'ai.done': L('Done. Review the draft before adopting any method or sharing it.', 'Listo. Revise el borrador antes de adoptar un método o compartirlo.', 'Terminé. Relisez le brouillon avant d’adopter une méthode ou de le partager.'),
    'ai.fallbackDone': L('Deterministic chain generated. No model was used.', 'Cadena determinista generada. No se usó ningún modelo.', 'Chaîne déterministe générée. Aucun modèle n’a été utilisé.'), 'ai.genFail': L('Generation failed ({m}); the deterministic chain is shown instead.', 'La generación falló ({m}); se muestra la cadena determinista.', 'La génération a échoué ({m}) ; la chaîne déterministe est affichée.'), 'ai.stopped': L('Stopped.', 'Detenido.', 'Arrêté.'),
    'ai.f16no': L('Your graphics adapter does not report shader-f16; the f16 models are disabled.', 'Su adaptador gráfico no informa shader-f16; los modelos f16 están desactivados.', 'Votre adaptateur graphique ne signale pas shader-f16 ; les modèles f16 sont désactivés.'), 'ai.notInLib': L('That model id is not in the loaded library list.', 'Ese id de modelo no está en la lista de la biblioteca cargada.', 'Cet identifiant de modèle n’est pas dans la liste de la bibliothèque chargée.'), 'ai.savedBrief': L('Saved as a brief draft marked AI-assisted.', 'Guardado como borrador de resumen marcado como asistido por IA.', 'Enregistré comme brouillon de note marqué « assisté par IA ».'), 'ai.needText': L('Describe a challenge first.', 'Describa primero un desafío.', 'Décrivez d’abord un défi.'),
    'ai.blocked': L('This request looks aimed at harming, tracking, coercing, defrauding or excluding people ({c}), so this tool will not generate a plan for it. If you are working on protection, prevention or oversight, rephrase around safeguards, consent and who benefits. If this is about someone’s immediate safety, contact local emergency services or someone you trust.', 'Esta solicitud parece dirigida a dañar, rastrear, coaccionar, estafar o excluir a personas ({c}), por lo que esta herramienta no generará un plan para ello. Si trabaja en protección, prevención o supervisión, reformule en torno a salvaguardas, consentimiento y quién se beneficia. Si se trata de la seguridad inmediata de alguien, contacte a los servicios de emergencia locales o a alguien de confianza.', 'Cette demande semble viser à nuire, pister, contraindre, frauder ou exclure des personnes ({c}) ; cet outil ne produira donc pas de plan. Si vous travaillez sur la protection, la prévention ou le contrôle, reformulez autour des garanties, du consentement et des bénéficiaires. S’il s’agit de la sécurité immédiate de quelqu’un, contactez les services d’urgence locaux ou une personne de confiance.'),
    'hc.weapons': L('weapons or dangerous substances', 'armas o sustancias peligrosas', 'armes ou substances dangereuses'), 'hc.stalk': L('tracking or targeting individuals', 'rastreo o acoso a personas', 'pistage ou ciblage de personnes'), 'hc.coerce': L('coercion or manipulation', 'coerción o manipulación', 'coercition ou manipulation'), 'hc.cyber': L('attacking systems', 'ataques a sistemas', 'attaque de systèmes'), 'hc.fraud': L('fraud or falsification', 'fraude o falsificación', 'fraude ou falsification'), 'hc.exclude': L('discriminatory exclusion', 'exclusión discriminatoria', 'exclusion discriminatoire'), 'hc.minors': L('harm to children', 'daño a menores', 'préjudice aux enfants')
  });

  /* HARM-BOUNDARY FILTER ---------------------------------------------------------------------------------- */
  const V = '(?:how to|steps? to|instructions? (?:for|to)|recipe for|guide to|help me|plan to|way to|ways to|teach me to|show me how to)';
  const HARM_PATTERNS = [
    ['hc.weapons', new RegExp(V + '.{0,30}\\b(?:make|build|assemble|synthesi[sz]e|cook|manufacture|produce|weaponi[sz]e|culture)\\b.{0,40}\\b(?:bombs?|explosives?|pipe ?bombs?|nerve agents?|bio ?weapons?|chemical weapons?|ricin|sarin|anthrax|napalm|ghost guns?|untraceable (?:gun|firearm)s?|fentanyl|methamphetamine|\\bmeth\\b)', 'i')],
    ['hc.stalk', new RegExp('\\b(?:stalk|doxx?(?:ing)?|track down|spy on|secretly (?:track|monitor|record)|covertly (?:track|monitor|record)|find (?:out )?where .{0,30} lives|home address of)\\b', 'i')],
    ['hc.coerce', new RegExp('\\b(?:blackmail|extort|coerce|intimidate|silence|gaslight|groom|pressure)\\b.{0,50}\\b(?:witness|whistleblower|journalist|employee|worker|student|child|tenant|patient|victim|neighbou?r|partner|elder)s?\\b', 'i')],
    ['hc.cyber', new RegExp('\\b(?:write|build|create|deploy|develop)\\b.{0,30}\\b(?:ransomware|keylogger|malware|botnet|phishing (?:kit|page|site)|credential stealer|ddos)\\b|\\b(?:hack into|break into)\\b.{0,30}\\b(?:account|network|server|phone|system)s?\\b', 'i')],
    ['hc.fraud', new RegExp('\\b(?:fabricate|falsify|forge|fake|invent|make up)\\b.{0,30}\\b(?:data|results|evidence|citations?|signatures?|survey responses|test scores|receipts|credentials|identity|ids?)\\b', 'i')],
    ['hc.exclude', new RegExp('\\b(?:screen out|filter out|exclude|deny|reject|blacklist|redline)\\b.{0,60}\\b(?:based on|by|because of)\\b.{0,20}\\b(?:race|ethnicity|religion|gender|sexual orientation|disabilit\\w*|caste|nationality|immigration status|age)\\b', 'i')],
    ['hc.minors', new RegExp('\\b(?:child|children|kid|kids|minor|minors|teen|teenager|student)s?\\b.{0,60}\\b(?:without (?:their|parental|parent|guardian) (?:consent|knowledge|permission)|secretly|covertly)\\b.{0,40}\\b(?:track|monitor|record|film|photograph|test|experiment|profile)\\b', 'i')]
  ];
  EP.guard = {
    check(...texts) { const s = EP.search.fold(texts.join(' \n ')).replace(/\s+/g, ' '); const hits = []; for (const [cat, re] of HARM_PATTERNS) if (re.test(s)) hits.push(cat); return { blocked: hits.length > 0, categories: hits }; },
    message(hits) { return t('ai.blocked', { c: EP.i18n.fmt.list(hits.map(h => t(h))) }); },
    patterns: HARM_PATTERNS.map(p => p[0])
  };

  /* DETERMINISTIC FALLBACK ----------------------------------------------------------------------------------- */
  const STAGES = [
    ['Frame', 'Define the affected population, the observed condition, a measurable desired outcome and the non-negotiable constraints. Say who is NOT yet in the conversation.'],
    ['Evidence', 'Separate direct observations from assumptions. List the primary sources needed, contrary evidence and the risk that data are stale.'],
    ['Mechanisms', 'Write at least three causal mechanisms and one null explanation (“nothing here is causing this”). State what each one predicts.'],
    ['Methods', 'For each mechanism design the least hazardous feasible action, with permissions, resources, dependencies and stop rules.'],
    ['Experiment', 'Choose a baseline, a comparison where feasible, a measurement interval, success and failure thresholds, and the main confounders.'],
    ['Collaboration', 'Assign roles across affected people, domain experts, implementers, data stewards, funders and an independent reviewer. Name how people can say no.'],
    ['Execution', 'Turn the preferred method into reversible tasks with owners, evidence requirements, checkpoints and rollback conditions.'],
    ['Review', 'Compare measured results with predictions, record harms and null results, revise the plan, and publish only data people consented to share.']
  ];
  function deterministicPlan(prompt, audience) {
    const p = (prompt || '').trim() || 'the selected challenge', a = (audience || '').trim() || 'multidisciplinary collaborators';
    return 'LOCAL DETERMINISTIC CHAIN · no model inference occurred\n\nChallenge: ' + p + '\nAudience: ' + a + '\n\n' +
      STAGES.map(([n, b], i) => (i + 1) + '. ' + n.toUpperCase() + '\n' + b + '\nPrompt: For “' + p + '”, produce this stage for ' + a + '. Mark facts, inferences, hypotheses, unknowns, required permissions and evidence gaps separately.').join('\n\n') +
      '\n\nANTI-INVERSION GATE (before stage 7)\nAsk: could this plan be flipped into surveillance, coercion, exclusion or extraction? Who bears the cost? Who was not consulted? What is the sunset date? Record answers in Decision toolkit → Risks & anti-inversion.' +
      '\n\nMETHOD-OF-ACTION RULE\nDo not optimise for activity volume. Prefer actions whose mechanism, safety boundary, measurable outcome and reversibility can be tested. Escalate legal, medical, structural, hazardous or otherwise high-consequence actions to qualified people and the people affected. This text is a planning scaffold, not a finding.';
  }

  /* MODEL LIFECYCLE ------------------------------------------------------------------------------------------- */
  let engine = null, worker = null, workerUrl = '', loading = false, generating = false, hasF16 = null, lib = null, currentModel = '';
  const setStatus = v => { const e = $('aiStatus'); if (e) e.textContent = v; };
  const setProgress = v => { const e = $('aiProgress'); if (e) e.style.width = Math.max(0, Math.min(100, v)) + '%'; };
  async function detectF16() { if (hasF16 !== null) return hasF16; try { const a = navigator.gpu && await navigator.gpu.requestAdapter(); hasF16 = !!(a && a.features && a.features.has('shader-f16')); } catch { hasF16 = false; } return hasF16; }
  function fillModels() {
    const sel = $('aiModel'); if (!sel) return; const cur = sel.value;
    sel.replaceChildren(...MODEL_CHOICES.map(m => U.el('option', { value: m.id, text: m.label + ' · ~' + m.mb + ' MB', disabled: (m.f16 && hasF16 === false) ? '' : null })));
    sel.value = cur && MODEL_CHOICES.some(m => m.id === cur) ? cur : MODEL_CHOICES[0].id; const n = $('aiModelNote'); if (n) n.textContent = hasF16 === false ? t('ai.f16no') : '';
  }
  async function loadModel() {
    if (engine || loading) return; const id = $('aiModel').value, choice = MODEL_CHOICES.find(m => m.id === id) || MODEL_CHOICES[0];
    if (EP.strict) return setStatus(t('co.blockedStrict')); if (!EP.features.has('webgpu')) return setStatus(t('ai.noGpu')); if (!navigator.onLine) return setStatus(t('ai.offline'));
    const ok = await EP.ui.dialog({ title: t('ai.consentTitle'), body: t('ai.consentBody', { mb: choice.mb }), actions: [{ id: 'cancel', label: t('ui.cancel') }, { id: 'ok', label: t('ai.consentOk'), primary: true }] }); if (ok !== 'ok') return;
    await detectF16(); fillModels(); if (choice.f16 && hasF16 === false) return setStatus(t('ai.f16no'));
    loading = true; $('loadAiModel').disabled = true; setProgress(2); setStatus(t('ai.loading')); EP.analytics.record('aiLoad');
    try {
      lib = lib || await EP.net.importModule(WEBLLM_URL, 'WebLLM library (local model runtime)');
      const list = (lib.prebuiltAppConfig && lib.prebuiltAppConfig.model_list) || []; if (list.length && !list.some(m => m.model_id === choice.id)) throw new Error(t('ai.notInLib'));
      EP.net.record('declared', 'https://huggingface.co', 'model weights (fetched inside the worker)'); EP.net.record('declared', 'https://raw.githubusercontent.com', 'model library (fetched inside the worker)');
      const src = "import { WebWorkerMLCEngineHandler } from '" + WEBLLM_URL + "';\nconst handler = new WebWorkerMLCEngineHandler();\nself.onmessage = m => handler.onmessage(m);\n";
      workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); worker = new Worker(workerUrl, { type: 'module' });
      engine = await lib.CreateWebWorkerMLCEngine(worker, choice.id, { initProgressCallback: r => { const pct = typeof r.progress === 'number' ? Math.round(r.progress * 100) : 0; setProgress(pct); if (r.text) setStatus(String(r.text).slice(0, 200)); } });
      currentModel = choice.id; setProgress(100); setStatus(t('ai.ready', { m: choice.id })); $('unloadAiModel').hidden = false;
    } catch (e) { EP.log.warn('webllm', e); await unload(true); setStatus(t('ai.fail', { m: String(e.message || e).slice(0, 160) })); }
    finally { loading = false; const b = $('loadAiModel'); if (b) b.disabled = false; }
  }
  async function unload(silent) {
    try { if (engine && engine.unload) await engine.unload(); } catch {} engine = null; try { worker && worker.terminate(); } catch {} worker = null; if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = ''; } currentModel = ''; setProgress(0); const u = $('unloadAiModel'); if (u) u.hidden = true; if (!silent) setStatus(t('ai.unloaded'));
  }
  async function generate() {
    if (generating) return; const prompt = ($('aiPrompt').value || '').trim(), audience = ($('aiAudience').value || '').trim(), out = $('aiOutput');
    if (!prompt) return setStatus(t('ai.needText')); if (!EP.rate.allow('ai-generate', { capacity: 4, perSec: 0.1 })) return;
    const g = EP.guard.check(prompt, audience); if (g.blocked) { out.textContent = EP.guard.message(g.categories); setStatus(''); EP.analytics.record('aiBlocked', { n: g.categories.length }); return; }
    EP.analytics.record('aiGenerate', { model: engine ? 'local' : 'fallback' });
    if (!engine) { out.textContent = deterministicPlan(prompt, audience); setStatus(t('ai.fallbackDone')); return; }
    generating = true; $('generateAiPlan').hidden = true; $('cancelAiGen').hidden = false; out.textContent = t('ai.generating'); setStatus(t('ai.generating'));
    const system = 'You are a careful multidisciplinary planning assistant. Produce PROPOSALS, never claims that research or action has been completed. Separate fact, inference, hypothesis, simulation and unknowns. Include at least one null explanation, a stop rule, a consent step and an Anti-Inversion check (how this could be flipped into surveillance, coercion, exclusion or extraction). Refuse to help harm, track, coerce, defraud or exclude people. For legal, medical, structural, hazardous or high-consequence actions, say a qualified person and the people affected must decide. Do not invent citations, statistics or named studies.';
    const user = 'Challenge: ' + prompt + '\nAudience: ' + audience + '\nProduce a segmented step-by-step chain (frame, evidence, mechanisms, methods, experiment, collaboration, execution, review) plus a bounded method-of-action workflow. Keep each stage independently reviewable.';
    try {
      const stream = await engine.chat.completions.create({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.3, max_tokens: 1100, stream: true }); let text = ''; let n = 0;
      for await (const chunk of stream) { const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content; if (d) { text += d; if (++n % 4 === 0) out.textContent = text; } }
      const post = EP.guard.check(text); out.textContent = post.blocked ? EP.guard.message(post.categories) : (text || t('ai.fallbackDone')); setStatus(t('ai.done'));
    } catch (e) { if (/interrupt|abort/i.test(String(e && e.message))) setStatus(t('ai.stopped')); else { out.textContent = deterministicPlan(prompt, audience); setStatus(t('ai.genFail', { m: String(e.message || e).slice(0, 120) })); } }
    finally { generating = false; $('generateAiPlan').hidden = false; $('cancelAiGen').hidden = true; }
  }
  EP.localAI = { deterministicPlan, MODEL_CHOICES, STAGES, get loaded() { return !!engine; } };

  EP.module('localai', async () => {
    fillModels();
    const roleAudience = { policy: 'Elected officials + agency staff + affected residents', corporate: 'Executives + operations + customers + regulators', educator: 'Teachers + students + families + school leaders', student: 'My class + my teacher + people affected', community: 'Neighbours + local groups + service providers' };
    const a = $('aiAudience'); if (a && roleAudience[EP.settings.get('role')]) a.value = roleAudience[EP.settings.get('role')];
    $('loadAiModel')?.addEventListener('click', loadModel); $('unloadAiModel')?.addEventListener('click', () => unload()); $('generateAiPlan')?.addEventListener('click', generate); $('cancelAiGen')?.addEventListener('click', async () => { try { engine && await engine.interruptGenerate(); } catch {} });
    $('copyAiPlan')?.addEventListener('click', () => EP.ui.copy($('aiOutput').textContent));
    $('saveAiBrief')?.addEventListener('click', () => { const txt = ($('aiOutput').textContent || '').trim(); if (!txt || EP.guard.check($('aiPrompt').value || '', txt).blocked) return; try { EP.coll('briefs').save({ title: 'AI-assisted draft: ' + ($('aiPrompt').value || '').slice(0, 80), kind: 'policy', problem: ($('aiPrompt').value || '').slice(0, 1200), recommendation: txt.slice(0, 1200), limits: 'AI-assisted draft. Unverified: check every claim against primary sources before relying on it.', options: [] }); EP.ui.toast(t('ai.savedBrief')); } catch (e) { if (e.message !== 'limit') EP.ui.toast(e.message); } });
    EP.on('lang', () => { fillModels(); if (!engine && !loading) setStatus(t('ai.idle')); });
    EP.on('settings:youthSafe', () => { const b = $('loadAiModel'); if (b) b.title = EP.settings.get('youthSafe') ? t('co.blockedYouth') : ''; });
    if (EP.strict) { const b = $('loadAiModel'); if (b) { b.disabled = true; b.title = t('co.blockedStrict'); } }
  }, { order: 56 });
})();
