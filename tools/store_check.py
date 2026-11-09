#!/usr/bin/env python3
"""Checks every store/<slug>/listing.json against Apple's limits and the studio's rules.

Usage: python3 tools/store_check.py

Limits (Apple, product page and search pages): name 30 characters, subtitle 30,
keywords 100 (comma-separated, no spaces after commas, no word that is already
in the name or subtitle), promotional text 170, description 4000.
Studio rules (STUDIO.md): no emoji, the word "arson" nowhere, no exclamation
marks, product ids unique across games, prices ending in .99.
"""
import glob
import json
import os
import re
import sys

LIMITS = {"name": 30, "subtitle": 30, "keywords": 100, "promotional_text": 170, "description": 4000}


def words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    problems = []
    seen_ids = {}
    seen_names = {}
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
        if re.search(r"[\U0001F000-\U0001FAFF☀-➿]", text_all):
            bad("emoji in store text")
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

    if problems:
        print("\nStore listing problems:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print(f"Store listings OK ({len(paths)} games).")


if __name__ == "__main__":
    main()
