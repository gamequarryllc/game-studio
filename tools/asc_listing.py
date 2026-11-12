#!/usr/bin/env python3
"""Fills in an app's App Store Connect record from store/<slug>/listing.json.

  python3 tools/asc_listing.py <slug> plan            read-only: prints what is there now
  python3 tools/asc_listing.py <slug> apply [build]   writes the listing; attaches build number <build> if given

It uses the App Store Connect API with the same key the builds sign with
(ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 in the environment; the "Store listing"
workflow passes the repository secrets). It never prints the key or a token.

What it writes, each only when it differs from what is there:
  - the one in-app purchase: the product, its name and description, its price, where it is
    sold, and the screenshot App Review asks for
  - the app's name, subtitle, privacy policy link and categories
  - the version being prepared: description, keywords, promotional text, support link,
    copyright, the screenshots, the notes for App Review, and (if asked) the build
  - the app's price (free) and where it is sold

What it never does: submit anything for review, answer the App Privacy questions (Apple
has no API for them), or enter the contact person for App Review (personal details do not
belong in a public repository; the owner types them in App Store Connect).

Every section runs by itself: one that fails is reported at the end and the rest still run.
"""

import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.appstoreconnect.apple.com"

# The EU's member states. An account that has not declared its trader status under the
# Digital Services Act cannot sell there; the listing says whether to leave them out.
EU = ("AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE").split()

AGE_ENUMS = (
    "alcoholTobaccoOrDrugUseOrReferences contests gamblingSimulated gunsOrOtherWeapons horrorOrFearThemes "
    "matureOrSuggestiveThemes medicalOrTreatmentInformation profanityOrCrudeHumor sexualContentGraphicAndNudity "
    "sexualContentOrNudity violenceCartoonOrFantasy violenceRealistic violenceRealisticProlongedGraphicOrSadistic"
).split()
AGE_FLAGS = (
    "gambling unrestrictedWebAccess lootBox advertising healthOrWellnessTopics messagingAndChat parentalControls "
    "ageAssurance userGeneratedContent"
).split()


class ApiError(Exception):
    def __init__(self, status, method, path, body):
        self.status = status
        detail = body
        try:
            errors = json.loads(body).get("errors", [])
            detail = "; ".join(f"{e.get('code')}: {e.get('detail') or e.get('title')}" for e in errors) or body
        except ValueError:
            pass
        super().__init__(f"{method} {path} -> {status}: {detail[:1500]}")


def read_key():
    raw = os.environ.get("ASC_KEY_P8", "")
    if "BEGIN PRIVATE KEY" not in raw:
        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except Exception:
            raw = ""
    if "BEGIN PRIVATE KEY" not in raw:
        raise SystemExit("ASC_KEY_P8 is neither the .p8 text nor base64 of it")
    return raw


class Client:
    def __init__(self):
        for name in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"):
            if not os.environ.get(name):
                raise SystemExit(f"{name} is not set")
        self.key = read_key()
        self.token = None
        self.token_until = 0

    def bearer(self):
        import jwt  # PyJWT, with cryptography for ES256

        now = int(time.time())
        if not self.token or now > self.token_until - 60:
            self.token_until = now + 15 * 60
            self.token = jwt.encode(
                {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": self.token_until, "aud": "appstoreconnect-v1"},
                self.key,
                algorithm="ES256",
                headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"},
            )
        return self.token

    def call(self, method, path, body=None, params=None):
        url = path if path.startswith("http") else API + path
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Bearer " + self.bearer())
        if data is not None:
            req.add_header("Content-Type", "application/json")
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    text = res.read().decode("utf-8")
                    return json.loads(text) if text else {}
            except urllib.error.HTTPError as e:
                text = e.read().decode("utf-8", "replace")
                if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                    time.sleep(3 * (attempt + 1))
                    continue
                raise ApiError(e.code, method, path, text) from None
        raise RuntimeError("unreachable")

    def get(self, path, **params):
        return self.call("GET", path, params=params or None)

    def get_or_none(self, path, **params):
        try:
            return self.get(path, **params)
        except ApiError as e:
            if e.status == 404:
                return None
            raise

    def all(self, path, **params):
        """Every page of a list."""
        out = []
        res = self.get(path, **params)
        while True:
            out += res.get("data", [])
            nxt = res.get("links", {}).get("next")
            if not nxt:
                return out
            res = self.call("GET", nxt)


def upload(client, reservation, blob):
    """Sends a file to the addresses App Store Connect handed out for it."""
    for op in reservation["attributes"]["uploadOperations"]:
        req = urllib.request.Request(op["url"], data=blob[op["offset"] : op["offset"] + op["length"]], method=op["method"])
        for h in op.get("requestHeaders", []):
            req.add_header(h["name"], h["value"])
        with urllib.request.urlopen(req, timeout=120) as res:
            res.read()


def rel(kind, ident):
    return {"data": {"type": kind, "id": ident}}


class Run:
    def __init__(self, slug, mode, build):
        self.root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
        self.dir = os.path.join(self.root, "store", slug)
        with open(os.path.join(self.dir, "listing.json"), encoding="utf-8") as f:
            self.listing = json.load(f)
        self.apply = mode == "apply"
        self.build = build
        self.c = Client()
        self.failed = []
        self.todo = []

    def say(self, text):
        print("  " + text)

    def change(self, what, fn):
        """Makes one change in apply mode; in plan mode says what would change."""
        if self.apply:
            result = fn()
            self.say("set: " + what)
            return result
        self.say("would set: " + what)
        self.todo.append(what)
        return None

    def section(self, title, fn):
        print(f"\n== {title}")
        try:
            fn()
        except (ApiError, KeyError, IndexError, ValueError, OSError, urllib.error.URLError) as e:
            self.failed.append(f"{title}: {e}")
            print(f"  FAILED: {e}")

    # ---- the app

    def find_app(self):
        apps = self.c.get("/v1/apps", **{"filter[bundleId]": self.listing["bundle_id"]})["data"]
        app = next(a for a in apps if a["attributes"]["bundleId"] == self.listing["bundle_id"])
        self.app = app["id"]
        a = app["attributes"]
        self.say(f"{a['name']} ({a['bundleId']}), Apple id {self.app}, content rights: {a.get('contentRightsDeclaration')}")
        if a.get("contentRightsDeclaration") != "DOES_NOT_USE_THIRD_PARTY_CONTENT":
            self.change(
                "content rights: no third-party content",
                lambda: self.c.call("PATCH", f"/v1/apps/{self.app}", {"data": {"type": "apps", "id": self.app, "attributes": {"contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT"}}}),
            )

    # ---- the in-app purchase

    def purchase(self):
        p = self.listing["products"][0]
        found = [i for i in self.c.all(f"/v1/apps/{self.app}/inAppPurchasesV2", limit=50) if i["attributes"]["productId"] == p["product_id"]]
        if found:
            iap = found[0]
            self.say(f"product {p['product_id']} exists: {iap['attributes']['name']}, state {iap['attributes'].get('state')}")
        else:
            body = {
                "data": {
                    "type": "inAppPurchases",
                    "attributes": {"name": p["display_name"], "productId": p["product_id"], "inAppPurchaseType": "NON_CONSUMABLE", "reviewNote": p.get("review_note", ""), "familySharable": False},
                    "relationships": {"app": rel("apps", self.app)},
                }
            }
            made = self.change(f"new non-consumable {p['product_id']}", lambda: self.c.call("POST", "/v2/inAppPurchases", body))
            if not made:
                return
            iap = made["data"]
        ident = iap["id"]

        # Its name and description, as the purchase sheet shows them.
        locs = self.c.all(f"/v2/inAppPurchases/{ident}/inAppPurchaseLocalizations", limit=50)
        want = {"name": p["display_name"], "description": p["description"]}
        en = next((l for l in locs if l["attributes"]["locale"] == "en-US"), None)
        if en is None:
            self.change(
                f"purchase text: {want['name']} / {want['description']}",
                lambda: self.c.call("POST", "/v1/inAppPurchaseLocalizations", {"data": {"type": "inAppPurchaseLocalizations", "attributes": {"locale": "en-US", **want}, "relationships": {"inAppPurchaseV2": rel("inAppPurchases", ident)}}}),
            )
        elif any(en["attributes"].get(k) != v for k, v in want.items()):
            self.change(
                f"purchase text: {want['name']} / {want['description']}",
                lambda: self.c.call("PATCH", f"/v1/inAppPurchaseLocalizations/{en['id']}", {"data": {"type": "inAppPurchaseLocalizations", "id": en["id"], "attributes": want}}),
            )
        else:
            self.say("purchase text is as listed")

        # Its price, set in US dollars; Apple works out the other countries from it.
        price = f"{p['price_usd']:.2f}"
        schedule = self.c.get_or_none(f"/v2/inAppPurchases/{ident}/iapPriceSchedule", include="manualPrices,baseTerritory")
        has_price = bool(schedule and schedule.get("data", {}).get("relationships", {}).get("manualPrices", {}).get("data"))
        if has_price:
            self.say("a price is set (check the amount in App Store Connect if it was not set by this tool)")
        else:
            points = self.c.all(f"/v2/inAppPurchases/{ident}/pricePoints", **{"filter[territory]": "USA", "limit": 200})
            point = next(pt for pt in points if pt["attributes"]["customerPrice"] in (price, price.rstrip("0").rstrip(".")))
            body = {
                "data": {
                    "type": "inAppPurchasePriceSchedules",
                    "relationships": {
                        "inAppPurchase": rel("inAppPurchases", ident),
                        "baseTerritory": rel("territories", "USA"),
                        "manualPrices": {"data": [{"type": "inAppPurchasePrices", "id": "${price1}"}]},
                    },
                },
                "included": [
                    {
                        "type": "inAppPurchasePrices",
                        "id": "${price1}",
                        "attributes": {"startDate": None},
                        "relationships": {"inAppPurchaseV2": rel("inAppPurchases", ident), "inAppPurchasePricePoint": rel("inAppPurchasePricePoints", point["id"])},
                    }
                ],
            }
            self.change(f"price ${price} (United States; other countries follow)", lambda: self.c.call("POST", "/v1/inAppPurchasePriceSchedules", body))

        # Where it is sold: everywhere the app is.
        avail = self.c.get_or_none(f"/v2/inAppPurchases/{ident}/inAppPurchaseAvailability")
        if avail and avail.get("data"):
            self.say("availability is set")
        else:
            territories = [t["id"] for t in self.c.all("/v1/territories", limit=200)]
            body = {
                "data": {
                    "type": "inAppPurchaseAvailabilities",
                    "attributes": {"availableInNewTerritories": True},
                    "relationships": {"inAppPurchase": rel("inAppPurchases", ident), "availableTerritories": {"data": [{"type": "territories", "id": t} for t in territories]}},
                }
            }
            self.change(f"purchase available in all {len(territories)} countries and regions", lambda: self.c.call("POST", "/v1/inAppPurchaseAvailabilities", body))

        # The screenshot App Review asks for: the screen where it is sold.
        shot = self.c.get_or_none(f"/v2/inAppPurchases/{ident}/appStoreReviewScreenshot")
        path = os.path.join(self.dir, "screenshots", p.get("review_screenshot", "iap-review-pro-screen.png"))
        if shot and shot.get("data"):
            self.say(f"review screenshot is there ({shot['data']['attributes'].get('fileName')})")
        else:
            def send():
                with open(path, "rb") as f:
                    blob = f.read()
                made = self.c.call("POST", "/v1/inAppPurchaseAppStoreReviewScreenshots", {"data": {"type": "inAppPurchaseAppStoreReviewScreenshots", "attributes": {"fileName": os.path.basename(path), "fileSize": len(blob)}, "relationships": {"inAppPurchaseV2": rel("inAppPurchases", ident)}}})["data"]
                upload(self.c, made, blob)
                self.c.call("PATCH", f"/v1/inAppPurchaseAppStoreReviewScreenshots/{made['id']}", {"data": {"type": "inAppPurchaseAppStoreReviewScreenshots", "id": made["id"], "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(blob).hexdigest()}}})

            self.change(f"review screenshot {os.path.basename(path)}", send)

        note = p.get("review_note", "")
        if note and iap["attributes"].get("reviewNote") != note:
            self.change("review note on the purchase", lambda: self.c.call("PATCH", f"/v2/inAppPurchases/{ident}", {"data": {"type": "inAppPurchases", "id": ident, "attributes": {"reviewNote": note}}}))
        state = self.c.get(f"/v2/inAppPurchases/{ident}")["data"]["attributes"].get("state")
        self.say(f"purchase state now: {state}")

    # ---- name, subtitle, categories, age rating

    def app_info(self):
        infos = self.c.get(f"/v1/apps/{self.app}/appInfos")["data"]
        info = next((i for i in infos if (i["attributes"].get("state") or i["attributes"].get("appStoreState")) not in ("READY_FOR_DISTRIBUTION", "READY_FOR_SALE")), infos[0])
        self.info = info["id"]
        self.say(f"app information state: {info['attributes'].get('state') or info['attributes'].get('appStoreState')}, age rating {info['attributes'].get('appStoreAgeRating')}")
        locs = self.c.get(f"/v1/appInfos/{self.info}/appInfoLocalizations")["data"]
        en = next(l for l in locs if l["attributes"]["locale"] == "en-US")
        want = {"name": self.listing["name"], "subtitle": self.listing["subtitle"], "privacyPolicyUrl": self.listing["privacy_url"]}
        diff = {k: v for k, v in want.items() if en["attributes"].get(k) != v}
        if diff:
            self.change("name, subtitle, privacy link: " + ", ".join(diff), lambda: self.c.call("PATCH", f"/v1/appInfoLocalizations/{en['id']}", {"data": {"type": "appInfoLocalizations", "id": en["id"], "attributes": diff}}))
        else:
            self.say("name, subtitle and privacy link are as listed")

        cats = self.c.get(f"/v1/appInfos/{self.info}", include="primaryCategory,secondaryCategory")["data"]["relationships"]
        have = tuple((cats.get(k, {}).get("data") or {}).get("id") for k in ("primaryCategory", "secondaryCategory"))
        want_cats = (self.listing["primary_category"].upper().replace(" ", "_"), self.listing["secondary_category"].upper().replace(" ", "_"))
        if have != want_cats:
            self.change(
                f"categories: {want_cats[0]}, {want_cats[1]}",
                lambda: self.c.call("PATCH", f"/v1/appInfos/{self.info}", {"data": {"type": "appInfos", "id": self.info, "relationships": {"primaryCategory": rel("appCategories", want_cats[0]), "secondaryCategory": rel("appCategories", want_cats[1])}}}),
            )
        else:
            self.say("categories are as listed")

    def age_rating(self):
        decl = self.c.get(f"/v1/appInfos/{self.info}/ageRatingDeclaration")["data"]
        attrs = decl["attributes"]
        unanswered = sorted(k for k, v in attrs.items() if v is None and k not in ("kidsAgeBand", "ageRatingOverride", "ageRatingOverrideV2", "koreaAgeRatingOverride", "developerAgeRatingInfoUrl"))
        self.say("answers so far: " + json.dumps({k: v for k, v in attrs.items() if v is not None}, sort_keys=True))
        if not unanswered:
            self.say("every age-rating question is answered")
            return
        # The app has none of it: no violence, no gambling, no web access, no ads, no chat, nothing made by other users.
        want = {k: ("NONE" if k in AGE_ENUMS else False) for k in unanswered if k in AGE_ENUMS or k in AGE_FLAGS}
        unknown = [k for k in unanswered if k not in want]
        if unknown:
            self.say("questions this tool does not know (answer them in App Store Connect): " + ", ".join(unknown))
        if want:
            self.change("age rating: none of the listed content, " + str(len(want)) + " answers", lambda: self.c.call("PATCH", f"/v1/ageRatingDeclarations/{decl['id']}", {"data": {"type": "ageRatingDeclarations", "id": decl["id"], "attributes": want}}))

    # ---- the version being prepared

    def version(self):
        versions = self.c.get(f"/v1/apps/{self.app}/appStoreVersions", **{"filter[platform]": "IOS", "limit": 20})["data"]
        open_states = ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY")
        ver = next(v for v in versions if (v["attributes"].get("appVersionState") or v["attributes"].get("appStoreState")) in open_states)
        self.ver = ver["id"]
        a = ver["attributes"]
        self.say(f"version {a['versionString']}, state {a.get('appVersionState') or a.get('appStoreState')}, copyright {a.get('copyright')!r}, release {a.get('releaseType')}")
        want = {"versionString": self.listing.get("version", "1.0.0"), "copyright": self.listing["copyright"]}
        diff = {k: v for k, v in want.items() if a.get(k) != v}
        if diff:
            self.change("version: " + ", ".join(f"{k} {v}" for k, v in diff.items()), lambda: self.c.call("PATCH", f"/v1/appStoreVersions/{self.ver}", {"data": {"type": "appStoreVersions", "id": self.ver, "attributes": diff}}))

        locs = self.c.get(f"/v1/appStoreVersions/{self.ver}/appStoreVersionLocalizations")["data"]
        en = next(l for l in locs if l["attributes"]["locale"] == "en-US")
        self.loc = en["id"]
        want = {"description": self.listing["description"], "keywords": self.listing["keywords"], "promotionalText": self.listing["promotional_text"], "supportUrl": self.listing["support_url"]}
        diff = {k: v for k, v in want.items() if (en["attributes"].get(k) or "") != v}
        if diff:
            self.change("listing text: " + ", ".join(diff), lambda: self.c.call("PATCH", f"/v1/appStoreVersionLocalizations/{self.loc}", {"data": {"type": "appStoreVersionLocalizations", "id": self.loc, "attributes": diff}}))
        else:
            self.say("description, keywords, promotional text and support link are as listed")

    def screenshots(self):
        folder = os.path.join(self.dir, "screenshots")
        files = sorted(f for f in os.listdir(folder) if f[:2].isdigit() and f.endswith(".png"))
        kind = self.listing.get("screenshot_display_type", "APP_IPHONE_67")
        sets = self.c.get(f"/v1/appStoreVersionLocalizations/{self.loc}/appScreenshotSets")["data"]
        shot_set = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == kind), None)
        have = []
        if shot_set:
            have = self.c.all(f"/v1/appScreenshotSets/{shot_set['id']}/appScreenshots", limit=50)
        sums = {}
        for name in files:
            with open(os.path.join(folder, name), "rb") as f:
                sums[name] = hashlib.md5(f.read()).hexdigest()
        there = [(s["attributes"].get("fileName"), s["attributes"].get("sourceFileChecksum")) for s in have]
        self.say(f"{kind}: {len(have)} there ({', '.join(str(n) for n, _ in there) or 'none'}); {len(files)} in the repo")
        if there == [(n, sums[n]) for n in files]:
            self.say("screenshots are as in the repo")
            return

        def send():
            sid = shot_set["id"] if shot_set else self.c.call("POST", "/v1/appScreenshotSets", {"data": {"type": "appScreenshotSets", "attributes": {"screenshotDisplayType": kind}, "relationships": {"appStoreVersionLocalization": rel("appStoreVersionLocalizations", self.loc)}}})["data"]["id"]
            for old in have:
                self.c.call("DELETE", f"/v1/appScreenshots/{old['id']}")
            for name in files:
                with open(os.path.join(folder, name), "rb") as f:
                    blob = f.read()
                made = self.c.call("POST", "/v1/appScreenshots", {"data": {"type": "appScreenshots", "attributes": {"fileName": name, "fileSize": len(blob)}, "relationships": {"appScreenshotSet": rel("appScreenshotSets", sid)}}})["data"]
                upload(self.c, made, blob)
                self.c.call("PATCH", f"/v1/appScreenshots/{made['id']}", {"data": {"type": "appScreenshots", "id": made["id"], "attributes": {"uploaded": True, "sourceFileChecksum": sums[name]}}})
            # Apple checks each picture after the upload; say how that went.
            for _ in range(20):
                states = [s["attributes"].get("assetDeliveryState", {}).get("state") for s in self.c.all(f"/v1/appScreenshotSets/{sid}/appScreenshots", limit=50)]
                if all(s in ("COMPLETE", "FAILED") for s in states):
                    break
                time.sleep(3)
            self.say("Apple's check of each picture: " + ", ".join(str(s) for s in states))
            if "FAILED" in states:
                raise ValueError("a screenshot was refused; see App Store Connect for the reason")

        self.change(f"{len(files)} screenshots: " + ", ".join(files), send)

    def review_notes(self):
        notes = self.listing["review_notes"]
        detail = self.c.get_or_none(f"/v1/appStoreVersions/{self.ver}/appStoreReviewDetail")
        data = detail.get("data") if detail else None
        if data is None:
            self.change("notes for App Review", lambda: self.c.call("POST", "/v1/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": {"notes": notes, "demoAccountRequired": False}, "relationships": {"appStoreVersion": rel("appStoreVersions", self.ver)}}}))
            self.say("the contact person for App Review is not entered (the owner types it in App Store Connect)")
            return
        a = data["attributes"]
        missing = [k for k in ("contactFirstName", "contactLastName", "contactPhone", "contactEmail") if not a.get(k)]
        self.say("review contact: " + ("complete" if not missing else "missing " + ", ".join(missing) + " (the owner types it in App Store Connect)"))
        if a.get("notes") != notes or a.get("demoAccountRequired") is not False:
            self.change("notes for App Review", lambda: self.c.call("PATCH", f"/v1/appStoreReviewDetails/{data['id']}", {"data": {"type": "appStoreReviewDetails", "id": data["id"], "attributes": {"notes": notes, "demoAccountRequired": False}}}))
        else:
            self.say("notes for App Review are as listed")

    def attach_build(self):
        current = self.c.get_or_none(f"/v1/appStoreVersions/{self.ver}/build")
        cur = (current or {}).get("data")
        self.say("build attached: " + (f"{cur['attributes']['version']}" if cur else "none"))
        if not self.build:
            return
        if cur and cur["attributes"]["version"] == self.build:
            return
        builds = self.c.get("/v1/builds", **{"filter[app]": self.app, "filter[version]": self.build, "limit": 5})["data"]
        if not builds:
            raise ValueError(f"build {self.build} is not in App Store Connect yet (Apple may still be processing it)")
        b = builds[0]
        self.say(f"build {self.build}: processing {b['attributes'].get('processingState')}, expired {b['attributes'].get('expired')}")
        if b["attributes"].get("processingState") != "VALID":
            raise ValueError(f"build {self.build} is not ready (state {b['attributes'].get('processingState')})")
        self.change(f"attach build {self.build}", lambda: self.c.call("PATCH", f"/v1/appStoreVersions/{self.ver}/relationships/build", {"data": {"type": "builds", "id": b["id"]}}))

    # ---- price and where it is sold

    def price(self):
        schedule = self.c.get_or_none(f"/v1/apps/{self.app}/appPriceSchedule", include="manualPrices")
        has = bool(schedule and schedule.get("data", {}).get("relationships", {}).get("manualPrices", {}).get("data"))
        if has:
            self.say("the app has a price schedule (it is free unless changed in App Store Connect)")
            return
        points = self.c.all(f"/v1/apps/{self.app}/appPricePoints", **{"filter[territory]": "USA", "limit": 200})
        free = next(pt for pt in points if float(pt["attributes"]["customerPrice"]) == 0.0)
        body = {
            "data": {
                "type": "appPriceSchedules",
                "relationships": {"app": rel("apps", self.app), "baseTerritory": rel("territories", "USA"), "manualPrices": {"data": [{"type": "appPrices", "id": "${price1}"}]}},
            },
            "included": [{"type": "appPrices", "id": "${price1}", "attributes": {"startDate": None}, "relationships": {"appPricePoint": rel("appPricePoints", free["id"])}}],
        }
        self.change("the app is free", lambda: self.c.call("POST", "/v1/appPriceSchedules", body))

    def availability(self):
        avail = self.c.get_or_none(f"/v1/apps/{self.app}/appAvailabilityV2")
        if avail and avail.get("data"):
            rows = self.c.all(f"/v2/appAvailabilities/{avail['data']['id']}/territoryAvailabilities", include="territory", limit=200)
            on = sum(1 for r in rows if r["attributes"].get("available"))
            self.say(f"availability is set: {on} of {len(rows)} countries and regions, new ones {avail['data']['attributes'].get('availableInNewTerritories')}")
            return
        leave_out = set(EU) if self.listing.get("leave_out_eu") else set()
        territories = [t["id"] for t in self.c.all("/v1/territories", limit=200)]
        rows, included = [], []
        for i, t in enumerate(territories):
            ref = "${t%d}" % i
            rows.append({"type": "territoryAvailabilities", "id": ref})
            included.append({"type": "territoryAvailabilities", "id": ref, "attributes": {"available": t not in leave_out}, "relationships": {"territory": rel("territories", t)}})
        body = {
            "data": {"type": "appAvailabilities", "attributes": {"availableInNewTerritories": True}, "relationships": {"app": rel("apps", self.app), "territoryAvailabilities": {"data": rows}}},
            "included": included,
        }
        sold = len(territories) - len(leave_out & set(territories))
        self.change(f"sold in {sold} of {len(territories)} countries and regions" + (" (the EU left out)" if leave_out else ""), lambda: self.c.call("POST", "/v2/appAvailabilities", body))

    def go(self):
        self.section("App", self.find_app)
        if not hasattr(self, "app"):
            raise SystemExit("The app record was not found; nothing else can be done.")
        self.section("In-app purchase", self.purchase)
        self.section("Name, subtitle, categories", self.app_info)
        if hasattr(self, "info"):
            self.section("Age rating", self.age_rating)
        self.section("Version and listing text", self.version)
        if hasattr(self, "loc"):
            self.section("Screenshots", self.screenshots)
        if hasattr(self, "ver"):
            self.section("Notes for App Review", self.review_notes)
            self.section("Build", self.attach_build)
        self.section("Price", self.price)
        self.section("Where it is sold", self.availability)
        print()
        if self.todo:
            print(f"{len(self.todo)} thing(s) would change. Run with apply to make them.")
        if self.failed:
            print(f"{len(self.failed)} section(s) failed:")
            for f in self.failed:
                print("  - " + f)
            raise SystemExit(1)
        print("Done. Nothing was submitted for review: that is the owner's button.")


def main():
    if len(sys.argv) < 3 or sys.argv[2] not in ("plan", "apply"):
        raise SystemExit(__doc__)
    slug = sys.argv[1]
    if not slug.replace("-", "").isalnum():
        raise SystemExit("Bad app name")
    build = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    Run(slug, sys.argv[2], build).go()


if __name__ == "__main__":
    main()
