class_name MonetizationProvider
extends Node
## The interface every ad / store backend implements.
##
## The game never talks to AdMob or the App Store directly. It talks to the
## `Monetization` autoload, which owns exactly one provider:
##   MobileMonetizationProvider  AdMob + RevenueCat (iOS release builds)
##   StubMonetizationProvider    pretend ads and purchases (playtest, web, editor, tests)
##   MonetizationProvider        this base: no ads, no store (a release desktop build)
##
## Contract: every request ends with exactly one result signal.

signal rewarded_completed(placement: String)              # player watched it: grant the reward
signal rewarded_failed(placement: String, reason: String) # no fill, closed early, offline...
signal interstitial_closed(placement: String)
signal purchase_succeeded(product_id: String)
signal purchase_failed(product_id: String, reason: String)
signal purchase_restored(product_id: String)             # one per owned non-consumable
signal restore_finished(found: int, error: String)        # once per restore_purchases()


func provider_name() -> String:
	return "none"


## Called once at startup (init SDKs, preload the first ads, query products).
func initialize() -> void:
	pass


func is_rewarded_ready(_placement: String) -> bool:
	return false


func show_rewarded(placement: String) -> void:
	rewarded_failed.emit.call_deferred(placement, "ads aren't available in this build")


func show_interstitial(placement: String) -> void:
	interstitial_closed.emit.call_deferred(placement)


func purchase(product_id: String) -> void:
	purchase_failed.emit.call_deferred(product_id, "the store isn't available in this build")


func restore_purchases() -> void:
	restore_finished.emit.call_deferred(0, "the store isn't available in this build")


## "Remove ads" was bought: stop loading interstitials.
func set_ads_removed(_removed: bool) -> void:
	pass


## True when the player must be able to reopen the ad-consent form (EEA/UK).
func privacy_options_required() -> bool:
	return false


func show_privacy_options() -> void:
	pass


## Local price from the store, e.g. "4,99 €". The fallback is used until it loads.
func price_string(_product_id: String, fallback: String) -> String:
	return fallback
