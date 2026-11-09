class_name MonetizationProvider
extends Node
## The interface every ad / store backend implements.
##
## The game never talks to an ad network or a store directly. It talks to the
## `Monetization` autoload, which owns exactly one provider. To ship real ads
## and purchases, write e.g. `AdMobRevenueCatProvider extends MonetizationProvider`
## that wraps the plugins and return it from Monetization._create_provider().
##
## Contract: every request ends with exactly one result signal.

signal rewarded_completed(placement: String)              # watched to the end: grant the reward
signal rewarded_failed(placement: String, reason: String) # no fill, closed early, offline...
signal interstitial_closed(placement: String)
signal purchase_succeeded(product_id: String)
signal purchase_failed(product_id: String, reason: String)
signal purchase_restored(product_id: String)             # one per owned non-consumable


func provider_name() -> String:
	return "base"


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


## Localised price from the store, e.g. "$4.99". The fallback is used until it loads.
func price_string(_product_id: String, fallback: String) -> String:
	return fallback
