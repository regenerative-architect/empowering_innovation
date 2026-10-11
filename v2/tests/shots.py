import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
from helpers import serve, Collector, wait_ready
DIST = Path("/home/claude/work/v4/dist"); OUT = Path("/home/claude/work/v4/tests")
async def go(ctx, url):
    pg = await ctx.new_page(); col = Collector(pg); await pg.goto(url, wait_until="load"); await wait_ready(pg)
    try: await pg.click("#enterWorkspace", timeout=3000)
    except Exception: pass
    await pg.wait_for_timeout(900)
    try: await pg.click("dialog.ep-dialog button[data-act=skip]", timeout=1500)
    except Exception: pass
    return pg, col
async def main():
    httpd = serve(DIST, 8805); base = "http://127.0.0.1:8805/index.html"
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        # mobile light
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, color_scheme="light", is_mobile=True, has_touch=True, device_scale_factor=2)
        pg, col = await go(ctx, base)
        await pg.evaluate("window.scrollTo({top:0,behavior:'instant'})"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(OUT / "s-mobile-top.png"))
        await pg.evaluate("document.getElementById('guide').scrollIntoView({behavior:'instant'})"); await pg.wait_for_timeout(500); await pg.screenshot(path=str(OUT / "s-mobile-guide.png"))
        await pg.evaluate("EP.demo.load()"); await pg.wait_for_timeout(1800)
        await pg.evaluate("EP.tools.open('stakeholders')"); await pg.wait_for_timeout(1500); await pg.screenshot(path=str(OUT / "s-mobile-tool.png"))
        await pg.click("#hud .hud-pill"); await pg.wait_for_timeout(400); await pg.screenshot(path=str(OUT / "s-mobile-hud.png"))
        print("mobile errors", col.errors()[:3]); await ctx.close()
        # desktop light, demo loaded, various
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}, color_scheme="light")
        pg, col = await go(ctx, base)
        await pg.evaluate("EP.demo.load()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("window.scrollTo({top:0,behavior:'instant'})"); await pg.wait_for_timeout(600); await pg.screenshot(path=str(OUT / "s-home-light.png"))
        await pg.evaluate("EP.tools.open('brief')"); await pg.wait_for_timeout(1500); await pg.screenshot(path=str(OUT / "s-brief.png"))
        await pg.evaluate("EP.tools.open('risk')"); await pg.wait_for_timeout(1200); await pg.screenshot(path=str(OUT / "s-risk.png"))
        await pg.evaluate("EP.nav.reveal('#mcPanel')"); await pg.wait_for_timeout(1200)
        await pg.click("#mcPanel button.primary"); await pg.wait_for_timeout(1500); await pg.screenshot(path=str(OUT / "s-mc.png"))
        await pg.evaluate("EP.nav.reveal('#integrity')"); await pg.wait_for_timeout(1200); await pg.screenshot(path=str(OUT / "s-integrity.png"))
        await pg.evaluate("EP.nav.reveal('#collaboration')"); await pg.wait_for_timeout(1200); await pg.screenshot(path=str(OUT / "s-collab.png"))
        print("desktop errors", col.errors()[:3]); await ctx.close()
        await b.close()
    httpd.shutdown()
asyncio.run(main())
