#!/usr/bin/env python3
"""Player-facing pages on the studio site: the privacy policy and the support page.

Apple asks every App Store listing for a privacy policy link and a support
link. Both live on the play-links site, one page each for all the studio's
games:

  <site>/privacy/   from site/privacy.html
  <site>/support/   from site/support.html, plus one section per game whose
                    store/<slug>/listing.json has a "support" block
  <site>/app-ads.txt  from site/app-ads.txt, only once it holds a real line

tools/build_site.py calls render() on every site build. To look at the pages
on their own:

  python3 tools/site_pages.py <out_dir>

The contact address is never written in this repo (it is public, but STUDIO.md
keeps every email address out of it). The site build reads it from the
SUPPORT_EMAIL environment variable, which the web workflow fills from the
repository variable of the same name. Without it the pages point at the
studio's public issue page instead, and the build says so.
"""
import glob
import html
import json
import os
import re
import sys

SITE_URL = "https://gamequarryllc.github.io/game-studio/"
PRIVACY_URL = SITE_URL + "privacy/"
SUPPORT_URL = SITE_URL + "support/"
ISSUES_URL = "https://github.com/gamequarryllc/game-studio/issues"
# Top-level folders of the site that a game's folder name must never take.
RESERVED_SLUGS = ("privacy", "support", "apps")

EMAIL_RX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
META_RX = re.compile(r"\A<!--\s*title:\s*(?P<title>.*?)\s*\|\s*updated:\s*(?P<updated>.*?)\s*-->")
COMMENT_RX = re.compile(r"<!--.*?-->", re.S)
TOKEN_RX = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")
# app-ads.txt, IAB format: domain, publisher id, DIRECT or RESELLER, optional certification id.
ADS_LINE_RX = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}\s*,\s*[A-Za-z0-9_-]+\s*,\s*(DIRECT|RESELLER)(\s*,\s*[A-Za-z0-9]+)?\s*$", re.I)
PLACEHOLDER_PUB = "pub-0000000000000000"

CSS = """
  :root { --paper: #f7f2e8; --ink: #211b14; --soft: #6b5f50; --rule: #d9cdb8; --accent: #a8431a; --card: #fffaf0; }
  @media (prefers-color-scheme: dark) {
    :root { --paper: #16130f; --ink: #f3ece2; --soft: #b8ab98; --rule: #3a3127; --accent: #f0a05c; --card: #1f1a14; }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 700px; margin: 0 auto; padding: max(28px, env(safe-area-inset-top)) 20px 72px; }
  .mast { display: flex; align-items: center; gap: 11px; margin: 0 0 40px; font-size: 15px; }
  .mast svg { flex: none; }
  .mast b { font-weight: 650; letter-spacing: 0.01em; }
  .mast nav { margin-left: auto; display: flex; gap: 18px; }
  .mast a { color: var(--soft); text-decoration: none; }
  .mast a[aria-current] { color: var(--ink); border-bottom: 2px solid var(--accent); }
  h1, h2, h3 { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; font-weight: 600; line-height: 1.2; }
  h1 { font-size: 38px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .meta { margin: 0 0 28px; color: var(--soft); font-size: 15px; }
  .lede { font-size: 19px; line-height: 1.55; }
  h2 { font-size: 24px; margin: 44px 0 10px; padding-top: 18px; border-top: 1px solid var(--rule); }
  h3 { font-size: 19px; margin: 26px 0 6px; }
  p { margin: 0 0 14px; }
  ul { margin: 0 0 14px; padding-left: 22px; }
  li { margin: 0 0 8px; }
  a { color: var(--accent); text-underline-offset: 2px; }
  em { font-style: normal; font-weight: 600; }
  .faq { margin: 0; }
  .faq dt { font-weight: 650; margin: 18px 0 3px; }
  .faq dd { margin: 0; }
  .game { margin: 14px 0 0; padding: 4px 20px 18px; background: var(--card); border: 1px solid var(--rule); border-left: 4px solid var(--c, var(--accent)); border-radius: 3px 10px 10px 3px; }
  .game h3 { margin-top: 16px; }
  .game .faq dt:first-child { margin-top: 10px; }
  footer { margin-top: 52px; padding-top: 16px; border-top: 1px solid var(--rule); color: var(--soft); font-size: 14px; }
"""

# The studio's mark: three quarried blocks, stepped like a cut rock face.
MARK = ('<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">'
        '<path d="M2 23.5h22v-6.2h-7.3v-5.6h-6.9V6.2H2z" fill="none" stroke="currentColor" '
        'stroke-width="2" stroke-linejoin="round"/>'
        '<path d="M2 17.3h14.7M9.8 11.7H2" fill="none" stroke="currentColor" stroke-width="2"/></svg>')


def repo_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_listings(root):
    """Every store listing, in queue order (then any others, by folder name)."""
    order = []
    try:
        with open(os.path.join(root, "queue.json"), encoding="utf-8") as f:
            queue = json.load(f)["games"]
        order = [g["slug"] for g in queue]
        colors = {g["slug"]: g.get("color", "") for g in queue}
    except (OSError, KeyError, ValueError):
        colors = {}
    found = {}
    for path in glob.glob(os.path.join(root, "store", "*", "listing.json")):
        slug = os.path.basename(os.path.dirname(path))
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        found[slug] = {"slug": slug, "name": d.get("name", slug), "support": d.get("support"),
                       "color": colors.get(slug, "")}
    slugs = [s for s in order if s in found] + sorted(s for s in found if s not in order)
    return [found[s] for s in slugs]


def sentence_list(items):
    items = list(items)
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def contact(env):
    """The contact line: the studio's address when the build was given one, else the issue page."""
    raw = (env.get("SUPPORT_EMAIL") or "").strip()
    if raw and EMAIL_RX.fullmatch(raw):
        addr = html.escape(raw)
        link = f'<a href="mailto:{addr}">{addr}</a>'
        return {"kind": "email", "short": link + ".",
                "long": f"Email {link}. Tell us which game it is, what device you have and what happened, "
                        "and we'll get back to you."}
    link = f'<a href="{ISSUES_URL}">the studio\'s issue page</a>'
    return {"kind": "issue page", "bad_value": bool(raw), "short": f"write to us on {link}.",
            "long": f"Write to us on {link} (it needs a free GitHub account). Tell us which game it is, "
                    "what device you have and what happened, and we'll get back to you."}


def game_sections(listings):
    out = []
    for g in listings:
        s = g.get("support")
        if not s:
            continue
        rows = []
        if s.get("restore"):
            rows.append(("Where is Restore purchases?", s["restore"]))
        if s.get("ad_choices"):
            rows.append(("Where are the ad privacy choices?", s["ad_choices"]))
        if s.get("sound"):
            rows.append(("How do I turn the sound down or off?", s["sound"]))
        for extra in s.get("more", []):
            rows.append((extra["q"], extra["a"]))
        faq = "".join(f"\n    <dt>{html.escape(q)}</dt>\n    <dd>{html.escape(a)}</dd>" for q, a in rows)
        style = f' style="--c:{html.escape(g["color"])}"' if re.fullmatch(r"#[0-9a-fA-F]{3,8}", g.get("color") or "") else ""
        out.append(f'<section class="game" id="{html.escape(g["slug"])}"{style}>\n'
                   f'  <h3>{html.escape(g["name"])}</h3>\n  <dl class="faq">{faq}\n  </dl>\n</section>')
    if not out:
        return ""
    return "<h2>Game by game</h2>\n" + "\n".join(out)


def read_template(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = META_RX.match(text)
    if not m:
        raise SystemExit(f"{path}: the first line must be <!-- title: ... | updated: ... -->")
    return m.group("title"), m.group("updated"), COMMENT_RX.sub("", text).strip()


def fill(body, values, path):
    def sub(m):
        if m.group(1) not in values:
            raise SystemExit(f"{path}: unknown placeholder {{{{{m.group(1)}}}}}")
        return values[m.group(1)]
    return TOKEN_RX.sub(sub, body)


def frame(title, updated, body, here):
    def nav(key, label):
        cur = ' aria-current="page"' if key == here else ""
        return f'<a href="../{key}/"{cur}>{label}</a>'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)} · Game Quarry</title>
<style>{CSS}</style>
</head>
<body>
<main>
  <div class="mast">{MARK}<b>Game Quarry</b><nav>{nav("support", "Support")}{nav("privacy", "Privacy")}</nav></div>
  <h1>{html.escape(title)}</h1>
  <p class="meta">Game Quarry's games · last updated {html.escape(updated)}</p>
{body}
  <footer>Game Quarry makes small games about taking big things apart.</footer>
</main>
</body>
</html>
"""


def ads_txt_lines(path):
    """The real lines of site/app-ads.txt (comments, blanks and the sample id don't count)."""
    lines, bad = [], []
    if not os.path.exists(path):
        return lines, bad
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            text = line.split("#", 1)[0].strip()
            if not text:
                continue
            if not ADS_LINE_RX.match(text) or PLACEHOLDER_PUB in text:
                bad.append(f"line {n}: {text}")
            else:
                lines.append(text)
    return lines, bad


def render(site_dir, root=None, env=None, quiet=False):
    """Writes the pages into site_dir and returns a summary for status.json."""
    root = root or repo_root()
    env = os.environ if env is None else env
    src = os.path.join(root, "site")
    listings = load_listings(root)
    for g in listings:
        if g["slug"] in RESERVED_SLUGS:
            raise SystemExit(f"A game can't be called '{g['slug']}': the site uses that folder.")
    who = contact(env)
    names = [html.escape(g["name"]) for g in listings]
    values = {
        "games_sentence": sentence_list(names) if names else "its games",
        "contact": who["short"],
        "contact_long": who["long"],
        "game_sections": game_sections(listings),
    }
    for key in ("privacy", "support"):
        path = os.path.join(src, key + ".html")
        title, updated, body = read_template(path)
        page = frame(title, updated, fill(body, values, path), key)
        os.makedirs(os.path.join(site_dir, key), exist_ok=True)
        with open(os.path.join(site_dir, key, "index.html"), "w", encoding="utf-8") as f:
            f.write(page)

    ads_lines, ads_bad = ads_txt_lines(os.path.join(src, "app-ads.txt"))
    if ads_bad:
        raise SystemExit("site/app-ads.txt has a line that is not a valid app-ads.txt entry: " + "; ".join(ads_bad))
    if ads_lines:
        with open(os.path.join(site_dir, "app-ads.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(ads_lines) + "\n")

    if who["kind"] != "email" and not quiet:
        why = "is not an email address" if who.get("bad_value") else "is not set"
        # Shows as a warning on the Actions run; harmless when run by hand.
        print(f"::warning title=Support contact::SUPPORT_EMAIL {why}, so the privacy and support pages "
              "point at the issue page. Add the repository variable before a game goes to App Review "
              "(store/README.md).")
    return {
        "privacy": "privacy/",
        "support": "support/",
        "contact": who["kind"],
        "support_sections": [g["slug"] for g in listings if g.get("support")],
        "app_ads_txt": bool(ads_lines),
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(json.dumps(render(sys.argv[1]), indent=2))
