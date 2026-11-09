class_name Hud
extends CanvasLayer
## Everything over the 3D view, cut from cardboard and lettered in marker: the
## coin tag, the breeze, how much of the city has come down, the box (the shop)
## and the offer tag that hangs off it on a string, the crosshair and what it's on,
## the phone controls, notes (first-run hints), chain stamps, finds, toasts, popups.
## Nothing here is centred on everything else on purpose: tags sit a little crooked.

signal shop_opened
signal shop_closed

var giant
var city: CityGrid
var world
var touch: TouchControls
var touch_mode := false
var show_desktop_hint := true
var shop: ShopBox
var offers := AdOffers.new()

var root: Control
var coins_label: Label
var rate_label: Label
var coin_tag: PanelContainer
var wind: WindArrow
var boosts: VBoxContainer
var zone_label: Label
var zone_pct: Label
var zone_bar: MarkerBar
var shop_button: Button
var offer_tag: PanelContainer
var crosshair: Crosshair
var target_tag: PanelContainer
var target_label: RichTextLabel
var tool_tag: PanelContainer
var tool_label: Label
var tool_icon: TextureRect
var coach: PanelContainer
var coach_label: Label
var hint: PanelContainer
var toast_box: VBoxContainer
var chain_label: Label
var find_tag: PanelContainer
var popups: Control
var rotate_overlay: Control

var _offer_text: RichTextLabel
var _offer_bar: MarkerBar
var _offer_stamp: Label
var _offer_t := 0.0
var _refresh_t := 0.0
var _shown_coins := 0.0
var _bump := 0.0
var _find_amount := 0.0
var _find_golden := false
var _find_t := 0.0
var _find_text: RichTextLabel
var _find_icon: TextureRect
var _chain_t := 9.0
var _last_target := ""


class Crosshair:
	extends Control
	## A felt-tip circle with a dot; a scribbled ring spins round it while you burn.
	var hot := false
	var ok := true
	var spin := 0.0

	func _draw() -> void:
		var c := size * 0.5
		var col := Craft.FLAME if ok else Color(0.85, 0.82, 0.78, 0.8)
		var pts := PackedVector2Array()
		for k in 23:
			var a := TAU * k / 20.0 + 0.3
			pts.append(c + Vector2(cos(a), sin(a)) * (10.0 + sin(k * 2.1) * 0.6))
		draw_polyline(pts, Color(Craft.INK, 0.7), 5.0, true)
		draw_polyline(pts, col, 2.5, true)
		draw_circle(c, 2.6, Craft.INK)
		draw_circle(c, 1.6, col)
		if hot:
			for k in 3:
				var a0 := spin + TAU * k / 3.0
				var arc := PackedVector2Array()
				for j in 8:
					var a := a0 + j * 0.13
					arc.append(c + Vector2(cos(a), sin(a)) * (18.0 + j * 0.4))
				draw_polyline(arc, Craft.FLAME, 3.5, true)


class WindArrow:
	extends Control
	## A marker arrow showing which way the fans are blowing, relative to where you look.
	var angle := 0.0
	var strength := 0.5

	func _draw() -> void:
		var c := Vector2(size.y * 0.5, size.y * 0.5)
		var d := Vector2(sin(angle), -cos(angle))
		var side := d.orthogonal()
		var tip := c + d * 15.0
		var tail := c - d * 13.0
		draw_line(tail, tip, Craft.INK, 4.0, true)
		draw_colored_polygon(PackedVector2Array([tip + d * 3.0, tip - d * 8.0 + side * 7.0, tip - d * 8.0 - side * 7.0]), Craft.INK)
		for k in 3:
			var on := strength > 0.3 + 0.2 * k
			var x := size.y + 4.0 + k * 8.0
			var h := 6.0 + k * 4.0
			draw_line(Vector2(x, size.y * 0.5 + 8), Vector2(x, size.y * 0.5 + 8 - h), Craft.INK if on else Color(Craft.INK, 0.25), 4.0, true)


class MarkerBar:
	extends Control
	## A strip of card filled in with orange marker hatching.
	var value := 0.0
	var color := Craft.FLAME

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		draw_rect(r, Color(Craft.KRAFT_DARK, 0.55))
		var w := size.x * clampf(value, 0.0, 1.0)
		if w > 1.0:
			draw_rect(Rect2(Vector2.ZERO, Vector2(w, size.y)), Color(color, 0.35))
			var x := 2.0
			while x < w - 2.0:
				draw_line(Vector2(x, size.y - 1), Vector2(minf(x + size.y * 0.8, w), 1), color, 3.0, true)
				x += 5.0
		draw_rect(r, Craft.INK, false, 2.0)


func _ready() -> void:
	layer = 10
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = Craft.make_theme()
	add_child(root)
	_build_top()
	_build_center()
	_build_bottom()
	touch = TouchControls.new()
	root.add_child(touch)
	touch.buttons = [
		{"control": shop_button, "action": toggle_shop},
		{"control": offer_tag, "action": take_offer},
		{"control": find_tag, "action": take_find},
	]
	toast_box = VBoxContainer.new()
	toast_box.position = Vector2(16, 236)
	toast_box.size = Vector2(420, 10)
	toast_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_box.add_theme_constant_override("separation", 8)
	root.add_child(toast_box)
	popups = Control.new()
	popups.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	popups.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(popups)
	_build_rotate_overlay()
	set_touch_mode(DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
		or OS.has_feature("web_ios") or OS.has_feature("web_android"))
	Monetization.purchase_error.connect(func(_id, reason): toast("The purchase didn't go through: %s" % reason))
	Monetization.purchase_granted.connect(func(_id, text):
		Sound.play("reward", -3.0)
		toast(text)
		if shop != null:
			shop.rebuild())
	_shown_coins = GameState.coins


# =====================================================================================
# Layout
# =====================================================================================
func _panel(style: StyleBox, rot: float = 0.0) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", style)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.rotation = rot
	return p


func _build_top() -> void:
	coin_tag = _panel(Craft.card(Craft.KRAFT, 11, 1), -0.025)
	coin_tag.position = Vector2(14, 12)
	root.add_child(coin_tag)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	coin_tag.add_child(h)
	h.add_child(Craft.icon_rect("coin", 50))
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", -6)
	h.add_child(v)
	coins_label = Craft.label(40)
	coins_label.custom_minimum_size = Vector2(130, 0)
	v.add_child(coins_label)
	rate_label = Craft.label(20, Craft.INK, Craft.hand())
	v.add_child(rate_label)
	coins_label.pivot_offset = Vector2(0, 26)

	var wt := _panel(Craft.paper(12), 0.03)
	wt.position = Vector2(26, 104)
	root.add_child(wt)
	var wh := HBoxContainer.new()
	wh.add_theme_constant_override("separation", 6)
	wt.add_child(wh)
	wh.add_child(Craft.icon_rect("fan", 30))
	wind = WindArrow.new()
	wind.custom_minimum_size = Vector2(66, 34)
	wind.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wh.add_child(wind)
	boosts = VBoxContainer.new()
	boosts.position = Vector2(18, 160)
	boosts.add_theme_constant_override("separation", 6)
	boosts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(boosts)

	var zt := _panel(Craft.card(Craft.KRAFT_PALE, 13, 0), 0.012)
	zt.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	zt.offset_left = -215
	zt.offset_right = 215
	zt.offset_top = 12
	zt.grow_horizontal = Control.GROW_DIRECTION_BOTH
	root.add_child(zt)
	var zv := VBoxContainer.new()
	zv.add_theme_constant_override("separation", 2)
	zt.add_child(zv)
	var zh := HBoxContainer.new()
	zv.add_child(zh)
	zone_label = Craft.label(24)
	zone_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zh.add_child(zone_label)
	zone_pct = Craft.label(20, Craft.INK, Craft.hand())
	zh.add_child(zone_pct)
	zone_bar = MarkerBar.new()
	zone_bar.custom_minimum_size = Vector2(390, 14)
	zone_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	zv.add_child(zone_bar)

	shop_button = Button.new()
	shop_button.text = "Shop"
	shop_button.icon = Craft.icon("box")
	shop_button.expand_icon = false
	Craft.tag_button(shop_button, Craft.KRAFT, 30, 14)
	(shop_button.get_theme_stylebox("normal") as CardStyle).tape_corners = 3
	shop_button.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	shop_button.offset_left = -214
	shop_button.offset_right = -16
	shop_button.offset_top = 12
	shop_button.offset_bottom = 82
	shop_button.rotation = 0.03
	shop_button.pressed.connect(toggle_shop)
	root.add_child(shop_button)
	_build_offer_tag()


func _build_offer_tag() -> void:
	## Hangs off the shop button on a string now and then: a free reward for a short
	## ad, naming what it gets you. Tap it (or press B).
	offer_tag = _panel(Craft.paper(15, 0, true))
	offer_tag.anchor_left = 1.0
	offer_tag.anchor_right = 1.0
	offer_tag.offset_left = -360
	offer_tag.offset_right = -22
	offer_tag.offset_top = 104
	offer_tag.mouse_filter = Control.MOUSE_FILTER_STOP
	offer_tag.visible = false
	offer_tag.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT \
				and e.device != InputEvent.DEVICE_ID_EMULATION:
			take_offer())
	root.add_child(offer_tag)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	offer_tag.add_child(v)
	_offer_text = Craft.rich(23)
	_offer_text.custom_minimum_size = Vector2(290, 0)
	v.add_child(_offer_text)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(h)
	_offer_bar = MarkerBar.new()
	_offer_bar.custom_minimum_size = Vector2(0, 12)
	_offer_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_offer_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_offer_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(_offer_bar)
	h.add_child(Craft.icon_rect("tv", 30))
	_offer_stamp = Craft.label(22, Craft.RED_INK)
	h.add_child(_offer_stamp)


func _build_center() -> void:
	crosshair = Crosshair.new()
	crosshair.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	crosshair.offset_left = -30
	crosshair.offset_right = 30
	crosshair.offset_top = -30
	crosshair.offset_bottom = 30
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(crosshair)
	target_tag = _panel(Craft.paper(16), -0.015)
	target_tag.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	target_tag.offset_left = -16
	target_tag.offset_top = 34
	target_tag.grow_horizontal = Control.GROW_DIRECTION_BOTH
	target_tag.visible = false
	root.add_child(target_tag)
	target_label = Craft.rich(21)
	target_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	target_tag.add_child(target_label)

	coach = _panel(Craft.paper(17, 2), -0.012)
	coach.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	coach.offset_left = -300
	coach.offset_right = 300
	coach.offset_top = 96
	coach.grow_horizontal = Control.GROW_DIRECTION_BOTH
	coach.visible = false
	root.add_child(coach)
	coach_label = Craft.body(25)
	coach_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	coach.add_child(coach_label)

	chain_label = Craft.label(68, Craft.RED_INK, null, 14, Craft.PAPER)
	chain_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	chain_label.offset_left = 120
	chain_label.offset_right = 520
	chain_label.offset_top = -170
	chain_label.offset_bottom = -90
	chain_label.visible = false
	root.add_child(chain_label)

	hint = _panel(Craft.paper(18, 1), 0.01)
	hint.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	hint.offset_left = -330
	hint.offset_right = 330
	hint.offset_top = 150
	hint.grow_horizontal = Control.GROW_DIRECTION_BOTH
	root.add_child(hint)
	var hl := Craft.body(22)
	hl.text = "Click to play.  Mouse looks, WASD walks, hold the left button to burn, Space jumps.\nE opens the box, B takes an offer, M mutes, Esc lets go of the mouse."
	hint.add_child(hl)


func _build_bottom() -> void:
	tool_tag = _panel(Craft.card(Craft.KRAFT, 19), 0.015)
	tool_tag.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	tool_tag.offset_left = -150
	tool_tag.offset_right = 150
	tool_tag.offset_top = -62
	tool_tag.offset_bottom = -14
	tool_tag.grow_horizontal = Control.GROW_DIRECTION_BOTH
	tool_tag.grow_vertical = Control.GROW_DIRECTION_BEGIN
	root.add_child(tool_tag)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	h.alignment = BoxContainer.ALIGNMENT_CENTER
	tool_tag.add_child(h)
	tool_icon = Craft.icon_rect("magnifier", 34)
	h.add_child(tool_icon)
	tool_label = Craft.label(23)
	h.add_child(tool_label)

	find_tag = _panel(Craft.paper(20, 0, true), -0.02)
	find_tag.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	find_tag.offset_left = -230
	find_tag.offset_right = 230
	find_tag.offset_top = -168
	find_tag.offset_bottom = -80
	find_tag.grow_horizontal = Control.GROW_DIRECTION_BOTH
	find_tag.mouse_filter = Control.MOUSE_FILTER_STOP
	find_tag.visible = false
	find_tag.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT \
				and e.device != InputEvent.DEVICE_ID_EMULATION:
			take_find())
	root.add_child(find_tag)
	var fh := HBoxContainer.new()
	fh.add_theme_constant_override("separation", 10)
	fh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	find_tag.add_child(fh)
	_find_icon = Craft.icon_rect("ticket", 56)
	fh.add_child(_find_icon)
	_find_text = Craft.rich(22)
	_find_text.custom_minimum_size = Vector2(340, 0)
	fh.add_child(_find_text)


func _build_rotate_overlay() -> void:
	var cr := ColorRect.new()
	cr.color = Craft.STEEL.darkened(0.4)
	cr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cr.mouse_filter = Control.MOUSE_FILTER_STOP
	cr.visible = false
	root.add_child(cr)
	rotate_overlay = cr
	var p := _panel(Craft.card(Craft.KRAFT, 21, 2), -0.03)
	p.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	p.grow_horizontal = Control.GROW_DIRECTION_BOTH
	p.grow_vertical = Control.GROW_DIRECTION_BOTH
	cr.add_child(p)
	var l := Craft.label(40)
	l.text = "Turn your phone\nsideways to play"
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p.add_child(l)


func set_touch_mode(on: bool) -> void:
	touch_mode = on
	touch.visible = on and shop == null
	for b in touch.buttons:
		(b.control as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE if on else Control.MOUSE_FILTER_STOP
	tool_tag.visible = not on


func is_blocking() -> bool:
	return shop != null or popups.get_child_count() > 0


# =====================================================================================
# Per frame
# =====================================================================================
func _process(delta: float) -> void:
	var vp := root.get_viewport_rect().size
	rotate_overlay.visible = touch_mode and vp.x < vp.y
	if giant == null:
		return
	crosshair.hot = giant.firing
	crosshair.spin = fmod(crosshair.spin + delta * 7.0, TAU)
	crosshair.queue_redraw()
	var diff := GameState.coins - _shown_coins
	if absf(diff) > 0.5:
		_shown_coins += diff * minf(1.0, delta * 8.0)
		if diff > 0.0:
			_bump = minf(1.0, _bump + delta * clampf(diff / maxf(_shown_coins, 40.0) * 6.0, 0.0, 3.0))
	else:
		_shown_coins = GameState.coins
	_bump = move_toward(_bump, 0.0, delta * 1.6)
	coins_label.scale = Vector2.ONE * (1.0 + 0.16 * _bump)
	coins_label.text = Fmt.num(_shown_coins)
	_update_offer(delta)
	_update_find(delta)
	_update_chain(delta)
	_refresh_t += delta
	if _refresh_t >= 0.15:
		_refresh_t = 0.0
		_refresh()


func _refresh() -> void:
	var rate := GameState.income_per_second_now()
	rate_label.text = "+%s a second" % Fmt.num(rate) if rate > 0.05 else "light something"
	if city != null:
		var z := Balance.zone_for_cell(clampi(int((giant.position.x - city.origin.x) / Balance.CELL), 0, city.n - 1),
			clampi(int((giant.position.z - city.origin.y) / Balance.CELL), 0, city.n - 1))
		zone_label.text = Balance.ZONES[z].name
		zone_pct.text = "%d%% down" % int(city.progress() * 100.0)
		zone_bar.value = city.progress()
		zone_bar.queue_redraw()
		var fwd := Vector2(-sin(giant.yaw), -cos(giant.yaw))
		var right := Vector2(cos(giant.yaw), -sin(giant.yaw))
		wind.angle = atan2(city.wind.dot(right), city.wind.dot(fwd))
		wind.strength = city.wind_strength
		wind.queue_redraw()
	_refresh_boosts()
	var td := GameState.tool_def()
	tool_label.text = str(td.name)
	tool_icon.texture = Craft.icon(str(td.key))
	_update_target()
	var free := not is_blocking()
	shop_button.visible = free
	hint.visible = not touch_mode and free and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and show_desktop_hint
	touch.heat_ok = crosshair.ok


func _refresh_boosts() -> void:
	var want: Array = []
	if GameState.is_boost_active():
		want.append(["flame", "2x fire  " + Fmt.duration(GameState.boost_seconds_left())])
	if GameState.is_helper_rush_active():
		want.append(["windup", "helpers 3x  " + Fmt.duration(GameState.helper_rush_seconds_left())])
	if GameState.owns_remove_ads_2x:
		want.append(["noads", "2x for good"])
	while boosts.get_child_count() > want.size():
		var c := boosts.get_child(boosts.get_child_count() - 1)
		boosts.remove_child(c)
		c.queue_free()
	while boosts.get_child_count() < want.size():
		var p := _panel(Craft.paper(30 + boosts.get_child_count()), -0.02 + 0.03 * boosts.get_child_count())
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 6)
		p.add_child(h)
		h.add_child(Craft.icon_rect("flame", 26))
		h.add_child(Craft.label(19))
		boosts.add_child(p)
	for k in want.size():
		var h := boosts.get_child(k).get_child(0)
		(h.get_child(0) as TextureRect).texture = Craft.icon(want[k][0])
		(h.get_child(1) as Label).text = want[k][1]


func _update_target() -> void:
	if city == null:
		return
	var s: int = giant.aim.sid
	var text := ""
	var ok := true
	if s >= 0:
		var def: Dictionary = Balance.KINDS[city.s_kind[s]]
		var st := city.s_state[s]
		if st == CityGrid.BURNING:
			text = "%s, burning" % def.name
		elif st == CityGrid.STANDING:
			var power := GameState.tool_power()
			if city.can_light(s, power):
				text = "%s  [coin]%s" % [def.name, Fmt.num(float(def.coins) * GameState.coin_mult())]
				if city.is_truck(s):
					text += "  (it squirts water at fires near it)"
			else:
				ok = false
				var why := ""
				if city.s_wet[s] > 0.0:
					why = " (wet)"
				elif city.s_thresh[s] > float(def.ignite) * 1.5:
					why = " (damp)"
				var need := _tool_for(city.threshold(s))
				text = "%s%s: too thick" % [def.name, why]
				if need != "":
					text += ", needs the %s" % need.to_lower()
	elif not giant.aim.in_range and giant.aim.hit:
		text = "Too far. Walk closer"
		ok = false
	crosshair.ok = ok
	if text != _last_target:
		_last_target = text
		target_label.text = Craft.coins_bb(text, 22)
		target_tag.visible = text != ""
		target_tag.reset_size()
		target_tag.offset_left = -target_tag.size.x * 0.5


func _tool_for(thresh: float) -> String:
	for i in range(GameState.tool_index + 1, Balance.TOOLS.size()):
		if float(Balance.TOOLS[i].power) * GameState.upgrade_mult("heat") * 0.97 >= thresh:
			return str(Balance.TOOLS[i].name)
	return ""


func set_coach(text: String) -> void:
	var show := text != "" and not is_blocking()
	if show and not coach.visible:
		coach.modulate.a = 0.0
		coach.create_tween().tween_property(coach, "modulate:a", 1.0, 0.3)
	coach.visible = show
	if coach_label.text != text:
		coach_label.text = text


# =====================================================================================
# Chains, toasts
# =====================================================================================
const CHAIN_STAMPS := [3, 5, 8, 12, 20, 30, 50]


func show_chain(n: int) -> void:
	## Stamped only as a chain reaches a milestone (a big fire is one endless chain).
	if not CHAIN_STAMPS.has(n):
		return
	chain_label.text = "chain x%d" % n
	chain_label.visible = true
	chain_label.pivot_offset = Vector2(140, 40)
	_chain_t = 0.0


func _update_chain(delta: float) -> void:
	if not chain_label.visible:
		return
	_chain_t += delta
	# Stamped on: in big and crooked, settles, then fades out.
	var u := minf(1.0, _chain_t / 0.22)
	var e := 1.0 - pow(1.0 - u, 3.0)
	chain_label.scale = Vector2.ONE * lerpf(1.7, 1.0, e)
	chain_label.rotation = lerpf(-0.35, -0.08, e)
	chain_label.modulate.a = 1.0 - clampf((_chain_t - 1.4) / 0.4, 0.0, 1.0)
	if _chain_t > 1.8:
		chain_label.visible = false


func toast(text: String) -> void:
	var p := _panel(Craft.paper(40 + toast_box.get_child_count()), randf_range(-0.02, 0.02))
	p.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	var l := Craft.rich(22)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	l.text = Craft.coins_bb(text, 22)
	p.add_child(l)
	toast_box.add_child(p)
	while toast_box.get_child_count() > 3:
		var old := toast_box.get_child(0)
		toast_box.remove_child(old)
		old.queue_free()
	p.modulate.a = 0.0
	var tw := p.create_tween()
	tw.tween_property(p, "modulate:a", 1.0, 0.18)
	tw.tween_interval(2.8)
	tw.tween_property(p, "modulate:a", 0.0, 0.45)
	tw.tween_callback(p.queue_free)


# =====================================================================================
# The shop box
# =====================================================================================
func toggle_shop() -> void:
	if shop != null:
		close_shop()
	elif not is_blocking():
		open_shop()


func open_shop(tab: String = "") -> void:
	if shop != null:
		return
	Sound.play("box_open", -2.0)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	giant.input_enabled = false
	giant.firing = false
	touch.release_all()
	touch.visible = false
	offer_tag.visible = false
	coach.visible = false
	shop = ShopBox.new()
	shop.hud = self
	if tab != "":
		shop.tab = tab
	shop.closed.connect(close_shop)
	root.add_child(shop)
	root.move_child(shop, popups.get_index())
	shop_opened.emit()


func close_shop() -> void:
	if shop == null:
		return
	Sound.play("box_close", -3.0)
	shop.queue_free()
	shop = null
	if popups.get_child_count() == 0:
		giant.input_enabled = true
		touch.visible = touch_mode
	if offers.current != "":
		offer_tag.visible = true
	GameState.save_game()
	shop_closed.emit()


# =====================================================================================
# Rewarded ads and the offer tag
# =====================================================================================
func _update_offer(delta: float) -> void:
	var playing: bool = not is_blocking() and giant.input_enabled and not Monetization.is_watching()
	match offers.update(delta, playing):
		1:
			_show_offer_tag()
		-1:
			_hide_offer_tag()
	if offers.current == "" or not offer_tag.visible:
		return
	offer_tag.visible = playing or offers.watching
	_offer_t += delta
	var text := Craft.coins_bb(AdOffers.headline(offers.current), 24)
	if _offer_text.text != text:
		_offer_text.text = text
	var stamp := "watch" if touch_mode else "B to watch"
	if _offer_stamp.text != stamp:
		_offer_stamp.text = stamp
	_offer_bar.value = offers.time_left / Balance.OFFER_LIFETIME
	_offer_bar.queue_redraw()
	# It swings gently on its string.
	offer_tag.pivot_offset = Vector2(16, offer_tag.size.y * 0.5)
	offer_tag.rotation = sin(_offer_t * 1.7) * 0.035


func _show_offer_tag() -> void:
	Sound.play("offer", -6.0)
	_offer_t = 0.0
	offer_tag.visible = true
	offer_tag.modulate.a = 0.0
	offer_tag.offset_top = 60
	var tw := offer_tag.create_tween()
	tw.set_parallel(true)
	tw.tween_property(offer_tag, "modulate:a", 1.0, 0.25)
	tw.tween_property(offer_tag, "offset_top", 104.0, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _hide_offer_tag() -> void:
	if not offer_tag.visible:
		return
	var tw := offer_tag.create_tween()
	tw.tween_property(offer_tag, "modulate:a", 0.0, 0.4)
	tw.tween_callback(func():
		if offers.current == "":
			offer_tag.visible = false)


func take_offer() -> void:
	if offers.current == "" or offers.watching or is_blocking():
		return
	watch_ad(offers.current)


func watch_ad(kind: String) -> void:
	if Monetization.is_watching():
		return
	if not Monetization.is_rewarded_ready(str(Balance.AD_REWARDS[kind].placement)):
		toast("No ad ready right now. Try again in a bit")
		return
	var from_offer := kind == offers.current
	if from_offer:
		offers.watching = true
	giant.input_enabled = false
	giant.firing = false
	touch.release_all()
	Monetization.watch_for_reward(kind, func(ok: bool, text: String):
		if from_offer:
			offers.watching = false
			if ok:
				offers.taken()
				_hide_offer_tag()
		if not is_blocking():
			giant.input_enabled = true
		if ok:
			Sound.play("reward", -3.0)
		toast(text if ok else "No reward this time")
		if shop != null:
			shop.refresh())


# =====================================================================================
# Finds
# =====================================================================================
func show_find(key: String, golden: bool, amount: float) -> void:
	var name := "A golden ticket"
	for f in Balance.FINDS:
		if f.key == key:
			name = str(f.name)
	if not golden:
		toast("%s. +[coin]%s" % [name, Fmt.num(amount)])
		return
	_find_amount = amount
	_find_golden = true
	_find_t = 9.0
	_find_icon.texture = Craft.icon("ticket")
	find_tag.visible = true
	find_tag.modulate.a = 1.0


func _update_find(delta: float) -> void:
	if not find_tag.visible:
		return
	if not is_blocking():
		_find_t -= delta
	var how := "Tap" if touch_mode else "Click or press G"
	_find_text.text = Craft.coins_bb("[b]A golden ticket.[/b] +[coin]%s\n%s to watch an ad and double it (%d)" % [
		Fmt.num(_find_amount), how, int(ceil(_find_t))], 22)
	if _find_t <= 0.0 or is_blocking():
		find_tag.visible = _find_t > 0.0 and not is_blocking()


func take_find() -> void:
	if not find_tag.visible or Monetization.is_watching() or is_blocking():
		return
	find_tag.visible = false
	var amount := _find_amount
	giant.input_enabled = false
	giant.firing = false
	touch.release_all()
	Monetization.show_rewarded(Monetization.PLACEMENT_DOUBLE_FIND, func(ok: bool):
		if not is_blocking():
			giant.input_enabled = true
		if ok:
			GameState.grant_coins(amount)
			Sound.play("reward", -3.0)
			toast("Doubled. +[coin]%s" % Fmt.num(amount))
		else:
			toast("No reward this time"))


# =====================================================================================
# Popups
# =====================================================================================
func _popup(title: String, body: String, icon: String = "") -> Dictionary:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	giant.input_enabled = false
	giant.firing = false
	touch.release_all()
	touch.visible = false
	var dim := ColorRect.new()
	dim.color = Color(0.08, 0.09, 0.11, 0.62)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	popups.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.add_child(center)
	var panel := _panel(Craft.card(Craft.KRAFT, 50, 2), -0.012)
	panel.custom_minimum_size = Vector2(600, 0)
	(panel.get_theme_stylebox("panel") as CardStyle).content_margin_left = 34
	(panel.get_theme_stylebox("panel") as CardStyle).content_margin_right = 34
	(panel.get_theme_stylebox("panel") as CardStyle).content_margin_top = 26
	(panel.get_theme_stylebox("panel") as CardStyle).content_margin_bottom = 24
	center.add_child(panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	panel.add_child(v)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	v.add_child(head)
	if icon != "":
		head.add_child(Craft.icon_rect(icon, 64))
	var t := Craft.label(42)
	t.text = title
	head.add_child(t)
	var b := Craft.rich(24)
	b.text = Craft.coins_bb(body, 24)
	b.custom_minimum_size = Vector2(530, 0)
	v.add_child(b)
	panel.pivot_offset = Vector2(300, 150)
	panel.scale = Vector2(0.85, 0.85)
	panel.create_tween().tween_property(panel, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	return {"root": dim, "box": v}


func _popup_button(p: Dictionary, text: String, fill: Color, cb: Callable, icon: String = "") -> Button:
	var btn := Button.new()
	btn.text = text
	if icon != "":
		btn.icon = Craft.icon(icon)
	btn.custom_minimum_size = Vector2(0, 64)
	Craft.tag_button(btn, fill, 26, 60 + p.box.get_child_count())
	btn.pressed.connect(cb)
	p.box.add_child(btn)
	return btn


func close_popup(p: Dictionary) -> void:
	var r: Control = p.root
	popups.remove_child(r)
	r.queue_free()
	if popups.get_child_count() == 0 and shop == null:
		giant.input_enabled = true
		touch.visible = touch_mode


func show_starter_offer() -> void:
	var p := _popup("A box of matches",
		"The starter pack: +[coin]%s coins right away, and party sparks: every tool throws sparks in all the colours of a felt-tip set. Only offered once." % Fmt.num(Balance.STARTER_COINS), "gift")
	_popup_button(p, "Get it for %s" % Monetization.price(Monetization.PRODUCT_STARTER), Craft.FLAME, func():
		close_popup(p)
		Monetization.buy(Monetization.PRODUCT_STARTER), "gift")
	_popup_button(p, "Not now", Craft.KRAFT_PALE, func(): close_popup(p))


func show_ending() -> void:
	var body := "The keep is down, and with it the last of the cardboard city. The warehouse is quiet again, apart from the fans.\n\n%s played\n[coin]%s coins earned\n%d buildings brought down (longest chain: %d)\n%d paper people hopped to safety\n%d finds in the boxes" % [
		Fmt.duration(GameState.play_time), Fmt.num(GameState.lifetime_coins), GameState.collapses, GameState.best_chain,
		GameState.citizens_saved, _count_finds()]
	var p := _popup("That's the lot", body, "castle")
	_popup_button(p, "Walk around the ashes", Craft.KRAFT_PALE, func(): close_popup(p))


func _count_finds() -> int:
	var n := 0
	for k in GameState.finds:
		n += int(GameState.finds[k])
	return n
