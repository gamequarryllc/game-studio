#!/usr/bin/env python3
"""Builds the play-links page (index.html) and status.json for the studio site.

Usage: python3 tools/build_site.py <site_dir> <results.txt>

Reads queue.json for the apps and games and their status, and results.txt
("<slug> ok" / "<slug> failed" for a game, "apps/<slug> ok" / "apps/<slug>
failed" for an app, one per line) for which builds made it.
Also writes the privacy policy and support pages (tools/site_pages.py) and
404.html, which sends a reloaded page inside an app preview back to that app.
"""
import datetime
import html
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import site_pages  # noqa: E402  (the privacy policy and support pages)

STATUS_LABEL = {
    "queued": "Queued",
    "building": "Being built",
    "first-playable": "First playable",
    "polishing": "Polishing",
    "ready-to-play": "Ready to play",
    "ready-to-test": "Ready to test",
    "shipped": "On the App Store",
    "parked": "Parked",
}


NOT_FOUND = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Not found · Game Quarry</title>
<script>
// An app preview is a single page that draws its own screens. When someone
// reloads one of those screens, the site has no file for it and lands here:
// send them to the app's front page with the screen they wanted in "?p=".
(function () {
  var apps = __APPS__;
  var m = location.pathname.match(/^(.*\/apps\/([a-z0-9-]+))(\/.+)$/);
  if (m && apps.indexOf(m[2]) !== -1) {
    location.replace(m[1] + "/?p=" + encodeURIComponent(m[3] + location.search) + location.hash);
  }
})();
</script>
<style>
  body { margin: 0; background: #16130f; color: #f3ece2; font: 17px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 72px 20px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  a { color: #f0a05c; }
</style>
</head>
<body>
<main>
  <h1>Nothing at this address</h1>
  <p>The page may have moved. <a href="__HOME__">Back to the studio page</a>.</p>
</main>
</body>
</html>
"""


def app_card(i, a, results, site_dir, root):
    """One app on the index page: its icon, where it stands, and the link to its preview."""
    key = "apps/" + a["slug"]
    built = results.get(key) == "ok"
    broke = results.get(key) == "failed"
    label = STATUS_LABEL.get(a["status"], a["status"])
    if built:
        action = f'<a class="play" href="apps/{html.escape(a["slug"])}/">Open</a>'
    elif broke:
        action = '<span class="soon broke">Build broke, fixing</span>'
    else:
        action = '<span class="soon">No preview yet</span>'
    # The app's own icon, once it has a preview; a plain tile in its colour until then.
    tile = '<div class="tile" aria-hidden="true"></div>'
    icon = os.path.join(root, "apps", a["slug"], "assets", "images", "icon.png")
    if built and os.path.exists(icon) and os.path.isdir(os.path.join(site_dir, "apps", a["slug"])):
        shutil.copyfile(icon, os.path.join(site_dir, "apps", a["slug"], "studio-icon.png"))
        tile = f'<img class="tile" src="apps/{html.escape(a["slug"])}/studio-icon.png" alt="" width="52" height="52">'
    note = f'<p class="note">{html.escape(a["note"])}</p>' if a.get("note") else ""
    return f"""
      <li class="card" style="--c:{html.escape(a.get('color', '#888'))}">
        {tile}
        <div class="body">
          <div class="top"><span class="num">#{i}</span><span class="pill s-{html.escape(a['status'])}">{html.escape(label)}</span></div>
          <h3>{html.escape(a['title'])}</h3>
          <p>{html.escape(a['tagline'])}</p>
          {note}
        </div>
        <div class="act">{action}</div>
      </li>"""


def main():
    site_dir, results_path = sys.argv[1], sys.argv[2]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "queue.json"), encoding="utf-8") as f:
        queue = json.load(f)
    games = queue["games"]
    apps = queue.get("apps", [])

    results = {}
    if os.path.exists(results_path):
        with open(results_path, encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2:
                    results[parts[0]] = parts[1]

    now = datetime.datetime.now(datetime.timezone.utc)
    sha = os.environ.get("GITHUB_SHA", "local")[:7]

    for g in games:
        if g["slug"] in site_pages.RESERVED_SLUGS:
            sys.exit(f"A game can't be called '{g['slug']}': the site uses that folder.")
    for a in apps:
        if a["slug"] in site_pages.RESERVED_APP_SLUGS:
            sys.exit(f"An app can't be called '{a['slug']}': the site uses that folder.")
    os.makedirs(site_dir, exist_ok=True)
    try:
        pages = site_pages.render(site_dir, root)
    except SystemExit as e:
        # A broken page must not take the play links down with it: publish the
        # games, say what broke, and let tools/store_check.py fail the run.
        print(f"::error title=Site pages::{e}")
        pages = {"error": str(e)}

    status = {
        "built_at": now.isoformat(timespec="seconds"),
        "commit": sha,
        "site": pages,
        "apps": {
            a["slug"]: {
                "status": a["status"],
                "build": results.get("apps/" + a["slug"], "none"),
                "preview": results.get("apps/" + a["slug"]) == "ok",
            }
            for a in apps
        },
        "games": {
            g["slug"]: {
                "status": g["status"],
                "build": results.get(g["slug"], "none"),
                "playable": results.get(g["slug"]) == "ok",
            }
            for g in games
        },
    }
    with open(os.path.join(site_dir, "status.json"), "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2)

    # A reloaded screen inside an app preview comes back through 404.html.
    built_apps = [a["slug"] for a in apps if results.get("apps/" + a["slug"]) == "ok"]
    home = site_pages.SITE_URL
    with open(os.path.join(site_dir, "404.html"), "w", encoding="utf-8") as f:
        f.write(NOT_FOUND.replace("__APPS__", json.dumps(built_apps)).replace("__HOME__", html.escape(home)))

    app_cards = [app_card(i, a, results, site_dir, root) for i, a in enumerate(apps, 1)]
    previews = len(built_apps)

    cards = []
    for i, g in enumerate(games, 1):
        built = results.get(g["slug"]) == "ok"
        broke = results.get(g["slug"]) == "failed"
        label = STATUS_LABEL.get(g["status"], g["status"])
        if built:
            action = f'<a class="play" href="{html.escape(g["slug"])}/">Play</a>'
        elif broke:
            action = '<span class="soon broke">Build broke, fixing</span>'
        else:
            action = '<span class="soon">Not playable yet</span>'
        note = f'<p class="note">{html.escape(g["note"])}</p>' if g.get("note") else ""
        cards.append(f"""
      <li class="card" style="--c:{html.escape(g.get('color', '#888'))}">
        <div class="emoji" aria-hidden="true">{html.escape(g.get('emoji', ''))}</div>
        <div class="body">
          <div class="top"><span class="num">#{i}</span><span class="pill s-{html.escape(g['status'])}">{html.escape(label)}</span></div>
          <h3>{html.escape(g['title'])}</h3>
          <p>{html.escape(g['tagline'])}</p>
          {note}
        </div>
        <div class="act">{action}</div>
      </li>""")

    playable = sum(1 for g in games if results.get(g["slug"]) == "ok")
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#16130f">
<title>Game Studio</title>
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: #16130f; color: #f3ece2; font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
  main {{ max-width: 760px; margin: 0 auto; padding: max(28px, env(safe-area-inset-top)) 18px 48px; }}
  header h1 {{ margin: 0 0 4px; font-size: 30px; letter-spacing: -0.02em; }}
  header p {{ margin: 0; color: #b8ab98; }}
  .meta {{ margin: 18px 0 22px; font-size: 13px; color: #8f8474; }}
  ul {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }}
  .card {{ display: grid; grid-template-columns: 52px 1fr; gap: 6px 14px; padding: 16px; border-radius: 16px; background: #221d17; border: 1px solid #332b22; border-left: 4px solid var(--c); }}
  .emoji {{ font-size: 34px; line-height: 52px; text-align: center; background: color-mix(in srgb, var(--c) 18%, transparent); border-radius: 12px; height: 52px; }}
  .tile {{ display: block; width: 52px; height: 52px; border-radius: 12px; background: color-mix(in srgb, var(--c) 55%, #16130f); }}
  .top {{ display: flex; gap: 8px; align-items: center; font-size: 12px; }}
  .num {{ color: #8f8474; }}
  .pill {{ padding: 2px 8px; border-radius: 99px; background: #332b22; color: #cfc3b2; font-weight: 600; }}
  .s-building {{ background: #3b2f12; color: #f0c860; }}
  .s-first-playable, .s-polishing {{ background: #13324a; color: #8fd0ff; }}
  .s-ready-to-play, .s-ready-to-test, .s-shipped {{ background: #163a22; color: #8ee0a6; }}
  h2 {{ margin: 34px 0 2px; font-size: 22px; letter-spacing: -0.01em; }}
  .hint {{ margin: 0 0 14px; color: #b8ab98; font-size: 14.5px; }}
  h3 {{ margin: 4px 0 2px; font-size: 19px; }}
  .body p {{ margin: 0; color: #cfc3b2; font-size: 14.5px; }}
  .body .note {{ margin-top: 6px; color: #8f8474; font-size: 13px; }}
  .act {{ grid-column: 2; margin-top: 8px; }}
  .play {{ display: inline-block; padding: 9px 22px; border-radius: 10px; background: var(--c); color: #16130f; font-weight: 700; text-decoration: none; }}
  .soon {{ font-size: 13px; color: #8f8474; }}
  .broke {{ color: #f08a6a; }}
  footer {{ margin-top: 26px; font-size: 13px; color: #8f8474; }}
  footer a {{ color: #b8ab98; }}
  footer p {{ margin: 0 0 8px; }}
</style>
</head>
<body>
<main>
  <header>
    <h1>Game Studio</h1>
    <p>Apps and games Claude is building for Game Quarry.</p>
  </header>
  <p class="meta">{previews} of {len(apps)} apps with a preview · {playable} of {len(games)} games playable · updated {now.strftime('%b %d, %H:%M UTC')} · build {html.escape(sha)}</p>
  <h2>Apps</h2>
  <p class="hint">Tap Open to try an app in the browser. What you enter stays in this browser, and purchases are switched off.</p>
  <ul>{''.join(app_cards)}
  </ul>
  <h2>Games</h2>
  <p class="hint">Tap Play, then turn your phone sideways.</p>
  <ul>{''.join(cards)}
  </ul>
  <footer>
    <p>For a full-screen version on iPhone: open an app or a game in Safari, tap Share, then Add to Home Screen. Everything saves in the browser. These are test builds, so ads and purchases are fake.</p>
    <p>Games: <a href="support/">Support</a> · <a href="privacy/">Privacy policy</a></p>
    <p>Apps: <a href="apps/support/">Support</a> · <a href="apps/privacy/">Privacy policy</a></p>
  </footer>
</main>
</body>
</html>
"""
    with open(os.path.join(site_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)


if __name__ == "__main__":
    main()
