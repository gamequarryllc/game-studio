class_name Hud
extends CanvasLayer
## Everything over the 3D view. Burnt-wood signs for what stays on screen (the
## embers counter, where you are and how much has burned, the notebook, the
## tool in hand), paper for what comes and goes (notes, offer tags, toasts),
## and the keeper's handwriting for first-run hints, placed beside the control
## they're about with a drawn finger. Layout is deliberately lopsided: signs
## hang top left, the notebook top right, the middle stays clear for the fire.

signal notebook_opened
signal notebook_closed

var keeper: Keeper
var forest: ForestGrid
var touch: TouchControls
var touch_mode := false
var show_desktop_hint := true        # screenshots turn the "click to play" note off
var notebook: Notebook
var offers := AdOffers.new()

var root: Control
var embers_label: Label
var rate_label: Label
var coal_icon: TextureRect
var ember_plank: PanelContainer
var zone_plank: PanelContainer
var wind_chip: UiParts.WindDisc
var boost_box: VBoxContainer
var zone_label: Label
var zone_pct: Label
var zone_bar: UiParts.Fuse
var notebook_button: Button
var offer_tag: PanelContainer
var crosshair: Crosshair
var target_label: RichTextLabel
var tool_plank: PanelContainer
var tool_icon: TextureRect
var tool_label: Label
var tool_heat: Label
var coach_panel: PanelContainer
var coach_label: Label
var coach_finger: UiParts.Finger
var hint_panel: PanelContainer
var toast_box: VBoxContainer
var popups: Control
var rotate_overlay: Control
var find_tag: PanelContainer
var string_line: Line2D

var _offer_title: RichTextLabel
var _offer_bar: UiParts.Fuse
var _offer_stamp: Label
var _offer_t := 0.0
var _refresh_t := 0.0
var _shown_embers := 0.0
var _bump := 0.0
var _find_amount := 0.0
var _find_t := 0.0
var _find_label: RichTextLabel
var _coach_anchor := ""
var _coach_text := ""
var _boost_keys := ""


class Crosshair:
	extends Control
	## A small inked circle with a gap, like a mark in the margin.
	var hot := false
	var ok := true
	var spin := 0.0

	func _draw() -> void:
		var c := size * 0.5
		var col := UiTheme.CREAM if ok else Color(UiTheme.ASH, 0.75)
		for pass_k in 2:
			var w := 5.0 if pass_k == 0 else 2.2
			var cc := UiTheme.INK if pass_k == 0 else col
			draw_arc(c, 9.0, 0.5, TAU - 0.2, 24, cc, w, true)
			draw_circle(c, 2.6 if pass_k == 0 else 1.6, cc)
		if hot:
			for k in 3:
				var a := spin + TAU * k / 3.0
				draw_arc(c, 16.0, a, a + 0.9, 10, UiTheme.INK, 5.0, true)
				draw_arc(c, 16.0, a, a + 0.9, 10, UiTheme.CORE, 2.4, true)


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
	_build_coach()
	toast_box = VBoxContainer.new()
	toast_box.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	toast_box.offset_top = 16
	toast_box.offset_left = -300
	toast_box.offset_right = 340
	toast_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_box.add_theme_constant_override("separation", 10)
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
		if notebook != null:
			notebook.rebuild())
	_shown_embers = GameState.embers


# =====================================================================================
# Layout
# =====================================================================================
func _build_top() -> void:
	ember_plank = PanelContainer.new()
	ember_plank.add_theme_stylebox_override("panel", UiTheme.PlankBox.new(11, UiTheme.PLANK, 20.0, 8.0))
	ember_plank.position = Vector2(12, 10)
	ember_plank.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ember_plank)
	var lh := HBoxContainer.new()
	lh.add_theme_constant_override("separation", 10)
	ember_plank.add_child(lh)
	coal_icon = TextureRect.new()
	coal_icon.texture = UiTheme.icon("coal")
	coal_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	coal_icon.custom_minimum_size = Vector2(50, 50)
	coal_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	coal_icon.pivot_offset = Vector2(25, 25)
	lh.add_child(coal_icon)
	var lv := VBoxContainer.new()
	lv.add_theme_constant_override("separation", -8)
	lh.add_child(lv)
	embers_label = UiTheme.label(UiTheme.T_HUGE - 6, UiTheme.CREAM, UiTheme.numbers())
	embers_label.custom_minimum_size = Vector2(150, 0)
	lv.add_child(embers_label)
	rate_label = UiTheme.label(UiTheme.T_SMALL + 1, UiTheme.ASH, UiTheme.body())
	lv.add_child(rate_label)
	embers_label.pivot_offset = Vector2(0, 26)

	zone_plank = PanelContainer.new()
	zone_plank.add_theme_stylebox_override("panel", UiTheme.PlankBox.new(23, Color("#33261F"), 18.0, 6.0))
	zone_plank.position = Vector2(30, 98)
	zone_plank.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(zone_plank)
	var zv := VBoxContainer.new()
	zv.add_theme_constant_override("separation", 0)
	zone_plank.add_child(zv)
	var zh := HBoxContainer.new()
	zh.add_theme_constant_override("separation", 10)
	zv.add_child(zh)
	zone_label = UiTheme.label(UiTheme.T_BODY, UiTheme.CREAM, UiTheme.bold())
	zh.add_child(zone_label)
	zone_pct = UiTheme.label(23, UiTheme.CORE, UiTheme.hand())
	zh.add_child(zone_pct)
	zone_bar = UiParts.Fuse.new()
	zone_bar.custom_minimum_size = Vector2(230, 16)
	zone_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	zv.add_child(zone_bar)

	wind_chip = UiParts.WindDisc.new()
	wind_chip.position = Vector2(16, 166)
	wind_chip.size = Vector2(140, 48)
	wind_chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(wind_chip)
	boost_box = VBoxContainer.new()
	boost_box.position = Vector2(18, 220)
	boost_box.add_theme_constant_override("separation", 6)
	boost_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(boost_box)

	notebook_button = Button.new()
	notebook_button.text = "Notebook"
	notebook_button.icon = UiTheme.icon("notebook")
	notebook_button.expand_icon = false
	notebook_button.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	notebook_button.offset_left = -214
	notebook_button.offset_right = -16
	notebook_button.offset_top = 12
	notebook_button.offset_bottom = 78
	UiTheme.plank_button(notebook_button, 41, UiTheme.T_LABEL + 2, Color("#3A2A20"))
	notebook_button.add_theme_constant_override("icon_max_width", 46)
	notebook_button.pressed.connect(toggle_notebook)
	root.add_child(notebook_button)
	_build_offer_tag()


func _build_offer_tag() -> void:
	## Hangs on a string under the notebook now and then: a free reward for a
	## short ad, saying exactly what it gets you. Tap or click it.
	string_line = Line2D.new()
	string_line.width = 2.0
	string_line.default_color = UiTheme.CREAM
	string_line.visible = false
	root.add_child(string_line)
	offer_tag = PanelContainer.new()
	var paper := UiTheme.PaperBox.new(57, 16.0)
	paper.content_margin_top = 14
	paper.scorch = 0.5
	paper.tear = 1.5
	offer_tag.add_theme_stylebox_override("panel", paper)
	offer_tag.anchor_left = 1.0
	offer_tag.anchor_right = 1.0
	offer_tag.offset_left = -326
	offer_tag.offset_right = -30
	offer_tag.offset_top = 112
	offer_tag.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	offer_tag.mouse_filter = Control.MOUSE_FILTER_STOP
	offer_tag.visible = false
	offer_tag.rotation = 0.035
	offer_tag.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT \
				and e.device != InputEvent.DEVICE_ID_EMULATION:
			take_offer())
	root.add_child(offer_tag)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	offer_tag.add_child(v)
	_offer_title = UiTheme.rich(UiTheme.T_BODY + 1, UiTheme.INK, UiTheme.bold())
	_offer_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_offer_title.custom_minimum_size = Vector2(262, 0)
	v.add_child(_offer_title)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(h)
	var lantern := TextureRect.new()
	lantern.texture = UiTheme.icon("magic_lantern")
	lantern.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	lantern.custom_minimum_size = Vector2(34, 34)
	lantern.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(lantern)
	_offer_stamp = UiTheme.label(24, UiTheme.STAMP, UiTheme.hand())
	h.add_child(_offer_stamp)
	_offer_bar = UiParts.Fuse.new()
	_offer_bar.custom_minimum_size = Vector2(90, 14)
	_offer_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_offer_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_offer_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(_offer_bar)


func _build_center() -> void:
	crosshair = Crosshair.new()
	crosshair.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	crosshair.offset_left = -30
	crosshair.offset_right = 30
	crosshair.offset_top = -30
	crosshair.offset_bottom = 30
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(crosshair)
	# What the crosshair is on: above it, never over the keeper below.
	target_label = UiTheme.rich(UiTheme.T_BODY + 1, UiTheme.CREAM, UiTheme.bold(), 7)
	target_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	target_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	target_label.offset_left = -320
	target_label.offset_right = 320
	target_label.offset_top = -92
	target_label.offset_bottom = -30
	target_label.fit_content = false
	target_label.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	root.add_child(target_label)

	tool_plank = PanelContainer.new()
	tool_plank.add_theme_stylebox_override("panel", UiTheme.PlankBox.new(77, Color("#30231C"), 18.0, 5.0))
	tool_plank.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	tool_plank.offset_left = -150
	tool_plank.offset_right = 150
	tool_plank.offset_top = -62
	tool_plank.offset_bottom = -14
	tool_plank.grow_horizontal = Control.GROW_DIRECTION_BOTH
	tool_plank.grow_vertical = Control.GROW_DIRECTION_BEGIN
	tool_plank.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(tool_plank)
	var th := HBoxContainer.new()
	th.add_theme_constant_override("separation", 10)
	th.alignment = BoxContainer.ALIGNMENT_CENTER
	tool_plank.add_child(th)
	tool_icon = TextureRect.new()
	tool_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tool_icon.custom_minimum_size = Vector2(36, 36)
	tool_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	th.add_child(tool_icon)
	tool_label = UiTheme.label(UiTheme.T_LABEL, UiTheme.CREAM, UiTheme.display())
	th.add_child(tool_label)
	tool_heat = UiTheme.label(22, UiTheme.ASH, UiTheme.hand())
	th.add_child(tool_heat)

	hint_panel = PanelContainer.new()
	var hp := UiTheme.PaperBox.new(91, 18.0)
	hp.tape = true
	hint_panel.add_theme_stylebox_override("panel", hp)
	hint_panel.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	hint_panel.offset_left = 26
	hint_panel.offset_right = 470
	hint_panel.offset_top = -200
	hint_panel.offset_bottom = -40
	hint_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	hint_panel.rotation = -0.015
	hint_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hint_panel)
	var hv := VBoxContainer.new()
	hv.add_theme_constant_override("separation", 2)
	hint_panel.add_child(hv)
	var ht := UiTheme.label(UiTheme.T_TITLE, UiTheme.INK, UiTheme.display())
	ht.text = "Click to play"
	hv.add_child(ht)
	var hb := UiTheme.label(UiTheme.T_BODY - 1, UiTheme.INK, UiTheme.body())
	hb.text = "WASD walks, the mouse looks round,\nhold the left button to burn, space jumps.\nN opens the notebook, M mutes,\nEsc lets go of the mouse."
	hv.add_child(hb)


func _build_find_tag() -> void:
	## A golden critter dropped embers: offer to double them (shows for a few seconds).
	find_tag = PanelContainer.new()
	var paper := UiTheme.PaperBox.new(63, 16.0)
	paper.fill = Color("#F2DFA8")
	paper.tape = true
	find_tag.add_theme_stylebox_override("panel", paper)
	find_tag.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	find_tag.offset_left = 40
	find_tag.offset_right = 420
	find_tag.offset_top = -190
	find_tag.offset_bottom = -110
	find_tag.rotation = -0.03
	find_tag.mouse_filter = Control.MOUSE_FILTER_STOP
	find_tag.visible = false
	find_tag.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT \
				and e.device != InputEvent.DEVICE_ID_EMULATION:
			take_find())
	root.add_child(find_tag)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	find_tag.add_child(h)
	var hare := TextureRect.new()
	hare.texture = UiTheme.icon("hare")
	hare.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	hare.custom_minimum_size = Vector2(54, 54)
	hare.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(hare)
	_find_label = UiTheme.rich(UiTheme.T_BODY, UiTheme.INK, UiTheme.bold())
	_find_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_find_label.custom_minimum_size = Vector2(290, 0)
	h.add_child(_find_label)


func _build_coach() -> void:
	## First-run hints: a scrap of paper in the keeper's hand, beside the control
	## it's about, with a drawn finger pressing that control.
	coach_panel = PanelContainer.new()
	var p := UiTheme.PaperBox.new(71, 14.0)
	p.tape = true
	p.scorch = 0.6
	coach_panel.add_theme_stylebox_override("panel", p)
	coach_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	coach_panel.visible = false
	root.add_child(coach_panel)
	coach_label = UiTheme.label(27, UiTheme.HAND_INK, UiTheme.hand())
	coach_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	coach_label.custom_minimum_size = Vector2(230, 0)
	coach_panel.add_child(coach_label)
	coach_finger = UiParts.Finger.new()
	coach_finger.visible = false
	root.add_child(coach_finger)


func _build_rotate_overlay() -> void:
	rotate_overlay = ColorRect.new()
	(rotate_overlay as ColorRect).color = UiTheme.CHAR
	rotate_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rotate_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	rotate_overlay.visible = false
	root.add_child(rotate_overlay)
	var v := VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 18)
	rotate_overlay.add_child(v)
	var ic := TextureRect.new()
	ic.texture = UiTheme.icon("phone_turn")
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	ic.custom_minimum_size = Vector2(0, 140)
	v.add_child(ic)
	var l := UiTheme.label(UiTheme.T_BIG, UiTheme.PAPER, UiTheme.display())
	l.text = "Turn your phone sideways"
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	var l2 := UiTheme.label(26, UiTheme.ASH, UiTheme.hand())
	l2.text = "the forest is wider than it is tall"
	l2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l2)


func set_touch_mode(on: bool) -> void:
	touch_mode = on
	touch.visible = on and notebook == null
	hint_panel.visible = not on
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
	crosshair.spin = fmod(crosshair.spin + delta * 5.0, TAU)
	crosshair.queue_redraw()
	# The counter rolls up and the coal swells on a big payday (eased, never linear).
	var diff := GameState.embers - _shown_embers
	if absf(diff) > 0.5:
		_shown_embers += diff * minf(1.0, delta * 8.0)
		if diff > 0.0:
			_bump = minf(1.0, _bump + delta * clampf(diff / maxf(_shown_embers, 50.0) * 6.0, 0.0, 3.0))
	else:
		_shown_embers = GameState.embers
	_bump = move_toward(_bump, 0.0, delta * 1.5)
	var e := _bump * _bump * (3.0 - 2.0 * _bump)
	embers_label.scale = Vector2.ONE * (1.0 + 0.12 * e)
	coal_icon.scale = Vector2(1.0 + 0.18 * e, 1.0 + 0.1 * e)
	coal_icon.rotation = sin(Time.get_ticks_msec() * 0.02) * 0.08 * e
	embers_label.text = Fmt.num(_shown_embers)
	_update_offer(delta)
	_update_find(delta)
	_place_coach()
	_refresh_t += delta
	if _refresh_t >= 0.15:
		_refresh_t = 0.0
		_refresh()


func _refresh() -> void:
	var rate := GameState.income_per_second_now()
	if rate > 0.05:
		rate_label.text = "+%s a second" % Fmt.num(rate)
		rate_label.add_theme_font_override("font", UiTheme.body())
		rate_label.add_theme_font_size_override("font_size", UiTheme.T_SMALL + 1)
	else:
		rate_label.text = "light the cursed grass"
		rate_label.add_theme_font_override("font", UiTheme.hand())
		rate_label.add_theme_font_size_override("font_size", 22)
	if forest != null:
		var z := forest.zone_at(keeper.position.x, keeper.position.z)
		zone_label.text = str(Balance.ZONES[z].name)
		zone_pct.text = "%d%% burned" % int(forest.progress() * 100.0)
		zone_bar.value = forest.progress()
		var y := keeper.cam_yaw
		var fwd := Vector2(-sin(y), -cos(y))
		var right := Vector2(cos(y), -sin(y))
		wind_chip.angle = atan2(forest.wind.dot(right), forest.wind.dot(fwd))
		wind_chip.strength = forest.wind_strength
		wind_chip.queue_redraw()
	_refresh_boosts()
	var td := GameState.tool_def()
	tool_icon.texture = UiTheme.icon(str(td.icon) if not (GameState.sparkler_on and GameState.tool_index == 0) else "sparkler")
	tool_label.text = str(td.name)
	tool_heat.text = "heat %s" % Fmt.num(GameState.tool_heat())
	_update_target()
	var free := not is_blocking()
	notebook_button.visible = free
	hint_panel.visible = not touch_mode and free and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and show_desktop_hint
	touch.heat_ok = crosshair.ok


func _refresh_boosts() -> void:
	## Running boosts hang as little paper tags under the wind sign.
	var items: Array = []
	if GameState.is_boost_active():
		items.append(["hourglass", "2x fire, %s" % Fmt.duration(GameState.boost_seconds_left())])
	if GameState.is_helper_rush_active():
		items.append(["rush", "helpers 3x, %s" % Fmt.duration(GameState.helper_rush_seconds_left())])
	if GameState.owns_remove_ads_2x:
		items.append(["flame", "2x for good"])
	var keys := ",".join(items.map(func(i): return i[0]))
	if keys != _boost_keys:
		_boost_keys = keys
		for c in boost_box.get_children():
			c.queue_free()
		for k in items.size():
			var tag := PanelContainer.new()
			var tb := UiTheme.TagBox.new(80 + k)
			tag.add_theme_stylebox_override("panel", tb)
			tag.rotation = -0.02 + 0.03 * k
			tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var h := HBoxContainer.new()
			h.add_theme_constant_override("separation", 6)
			tag.add_child(h)
			var ic := TextureRect.new()
			ic.texture = UiTheme.icon(items[k][0])
			ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			ic.custom_minimum_size = Vector2(26, 26)
			h.add_child(ic)
			var l := UiTheme.label(UiTheme.T_SMALL + 1, UiTheme.INK, UiTheme.bold())
			l.name = "L"
			h.add_child(l)
			boost_box.add_child(tag)
	for k in mini(items.size(), boost_box.get_child_count()):
		var l: Label = boost_box.get_child(k).get_child(0).get_node("L")
		l.text = items[k][1]


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
			text = "Burning"
		elif st == ForestGrid.ASH:
			text = "Ash. Flowers soon."
		elif st == ForestGrid.MEADOW:
			text = "Meadow"
			ok = false
		elif Balance.flammable(k):
			var p: Dictionary = Balance.PLANTS[k]
			if forest.can_light(cell, GameState.tool_heat()):
				text = "%s   %s %s" % [p.name, UiTheme.icon_bb("coal", 24), Fmt.num(float(p.embers) * GameState.ember_mult())]
			else:
				ok = false
				var need := _tool_for(forest.thresh[cell])
				var damp := ", damp by the water" if forest.damp[cell] == 1 else ""
				text = "%s%s\n[font_size=19]Too tough for the %s%s[/font_size]" % [p.name, damp, str(GameState.tool_def().name).to_lower(),
					". Try the %s" % need.to_lower() if need != "" else ""]
		else:
			ok = false
	if not keeper.aim.in_range and text == "":
		text = "Out of reach. Walk closer"
	crosshair.ok = ok
	if target_label.text != text:
		target_label.text = "[center]%s[/center]" % text if text != "" else ""


func _tool_for(thresh: float) -> String:
	for i in range(GameState.tool_index + 1, Balance.TOOLS.size()):
		if float(Balance.TOOLS[i].heat) * GameState.upgrade_mult("heat") / Balance.COOL * 0.97 >= thresh:
			return str(Balance.TOOLS[i].name)
	return ""


# =====================================================================================
# First-run hints
# =====================================================================================
func set_coach(text: String, anchor: String = "center") -> void:
	if text == "" or is_blocking():
		coach_panel.visible = false
		coach_finger.visible = false
		_coach_text = ""
		return
	if text != _coach_text or anchor != _coach_anchor:
		_coach_text = text
		_coach_anchor = anchor
		coach_label.text = text
		coach_panel.reset_size()
		coach_panel.visible = true
		coach_panel.modulate.a = 0.0
		coach_panel.create_tween().tween_property(coach_panel, "modulate:a", 1.0, 0.35).set_ease(Tween.EASE_OUT)
		coach_panel.rotation = -0.03 if anchor in ["burn", "look", "notebook"] else 0.025
	coach_panel.visible = true


func _place_coach() -> void:
	if not coach_panel.visible:
		coach_finger.visible = false
		return
	var vp := root.get_viewport_rect().size
	var sz := coach_panel.size
	var at := Vector2(vp.x * 0.5 - sz.x * 0.5, vp.y * 0.5 - 220.0)
	var finger_at := Vector2.INF
	var press := true
	match _coach_anchor:
		"burn":
			if touch_mode:
				var c := touch.fire_center()
				at = Vector2(c.x - sz.x - 130.0, c.y - sz.y - 70.0)
				finger_at = c + Vector2(-20, -84)
			else:
				at = Vector2(vp.x * 0.5 + 60.0, vp.y * 0.5 - sz.y - 50.0)
		"stick":
			if touch_mode:
				var c := touch.stick_home()
				at = Vector2(c.x + 110.0, c.y - sz.y - 60.0)
				finger_at = c + Vector2(-34, -80)
				press = false
			else:
				at = Vector2(vp.x * 0.5 + 60.0, vp.y * 0.5 - sz.y - 50.0)
		"look":
			if touch_mode:
				at = Vector2(vp.x * 0.62 - sz.x * 0.5, vp.y * 0.3)
				finger_at = Vector2(vp.x * 0.62, vp.y * 0.3 + sz.y + 96.0)
				press = false
			else:
				at = Vector2(vp.x * 0.5 + 60.0, vp.y * 0.5 - sz.y - 50.0)
		"notebook":
			var r := notebook_button.get_global_rect()
			at = Vector2(r.position.x - sz.x - 40.0, r.position.y + 20.0)
			finger_at = Vector2(r.position.x + 24.0, r.end.y - 6.0)
		"embers":
			var r := ember_plank.get_global_rect()
			at = Vector2(r.end.x + 30.0, r.position.y + 10.0)
		"wind":
			var r := wind_chip.get_global_rect()
			at = Vector2(r.position.x + 150.0, r.position.y - 6.0)
		_:
			at = Vector2(vp.x * 0.5 + 70.0, vp.y * 0.5 - sz.y - 60.0)
	coach_panel.position = at.clamp(Vector2(12, 12), vp - sz - Vector2(12, 12))
	coach_finger.visible = finger_at.is_finite()
	if coach_finger.visible:
		coach_finger.press = press
		coach_finger.set_meta("base_x", finger_at.x - 36.0)
		coach_finger.set_meta("base_y", finger_at.y - 72.0)


# =====================================================================================
# Toasts: paper slips taped up for a few seconds
# =====================================================================================
func toast(text: String) -> void:
	var p := PanelContainer.new()
	var paper := UiTheme.PaperBox.new(randi() % 1000, 14.0)
	paper.tape = true
	paper.scorch = 0.4
	p.add_theme_stylebox_override("panel", paper)
	p.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.rotation = randf_range(-0.025, 0.025)
	var l := UiTheme.rich(UiTheme.T_BODY + 1, UiTheme.INK, UiTheme.bold())
	l.text = text
	p.add_child(l)
	toast_box.add_child(p)
	while toast_box.get_child_count() > 3:
		var old := toast_box.get_child(0)
		toast_box.remove_child(old)
		old.queue_free()
	p.modulate.a = 0.0
	p.pivot_offset = Vector2(160, 0)
	p.scale = Vector2(0.92, 0.92)
	var tw := p.create_tween()
	tw.set_parallel(true)
	tw.tween_property(p, "modulate:a", 1.0, 0.18)
	tw.tween_property(p, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.chain().tween_interval(2.8)
	tw.chain().tween_property(p, "modulate:a", 0.0, 0.5)
	tw.chain().tween_callback(p.queue_free)


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
	string_line.visible = false
	coach_panel.visible = false
	coach_finger.visible = false
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
		string_line.visible = false
		return
	offer_tag.visible = playing or offers.watching
	_offer_t += delta
	var title := AdOffers.headline(offers.current)
	if _offer_title.text != title:
		_offer_title.text = title
	var stamp := "tap to watch a short ad" if touch_mode else "click to watch a short ad"
	if _offer_stamp.text != stamp:
		_offer_stamp.text = stamp
	_offer_bar.value = 1.0 - offers.time_left / Balance.OFFER_LIFETIME
	# it sways on its string
	offer_tag.pivot_offset = Vector2(offer_tag.size.x * 0.75, 0.0)
	offer_tag.rotation = 0.03 + sin(_offer_t * 1.7) * 0.025
	var b := notebook_button.get_global_rect()
	string_line.visible = offer_tag.visible
	string_line.points = PackedVector2Array([Vector2(b.end.x - 46, b.end.y - 6),
		offer_tag.get_global_transform() * Vector2(offer_tag.size.x * 0.75, 8)])


func _show_offer_tag() -> void:
	Sound.play("offer", -6.0)
	_offer_t = 0.0
	offer_tag.visible = true
	offer_tag.modulate.a = 0.0
	offer_tag.offset_top = 70
	var tw := offer_tag.create_tween()
	tw.set_parallel(true)
	tw.tween_property(offer_tag, "modulate:a", 1.0, 0.25)
	tw.tween_property(offer_tag, "offset_top", 112.0, 0.55).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _hide_offer_tag() -> void:
	if not offer_tag.visible:
		return
	var tw := offer_tag.create_tween()
	tw.tween_property(offer_tag, "modulate:a", 0.0, 0.4)
	tw.tween_callback(func():
		if offers.current == "":
			offer_tag.visible = false
			string_line.visible = false)


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
	_find_label.text = "A golden critter dropped %s %s.\n[font_size=17]%s to double it with a short ad (%ds)[/font_size]" % [
		UiTheme.icon_bb("coal", 22), Fmt.num(_find_amount), "Tap here" if touch_mode else "Click here", int(ceil(_find_t))]
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
			toast("Doubled. %s %s more" % [UiTheme.icon_bb("coal", 22), Fmt.num(amount)])
		else:
			toast("No reward this time"))


# =====================================================================================
# Popups
# =====================================================================================
func _block() -> Control:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	keeper.input_enabled = false
	keeper.firing = false
	touch.release_all()
	touch.visible = false
	coach_panel.visible = false
	coach_finger.visible = false
	var dim := ColorRect.new()
	dim.color = Color(UiTheme.CHAR, 0.62)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	popups.add_child(dim)
	return dim


func close_popup(p: Dictionary) -> void:
	var r: Control = p.root
	popups.remove_child(r)
	r.queue_free()
	if popups.get_child_count() == 0 and notebook == null:
		keeper.input_enabled = true
		touch.visible = touch_mode


func show_starter_offer() -> void:
	## A parcel tied with twine, with a label tag on a string saying what's inside.
	var dim := _block()
	var p := {"root": dim}
	var parcel := UiParts.Parcel.new()
	parcel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	parcel.offset_left = -480
	parcel.offset_right = -150
	parcel.offset_top = -170
	parcel.offset_bottom = 150
	parcel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dim.add_child(parcel)
	var label := PanelContainer.new()
	var paper := UiTheme.PaperBox.new(97, 26.0)
	paper.fill = UiTheme.TAG
	paper.scorch = 0.35
	label.add_theme_stylebox_override("panel", paper)
	label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	label.offset_left = -110
	label.offset_right = 380
	label.offset_top = -170
	label.offset_bottom = 120
	label.rotation = 0.03
	dim.add_child(label)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	label.add_child(v)
	var t := UiTheme.label(UiTheme.T_BIG, UiTheme.INK, UiTheme.display())
	t.text = "A parcel for new keepers"
	v.add_child(t)
	var b := UiTheme.rich(UiTheme.T_BODY + 1, UiTheme.INK, UiTheme.body())
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.custom_minimum_size = Vector2(420, 0)
	b.text = "%s %s embers to spend right away, and the rainbow sparkler: a striped matchstick that fizzes in four colours. One parcel per keeper." % [
		UiTheme.icon_bb("coal", 24), Fmt.num(Balance.STARTER_EMBERS)]
	v.add_child(b)
	var note := UiTheme.label(25, UiTheme.HAND_INK, UiTheme.hand())
	note.text = "left on the doorstep for you"
	v.add_child(note)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 26)
	v.add_child(row)
	var buy := UiParts.Stamp.new(5)
	buy.text = "Open it, %s" % Monetization.price(Monetization.PRODUCT_STARTER)
	buy.custom_minimum_size = Vector2(230, 72)
	buy.pressed.connect(func():
		close_popup(p)
		Monetization.buy(Monetization.PRODUCT_STARTER))
	row.add_child(buy)
	var later := Button.new()
	later.text = "not now"
	UiTheme.plain_button(later)
	later.add_theme_font_override("font", UiTheme.hand())
	later.add_theme_font_size_override("font_size", 28)
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color"]:
		later.add_theme_color_override(c, UiTheme.HAND_INK)
	later.custom_minimum_size = Vector2(120, 64)
	later.pressed.connect(func(): close_popup(p))
	row.add_child(later)
	# the parcel drops in and settles
	parcel.position.y -= 40
	parcel.modulate.a = 0.0
	var tw := parcel.create_tween()
	tw.set_parallel(true)
	tw.tween_property(parcel, "modulate:a", 1.0, 0.2)
	tw.tween_property(parcel, "position:y", parcel.position.y + 40, 0.5).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)


func show_ending() -> void:
	var dim := _block()
	var p := {"root": dim}
	var page := PanelContainer.new()
	var paper := UiTheme.PaperBox.new(101, 34.0)
	paper.ruled = 30.0
	paper.margin_line = 56.0
	page.add_theme_stylebox_override("panel", paper)
	page.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	page.offset_left = -380
	page.offset_right = 300
	page.offset_top = -250
	page.offset_bottom = 190
	page.rotation = -0.02
	dim.add_child(page)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	page.add_child(v)
	var t := UiTheme.label(UiTheme.T_HUGE, UiTheme.INK, UiTheme.display())
	t.text = "The curse is lifted"
	v.add_child(t)
	var b := UiTheme.label(UiTheme.T_BODY + 1, UiTheme.INK, UiTheme.body())
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.custom_minimum_size = Vector2(560, 0)
	b.text = "The Elder Tree has burned down and the village is free. Where the cursed forest stood, there's a valley of flowers."
	v.add_child(b)
	var stats := UiTheme.label(27, UiTheme.HAND_INK, UiTheme.hand())
	stats.text = "%s by the fire\n%s embers earned\n%s cells of forest turned to meadow\n%d critters ran off safe and sound" % [
		Fmt.duration(GameState.play_time), Fmt.num(GameState.lifetime_embers), Fmt.num(float(GameState.cells_burned)), GameState.critters_saved]
	v.add_child(stats)
	var walk := UiParts.Stamp.new(9)
	walk.ink = UiTheme.INK
	walk.text = "Walk the meadow"
	walk.custom_minimum_size = Vector2(260, 72)
	walk.size_flags_horizontal = Control.SIZE_SHRINK_END
	walk.pressed.connect(func(): close_popup(p))
	v.add_child(walk)
