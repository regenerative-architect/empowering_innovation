#!/usr/bin/env python3
"""
build.py - assemble the Empowerment Recursive Innovation OS v4 bundle from src/.

Outputs (in dist/):
  index.html          full edition (optional, consent-gated network add-ons)
  strict/index.html   air-gapped edition (no network code; CSP forbids connections)
  + sw.js, manifest, icons, docs, legacy relay, src/, tools/, tests/ and build-manifest.json
  empowerment_recursive_innovation_os_v4.zip

Static checks (the build FAILS rather than ship a problem):
  - no eval / new Function / document.write / javascript: URLs / inline event-handler attributes
  - no "</script" or "<!--" inside embedded JavaScript
  - every literal i18n key used in code or markup is registered in EN/ES/FR
  - no duplicate ids; every static in-page #link has a target
  - inline <script> blocks are covered by CSP hashes, so 'unsafe-inline' is never granted to scripts

Usage: python3 tools/build.py [--out dist]
"""
import base64, hashlib, json, os, re, shutil, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
sys.path.insert(0, str(ROOT / "tools"))
from patch_core import patch as patch_core  # noqa: E402

VERSION = "4.0.0"
BUILD_DATE = "2026-10-10"
ZIP_NAME = "empowerment_recursive_innovation_os_v4.zip"

SECTION_ORDER = ["home", "guide", "principles", "engines", "evidence", "field-intelligence", "advanced-guides", "institution-matrix",
                 "advanced-sources-section", "builder", "workspace", "innovation", "toolkit", "simulator", "research", "classroom",
                 "collaboration", "local-ai", "protocol", "integrity", "data", "system", "attributions"]
CV_IDS = {"engines", "evidence", "field-intelligence", "advanced-guides", "institution-matrix", "advanced-sources-section", "protocol",
          "research", "attributions", "innovation"}
MAIN_ORDER = ["10-kernel", "11-net", "32-strings", "34-nav", "35-search", "36-hud", "37-data-settings", "39-enhancements", "40-toolkit",
              "41-toolkit2", "47-scenario", "48-classroom", "50-collab", "60-localai", "70-integrity", "80-system", "33-roles-demo",
              "CORE", "90-main"]
WRAP = {"10-kernel", "CORE"}  # files that are not already self-contained IIFEs


def read(p):
    return Path(p).read_text(encoding="utf-8")


def js_pieces(profile, embedded):
    parts = []
    for name in MAIN_ORDER:
        if name == "CORE":
            body = patch_core(read(SRC / "js" / "30-core-v3.js"))
        else:
            body = read(SRC / "js" / f"{name}.js")
        body = body.replace("__EP_PROFILE__", profile).replace("__EP_EMBEDDED_DATA__", embedded)
        if name in WRAP:
            body = "(function(){ 'use strict';\n" + body + "\n})();"
        parts.append(f"/* ===== {name} ===== */\n{body}")
    return "\n".join(parts)


def csp_for(profile, hashes):
    h = " ".join(f"'sha256-{x}'" for x in hashes)
    if profile == "strict":
        return ("default-src 'none'; script-src " + h + "; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src 'none'; "
                "manifest-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; media-src 'none'")
    return ("default-src 'none'; script-src " + h + " https://esm.sh 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; "
            "connect-src 'self' https: wss: blob:; worker-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; "
            "object-src 'none'; frame-src 'none'; media-src 'none'")


def build_html(profile):
    embedded = json.dumps({"sources": json.loads(read(SRC / "data" / "sources.json")), "briefs": json.loads(read(SRC / "data" / "domain-briefs.json"))},
                          ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    css = "\n".join(read(SRC / "css" / f) for f in ("10-core.css", "20-advanced.css", "30-v4.css"))
    boot = read(SRC / "js" / "00-boot.js")
    splash_js = read(SRC / "js" / "05-splash.js")
    main_js = js_pieces(profile, embedded)
    sections = []
    for sid in SECTION_ORDER:
        text = read(SRC / "html" / "sections" / f"{sid}.html").strip("\n")
        if sid in CV_IDS:
            text, n = re.subn(r'(<section class="section)(\s*")', r"\1 cv\2", text, count=1)
            if n != 1:
                text, n = re.subn(r'(<section class="section)( [^"]*")', r"\1 cv\2", text, count=1)
            if n != 1:
                raise SystemExit(f"cannot add cv class to section {sid}")
        sections.append(text)
    used = {p.stem for p in (SRC / "html" / "sections").glob("*.html")}
    missing = used - set(SECTION_ORDER)
    if missing:
        raise SystemExit(f"section files not in SECTION_ORDER: {sorted(missing)}")
    parts = {"VERSION": VERSION, "BUILD_DATE": BUILD_DATE, "CSS": css, "BOOT_JS": boot, "SPLASH": read(SRC / "html" / "splash.html").strip("\n"),
             "SPLASH_JS": splash_js, "MAIN_JS": main_js, "SECTIONS": "\n".join(sections), "CSP": "{{CSP}}"}
    shell = read(SRC / "html" / "shell.html")
    html = re.sub(r"\{\{(\w+)\}\}", lambda m: parts[m.group(1)], shell)  # single pass: injected content is never re-scanned
    scripts = re.findall(r"<script>(.*?)</script>", html, flags=re.S)
    hashes = [base64.b64encode(hashlib.sha256(s.encode("utf-8")).digest()).decode() for s in scripts]
    html = html.replace("{{CSP}}", csp_for(profile, hashes))
    return html, scripts


def check(html, scripts, profile):
    errors = []
    js = "\n".join(scripts)
    for pat, msg in [(r"(?<![\w.])eval\s*\(", "eval()"), (r"new\s+Function\s*\(", "new Function()"), (r"document\.write\s*\(", "document.write()"), (r"javascript:", "javascript: URL")]:
        for m in re.finditer(pat, js):
            ctx = js[max(0, m.start() - 40):m.end() + 40].replace("\n", " ")
            # sanitiser self-tests deliberately feed a javascript: URL to prove it is rejected
            if msg == "javascript: URL" and re.search(r"(S\.url|validateURL)\(\s*'$", js[max(0, m.start() - 20):m.start()]):
                continue
            errors.append(f"forbidden {msg}: …{ctx}…")
    if re.search(r"</script", js, flags=re.I):
        errors.append("'</script' found inside embedded JavaScript")
    if "<!--" in js:
        errors.append("'<!--' found inside embedded JavaScript")
    body_no_scripts = re.sub(r"<script.*?</script>", "", html, flags=re.S)
    body_no_scripts = re.sub(r"<style.*?</style>", "", body_no_scripts, flags=re.S)
    for m in re.finditer(r"\son(?:click|load|error|input|change|submit|focus|blur|key\w+|mouse\w+|pointer\w+)\s*=", body_no_scripts):
        errors.append("inline event handler attribute: " + body_no_scripts[m.start():m.start() + 40])
    if re.search(r'href\s*=\s*"javascript:', body_no_scripts, flags=re.I):
        errors.append("javascript: href in markup")
    # i18n
    registered = set()
    for key in re.findall(r"'([\w.\-]+)'\s*:\s*(?:L\(|\[)", js):
        registered.add(key)
    used = set()
    for m in re.finditer(r"(?<![\w.])(?:EP\.)?t\('([\w.\-]+)'", js):
        used.add(m.group(1))
    for m in re.finditer(r'data-i18n="([\w.\-]+)"', html):
        used.add(m.group(1))
    for m in re.finditer(r'data-i18n-attr="([^"]+)"', html):
        for pair in m.group(1).split(";"):
            if ":" in pair:
                used.add(pair.split(":")[1].strip())
    for m in re.finditer(r"data-i18n=\"([\w.\-]+)\"", js):
        used.add(m.group(1))
    # keys built at runtime (t('prefix.' + x)) are checked as prefixes: at least one registered key must start with it
    missing = sorted(k for k in used if (k not in registered if not k.endswith((".", "-")) else not any(r.startswith(k) for r in registered)))
    if missing:
        errors.append("i18n keys used but not registered: " + ", ".join(missing[:40]))
    # ids
    ids = re.findall(r'\sid="([^"]+)"', body_no_scripts)
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        errors.append("duplicate static ids: " + ", ".join(dup[:20]))
    idset = set(ids)
    broken = sorted({h for h in re.findall(r'href="#([^"]+)"', body_no_scripts) if h not in idset})
    if broken:
        errors.append("in-page links with no static target: " + ", ".join(broken[:30]))
    return errors, sorted(registered), sorted(used)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    out = ROOT / (sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "dist")
    if out.exists():
        shutil.rmtree(out)
    (out / "strict").mkdir(parents=True)
    report = {}
    for profile, dest in (("full", out / "index.html"), ("strict", out / "strict" / "index.html")):
        html, scripts = build_html(profile)
        errors, registered, used = check(html, scripts, profile)
        if errors:
            print(f"BUILD FAILED ({profile}):")
            for e in errors:
                print("  -", e)
            sys.exit(1)
        dest.write_text(html, encoding="utf-8")
        report[profile] = {"bytes": len(html.encode("utf-8")), "i18n_keys": len(registered), "scripts": len(scripts)}
        print(f"{profile:7s} index.html: {len(html.encode('utf-8')) / 1024:.0f} KB · {len(scripts)} inline scripts (all CSP-hashed) · {len(registered)} translated keys")
    # static companions
    for rel in ("icons/icon-192.svg", "icons/icon-512.svg"):
        (out / Path(rel).parent).mkdir(exist_ok=True)
        shutil.copy(ROOT / rel, out / rel)
    for rel in ("sw.js", "manifest.webmanifest", "README.md", "CHANGELOG.md", "ATTRIBUTIONS.md", "LICENSE"):
        shutil.copy(ROOT / "static" / rel, out / rel)
    shutil.copytree(ROOT / "legacy", out / "legacy")
    shutil.copytree(SRC, out / "src", ignore=shutil.ignore_patterns("*.pyc", "__pycache__"))
    (out / "tools").mkdir()
    for f in ("build.py", "patch_core.py"):
        shutil.copy(ROOT / "tools" / f, out / "tools" / f)
    if (ROOT / "tests").exists():
        shutil.copytree(ROOT / "tests", out / "tests", ignore=shutil.ignore_patterns("*.pyc", "__pycache__", "*.png", "*.json", "*.pdf"))
    # manifest
    files = []
    for p in sorted(out.rglob("*")):
        if p.is_file():
            b = p.read_bytes()
            files.append({"path": p.relative_to(out).as_posix(), "bytes": len(b), "sha256": sha(b)})
    manifest = {"schema": "empowerment-build-manifest/2", "version": VERSION, "built": BUILD_DATE, "editions": report,
                "pins": {"trystero": "0.25.3", "webllm": "0.2.85"}, "notes": ["index.html is fully standalone; optional network add-ons load only after consent", "strict/index.html is the air-gapped edition", "CSP uses script hashes; no 'unsafe-inline' for scripts"], "files": files}
    (out / "build-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    # zip (fixed timestamps for reproducibility)
    zpath = out / ZIP_NAME
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(out.rglob("*")):
            if p.is_file() and p != zpath:
                zi = zipfile.ZipInfo(p.relative_to(out).as_posix(), date_time=(2026, 10, 10, 0, 0, 0))
                zi.compress_type = zipfile.ZIP_DEFLATED
                zi.external_attr = 0o644 << 16
                z.writestr(zi, p.read_bytes())
    print(f"zip: {zpath.name} {zpath.stat().st_size / 1024:.0f} KB · {len(files)} files")


if __name__ == "__main__":
    main()
