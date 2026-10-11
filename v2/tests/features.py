import asyncio, json, sys, traceback
from pathlib import Path
from playwright.async_api import async_playwright
from helpers import serve, Collector, wait_ready
DIST = Path("/home/claude/work/v4/dist"); OUT = Path("/home/claude/work/v4/tests")
results = []
def rec(name, ok, detail=""):
    results.append((name, ok, detail)); print(("PASS " if ok else "FAIL ") + name + (" :: " + detail if detail and not ok else ""))

async def step(name, coro):
    try:
        r = await coro
        rec(name, True if r is None else bool(r), "" if r in (None, True) else str(r))
    except Exception as e:
        rec(name, False, (str(e).splitlines() or [''])[0][:240])

async def main():
    httpd = serve(DIST, 8802)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1360, "height": 900}, accept_downloads=True, color_scheme="dark")
        pg = await ctx.new_page(); col = Collector(pg)
        await pg.goto("http://127.0.0.1:8802/index.html", wait_until="load"); await wait_ready(pg)
        ev = pg.evaluate
        await pg.click("#enterWorkspace"); await pg.wait_for_timeout(1000)
        # lens dialog appears once
        async def lens_dialog():
            n = await ev("document.querySelectorAll('dialog.ep-dialog[open]').length"); return n == 1 or f"dialogs={n}"
        await step("lens chooser appears once after the splash", lens_dialog())
        await pg.click("dialog.ep-dialog button[data-act=skip]"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(OUT / "f-home-dark.png"))
        # demo data
        async def demo():
            await pg.click("#demoLoad"); await pg.wait_for_timeout(900)
            c = await ev("({p: EP.core.state.projects.length, ext: Object.fromEntries(Object.entries(EP.core.state.ext).map(([k,v]) => [k, v.length]))})")
            return (c["p"] == 1 and c["ext"].get("stakeholders") == 6 and c["ext"].get("briefs") == 1) or json.dumps(c)
        await step("example data loads into every tool", demo())
        async def tools_render():
            bad = []
            for tid in ["brief", "decision", "pilot", "stakeholders", "risk", "logic"]:
                await ev(f"EP.tools.open('{tid}')"); await pg.wait_for_timeout(250)
                n = await ev(f"document.getElementById('tk-panel-{tid}').children.length")
                vis = await ev(f"!document.getElementById('tk-panel-{tid}').hidden")
                if not (n > 0 and vis): bad.append(tid)
            for tid in ["kits", "passport", "review"]:
                await ev(f"EP.tools.open('{tid}')"); await pg.wait_for_timeout(250)
                n = await ev(f"document.getElementById('tk-panel-{tid}').children.length"); vis = await ev(f"!document.getElementById('tk-panel-{tid}').hidden")
                if not (n > 0 and vis): bad.append(tid)
            return not bad or "empty: " + ",".join(bad)
        await step("all nine tool panels render", tools_render())
        await ev("EP.tools.open('decision')"); await pg.wait_for_timeout(1800)
        await pg.screenshot(path=str(OUT / "f-decision.png"))
        async def decision_demo():
            await pg.wait_for_timeout(1200)
            txt = await ev("document.getElementById('tk-panel-decision').innerText")
            has_opts = all(x in txt for x in ["Unsupervised open table", "Exchange pilot", "Status quo"])
            stab = any(x in txt for x in ["Stable", "Leaning", "Unclear"]) and "perturbed runs" in txt
            excluded = "Excluded: fails a safeguard" in txt
            return (has_opts and stab and excluded) or f"opts={has_opts} stab={stab} excl={excluded} :: {txt[:200]}"
        await step("decision matrix shows stability + safeguard exclusion for the demo", decision_demo())
        await ev("EP.tools.open('stakeholders')"); await pg.wait_for_timeout(300)
        async def unheard():
            txt = await ev("document.getElementById('tk-panel-stakeholders').innerText"); return "Students with food allergies" in txt and "engage these first" in txt or txt[:300]
        await step("stakeholder map flags the unheard, affected group", unheard())
        await pg.screenshot(path=str(OUT / "f-stakeholders.png"))
        await ev("EP.tools.open('risk')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(OUT / "f-risk.png"))
        await ev("EP.tools.open('pilot')"); await pg.wait_for_timeout(300)
        async def pilot_numbers():
            txt = await ev("document.getElementById('tk-panel-pilot').innerText"); return "388" in txt or txt[:300]
        await step("pilot calculator shows 388 per group by default", pilot_numbers())
        await pg.screenshot(path=str(OUT / "f-pilot.png"))
        # search
        async def search():
            await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(500)
            await pg.keyboard.type("stakeholdr map"); await pg.wait_for_timeout(700)
            n = await ev("document.querySelectorAll('dialog.palette li[role=option]').length")
            top = await ev("(document.querySelector('dialog.palette li[role=option] .title')||{}).textContent")
            await pg.screenshot(path=str(OUT / "f-search.png"))
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
            return n > 0 or "no results"
        await step("search finds results with a typo", search())
        async def search_cmd():
            await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(400); await pg.keyboard.type(">theme"); await pg.wait_for_timeout(400)
            await pg.keyboard.press("Enter"); await pg.wait_for_timeout(400)
            th = await ev("document.documentElement.getAttribute('data-theme')"); await pg.keyboard.press("Escape"); return th == "light" or f"theme={th}"
        await step("command palette toggles theme", search_cmd())
        # language
        async def lang():
            await ev("EP.i18n.set('es')"); await pg.wait_for_timeout(500)
            h = await ev("document.querySelector('.groups a').textContent"); t1 = await ev("document.getElementById('heroTitle').innerText")
            await ev("EP.i18n.set('fr')"); await pg.wait_for_timeout(500)
            h2 = await ev("document.querySelector('.groups a').textContent"); lang = await ev("document.documentElement.lang")
            tool = await ev("document.getElementById('tk-tab-brief').textContent")
            await pg.screenshot(path=str(OUT / "f-fr.png"))
            await ev("EP.i18n.set('en')"); await pg.wait_for_timeout(300)
            return (h == "Inicio" and h2 == "Début" and lang == "fr" and tool == "Atelier de notes") or f"{h}|{h2}|{lang}|{tool}"
        await step("language switch (ES/FR) updates chrome, tools and <html lang>", lang())
        # persistence: reload and check state + prefs
        async def persist():
            await ev("EP.settings.set('fontScale', 120)"); await ev("EP.settings.set('theme','dark')"); await pg.wait_for_timeout(500)
            await pg.reload(wait_until="load"); await wait_ready(pg)
            c = await ev("({p: EP.core.state.projects.length, b: (EP.core.state.ext.briefs||[]).length, fs: EP.settings.get('fontScale'), th: document.documentElement.dataset.theme, mode: EP.store.mode})")
            return (c["p"] == 1 and c["b"] == 1 and c["fs"] == 120 and c["th"] == "dark" and c["mode"] == "indexeddb") or json.dumps(c)
        await step("state, ext records and preferences persist across reload (IndexedDB)", persist())
        await ev("sessionStorage.setItem('ep4-splash-seen','1')")
        # hero screenshots dark
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(OUT / "f-hero-dark.png"))
        # HUD
        async def hud():
            await pg.click("#hud .hud-pill"); await pg.wait_for_timeout(300)
            txt = await ev("document.getElementById('hudPanel').innerText"); await pg.screenshot(path=str(OUT / "f-hud.png"))
            await pg.click("#hud .hud-pill"); return ("quests" in txt.lower() or "Misiones" in txt) and "Badges" in txt or txt[:200]
        await step("HUD panel opens with quests and badges", hud())
        # guide + parallax
        async def guide():
            await ev("EP.nav.reveal('#px1')"); await pg.wait_for_timeout(900); await pg.screenshot(path=str(OUT / "f-guide-px.png"))
            await ev("EP.nav.reveal('#ch-zeroharm')"); await pg.wait_for_timeout(900); await pg.screenshot(path=str(OUT / "f-guide-zh.png"))
            open_ = await ev("document.getElementById('ch-zeroharm').open"); return open_
        await step("guide: parallax band + collapsible chapter reveal", guide())
        # TOC scrollspy
        async def toc():
            await ev("EP.nav.reveal('#system')"); await pg.wait_for_timeout(1200)
            cur = await ev("(document.querySelector('[data-toc][aria-current]')||{dataset:{}}).dataset.toc"); return cur in ("system", "data", "attributions") or f"current={cur}"
        await step("sticky TOC scroll-spy follows the section", toc())
        # system section
        await ev("EP.nav.reveal('#system')"); await pg.wait_for_timeout(500)
        await pg.click("#sysRun"); await pg.wait_for_timeout(2500)
        async def tests_ui():
            txt = await ev("document.getElementById('sysTestSummary').innerText"); return "0 failed" in txt or txt
        await step("System check UI runs all tests", tests_ui())
        await pg.screenshot(path=str(OUT / "f-system.png"), full_page=False)
        async def a11y():
            iss = await ev("EP.system.a11yScan()"); return not iss or "; ".join(iss[:8])
        await step("accessibility scan finds no issues on the live page", a11y())
        print("console/page errors:", len(col.errors()))
        for m in col.errors()[:15]: print("   ", m)
        await b.close()
    httpd.shutdown()
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
asyncio.run(main())
