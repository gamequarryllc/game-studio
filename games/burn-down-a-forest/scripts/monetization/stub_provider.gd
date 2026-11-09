class_name StubMonetizationProvider
extends MonetizationProvider
## Fake ads and purchases so the whole flow can be played and tested without
## any SDK. Ads show a full-screen "pretend ad" with a countdown; purchases
## succeed after a short delay and are remembered in GameState's save.
## Every fake ad and purchase is counted (`counts`) for the developer menu, so
## pacing with and without ads can be compared.

const FAKE_AD_SECONDS := 3

var counts := {"rewarded": 0, "interstitial": 0, "purchases": 0}
var _layer: CanvasLayer


func provider_name() -> String:
	return "stub"


func initialize() -> void:
	print("[Monetization] Stub provider active: ads and purchases are simulated.")


func is_rewarded_ready(_placement: String) -> bool:
	return true


func show_rewarded(placement: String) -> void:
	_show_fake_ad("A pretend rewarded ad", placement, true)


func show_interstitial(placement: String) -> void:
	_show_fake_ad("A pretend ad between breaks", placement, false)


func purchase(product_id: String) -> void:
	await get_tree().create_timer(0.4).timeout
	counts.purchases += 1
	purchase_succeeded.emit(product_id)


func restore_purchases() -> void:
	# A real store returns what the account owns. The stub owns nothing extra;
	# GameState already remembers stub purchases in the save file.
	pass


func price_string(_product_id: String, fallback: String) -> String:
	return fallback + " (test)"


func _show_fake_ad(title: String, placement: String, rewarded: bool) -> void:
	if _layer != null:
		return
	_layer = CanvasLayer.new()
	_layer.layer = 100
	add_child(_layer)
	var bg := ColorRect.new()
	bg.color = Color(0.03, 0.02, 0.03, 0.95)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	_layer.add_child(bg)
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 24)
	bg.add_child(box)
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var label := Label.new()
	label.text = "%s\nplacement: %s\n\nA real ad plays here once the ad network is connected." % [title, placement]
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 34)
	box.add_child(label)
	var btn := Button.new()
	btn.focus_mode = Control.FOCUS_NONE   # Space (jump) mustn't press it
	btn.custom_minimum_size = Vector2(360, 90)
	btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	btn.disabled = true
	box.add_child(btn)
	if rewarded:
		var skip := Button.new()
		skip.focus_mode = Control.FOCUS_NONE
		skip.text = "Close early, no reward"
		skip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		box.add_child(skip)
		skip.pressed.connect(func():
			_close()
			rewarded_failed.emit(placement, "closed early"))
	for i in range(FAKE_AD_SECONDS, 0, -1):
		btn.text = "Close in %d" % i
		await get_tree().create_timer(1.0).timeout
		if _layer == null:
			return  # closed early
	btn.text = "Close ad"
	btn.disabled = false
	await btn.pressed
	_close()
	if rewarded:
		counts.rewarded += 1
		rewarded_completed.emit(placement)
	else:
		counts.interstitial += 1
		interstitial_closed.emit(placement)


func _close() -> void:
	if _layer != null:
		_layer.queue_free()
		_layer = null
