#!/usr/bin/env python3
"""
patch_core.py - derive the v4 core from the pristine v3 core script.

Why a patch script instead of hand-editing: every change to the v3 core is explicit, asserted
(each target must match exactly once) and reviewable. If a future v3 line changes, the build
fails loudly instead of silently shipping a half-patched core.

Usage: from patch_core import patch; text = patch(open('src/js/30-core-v3.js').read())
"""

LEGACY_AND_PERSISTENCE = r"""
/* SECTION 3b (v4): PERSISTENCE, HISTORY HOOKS AND MULTI-TAB SAFETY ------------------------
 * Purpose : keep the v3 workspace snapshot (projects, evidence, genomes) and the new v4 `ext`
 *           collections in ONE transactional IndexedDB record (EP.store 'state'/'snapshot').
 *           v3 databases are read once, never modified, and can be deleted from Data & privacy.
 * Safety  : every write carries a revision. If another tab saved first, the write is refused and
 *           the person chooses which version wins; the losing version becomes a restore point.
 * Extend  : new collections need no change here - register them with EP.ext.define().
 * Outcome : no silent overwrites between tabs, no lost v3 data, and a restore-point trail.
 */
const LEGACY_DB='foster_navi_empowerment_protocol_v1',LEGACY_STORE='workspace',LSKEY='fn_ep_backup_v1';let db=null;
let stateRev=0,tabId=EP.util.uid(),stateChannel=null,conflictOpen=false,lastSnapshotAt=0;
function readLegacy(){return new Promise(resolve=>{try{if(!('indexedDB'in window))return resolve(null);let created=false;const req=indexedDB.open(LEGACY_DB);req.onupgradeneeded=()=>{created=true};req.onerror=()=>resolve(null);req.onsuccess=()=>{const d=req.result;try{if(created||!d.objectStoreNames.contains(LEGACY_STORE)){d.close();if(created)try{indexedDB.deleteDatabase(LEGACY_DB)}catch{}return resolve(null)}const get=d.transaction(LEGACY_STORE,'readonly').objectStore(LEGACY_STORE).get('snapshot');get.onsuccess=()=>{d.close();resolve(get.result||null)};get.onerror=()=>{d.close();resolve(null)}}catch(e){try{d.close()}catch{}resolve(null)}}}catch{resolve(null)}})}
function updateStorageStatus(message){const el=$('storageStatus');if(el)el.textContent=message||EP.t('store.status',{mode:storeMode})}
"""

LOAD_STATE = r"""async function loadState(){let loaded=null,source='';try{await EP.store.ready;const cur=await EP.store.get('state','snapshot');if(cur){loaded=validateBackup(cur);stateRev=Number(cur.rev)||0;source='v4'}else{const legacy=await readLegacy();if(legacy){loaded=validateBackup(legacy);source='legacy-v3'}else{try{const old=localStorage.getItem(LSKEY);if(old){loaded=validateBackup(JSON.parse(old));source='localstorage'}}catch{}}}}catch(err){EP.log.error('state load',err);loaded=null}
if(loaded){state=loaded;state.rev=stateRev}
storeMode=EP.store.mode==='indexeddb'?'IndexedDB · browser-local':'Memory only · EXPORT before closing';
if(EP.store.mode!=='indexeddb'){try{localStorage.setItem(LSKEY+'_probe','1');localStorage.removeItem(LSKEY+'_probe');storeMode='LocalStorage fallback · browser-local'}catch{}}
try{if(!stateChannel&&'BroadcastChannel'in window){stateChannel=new BroadcastChannel('ep4-state');stateChannel.onmessage=e=>{const m=e.data;if(m&&m.t==='rev'&&m.tab!==tabId&&m.rev>stateRev)EP.emit('state:stale',{rev:m.rev})}}}catch{}
updateStorageStatus();
if(source==='legacy-v3'||source==='localstorage'){await writeState(JSON.parse(JSON.stringify(state)));EP.log.info('Imported workspace from '+source);EP.emit('state:migrated',{source})}
renderAll();EP.emit('state:loaded',{source,mode:EP.store.mode})}
async function reloadFromStore(){const cur=await EP.store.get('state','snapshot');if(cur){state=validateBackup(cur);stateRev=Number(cur.rev)||0;state.rev=stateRev}activeProject=null;selectedGenomeId=null;renderAll();EP.emit('state:reloaded')}
async function handleConflict(snapshot){if(conflictOpen)return;conflictOpen=true;try{await EP.history.put(snapshot,'Unsaved changes from this tab (version conflict)');const choice=await EP.ui.dialog({title:EP.t('conf.title'),body:EP.t('conf.body'),actions:[{id:'load',label:EP.t('conf.load'),primary:true},{id:'mine',label:EP.t('conf.mine'),danger:true}]});if(choice==='mine'){const cur=await EP.store.get('state','snapshot');stateRev=Number(cur&&cur.rev)||0;await writeState(snapshot)}else await reloadFromStore()}finally{conflictOpen=false}}
async function writeState(snapshot){try{if(EP.store.mode==='indexeddb'){const out=await EP.store.update('state','snapshot',old=>{const storedRev=old?Number(old.rev)||0:0;if(old&&storedRev!==stateRev)return {result:{conflict:true}};return {write:{...snapshot,rev:storedRev+1,savedAt:now(),tab:tabId},result:{old,rev:storedRev+1}}});if(out&&out.conflict){await handleConflict(snapshot);return}stateRev=out.rev;state.rev=stateRev;try{stateChannel&&stateChannel.postMessage({t:'rev',tab:tabId,rev:stateRev})}catch{}if(out.old&&Date.now()-lastSnapshotAt>120000){lastSnapshotAt=Date.now();EP.history.put(out.old,'Autosave · state before recent changes').catch(()=>{})}storeMode='IndexedDB · browser-local'}else{try{localStorage.setItem(LSKEY,JSON.stringify(snapshot));storeMode='LocalStorage fallback · browser-local'}catch{storeMode='Memory only · EXPORT before closing';toast(EP.t('store.memoryOnly'))}}updateStorageStatus();EP.emit('state:saved',{rev:stateRev})}catch(e){storeMode='Memory only · EXPORT before closing';updateStorageStatus('Persistent save failed: '+e.message+'. Export now!');toast('Persistent save failed. Export a backup now.');EP.log.error('save',e)}}"""

PERSIST = r"""function persist(){const snapshot=JSON.parse(JSON.stringify(state));saveSequence=saveSequence.catch(()=>{}).then(()=>writeState(snapshot));return saveSequence}"""

VALIDATE = r"""function validateBackup(obj){if(!obj||typeof obj!=='object'||![1,2,3].includes(obj.schema)||!Array.isArray(obj.projects)||!Array.isArray(obj.evidence)||obj.projects.length>200||obj.evidence.length>500||obj.schema>=2&&!Array.isArray(obj.genomes)||obj.genomes?.length>GENOME_LIMIT)throw Error('Unsupported schema or record limits (v1, v2 and v3 accepted).');const projects=obj.projects.map(hydrateProject),evidence=obj.evidence.map(hydrateEvidence),genomes=(obj.schema>=2?obj.genomes:[]).map(safeGenome);for(const items of [projects,evidence,genomes])if(new Set(items.map(p=>p.id)).size!==items.length)throw Error('Duplicate IDs in imported records');const ext=EP.ext.sanitizeAll(obj.schema>=3?obj.ext:null).ext;return {schema:3,projects,evidence,research:[],genomes,ext,rev:Math.max(0,Math.min(1e9,Math.round(Number(obj.rev))||0))}}"""

EXPORT_STATE = r"""function exportState(privateData){return {app:'Foster + Navi Empowerment Protocol',os:'Empowerment Recursive Innovation OS',osVersion:EP.version,schema:3,exported:now(),privacy:privateData?'private-unencrypted-backup':'redacted-share-copy',snapshot:SNAPSHOT,projects:state.projects.map((p,i)=>projectAsExport(p,privateData,i)),evidence:privateData?state.evidence:state.evidence.map(n=>({...n,id:makeId(),claim:'',limits:'',url:''})),genomes:privateData?state.genomes.map(g=>safeGenome(g)):[],research:[],ext:privateData?JSON.parse(JSON.stringify(state.ext)):EP.ext.redactAll(state.ext)}}"""

DO_IMPORT = r"""async function doImport(){const file=$('importFile').files[0];if(!file)return toast(EP.t('imp.choose'));if(file.size>16*1024*1024)return toast(EP.t('imp.tooBig'));if(!$('importConfirm').checked)return toast(EP.t('imp.confirm'));if(!EP.rate.allow('import',{capacity:3,perSec:.2}))return;try{let raw=JSON.parse(await file.text());if(raw&&raw.schema==='empowerment-encrypted-backup/1'){raw=await EP.integrity.decryptInteractive(raw);if(!raw)return}const next=validateBackup(raw);const replacing=$('importMode').value==='replace';if(replacing&&!(await EP.ui.confirm(EP.t('imp.replaceWarn'),{danger:true,ok:EP.t('imp.replace')})))return;await EP.history.snapshot(replacing?'Before import (replace)':'Before import (merge)');const merged=replacing?{...next,rev:state.rev}:{schema:3,projects:uniqueById([...state.projects,...next.projects]),evidence:uniqueById([...state.evidence,...next.evidence]),genomes:mergeGenomeBackup(state.genomes,next.genomes),research:[],ext:EP.ext.mergeAll(state.ext,next.ext),rev:state.rev};if(merged.projects.length>200||merged.evidence.length>500||merged.genomes.length>GENOME_LIMIT)throw Error('Merged workspace exceeds limits');state=merged;activeProject=null;selectedGenomeId=null;await persist();renderAll();EP.emit('activity',{type:'import'});toast(EP.t('imp.done')+(storeMode.startsWith('Memory')?' '+EP.t('imp.memory'):''))}catch(e){toast(EP.t('imp.rejected')+' '+e.message)}}"""

BRIDGE = r"""/* SECTION 14 (v4): CORE BRIDGE ----------------------------------------------------------------
 * Purpose : the ONLY surface through which v4 modules touch the v3 core. Keeps the old engine
 *           stable while new modules evolve independently.
 * Extend  : add a getter/function here when a module genuinely needs it; never reach into core
 *           internals from other files.
 * Outcome : one auditable seam between legacy and new code.
 */
EP.core={get state(){return state},set state(v){state=v},get activeProject(){return activeProject},get storeMode(){return storeMode},get revision(){return stateRev},
persist,renderAll,toast,download,validateBackup,exportState,loadState,reloadFromStore,init,runSelfTests,
MODELS,computeModel,runModel,renderModelFields,ENGINES,EBY,SOURCES,GLOSSARY,METHOD_CARDS,SNAPSHOT,GENOME_LIMIT,
makeId,clean,fmt,sourceById,hashText,
clearSelection(){activeProject=null;selectedGenomeId=null},
openProject(id){activeProject=id;renderProjects()},
stateJSON(){return JSON.parse(JSON.stringify(state))},
resetMemoryRevision(){stateRev=0}};
"""


def _rep_line(lines, prefix, new, label):
    idx = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    assert len(idx) == 1, f"patch '{label}': expected exactly one line starting with {prefix!r}, found {len(idx)}"
    lines[idx[0]] = new


def _rep_sub(text, old, new, label):
    assert text.count(old) == 1, f"patch '{label}': expected exactly one occurrence, found {text.count(old)}"
    return text.replace(old, new)


def patch(text):
    lines = text.split("\n")
    # 1. state shape + helpers -------------------------------------------------------------
    i = [k for k, l in enumerate(lines) if l.startswith("let state={schema:2,")]
    assert len(i) == 1
    lines[i[0]] = lines[i[0]].replace("let state={schema:2,projects:[],evidence:[],research:[],genomes:[]};",
                                      "let state={schema:3,projects:[],evidence:[],research:[],genomes:[],ext:EP.ext.empty(),rev:0};")
    assert "schema:3" in lines[i[0]]
    # 2. delegate toast / download to the kernel UI helpers -----------------------------------
    _rep_line(lines, "function toast(message){", "function toast(message){EP.ui.toast(message)}", "toast")
    _rep_line(lines, "function download(text,filename,type){", "function download(text,filename,type){return EP.ui.download(text,filename,type)}", "download")
    # 3. storage layer -------------------------------------------------------------------------
    _rep_line(lines, "const DBNAME='foster_navi_empowerment_protocol_v1'", LEGACY_AND_PERSISTENCE, "legacy+persistence")
    _rep_line(lines, "function openDB(){", "/* v3 openDB/idbValue were replaced by EP.store (see SECTION 3b). */", "openDB")
    _rep_line(lines, "function idbValue(", "", "idbValue")
    _rep_line(lines, "function validateBackup(obj){", VALIDATE, "validateBackup")
    _rep_line(lines, "async function loadState(){", LOAD_STATE, "loadState")
    _rep_line(lines, "function persist(){", PERSIST, "persist")
    _rep_line(lines, "function exportState(privateData){", EXPORT_STATE, "exportState")
    _rep_line(lines, "async function doImport(){", DO_IMPORT, "doImport")
    # 4. navigation + theme are owned by v4 modules ---------------------------------------------
    _rep_line(lines, "function setupNav(){", "function setupNav(){/* replaced by EP.nav (34-nav.js) */}", "setupNav")
    _rep_line(lines, "function updateRoute(){", "function updateRoute(){/* replaced by EP.nav */}", "updateRoute")
    _rep_line(lines, "function setupTheme(){", "function setupTheme(){/* replaced by EP.settings (10-kernel.js) */}", "setupTheme")
    # 5. render hook ------------------------------------------------------------------------------
    _rep_line(lines, "function renderAll(){",
              "function renderAll(){renderHUD();renderModules();renderProjects();renderEvidence();renderSources();renderDependencies();renderGenomeLibrary();EP.emit('state:render')}", "renderAll")
    # 6. export + delete-all handlers ----------------------------------------------------------
    j = [k for k, l in enumerate(lines) if l.startswith("$('exportBtn').addEventListener('click'")]
    assert len(j) == 1
    ln = lines[j[0]]
    ln = _rep_sub(ln, "toast('Download requested. Keep backups in a safe location.')",
                  "toast(EP.t('exp.requested'));EP.settings.set('lastBackupAt',now());EP.emit('activity',{type:'backup'})", "export toast")
    ln = _rep_sub(ln, "state={schema:2,projects:[],evidence:[],research:[],genomes:[]};activeProject=null;selectedGenomeId=null;await persist();",
                  "await EP.data.wipeAll();state={schema:3,projects:[],evidence:[],research:[],genomes:[],ext:EP.ext.empty(),rev:0};stateRev=0;activeProject=null;selectedGenomeId=null;await persist();", "delete-all")
    lines[j[0]] = ln
    # 6b. safety net: a restore point before every destructive delete ----------------------------
    j = [k for k, l in enumerate(lines) if "state.projects=state.projects.filter(x=>x.id!==p.id);activeProject=null;await persist();" in l]
    assert len(j) == 1, "project delete line"
    lines[j[0]] = _rep_sub(lines[j[0]], "state.projects=state.projects.filter(x=>x.id!==p.id);activeProject=null;await persist();",
                           "await EP.history.snapshot('Before deleting a project');state.projects=state.projects.filter(x=>x.id!==p.id);activeProject=null;await persist();", "project delete")
    j = [k for k, l in enumerate(lines) if "state.evidence=state.evidence.filter(x=>x.id!==button.dataset.deleteEvidence);await persist();" in l]
    assert len(j) == 1, "evidence delete line"
    lines[j[0]] = _rep_sub(lines[j[0]], "state.evidence=state.evidence.filter(x=>x.id!==button.dataset.deleteEvidence);await persist();",
                           "await EP.history.snapshot('Before deleting an evidence note');state.evidence=state.evidence.filter(x=>x.id!==button.dataset.deleteEvidence);await persist();", "evidence delete")
    j = [k for k, l in enumerate(lines) if "state.genomes=state.genomes.filter(x=>x.id!==g.id);selectedGenomeId=null;await persist();renderGenomeLibrary();toast('Genome deleted locally.')" in l]
    assert len(j) == 1, "genome delete line"
    lines[j[0]] = _rep_sub(lines[j[0]], "state.genomes=state.genomes.filter(x=>x.id!==g.id);selectedGenomeId=null;await persist();renderGenomeLibrary();toast('Genome deleted locally.')",
                           "await EP.history.snapshot('Before deleting a genome');state.genomes=state.genomes.filter(x=>x.id!==g.id);selectedGenomeId=null;await persist();renderGenomeLibrary();toast('Genome deleted locally.')", "genome delete")
    # 6c. connectivity messages are owned by EP.nav (translated); drop the English duplicates ----
    j = [k for k, l in enumerate(lines) if l.startswith("function init(){")]
    assert len(j) == 1, "init line"
    dup = "window.addEventListener('online',()=>{$('connectionStatus')?.replaceChildren(document.createTextNode('Browser reports online; external links may be available.'))});window.addEventListener('offline',()=>{$('connectionStatus')?.replaceChildren(document.createTextNode('Offline; all embedded tools work; publisher links cannot load.'))})"
    k2 = [k for k, l in enumerate(lines) if dup in l]
    assert len(k2) == 1, "online/offline duplicate listeners"
    lines[k2[0]] = lines[k2[0]].replace(dup, "")
    # 6d. no toast on page load: the research generator toasts only when the person presses its button ----
    j = [k for k, l in enumerate(lines) if l.startswith("function runResearch(ev){")]
    assert len(j) == 1, "runResearch line"
    lines[j[0]] = _rep_sub(lines[j[0]], "toast('Generated '+bundle.questions.length+' evidence-bound research questions and '+bundle.promptChain.length+' prompts.');}",
                           "if(!(ev&&ev.silent))toast('Generated '+bundle.questions.length+' evidence-bound research questions and '+bundle.promptChain.length+' prompts.');}", "runResearch toast")
    j = [k for k, l in enumerate(lines) if l.startswith("function init(){")]
    assert len(j) == 1
    lines[j[0]] = _rep_sub(lines[j[0]], "runModel();runResearch();loadState()", "runModel();runResearch({silent:true,preventDefault(){}});loadState()", "init runResearch")
    # 7. bootstrap: no auto-start; main bootstrap calls EP.core.init() in a defined order ----------
    _rep_line(lines, "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();", BRIDGE, "bootstrap")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    src = open(sys.argv[1], encoding="utf-8").read()
    out = patch(src)
    open(sys.argv[2], "w", encoding="utf-8").write(out)
    print("patched core:", len(src), "->", len(out), "bytes")
