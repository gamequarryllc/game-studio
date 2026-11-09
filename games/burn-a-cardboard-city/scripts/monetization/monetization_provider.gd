class_name MonetizationProvider
extends Node
## The interface every ad / store backend implements.
##
## The game never talks to AdMob or Google Play Billing directly. It talks to
## the `Monetization` autoload, which owns exactly one provider. To ship real
## ads and purchases, write e.g. `AdMobBillingProvider extends MonetizationProvider`
## that wraps the plugins, and select it in monetization.gd. Nothing else changes.
##
## Contract: every request must end with exactly one result signal.

signal rewarded_completed(placement: String)              # player watched it: grant the reward
signal rewarded_failed(placement: String, reason: String) # no fill, closed early, offline...
signal interstitial_closed(placement: String)
signal purchase_succeeded(product_id: String)
signal purchase_failed(product_id: String, reason: String)
signal purchase_restored(product_id: String)             # one per owned non-consumable


func provider_name() -> String:
	return "base"


## Called once at startup (init SDKs, preload the first ads, query products).
func initialize() -> void:
	pass


func is_rewarded_ready(_placement: String) -> bool:
	return false


func show_rewarded(placement: String) -> void:
	rewarded_failed.emit(placement, "not implemented")


func show_interstitial(placement: String) -> void:
	interstitial_closed.emit(placement)


func purchase(product_id: String) -> void:
	purchase_failed.emit(product_id, "not implemented")


func restore_purchases() -> void:
	pass


## Localised price from the store, e.g. "$2.99". Fallback used until it loads.
func price_string(_product_id: String, fallback: String) -> String:
	return fallback
