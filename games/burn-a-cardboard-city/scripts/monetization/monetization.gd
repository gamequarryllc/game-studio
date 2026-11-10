extends Node
## Autoload "Monetization": the only place the game asks for ads or purchases.
##
##   Monetization.watch_for_reward("boost", func(ok, text): ...)
##   Monetization.buy(Monetization.PRODUCT_REMOVE_ADS_2X)
##   Monetization.maybe_show_interstitial(Monetization.PLACEMENT_INTERSTITIAL)
##
## Providers (_create_provider): on iPhone release builds the real one
## (MobileMonetizationProvider: AdMob + RevenueCat, ids in store_config.gd); in
## playtest builds (the web play links, the iOS playtest flavor), the editor and
## the tests, the stub with pretend ads and purchases. NOTES.md, "Money", says
## how the owner switches the real ones on.

signal purchases_changed
signal purchase_error(product_id: String, reason: String)
signal purchase_granted(product_id: String, text: String)
signal restore_done(found: int, error: String)

# Rewarded ad placements. Each is a reward in Balance.AD_REWARDS. They all share
# one AdMob rewarded unit unless StoreConfig.ADMOB_REWARDED_BY_PLACEMENT splits them.
const PLACEMENT_BOOST := "boost_2x_fire"
const PLACEMENT_INSTANT := "instant_coins"
const PLACEMENT_HELPER_RUSH := "helper_rush"
const PLACEMENT_DOUBLE_FIND := "double_find"     # double a golden ticket
const PLACEMENT_INTERSTITIAL := "shop_close"

# Store product ids: "<bundle id>.<key>" (create exactly these in App Store Connect;
# store/burn-a-cardboard-city/listing.json lists the keys, prices and names).
const PRODUCT_REMOVE_ADS_2X := StoreConfig.BUNDLE_ID + ".remove_ads_2x"   # non-consumable
const PRODUCT_STARTER := StoreConfig.BUNDLE_ID + ".starter_pack"          # non-consumable, one time
const PRODUCT_GOLDEN := StoreConfig.BUNDLE_ID + ".golden_lens"            # non-consumable cosmetic + 10% power
const PRODUCT_COINS_S := StoreConfig.BUNDLE_ID + ".coins_small"           # consumable
const PRODUCT_COINS_M := StoreConfig.BUNDLE_ID + ".coins_medium"          # consumable
const PRODUCT_COINS_L := StoreConfig.BUNDLE_ID + ".coins_large"           # consumable

# The titles are the names the box shows; the store listing's display names match
# them, so the payment sheet names the thing the player tapped.
const PRODUCTS = {
	PRODUCT_REMOVE_ADS_2X: {"title": "No ads, and 2x for good", "fallback_price": "$4.99", "consumable": false},
	PRODUCT_STARTER: {"title": "A box of matches", "fallback_price": "$1.99", "consumable": false},
	PRODUCT_GOLDEN: {"title": "The golden lens", "fallback_price": "$2.99", "consumable": false},
	PRODUCT_COINS_S: {"title": "A sock of coins", "fallback_price": "$0.99", "consumable": true},
	PRODUCT_COINS_M: {"title": "A jar of coins", "fallback_price": "$2.99", "consumable": true},
	PRODUCT_COINS_L: {"title": "A shoebox of coins", "fallback_price": "$9.99", "consumable": true},
}
const PACK_PRODUCTS := [PRODUCT_COINS_S, PRODUCT_COINS_M, PRODUCT_COINS_L]

var provider: MonetizationProvider
var _reward_callbacks: Dictionary = {}
var _last_interstitial: float = 0.0
var _interstitial_open := false


func _ready() -> void:
	provider = _create_provider()
	add_child(provider)
	provider.rewarded_completed.connect(_on_rewarded_completed)
	provider.rewarded_failed.connect(_on_rewarded_failed)
	provider.purchase_succeeded.connect(_grant)
	provider.purchase_restored.connect(_grant)
	provider.purchase_failed.connect(func(id, reason): purchase_error.emit(id, reason))
	provider.restore_finished.connect(func(found, error): restore_done.emit(found, error))
	provider.interstitial_closed.connect(func(_p): _interstitial_open = false)
	provider.initialize()
	_last_interstitial = 0.0


func _create_provider() -> MonetizationProvider:
	if OS.has_feature("playtest") or OS.has_feature("stub_store"):
		return StubMonetizationProvider.new()      # play links, iOS playtest flavor
	var os_name := OS.get_name()
	if os_name == "iOS" or os_name == "Android":
		return MobileMonetizationProvider.new()    # the App Store build
	if OS.is_debug_build():
		return StubMonetizationProvider.new()      # the editor and the tests
	return MonetizationProvider.new()              # a release desktop build: no ads, no store


func provider_name() -> String:
	return provider.provider_name()


func is_stub() -> bool:
	return provider is StubMonetizationProvider


# --- Privacy (ad consent) ----------------------------------------------------------------
func privacy_options_required() -> bool:
	## EEA/UK players must be able to reopen Google's consent form (Settings shows a button).
	return provider.privacy_options_required()


func show_privacy_options() -> void:
	provider.show_privacy_options()


# --- Rewarded ---------------------------------------------------------------------------
func is_rewarded_ready(placement: String) -> bool:
	return provider.is_rewarded_ready(placement)


func show_rewarded(placement: String, on_done: Callable) -> void:
	## on_done(ok: bool) is called exactly once.
	if _reward_callbacks.has(placement):
		return
	_reward_callbacks[placement] = on_done
	provider.show_rewarded(placement)


func watch_for_reward(kind: String, on_done: Callable) -> void:
	var placement: String = Balance.AD_REWARDS[kind].placement
	show_rewarded(placement, func(ok: bool):
		on_done.call(ok, GameState.grant_ad_reward(kind) if ok else ""))


func is_watching() -> bool:
	return not _reward_callbacks.is_empty()


func is_showing_ad() -> bool:
	return is_watching() or _interstitial_open


func _on_rewarded_completed(placement: String) -> void:
	_last_interstitial = GameState.now()
	var cb: Callable = _reward_callbacks.get(placement, Callable())
	_reward_callbacks.erase(placement)
	if cb.is_valid():
		cb.call(true)


func _on_rewarded_failed(placement: String, reason: String) -> void:
	print("[Monetization] rewarded '%s' failed: %s" % [placement, reason])
	var cb: Callable = _reward_callbacks.get(placement, Callable())
	_reward_callbacks.erase(placement)
	if cb.is_valid():
		cb.call(false)


# --- Interstitial (light) ----------------------------------------------------------------
func maybe_show_interstitial(placement: String) -> bool:
	## Only at natural breaks; never with Remove Ads, never early, at most every 4 min.
	if GameState.owns_remove_ads_2x or GameState.play_time < Balance.INTERSTITIAL_FIRST_AFTER:
		return false
	var t: float = GameState.now()
	if (_last_interstitial > 0.0 and t - _last_interstitial < Balance.INTERSTITIAL_COOLDOWN) or is_showing_ad():
		return false
	_last_interstitial = t
	_interstitial_open = true
	provider.show_interstitial(placement)
	return true


# --- Purchases --------------------------------------------------------------------------
func owns(product_id: String) -> bool:
	match product_id:
		PRODUCT_REMOVE_ADS_2X:
			return GameState.owns_remove_ads_2x
		PRODUCT_STARTER:
			return GameState.owns_starter
		PRODUCT_GOLDEN:
			return GameState.owns_golden
	return false


func price(product_id: String) -> String:
	return provider.price_string(product_id, PRODUCTS[product_id].fallback_price)


func buy(product_id: String) -> void:
	if owns(product_id):
		return
	provider.purchase(product_id)


func restore() -> void:
	provider.restore_purchases()


func _grant(product_id: String) -> void:
	if not PRODUCTS.has(product_id):
		push_warning("Unknown product: %s" % product_id)
		return
	if not bool(PRODUCTS[product_id].consumable) and owns(product_id):
		return   # restores and store updates repeat grants: keep the player's own settings
	var text := ""
	match product_id:
		PRODUCT_REMOVE_ADS_2X:
			GameState.owns_remove_ads_2x = true
			provider.set_ads_removed(true)
			text = "No more ads, and everything burns twice over. Thank you."
		PRODUCT_STARTER:
			GameState.owns_starter = true
			GameState.starter_offered = true
			GameState.party_on = true
			GameState.grant_coins(Balance.STARTER_COINS)
			text = "+%s coins, and party sparks" % Fmt.num(Balance.STARTER_COINS)
		PRODUCT_GOLDEN:
			GameState.owns_golden = true
			GameState.golden_on = true
			text = "The golden lens: gold fire, 10% hotter"
		PRODUCT_COINS_S, PRODUCT_COINS_M, PRODUCT_COINS_L:
			var amount := GameState.coin_pack_amount(PACK_PRODUCTS.find(product_id))
			GameState.grant_coins(amount)
			GameState.packs_bought += 1
			text = "+%s coins" % Fmt.num(amount)
	GameState.save_game()
	GameState.changed.emit()
	purchases_changed.emit()
	purchase_granted.emit(product_id, text)
