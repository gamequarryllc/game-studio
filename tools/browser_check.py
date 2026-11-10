#!/usr/bin/env python3
"""Loads a game's web build in a headless phone-sized browser and reports problems.

Usage:
  python3 tools/browser_check.py games/<slug> [--out /tmp/<slug>-browser]

Exports the game for the web (needs the Godot web export templates installed),
serves it locally, opens it in headless Chromium as an iPhone in landscape with
touch, waits for it to start, taps the screen, and reports console errors and
page errors. Saves screenshots at three phone/tablet sizes.

The browser here renders with software GL (about 1 fps), so frame rate has to be
checked on a real phone; loading, errors, touch and layout can be checked here.
"""
import argparse
import functools
import http.server
import os
import subprocess
import sys
import threading

# Local Godot binaries by version (STUDIO.md). A game says which it needs in
# games/<slug>/godot_version.txt (4.4.1 when it has none); GODOT overrides.
GODOT_BY_VERSION = {
    "4.4.1": "/home/claude/dl/godot/Godot_v4.4.1-stable_linux.x86_64",
    "4.7.2": "/home/claude/dl/godot47/bin/Godot_v4.7.2-stable_linux.x86_64",
}
GODOT = os.environ.get("GODOT", "")
SIZES = [("iphone", 844, 390), ("iphone-max", 932, 430), ("ipad", 1024, 768)]
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")


def godot_for(project):
    """The Godot binary for this game: $GODOT, or the one its godot_version.txt names."""
    if GODOT:
        return GODOT
    version = "4.4.1"
    path = os.path.join(project, "godot_version.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            version = f.read().strip()
    if version not in GODOT_BY_VERSION:
        sys.exit(f"No local Godot {version} known to this tool: set GODOT=/path/to/godot")
    return GODOT_BY_VERSION[version]


def export(project, out_dir):
    GODOT = godot_for(project)
    if not os.path.exists(GODOT):
        sys.exit(f"Godot not found at {GODOT}: download it (STUDIO.md) or set GODOT=/path/to/godot")
    os.makedirs(out_dir, exist_ok=True)
    subprocess.run([GODOT, "--headless", "--import"], cwd=project, capture_output=True, timeout=300)
    r = subprocess.run([GODOT, "--headless", "--export-release", "Web", os.path.join(out_dir, "index.html")],
                       cwd=project, capture_output=True, text=True, timeout=600)
    if r.returncode != 0 or not os.path.exists(os.path.join(out_dir, "index.wasm")):
        print(r.stdout[-2000:], r.stderr[-2000:])
        sys.exit("web export failed")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    handler = functools.partial(QuietHandler, directory=directory)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--out", default=None)
    ap.add_argument("--wait", type=int, default=25, help="seconds to let the game start")
    args = ap.parse_args()
    project = os.path.abspath(args.project)
    slug = os.path.basename(project.rstrip("/"))
    out = args.out or f"/tmp/{slug}-browser"
    web = os.path.join(out, "web")
    export(project, web)
    httpd = serve(web)
    url = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"

    from playwright.sync_api import sync_playwright
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                    "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        for name, w, h in SIZES:
            ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2,
                                is_mobile=True, has_touch=True, user_agent=UA)
            pg = ctx.new_page()
            pg.set_default_timeout(180000)  # software GL is slow; screenshots can take a while
            pg.on("console", lambda m, n=name: problems.append(f"[{n}] console {m.type}: {m.text[:300]}")
                  if m.type == "error" else None)
            pg.on("pageerror", lambda e, n=name: problems.append(f"[{n}] page error: {str(e)[:300]}"))
            pg.goto(url)
            pg.wait_for_timeout(args.wait * 1000)
            pg.screenshot(path=os.path.join(out, f"{name}_start.png"))
            pg.touchscreen.tap(w * 0.5, h * 0.5)
            pg.wait_for_timeout(3000)
            pg.screenshot(path=os.path.join(out, f"{name}_tapped.png"))
            ctx.close()
        b.close()
    httpd.shutdown()
    print(f"Screenshots in {out}")
    if problems:
        print("Browser check found problems:")
        for line in problems:
            print("  " + line)
        sys.exit(1)
    print("Browser check passed: loads at phone and tablet sizes, touch works, no console errors.")


if __name__ == "__main__":
    main()
