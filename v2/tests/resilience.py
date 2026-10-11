import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright
from helpers import serve, Collector, wait_ready
DIST = Path("/home/claude/work/v4/dist"); OUT = Path("/home/claude/work/v4/tests")
results = []
def rec(name, ok, detail=""):
    results.append((name, ok)); print(("PASS " if ok else "FAIL ") + name + ((" :: " + str(detail)[:300]) if (detail and not ok) else ""), flush=True)

async def main():
    httpd = serve(DIST, 8807); base = "http://127.0.0.1:8807"
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        # 1. opt-in service worker + offline reload
        ctx = await b.new_context(viewport={"width":1300,"height":900}, service_workers="allow")
        pg = await ctx.new_page(); col = Collector(pg); await pg.goto(base + "/index.html"); await wait_ready(pg)
        regs0 = await pg.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)")
        manifest0 = await pg.evaluate("!!document.querySelector('link[rel=manifest]')")
        rec("nothing is registered or fetched automatically (no service worker, no manifest link)", regs0 == 0 and manifest0 is False, [regs0, manifest0])
        await pg.click("#enterWorkspace"); await pg.wait_for_timeout(800)
        try: await pg.click("dialog.ep-dialog button[data-act=skip]", timeout=1500)
        except Exception: pass
        await pg.evaluate("EP.nav.reveal('#data')"); await pg.wait_for_timeout(1000)
        await pg.click("#installPwa"); await pg.wait_for_timeout(2500)
        regs1 = await pg.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)")
        cached = await pg.evaluate("caches.keys().then(async ks => { const out = []; for (const k of ks) { const c = await caches.open(k); out.push(...(await c.keys()).map(r => new URL(r.url).pathname)); } return out; })")
        rec("pressing the button registers the service worker and caches the app shell", regs1 == 1 and any(p.endswith("index.html") or p == "/" for p in cached), [regs1, cached])
        await pg.evaluate("EP.demo.load()"); await pg.wait_for_timeout(900)
        await ctx.set_offline(True)
        pg2 = await ctx.new_page(); await pg2.goto(base + "/index.html"); r = await wait_ready(pg2)
        n = await pg2.evaluate("EP.core.state.projects.length"); mods = await pg2.evaluate("EP.modules.filter(m => m.status !== 'ok').length")
        rec("offline reload of the hosted copy works and keeps the person's data", r == "1" and n == 1 and mods == 0, [r, n, mods])
        await ctx.close()
        # 2. IndexedDB unavailable -> memory/LocalStorage fallback
        ctx = await b.new_context(viewport={"width":1300,"height":900})
        await ctx.add_init_script("Object.defineProperty(window, 'indexedDB', {value: undefined, configurable: true});")
        pg = await ctx.new_page(); col = Collector(pg); await pg.goto(base + "/index.html"); r = await wait_ready(pg)
        await pg.click("#enterWorkspace"); await pg.wait_for_timeout(800)
        try: await pg.click("dialog.ep-dialog button[data-act=skip]", timeout=1500)
        except Exception: pass
        info = await pg.evaluate("({mode: EP.store.mode, status: document.getElementById('storageStatus').textContent, bad: EP.modules.filter(m => m.status !== 'ok').map(m => m.name)})")
        await pg.evaluate("EP.demo.load()"); await pg.wait_for_timeout(900)
        info2 = await pg.evaluate("({p: EP.core.state.projects.length, ls: !!localStorage.getItem('fn_ep_backup_v1')})")
        rec("with IndexedDB blocked the app still runs, falls back (memory/LocalStorage) and says so", r == "1" and info["mode"] == "memory" and not info["bad"] and ("LocalStorage" in info["status"] or "Memory" in info["status"]), [info, info2])
        rec("with IndexedDB blocked, work is still mirrored to the LocalStorage fallback", info2["p"] == 1 and info2["ls"] is True, info2)
        print("   console errors:", col.errors()[:3]); await ctx.close()
        # 3. JavaScript disabled
        ctx = await b.new_context(viewport={"width":1300,"height":900}, java_script_enabled=False)
        pg = await ctx.new_page(); await pg.goto(base + "/index.html"); await pg.wait_for_timeout(500)
        txt = await pg.evaluate("document.body.innerText") if False else await pg.inner_text("body")
        rec("JavaScript disabled: noscript guidance and static sections remain readable", "JavaScript is disabled" in txt and "Zero-Harm" in txt and "Why" in txt and "recursive" in txt.lower(), txt[:200])
        splash_hidden = await pg.evaluate("getComputedStyle(document.getElementById('launchSplash')).display") if False else None
        await pg.screenshot(path=str(OUT / "r-nojs.png")); await ctx.close()
        await b.close()
    httpd.shutdown(); bad = [r for r in results if not r[1]]; print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
asyncio.run(main())
