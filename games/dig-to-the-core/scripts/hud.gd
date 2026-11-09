class_name Hud
extends CanvasLayer
## Everything drawn over the game: the depth gauge (left), money (top), the
## 2x boost ticket (only when it's worth having) and the timed offer tag (top
## right), the tool and the next tool's price (bottom), the crosshair (with a
## cracked-rock mark when your tool can't touch the rock), toasts, first-run
## hints, the find card (with "double it"), the shop panel, popups, the
## lift's fade, and the phone controls. All of it but the fade steps aside
## during the lift ride. Phone first: every word is at least 20 px at the
## 1280 x 720 design size (11 px on a small phone).

signal shop_closed

var player: Player
var touch: TouchControls
var touch_mode := false
var gauge: DepthGauge
var offers := AdOffers.new()
var shop: ShopPanel
var root: Control
var popups: Control
var fade: ColorRect
var riding := false:
	set(v):
		riding = v
		_sync_touch()
		_sync_play()

var _money: Label
var _rate: Label
var _boost: Button
var _offer_tag: PanelContainer
var _offer_title: Label
var _offer_bar: ProgressBar
var _tool_label: Label
var _tool_icon: TextureRect
var _next_label: Label
var _next_bar: ProgressBar
var _cross: Control
var _target_icon: TextureRect
var _play: Array = []              # HUD pieces hidden during the lift ride
var _boost_window := 0.0           # seconds left that the boost ticket is worth showing
var _boost_cool := 0.0             # seconds before it may show again
var _hard_t := 0.0                 # how long you've been chipping at slow rock
var _banner_t := 0.0               # a layer banner is having its moment
var _queued: Array = []            # toasts waiting for the banner to finish
var _keycap: PanelContainer
var _toasts: VBoxContainer
var _coach: PanelContainer
var _coach_label: Label
var _prompt: PanelContainer
var _prompt_label: Label
var _find_card: PanelContainer
var _find_double: Button
var _find_bar: ProgressBar
var _find_t := 0.0
var _find_double_t := 0.0
var _find_index := -1
var _rotate: Control
var _slow_t := 0.0
var _cross_state := ""
var _offer_swing := 0.0
var _boost_text := ""


func _ready() -> void:
	layer = 5
	UiTheme.install_fonts()
	root = Control.new()
	root.theme = UiTheme.make_theme()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	touch = TouchControls.new()
	touch.visible = false
	root.add_child(touch)
	_build_gauge()
	_build_top()
	_build_center()
	_build_bottom()
	_build_find_card()
	popups = Control.new()
	popups.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(popups)
	popups.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	fade = ColorRect.new()
	fade.color = Color(0, 0, 0, 0)
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fade)
	fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_rotate_overlay()
	GameState.changed.connect(_refresh)
	GameState.found_item.connect(show_find)
	Monetization.purchase_error.connect(func(_id, reason): toast("Purchase didn't go through (%s)" % reason))
	Monetization.purchases_changed.connect(func(): toast("Thank you. It's yours."))
	_refresh()


func set_touch_mode(on: bool) -> void:
	touch_mode = on
	_sync_touch()
	if not on:
		touch.release_all()
	_refresh()


func _sync_touch() -> void:
	## The phone controls show only while you're actually playing: never over
	## the shop, a popup, an ad screen or the lift ride, not even for a frame.
	if touch != null and popups != null:
		touch.visible = touch_mode and not is_blocking() and not riding


func is_blocking() -> bool:
	return shop != null or popups.get_child_count() > 0 or Monetization.is_showing_ad()


# --- Building ------------------------------------------------------------------------------------
func _icon_rect(name: String, size: float) -> TextureRect:
	var t := TextureRect.new()
	t.texture = UiTheme.icon(name)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(size, size)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t

func _build_gauge() -> void:
	gauge = DepthGauge.new()
	root.add_child(gauge)
	gauge.position = Vector2(14, 12)
	gauge.size = Vector2(DepthGauge.W, 470)
	get_viewport().size_changed.connect(_fit_gauge)
	_fit_gauge()


func _fit_gauge() -> void:
	var h := get_viewport().get_visible_rect().size.y
	gauge.size = Vector2(DepthGauge.W, clampf(h - 260.0, 260.0, 560.0))


func _build_top() -> void:
	var top := HBoxContainer.new()
	top.alignment = BoxContainer.ALIGNMENT_CENTER
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(top)
	top.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	top.position.y = 8
	top.position.x -= 60
	var plate := PanelContainer.new()
	plate.add_theme_stylebox_override("panel", UiTheme.plate(UiTheme.BRASS, true, Vector4(26, 4, 26, 8)))
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(plate)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", -6)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(v)
	var win := PanelContainer.new()
	win.add_theme_stylebox_override("panel", UiTheme.screen(Color(0.08, 0.06, 0.04, 1.0), 18.0))
	win.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(win)
	var mrow := HBoxContainer.new()
	mrow.add_theme_constant_override("separation", 8)
	mrow.alignment = BoxContainer.ALIGNMENT_CENTER
	mrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	win.add_child(mrow)
	mrow.add_child(_icon_rect("coin", 40))
	_money = UiTheme.label("0", 38, UiTheme.AMBER, 0)
	_money.custom_minimum_size = Vector2(110, 0)
	mrow.add_child(_money)
	_rate = UiTheme.label("", 20, Color(0.2, 0.12, 0.05), 0)
	_rate.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_rate)
	# Boost button and the offer tag, top right.
	var right := VBoxContainer.new()
	right.alignment = BoxContainer.ALIGNMENT_BEGIN
	right.add_theme_constant_override("separation", 6)
	right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(right)
	right.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	right.offset_left = -330
	right.offset_right = -14
	right.offset_top = 12
	right.grow_horizontal = Control.GROW_DIRECTION_BEGIN   # never pushes off the right edge
	_boost = Button.new()
	_boost.custom_minimum_size = Vector2(0, 60)
	UiTheme.style_ticket(_boost, 21)
	_boost.pressed.connect(func(): watch_ad("boost"))
	right.add_child(_boost)
	touch.buttons.append({"control": _boost, "action": func(): watch_ad("boost")})
	_offer_tag = PanelContainer.new()
	var tag := UiTheme.paper(Vector4(34, 8, 16, 10), 3, false, UiTheme.MANILA)
	tag.hole = true
	_offer_tag.add_theme_stylebox_override("panel", tag)
	_offer_tag.visible = false
	_offer_tag.mouse_filter = Control.MOUSE_FILTER_STOP
	right.add_child(_offer_tag)
	var ov := VBoxContainer.new()
	ov.add_theme_constant_override("separation", 2)
	ov.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_offer_tag.add_child(ov)
	_offer_title = UiTheme.label("", 19, UiTheme.INK, 0)
	_offer_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_offer_title.custom_minimum_size = Vector2(256, 0)
	ov.add_child(_offer_title)
	var srow := HBoxContainer.new()
	srow.add_theme_constant_override("separation", 6)
	srow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	srow.add_child(_icon_rect("ad", 22))
	srow.add_child(UiTheme.label("tap to watch a short ad", 20, UiTheme.INK.lightened(0.2), 0, false))
	ov.add_child(srow)
	_offer_bar = ProgressBar.new()
	_offer_bar.show_percentage = false
	_offer_bar.custom_minimum_size = Vector2(0, 6)
	_offer_bar.max_value = 1.0
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(UiTheme.INK, 0.15)
	var fg := StyleBoxFlat.new()
	fg.bg_color = UiTheme.ENAMEL_RED
	_offer_bar.add_theme_stylebox_override("background", bg)
	_offer_bar.add_theme_stylebox_override("fill", fg)
	ov.add_child(_offer_bar)
	_offer_tag.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			take_offer())
	touch.buttons.append({"control": _offer_tag, "action": take_offer})
	# Toasts under the money.
	_toasts = VBoxContainer.new()
	_toasts.alignment = BoxContainer.ALIGNMENT_BEGIN
	_toasts.add_theme_constant_override("separation", 6)
	_toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_toasts)
	_toasts.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_toasts.offset_left = -330
	_toasts.offset_right = 330
	_toasts.offset_top = 104
	_play.append_array([top, right])


func _build_center() -> void:
	_cross = Control.new()
	_cross.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cross.draw.connect(_draw_cross)
	root.add_child(_cross)
	_cross.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_cross.size = Vector2(40, 40)
	_cross.position -= Vector2(20, 20)
	# Rock your tool can't touch: a cracked-rock mark beside the crosshair
	# (no words, no labels under it).
	_target_icon = _icon_rect("too_hard", 46)
	_target_icon.visible = false
	root.add_child(_target_icon)
	_target_icon.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_target_icon.offset_left = 22
	_target_icon.offset_top = -50
	_target_icon.offset_right = 68
	_target_icon.offset_bottom = -4
	_play.append_array([_cross, _target_icon])
	_coach = PanelContainer.new()
	_coach.add_theme_stylebox_override("panel", UiTheme.enamel(UiTheme.CREAM, Vector4(28, 12, 28, 14), 7))
	_coach.rotation = -0.012
	_coach.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_coach.visible = false
	root.add_child(_coach)
	_coach.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_coach.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_coach.offset_top = 150
	_coach_label = UiTheme.label("", 23, UiTheme.SOOT, 0)
	_coach_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_coach_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_coach_label.custom_minimum_size = Vector2(520, 0)
	_coach.add_child(_coach_label)


func _build_bottom() -> void:
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_END
	box.add_theme_constant_override("separation", 8)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(box)
	box.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	box.offset_left = -230
	box.offset_right = 230
	box.offset_top = -190
	box.offset_bottom = -12
	_prompt = PanelContainer.new()
	_prompt.add_theme_stylebox_override("panel", UiTheme.enamel(UiTheme.LAMP_GREEN.darkened(0.25), Vector4(22, 6, 22, 8), 11))
	_prompt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_prompt.visible = false
	box.add_child(_prompt)
	var prow := HBoxContainer.new()
	prow.add_theme_constant_override("separation", 10)
	prow.alignment = BoxContainer.ALIGNMENT_CENTER
	prow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_prompt.add_child(prow)
	# The key to press, on a little cream keycap (keyboards only: phones get the
	# context button instead).
	_keycap = PanelContainer.new()
	var kc := StyleBoxFlat.new()
	kc.bg_color = UiTheme.CREAM
	kc.border_color = UiTheme.SOOT
	kc.set_border_width_all(2)
	kc.border_width_bottom = 4
	kc.set_corner_radius_all(5)
	kc.content_margin_left = 9
	kc.content_margin_right = 9
	kc.content_margin_top = 0
	kc.content_margin_bottom = 2
	_keycap.add_theme_stylebox_override("panel", kc)
	_keycap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_keycap.add_child(UiTheme.label("E", 20, UiTheme.SOOT, 0))
	prow.add_child(_keycap)
	_prompt_label = UiTheme.label("", 21, UiTheme.CREAM, 5)
	_prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prow.add_child(_prompt_label)
	var plate := PanelContainer.new()
	var iron := UiTheme.plate(UiTheme.IRON_LIGHT, false, Vector4(22, 8, 22, 10))
	iron.seed = 5
	plate.add_theme_stylebox_override("panel", iron)
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(plate)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(v)
	var trow := HBoxContainer.new()
	trow.alignment = BoxContainer.ALIGNMENT_CENTER
	trow.add_theme_constant_override("separation", 8)
	trow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(trow)
	_tool_icon = _icon_rect("shovel", 34)
	trow.add_child(_tool_icon)
	_tool_label = UiTheme.label("", 24, UiTheme.CREAM, 0)
	UiTheme.sign_text(_tool_label, 24, UiTheme.CREAM, 5)
	trow.add_child(_tool_label)
	_next_bar = ProgressBar.new()
	_next_bar.show_percentage = false
	_next_bar.custom_minimum_size = Vector2(380, 12)
	_next_bar.max_value = 1.0
	var bg := StyleBoxFlat.new()
	bg.bg_color = UiTheme.SOOT
	bg.set_corner_radius_all(3)
	var fg := StyleBoxFlat.new()
	fg.bg_color = UiTheme.AMBER
	fg.set_corner_radius_all(3)
	_next_bar.add_theme_stylebox_override("background", bg)
	_next_bar.add_theme_stylebox_override("fill", fg)
	v.add_child(_next_bar)
	_next_label = UiTheme.label("", 20, Color(0.9, 0.85, 0.75), 4, false)
	_next_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_next_label)
	_play.append(box)


func _build_find_card() -> void:
	## A specimen card from the assay office, pinned in the right-hand column
	## under the boost ticket (clear of the gauge, the money and the toasts).
	_find_card = PanelContainer.new()
	_find_card.add_theme_stylebox_override("panel", UiTheme.paper(Vector4(16, 12, 16, 12), 21))
	_find_card.visible = false
	_find_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_find_card)
	_find_card.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_find_card.offset_left = -342
	_find_card.offset_right = -14
	_find_card.offset_top = 84
	_find_card.custom_minimum_size = Vector2(328, 0)
	_find_card.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_play.append(gauge)


func _build_rotate_overlay() -> void:
	_rotate = ColorRect.new()
	(_rotate as ColorRect).color = Color(0.06, 0.045, 0.03)
	_rotate.mouse_filter = Control.MOUSE_FILTER_STOP
	_rotate.visible = false
	root.add_child(_rotate)
	_rotate.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var l := UiTheme.label("Turn your phone sideways to dig", 30, UiTheme.AMBER, 6)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_rotate.add_child(l)
	l.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


# --- Per frame ------------------------------------------------------------------------------------
func _process(delta: float) -> void:
	var vs := root.get_viewport_rect().size
	_rotate.visible = touch_mode and vs.y > vs.x
	_sync_touch()
	_money.text = Fmt.num(GameState.money)
	if player != null:
		gauge.depth = maxf(0.0, -player.position.y)
	gauge.deepest = GameState.deepest
	gauge.lift_depth = -GameState.lift_stop.y if GameState.lift_stop.is_finite() else -1.0
	_update_cross(delta)
	_update_offer(delta)
	_update_boost(delta)
	_update_find_card(delta)
	if _banner_t > 0.0:
		_banner_t -= delta
		if _banner_t <= 0.0:
			for q in _queued:
				toast(q[0], q[1], q[2])
			_queued.clear()
	_slow_t += delta
	if _slow_t > 0.25:
		_slow_t = 0.0
		_refresh()


func _refresh() -> void:
	if _money == null:
		return
	var ipm := GameState.income_per_minute()
	_rate.text = "+%s a minute" % Fmt.num(ipm) if ipm > 0.5 else "dig to earn"
	var t := GameState.tool_def()
	_tool_label.text = str(t.name)
	_tool_icon.texture = UiTheme.icon(str(t.icon))
	var ni := GameState.next_tool_index()
	if ni >= 0:
		var nt: Dictionary = Balance.TOOLS[ni]
		var cost := float(nt.cost)
		_next_bar.visible = true
		_next_bar.value = clampf(GameState.money / cost, 0.0, 1.0)
		if GameState.money >= cost:
			_next_label.text = "You can afford the %s. Buy it at the shack." % str(nt.name).to_lower()
			_next_label.add_theme_color_override("font_color", UiTheme.LAMP_GREEN.lightened(0.3))
		else:
			_next_label.text = "Next: the %s, %s of %s" % [str(nt.name).to_lower(), Fmt.num(GameState.money), Fmt.num(cost)]
			_next_label.add_theme_color_override("font_color", Color(0.9, 0.85, 0.75))
	else:
		_next_bar.visible = false
		_next_label.text = "The best tool on Earth"
	# Boost button: what it does, or how long is left.
	var bt := ""
	if GameState.owns_remove_ads and not GameState.is_boost_active():
		bt = "2x digging, for good"
	elif GameState.is_boost_active():
		bt = "2x digging · %s left" % Fmt.duration(GameState.boost_seconds_left())
	else:
		bt = "2x digging · 5 min"
	if bt != _boost_text:
		_boost_text = bt
		_boost.text = bt
	_boost.disabled = Monetization.is_watching() or not GameState.boost_can_stack()
	if gauge != null:
		var fa: Array = []
		var reach := GameState.deepest_zone() + 1
		for f in Balance.FINDS.size():
			var z := int(Balance.FINDS[f].zone)
			if z <= reach and GameState.field != null:
				fa.append([-GameState.field.find_spot(f).y, Balance.FINDS[f].icon, GameState.found[f]])
		gauge.finds_at = fa


func _update_cross(delta: float = 0.0) -> void:
	var st := "none"
	var slow := false
	if player != null and player.target.hit and not riding:
		var info: Dictionary = GameState.field.point_info(player.target.pos - player.target.normal * 0.15) if GameState.field != null else {}
		if not info.is_empty():
			if info.wall:
				st = "wall"
			else:
				var per := GameState.tool_damage() / maxf(float(info.hp), 0.0001)
				var hits := int(ceil(0.5 / maxf(per, 0.00001)))
				if hits > 14:
					st = "hard"
				else:
					st = "ore" if int(info.ore) > 0 else "ok"
					slow = hits >= 5
	# Chipping away at slow rock for a while is when 2x digging is worth having.
	if slow and player != null and player.digging:
		_hard_t += delta
	else:
		_hard_t = maxf(0.0, _hard_t - delta * 0.5)
	if st != _cross_state:
		_cross_state = st
		_cross.queue_redraw()
		_target_icon.texture = UiTheme.icon("wall" if st == "wall" else "too_hard")
	_cross.visible = not is_blocking() and not riding
	_target_icon.visible = _cross.visible and (st == "hard" or st == "wall")


func _draw_cross() -> void:
	var c := Vector2(20, 20)
	var col := Color(1, 1, 1, 0.85)
	match _cross_state:
		"none":
			col = Color(1, 1, 1, 0.4)
		"hard", "wall":
			col = Color(1.0, 0.45, 0.35, 0.95)
		"ore":
			col = UiTheme.AMBER
	_cross.draw_arc(c, 9.0, 0, TAU, 24, Color(0, 0, 0, 0.5), 4.0)
	_cross.draw_arc(c, 9.0, 0, TAU, 24, col, 2.0)
	_cross.draw_circle(c, 2.2, col)


# --- Toasts, hints, prompts ---------------------------------------------------------------------------
func toast(text: String, color: Color = UiTheme.CREAM, seconds: float = 3.2) -> void:
	if _banner_t > 0.0:
		_queued.append([text, color, seconds])   # the layer banner has the stage
		return
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiTheme.screen(Color(0.1, 0.075, 0.05, 0.92), 16.0))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := UiTheme.label(text, 21, color, 4)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p.add_child(l)
	p.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_toasts.add_child(p)
	while _toasts.get_child_count() > 3:
		var old := _toasts.get_child(0)
		_toasts.remove_child(old)
		old.queue_free()
	var tw := p.create_tween()
	p.modulate.a = 0.0
	tw.tween_property(p, "modulate:a", 1.0, 0.15)
	tw.tween_interval(seconds)
	tw.tween_property(p, "modulate:a", 0.0, 0.4)
	tw.tween_callback(p.queue_free)


func big_toast(title: String, sub: String, color: Color) -> void:
	## Breaking into a new layer: an enamel banner with the layer's name and
	## one line about it. It has the stage to itself (other toasts wait), lands
	## with a little overshoot, holds, then lifts away and fades.
	for c in _toasts.get_children():
		c.queue_free()
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiTheme.enamel(color.darkened(0.35), Vector4(38, 10, 38, 14), title.length()))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", -2)
	p.add_child(v)
	var a := UiTheme.label(title, 38, UiTheme.CREAM, 0)
	UiTheme.sign_text(a, 40, UiTheme.CREAM, 7)
	a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(a)
	var b := UiTheme.label(sub, 22, UiTheme.CREAM, 4, false)
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(b)
	p.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_toasts.add_child(p)
	_toasts.move_child(p, 0)
	p.pivot_offset = Vector2(220, 40)
	p.scale = Vector2(0.7, 0.7)
	p.modulate.a = 0.0
	var tw := p.create_tween()
	tw.tween_property(p, "modulate:a", 1.0, 0.18)
	tw.parallel().tween_property(p, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(3.4)
	tw.tween_property(p, "modulate:a", 0.0, 0.7).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(p, "position:y", p.position.y - 18.0, 0.7).set_ease(Tween.EASE_IN)
	tw.tween_callback(p.queue_free)
	_banner_t = 4.4
	gauge.flash_zone()
	boost_relevant()


func set_coach(text: String) -> void:
	_coach.visible = text != "" and not is_blocking()
	if _coach_label.text != text:
		_coach_label.text = text
		_coach.reset_size()
		_coach.offset_left = -_coach.size.x * 0.5
		_coach.offset_right = _coach.size.x * 0.5


func set_prompt(text: String) -> void:
	## Keyboards: the key on a cream keycap and what it does, above the tool
	## plate. Phones get the context button instead (and see no prompt).
	_prompt.visible = text != "" and not touch_mode and not is_blocking() and not riding
	_keycap.visible = not text.begins_with("Dig a shaft")
	if _prompt_label.text != text:
		_prompt_label.text = text


# --- Ads: the boost button, the offer tag ---------------------------------------------------------
func watch_ad(kind: String) -> void:
	if Monetization.is_watching():
		return
	if kind == "boost" and not GameState.boost_can_stack():
		toast("The boost is already stacked to 15 minutes")
		return
	if offers.current == kind:
		offers.watching = true
	touch.release_all()
	Monetization.watch_for_reward(kind, func(ok: bool, text: String):
		if offers.current == kind:
			if ok:
				offers.taken()
				_hide_offer()
			else:
				offers.watching = false
		if ok:
			Sound.play("reward", -3.0)
			toast(text, UiTheme.AMBER)
		_refresh())
	_sync_touch()


func take_offer() -> void:
	if offers.current != "":
		watch_ad(offers.current)


func _update_offer(delta: float) -> void:
	var playing := not is_blocking() and not riding and not find_card_up()
	var ev := offers.update(delta, playing)
	if ev == 1:
		_offer_title.text = AdOffers.headline(offers.current)
		_offer_tag.visible = true
		_offer_swing = 1.0
		Sound.play("offer", -8.0)
	elif ev == -1:
		_hide_offer()
	_offer_tag.visible = offers.current != "" and not find_card_up() and not riding
	if _offer_tag.visible:
		if offers.current == "cash":
			_offer_title.text = AdOffers.headline("cash")
		_offer_bar.value = offers.time_left / Balance.OFFER_LIFETIME
		_offer_swing = maxf(0.0, _offer_swing - delta * 1.2)
		_offer_tag.pivot_offset = Vector2(_offer_tag.size.x * 0.5, 0)
		_offer_tag.rotation = 0.03 + sin(_offer_swing * 14.0) * 0.08 * _offer_swing


func _hide_offer() -> void:
	_offer_tag.visible = false


func boost_relevant() -> void:
	## A moment when 2x digging is worth having (a new, harder layer; a long
	## chip at slow rock): the ticket shows for a while, then steps away.
	if _boost_cool <= 0.0 and GameState.play_time > Balance.OFFER_FIRST_AFTER:
		_boost_window = 28.0


func _update_boost(delta: float) -> void:
	## The 2x ticket is only up when it means something: while a boost is
	## running (it counts down), or for a short while at a moment you'd want
	## one. Never with Remove Ads (that's 2x for good already).
	_boost_cool = maxf(0.0, _boost_cool - delta)
	if _hard_t > 8.0:
		_hard_t = 0.0
		boost_relevant()
	if _boost_window > 0.0:
		_boost_window -= delta
		if _boost_window <= 0.0:
			_boost_cool = 120.0
	var want := GameState.is_boost_active() or (_boost_window > 0.0 and not GameState.owns_remove_ads)
	want = want and not (_offer_tag.visible and offers.current == "boost") and not riding
	if want and not _boost.visible:
		_boost.visible = true
		_boost.pivot_offset = Vector2(_boost.size.x, 0)
		_boost.scale = Vector2(0.85, 0.85)
		_boost.create_tween().tween_property(_boost, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	elif not want:
		_boost.visible = false


func _sync_play() -> void:
	for n in _play:
		if is_instance_valid(n):
			(n as CanvasItem).visible = not riding
	if not riding and _boost != null:
		_boost.visible = false


# --- Finds -------------------------------------------------------------------------------------------
func show_find(f: int, value: float) -> void:
	var d: Dictionary = Balance.FINDS[f]
	if d.get("core", false):
		return   # the ending has its own screen
	_find_index = f
	for c in _find_card.get_children():
		_find_card.remove_child(c)
		c.queue_free()
	var rc: Color = Balance.rarity(f).color
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_find_card.add_child(v)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 12)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(top)
	var ic := _icon_rect(str(d.icon), 76)
	top.add_child(ic)
	var tv := VBoxContainer.new()
	tv.add_theme_constant_override("separation", 0)
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(tv)
	var head := UiTheme.label("Found · %s" % str(Balance.rarity(f).name).to_lower(), 20, rc.darkened(0.35), 0)
	tv.add_child(head)
	var nm := UiTheme.label(str(d.name), 23, UiTheme.INK, 0)
	UiTheme.sign_text(nm, 23, UiTheme.INK, 0)
	nm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	nm.custom_minimum_size = Vector2(210, 0)
	tv.add_child(nm)
	var fl := UiTheme.label(str(d.flavor), 20, UiTheme.INK.lightened(0.25), 0, false)
	fl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	fl.custom_minimum_size = Vector2(210, 0)
	tv.add_child(fl)
	var val := UiTheme.label("+" + Fmt.num(value) + " cash", 22, UiTheme.ENAMEL_RED.darkened(0.1), 0)
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	v.add_child(val)
	_find_double = null
	if Monetization.is_rewarded_ready(Monetization.PLACEMENT_DOUBLE_FIND):
		_find_double = Button.new()
		_find_double.text = "Double it  +%s" % Fmt.num(value)
		_find_double.custom_minimum_size = Vector2(0, 52)
		UiTheme.style_ticket(_find_double, 20)
		var fi := f
		_find_double.pressed.connect(func(): _double_find(fi))
		v.add_child(_find_double)
		touch.buttons = touch.buttons.filter(func(b): return is_instance_valid(b.control))
		touch.buttons.append({"control": _find_double, "action": func(): _double_find(fi)})
		_find_bar = ProgressBar.new()
		_find_bar.show_percentage = false
		_find_bar.custom_minimum_size = Vector2(0, 5)
		_find_bar.max_value = 1.0
		var bg := StyleBoxFlat.new()
		bg.bg_color = Color(UiTheme.INK, 0.15)
		var fg := StyleBoxFlat.new()
		fg.bg_color = UiTheme.ENAMEL_RED
		_find_bar.add_theme_stylebox_override("background", bg)
		_find_bar.add_theme_stylebox_override("fill", fg)
		v.add_child(_find_bar)
	_find_card.visible = not riding
	_find_card.reset_size()
	_find_card.pivot_offset = Vector2(_find_card.size.x, 0)
	_find_card.rotation = 0.015
	_find_card.scale = Vector2(0.5, 0.5)
	_find_card.create_tween().tween_property(_find_card, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_find_double_t = Balance.FIND_DOUBLE_SECONDS
	_find_t = Balance.FIND_DOUBLE_SECONDS + 0.5
	_hide_offer_for_card()


func _hide_offer_for_card() -> void:
	## One thing at a time in the right-hand column: an offer waits while a
	## find card is up.
	if _offer_tag.visible:
		_offer_tag.visible = false


func _double_find(f: int) -> void:
	if Monetization.is_watching() or f != _find_index:
		return
	Monetization.show_rewarded(Monetization.PLACEMENT_DOUBLE_FIND, func(ok: bool):
		if ok:
			var v := GameState.double_find(f)
			Sound.play("reward", -3.0)
			toast("%s, paid twice: +%s" % [Balance.FINDS[f].name, Fmt.num(v)], UiTheme.AMBER)
			_find_t = 0.6
			if _find_double != null and is_instance_valid(_find_double):
				_find_double.disabled = true
				_find_double.text = "Doubled")
	_sync_touch()


func find_card_up() -> bool:
	return _find_index >= 0


func _update_find_card(delta: float) -> void:
	if _find_index < 0:
		return
	# Never during the lift ride: the card waits (hidden) until you step out.
	_find_card.visible = not riding
	if riding or Monetization.is_watching():
		return
	_find_t -= delta
	_find_double_t -= delta
	if _find_bar != null and is_instance_valid(_find_bar):
		_find_bar.value = clampf(_find_double_t / Balance.FIND_DOUBLE_SECONDS, 0.0, 1.0)
	if _find_double != null and is_instance_valid(_find_double) and _find_double_t <= 0.0:
		_find_double.visible = false
	if _find_t <= 0.0:
		_find_card.visible = false
		_find_index = -1


# --- Shop ------------------------------------------------------------------------------------------------
func open_shop(tab: String = "") -> void:
	if shop != null:
		return
	shop = ShopPanel.new()
	if tab != "":
		shop.tab = tab
	popups.add_child(shop)
	shop.closed.connect(close_shop)
	shop.message.connect(func(t: String): toast(t, UiTheme.AMBER))
	Sound.play("ui_open", -5.0)
	touch.release_all()
	_sync_touch()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func close_shop() -> void:
	if shop == null:
		return
	shop.queue_free()
	popups.remove_child(shop)
	shop = null
	shop_closed.emit()


# --- Popups ---------------------------------------------------------------------------------------------------
func popup(title: String, body: String, buttons: Array) -> Control:
	## buttons: [[text, color, callable]]. Every button closes the popup.
	var wrap := Control.new()
	wrap.mouse_filter = Control.MOUSE_FILTER_STOP
	popups.add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.6)
	wrap.add_child(dim)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var cc := CenterContainer.new()
	wrap.add_child(cc)
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiTheme.iron_panel(30.0))
	cc.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	p.add_child(v)
	var t := UiTheme.label(title, 36, UiTheme.AMBER, 0)
	UiTheme.sign_text(t, 40, UiTheme.AMBER, 6)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var b := UiTheme.label(body, 21, UiTheme.CREAM, 4, false)
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.custom_minimum_size = Vector2(620, 0)
	v.add_child(b)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 14)
	v.add_child(row)
	for bd in buttons:
		var btn := Button.new()
		btn.text = bd[0]
		btn.custom_minimum_size = Vector2(220, 64)
		UiTheme.style_button(btn, bd[1], 22)
		var cb: Callable = bd[2]
		btn.pressed.connect(func():
			wrap.queue_free()
			popups.remove_child(wrap)
			if cb.is_valid():
				cb.call())
		row.add_child(btn)
	touch.release_all()
	_sync_touch()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	return wrap


func fade_to(alpha: float, seconds: float) -> Tween:
	var tw := create_tween()
	tw.tween_property(fade, "color:a", alpha, seconds)
	return tw
