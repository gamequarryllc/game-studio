#!/usr/bin/env python3
"""Checks every store/<slug>/listing.json against Apple's limits and the studio's rules.

Usage: python3 tools/store_check.py

Limits (Apple, product page and search pages): name 30 characters, subtitle 30,
keywords 100 (comma-separated, no spaces after commas, no word that is already
in the name or subtitle), promotional text 170, description 4000.
Studio rules (STUDIO.md): no emoji, the word "arson" nowhere, no exclamation
marks, product ids unique across games, prices ending in .99.

It also checks the links every listing needs (support and privacy policy, both
on the studio site), each game's section of the support page, and that the two
pages build with and without a contact address (tools/site_pages.py).
"""
import glob
import json
import os
import re
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import site_pages  # noqa: E402

LIMITS = {"name": 30, "subtitle": 30, "keywords": 100, "promotional_text": 170, "description": 4000}
EMOJI_RX = re.compile(r"[\U0001F000-\U0001FAFF\u2600-\u27BF]")
SUPPORT_KEYS = ("restore", "ad_choices", "sound")


def check_support(slug, d, root, bad):
    """The links and the game's section of the support page."""
    if d.get("support_url") != site_pages.SUPPORT_URL:
        bad(f"support_url must be {site_pages.SUPPORT_URL}")
    if d.get("privacy_url") != site_pages.PRIVACY_URL:
        bad(f"privacy_url must be {site_pages.PRIVACY_URL}")
    support = d.get("support")
    real = False
    ios_path = os.path.join(root, "store", slug, "ios.json")
    if os.path.exists(ios_path):
        with open(ios_path, encoding="utf-8") as f:
            real = bool(json.load(f).get("real_monetization"))
    if support is None:
        if real:
            bad('has real ads and purchases, so it needs a "support" block (where Restore purchases and the ad privacy choices are)')
        return
    answers = [support.get(k, "") for k in SUPPORT_KEYS]
    for extra in support.get("more", []):
        if not extra.get("q") or not extra.get("a"):
            bad('support.more entries need "q" and "a"')
        answers += [extra.get("q", ""), extra.get("a", "")]
    if not support.get("restore"):
        bad("support.restore is missing (Apple requires Restore purchases; say where it is)")
    if real and not support.get("ad_choices"):
        bad("support.ad_choices is missing (players in Europe must be able to find their ad choices)")
    text = " ".join(answers)
    if "!" in text:
        bad("exclamation mark in the support answers")
    if EMOJI_RX.search(text):
        bad("emoji in the support answers")
    if re.search(r"arson", text, re.I):
        bad('the word "arson" must not appear')
    unknown = sorted(k for k in support if k not in SUPPORT_KEYS + ("more", "_about"))
    if unknown:
        bad(f"support has unknown keys: {', '.join(unknown)}")


def check_site_pages(root, listings, problems):
    """Builds the privacy and support pages both ways and reads them back."""
    def bad(msg):
        problems.append(f"site pages: {msg}")

    address = "help@example.com"
    for label, env in (("no contact address", {}), ("with a contact address", {"SUPPORT_EMAIL": address})):
        with tempfile.TemporaryDirectory() as out:
            try:
                info = site_pages.render(out, root, env, quiet=True)
            except SystemExit as e:
                bad(f"{label}: {e}")
                continue
            pages = {}
            for key in ("privacy", "support"):
                path = os.path.join(out, key, "index.html")
                if not os.path.exists(path):
                    bad(f"{label}: {key}/index.html was not written")
                    continue
                with open(path, encoding="utf-8") as f:
                    pages[key] = f.read()
                if "{{" in pages[key] or "}}" in pages[key].split("</style>", 1)[-1]:
                    bad(f"{label}: {key} page has an unfilled placeholder")
                want = "mailto:" + address if env else site_pages.ISSUES_URL
                if want not in pages[key]:
                    bad(f"{label}: {key} page has no way to contact the studio")
                if not env and "mailto:" in pages[key]:
                    bad(f"{label}: {key} page has an address nobody gave it")
            for slug, d in listings.items():
                if "privacy" in pages and d.get("name", "") not in pages["privacy"]:
                    bad(f"{label}: the privacy policy does not name {d.get('name')}")
                if d.get("support") and "support" in pages and f'id="{slug}"' not in pages["support"]:
                    bad(f"{label}: the support page has no section for {slug}")
            if info["contact"] != ("email" if env else "issue page"):
                bad(f"{label}: contact reported as {info['contact']}")
    print("Site pages: privacy and support build with and without a contact address")


def words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    problems = []
    seen_ids = {}
    seen_names = {}
    listings = {}
    paths = sorted(glob.glob(os.path.join(root, "store", "*", "listing.json")))
    for path in paths:
        slug = os.path.basename(os.path.dirname(path))
        with open(path, encoding="utf-8") as f:
            d = json.load(f)

        def bad(msg):
            problems.append(f"{slug}: {msg}")

        if not os.path.exists(os.path.join(root, "games", slug, "project.godot")):
            bad("no game folder with this name")
        if d.get("bundle_id") != "com.gamequarry." + slug.replace("-", ""):
            bad(f"bundle id {d.get('bundle_id')} does not follow com.gamequarry.<slug without dashes>")
        for key, limit in LIMITS.items():
            text = d.get(key, "")
            if not text:
                bad(f"{key} is missing")
            elif len(text) > limit:
                bad(f"{key} is {len(text)} characters (limit {limit})")
        text_all = " ".join(str(d.get(k, "")) for k in LIMITS)
        if re.search(r"arson", text_all, re.I):
            bad('the word "arson" must not appear')
        if "!" in text_all:
            bad("exclamation mark in store text")
        if EMOJI_RX.search(text_all):
            bad("emoji in store text")
        check_support(slug, d, root, bad)
        listings[slug] = d
        kw = d.get("keywords", "")
        if ", " in kw or kw != kw.strip():
            bad("keywords must be comma-separated with no spaces")
        kws = [k for k in kw.split(",") if k]
        if len(kws) != len(set(kws)):
            bad("a keyword is repeated")
        taken = words(d.get("name", "")) | words(d.get("subtitle", ""))
        dup = sorted(k for k in kws if k.lower() in taken)
        if dup:
            bad(f"keywords repeat words from the name or subtitle: {', '.join(dup)}")
        name = d.get("name", "").lower()
        if name in seen_names:
            bad(f"same name as {seen_names[name]}")
        seen_names[name] = slug
        for p in d.get("products", []):
            pid = f"{d.get('bundle_id')}.{p['key']}"
            if pid in seen_ids:
                bad(f"product id {pid} is also used by {seen_ids[pid]}")
            seen_ids[pid] = slug
            if p.get("type") not in ("consumable", "non-consumable"):
                bad(f"product {p['key']}: type must be consumable or non-consumable")
            if round(p.get("price_usd", 0) * 100) % 100 != 99:
                bad(f"product {p['key']}: price {p.get('price_usd')} should end in .99")
        print(f"{slug}: name {len(d.get('name',''))}/30, subtitle {len(d.get('subtitle',''))}/30, "
              f"keywords {len(kw)}/100, promo {len(d.get('promotional_text',''))}/170, "
              f"description {len(d.get('description',''))}/4000, {len(d.get('products', []))} products")

    check_site_pages(root, listings, problems)

    if problems:
        print("\nStore listing problems:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print(f"Store listings OK ({len(paths)} games).")


if __name__ == "__main__":
    main()
