#!/usr/bin/env python3
"""Render extension icons and Chrome Web Store graphics with headless Chrome.

Outputs:
  icons/icon{16,32,48,128}.png      extension icons (transparent background)
  store/screenshot-1.png            1280x800 store screenshot (protected site)
  store/screenshot-2.png            1280x800 store screenshot (allowlisted site)
  store/promo-small.png             440x280 small promo tile

Set CHROME to the Chrome/Chromium binary if it is not at the macOS default.
"""

import base64
import html
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

SHIELD_PATH = "M64 6 L114 24 V60 C114 92 92 113 64 122 C36 113 14 92 14 60 V24 Z"
CHECK_PATH = "M40 64 L57 81 L90 46"


def icon_svg(padding: float = 0.0) -> str:
    """Shield icon; padding is the fraction of the canvas left empty on each side."""
    scale = 1 - 2 * padding
    offset = 128 * padding
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff5a5f"/><stop offset="1" stop-color="#c81e2b"/>
  </linearGradient></defs>
  <g transform="translate({offset} {offset}) scale({scale})">
  <path d="{SHIELD_PATH}" fill="url(#g)"/>
  <path d="{CHECK_PATH}" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>"""


def render(page_html: str, out_path: str, width: int, height: int) -> None:
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if os.path.exists(out_path):
        os.unlink(out_path)
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = os.path.join(tmpdir, "page.html")
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(page_html)
        # A private profile keeps Chrome from handing off to an already-running
        # instance (which would exit 0 without writing the screenshot).
        result = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             f"--user-data-dir={os.path.join(tmpdir, 'profile')}",
             "--force-device-scale-factor=1", "--default-background-color=00000000",
             f"--window-size={width},{height}", f"--screenshot={out_path}", "file://" + tmp],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=60,
        )
    if result.returncode != 0 or not os.path.exists(out_path):
        sys.exit(f"Chrome failed to render {out_path} (exit {result.returncode}):\n{result.stderr[-2000:]}")
    print(f"Rendered {os.path.relpath(out_path, ROOT)} ({width}x{height})")


def icon_page(size: int, padding: float = 0.0) -> str:
    # Explicit pixel size: headless Chrome's viewport can differ from
    # --window-size at small sizes, so viewport units are unreliable here.
    return page(f'<div style="width:{size}px;height:{size}px">{icon_svg(padding)}</div>')


def page(body: str, css: str = "") -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html, body {{ margin: 0; padding: 0; background: transparent; overflow: hidden;  }}
{css}</style></head><body>{body}</body></html>"""


def replace_once(text: str, old: str, new: str) -> str:
    """Replace exactly one occurrence; fail loudly if popup.html changed shape."""
    if text.count(old) != 1:
        sys.exit(f"render_assets: expected one {old!r} in popup.html; update the script")
    return text.replace(old, new)


def popup_srcdoc(domain: str, blocked: int, allowlisted: bool) -> str:
    """Static copy of popup/popup.html with representative state filled in."""
    with open(os.path.join(ROOT, "popup", "popup.html"), encoding="utf-8") as f:
        markup = f.read()
    with open(os.path.join(ROOT, "popup", "popup.css"), encoding="utf-8") as f:
        css = f.read()
    with open(os.path.join(ROOT, "icons", "icon48.png"), "rb") as f:
        icon_uri = "data:image/png;base64," + base64.b64encode(f.read()).decode()

    markup = re.sub(r"<script[^>]*></script>", "", markup)
    markup = replace_once(markup, '<link rel="stylesheet" href="popup.css">', f"<style>{css}</style>")
    markup = replace_once(markup, 'src="../icons/icon48.png"', f'src="{icon_uri}"')
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        version = json.load(f)["version"]
    markup = replace_once(markup, '<span class="version" id="version"></span>',
                            f'<span class="version" id="version">v{version} (MV3)</span>')
    markup = replace_once(markup, "Loading...", domain)
    markup = replace_once(markup, '<span class="counter-num" id="blocked-count">0</span>',
                            f'<span class="counter-num" id="blocked-count">{blocked}</span>')
    for input_id in ("master-toggle", "module-ads", "module-trackers", "module-cookies", "module-cosmetic"):
        markup = replace_once(markup, f'id="{input_id}">', f'id="{input_id}" checked>')
    if allowlisted:
        markup = replace_once(markup, 'id="site-allow-toggle">', 'id="site-allow-toggle" checked>')
        markup = replace_once(markup, '<span id="site-status" class="status-tag">Protected</span>',
                                '<span id="site-status" class="status-tag whitelisted">Allowlisted</span>')
    return markup


def screenshot(out: str, headline: str, points: list[str], domain: str, blocked: int, allowlisted: bool) -> None:
    items = "".join(f"<li>{html.escape(p)}</li>" for p in points)
    srcdoc = html.escape(popup_srcdoc(domain, blocked, allowlisted), quote=True)
    body = f"""
<div class="wrap">
  <div class="copy">
    <div class="brand"><div class="logo">{icon_svg()}</div><span>ShieldBlock</span></div>
    <h1>{html.escape(headline)}</h1>
    <ul>{items}</ul>
  </div>
  <div class="popup"><iframe srcdoc="{srcdoc}"></iframe></div>
</div>"""
    css = """
body { width: 1280px; height: 800px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: radial-gradient(circle at 75% 40%, #2a1418 0%, #12151c 55%) #12151c; color: #f0f3f6; }
.wrap { display: flex; align-items: center; height: 800px; padding: 0 90px; box-sizing: border-box; gap: 70px; }
.copy { flex: 1; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 700; color: #ff6b70; }
.logo { width: 52px; height: 52px; }
h1 { font-size: 50px; line-height: 1.12; margin: 26px 0 30px; letter-spacing: -0.5px; }
ul { margin: 0; padding: 0; list-style: none; }
li { font-size: 23px; color: #c9d1d9; margin: 0 0 16px; padding-left: 34px; position: relative; }
li::before { content: ""; position: absolute; left: 0; top: 9px; width: 14px; height: 14px; border-radius: 50%; background: #ea3943; }
.popup { width: 448px; height: 756px; border-radius: 18px; overflow: hidden; flex: none;
  box-shadow: 0 30px 80px rgba(0,0,0,.6), 0 0 0 1px #30363d; }
.popup iframe { width: 320px; height: 540px; border: 0; transform: scale(1.4); transform-origin: 0 0; background: #12151c; }
"""
    render(page(body, css), out, 1280, 800)


def main() -> None:
    if not os.path.exists(CHROME):
        sys.exit(f"Chrome not found at {CHROME!r}; set the CHROME environment variable.")

    # Small icons use the full canvas; 128px keeps the Web Store's ~16px padding.
    for size in (16, 32, 48):
        render(icon_page(size), os.path.join(ROOT, "icons", f"icon{size}.png"), size, size)
    render(icon_page(128, padding=0.125), os.path.join(ROOT, "icons", "icon128.png"), 128, 128)

    store = os.path.join(ROOT, "store")
    screenshot(os.path.join(store, "screenshot-1.png"),
               "Block ads and trackers. Keep pages working.",
               ["~150,000 ad, tracker and cloaked-tracker domains",
                "Strips third-party cookies from subresources",
                "Anti-adblock stubs keep sites from breaking",
                "No data collection. Everything runs locally."],
               "news.example.com", 47, allowlisted=False)
    screenshot(os.path.join(store, "screenshot-2.png"),
               "You decide what runs, site by site.",
               ["Allowlist a site and its subdomains in one click",
                "Toggle ads, trackers, cookies and cosmetics separately",
                "Live blocked-request count on the toolbar badge",
                "Open source, MIT licensed"],
               "shop.example.com", 0, allowlisted=True)

    promo = f"""
<div class="tile"><div class="logo">{icon_svg()}</div>
  <div><div class="name">ShieldBlock</div><div class="tag">Fast, private ad &amp; tracker blocking</div></div></div>"""
    promo_css = """
body { width: 440px; height: 280px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: radial-gradient(circle at 25% 40%, #3a161b 0%, #12151c 70%) #12151c; color: #f0f3f6; }
.tile { display: flex; align-items: center; gap: 22px; height: 280px; padding: 0 36px; box-sizing: border-box; }
.logo { width: 120px; height: 120px; flex: none; }
.name { font-size: 38px; font-weight: 800; letter-spacing: -0.5px; }
.tag { font-size: 17px; color: #c9d1d9; margin-top: 8px; line-height: 1.35; }
"""
    render(page(promo, promo_css), os.path.join(store, "promo-small.png"), 440, 280)


if __name__ == "__main__":
    main()
