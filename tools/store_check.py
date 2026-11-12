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

A listing with "kind": "app" belongs to an app in apps/<slug>/ (STUDIO.md,
"Apps"). Apps have their own rules: no ads, exactly one product (the lifetime
Pro unlock, a non-consumable priced from 2.99 to 9.99), their own privacy and
support pages, and ids that match what the app itself ships with.
"""
import glob
import html
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
APP_SUPPORT_KEYS = ("restore", "backup")


def check_app(slug, d, root, bad):
    """The rules for an app's listing, and that the listing and the app agree."""
    if d.get("support_url") != site_pages.APPS_SUPPORT_URL + "#" + slug:
        bad(f"support_url must be {site_pages.APPS_SUPPORT_URL}#{slug}")
    if d.get("privacy_url") != site_pages.APPS_PRIVACY_URL:
        bad(f"privacy_url must be {site_pages.APPS_PRIVACY_URL}")
    if d.get("age_rating", {}).get("advertising") is not False:
        bad("apps carry no ads: age_rating.advertising must be false")
    if d.get("age_rating", {}).get("kids_category") is not False:
        bad("apps stay out of the Kids category: age_rating.kids_category must be false")
    if "privacy_label" not in d:
        bad("privacy_label is missing (the draft answers for App Privacy)")

    products = d.get("products", [])
    bundle = d.get("bundle_id", "")
    entitlement = slug.replace("-", "_") + "_pro"
    price = None
    if len(products) != 1:
        bad(f"an app sells exactly one thing, the lifetime Pro unlock ({len(products)} products listed)")
    else:
        p = products[0]
        price = p.get("price_usd", 0)
        if p.get("key") != "pro" or p.get("type") != "non-consumable":
            bad('the product must be {"key": "pro", "type": "non-consumable"}')
        if not 2.99 <= price <= 9.99:
            bad(f"Pro costs {price}; the studio's range is 2.99 to 9.99")
        if p.get("product_id") != bundle + ".pro":
            bad(f"product_id must be {bundle}.pro")
        # An app that buys straight from the App Store (StoreKit) has no entitlement to name;
        # one that goes through RevenueCat must name it, and the app must use the same one.
        if "revenuecat_entitlement" in p and p.get("revenuecat_entitlement") != entitlement:
            bad(f"revenuecat_entitlement must be {entitlement}")

    support = d.get("support") or {}
    for key in APP_SUPPORT_KEYS:
        if not support.get(key):
            bad(f"support.{key} is missing (say where it is in the app)")
    answers = [support.get(k, "") for k in APP_SUPPORT_KEYS]
    for extra in support.get("more", []):
        if not extra.get("q") or not extra.get("a"):
            bad('support.more entries need "q" and "a"')
        answers += [extra.get("q", ""), extra.get("a", "")]
    text = " ".join(answers)
    if "!" in text:
        bad("exclamation mark in the support answers")
    if EMOJI_RX.search(text):
        bad("emoji in the support answers")
    unknown = sorted(k for k in support if k not in APP_SUPPORT_KEYS + ("more", "_about"))
    if unknown:
        bad(f"support has unknown keys: {', '.join(unknown)}")

    # The listing and the app must name the same bundle id, product, entitlement and price.
    app_dir = os.path.join(root, "apps", slug)
    try:
        with open(os.path.join(app_dir, "app.json"), encoding="utf-8") as f:
            ios = json.load(f)["expo"].get("ios", {})
        if ios.get("bundleIdentifier") != bundle:
            bad(f"app.json has bundle id {ios.get('bundleIdentifier')}, the listing has {bundle}")
    except (OSError, KeyError, ValueError) as e:
        bad(f"apps/{slug}/app.json could not be read ({e})")
    config = os.path.join(app_dir, "src", "pro", "config.ts")
    if not os.path.exists(config):
        bad(f"apps/{slug}/src/pro/config.ts is missing (the product id and entitlement the app ships with)")
    else:
        with open(config, encoding="utf-8") as f:
            code = f.read()
        if f"'{bundle}.pro'" not in code:
            bad(f"src/pro/config.ts does not use the product id {bundle}.pro")
        uses_revenuecat = "REVENUECAT" in code
        listed = len(products) == 1 and "revenuecat_entitlement" in products[0]
        if uses_revenuecat != listed:
            bad("the listing and src/pro/config.ts disagree on whether Pro goes through RevenueCat "
                "(the product's revenuecat_entitlement is there for one that does, absent for one that buys straight from the App Store)")
        if uses_revenuecat and f"'{entitlement}'" not in code:
            bad(f"src/pro/config.ts does not use the entitlement {entitlement}")
        if price is not None and f"'${price:.2f}'" not in code:
            bad(f"src/pro/config.ts does not show the listing's price ${price:.2f}")


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


def check_site_pages(root, listings, problems, apps=None):
    """Builds the privacy and support pages both ways and reads them back."""
    apps = apps or {}
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
            # The apps' own two pages.
            app_pages = {}
            for key in ("privacy", "support"):
                path = os.path.join(out, "apps", key, "index.html")
                if not os.path.exists(path):
                    bad(f"{label}: apps/{key}/index.html was not written")
                    continue
                with open(path, encoding="utf-8") as f:
                    app_pages[key] = f.read()
                if "{{" in app_pages[key] or "}}" in app_pages[key].split("</style>", 1)[-1]:
                    bad(f"{label}: apps/{key} page has an unfilled placeholder")
                want = "mailto:" + address if env else site_pages.ISSUES_URL
                if want not in app_pages[key]:
                    bad(f"{label}: apps/{key} page has no way to contact the studio")
                if not env and "mailto:" in app_pages[key]:
                    bad(f"{label}: apps/{key} page has an address nobody gave it")
            for slug, d in apps.items():
                # The page writes names HTML-escaped ("Home &amp; Car").
                if "privacy" in app_pages and html.escape(d.get("name", "")) not in app_pages["privacy"]:
                    bad(f"{label}: the apps' privacy policy does not name {d.get('name')}")
                if "support" in app_pages and f'id="{slug}"' not in app_pages["support"]:
                    bad(f"{label}: the apps' support page has no section for {slug}")
            for slug, d in listings.items():
                if "privacy" in app_pages and d.get("name", "") in app_pages["privacy"]:
                    bad(f"{label}: the apps' privacy policy names a game ({d.get('name')})")
    print("Site pages: privacy and support build with and without a contact address, for the games and for the apps")


def words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    problems = []
    seen_ids = {}
    seen_names = {}
    listings = {}
    app_listings = {}
    paths = sorted(glob.glob(os.path.join(root, "store", "*", "listing.json")))
    for path in paths:
        slug = os.path.basename(os.path.dirname(path))
        with open(path, encoding="utf-8") as f:
            d = json.load(f)

        def bad(msg):
            problems.append(f"{slug}: {msg}")

        is_app = d.get("kind") == "app"
        if is_app:
            if not os.path.exists(os.path.join(root, "apps", slug, "package.json")):
                bad("no app folder with this name")
        elif not os.path.exists(os.path.join(root, "games", slug, "project.godot")):
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
        if is_app:
            check_app(slug, d, root, bad)
            app_listings[slug] = d
        else:
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

    check_site_pages(root, listings, problems, app_listings)

    if problems:
        print("\nStore listing problems:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print(f"Store listings OK ({len(listings)} games, {len(app_listings)} apps).")


if __name__ == "__main__":
    main()
