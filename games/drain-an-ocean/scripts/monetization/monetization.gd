extends Node
## Autoload "Monetization": the only place the game asks for ads or purchases.
##
##   Monetization.watch_for_reward("boost", func(ok, text): ...)
##   Monetization.buy(Monetization.PRODUCT_REMOVE_ADS_2X)
##   Monetization.maybe_show_interstitial(Monetization.PLACEMENT_INTERSTITIAL)
##
## Going live: implement a MonetizationProvider subclass (AdMob + RevenueCat)
## and return it from _create_provider(). The ids below are the ones to
## create in AdMob, App Store Connect and Play Console (see NOTES.md).

signal purchases_changed
signal purchase_error(product_id: String, reason: String)

# Rewarded ad placements (also in Balance.AD_REWARDS).
const PLACEMENT_BOOST := "boost_2x_pump"          # 2x pumping for 5 min (stacks to 15)
const PLACEMENT_CASH := "instant_cash"            # a few minutes of income
const PLACEMENT_HELPER_RUSH := "helper_rush"      # helpers work 3x for 3 min
const PLACEMENT_TICKETS := "ticket_rush"          # the aquarium sells double for 10 min
const PLACEMENT_DOUBLE_FIND := "double_find"      # pay a find out twice
# Interstitial placement: only when you leave the chandlery or the aquarium.
const PLACEMENT_INTERSTITIAL := "panel_close"

# Store products (prefixed with the bundle id so they're unique in the account).
const PRODUCT_REMOVE_ADS_2X := "com.gamequarry.drainanocean.remove_ads_2x"   # non-consumable
const PRODUCT_STARTER := "com.gamequarry.drainanocean.starter_pack"          # non-consumable, one time
const PRODUCT_BRASS := "com.gamequarry.drainanocean.brass_pumps"             # non-consumable cosmetic
const PRODUCT_CASH_SMALL := "com.gamequarry.drainanocean.cash_small"         # consumable
const PRODUCT_CASH_MEDIUM := "com.gamequarry.drainanocean.cash_medium"       # consumable
const PRODUCT_CASH_LARGE := "com.gamequarry.drainanocean.cash_large"         # consumable

const PRODUCTS = {
	PRODUCT_REMOVE_ADS_2X: {"title": "Remove ads + permanent 2x", "fallback_price": "$4.99"},
	PRODUCT_STARTER: {"title": "Harbour starter pack", "fallback_price": "$1.99"},
	PRODUCT_BRASS: {"title": "Polished brass pumps", "fallback_price": "$2.99"},
	PRODUCT_CASH_SMALL: {"title": "Purse of coins", "fallback_price": "$0.99", "pack": "small"},
	PRODUCT_CASH_MEDIUM: {"title": "Strongbox of coins", "fallback_price": "$2.99", "pack": "medium"},
	PRODUCT_CASH_LARGE: {"title": "Galleon's hold of coins", "fallback_price": "$7.99", "pack": "large"},
}

var provider: MonetizationProvider
var _reward_callbacks := {}            # placement -> Callable(bool)
var _last_interstitial := -1e9         # play time of the last interstitial
var _last_rewarded := -1e9             # play time of the last rewarded ad you chose
var _interstitial_open := false
var interstitials_shown := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	provider = _create_provider()
	add_child(provider)
	provider.rewarded_completed.connect(_on_rewarded_completed)
	provider.rewarded_failed.connect(_on_rewarded_failed)
	provider.purchase_succeeded.connect(_grant)
	provider.purchase_restored.connect(_grant)
	provider.purchase_failed.connect(func(id, reason): purchase_error.emit(id, reason))
	provider.interstitial_closed.connect(func(_p): _interstitial_open = false)
	provider.initialize()


func _create_provider() -> MonetizationProvider:
	# When shipping: detect the plugins and return the real provider here.
	return StubMonetizationProvider.new()


# --- Rewarded -------------------------------------------------------------------------
func is_rewarded_ready(placement: String) -> bool:
	return provider.is_rewarded_ready(placement)


func show_rewarded(placement: String, on_done: Callable) -> void:
	## on_done(ok: bool) is called exactly once. A second request while an ad
	## is up is refused straight away (never left hanging).
	if is_showing_ad():
		if on_done.is_valid():
			on_done.call(false)
		return
	_reward_callbacks[placement] = on_done
	provider.show_rewarded(placement)


func watch_for_reward(kind: String, on_done: Callable) -> void:
	## Show the rewarded ad for one of Balance.AD_REWARDS; if it's watched to
	## the end, grant it. on_done(ok: bool, text: String) says what you got.
	var placement: String = Balance.AD_REWARDS[kind].placement
	show_rewarded(placement, func(ok: bool):
		# The reward is granted even if whoever asked is gone.
		var text: String = GameState.grant_ad_reward(kind) if ok else ""
		if on_done.is_valid():
			on_done.call(ok, text))


func is_watching() -> bool:
	return not _reward_callbacks.is_empty()


func is_showing_ad() -> bool:
	return is_watching() or _interstitial_open


func _on_rewarded_completed(placement: String) -> void:
	_last_rewarded = GameState.play_time
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


# --- Interstitials: light, only at natural breaks ------------------------------------------
func interstitial_allowed() -> bool:
	if GameState.owns_remove_ads or is_showing_ad():
		return false
	var t := GameState.play_time
	if t < Balance.INTERSTITIAL_FIRST_AFTER:
		return false
	if t - _last_interstitial < Balance.INTERSTITIAL_COOLDOWN:
		return false
	if t - _last_rewarded < Balance.INTERSTITIAL_AFTER_REWARDED:
		return false
	return true


func maybe_show_interstitial(placement: String) -> bool:
	if not interstitial_allowed():
		return false
	_last_interstitial = GameState.play_time
	_interstitial_open = true
	interstitials_shown += 1
	provider.show_interstitial(placement)
	return true


# --- Purchases ------------------------------------------------------------------------------
func owns(product_id: String) -> bool:
	match product_id:
		PRODUCT_REMOVE_ADS_2X:
			return GameState.owns_remove_ads
		PRODUCT_BRASS:
			return GameState.owns_brass
		PRODUCT_STARTER:
			return GameState.owns_starter
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
	match product_id:
		PRODUCT_REMOVE_ADS_2X:
			GameState.owns_remove_ads = true
		PRODUCT_BRASS:
			GameState.owns_brass = true
			GameState.skin = "brass"
		PRODUCT_STARTER:
			if not GameState.owns_starter:
				GameState.owns_starter = true
				GameState.starter_offered = true
				GameState.grant_money(GameState.starter_cash())
				if GameState.skin == "":
					GameState.skin = "flags"
		PRODUCT_CASH_SMALL, PRODUCT_CASH_MEDIUM, PRODUCT_CASH_LARGE:
			GameState.grant_money(GameState.cash_pack_amount(str(PRODUCTS[product_id].pack)))
		_:
			push_warning("Unknown product: %s" % product_id)
			return
	GameState.purchases_made += 1
	GameState.save_game()
	GameState.changed.emit()
	purchases_changed.emit()
