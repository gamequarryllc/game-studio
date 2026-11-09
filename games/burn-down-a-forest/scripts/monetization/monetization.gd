extends Node
## Autoload "Monetization": the only place the game asks for ads or purchases.
##
##   Monetization.watch_for_reward("boost", func(ok, text): ...)
##   Monetization.buy(Monetization.PRODUCT_REMOVE_ADS_2X)
##   Monetization.maybe_show_interstitial(Monetization.PLACEMENT_INTERSTITIAL)
##
## To go live, implement a MonetizationProvider subclass (AdMob for ads,
## RevenueCat or the store plugins for purchases) and return it from
## _create_provider(). The ids below are the ones to create in the store
## consoles and in AdMob (see NOTES.md).

signal purchases_changed
signal purchase_error(product_id: String, reason: String)
signal purchase_granted(product_id: String, text: String)

# Rewarded ad placements (also the AdMob ad unit keys). Each is a reward in Balance.AD_REWARDS.
const PLACEMENT_BOOST := "boost_2x_fire"
const PLACEMENT_INSTANT := "instant_embers"
const PLACEMENT_HELPER_RUSH := "helper_rush"
const PLACEMENT_DOUBLE_FIND := "double_find"    # double a golden critter's embers
const PLACEMENT_INTERSTITIAL := "notebook_close"

# Store product ids (create the same ids in App Store Connect / Play Console).
const PRODUCT_REMOVE_ADS_2X := "remove_ads_2x"     # non-consumable
const PRODUCT_STARTER := "starter_pack"            # non-consumable, one time
const PRODUCT_PHOENIX := "phoenix_flame"           # non-consumable cosmetic + 10% heat
const PRODUCT_EMBERS_S := "embers_small"           # consumable
const PRODUCT_EMBERS_M := "embers_medium"          # consumable
const PRODUCT_EMBERS_L := "embers_large"           # consumable

const PRODUCTS = {
	PRODUCT_REMOVE_ADS_2X: {"title": "Remove Ads + Permanent 2x", "fallback_price": "$4.99", "consumable": false},
	PRODUCT_STARTER: {"title": "Fire-Keeper's Starter Pack", "fallback_price": "$1.99", "consumable": false},
	PRODUCT_PHOENIX: {"title": "Phoenix Flame", "fallback_price": "$2.99", "consumable": false},
	PRODUCT_EMBERS_S: {"title": "Pouch of Embers", "fallback_price": "$0.99", "consumable": true},
	PRODUCT_EMBERS_M: {"title": "Jar of Embers", "fallback_price": "$2.99", "consumable": true},
	PRODUCT_EMBERS_L: {"title": "Cauldron of Embers", "fallback_price": "$9.99", "consumable": true},
}
const PACK_PRODUCTS := [PRODUCT_EMBERS_S, PRODUCT_EMBERS_M, PRODUCT_EMBERS_L]

var provider: MonetizationProvider
var _reward_callbacks: Dictionary = {}   # placement -> Callable(bool)
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
	provider.interstitial_closed.connect(func(_p): _interstitial_open = false)
	provider.initialize()
	_last_interstitial = Time.get_unix_time_from_system()


func _create_provider() -> MonetizationProvider:
	# TODO when shipping: detect the plugins and return the real provider.
	return StubMonetizationProvider.new()


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
	## Show the rewarded ad for one of Balance.AD_REWARDS; if it's watched to the
	## end, grant the reward. on_done(ok: bool, text: String) says what you got.
	var placement: String = Balance.AD_REWARDS[kind].placement
	show_rewarded(placement, func(ok: bool):
		on_done.call(ok, GameState.grant_ad_reward(kind) if ok else ""))


func is_watching() -> bool:
	return not _reward_callbacks.is_empty()


func is_showing_ad() -> bool:
	return is_watching() or _interstitial_open


func _on_rewarded_completed(placement: String) -> void:
	# Someone who just chose to watch an ad shouldn't get an unasked one next.
	_last_interstitial = Time.get_unix_time_from_system()
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
	var t := Time.get_unix_time_from_system()
	if t - _last_interstitial < Balance.INTERSTITIAL_COOLDOWN or is_showing_ad():
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
		PRODUCT_PHOENIX:
			return GameState.owns_phoenix
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
	var text := ""
	match product_id:
		PRODUCT_REMOVE_ADS_2X:
			GameState.owns_remove_ads_2x = true
			text = "🚫 No more ads, and everything burns 2x. Thank you!"
		PRODUCT_STARTER:
			if GameState.owns_starter:
				return
			GameState.owns_starter = true
			GameState.starter_offered = true
			GameState.sparkler_on = true
			GameState.grant_embers(Balance.STARTER_EMBERS)
			text = "🎁 +%s embers and the Rainbow Sparkler!" % Fmt.num(Balance.STARTER_EMBERS)
		PRODUCT_PHOENIX:
			GameState.owns_phoenix = true
			GameState.phoenix_on = true
			text = "🪶 The Phoenix Flame is yours: golden fire, +10% heat!"
		PRODUCT_EMBERS_S, PRODUCT_EMBERS_M, PRODUCT_EMBERS_L:
			var amount := GameState.ember_pack_amount(PACK_PRODUCTS.find(product_id))
			GameState.grant_embers(amount)
			GameState.packs_bought += 1
			text = "🔥 +%s embers!" % Fmt.num(amount)
		_:
			push_warning("Unknown product: %s" % product_id)
			return
	GameState.save_game()
	GameState.changed.emit()
	purchases_changed.emit()
	purchase_granted.emit(product_id, text)
