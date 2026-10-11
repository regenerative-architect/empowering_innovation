const $ = id => document.getElementById(id);

function log(msg){
  const box = $('enhancementLog');
  if(box){
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    box.prepend(line);
  }
}

function setupSplash(){
  const splash = $('launchSplash');
  const enter = $('enterWorkspace');
  if(!splash || !enter) return;
  const steps = [...splash.querySelectorAll('.splash-step')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delays = reduce ? [0,0,0] : [500,1500,2700];
  steps.forEach((el,i)=>setTimeout(()=>el.dataset.ready='true',delays[i]));
  let entered = false;
  const close = () => {
    if(entered) return;
    entered = true;
    splash.setAttribute('aria-hidden','true');
    try{sessionStorage.setItem('ep-v3-entered','1')}catch{}
    window.dispatchEvent(new CustomEvent('empowerment:entered'));
    setTimeout(()=>splash.remove(),650);
  };
  enter.addEventListener('click', close);
  // The splash never traps users indefinitely. It auto-enters after a generous interval,
  // while the button remains immediately available from first paint.
  setTimeout(close, reduce ? 3500 : 9000);
}

function setupTooltips(){
  const tip = document.createElement('div');
  tip.className = 'tooltip-box';
  tip.id = 'globalTooltip';
  tip.setAttribute('role','tooltip');
  document.body.append(tip);
  let active = null;
  const close = () => {
    tip.dataset.open='false';
    if(active) active.setAttribute('aria-expanded','false');
    active = null;
  };
  const open = el => {
    const text = el.getAttribute('data-tooltip');
    if(!text) return;
    active = el;
    tip.textContent = text;
    tip.dataset.open='true';
    el.setAttribute('aria-expanded','true');
    const r = el.getBoundingClientRect();
    const pad = 10;
    const top = Math.min(window.innerHeight - tip.offsetHeight - pad, r.bottom + 8);
    const left = Math.max(pad, Math.min(window.innerWidth - tip.offsetWidth - pad, r.left - 40));
    tip.style.top = `${Math.max(pad,top)}px`;
    tip.style.left = `${left}px`;
  };
  document.addEventListener('pointerover',e=>{
    const el=e.target.closest('[data-tooltip]');
    if(el) open(el);
  });
  document.addEventListener('pointerout',e=>{
    if(e.target.closest('[data-tooltip]')) close();
  });
  document.addEventListener('focusin',e=>{
    const el=e.target.closest('[data-tooltip]');
    if(el) open(el);
  });
  document.addEventListener('focusout',e=>{
    if(e.target.closest('[data-tooltip]')) close();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape') close()});
}

async function setupPWA(){
  const out = $('pwaStatus');
  const update = text => { if(out) out.textContent = text; };
  if(!('serviceWorker' in navigator)) return update('Service workers unavailable in this browser. Core local tools still work.');
  if(location.protocol==='file:') return update('Opened as file://. Service workers require HTTPS or localhost; use a static host for install/offline caching.');
  try{
    const reg = await navigator.serviceWorker.register('./sw.js');
    update('PWA service worker registered. Core shell can be cached after first successful hosted load.');
    reg.addEventListener('updatefound',()=>log('A newer service-worker version is available.'));
  }catch(err){
    update(`PWA registration failed: ${err.message}`);
  }
}

async function renderDomainBriefs(){
  const target = $('domainBriefGrid');
  if(!target) return;
  try{
    const res = await fetch('./data/domain-briefs.json',{cache:'no-cache'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    target.replaceChildren(...data.domains.map(d=>{
      const article=document.createElement('article');
      article.innerHTML = `<h3>${escapeHtml(d.name)}</h3>
        <p><strong>Method:</strong> ${escapeHtml(d.method)}</p>
        <p><strong>Collaborators:</strong> ${d.collaborators.map(escapeHtml).join(' · ')}</p>
        <p class="small"><strong>Falsification / failure signal:</strong> ${escapeHtml(d.failure_test)}</p>`;
      return article;
    }));
  }catch(err){
    target.innerHTML='<p class="muted">Domain brief file could not be loaded. The original ten embedded research engines above remain available.</p>';
  }
}

async function renderSources(){
  const target=$('advancedSources');
  if(!target) return;
  try{
    const res=await fetch('./data/sources.json',{cache:'no-cache'});
    const data=await res.json();
    target.replaceChildren(...data.sources.map(s=>{
      const art=document.createElement('article');
      art.className='evidence-card';
      const a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=s.title;
      const h=document.createElement('h3');h.append(a);
      const p=document.createElement('p');p.textContent=s.notes;
      const sm=document.createElement('small');sm.textContent=`${s.publisher} · snapshot ${data.snapshot_date}`;
      art.append(h,p,sm);return art;
    }));
  }catch(err){
    target.innerHTML='<p class="muted">Source metadata is temporarily unavailable offline until the data file has been cached once.</p>';
  }
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function setupConnectivity(){
  const el=$('networkStatus');
  const paint=()=>{if(el) el.textContent=navigator.onLine?'Browser reports online':'Browser reports offline';};
  paint();addEventListener('online',paint);addEventListener('offline',paint);
}

function setupInstallButton(){
  const btn=$('installPwa');
  if(!btn) return;
  let promptEvent=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;btn.hidden=false});
  btn.addEventListener('click',async()=>{
    if(!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice;
    promptEvent=null;btn.hidden=true;
  });
}

function init(){
  setupSplash();
  setupTooltips();
  setupPWA();
  setupConnectivity();
  setupInstallButton();
  renderDomainBriefs();
  renderSources();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
