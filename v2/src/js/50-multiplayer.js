const $ = id => document.getElementById(id);
const APP_ID = 'foster-navi-empowerment-recursive-innovation-os-v3';
const PUBLIC_ROOM = 'empowerment-commons-public-v1';
const SCHEMA = 'empowerment-collab-record/1';
const STRATEGIES = {
  nostr: 'https://esm.sh/trystero@0.25.3?bundle',
  mqtt: 'https://esm.sh/@trystero-p2p/mqtt@0.25.3?bundle',
  torrent: 'https://esm.sh/@trystero-p2p/torrent@0.25.3?bundle',
  ipfs: 'https://esm.sh/@trystero-p2p/ipfs@0.25.3?bundle'
};
const sessionPeer = (()=>{
  try{
    const old=sessionStorage.getItem('ep-v3-peer');
    if(old) return old;
    const id=crypto.randomUUID();sessionStorage.setItem('ep-v3-peer',id);return id;
  }catch{return `peer-${Date.now()}-${Math.random().toString(36).slice(2)}`}
})();

let db=null;
let records=[];
const peers=new Map();
const remoteRooms=new Map();
const bcRooms=new Map();
let publicStarted=false;
let focusedRoomKey=null;

function now(){return new Date().toISOString()}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uid(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}
function log(msg){const el=$('transportLog');if(!el)return;el.textContent=`[${new Date().toLocaleTimeString()}] ${msg}\n`+el.textContent.slice(0,7000)}
function setText(id,text){const el=$(id);if(el)el.textContent=text}

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('empowerment_recursive_collab_v3',1);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains('records')) d.createObjectStore('records',{keyPath:'id'});
      if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'key'});
    };
    req.onsuccess=()=>{db=req.result;resolve(db)};
    req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function idbGetAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbPut(store,value){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(value);r.onsuccess=()=>res(value);r.onerror=()=>rej(r.error)})}
function idbDelete(store,key){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

function localProfile(){
  return {
    peerId:sessionPeer,
    display:($('collabDisplay')?.value||'Local collaborator').slice(0,80),
    entity:($('collabEntity')?.value||'family').slice(0,40),
    discipline:($('collabDiscipline')?.value||'community').slice(0,60),
    note:'Unverified self-description; peer IDs are not identity credentials.',
    seenAt:now()
  };
}

async function hashRecord(r){
  const body=JSON.stringify({id:r.id,kind:r.kind,title:r.title,body:r.body,domain:r.domain,entity:r.entity,discipline:r.discipline,status:r.status,revision:r.revision,updatedAt:r.updatedAt});
  if(!crypto.subtle)return '';
  const dig=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
  return [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function normalizeRecord(input){
  const allowedKind=['project','task','comment','decision','evidence','need','resource'];
  const allowedStatus=['proposed','active','blocked','done','archived'];
  return {
    schema:SCHEMA,
    id:String(input.id||uid()).slice(0,160),
    kind:allowedKind.includes(input.kind)?input.kind:'comment',
    title:String(input.title||'Untitled').slice(0,160),
    body:String(input.body||'').slice(0,7000),
    domain:String(input.domain||'cross-domain').slice(0,80),
    entity:String(input.entity||'community').slice(0,80),
    discipline:String(input.discipline||'general').slice(0,100),
    status:allowedStatus.includes(input.status)?input.status:'proposed',
    scope:String(input.scope||'local').slice(0,120),
    revision:Math.max(1,Math.min(999999,Number(input.revision)||1)),
    createdAt:String(input.createdAt||now()),
    updatedAt:String(input.updatedAt||now()),
    author:String(input.author||sessionPeer).slice(0,160),
    hash:String(input.hash||'').slice(0,128),
    conflictOf:input.conflictOf?String(input.conflictOf).slice(0,160):null,
    provenance:{
      source:String(input.provenance?.source||'human-entered').slice(0,80),
      sourcePeer:String(input.provenance?.sourcePeer||input.author||sessionPeer).slice(0,160),
      receivedAt:String(input.provenance?.receivedAt||now())
    }
  };
}

async function saveRecord(record,{broadcast=true}={}){
  const r=normalizeRecord(record);
  r.hash=await hashRecord(r);
  await idbPut('records',r);
  const ix=records.findIndex(x=>x.id===r.id);
  if(ix>=0)records[ix]=r;else records.push(r);
  renderRecords();
  if(broadcast) await broadcastRecord(r);
  return r;
}

function comparable(r){return JSON.stringify({kind:r.kind,title:r.title,body:r.body,domain:r.domain,entity:r.entity,discipline:r.discipline,status:r.status,revision:r.revision,updatedAt:r.updatedAt})}
async function mergeIncoming(input,sourcePeer='unknown',transport='peer'){
  const incoming=normalizeRecord({...input,provenance:{...input.provenance,sourcePeer,receivedAt:now()}});
  const local=records.find(r=>r.id===incoming.id);
  if(!local){await saveRecord(incoming,{broadcast:false});log(`Merged ${incoming.kind} ${incoming.id.slice(0,8)} from ${transport}.`);return 'added'}
  if(comparable(local)===comparable(incoming)) return 'same';
  if(incoming.revision>local.revision || (incoming.revision===local.revision && incoming.updatedAt>local.updatedAt && incoming.hash===local.hash)){
    await saveRecord(incoming,{broadcast:false});log(`Accepted newer revision ${incoming.revision} for ${incoming.id.slice(0,8)}.`);return 'updated';
  }
  if(incoming.revision===local.revision && comparable(local)!==comparable(incoming)){
    incoming.id=`${incoming.id}~conflict~${String(sourcePeer).slice(0,8)}~${Date.now()}`;
    incoming.conflictOf=local.id;
    incoming.title=`${incoming.title} · conflict copy`;
    incoming.hash=await hashRecord(incoming);
    await saveRecord(incoming,{broadcast:false});
    log(`Conflict preserved as fork for ${local.id.slice(0,8)}; nothing was silently overwritten.`);return 'conflict';
  }
  return 'ignored';
}

function snapshot(scope){
  const filtered=scope?records.filter(r=>r.scope===scope || r.scope==='local'):records;
  return {schema:'empowerment-collab-snapshot/1',exportedAt:now(),from:localProfile(),records:filtered.slice(0,1000)};
}
async function mergeSnapshot(s,peer,transport){
  if(!s||s.schema!=='empowerment-collab-snapshot/1'||!Array.isArray(s.records))return;
  let changed=0,conflicts=0;
  for(const r of s.records.slice(0,1000)){
    const result=await mergeIncoming(r,peer,transport);
    if(result==='added'||result==='updated')changed++;
    if(result==='conflict')conflicts++;
  }
  log(`Snapshot merged from ${String(peer).slice(0,10)}: ${changed} changed, ${conflicts} conflicts preserved.`);
}

function ensureBroadcastRoom(roomId){
  if(!('BroadcastChannel' in window))return null;
  if(bcRooms.has(roomId))return bcRooms.get(roomId);
  const bc=new BroadcastChannel(`ep-v3:${roomId}`);
  bc.onmessage=async e=>{
    const m=e.data||{};
    if(m.from===sessionPeer || (m.to&&m.to!==sessionPeer))return;
    if(m.type==='hello'){
      bc.postMessage({type:'presence',from:sessionPeer,to:m.from,profile:localProfile()});
      bc.postMessage({type:'snapshot',from:sessionPeer,to:m.from,snapshot:snapshot(roomId)});
    }else if(m.type==='presence'){
      notePeer(m.from,m.profile,'same-device',roomId);
    }else if(m.type==='record'){
      await mergeIncoming(m.record,m.from,'BroadcastChannel');
    }else if(m.type==='snapshot'){
      await mergeSnapshot(m.snapshot,m.from,'BroadcastChannel');
    }
  };
  bc.postMessage({type:'hello',from:sessionPeer,profile:localProfile()});
  bcRooms.set(roomId,bc);
  return bc;
}

function broadcastBC(roomId,message){
  const bc=ensureBroadcastRoom(roomId);
  if(bc)bc.postMessage({...message,from:sessionPeer});
}

function notePeer(peerId,profile={},transport='peer',roomId=''){
  const key=`${transport}:${roomId}:${peerId}`;
  peers.set(key,{peerId,profile:{...profile},transport,roomId,lastSeen:now()});
  renderPeers();
}
function removePeer(peerId,transport,roomId){
  peers.delete(`${transport}:${roomId}:${peerId}`);renderPeers();
}

async function strategyModule(strategy){
  const url=STRATEGIES[strategy];
  if(!url)throw new Error('Unsupported discovery strategy');
  return import(url);
}

function turnConfigFromUi(){
  const enabled=$('turnEnabled')?.checked;
  const url=$('turnUrl')?.value.trim();
  if(!enabled||!url)return undefined;
  const server={urls:[url]};
  const user=$('turnUser')?.value.trim();
  const credential=$('turnCredential')?.value;
  if(user)server.username=user;
  if(credential)server.credential=credential;
  return [server];
}

async function joinRemoteRoom({roomId,strategy='nostr',password='',kind='focus'}){
  if(!navigator.onLine)throw new Error('Browser is offline. Same-device BroadcastChannel collaboration still works.');
  const key=`${kind}:${strategy}:${roomId}`;
  if(remoteRooms.has(key))return remoteRooms.get(key);
  const mod=await strategyModule(strategy);
  const cfg={appId:APP_ID};
  if(password)cfg.password=password;
  const turn=turnConfigFromUi();
  if(turn)cfg.turnConfig=turn;
  const room=mod.joinRoom(cfg,roomId,{
    onJoinError:details=>{
      log(`Join error for ${roomId}: ${details?.error?.message||details?.error||'unknown error'}. If SDP exchanged but direct WebRTC failed, TURN may be required.`);
      setText('remoteStatus','Direct P2P connection issue detected; review TURN fallback and network policy.');
    }
  });
  const recordAction=room.makeAction('record');
  const presenceAction=room.makeAction('presence');
  const snapshotAction=room.makeAction('snapshot',{kind:'request',onRequest:()=>snapshot(roomId)});
  recordAction.onMessage=(data,{peerId})=>mergeIncoming(data,peerId,`Trystero/${strategy}`);
  presenceAction.onMessage=(data,{peerId})=>notePeer(peerId,data,`Trystero/${strategy}`,roomId);
  room.onPeerJoin=async peerId=>{
    notePeer(peerId,{},`Trystero/${strategy}`,roomId);
    presenceAction.send(localProfile(),{target:peerId}).catch(()=>{});
    try{
      const snap=await snapshotAction.request({want:'empowerment-collab-snapshot/1'},{target:peerId,timeoutMs:7000});
      await mergeSnapshot(snap,peerId,`Trystero/${strategy}`);
    }catch(err){log(`Snapshot request to ${peerId.slice(0,8)} did not complete: ${err.message}`)}
  };
  room.onPeerLeave=peerId=>removePeer(peerId,`Trystero/${strategy}`,roomId);
  remoteRooms.set(key,{key,kind,roomId,strategy,room,recordAction,presenceAction,snapshotAction});
  ensureBroadcastRoom(roomId);
  log(`Joined ${kind} room “${roomId}” via ${strategy}; direct browser-to-browser data channels will be used after peer discovery.`);
  renderRoomStatus();
  return remoteRooms.get(key);
}

async function startPublic(){
  if(publicStarted)return;
  publicStarted=true;
  ensureBroadcastRoom(PUBLIC_ROOM);
  setText('publicRoomStatus','Same-device public room active. Connecting Nostr discovery…');
  try{
    await joinRemoteRoom({roomId:PUBLIC_ROOM,strategy:'nostr',kind:'public'});
    setText('publicRoomStatus','Public commons joined via Nostr + WebRTC; BroadcastChannel fallback is also active.');
  }catch(err){
    publicStarted=false;
    setText('publicRoomStatus',`Public internet room unavailable: ${err.message}. Same-device room remains active; the app will retry when connectivity changes.`);
  }
}

async function connectFocus(){
  const roomId=($('focusRoomId')?.value||'').trim();
  if(!roomId){setText('remoteStatus','Enter a focused room ID.');return;}
  if(roomId.length<3||roomId.length>120){setText('remoteStatus','Room ID must be 3–120 characters.');return;}
  const strategy=$('discoveryStrategy')?.value||'nostr';
  const password=$('roomPassword')?.value||'';
  setText('remoteStatus',`Connecting focused room via ${strategy}…`);
  try{
    const item=await joinRemoteRoom({roomId,strategy,password,kind:'focus'});
    focusedRoomKey=item.key;
    setText('remoteStatus',`Focused room connected: ${roomId} via ${strategy}. Peer identifiers are ephemeral and unverified.`);
    $('recordScope').innerHTML=`<option value="${esc(PUBLIC_ROOM)}">Public commons</option><option value="${esc(roomId)}">Focused room: ${esc(roomId)}</option><option value="local">Local only</option>`;
  }catch(err){
    setText('remoteStatus',`Focused room connection failed: ${err.message}. BroadcastChannel fallback for this room has been enabled.`);
    ensureBroadcastRoom(roomId);
    focusedRoomKey=null;
  }
}

function disconnectFocus(){
  if(!focusedRoomKey)return;
  const item=remoteRooms.get(focusedRoomKey);
  try{item?.room?.leave()}catch{}
  remoteRooms.delete(focusedRoomKey);
  focusedRoomKey=null;
  setText('remoteStatus','Focused Trystero room left. Public room and same-device collaboration remain active.');
  renderRoomStatus();
}

async function broadcastRecord(r){
  if(r.scope==='local')return;
  broadcastBC(r.scope,{type:'record',record:r});
  for(const item of remoteRooms.values()){
    if(item.roomId===r.scope){
      try{await item.recordAction.send(r)}catch(err){log(`P2P send failed in ${item.roomId}: ${err.message}`)}
    }
  }
}

function renderPeers(){
  const el=$('peerList');if(!el)return;
  const items=[...peers.values()].sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen));
  setText('peerCount',String(items.length));
  if(!items.length){el.innerHTML='<p class="muted">No remote peers observed yet. Open another tab for BroadcastChannel testing or connect another device to the same room.</p>';return;}
  el.innerHTML=items.map(p=>`<div class="peer-row"><span class="peer-dot"></span><strong>${esc(p.profile.display||p.peerId.slice(0,10))}</strong><br><small>${esc(p.transport)} · ${esc(p.roomId)} · ${esc(p.profile.entity||'unverified entity')} · ${esc(p.profile.discipline||'unverified discipline')}</small><br><small>ID ${esc(p.peerId.slice(0,18))}… — not a verified identity</small></div>`).join('');
}

function renderRoomStatus(){
  const el=$('roomSummary');if(!el)return;
  const rooms=[...remoteRooms.values()];
  el.textContent=rooms.length?rooms.map(r=>`${r.kind}:${r.roomId} via ${r.strategy}`).join(' · '):'No internet P2P room connected; same-device BroadcastChannel remains available.';
}

function renderRecords(){
  const el=$('collabRecords');if(!el)return;
  const query=($('recordSearch')?.value||'').toLowerCase();
  const kind=$('recordFilterKind')?.value||'all';
  const list=[...records].filter(r=>(kind==='all'||r.kind===kind)&&(!query||`${r.title} ${r.body} ${r.domain} ${r.entity} ${r.discipline}`.toLowerCase().includes(query))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  setText('recordCount',String(list.length));
  if(!list.length){el.innerHTML='<p class="muted">No collaboration records match the current filter.</p>';return;}
  el.innerHTML=list.slice(0,250).map(r=>`<article class="record-card" data-conflict="${r.conflictOf?'true':'false'}">
    <div class="record-meta"><span class="tag">${esc(r.kind)}</span><span class="scope-pill">${esc(r.scope)}</span><span class="tag">${esc(r.status)}</span>${r.conflictOf?'<span class="tag warning">conflict copy</span>':''}</div>
    <h3>${esc(r.title)}</h3><p>${esc(r.body).replace(/\n/g,'<br>')}</p>
    <p class="small">${esc(r.domain)} · ${esc(r.entity)} · ${esc(r.discipline)} · rev ${r.revision} · ${esc(r.updatedAt)}</p>
    <div class="record-actions"><button type="button" data-record-status="active" data-id="${esc(r.id)}">Active</button><button type="button" data-record-status="done" data-id="${esc(r.id)}">Done</button><button type="button" data-record-status="blocked" data-id="${esc(r.id)}">Blocked</button><button type="button" data-share-record="${esc(r.id)}">Share now</button></div>
  </article>`).join('');
}

async function updateStatus(id,status){
  const r=records.find(x=>x.id===id);if(!r)return;
  await saveRecord({...r,status,revision:r.revision+1,updatedAt:now(),author:sessionPeer});
}

async function createRecord(ev){
  ev.preventDefault();
  const title=$('recordTitle').value.trim(),body=$('recordBody').value.trim();
  if(!title||!body)return;
  const r={
    id:uid(),schema:SCHEMA,kind:$('recordKind').value,title,body,
    domain:$('recordDomain').value,entity:$('recordEntity').value,discipline:$('recordDiscipline').value,
    status:'proposed',scope:$('recordScope').value||PUBLIC_ROOM,revision:1,createdAt:now(),updatedAt:now(),author:sessionPeer,
    provenance:{source:'human-entered',sourcePeer:sessionPeer,receivedAt:now()}
  };
  await saveRecord(r);
  ev.currentTarget.reset();
  $('recordScope').value=r.scope;
  setText('collabFormStatus','Saved locally and shared to the selected scope where transport is available.');
}

function exportJson(){
  const blob=new Blob([JSON.stringify({schema:'empowerment-collab-backup/1',exportedAt:now(),profile:localProfile(),records},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`empowerment-collab-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importJson(file){
  const text=await file.text();
  const data=JSON.parse(text);
  if(data.schema!=='empowerment-collab-backup/1'||!Array.isArray(data.records))throw new Error('Unsupported collaboration backup schema.');
  let changed=0,conflicts=0;
  for(const r of data.records.slice(0,2000)){
    const res=await mergeIncoming(r,'json-import','JSON import');
    if(res==='added'||res==='updated')changed++;if(res==='conflict')conflicts++;
  }
  return {changed,conflicts};
}

function setupUI(){
  $('focusConnect')?.addEventListener('click',connectFocus);
  $('focusDisconnect')?.addEventListener('click',disconnectFocus);
  $('collabRecordForm')?.addEventListener('submit',createRecord);
  $('recordSearch')?.addEventListener('input',renderRecords);
  $('recordFilterKind')?.addEventListener('change',renderRecords);
  $('collabRecords')?.addEventListener('click',async e=>{
    const status=e.target.closest('[data-record-status]');
    if(status)await updateStatus(status.dataset.id,status.dataset.recordStatus);
    const share=e.target.closest('[data-share-record]');
    if(share){const r=records.find(x=>x.id===share.dataset.shareRecord);if(r)await broadcastRecord(r)}
  });
  $('collabExport')?.addEventListener('click',exportJson);
  $('collabImport')?.addEventListener('change',async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{const out=await importJson(f);setText('collabImportStatus',`Imported: ${out.changed} changed; ${out.conflicts} conflicts preserved as forks.`)}catch(err){setText('collabImportStatus',`Import rejected: ${err.message}`)}
    e.target.value='';
  });
  ['collabDisplay','collabEntity','collabDiscipline'].forEach(id=>$(id)?.addEventListener('change',()=>{
    for(const roomId of bcRooms.keys())broadcastBC(roomId,{type:'presence',profile:localProfile()});
    for(const item of remoteRooms.values())item.presenceAction.send(localProfile()).catch(()=>{});
  }));
}

async function init(){
  if(!('indexedDB' in window)){setText('collabStorageStatus','IndexedDB unavailable; collaboration records cannot be persisted safely in this browser.');return;}
  try{
    await openDb();records=(await idbGetAll('records')).map(normalizeRecord);renderRecords();
    setText('collabStorageStatus',`IndexedDB ready · ${records.length} local collaboration records`);
  }catch(err){setText('collabStorageStatus',`IndexedDB error: ${err.message}`);return;}
  ensureBroadcastRoom(PUBLIC_ROOM);
  setText('publicRoomStatus','Same-device public room active. Internet peer discovery starts when the workspace is entered.');
  setupUI();renderPeers();renderRoomStatus();
  window.addEventListener('empowerment:entered',startPublic,{once:true});
  // If the splash has already auto-closed before this module initialized, begin now.
  if(!document.getElementById('launchSplash')) startPublic();
  window.addEventListener('online',()=>{if(![...remoteRooms.values()].some(r=>r.kind==='public'))startPublic()});
  window.addEventListener('offline',()=>setText('remoteStatus','Offline: existing direct peer channels may close; local IndexedDB and same-device BroadcastChannel remain available.'));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
