import asyncio, json, os, sys, time
from pathlib import Path
from playwright.async_api import async_playwright
from helpers import serve, Collector, wait_ready
DIST = Path("/home/claude/work/v4/dist"); OUT = Path("/home/claude/work/v4/tests")
results = []
def rec(name, ok, detail=""):
    results.append((name, ok, detail)); print(("PASS " if ok else "FAIL ") + name + ((" :: " + detail) if (detail and not ok) else ""), flush=True)
async def step(name, coro):
    try:
        r = await coro
        rec(name, r is None or r is True, "" if (r is None or r is True) else str(r)[:300])
    except Exception as e:
        rec(name, False, (str(e).splitlines() or [''])[0][:300])

async def boot(ctx, url, skip_splash=True, role=None):
    pg = await ctx.new_page(); col = Collector(pg)
    await pg.goto(url, wait_until="load"); await wait_ready(pg)
    if skip_splash:
        try: await pg.click("#enterWorkspace", timeout=3000)
        except Exception: pass
        await pg.wait_for_timeout(900)
        try: await pg.click("dialog.ep-dialog button[data-act=skip]", timeout=1500)
        except Exception: pass
    return pg, col

LEGACY_SNAPSHOT = {"schema": 2, "projects": [{"id": "legacy-proj-1", "engine": "food", "title": "Legacy v3 project", "problem": "Carried over from a v3 workspace.", "context": "", "budget": 0, "scale": "Household", "metric": "", "window": 30, "baseline": None, "target": None, "created": "2026-09-01T10:00:00.000Z", "review": "", "tasks": [{"label": "Plan beds", "done": True}], "observations": []}], "evidence": [{"id": "legacy-ev-1", "domain": "food", "type": "Report", "claim": "Legacy evidence claim", "url": "", "quality": "moderate", "limits": "Legacy limits", "date": "2026-09-02"}], "research": [], "genomes": []}
LEGACY_RECORD = {"schema": "empowerment-collab-record/1", "id": "legacy-rec-1", "kind": "comment", "title": "Legacy local-only note", "body": "Should never be shared.", "domain": "cross-domain", "entity": "community", "discipline": "general", "status": "proposed", "scope": "local", "revision": 1, "createdAt": "2026-09-01T10:00:00.000Z", "updatedAt": "2026-09-01T10:00:00.000Z", "author": "x", "hash": "", "conflictOf": None, "provenance": {"source": "human-entered", "sourcePeer": "x", "receivedAt": "2026-09-01T10:00:00.000Z"}}

async def t_migration(p, base):
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark")
    pg = await ctx.new_page(); col = Collector(pg)
    await pg.goto(base + "/_blank.html", wait_until="load")
    await pg.evaluate("""async (args) => {
      const [snap, rec] = args;
      await new Promise((res, rej) => { const r = indexedDB.open('foster_navi_empowerment_protocol_v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('workspace'); r.onsuccess = () => { const tx = r.result.transaction('workspace', 'readwrite'); tx.objectStore('workspace').put(snap, 'snapshot'); tx.oncomplete = () => { r.result.close(); res(); }; }; r.onerror = () => rej(r.error); });
      await new Promise((res, rej) => { const r = indexedDB.open('empowerment_recursive_collab_v3', 1); r.onupgradeneeded = () => r.result.createObjectStore('records', {keyPath: 'id'}); r.onsuccess = () => { const tx = r.result.transaction('records', 'readwrite'); tx.objectStore('records').put(rec); tx.oncomplete = () => { r.result.close(); res(); }; }; r.onerror = () => rej(r.error); });
    }""", [LEGACY_SNAPSHOT, LEGACY_RECORD])
    await pg.goto(base + "/index.html", wait_until="load"); await wait_ready(pg); await pg.wait_for_timeout(800)
    c = await pg.evaluate("({p: EP.core.state.projects.map(x => x.title), e: EP.core.state.evidence.map(x => x.claim), schema: EP.core.state.schema, rec: EP.collab.records.map(r => r.title)})")
    ok1 = c["p"] == ["Legacy v3 project"] and c["e"] == ["Legacy evidence claim"] and c["schema"] == 3
    new = await pg.evaluate("EP.store.get('state', 'snapshot').then(s => s ? {schema: s.schema, rev: s.rev, n: s.projects.length} : null)")
    legacy_left = await pg.evaluate("""new Promise(res => { const r = indexedDB.open('foster_navi_empowerment_protocol_v1'); r.onsuccess = () => { const g = r.result.transaction('workspace').objectStore('workspace').get('snapshot'); g.onsuccess = () => { r.result.close(); res(!!g.result); }; }; r.onerror = () => res('err'); })""")
    snap = await pg.evaluate("EP.collab.snapshot('empowerment-commons-public-v1').records.length")
    rec("v3 workspace migrates into v4 (projects, evidence, schema 3)", ok1, json.dumps(c))
    rec("v4 snapshot is stored with a revision; legacy DB is left untouched", bool(new) and new["schema"] == 3 and new["rev"] >= 1 and legacy_left is True, json.dumps([new, legacy_left]))
    rec("v3 collaboration record migrated and NOT included in any room snapshot", ("Legacy local-only note" in c["rec"]) and snap == 0, json.dumps([c["rec"], snap]))
    await pg.evaluate("document.getElementById('enterWorkspace') && document.getElementById('enterWorkspace').click()"); await pg.wait_for_timeout(700)
    try: await pg.click("dialog.ep-dialog button[data-act=skip]", timeout=1500)
    except Exception: pass
    await pg.evaluate("EP.nav.reveal('#data')"); await pg.wait_for_timeout(600)
    vis = await pg.evaluate("!document.getElementById('delLegacy').hidden")
    rec("Data section offers to delete legacy v3 databases when they exist", vis)
    print("   console errors:", len(col.errors()), col.errors()[:4])
    await ctx.close()

async def t_multitab(p, base):
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark")
    a, ca = await boot(ctx, base + "/index.html"); b, cb = await boot(ctx, base + "/index.html")
    await a.evaluate("EP.core.state.evidence.push({id:'mt-ev-a1', domain:'food', type:'Note', claim:'Added in tab A', url:'', quality:'low', limits:'', date:'2026-10-01'}); EP.core.persist(); null"); await a.wait_for_timeout(800)
    banner = await b.evaluate("!document.getElementById('syncBanner').hidden")
    rec("tab B is told when tab A saved a newer version (BroadcastChannel banner)", banner is True)
    await b.evaluate("EP.core.state.evidence.push({id:'mt-ev-b1', domain:'food', type:'Note', claim:'Added in stale tab B', url:'', quality:'low', limits:'', date:'2026-10-01'}); EP.core.persist(); null"); await b.wait_for_timeout(1000)
    dlg = await b.evaluate("(document.querySelector('dialog.ep-dialog[open] h2')||{}).textContent || ''")
    rec("a stale tab's save is refused and the person chooses (no silent overwrite)", "changed in another tab" in dlg, dlg)
    await b.click("dialog.ep-dialog button[data-act=load]"); await b.wait_for_timeout(900)
    cl = await b.evaluate("EP.core.state.evidence.map(x => x.id)")
    hist = await b.evaluate("EP.history.list().then(l => l.map(x => x.label))")
    rec("choosing 'load newer' shows tab A's data and keeps the stale edit as a restore point", "mt-ev-a1" in cl and "mt-ev-b1" not in cl and any("version conflict" in h for h in hist), json.dumps([cl, hist]))
    await ctx.close()

async def t_encrypted(p, base):
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark", accept_downloads=True)
    pg, col = await boot(ctx, base + "/index.html")
    await pg.evaluate("EP.demo.load()"); await pg.wait_for_timeout(900)
    await pg.evaluate("EP.nav.reveal('#data')"); await pg.wait_for_timeout(400)
    await pg.click("#exportEncBtn"); await pg.wait_for_timeout(400)
    inputs = pg.locator("dialog.ep-dialog[open] input[type=password]"); await inputs.nth(0).fill("short"); await inputs.nth(1).fill("short"); await pg.locator("dialog.ep-dialog[open] input[type=checkbox]").check()
    await pg.click("dialog.ep-dialog[open] button[data-act=ok]"); await pg.wait_for_timeout(300)
    msg = await pg.evaluate("document.querySelector('dialog.ep-dialog[open] .ep-form-msg').textContent")
    rec("encrypted backup refuses a passphrase under 12 characters", "12" in msg, msg)
    await inputs.nth(0).fill("correct horse battery staple"); await inputs.nth(1).fill("correct horse battery staple")
    async with pg.expect_download(timeout=30000) as dl:
        await pg.click("dialog.ep-dialog[open] button[data-act=ok]")
    d = await dl.value; path = OUT / "enc-backup.json"; await d.save_as(str(path))
    j = json.loads(path.read_text())
    plain = path.read_text()
    rec("encrypted file has the documented header and contains no plaintext project text", j.get("schema") == "empowerment-encrypted-backup/1" and j.get("iter") == 600000 and "produce exchange" not in plain.lower(), json.dumps({k: v for k, v in j.items() if k != "ct"})[:200])
    # wipe then import
    await pg.evaluate("EP.demo.clear()"); await pg.wait_for_timeout(800)
    n0 = await pg.evaluate("EP.core.state.projects.length")
    await pg.set_input_files("#importFile", str(path)); await pg.check("#importConfirm"); await pg.select_option("#importMode", "replace")
    await pg.click("#importBtn"); await pg.wait_for_timeout(500)                      # passphrase prompt first
    f = pg.locator("dialog.ep-dialog[open] input[type=password]"); await f.fill("wrong passphrase here"); await pg.click("dialog.ep-dialog[open] button[data-act=ok]"); await pg.wait_for_timeout(3000)
    again = await pg.evaluate("document.querySelector('dialog.ep-dialog[open]') ? document.querySelector('dialog.ep-dialog[open]').innerText : ''")
    rec("wrong passphrase is rejected and asked again", "Wrong passphrase" in again, again[:200])
    await pg.locator("dialog.ep-dialog[open] input[type=password]").fill("correct horse battery staple"); await pg.click("dialog.ep-dialog[open] button[data-act=ok]"); await pg.wait_for_timeout(3000)
    await pg.click("dialog.ep-dialog[open] button[data-act=ok]"); await pg.wait_for_timeout(1500)   # then the replace confirmation
    n1 = await pg.evaluate("({p: EP.core.state.projects.length, b: (EP.core.state.ext.briefs||[]).length})")
    rec("import decrypts with the right passphrase and restores projects and toolkit records", n0 == 0 and n1["p"] == 1 and n1["b"] == 1, json.dumps([n0, n1]))
    await ctx.close()

async def t_classroom(p, base):
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark", accept_downloads=True)
    pg, col = await boot(ctx, base + "/index.html")
    await pg.evaluate("EP.demo.load()"); await pg.wait_for_timeout(800)
    await pg.evaluate("EP.tools.open('passport')"); await pg.wait_for_timeout(500)
    await pg.fill("#ppNick", "someone@school.org"); await pg.check("#ppConsent")
    await pg.locator("[id^=pk_]").first.check(); await pg.click("text=Download submission file"); await pg.wait_for_timeout(300)
    m = await pg.evaluate("document.querySelector('#tk-panel-passport .ep-form-msg').textContent"); rec("hand-in refuses a nickname that looks like an email", "nickname" in m.lower(), m)
    await pg.fill("#ppNick", "Comet"); await pg.uncheck("#ppConsent"); await pg.click("text=Download submission file"); await pg.wait_for_timeout(300)
    m = await pg.evaluate("document.querySelector('#tk-panel-passport .ep-form-msg').textContent"); rec("hand-in requires the consent tick", "consent" in m.lower(), m)
    await pg.check("#ppConsent")
    async with pg.expect_download() as dl: await pg.click("text=Download submission file")
    d = await dl.value; path = OUT / "submission.json"; await d.save_as(str(path)); j = json.loads(path.read_text())
    rec("submission packet carries only nickname + chosen entries + digest", j["schema"] == "empowerment-submission/1" and j["pseudonym"] == "Comet" and len(j["entries"]) == 1 and len(j["digest"]) == 64 and "id" not in j["entries"][0], json.dumps(list(j.keys())))
    # tamper test
    bad = json.loads(path.read_text()); bad["entries"][0]["claim"] = "edited after the fact"; (OUT / "submission-bad.json").write_text(json.dumps(bad))
    await pg.evaluate("EP.tools.open('review')"); await pg.wait_for_timeout(400)
    await pg.set_input_files("#rvFiles", [str(OUT / "submission-bad.json")]); await pg.wait_for_timeout(900)
    n_bad = await pg.evaluate("(EP.core.state.ext.reviews||[]).length"); rec("a packet edited after export fails its digest and is not imported", n_bad == 0, str(n_bad))
    await pg.set_input_files("#rvFiles", [str(path)]); await pg.wait_for_timeout(900)
    n_ok = await pg.evaluate("(EP.core.state.ext.reviews||[]).length"); rec("a valid packet imports", n_ok == 1, str(n_ok))
    await pg.click("#tk-panel-review button:has-text('Open')"); await pg.wait_for_timeout(300)
    await pg.locator("#tk-panel-review select").first.select_option("3"); await pg.fill("#tk-panel-review textarea", "Clear question; next, name what could prove you wrong."); await pg.wait_for_timeout(900)
    lv = await pg.evaluate("EP.core.state.ext.reviews[0].teacher.question + '|' + EP.core.state.ext.reviews[0].comment.length")
    rec("teacher level + feedback persist", lv.startswith("3|") and int(lv.split("|")[1]) > 10, lv)
    txt = await pg.evaluate("document.getElementById('tk-panel-review').innerText")
    rec("review view has no ranking/score-sort controls and says so", ("no ranking" in txt.lower() or "sin clasific" in txt.lower()) and "sort by" not in txt.lower(), txt[:160])
    await pg.screenshot(path=str(OUT / "d-review.png"))
    # kit round trip
    await pg.evaluate("EP.tools.open('kits')"); await pg.wait_for_timeout(400)
    async with pg.expect_download() as dl2: await pg.click("#tk-panel-kits >> text=Download kit file")
    kd = await dl2.value; kp = OUT / "kit.json"; await kd.save_as(str(kp)); kj = json.loads(kp.read_text())
    rec("class kit file contains no student data", kj["schema"] == "empowerment-classkit/1" and "pseudonym" not in json.dumps(kj) and "passport" not in json.dumps(kj))
    await pg.set_input_files("#kitFile", str(kp)); await pg.wait_for_timeout(700)
    nk = await pg.evaluate("EP.core.state.ext.kits.length"); rec("class kit imports as a new record", nk == 2, str(nk))
    await pg.click("#tk-panel-kits >> text=Start as a project"); await pg.wait_for_timeout(900)
    np_ = await pg.evaluate("EP.core.state.projects.length"); rec("'Start as a project' creates a workspace project from the kit", np_ == 2, str(np_))
    print("   console errors:", len(col.errors()), col.errors()[:4]); await ctx.close()

async def t_collab(p, base):
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark")
    a, _ = await boot(ctx, base + "/index.html"); b, _ = await boot(ctx, base + "/index.html")
    await a.evaluate("EP.nav.reveal('#collaboration')"); await a.wait_for_timeout(500)
    net = await a.evaluate("EP.net.log().length"); rec("opening the collaboration section makes no network request", net == 0)
    vis = await a.evaluate("document.getElementById('internetControls').hidden"); rec("internet room controls stay hidden until consent", vis is True)
    await a.fill("#recordTitle", "Shared on this device"); await a.fill("#recordBody", "Hello from tab A"); await a.select_option("#recordScope", "empowerment-commons-public-v1"); await a.click("#collabRecordForm button[type=submit]"); await a.wait_for_timeout(1200)
    got = await b.evaluate("EP.collab.records.map(r => r.title)"); rec("same-device room delivers a record to another tab", "Shared on this device" in got, json.dumps(got))
    await a.fill("#recordTitle", "Private note"); await a.fill("#recordBody", "Never leaves"); await a.select_option("#recordScope", "local"); await a.click("#collabRecordForm button[type=submit]"); await a.wait_for_timeout(1000)
    got2 = await b.evaluate("EP.collab.records.map(r => r.title)"); rec("local-only records are NOT delivered to other tabs", "Private note" not in got2, json.dumps(got2))
    # quarantine
    res = await b.evaluate("EP.collab.stageIncoming({id:'peer-1', title:'From a stranger', body:'<img src=x onerror=alert(1)>', scope:'empowerment-commons-public-v1', revision:5}, 'peer-abc', 'test', 'empowerment-commons-public-v1')")
    inbox = await b.evaluate("EP.collab.inbox.length"); recs = await b.evaluate("EP.collab.records.map(r => r.id)")
    rec("a record from an internet peer lands in the inbox, not in records", res == "staged" and inbox == 1 and "peer-1" not in recs, json.dumps([res, inbox]))
    await b.evaluate("EP.nav.reveal('#inboxList')"); await b.wait_for_timeout(400)
    html = await b.evaluate("document.getElementById('inboxList').innerHTML")
    rec("inbox shows peer text as plain text (no HTML injection)", "&lt;img" in html and "<img" not in html, html[:200])
    await b.screenshot(path=str(OUT / "d-inbox.png"))
    await b.click("#inboxList button.primary"); await b.wait_for_timeout(600)
    acc = await b.evaluate("EP.collab.records.map(r => r.id).includes('peer-1') && EP.collab.inbox.length === 0"); rec("accepting moves it into records", acc is True)
    # flood
    flood = await b.evaluate("""(async () => { let staged = 0; const r = EP.rate.make({capacity:15, perSec:1.5}); let ok = 0; for (let i = 0; i < 100; i++) if (r.take()) ok++; return ok; })()""")
    rec("peer rate limiter admits a burst of 15 then throttles", flood <= 17, str(flood))
    # revision-jump flag
    await b.evaluate("EP.collab.stageIncoming({id:'peer-1', title:'From a stranger', body:'tampered', scope:'empowerment-commons-public-v1', revision:900}, 'peer-evil', 'test', 'empowerment-commons-public-v1')")
    flag = await b.evaluate("EP.collab.inbox.map(q => q.flag)"); rec("an unusually large revision jump is flagged for the reader", "jump" in flag, json.dumps(flag))
    await ctx.close()

async def t_strict_and_youth(p, base):
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark")
    pg, col = await boot(ctx, base + "/strict/index.html")
    st = await pg.evaluate("EP.strict")
    blocked = await pg.evaluate("fetch('https://example.org/x').then(() => 'allowed', e => 'blocked')")
    dis = await pg.evaluate("document.getElementById('internetEnable').disabled")
    rec("strict edition: EP.strict, fetch blocked by CSP, internet controls disabled", st is True and blocked == "blocked" and dis is True, json.dumps([st, blocked, dis]))
    csp = await pg.evaluate("document.querySelector('meta[http-equiv=Content-Security-Policy]').content")
    rec("strict CSP forbids connections and workers", "connect-src 'none'" in csp and "worker-src 'none'" in csp and "esm.sh" not in csp)
    await ctx.close()
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark")
    pg, col = await boot(ctx, base + "/index.html")
    await pg.evaluate("EP.settings.set('analytics', true)"); await pg.evaluate("EP.tools.open('brief')"); await pg.wait_for_timeout(500)
    n1 = await pg.evaluate("EP.store.count('analytics')")
    await pg.evaluate("EP.settings.set('youthSafe', true)"); await pg.evaluate("EP.tools.open('risk')"); await pg.wait_for_timeout(500)
    n2 = await pg.evaluate("EP.store.count('analytics')")
    ena = await pg.evaluate("document.getElementById('internetEnable').disabled")
    rec("analytics record only when enabled, and youth-safe mode forces them off", n1 >= 1 and n2 == n1, json.dumps([n1, n2]))
    rec("youth-safe mode disables internet rooms", ena is True)
    await pg.evaluate("EP.settings.set('youthSafe', false); EP.settings.set('analytics', false)"); await pg.evaluate("EP.analytics.reset()")
    cnt = await pg.evaluate("EP.store.count('analytics')"); rec("analytics are erasable", cnt == 0)
    ext = await pg.evaluate("EP.net.observed().concat(EP.net.log())")
    rec("no cross-origin requests happened in a normal session", ext == [], json.dumps(ext))
    # AI guard UI
    await pg.evaluate("EP.nav.reveal('#local-ai')"); await pg.wait_for_timeout(400)
    await pg.fill("#aiPrompt", "how to build a bomb to hurt people"); await pg.click("#generateAiPlan"); await pg.wait_for_timeout(300)
    out = await pg.evaluate("document.getElementById('aiOutput').innerText")
    rec("harm-boundary filter declines harmful AI requests (no plan produced)", "will not generate a plan" in out and "STAGE" not in out.upper().replace("STAGES", ""), out[:160])
    await pg.fill("#aiPrompt", "Evaluate fentanyl precursor control policy options for municipalities"); await pg.click("#generateAiPlan"); await pg.wait_for_timeout(400)
    out2 = await pg.evaluate("document.getElementById('aiOutput').innerText")
    rec("legitimate public-health policy prompt gets the deterministic chain and says no model was used", "no model inference occurred" in out2 and "ANTI-INVERSION GATE" in out2, out2[:120])
    await ctx.close()

async def t_layouts(p, base):
    for label, vp in (("mobile", {"width": 390, "height": 844}), ("tablet", {"width": 820, "height": 1100}), ("laptop", {"width": 1180, "height": 800}), ("wide", {"width": 1800, "height": 1000})):
        ctx = await p.new_context(viewport=vp, color_scheme="light", is_mobile=(label == "mobile"), has_touch=(label == "mobile"))
        pg, col = await boot(ctx, base + "/index.html")
        await pg.evaluate("EP.demo.load()"); await pg.wait_for_timeout(700); await pg.evaluate("window.scrollTo(0,0)")
        ov = await pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        await pg.screenshot(path=str(OUT / f"d-{label}.png"))
        # check every section for horizontal overflow of body
        bad = await pg.evaluate("""(() => { const w = window.innerWidth; const out = []; for (const s of document.querySelectorAll('main > section')) { const r = s.getBoundingClientRect(); if (r.right > w + 2) out.push(s.id + ':' + Math.round(r.right)); } return out; })()""")
        rec(f"{label} ({vp['width']}px): no horizontal page overflow", ov <= 2 and not bad, f"overflow={ov} sections={bad}")
        if label == "mobile":
            await pg.click("#tocBtn"); await pg.wait_for_timeout(400); await pg.screenshot(path=str(OUT / "d-mobile-toc.png"))
            nlinks = await pg.evaluate("document.querySelectorAll('dialog.ep-dialog[open] a[data-toc]').length"); rec("mobile Contents dialog lists the sections", nlinks >= 20, str(nlinks))
            await pg.keyboard.press("Escape")
        await ctx.close()

async def t_modes(p, base):
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark", reduced_motion="reduce")
    pg, col = await boot(ctx, base + "/index.html")
    await pg.evaluate("EP.nav.reveal('#px1')"); await pg.wait_for_timeout(500)
    tr = await pg.evaluate("getComputedStyle(document.querySelector('#px1 .px-layer')).animationName + '|' + getComputedStyle(document.querySelector('#px1 .px-layer')).transform")
    rec("reduced-motion: parallax layers do not animate", tr.startswith("none|") and (tr.endswith("none") or "matrix(1, 0, 0, 1, 0, 0)" in tr), tr)
    await ctx.close()
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="dark", forced_colors="active")
    pg, col = await boot(ctx, base + "/index.html"); await pg.screenshot(path=str(OUT / "d-forced.png")); rec("forced-colors mode loads without errors", len(col.errors()) <= 1, str(col.errors()[:2])); await ctx.close()
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}, color_scheme="light")
    pg, col = await boot(ctx, base + "/index.html")
    await pg.evaluate("EP.demo.load()"); await pg.wait_for_timeout(700)
    await pg.evaluate("EP.settings.set('theme','hc'); EP.settings.set('dyslexia', true); EP.settings.set('fontScale', 130); EP.settings.set('underline', true)"); await pg.wait_for_timeout(400); await pg.screenshot(path=str(OUT / "d-hc.png"))
    ov = await pg.evaluate("document.documentElement.scrollWidth - innerWidth"); rec("high-contrast + dyslexia + 130% text keeps layout intact", ov <= 2, str(ov))
    # print
    await pg.evaluate("EP.settings.set('theme','light'); EP.settings.set('fontScale',100)"); await pg.emulate_media(media="print"); await pg.wait_for_timeout(300)
    hid = await pg.evaluate("['.topbar','.toc','#hud','.launch-splash'].map(s => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; })")
    rec("print stylesheet hides chrome (header, TOC, HUD)", all(hid), json.dumps(hid))
    await pg.pdf(path=str(OUT / "d-print.pdf"), format="A4", print_background=True) if False else None
    await pg.emulate_media(media="screen")
    # print sheet mode
    await pg.evaluate("EP.tools.open('brief')"); await pg.wait_for_timeout(500)
    await pg.evaluate("document.body.setAttribute('data-print','sheet'); document.getElementById('printSheet').replaceChildren(document.querySelector('.brief-sheet').cloneNode(true))"); await pg.emulate_media(media="print"); await pg.wait_for_timeout(200)
    shown = await pg.evaluate("getComputedStyle(document.getElementById('printSheet')).display + '|' + getComputedStyle(document.querySelector('.layout')).display + '|' + getComputedStyle(document.querySelector('.topbar')).display")
    rec("print-sheet mode prints only the prepared document", shown == "block|none|none", shown)
    await ctx.close()

async def t_links(p, base):
    ctx = await p.new_context(viewport={"width": 1300, "height": 900}); pg, col = await boot(ctx, base + "/index.html")
    ext = await pg.evaluate("[...new Set([...document.querySelectorAll('a[href^=http]')].map(a => a.href))]")
    anchors = await pg.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1))))")
    ext_bad = await pg.evaluate("[...document.querySelectorAll('a[href^=http]')].filter(a => a.target === '_blank' && !/noopener/.test(a.rel)).map(a => a.href)")
    rec("every in-page link resolves", not anchors, json.dumps(anchors))
    rec("every external link opens with rel=noopener noreferrer", not ext_bad, json.dumps(ext_bad[:5]))
    (OUT / "external-links.json").write_text(json.dumps(sorted(ext), indent=1)); print("   external link count:", len(ext))
    await ctx.close()

async def main():
    (DIST / "_blank.html").write_text("<!doctype html><title>blank</title>")
    httpd = serve(DIST, 8803); base = "http://127.0.0.1:8803"
    only = sys.argv[1:] 
    async with async_playwright() as pw:
        p = await pw.chromium.launch()
        for name, fn in (("migration", t_migration), ("multitab", t_multitab), ("encrypted", t_encrypted), ("classroom", t_classroom), ("collab", t_collab), ("strict", t_strict_and_youth), ("layouts", t_layouts), ("modes", t_modes), ("links", t_links)):
            if only and name not in only: continue
            print(f"--- {name} ---", flush=True)
            try: await fn(p, base)
            except Exception as e: rec(name + " (crashed)", False, repr(e)[:300])
        await p.close()
    httpd.shutdown(); (DIST / "_blank.html").unlink(missing_ok=True)
    bad = [r for r in results if not r[1]]; print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
asyncio.run(main())
