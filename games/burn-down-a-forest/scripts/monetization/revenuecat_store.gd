class_name RevenueCatStore
extends Node
## Real in-app purchases on the App Store through RevenueCat, using the Godotx
## RevenueCat plugin (addons/godotx_revenue_cat; the iOS frameworks are fetched by
## tools/fetch_plugins.sh). Adapted from the studio's reference game.
##
## RevenueCat does the store talk and receipt checks; the game maps RevenueCat
## *entitlements* to its own product ids (StoreConfig.ENTITLEMENT_TO_KEY) and grants
## them. Purchases are also kept in the save file, so the game works offline;
## RevenueCat grants them again on a new phone through "Restore purchases".
## Prices come from the store in the player's own currency (price_string).

signal purchased(product_id: String)
signal failed(product_id: String, reason: String)
signal restored(product_id: String)
signal restore_done(found: int, error: String)

const SINGLETON := "GodotxRevenueCat"

var _rc: Object
var _prices: Dictionary = {}       # product id -> local price string ("4,99 €")
var _pending := ""                 # product id of the purchase in flight
var _restoring := false


static func available() -> bool:
	return Engine.has_singleton(SINGLETON) and StoreConfig.revenuecat_key() != ""


func start(product_ids: Array) -> void:
	_rc = Engine.get_singleton(SINGLETON)
	_rc.customer_info.connect(_on_customer_info)
	_rc.customer_info_changed.connect(_on_customer_info)
	_rc.purchase_result.connect(_on_purchase_result)
	_rc.products.connect(_on_products)
	_rc.restore_finished.connect(_on_restore_finished)
	_rc.initialize(StoreConfig.revenuecat_key(), "", OS.is_debug_build())
	# Android's bridge wants a String[] (PackedStringArray); iOS takes an Array.
	if OS.get_name() == "Android":
		_rc.fetch_products(PackedStringArray(product_ids))
	else:
		_rc.fetch_products(product_ids)


func has_price(product_id: String) -> bool:
	return _prices.has(product_id)


func price_string(product_id: String, fallback: String) -> String:
	return _prices.get(product_id, fallback)


func purchase(product_id: String) -> void:
	if _pending != "":
		failed.emit(product_id, "another purchase is still open")
		return
	_pending = product_id
	_rc.purchase(product_id)


func restore() -> void:
	if _restoring:
		return
	_restoring = true
	_rc.restore_purchases()


# --- Plugin callbacks ------------------------------------------------------------------
func _on_purchase_result(data: Dictionary) -> void:
	var pid: String = str(data.get("product_id", ""))
	if pid == "":
		pid = _pending
	_pending = ""
	var error: String = str(data.get("error", ""))
	if bool(data.get("cancelled", false)):
		failed.emit(pid, "cancelled")
	elif error != "":
		failed.emit(pid, _friendly(error))
	else:
		purchased.emit(pid)


func _on_customer_info(data: Dictionary) -> void:
	## Sent at startup, after a restore and whenever the store changes something.
	## Grants anything RevenueCat says is active (never takes things away: the
	## save file may hold purchases made while RevenueCat couldn't be reached).
	var found := 0
	for ent in _ids(data.get("active_ids", [])):
		var key: String = StoreConfig.ENTITLEMENT_TO_KEY.get(str(ent), "")
		if key != "":
			found += 1
			restored.emit(StoreConfig.product_id(key))
	if _restoring:
		_restoring = false
		restore_done.emit(found, "")


func _on_restore_finished(data: Dictionary) -> void:
	if not bool(data.get("success", false)):
		_restoring = false
		restore_done.emit(0, _friendly(str(data.get("error", "restore failed"))))
		return
	_rc.get_customer_info()   # -> _on_customer_info grants and reports


func _on_products(data: Dictionary) -> void:
	var list = data.get("products", [])
	if str(data.get("error", "")) != "":
		print("[RevenueCat] products: %s" % data.error)
	for p in _ids(list):
		if p is Dictionary and str(p.get("id", "")) != "" and str(p.get("price", "")) != "":
			_prices[str(p.id)] = str(p.price)
	print("[RevenueCat] prices: %s" % _prices)


static func _ids(list) -> Array:
	## The plugin hands back an Array / PackedStringArray, or on some Android
	## builds a java.util.List wrapper (JavaObject): flatten them all.
	if list is Array or list is PackedStringArray:
		return Array(list)
	var out := []
	if list is Object and list.has_method("call"):
		for i in int(list.call("size")):
			out.append(list.call("get", i))
	return out


static func _friendly(error: String) -> String:
	var e := error.to_lower()
	if e.contains("network") or e.contains("internet") or e.contains("offline"):
		return "no connection, try again later"
	if e.contains("not allowed") or e.contains("purchase_not_allowed"):
		return "purchases are turned off on this device"
	if e.contains("not_found") or e.contains("not available") or e.contains("unavailable"):
		return "the store isn't ready yet, try again later"
	return error
