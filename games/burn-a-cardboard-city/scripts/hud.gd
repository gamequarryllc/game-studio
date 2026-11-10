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
var hud_box: Control                  # holds every HUD piece (not the popups, the box or the touch controls)
var coins_label: Label
var rate_label: Label
var coin_tag: PanelContainer
var wind: WindRibbon
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
var toast_box: Control
var opened_links: Array[String] = []
var chain_label: Label
var find_tag: PanelContainer
var popups: Control
var rotate_overlay: Control
var floats_layer: Control             # the coin numbers that pop off burning buildings (World fills it)

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
	var focus := 0.0

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
		if hot and focus > 0.01 and focus < 0.999:
			# The tool gathering its heat: a marker ring filling round the crosshair.
			draw_arc(c, 16.0, -PI * 0.5, -PI * 0.5 + TAU * focus, 28, Color(Craft.INK, 0.55), 6.0, true)
			draw_arc(c, 16.0, -PI * 0.5, -PI * 0.5 + TAU * focus, 28, Craft.FLAME, 3.5, true)
		elif hot:
			for k in 3:
				var a0 := spin + TAU * k / 3.0
				var arc := PackedVector2Array()
				for j in 8:
					var a := a0 + j * 0.13
					arc.append(c + Vector2(cos(a), sin(a)) * (18.0 + j * 0.4))
				draw_polyline(arc, Craft.FLAME, 3.5, true)


class WindRibbon:
	extends Control
	## The breeze: a desk fan drawn in marker in the middle of its paper tag, a striped
	## ribbon tied to its guard streaming the way the wind blows (relative to where you
	## look; longer and livelier the harder it blows), and the breeze written underneath.
	var angle := 0.0
	var strength := 0.5
	var t := 0.0

	static func words(k: float) -> String:
		if k < 0.45:
			return "light breeze"
		if k < 0.68:
			return "steady breeze"
		return "strong wind"

	func _draw() -> void:
		var c := Vector2(size.x * 0.5, size.y * 0.39)
		var r := size.y * 0.27
		# The fan: a stand, a guard, three blades turning with the wind.
		draw_line(c + Vector2(0, r), c + Vector2(0, r + 8), Craft.INK, 3.5, true)
		draw_line(c + Vector2(-12, r + 8), c + Vector2(12, r + 8), Craft.INK, 3.5, true)
		draw_circle(c, r, Color("#dfe4e6"))
		for k in 3:
			var a := t * (2.0 + strength * 10.0) + TAU * k / 3.0
			var p0 := c + Vector2(cos(a), sin(a)) * 2.5
			var p1 := c + Vector2(cos(a + 0.55), sin(a + 0.55)) * r * 0.88
			var p2 := c + Vector2(cos(a - 0.2), sin(a - 0.2)) * r * 0.88
			draw_colored_polygon(PackedVector2Array([p0, p1, p2]), Color("#6f8090"))
		draw_arc(c, r, 0, TAU, 28, Craft.INK, 3.0, true)
		draw_circle(c, 3.0, Craft.INK)
		# The ribbon, tied to the middle of the guard, streaming downwind over everything
		# (it may run a little past the tag's edge rather than shrink to nothing).
		var d := Vector2(sin(angle), -cos(angle))
		var side := d.orthogonal()
		var root := c
		var length := 36.0 + strength * 64.0
		var room := 999.0
		if absf(d.x) > 0.01:
			room = minf(room, ((size.x + 8.0 - root.x) if d.x > 0.0 else (root.x + 8.0)) / absf(d.x))
		if absf(d.y) > 0.01:
			room = minf(room, ((size.y + 6.0 - root.y) if d.y > 0.0 else (root.y + 8.0)) / absf(d.y))
		length = clampf(minf(length, room), 30.0, 110.0)
		var n := 14
		var pts_a := PackedVector2Array()
		var pts_b := PackedVector2Array()
		for k in n + 1:
			var u := float(k) / n
			var wave := sin(t * (5.0 + strength * 9.0) - u * 6.5) * (1.5 + 6.0 * u) * (0.4 + strength)
			var p := root + d * length * u + side * wave
			var w := 10.0 * (1.0 - u * 0.35)
			pts_a.append(p + side * w * 0.5)
			pts_b.append(p - side * w * 0.5)
		var poly := pts_a.duplicate()
		for k in range(pts_b.size() - 1, -1, -1):
			poly.append(pts_b[k])
		draw_colored_polygon(poly, Craft.RED_INK)
		for k in range(3, n, 3):
			draw_line(pts_a[k], pts_b[k], Color(Craft.PAPER, 0.9), 3.0, true)
		draw_polyline(pts_a, Craft.INK, 2.0, true)
		draw_polyline(pts_b, Craft.INK, 2.0, true)
		draw_circle(c, 5.0, Craft.INK)
		# The breeze, in words.
		var f := Craft.hand()
		var wd := words(strength)
		var ws := f.get_string_size(wd, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
		draw_string(f, Vector2((size.x - ws) * 0.5, size.y - 4.0), wd, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Craft.INK)


class MarkerBar:
	extends Control
	## A strip of card filled in with orange marker hatching.
	var value := 0.0
	var color := Craft.FLAME
	var gate := -1.0              # a notch where the next tool goes on sale
	var gate_icon: Texture2D      # ...and that tool's icon, drawn on the notch

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
		if gate > 0.0:
			var gx := size.x * gate
			draw_line(Vector2(gx, -5), Vector2(gx, size.y + 5), Craft.INK, 3.0, true)
			if gate_icon != null:
				draw_circle(Vector2(gx, size.y * 0.5), 13.0, Craft.PAPER)
				draw_arc(Vector2(gx, size.y * 0.5), 13.0, 0, TAU, 20, Craft.INK, 2.0, true)
				draw_texture_rect(gate_icon, Rect2(Vector2(gx - 10, size.y * 0.5 - 10), Vector2(20, 20)), false)
			else:
				draw_colored_polygon(PackedVector2Array([Vector2(gx - 6, -9), Vector2(gx + 6, -9), Vector2(gx, -2)]), Craft.INK)


class Matchbox:
	extends Control
	## The starter pack, as a real box of matches: a printed sleeve with striker strips,
	## and a drawer that slides out to show the matches and a bundle of coins inside.
	## The price tag hangs off the drawer on a string.
	var open := 0.0
	var t := 0.0
	var sleeve := Rect2()
	var drawer_out := 0.0         # pixels the drawer has slid out, set from `open`
	var tag_hole := Vector2.ZERO  # where the string ties onto the price tag

	func _draw() -> void:
		var sl := sleeve
		drawer_out = sl.size.x * 0.62 * open
		var dr := Rect2(sl.position + Vector2(drawer_out + 6, 8), sl.size - Vector2(12, 16))
		# The drawer (behind the sleeve): a tray of lighter card, matches in a row.
		draw_rect(Rect2(dr.position + Vector2(4, 6), dr.size), Color(0, 0, 0, 0.3))
		draw_rect(dr, Color("#e6d2a6"))
		var inner := dr.grow(-8)
		draw_rect(inner, Color("#b9915e"))
		var r := RandomNumberGenerator.new()
		r.seed = 7
		for k in 13:
			var y := inner.position.y + 8.0 + k * (inner.size.y - 16.0) / 12.0
			var x0 := inner.position.x + 30.0 + r.randf_range(-4, 4)
			var x1 := inner.end.x - 54.0 + r.randf_range(-6, 6)
			draw_line(Vector2(x0, y), Vector2(x1, y), Color("#f0dcb4"), 5.0, true)
			draw_line(Vector2(x0, y + 2), Vector2(x1, y + 2), Color("#c9a873"), 1.5, true)
			draw_circle(Vector2(x1 + 4, y), 5.5, Color("#c23a2b"))
			draw_circle(Vector2(x1 + 3, y - 1.5), 2.0, Color("#e2675a"))
		var coin := Craft.icon("coin")
		for k in 5:
			var p := Vector2(inner.end.x - 44.0 - k * 15.0, inner.position.y + inner.size.y * (0.18 + 0.12 * (k % 3)))
			draw_texture_rect(coin, Rect2(p, Vector2(40, 40)), false)
		draw_rect(dr, Craft.INK, false, 2.0)
		# The string from the drawer's end to the tag.
		var knot := Vector2(dr.end.x - 10, dr.position.y + dr.size.y * 0.5)
		if open > 0.05:
			var sag := 26.0 + sin(t * 2.0) * 3.0
			var pts := PackedVector2Array()
			for k in 13:
				var u := k / 12.0
				pts.append(knot.lerp(tag_hole, u) + Vector2(0, sin(u * PI) * sag))
			draw_polyline(pts, Color("#7a6248"), 2.5, true)
		# The sleeve: printed card, a red label, striker strips top and bottom.
		draw_rect(Rect2(sl.position + Vector2(6, 8), sl.size), Color(0, 0, 0, 0.32))
		draw_rect(sl, Color("#efe4c8"))
		var band := Rect2(sl.position + Vector2(0, sl.size.y * 0.2), Vector2(sl.size.x, sl.size.y * 0.6))
		draw_rect(band, Color("#c4412f"))
		draw_rect(band.grow(-7), Color("#c4412f").darkened(0.18), false, 2.0)
		for side in [0.0, 1.0]:
			var st := Rect2(sl.position + Vector2(0, side * (sl.size.y - 16.0)), Vector2(sl.size.x, 16))
			draw_rect(st, Color("#5a3a2a"))
			for k in int(sl.size.x / 5.0):
				var x := st.position.x + k * 5.0 + r.randf() * 3.0
				draw_line(Vector2(x, st.position.y + 3), Vector2(x + 2, st.end.y - 3), Color("#7a5440"), 1.0)
		var fl := Craft.icon("flame")
		draw_texture_rect(fl, Rect2(band.position + Vector2(14, band.size.y * 0.14), Vector2(band.size.y * 0.72, band.size.y * 0.72)), false)
		var f := Craft.stencil()
		draw_string(f, band.position + Vector2(band.size.y * 0.86 + 12, band.size.y * 0.52), "STARTER", HORIZONTAL_ALIGNMENT_LEFT, -1, 40, Color("#f7ecd0"))
		draw_string(f, band.position + Vector2(band.size.y * 0.86 + 14, band.size.y * 0.84), "SAFETY MATCHES - 50", HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color("#f7ecd0"))
		draw_rect(sl, Craft.INK, false, 2.5)


class Vignette:
	extends Control
	## The foreground sits darker: a soft shade up from the bottom of the screen and in from
	## the sides, so the eye goes to the middle and the controls stand off the floor.
	func _draw() -> void:
		var w := size.x
		var h := size.y
		var clear := Color(0.03, 0.03, 0.04, 0.0)
		var dark := Color(0.03, 0.03, 0.04, 0.34)
		draw_polygon(PackedVector2Array([Vector2(0, h * 0.58), Vector2(w, h * 0.58), Vector2(w, h), Vector2(0, h)]),
			PackedColorArray([clear, clear, dark, dark]))
		var side := Color(0.03, 0.03, 0.04, 0.16)
		draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(w * 0.14, 0), Vector2(w * 0.14, h), Vector2(0, h)]),
			PackedColorArray([side, clear, clear, side]))
		draw_polygon(PackedVector2Array([Vector2(w * 0.86, 0), Vector2(w, 0), Vector2(w, h), Vector2(w * 0.86, h)]),
			PackedColorArray([clear, side, side, clear]))


class Scribble:
	extends Button
	## "not now", written small with a pen and underlined twice.
	func _draw() -> void:
		var w := size.x
		var y := size.y - 6.0
		draw_polyline(PackedVector2Array([Vector2(6, y), Vector2(w * 0.5, y + 2), Vector2(w - 6, y - 1)]), Color(Craft.INK, 0.7), 2.0, true)
		draw_polyline(PackedVector2Array([Vector2(12, y + 5), Vector2(w - 14, y + 3)]), Color(Craft.INK, 0.5), 1.5, true)


func _ready() -> void:
	layer = 10
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = Craft.make_theme()
	add_child(root)
	var vig := Vignette.new()
	vig.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(vig)
	# Every HUD piece lives in hud_box, so an offer or the ending can take the whole
	# HUD away in one go (it used to show through the starter offer and collide with it).
	hud_box = Control.new()
	hud_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud_box)
	floats_layer = Control.new()
	floats_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	floats_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_box.add_child(floats_layer)
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
	toast_box = Control.new()
	toast_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
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
	Monetization.restore_done.connect(func(found: int, error: String):
		if error != "":
			toast("Couldn't bring them back: %s" % error)
		elif found == 0:
			toast("The store has nothing to bring back for this account")
		else:
			toast("Brought back %d %s" % [found, "purchase" if found == 1 else "purchases"])
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
	hud_box.add_child(coin_tag)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	coin_tag.add_child(h)
	h.add_child(Craft.icon_rect("coin", 50))
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", -6)
	h.add_child(v)
	coins_label = Craft.label(40, Craft.INK, Craft.marker())
	coins_label.custom_minimum_size = Vector2(130, 0)
	v.add_child(coins_label)
	rate_label = Craft.label(23, Craft.INK, Craft.hand())
	v.add_child(rate_label)
	coins_label.pivot_offset = Vector2(0, 26)

	var wt := _panel(Craft.paper(12), 0.03)
	wt.position = Vector2(26, 104)
	hud_box.add_child(wt)
	var wh := HBoxContainer.new()
	wh.add_theme_constant_override("separation", 6)
	wt.add_child(wh)
	wind = WindRibbon.new()
	wind.custom_minimum_size = Vector2(206, 104)
	wind.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wh.add_child(wind)
	boosts = VBoxContainer.new()
	boosts.position = Vector2(18, 228)
	boosts.add_theme_constant_override("separation", 6)
	boosts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_box.add_child(boosts)

	var zt := _panel(Craft.card(Craft.KRAFT_PALE, 13, 0), 0.012)
	zt.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	zt.offset_left = -235
	zt.offset_right = 235
	zt.offset_top = 12
	zt.grow_horizontal = Control.GROW_DIRECTION_BOTH
	hud_box.add_child(zt)
	var zv := VBoxContainer.new()
	zv.add_theme_constant_override("separation", 2)
	zt.add_child(zv)
	var zh := HBoxContainer.new()
	zv.add_child(zh)
	zone_label = Craft.label(23)
	zone_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zh.add_child(zone_label)
	zone_pct = Craft.label(23, Craft.INK, Craft.hand())
	zh.add_child(zone_pct)
	zone_bar = MarkerBar.new()
	zone_bar.custom_minimum_size = Vector2(390, 16)
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
	hud_box.add_child(shop_button)
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
	hud_box.add_child(offer_tag)
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
	hud_box.add_child(crosshair)
	target_tag = _panel(Craft.paper(16), -0.015)
	target_tag.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	target_tag.offset_left = -16
	target_tag.offset_top = 34
	target_tag.grow_horizontal = Control.GROW_DIRECTION_BOTH
	target_tag.visible = false
	hud_box.add_child(target_tag)
	target_label = Craft.rich(24)
	target_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	target_tag.add_child(target_label)

	coach = _panel(Craft.paper(17, 2), -0.012)
	coach.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	coach.offset_left = -310
	coach.offset_right = 310
	coach.offset_top = 104
	coach.grow_horizontal = Control.GROW_DIRECTION_BOTH
	coach.visible = false
	hud_box.add_child(coach)
	coach_label = Craft.body(28)
	coach_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	coach.add_child(coach_label)

	chain_label = Craft.label(68, Craft.RED_INK, Craft.marker(), 14, Craft.PAPER)
	chain_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	chain_label.offset_left = 120
	chain_label.offset_right = 520
	chain_label.offset_top = -170
	chain_label.offset_bottom = -90
	chain_label.visible = false
	hud_box.add_child(chain_label)

	hint = _panel(Craft.paper(18, 1), 0.01)
	hint.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	hint.offset_left = -330
	hint.offset_right = 330
	hint.offset_top = 150
	hint.grow_horizontal = Control.GROW_DIRECTION_BOTH
	hud_box.add_child(hint)
	var hl := Craft.body(22)
	hl.text = "Mouse button to start.  The mouse looks, WASD walks, hold the button down to burn, Space jumps.\nE opens the box, M mutes, Esc lets go of the mouse."
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
	hud_box.add_child(tool_tag)
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
	hud_box.add_child(find_tag)
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
	if giant != null:
		# The fist sits above the phone's buttons (the jump and fire caps), or lower down on a computer.
		giant.grip_screen = Vector2(-335.0, -262.0) if on else Vector2(-285.0, -188.0)
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
	crosshair.focus = giant.focus
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
	wind.t += delta
	wind.queue_redraw()
	_update_offer(delta)
	_update_find(delta)
	_update_chain(delta)
	_update_notes(delta)
	_refresh_t += delta
	if _refresh_t >= 0.15:
		_refresh_t = 0.0
		_refresh()


func _refresh() -> void:
	var rate := GameState.income_per_second_now()
	rate_label.text = "+%s a second" % Fmt.rate(rate) if rate > 0.05 else "nothing burning"
	if city != null:
		var z := Balance.zone_for_cell(clampi(int((giant.position.x - city.origin.x) / Balance.CELL), 0, city.n - 1),
			clampi(int((giant.position.z - city.origin.y) / Balance.CELL), 0, city.n - 1))
		# The district you're standing in: how much of it is down, and a notch where the
		# next tool goes on sale (in the castle, where the keep's walls are breached).
		var zp: float = city.zone_progress(z)
		zone_label.text = Balance.ZONES[z].name
		zone_bar.value = zp
		zone_bar.gate = -1.0
		zone_bar.gate_icon = null
		var pct := "%d%% down" % int(zp * 100.0)
		if z + 1 < Balance.TOOL_GATE.size() and GameState.tool_index <= z:
			zone_bar.gate = float(Balance.TOOL_GATE[z + 1])
			zone_bar.gate_icon = Craft.icon(str(Balance.TOOLS[z + 1].key))
			if zp < zone_bar.gate:
				pct = "%d%%, %s at %d%%" % [int(zp * 100.0), str(Balance.TOOLS[z + 1].name).to_lower(), int(round(zone_bar.gate * 100.0))]
		elif z == 3:
			zone_bar.gate = Balance.KEEP_GATE
			zone_bar.gate_icon = Craft.icon("castle")
			if zp < zone_bar.gate:
				pct = "%d%%, the keep at %d%%" % [int(zp * 100.0), int(round(zone_bar.gate * 100.0))]
		zone_pct.text = pct
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
				text = "%s  [coin]%s" % [def.name, Fmt.gain(float(def.coins) * GameState.coin_mult())]
				if city.is_truck(s):
					text += "  (out of water)" if city.truck_dry(s) else "  (it squirts water at fires near it)"
			elif city.keep_shielded(s):
				ok = false
				text = "The keep: bring its walls down first (%d%% of the castle down)" % int(city.zone_progress(3) * 100.0)
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
		ok = false
		if giant.firing:
			text = "Too far. Walk closer"
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
	## The first-run hint shares one spot with the notes: a note takes it, then the hint comes back.
	var show := text != "" and not is_blocking() and not (_note_panel != null and _note_panel.visible)
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
var _chain_shown := 0


func show_chain(n: int) -> void:
	## Stamped only as a chain reaches a milestone (a big fire is one endless chain), and
	## never a smaller number over a bigger one still on screen (two chains running at once
	## used to flick x5 -> x8 -> x5). Floating numbers clear out of the way.
	if not CHAIN_STAMPS.has(n):
		return
	if chain_label.visible and n <= _chain_shown:
		return
	_chain_shown = n
	if world != null:
		world.hide_floats()
	chain_label.text = "chain x%d" % n
	chain_label.visible = true
	chain_label.pivot_offset = Vector2(140, 40)
	_chain_t = 0.0


func _update_chain(delta: float) -> void:
	if not chain_label.visible:
		return
	_chain_t += delta
	# Stamped on (in big and crooked, settles), held a moment, then lifted off: it swells,
	# turns a little and fades, the way a stamp comes up off paper.
	var u := minf(1.0, _chain_t / 0.22)
	var e := 1.0 - pow(1.0 - u, 3.0)
	var out := clampf((_chain_t - 1.05) / 0.4, 0.0, 1.0)
	var eo := out * out
	chain_label.scale = Vector2.ONE * (lerpf(1.7, 1.0, e) + 0.35 * eo)
	chain_label.rotation = lerpf(-0.35, -0.08, e) + 0.14 * eo
	chain_label.modulate.a = 1.0 - eo
	if _chain_t > 1.45:
		chain_label.visible = false
		_chain_shown = 0


var _notes: Array = []                # queued lines, shown one at a time
var _note_panel: PanelContainer
var _note_label: RichTextLabel
var _note_t := 0.0
var _note_key := ""


func open_link(url: String) -> void:
	## A link the player asked for (the privacy policy). Remembered so tests can
	## see it; a headless run has no browser to hand it to.
	opened_links.append(url)
	if DisplayServer.get_name() != "headless":
		OS.shell_open(url)


func toast(text: String, key: String = "") -> void:
	## A note taped up at the left, one at a time. Notes with the same key (finds)
	## replace each other instead of queueing.
	if key != "":
		if _note_key == key and _note_panel != null and _note_panel.visible:
			_note_label.text = Craft.coins_bb(text, 22)
			_note_t = 0.0
			return
		for e in _notes:
			if e[1] == key:
				e[0] = text
				return
	_notes.append([text, key])
	while _notes.size() > 4:
		_notes.pop_front()


func _update_notes(delta: float) -> void:
	if _note_panel == null:
		_note_panel = _panel(Craft.paper(41, 1), -0.015)
		_note_panel.position = Vector2(18, 172)
		_note_label = Craft.rich(26)
		_note_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		_note_panel.add_child(_note_label)
		toast_box.add_child(_note_panel)
		_note_panel.visible = false
	if _note_panel.visible:
		_note_t += delta
		var hold := 2.6 if _notes.is_empty() else 1.8
		_note_panel.modulate.a = minf(1.0, _note_t / 0.18) * (1.0 - clampf((_note_t - hold) / 0.35, 0.0, 1.0))
		if _note_t >= hold + 0.35:
			_note_panel.visible = false
			_note_t = 0.0
			_note_key = ""
		return
	if _notes.is_empty():
		return
	var e: Array = _notes.pop_front()
	_note_label.text = Craft.coins_bb(str(e[0]), 26)
	_note_key = str(e[1])
	_note_panel.reset_size()
	# The one note spot: top middle, under the district tag (the hint steps aside for it).
	var vp := root.get_viewport_rect().size
	_note_panel.position = Vector2((vp.x - _note_panel.size.x) * 0.5, 106.0)
	_note_panel.rotation = randf_range(-0.02, 0.015)
	_note_panel.visible = true
	coach.visible = false
	_note_panel.modulate.a = 0.0
	_note_t = 0.0


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
	var stamp := "watch"
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
		toast("%s. +[coin]%s" % [name, Fmt.num(amount)], "find")
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
	var how := "Tap the ticket for a short ad to double it" if touch_mode else "Double it with a short ad (on this ticket)"
	_find_text.text = Craft.coins_bb("[b]A golden ticket.[/b] +[coin]%s\n%s  %d" % [
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
	if popups.get_child_count() == 0:
		_set_hud_shown(true)
	if popups.get_child_count() == 0 and shop == null:
		giant.input_enabled = true
		touch.visible = touch_mode


func _set_hud_shown(on: bool) -> void:
	## Fades the whole HUD out under a modal and back in after it. Uses alpha, not
	## `visible`, so each piece keeps its own show/hide state while it's away.
	if _hud_tween != null and _hud_tween.is_valid():
		_hud_tween.kill()
	_hud_tween = hud_box.create_tween()
	_hud_tween.tween_property(hud_box, "modulate:a", 1.0 if on else 0.0, 0.25 if on else 0.15)


func show_starter_offer() -> void:
	## The starter pack, once, after ten minutes: a box of matches slides its drawer
	## open; the price is on a tag tied to it; "not now" is scribbled underneath.
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	giant.input_enabled = false
	giant.firing = false
	touch.release_all()
	touch.visible = false
	var dim := ColorRect.new()
	dim.color = Color(0.06, 0.07, 0.09, 0.62)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	popups.add_child(dim)
	_set_hud_shown(false)     # one thing on screen: no HUD, no timed offer tag under it
	var p := {"root": dim}
	var vp := root.get_viewport_rect().size
	var box := Matchbox.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var w := minf(vp.x * 0.42, 520.0)
	# The sleeve, the open drawer, the string and the price tag must all fit: on a
	# 16:9 or 4:3 screen the tag used to hang off the right edge.
	var tag_w := 210.0
	var reach := w * 1.62 + 6.0 + 56.0 + tag_w + 14.0
	var left := clampf(vp.x - 28.0 - reach, 40.0, vp.x * 0.14)
	box.sleeve = Rect2(left, vp.y * 0.36, w, w * 0.46)
	dim.add_child(box)
	var title := Craft.label(40, Craft.PAPER)
	title.text = "A BOX OF MATCHES"
	title.position = Vector2(left, vp.y * 0.36 - 118)
	title.rotation = -0.02
	dim.add_child(title)
	var body := Craft.rich(23, Craft.PAPER)
	body.custom_minimum_size = Vector2(minf(vp.x * 0.62, 760.0), 0)
	body.position = Vector2(left, vp.y * 0.36 - 66)
	body.text = Craft.coins_bb("+[coin]%s coins right away, and party sparks: every tool throws sparks in all the colours of a felt-tip set. Only offered once." % Fmt.num(Balance.STARTER_COINS), 23)
	dim.add_child(body)
	var tag := Button.new()
	tag.text = Monetization.price(Monetization.PRODUCT_STARTER)
	Craft.price_button(tag, 61)
	Craft.hot(tag, true)
	tag.add_theme_font_size_override("font_size", 28)
	tag.custom_minimum_size = Vector2(tag_w, 70)
	tag.rotation = 0.12
	tag.pressed.connect(func():
		close_popup(p)
		Monetization.buy(Monetization.PRODUCT_STARTER))
	dim.add_child(tag)
	var nope := Scribble.new()
	nope.text = "not now"
	nope.flat = true
	nope.focus_mode = Control.FOCUS_NONE
	nope.add_theme_font_override("font", Craft.hand())
	nope.add_theme_font_size_override("font_size", 26)
	for k in ["font_color", "font_hover_color", "font_pressed_color"]:
		nope.add_theme_color_override(k, Color(Craft.PAPER, 0.85))
	nope.position = Vector2(left + 8, box.sleeve.end.y + 46)
	nope.rotation = -0.05
	nope.pressed.connect(func(): close_popup(p))
	dim.add_child(nope)
	p["tag"] = tag
	p["nope"] = nope
	p["box"] = box
	# The drawer slides out with a little overshoot; the tag swings on its string.
	var tw := box.create_tween()
	tw.tween_interval(0.25)
	tw.tween_property(box, "open", 1.0, 0.7).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var follow := func():
		box.t += get_process_delta_time()
		var dr_end := box.sleeve.position.x + box.drawer_out + box.sleeve.size.x - 6
		var hole := Vector2(dr_end + 70, box.sleeve.position.y + box.sleeve.size.y * 0.5 + 60)
		tag.position = hole + Vector2(-14, -tag.size.y * 0.5)
		tag.rotation = 0.12 + sin(box.t * 2.2) * 0.05
		tag.modulate.a = clampf(box.open * 2.0, 0.0, 1.0)
		box.tag_hole = hole + Vector2(0, 0)
		box.queue_redraw()
	box.set_meta("follow", follow)
	get_tree().process_frame.connect(follow)
	dim.tree_exiting.connect(func():
		if get_tree().process_frame.is_connected(follow):
			get_tree().process_frame.disconnect(follow))
	_last_popup = p


var _last_popup := {}
var _hud_tween: Tween


func show_ending() -> void:
	## The keep is down: the HUD goes, the view settles over the ashes, and after a
	## moment a delivery note is pinned up with how it went.
	for c in root.get_children():
		if c != popups and c is Control:
			(c as Control).visible = false
	hint.visible = false
	touch.release_all()
	giant.input_enabled = false
	giant.firing = false
	var dim := ColorRect.new()
	dim.color = Color(0.03, 0.03, 0.04, 0.0)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	popups.add_child(dim)
	var p := {"root": dim}
	# Letterbox bars close in, like the end of a film shot on a paper set.
	var bars: Array = []
	for top in [true, false]:
		var bar := ColorRect.new()
		bar.color = Color(0.04, 0.04, 0.05)
		bar.anchor_right = 1.0
		bar.anchor_top = 0.0 if top else 1.0
		bar.anchor_bottom = 0.0 if top else 1.0
		bar.offset_bottom = 0.0
		bar.offset_top = 0.0
		dim.add_child(bar)
		bars.append(bar)
	var note := _panel(Craft.paper(70, 2), -0.03)
	note.custom_minimum_size = Vector2(560, 0)
	(note.get_theme_stylebox("panel") as CardStyle).content_margin_left = 30
	(note.get_theme_stylebox("panel") as CardStyle).content_margin_right = 30
	(note.get_theme_stylebox("panel") as CardStyle).content_margin_top = 24
	(note.get_theme_stylebox("panel") as CardStyle).content_margin_bottom = 22
	# Pinned up in the middle, growing out from the centre (an absolute position here was
	# measured before the dim had a size, so the screenshot run found the note off-screen).
	# Pinned up on the right, so the ruins of the keep stay in view on the left as the
	# camera cranes round them.
	note.set_anchors_and_offsets_preset(Control.PRESET_CENTER_RIGHT)
	note.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	note.grow_vertical = Control.GROW_DIRECTION_BOTH
	note.offset_right = -40.0
	note.modulate.a = 0.0
	dim.add_child(note)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	note.add_child(v)
	var t := Craft.label(34)
	t.text = "DELIVERY NOTE"
	v.add_child(t)
	var b := Craft.rich(23)
	b.custom_minimum_size = Vector2(500, 0)
	var n_finds := _count_finds()
	var spent := Fmt.spell_time(GameState.play_time)      # "23 minutes", "under a minute"
	spent = spent.left(1).to_upper() + spent.substr(1)
	b.text = Craft.coins_bb("One cardboard city, returned as ash. The keep went last; the warehouse is quiet again apart from the fans.\n\n%s of burning\n[coin]%s coins earned\n%d %s brought down, longest chain %d\n%d paper %s hopped to safety\n%d %s out of the boxes" % [
		spent, Fmt.num(GameState.lifetime_coins), GameState.collapses,
		"building" if GameState.collapses == 1 else "buildings", GameState.best_chain,
		GameState.citizens_saved, "person" if GameState.citizens_saved == 1 else "people",
		n_finds, "find" if n_finds == 1 else "finds"], 23)
	v.add_child(b)
	var btn := Button.new()
	btn.text = "Walk around the ashes"
	Craft.tag_button(btn, Craft.KRAFT_PALE, 22, 71)
	btn.custom_minimum_size = Vector2(0, 58)
	btn.pressed.connect(func():
		close_popup(p)
		if world != null:
			world.end_ending_camera()
		for c in root.get_children():
			if c != popups and c is Control and c != rotate_overlay:
				(c as Control).visible = true
		set_touch_mode(touch_mode)
		_refresh())     # each HUD piece back to what the game says it should be, at once
	v.add_child(btn)
	p["note"] = note
	p["button"] = btn
	var tw := dim.create_tween()
	tw.set_parallel(true)
	tw.tween_property(dim, "color:a", 0.22, 2.0)
	tw.tween_property(bars[0], "offset_bottom", 64.0, 1.6).set_trans(Tween.TRANS_SINE)
	tw.tween_property(bars[1], "offset_top", -64.0, 1.6).set_trans(Tween.TRANS_SINE)
	# The camera cranes up over the ashes for a few seconds before the note is pinned up.
	tw.chain().tween_interval(3.2)
	tw.chain().tween_property(note, "modulate:a", 1.0, 0.6)
	_last_popup = p


func _count_finds() -> int:
	var n := 0
	for k in GameState.finds:
		n += int(GameState.finds[k])
	return n
