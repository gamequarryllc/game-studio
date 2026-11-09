#!/usr/bin/env python3
"""Builds the play-links page (index.html) and status.json for the studio site.

Usage: python3 tools/build_site.py <site_dir> <results.txt>

Reads queue.json for the games and their status, and results.txt
("<slug> ok" / "<slug> failed", one per line) for which builds made it.
"""
import datetime
import html
import json
import os
import sys

STATUS_LABEL = {
    "queued": "Queued",
    "building": "Being built",
    "first-playable": "First playable",
    "polishing": "Polishing",
    "ready-to-play": "Ready to play",
    "shipped": "On the App Store",
    "parked": "Parked",
}


def main():
    site_dir, results_path = sys.argv[1], sys.argv[2]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "queue.json"), encoding="utf-8") as f:
        games = json.load(f)["games"]

    results = {}
    if os.path.exists(results_path):
        with open(results_path, encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2:
                    results[parts[0]] = parts[1]

    now = datetime.datetime.now(datetime.timezone.utc)
    sha = os.environ.get("GITHUB_SHA", "local")[:7]

    status = {
        "built_at": now.isoformat(timespec="seconds"),
        "commit": sha,
        "games": {
            g["slug"]: {
                "status": g["status"],
                "build": results.get(g["slug"], "none"),
                "playable": results.get(g["slug"]) == "ok",
            }
            for g in games
        },
    }
    os.makedirs(site_dir, exist_ok=True)
    with open(os.path.join(site_dir, "status.json"), "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2)

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
          <h2>{html.escape(g['title'])}</h2>
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
  .top {{ display: flex; gap: 8px; align-items: center; font-size: 12px; }}
  .num {{ color: #8f8474; }}
  .pill {{ padding: 2px 8px; border-radius: 99px; background: #332b22; color: #cfc3b2; font-weight: 600; }}
  .s-building {{ background: #3b2f12; color: #f0c860; }}
  .s-first-playable, .s-polishing {{ background: #13324a; color: #8fd0ff; }}
  .s-ready-to-play, .s-shipped {{ background: #163a22; color: #8ee0a6; }}
  h2 {{ margin: 4px 0 2px; font-size: 19px; }}
  .body p {{ margin: 0; color: #cfc3b2; font-size: 14.5px; }}
  .body .note {{ margin-top: 6px; color: #8f8474; font-size: 13px; }}
  .act {{ grid-column: 2; margin-top: 8px; }}
  .play {{ display: inline-block; padding: 9px 22px; border-radius: 10px; background: var(--c); color: #16130f; font-weight: 700; text-decoration: none; }}
  .soon {{ font-size: 13px; color: #8f8474; }}
  .broke {{ color: #f08a6a; }}
  footer {{ margin-top: 26px; font-size: 13px; color: #8f8474; }}
</style>
</head>
<body>
<main>
  <header>
    <h1>Game Studio</h1>
    <p>Games Claude is building for Game Quarry. Tap Play, then turn your phone sideways.</p>
  </header>
  <p class="meta">{playable} of {len(games)} playable · updated {now.strftime('%b %d, %H:%M UTC')} · build {html.escape(sha)}</p>
  <ul>{''.join(cards)}
  </ul>
  <footer>For a full-screen version on iPhone: open a game in Safari, tap Share, then Add to Home Screen. Progress saves in the browser. These are playtest builds, so ads and purchases are fake.</footer>
</main>
</body>
</html>
"""
    with open(os.path.join(site_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)


if __name__ == "__main__":
    main()
