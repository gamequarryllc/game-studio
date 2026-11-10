class_name MobileMonetizationProvider
extends MonetizationProvider
## The shipping provider on iPhone (and later Android): AdMob for ads, RevenueCat
## for purchases. Each half switches itself off when its plugin or ids are
## missing (a build made without tools/fetch_plugins.sh, or before the owner's
## ids are in store_config.gd), so the game still runs: ads then report "not
## ready" (no offer tag shows) and purchases fail politely. Adapted from the
## studio's reference game.

var ads: AdMobAds
var store: RevenueCatStore


func provider_name() -> String:
	return "mobile (ads: %s, purchases: %s)" % [
		"AdMob" if ads else "off", "RevenueCat" if store else "off"]


func initialize() -> void:
	if AdMobAds.available():
		ads = AdMobAds.new()
		add_child(ads)
		ads.rewarded_done.connect(func(placement: String, ok: bool, reason: String):
			if ok:
				rewarded_completed.emit(placement)
			else:
				rewarded_failed.emit(placement, reason))
		ads.interstitial_done.connect(func(placement: String): interstitial_closed.emit(placement))
		ads.interstitials_enabled = not GameState.owns_remove_ads_2x
		ads.start()
	else:
		push_warning("[Monetization] AdMob plugin missing: ads are off.")
	if RevenueCatStore.available():
		store = RevenueCatStore.new()
		add_child(store)
		store.purchased.connect(func(id: String): purchase_succeeded.emit(id))
		store.failed.connect(func(id: String, reason: String): purchase_failed.emit(id, reason))
		store.restored.connect(func(id: String): purchase_restored.emit(id))
		store.restore_done.connect(func(found: int, error: String): restore_finished.emit(found, error))
		store.start(Monetization.PRODUCTS.keys())
	else:
		push_warning("[Monetization] RevenueCat plugin or key missing: purchases are off.")
	print("[Monetization] %s" % provider_name())


func is_rewarded_ready(placement: String) -> bool:
	return ads != null and ads.is_rewarded_ready(placement)


func show_rewarded(placement: String) -> void:
	if ads == null:
		rewarded_failed.emit.call_deferred(placement, "ads unavailable")
	else:
		ads.show_rewarded(placement)


func show_interstitial(placement: String) -> void:
	if ads == null:
		interstitial_closed.emit.call_deferred(placement)
	else:
		ads.show_interstitial(placement)


func set_ads_removed(removed: bool) -> void:
	if ads != null:
		ads.set_interstitials_enabled(not removed)


func purchase(product_id: String) -> void:
	if store == null:
		purchase_failed.emit.call_deferred(product_id, "the store isn't open in this build yet")
	else:
		store.purchase(product_id)


func restore_purchases() -> void:
	if store == null:
		restore_finished.emit.call_deferred(0, "the store isn't open in this build yet")
	else:
		store.restore()


func price_string(product_id: String, fallback: String) -> String:
	return store.price_string(product_id, fallback) if store != null else fallback


func has_store_price(product_id: String) -> bool:
	return store != null and store.has_price(product_id)


func privacy_options_required() -> bool:
	return ads != null and ads.privacy_options_required()


func show_privacy_options() -> void:
	if ads != null:
		ads.show_privacy_options()
