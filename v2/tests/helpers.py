import asyncio, functools, http.server, socketserver, threading
from playwright.async_api import async_playwright

def serve(root, port):
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Q, directory=str(root))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

class Collector:
    def __init__(self, page):
        self.msgs = []
        page.on("console", lambda m: self.msgs.append((m.type, m.text[:300])) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: self.msgs.append(("pageerror", str(e)[:300])))
        page.on("requestfailed", lambda r: self.msgs.append(("requestfailed", r.url[:140] + " " + str(r.failure)[:60])))
    def errors(self):
        return [m for m in self.msgs]

async def wait_ready(pg, timeout=15.0):
    import time
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = await pg.evaluate("document.documentElement.dataset.ready || ''")
        if v: return v
        await asyncio.sleep(0.15)
    return ""
