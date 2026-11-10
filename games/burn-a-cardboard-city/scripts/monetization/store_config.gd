class_name StoreConfig
## Every id the live ad network and the App Store need, in one place.
##
## None of these are secrets: AdMob ad unit ids and RevenueCat *public* SDK keys
## ship inside every copy of the app. Never put a RevenueCat *secret* key or an
## App Store Connect key in this repo.
##
## EVERY VALUE MARKED "PLACEHOLDER" BELOW MUST BE REPLACED BEFORE A STORE BUILD.
## The owner's steps for getting each one are in store/README.md ("Burn a
## Cardboard City"). Placeholders are safe: that ad format or the store simply stays
## off, and tests/release_check.gd stops a release build until every one is filled in.
##
## The AdMob *app* id (the one with a "~") is not here: the AdMob plugin reads it
## from project.godot, [admob] general/ios/app_id, and writes it into the iOS
## Info.plist at export. Until it's replaced it holds Google's sample app id.

# --- The bundle id: every product id starts with it ---------------------------------------
# Product ids can't repeat across the apps on one App Store account, so each one
# is "<bundle id>.<key>" (STUDIO.md). Must match store/burn-a-cardboard-city/listing.json.
const BUNDLE_ID := "com.gamequarry.burnacardboardcity"

# --- RevenueCat (in-app purchases) ---------------------------------------------------------
# RevenueCat > the project > API keys > the public App Store key.
const REVENUECAT_KEY_IOS := ""        # PLACEHOLDER: a public key that starts with "appl_"
const REVENUECAT_KEY_ANDROID := ""    # not used yet (iPhone ships first); starts with "goog_"

# RevenueCat entitlement identifier -> the product key it unlocks (Monetization.PRODUCTS).
# Create these entitlements in RevenueCat with exactly these names and attach the
# store product of the same key to each. Consumables (coin packs) need no entitlement.
const ENTITLEMENT_TO_KEY := {
	"remove_ads": "remove_ads_2x",
	"starter_pack": "starter_pack",
	"golden_lens": "golden_lens",
}

# --- AdMob (ads) ----------------------------------------------------------------------------
# AdMob > Apps > Burn a Cardboard City (iOS) > Ad units. Release builds use these.
# Debug builds, builds with the "test_ads" feature and any empty id use Google's
# public test units instead, so nobody can ever click the game's own live ads
# (that gets AdMob accounts closed).
const ADMOB_REWARDED := {"iOS": "", "Android": ""}       # PLACEHOLDER (iOS): "ca-app-pub-.../..."
const ADMOB_INTERSTITIAL := {"iOS": "", "Android": ""}   # PLACEHOLDER (iOS): "ca-app-pub-.../..."

# Optional: a separate rewarded unit per placement, only for nicer AdMob reports.
# Placements not listed here use ADMOB_REWARDED. Example:
#   "boost_2x_fire": {"iOS": "ca-app-pub-.../..."},
const ADMOB_REWARDED_BY_PLACEMENT := {}

# A craft-table cartoon for teens and up: keep the ads mild. "G", "PG", "T" or "MA".
const MAX_AD_CONTENT_RATING := "PG"

# Google's public test units (developers.google.com/admob/ios/test-ads).
const TEST_REWARDED := {
	"iOS": "ca-app-pub-3940256099942544/1712485313",
	"Android": "ca-app-pub-3940256099942544/5224354917",
}
const TEST_INTERSTITIAL := {
	"iOS": "ca-app-pub-3940256099942544/4411468910",
	"Android": "ca-app-pub-3940256099942544/1033173712",
}
const GOOGLE_TEST_PUBLISHER := "ca-app-pub-3940256099942544"

# --- Links shown in the game --------------------------------------------------------------------
# The studio's privacy policy page on the play-links site (site/privacy.html at the
# top of the repo; store/burn-a-cardboard-city/listing.json has the same link).
const PRIVACY_POLICY_URL := "https://gamequarryllc.github.io/game-studio/privacy/"


static func product_id(key: String) -> String:
	## The store's id for one of the game's products: "<bundle id>.<key>".
	return BUNDLE_ID + "." + key


static func platform() -> String:
	## Which set of ids to use. Only iOS (and later Android) ship with ads and
	## purchases; anything else (the editor, tests) borrows the iOS ids.
	return "Android" if OS.get_name() == "Android" else "iOS"


static func use_test_ads() -> bool:
	## Debug builds and builds exported with the "test_ads" feature (the iOS
	## pipeline's "preview" flavor) show Google's test ads, never live ones.
	return OS.is_debug_build() or OS.has_feature("test_ads")


static func revenuecat_key() -> String:
	match OS.get_name():
		"iOS":
			return REVENUECAT_KEY_IOS
		"Android":
			return REVENUECAT_KEY_ANDROID
	return ""


static func rewarded_unit(placement: String) -> String:
	if use_test_ads():
		return TEST_REWARDED.get(platform(), "")
	var live: String = ADMOB_REWARDED.get(platform(), "")
	var per: Dictionary = ADMOB_REWARDED_BY_PLACEMENT.get(placement, {})
	if str(per.get(platform(), "")) != "":
		live = per[platform()]
	return live


static func interstitial_unit() -> String:
	if use_test_ads():
		return TEST_INTERSTITIAL.get(platform(), "")
	return ADMOB_INTERSTITIAL.get(platform(), "")


static func missing_for_release(os_name: String = "iOS") -> PackedStringArray:
	## What still has to be filled in before a store build for `os_name`.
	var out := PackedStringArray()
	var key := REVENUECAT_KEY_ANDROID if os_name == "Android" else REVENUECAT_KEY_IOS
	var prefix := "goog_" if os_name == "Android" else "appl_"
	if not key.begins_with(prefix):
		out.append("scripts/monetization/store_config.gd REVENUECAT_KEY_%s (the public '%s...' key from RevenueCat)" % [os_name.to_upper(), prefix])
	var units := {
		"ADMOB_REWARDED": ADMOB_REWARDED.get(os_name, ""),
		"ADMOB_INTERSTITIAL": ADMOB_INTERSTITIAL.get(os_name, ""),
	}
	for name in units:
		var unit := str(units[name])
		if not unit.begins_with("ca-app-pub-") or not unit.contains("/"):
			out.append("scripts/monetization/store_config.gd %s[\"%s\"] (an AdMob ad unit id, with a '/')" % [name, os_name])
		elif unit.begins_with(GOOGLE_TEST_PUBLISHER):
			out.append("scripts/monetization/store_config.gd %s[\"%s\"] is one of Google's *test* units" % [name, os_name])
	var setting := "admob/general/%s/app_id" % os_name.to_lower()
	var app_id := str(ProjectSettings.get_setting(setting, ""))
	if not app_id.begins_with("ca-app-pub-") or not app_id.contains("~") or app_id.begins_with(GOOGLE_TEST_PUBLISHER):
		out.append("project.godot [admob] %s (the game's AdMob app id, with a '~')" % setting.trim_prefix("admob/"))
	if not PRIVACY_POLICY_URL.begins_with("https://"):
		out.append("scripts/monetization/store_config.gd PRIVACY_POLICY_URL (the privacy policy page, https://...)")
	return out
