const VERSION='empowerment-os-v3.0.0-2026-09-28';
const CORE=`${VERSION}:core`;
const RUNTIME=`${VERSION}:runtime`;
const CORE_URLS=[
  './','./index.html','./manifest.webmanifest','./css/advanced.css',
  './js/enhancements.js','./js/multiplayer.js','./js/webllm.js','./js/webllm-worker.js',
  './data/sources.json','./data/domain-briefs.json','./icons/icon-192.svg','./icons/icon-512.svg'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CORE).then(c=>c.addAll(CORE_URLS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('empowerment-os-')&&!k.startsWith(VERSION)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(RUNTIME).then(c=>c.put(req,copy));return r}).catch(()=>caches.match('./index.html')));
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(RUNTIME).then(c=>c.put(req,copy));}return r})));
    return;
  }
  // Runtime-cache third-party module/model requests only after a successful online fetch.
  // This does not promise first-use offline availability for Trystero/WebLLM/model assets.
  if(['esm.sh','huggingface.co','raw.githubusercontent.com'].includes(url.hostname)){
    event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==='opaque'){const copy=r.clone();caches.open(RUNTIME).then(c=>c.put(req,copy));}return r})));
  }
});
