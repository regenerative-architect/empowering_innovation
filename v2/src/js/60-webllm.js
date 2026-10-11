const $ = id => document.getElementById(id);
let engine = null;
let loading = false;

const FALLBACK_STAGES = [
  ['Frame','Define the affected population, observed condition, desired measurable outcome, and non-negotiable constraints.'],
  ['Evidence','Separate direct observations from assumptions. List primary sources needed, contrary evidence, and stale-data risks.'],
  ['Mechanisms','Generate at least three causal mechanisms and one null explanation; specify what each predicts.'],
  ['Methods','Design the least hazardous feasible action for each mechanism, with permissions, resources, dependencies, and stopping rules.'],
  ['Experiment','Choose a baseline, comparison where feasible, measurement interval, success threshold, failure threshold, and confounders.'],
  ['Collaboration','Assign roles across affected users, domain experts, implementers, data stewards, funders, and independent reviewers.'],
  ['Execution','Convert the preferred method into reversible tasks with owners, evidence requirements, checkpoints, and rollback conditions.'],
  ['Review','Compare measured outcomes to predictions, document harms and null results, revise the innovation genome, and publish only consented data.']
];

function deterministicPlan(prompt,audience){
  const p=(prompt||'').trim() || 'the selected challenge';
  const a=(audience||'multidisciplinary collaborators').trim();
  return `LOCAL DETERMINISTIC FALLBACK — no model inference occurred\n\nChallenge: ${p}\nAudience: ${a}\n\n`+
    FALLBACK_STAGES.map(([name,body],i)=>`${i+1}. ${name.toUpperCase()}\n${body}\nPrompt: For ${p}, produce this stage for ${a}. Mark facts, inference, hypotheses, unknowns, required permissions, and evidence gaps separately.`).join('\n\n')+
    `\n\nMethod-of-action rule: do not optimize for activity volume. Prefer interventions whose mechanism, safety boundary, measurable outcome, and reversibility can be tested. Escalate legal, medical, structural, hazardous, or high-consequence actions to qualified humans.`;
}

function setStatus(text){const el=$('aiStatus');if(el)el.textContent=text;}
function setProgress(v){const el=$('aiProgress');if(el)el.style.width=`${Math.max(0,Math.min(100,v))}%`;}

async function loadModel(){
  if(engine||loading) return;
  const model=$('aiModel')?.value || 'SmolLM2-360M-Instruct-q4f32_1-MLC';
  if(!('gpu' in navigator)){
    setStatus('WebGPU is unavailable. Deterministic local planning remains available.');
    return;
  }
  if(!navigator.onLine){
    setStatus('Offline and model is not already available through the browser cache. Use deterministic fallback or reconnect to install a model.');
    return;
  }
  loading=true;
  setStatus('Loading WebLLM worker and model… first use downloads model assets.');
  try{
    const webllm=await import('https://esm.sh/@mlc-ai/web-llm@0.2.85?bundle');
    const worker=new Worker('./js/webllm-worker.js',{type:'module'});
    engine=await webllm.CreateWebWorkerMLCEngine(worker,model,{
      initProgressCallback: report=>{
        const pct=typeof report.progress==='number'?Math.round(report.progress*100):0;
        setProgress(pct);
        setStatus(report.text || `Loading model… ${pct}%`);
      }
    });
    setProgress(100);
    setStatus(`Local model ready: ${model}. Inference stays in this browser; downloaded model artifacts are browser-cached by WebLLM.`);
  }catch(err){
    console.error(err);
    engine=null;
    setStatus(`WebLLM could not initialize: ${err.message}. Deterministic fallback remains available.`);
  }finally{loading=false;}
}

async function generate(){
  const prompt=$('aiPrompt')?.value||'';
  const audience=$('aiAudience')?.value||'';
  const out=$('aiOutput');
  if(!out) return;
  if(!engine){
    out.textContent=deterministicPlan(prompt,audience);
    setStatus('Generated deterministic fallback; no model was used. Load WebLLM if you want local generative synthesis.');
    return;
  }
  const system=`You are a bounded multidisciplinary R&D planner. Generate proposals, not claims of completed research or action. Distinguish fact, inference, hypothesis, simulation, metaphor, and unknowns. For consequential actions require explicit human approval, permissions, safety review, evidence checkpoints, stop rules, and rollback. Structure output as: problem frame; evidence gaps; competing mechanisms; three methods of action; multidisciplinary roles; phased execution; measurements; failure modes; next research prompts.`;
  const user=`Challenge: ${prompt}\nAudience: ${audience}\nProduce a segmented multi-step meta-prompt chain plus a concrete but bounded method-of-action workflow. Keep each stage independently reviewable and exportable.`;
  out.textContent='Generating locally…';
  setStatus('Running local WebLLM inference in a dedicated worker.');
  try{
    const reply=await engine.chat.completions.create({
      messages:[{role:'system',content:system},{role:'user',content:user}],
      temperature:0.35,
      max_tokens:1200
    });
    out.textContent=reply.choices?.[0]?.message?.content || 'The local model returned no text.';
    setStatus('Local inference complete. Review output before adopting any method or sharing it with peers.');
  }catch(err){
    out.textContent=deterministicPlan(prompt,audience);
    setStatus(`Inference failed (${err.message}); deterministic fallback shown instead.`);
  }
}

function init(){
  $('loadAiModel')?.addEventListener('click',loadModel);
  $('generateAiPlan')?.addEventListener('click',generate);
  $('copyAiPlan')?.addEventListener('click',async()=>{
    const text=$('aiOutput')?.textContent||'';
    if(text) await navigator.clipboard?.writeText(text);
  });
  const badge=$('webgpuStatus');
  if(badge) badge.textContent=('gpu' in navigator)?'WebGPU API detected':'WebGPU unavailable';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
