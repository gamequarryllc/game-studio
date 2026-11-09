class_name Hud
extends CanvasLayer
## Everything over the 3D view, in charcoal and ember: the embers counter and
## income, the wind, how much of the forest is gone, the notebook button and the
## timed offer tag under it, the crosshair and what it's on, the phone controls,
## toasts, first-run hints, popups (starter pack, golden critters, the ending).

signal notebook_opened
signal notebook_closed

var keeper: Keeper
var forest: ForestGrid
var touch: TouchControls
var touch_mode := false
var show_desktop_hint := true        # screenshots turn the "click to play" line off
var notebook: Notebook
var offers := AdOffers.new()

var root: Control
var embers_label: Label
var rate_label: Label
var wind_chip: WindChip
var boost_label: Label
var zone_label: Label
var zone_bar: ProgressBar
var notebook_button: Button
var offer_tag: PanelContainer
var crosshair: Crosshair
var target_label: Label
var tool_label: Label
var coach_label: Label
var coach_panel: PanelContainer
var hint_label: Label
var toast_box: VBoxContainer
var popups: Control
var rotate_overlay: Control
var find_tag: PanelContainer

var _offer_title: Label
var _offer_bar: ProgressBar
var _offer_stamp: Label
var _offer_t := 0.0
var _refresh_t := 0.0
var _shown_embers := 0.0
var _bump := 0.0
var _find_amount := 0.0
var _find_t := 0.0
var _find_label: Label


class Crosshair:
	extends Control
	var hot := false
	var ok := true
	var spin := 0.0

	func _draw() -> void:
		var c := size * 0.5
		var col := Color(1.0, 0.78, 0.45, 0.95) if ok else Color(0.75, 0.7, 0.75, 0.6)
		draw_arc(c, 9.0, 0, TAU, 32, Color(0, 0, 0, 0.45), 5.0, true)
		draw_arc(c, 9.0, 0, TAU, 32, col, 2.5, true)
		draw_circle(c, 2.2, col)
		if hot:
			var ring := Color(1.0, 0.5, 0.12)
			for k in 3:
				var a := spin + TAU * k / 3.0
				draw_arc(c, 16.0, a, a + 1.2, 12, ring, 3.5, true)


class WindChip:
	extends Control
	## A little arrow showing which way the wind blows, relative to the camera.
	var angle := 0.0
	var strength := 0.5

	func _draw() -> void:
		var c := Vector2(26, size.y * 0.5)
		draw_circle(c, 20.0, Color(UiTheme.SOOT, 0.6))
		draw_arc(c, 20.0, 0, TAU, 32, Color(UiTheme.EMBER, 0.5), 2.0, true)
		var d := Vector2(sin(angle), -cos(angle))
		var tip := c + d * 14.0
		var tail := c - d * 12.0
		var side := Vector2(-d.y, d.x) * 7.0
		draw_line(tail, tip, UiTheme.CREAM, 3.0, true)
		draw_colored_polygon(PackedVector2Array([tip + d * 2.0, tip - d * 7.0 + side, tip - d * 7.0 - side]), UiTheme.EMBER_HOT)
		var f := UiTheme.bold()
		draw_string(f, Vector2(54, size.y * 0.5 + 7), "Wind", HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color(UiTheme.CREAM, 0.85))
		for k in 3:
			var on := strength > 0.3 + 0.2 * k
			draw_rect(Rect2(Vector2(102 + k * 9, size.y * 0.5 + 6 - 6 - k * 4), Vector2(6, 6 + k * 4)),
				UiTheme.EMBER_HOT if on else Color(UiTheme.ASH, 0.35))


func _ready() -> void:
	layer = 10
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.make_theme()
	add_child(root)
	_build_top()
	_build_center()
	_build_find_tag()
	touch = TouchControls.new()
	root.add_child(touch)
	touch.buttons = [
		{"control": notebook_button, "action": toggle_notebook},
		{"control": offer_tag, "action": take_offer},
		{"control": find_tag, "action": take_find},
	]
	toast_box = VBoxContainer.new()
	toast_box.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	toast_box.offset_top = 92
	toast_box.offset_left = -420
	toast_box.offset_right = 420
	toast_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_box.add_theme_constant_override("separation", 6)
	root.add_child(toast_box)
	popups = Control.new()
	popups.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	popups.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(popups)
	_build_rotate_overlay()
	set_touch_mode(DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
		or OS.has_feature("web_ios") or OS.has_feature("web_android"))
	Monetization.purchase_error.connect(func(_id, reason): toast("Purchase failed: %s" % reason))
	Monetization.purchase_granted.connect(func(_id, text):
		Sound.play("reward", -3.0)
		toast(text)
		if notebook != null:
			notebook.rebuild())
	_shown_embers = GameState.embers


# =====================================================================================
# Layout
# =====================================================================================
func _build_top() -> void:
	var left := PanelContainer.new()
	left.add_theme_stylebox_override("panel", UiTheme.panel(Color(UiTheme.CHARCOAL, 0.82), 22, Color(UiTheme.EMBER, 0.6), 0.28, 16.0))
	left.position = Vector2(12, 10)
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(left)
	var lh := HBoxContainer.new()
	lh.add_theme_constant_override("separation", 8)
	left.add_child(lh)
	var icon := UiTheme.label(40)
	icon.text = "🔥"
	lh.add_child(icon)
	var lv := VBoxContainer.new()
	lv.add_theme_constant_override("separation", -4)
	lh.add_child(lv)
	embers_label = UiTheme.label(40, UiTheme.EMBER_HOT)
	embers_label.custom_minimum_size = Vector2(150, 0)
	lv.add_child(embers_label)
	rate_label = UiTheme.label(18, UiTheme.ASH, UiTheme.regular())
	lv.add_child(rate_label)
	embers_label.pivot_offset = Vector2(0, 24)

	wind_chip = WindChip.new()
	wind_chip.position = Vector2(16, 102)
	wind_chip.size = Vector2(140, 46)
	wind_chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(wind_chip)
	boost_label = UiTheme.label(20, UiTheme.EMBER_HOT, null, 6)
	boost_label.position = Vector2(18, 150)
	root.add_child(boost_label)

	var mid := PanelContainer.new()
	mid.add_theme_stylebox_override("panel", UiTheme.panel(Color(UiTheme.CHARCOAL, 0.72), 16, Color(UiTheme.EMBER, 0.3), 0.0, 14.0))
	mid.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	mid.offset_left = -230
	mid.offset_right = 230
	mid.offset_top = 10
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mid.grow_horizontal = Control.GROW_DIRECTION_BOTH
	root.add_child(mid)
	var mv := VBoxContainer.new()
	mv.add_theme_constant_override("separation", 4)
	mid.add_child(mv)
	zone_label = UiTheme.label(19, UiTheme.CREAM)
	zone_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mv.add_child(zone_label)
	zone_bar = ProgressBar.new()
	zone_bar.show_percentage = false
	zone_bar.max_value = 1.0
	zone_bar.custom_minimum_size = Vector2(420, 16)
	zone_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	UiTheme.bar_styles(zone_bar, UiTheme.EMBER)
	mv.add_child(zone_bar)

	notebook_button = Button.new()
	notebook_button.text = "📓 Notebook"
	notebook_button.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	notebook_button.offset_left = -226
	notebook_button.offset_right = -14
	notebook_button.offset_top = 12
	notebook_button.offset_bottom = 76
	UiTheme.ember_button(notebook_button, UiTheme.EMBER, 26)
	notebook_button.pressed.connect(toggle_notebook)
	root.add_child(notebook_button)
	_build_offer_tag()


func _build_offer_tag() -> void:
	## Hangs under the notebook button now and then: a free reward for a short
	## ad, saying exactly what it gets you. Tap it (or press B).
	offer_tag = PanelContainer.new()
	offer_tag.add_theme_stylebox_override("panel", UiTheme.panel(Color(0.16, 0.08, 0.05, 0.94), 18, UiTheme.EMBER_HOT, 0.5, 14.0))
	offer_tag.anchor_left = 1.0
	offer_tag.anchor_right = 1.0
	offer_tag.offset_left = -350
	offer_tag.offset_right = -14
	offer_tag.offset_top = 88
	offer_tag.grow_horizontal = Control.GROW_DIRECTION_BEGIN
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
	_offer_title = UiTheme.label(22, UiTheme.CREAM)
	_offer_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_offer_title.custom_minimum_size = Vector2(300, 0)
	v.add_child(_offer_title)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(h)
	_offer_bar = ProgressBar.new()
	_offer_bar.show_percentage = false
	_offer_bar.max_value = 1.0
	_offer_bar.custom_minimum_size = Vector2(0, 14)
	_offer_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_offer_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_offer_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	UiTheme.bar_styles(_offer_bar, UiTheme.EMBER_HOT)
	h.add_child(_offer_bar)
	var stamp := PanelContainer.new()
	var ss := UiTheme.panel(UiTheme.EMBER, 12, Color(0, 0, 0, 0), 0.0, 10.0)
	stamp.add_theme_stylebox_override("panel", ss)
	stamp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(stamp)
	_offer_stamp = UiTheme.label(19, UiTheme.SOOT)
	stamp.add_child(_offer_stamp)


func _build_center() -> void:
	crosshair = Crosshair.new()
	crosshair.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	crosshair.offset_left = -30
	crosshair.offset_right = 30
	crosshair.offset_top = -30
	crosshair.offset_bottom = 30
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(crosshair)
	target_label = UiTheme.label(20, UiTheme.CREAM, null, 7)
	target_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	target_label.offset_left = -300
	target_label.offset_right = 300
	target_label.offset_top = 30
	target_label.offset_bottom = 90
	target_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(target_label)

	coach_panel = PanelContainer.new()
	coach_panel.add_theme_stylebox_override("panel", UiTheme.panel(Color(UiTheme.CHARCOAL, 0.85), 20, Color(UiTheme.EMBER_HOT, 0.8), 0.45, 20.0))
	coach_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	coach_panel.offset_left = -330
	coach_panel.offset_right = 330
	coach_panel.offset_top = -190
	coach_panel.offset_bottom = -110
	coach_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	coach_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	coach_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	coach_panel.visible = false
	root.add_child(coach_panel)
	coach_label = UiTheme.label(25, UiTheme.CREAM)
	coach_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	coach_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	coach_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	coach_panel.add_child(coach_label)

	var tp := PanelContainer.new()
	tp.add_theme_stylebox_override("panel", UiTheme.panel(Color(UiTheme.CHARCOAL, 0.72), 16, Color(UiTheme.EMBER, 0.35), 0.0, 16.0))
	tp.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	tp.offset_left = -170
	tp.offset_right = 170
	tp.offset_top = -56
	tp.offset_bottom = -12
	tp.grow_horizontal = Control.GROW_DIRECTION_BOTH
	tp.grow_vertical = Control.GROW_DIRECTION_BEGIN
	tp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(tp)
	tool_label = UiTheme.label(21, UiTheme.CREAM)
	tool_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tp.add_child(tool_label)

	hint_label = UiTheme.label(19, Color(1, 1, 1, 0.88), null, 6)
	hint_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	hint_label.offset_left = -440
	hint_label.offset_right = 440
	hint_label.offset_top = 200
	hint_label.offset_bottom = 270
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.text = "Click to play\nWASD walk · mouse turns the camera · hold left click to burn · Space jump\nN or Tab: the notebook · B: take an offer · M: mute · Esc frees the mouse"
	root.add_child(hint_label)


func _build_find_tag() -> void:
	## "Golden fox! Double it for a short ad" (shows for a few seconds after a golden critter).
	find_tag = PanelContainer.new()
	find_tag.add_theme_stylebox_override("panel", UiTheme.panel(Color(0.2, 0.14, 0.04, 0.94), 18, Color(1.0, 0.85, 0.3), 0.5, 16.0))
	find_tag.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	find_tag.offset_left = -200
	find_tag.offset_right = 200
	find_tag.offset_top = -150
	find_tag.offset_bottom = -76
	find_tag.grow_horizontal = Control.GROW_DIRECTION_BOTH
	find_tag.mouse_filter = Control.MOUSE_FILTER_STOP
	find_tag.visible = false
	find_tag.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT \
				and e.device != InputEvent.DEVICE_ID_EMULATION:
			take_find())
	root.add_child(find_tag)
	_find_label = UiTheme.label(22, Color(1.0, 0.92, 0.6))
	_find_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	find_tag.add_child(_find_label)


func _build_rotate_overlay() -> void:
	rotate_overlay = ColorRect.new()
	(rotate_overlay as ColorRect).color = Color(UiTheme.CHARCOAL, 0.98)
	rotate_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rotate_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	rotate_overlay.visible = false
	root.add_child(rotate_overlay)
	var l := UiTheme.label(64, UiTheme.EMBER_HOT)
	l.text = "📱🔄\n\nTurn your phone sideways\nto play"
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rotate_overlay.add_child(l)


func set_touch_mode(on: bool) -> void:
	touch_mode = on
	touch.visible = on and notebook == null
	hint_label.visible = not on
	for b in touch.buttons:
		(b.control as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE if on else Control.MOUSE_FILTER_STOP


func is_blocking() -> bool:
	return notebook != null or popups.get_child_count() > 0


# =====================================================================================
# Per frame
# =====================================================================================
func _process(delta: float) -> void:
	var vp := root.get_viewport_rect().size
	rotate_overlay.visible = touch_mode and vp.x < vp.y
	if keeper == null:
		return
	crosshair.hot = keeper.firing
	crosshair.spin = fmod(crosshair.spin + delta * 6.0, TAU)
	crosshair.queue_redraw()
	# The embers counter rolls up, and swells a little on a big payday.
	var diff := GameState.embers - _shown_embers
	if absf(diff) > 0.5:
		_shown_embers += diff * minf(1.0, delta * 8.0)
		if diff > 0.0:
			_bump = minf(1.0, _bump + delta * clampf(diff / maxf(_shown_embers, 50.0) * 6.0, 0.0, 3.0))
	else:
		_shown_embers = GameState.embers
	_bump = move_toward(_bump, 0.0, delta * 1.5)
	embers_label.scale = Vector2.ONE * (1.0 + 0.18 * _bump)
	embers_label.text = Fmt.num(_shown_embers)
	_update_offer(delta)
	_update_find(delta)
	_refresh_t += delta
	if _refresh_t >= 0.15:
		_refresh_t = 0.0
		_refresh()


func _refresh() -> void:
	var rate := GameState.income_per_second_now()
	rate_label.text = "+%s / sec" % Fmt.num(rate) if rate > 0.05 else "Light the cursed grass!"
	if forest != null:
		var z := forest.zone_at(keeper.position.x, keeper.position.z)
		zone_label.text = "%s  ·  %d%% of the forest burned" % [Balance.ZONES[z].name, int(forest.progress() * 100.0)]
		zone_bar.value = forest.progress()
		var y := keeper.cam_yaw
		var fwd := Vector2(-sin(y), -cos(y))
		var right := Vector2(cos(y), -sin(y))
		wind_chip.angle = atan2(forest.wind.dot(right), forest.wind.dot(fwd))
		wind_chip.strength = forest.wind_strength
		wind_chip.queue_redraw()
	var running: Array = []
	if GameState.is_boost_active():
		running.append("⚡ 2x fire  " + Fmt.duration(GameState.boost_seconds_left()))
	if GameState.is_helper_rush_active():
		running.append("✨ helpers 3x  " + Fmt.duration(GameState.helper_rush_seconds_left()))
	if GameState.owns_remove_ads_2x:
		running.append("🚫 permanent 2x")
	boost_label.text = "\n".join(running)
	var td := GameState.tool_def()
	tool_label.text = "%s %s  ·  heat %s" % ["🔥" if GameState.tool_index < 4 else td.icon, td.name, Fmt.num(GameState.tool_heat())]
	_update_target()
	var free := not is_blocking()
	notebook_button.visible = free
	hint_label.visible = not touch_mode and free and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and show_desktop_hint
	touch.heat_ok = crosshair.ok


func _update_target() -> void:
	if forest == null:
		return
	var cell: int = keeper.aim.cell
	var text := ""
	var ok := true
	if cell >= 0:
		var k := forest.kind[cell]
		var st := forest.state[cell]
		if st == ForestGrid.BURNING:
			text = "🔥 Burning!"
		elif st == ForestGrid.ASH:
			text = "Ash. Flowers soon."
		elif st == ForestGrid.MEADOW:
			text = "🌼 Meadow"
			ok = false
		elif Balance.flammable(k):
			var p: Dictionary = Balance.PLANTS[k]
			if forest.can_light(cell, GameState.tool_heat()):
				text = "%s %s  ·  🔥 %s" % [p.icon, p.name, Fmt.num(float(p.embers) * GameState.ember_mult())]
			else:
				ok = false
				var need := _tool_for(forest.thresh[cell])
				var damp := " (damp by the water)" if forest.damp[cell] == 1 else ""
				text = "%s %s%s\nToo tough for your %s%s" % [p.icon, p.name, damp, GameState.tool_def().name,
					": try the %s" % need if need != "" else ""]
		else:
			ok = false
	if not keeper.aim.in_range and text == "":
		text = "Out of reach: walk closer"
	crosshair.ok = ok
	if target_label.text != text:
		target_label.text = text


func _tool_for(thresh: float) -> String:
	for i in range(GameState.tool_index + 1, Balance.TOOLS.size()):
		if float(Balance.TOOLS[i].heat) * GameState.upgrade_mult("heat") / Balance.COOL * 0.97 >= thresh:
			return str(Balance.TOOLS[i].name)
	return ""


func set_coach(text: String) -> void:
	var show := text != "" and not is_blocking()
	coach_panel.visible = show
	if coach_label.text != text:
		coach_label.text = text


# =====================================================================================
# Toasts
# =====================================================================================
func toast(text: String) -> void:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiTheme.panel(Color(UiTheme.CHARCOAL, 0.9), 16, Color(UiTheme.EMBER, 0.6), 0.3, 18.0))
	p.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := UiTheme.label(22, UiTheme.CREAM)
	l.text = text
	p.add_child(l)
	toast_box.add_child(p)
	while toast_box.get_child_count() > 3:
		var old := toast_box.get_child(0)
		toast_box.remove_child(old)
		old.queue_free()
	var tw := p.create_tween()
	tw.tween_interval(2.8)
	tw.tween_property(p, "modulate:a", 0.0, 0.5)
	tw.tween_callback(p.queue_free)


# =====================================================================================
# The notebook
# =====================================================================================
func toggle_notebook() -> void:
	if notebook != null:
		close_notebook()
	elif not is_blocking():
		open_notebook()


func open_notebook(tab: String = "") -> void:
	if notebook != null:
		return
	Sound.play("page", -2.0)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	keeper.input_enabled = false
	keeper.firing = false
	touch.release_all()
	touch.visible = false
	offer_tag.visible = false
	coach_panel.visible = false
	notebook = Notebook.new()
	notebook.hud = self
	if tab != "":
		notebook.tab = tab
	notebook.closed.connect(close_notebook)
	root.add_child(notebook)
	root.move_child(notebook, popups.get_index())
	notebook_opened.emit()


func close_notebook() -> void:
	if notebook == null:
		return
	Sound.play("page", -4.0, 0.85)
	notebook.queue_free()
	notebook = null
	if popups.get_child_count() == 0:
		keeper.input_enabled = true
		touch.visible = touch_mode
	if offers.current != "":
		offer_tag.visible = true
	GameState.save_game()
	notebook_closed.emit()


# =====================================================================================
# Rewarded ads and the offer tag
# =====================================================================================
func _update_offer(delta: float) -> void:
	var playing := not is_blocking() and keeper.input_enabled and not Monetization.is_watching()
	match offers.update(delta, playing):
		1:
			_show_offer_tag()
		-1:
			_hide_offer_tag()
	if offers.current == "" or not offer_tag.visible:
		notebook_button.self_modulate = Color.WHITE
		return
	offer_tag.visible = playing or offers.watching
	_offer_t += delta
	var title := AdOffers.headline(offers.current)
	if _offer_title.text != title:
		_offer_title.text = title
	var stamp := "📺 Watch ad" if touch_mode else "📺 Press B"
	if _offer_stamp.text != stamp:
		_offer_stamp.text = stamp
	_offer_bar.value = offers.time_left / Balance.OFFER_LIFETIME
	var breath := 0.5 + 0.5 * sin(_offer_t * 3.2)
	offer_tag.pivot_offset = Vector2(offer_tag.size.x * 0.5, 0.0)
	offer_tag.scale = Vector2.ONE * (1.0 + 0.025 * breath)
	notebook_button.self_modulate = Color.WHITE.lerp(Color(1.2, 1.1, 0.95), breath)


func _show_offer_tag() -> void:
	Sound.play("offer", -6.0)
	_offer_t = 0.0
	offer_tag.visible = true
	offer_tag.modulate.a = 0.0
	offer_tag.offset_top = 50
	var tw := offer_tag.create_tween()
	tw.set_parallel(true)
	tw.tween_property(offer_tag, "modulate:a", 1.0, 0.25)
	tw.tween_property(offer_tag, "offset_top", 88.0, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


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
	keeper.input_enabled = false
	keeper.firing = false
	touch.release_all()
	Monetization.watch_for_reward(kind, func(ok: bool, text: String):
		if from_offer:
			offers.watching = false
			if ok:
				offers.taken()
				_hide_offer_tag()
		if not is_blocking():
			keeper.input_enabled = true
		if ok:
			Sound.play("reward", -3.0)
		toast(text if ok else "No reward this time")
		if notebook != null:
			notebook.refresh())


func show_golden(amount: float) -> void:
	## A golden critter dropped embers: offer to double them for a short ad.
	_find_amount = amount
	_find_t = 9.0
	find_tag.visible = true
	find_tag.modulate.a = 1.0


func _update_find(delta: float) -> void:
	if not find_tag.visible:
		return
	if not is_blocking():
		_find_t -= delta
	_find_label.text = "✨ Golden critter! +🔥 %s\n📺 %s to double it (%ds)" % [Fmt.num(_find_amount), "Tap" if touch_mode else "Click or press G", int(ceil(_find_t))]
	if _find_t <= 0.0 or is_blocking():
		find_tag.visible = _find_t > 0.0 and not is_blocking()


func take_find() -> void:
	if not find_tag.visible or Monetization.is_watching() or is_blocking():
		return
	find_tag.visible = false
	var amount := _find_amount
	keeper.input_enabled = false
	keeper.firing = false
	touch.release_all()
	Monetization.show_rewarded(Monetization.PLACEMENT_DOUBLE_FIND, func(ok: bool):
		if not is_blocking():
			keeper.input_enabled = true
		if ok:
			GameState.grant_embers(amount)
			Sound.play("reward", -3.0)
			toast("✨ Doubled! +🔥 %s" % Fmt.num(amount))
		else:
			toast("No reward this time"))


# =====================================================================================
# Popups
# =====================================================================================
func _popup(title: String, body: String) -> Dictionary:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	keeper.input_enabled = false
	keeper.firing = false
	touch.release_all()
	touch.visible = false
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.6)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	popups.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(620, 0)
	panel.add_theme_stylebox_override("panel", UiTheme.panel(Color(0.12, 0.09, 0.09, 0.97), 24, UiTheme.EMBER_HOT, 0.5, 30.0))
	center.add_child(panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	panel.add_child(v)
	var t := UiTheme.label(46, UiTheme.EMBER_HOT, UiTheme.hand())
	t.text = title
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var b := UiTheme.label(22, UiTheme.CREAM, UiTheme.regular())
	b.text = body
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.custom_minimum_size = Vector2(560, 0)
	v.add_child(b)
	return {"root": dim, "box": v}


func _popup_button(p: Dictionary, text: String, color: Color, cb: Callable) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(0, 66)
	UiTheme.ember_button(btn, color, 26)
	btn.pressed.connect(cb)
	p.box.add_child(btn)
	return btn


func close_popup(p: Dictionary) -> void:
	var r: Control = p.root
	popups.remove_child(r)
	r.queue_free()
	if popups.get_child_count() == 0 and notebook == null:
		keeper.input_enabled = true
		touch.visible = touch_mode


func show_starter_offer() -> void:
	var p := _popup("A gift for new keepers",
		"The Fire-Keeper's Starter Pack: +🔥 %s embers right away, and the Rainbow Sparkler, a striped matchstick that fizzes in four colours.\nOne time only." % Fmt.num(Balance.STARTER_EMBERS))
	_popup_button(p, "🎁 Get it for %s" % Monetization.price(Monetization.PRODUCT_STARTER), UiTheme.EMBER, func():
		close_popup(p)
		Monetization.buy(Monetization.PRODUCT_STARTER))
	_popup_button(p, "Maybe later", UiTheme.CHARCOAL_3, func(): close_popup(p)).add_theme_color_override("font_color", UiTheme.CREAM)


func show_ending() -> void:
	var body := "The Elder Tree has burned down, the curse is lifted, and the village is free.\nWhere the cursed forest stood, there's a valley of flowers.\n\n⏱ %s played\n🔥 %s embers earned\n🌼 %s patches of forest turned to meadow\n🐇 %d critters scampered to safety" % [
		Fmt.duration(GameState.play_time), Fmt.num(GameState.lifetime_embers), Fmt.num(float(GameState.cells_burned)), GameState.critters_saved]
	var p := _popup("The curse is lifted!", body)
	_popup_button(p, "Walk through the meadow", UiTheme.MEADOW, func(): close_popup(p))
