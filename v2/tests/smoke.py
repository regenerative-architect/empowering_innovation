import asyncio, sys, json
from pathlib import Path
from playwright.async_api import async_playwright
from helpers import serve, Collector, wait_ready
DIST = Path("/home/claude/work/v4/dist")

async def run(url, label, strict=False):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1360, "height": 900}, accept_downloads=True)
        pg = await ctx.new_page(); col = Collector(pg)
        await pg.goto(url, wait_until="load")
        ready = await wait_ready(pg)
        splash_before = await pg.evaluate("!!document.getElementById('launchSplash')")
        await pg.click("#enterWorkspace"); await pg.wait_for_timeout(900)
        splash_after = await pg.evaluate("!!document.getElementById('launchSplash')")
        mods = await pg.evaluate("EP.modules.map(m => m.name + ':' + m.status + (m.error ? '(' + m.error + ')' : ''))")
        print(f"\n=== {label} === ready={ready} splash before/after={splash_before}/{splash_after}")
        print("modules:", " ".join(mods))
        bad = [m for m in mods if ':ok' not in m]
        print("FAILED MODULES:", bad if bad else "none")
        res = await pg.evaluate("EP.system.runAll().then(r => ({pass:r.pass, fail:r.fail, bad:r.rows.filter(x => x.res!=='pass').map(x => x.name+' :: '+x.err)}))")
        print("self-tests:", res["pass"], "passed,", res["fail"], "failed")
        for x in res["bad"]: print("  FAIL:", x)
        print("console/page errors:", len(col.errors()))
        for m in col.errors()[:12]: print("  ", m)
        await pg.screenshot(path=f"/home/claude/work/v4/tests/shot-{label}.png")
        await b.close()

async def main():
    httpd = serve(DIST, 8801)
    await run("http://127.0.0.1:8801/index.html", "http-full")
    await run(f"file://{DIST}/index.html", "file-full")
    await run("http://127.0.0.1:8801/strict/index.html", "http-strict")
    httpd.shutdown()
asyncio.run(main())
