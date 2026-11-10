class_name Hud
extends CanvasLayer
## Everything on screen over the bay, each piece in its own material:
## top left, the money in a chart cartouche and the pumps' brass dial; down
## the left, the tide board with its ring strip; top right, the signal flags
## on their halyard (chandlery, aquarium, 2x pumping) and what's running.
##
## One message at a time, tied to what it's about. A tap's callout, an
## event ("the lagoon's cut off"), a find's specimen label and a first-run
## hint all use the same manila tag on a thread to the thing in the world;
## while it's up anything else waits its turn. Only hints with nothing to
## point at go on the notice slip pinned bottom left, and that hides while a
## tag is up. Ring names aren't banners: they're lettered on the seabed.

signal shop_requested(tab: String)
signal aquarium_requested
signal boost_requested
signal offer_taken(kind: String)
signal double_find_requested(f: int)
signal ending_closed

const SAFE_LEFT := 330.0          # right of the tide board
const SAFE_TOP := 168.0           # under the cartouche and the flags

var world
var root: Control
var staff: TideStaff
var money_label: Label
var money_paper: Paper
var income_label: Label
var dial: FlowDial
var flags_box: Control
var flag_shop: FlagButton
var flag_aqua: FlagButton
var flag_boost: FlagButton
var status_box: VBoxContainer
var notice: Paper
var notice_label: Label
var notice_title: Label
var callout: Control              # the thread layer (full screen) the tag hangs from
var _tag: Paper
var _tag_kind := ""               # "", "callout", "message", "hint", "find"
var _tag_anchor := Vector3.INF
var _tag_screen := Vector2.INF
var _tag_t := 0.0
var _callout_action: Callable
var _callout_btn: StampButton
var _queue: Array = []            # waiting messages: {text, title, anchor, screen, secs, born}
var _hint_text := ""
var _hint_anchor := Vector3.INF
var floaters: Control
var _floats: Array = []
var _find_idx := -1
var _find_btn: StampButton
var offer_box: Control
var offer_label: Label
var offer_btn: StampButton
var offer_bar: ColorRect
var offer_kind := ""
var shop: ShopPanel
var dev: DevPanel
var ending: Control
var halyard: Control
var _t := 0.0
var touch_mode := true
var _press_money := -1.0
var lettering: ChartLettering     # set by the world: where ring names are lettered


func setup(w) -> void:
	world = w
	layer = 10
	UiTheme.install_fonts()
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	floaters = Control.new()
	floaters.set_anchors_preset(Control.PRESET_FULL_RECT)
	floaters.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(floaters)
	_build_staff()
	_build_money()
	_build_flags()
	_build_notice()
	_build_offer()
	_build_tag()
	shop = ShopPanel.new()
	shop.world = world
	shop.hud = self
	root.add_child(shop)
	shop.visible = false
	if GameState.is_playtest():
		dev = DevPanel.new()
		dev.world = world
		dev.hud = self
		root.add_child(dev)
		dev.visible = false


# --- Building ----------------------------------------------------------------------------------
func _build_staff() -> void:
	staff = TideStaff.new()
	staff.rings = Balance.RINGS
	staff.position = Vector2(2, 150)
	staff.size = Vector2(320, 500)
	root.add_child(staff)


func _build_money() -> void:
	var p := Paper.new(4, 14)
	p.style = "cartouche"
	money_paper = p
	p.position = Vector2(34, 14)
	p.add_theme_constant_override("margin_left", 22)
	p.add_theme_constant_override("margin_right", 24)
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	p.gui_input.connect(_on_money_input)
	root.add_child(p)
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 10)
	hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(hb)
	var ic := TextureRect.new()
	ic.texture = UiTheme.icon("coin")
	ic.custom_minimum_size = Vector2(44, 44)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hb.add_child(ic)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", -6)
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hb.add_child(vb)
	money_label = UiTheme.label("0", 46, UiTheme.INK, UiTheme.display())
	money_label.custom_minimum_size.x = 220
	vb.add_child(money_label)
	income_label = UiTheme.label("", 22, UiTheme.RUST, UiTheme.bold())
	vb.add_child(income_label)
	dial = FlowDial.new()
	dial.position = Vector2(398, 2)
	root.add_child(dial)


func _build_flags() -> void:
	halyard = Control.new()
	halyard.mouse_filter = Control.MOUSE_FILTER_IGNORE
	halyard.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	halyard.position = Vector2(-500, 0)
	halyard.size = Vector2(500, 40)
	halyard.draw.connect(func():
		UiTheme.rope(halyard, Vector2(0, 6), Vector2(500, 4), 10.0, 6.0))
	root.add_child(halyard)
	flags_box = HBoxContainer.new()
	flags_box.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	flags_box.position = Vector2(-470, 12)
	flags_box.add_theme_constant_override("separation", 12)
	root.add_child(flags_box)
	flag_boost = FlagButton.new("Z", "2x pumping")
	flag_boost.pressed.connect(func(): boost_requested.emit())
	flags_box.add_child(flag_boost)
	flag_aqua = FlagButton.new("A", "Aquarium")
	flag_aqua.pressed.connect(func(): aquarium_requested.emit())
	flags_box.add_child(flag_aqua)
	flag_shop = FlagButton.new("C", "Chandlery")
	flag_shop.pressed.connect(func(): shop_requested.emit(""))
	flags_box.add_child(flag_shop)
	status_box = VBoxContainer.new()
	status_box.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	status_box.position = Vector2(-330, 168)
	status_box.size = Vector2(320, 10)
	status_box.alignment = BoxContainer.ALIGNMENT_END
	status_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(status_box)


func _build_notice() -> void:
	notice = Paper.new(17, 18)
	notice.style = "slip"
	notice.add_theme_constant_override("margin_top", 22)
	notice.add_theme_constant_override("margin_bottom", 24)
	notice.rotation = deg_to_rad(-1.2)
	notice.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(notice)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 2)
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	notice.add_child(vb)
	notice_title = UiTheme.label("NOTICE TO MARINERS", 21, UiTheme.RUST, UiTheme.bold())
	vb.add_child(notice_title)
	notice_label = UiTheme.wrap(UiTheme.label("", 24, UiTheme.INK), 460)
	vb.add_child(notice_label)
	notice.visible = false


func _build_offer() -> void:
	offer_box = Control.new()
	offer_box.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	offer_box.position = Vector2(-390, 200)
	offer_box.size = Vector2(380, 220)
	offer_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(offer_box)
	var pen := Control.new()
	pen.position = Vector2(270, 0)
	pen.size = Vector2(96, 48)
	pen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pen.draw.connect(func():
		UiTheme.flag(pen, Rect2(Vector2.ZERO, pen.size), "pennant", _t, 9))
	pen.name = "Pennant"
	offer_box.add_child(pen)
	var p := Paper.new(61, 16)
	p.style = "tag"
	p.add_theme_constant_override("margin_left", 34)
	p.position = Vector2(0, 44)
	p.rotation = deg_to_rad(-1.0)
	offer_box.add_child(p)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	p.add_child(vb)
	offer_label = UiTheme.wrap(UiTheme.label("", 23, UiTheme.INK, UiTheme.bold()), 300)
	vb.add_child(offer_label)
	offer_btn = StampButton.new("Watch an ad", "", 26)
	offer_btn.ink = UiTheme.TEAL
	offer_btn.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	offer_btn.pressed.connect(func(): offer_taken.emit(offer_kind))
	vb.add_child(offer_btn)
	offer_bar = ColorRect.new()
	offer_bar.color = UiTheme.CORAL
	offer_bar.custom_minimum_size = Vector2(300, 4)
	offer_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(offer_bar)
	offer_box.visible = false


func _build_tag() -> void:
	callout = Control.new()
	callout.set_anchors_preset(Control.PRESET_FULL_RECT)
	callout.mouse_filter = Control.MOUSE_FILTER_IGNORE
	callout.draw.connect(_draw_thread)
	root.add_child(callout)
	_tag = Paper.new(71, 16)
	_tag.style = "tag"
	_tag.add_theme_constant_override("margin_left", 38)
	_tag.add_theme_constant_override("margin_right", 20)
	callout.add_child(_tag)
	callout.visible = false


# --- Per frame ---------------------------------------------------------------------------------
func _process(delta: float) -> void:
	var rd := delta / maxf(Engine.time_scale, 0.001)
	_t += rd
	var gs = GameState
	money_label.text = Fmt.num(gs.money)
	var ipm: float = gs.income_per_minute()
	var nxt: float = gs.next_pump_cost()
	var goal := ("next pump %s" % Fmt.num(nxt)) if nxt > 0.0 else "every pad at its best"
	income_label.text = ("+%s a min · %s" % [Fmt.num(ipm), goal]) if ipm >= 1.0 else goal
	staff.level = world.bay.main_level()
	staff.current_ring = Balance.ring_of_level(world.bay.main_level())
	dial.flow = world.main_flow
	dial.seep = world.seep_flow
	dial.boosted = gs.is_boost_active() or gs.owns_remove_ads
	flag_boost.badge = Fmt.duration(gs.boost_seconds_left()) if gs.is_boost_active() else ""
	var tank: int = gs.creatures_in_tank()
	flag_aqua.badge = str(tank) if tank > 0 else ""
	flag_shop.badge = "!" if _something_affordable() else ""
	_update_status()
	_update_floats(rd)
	_update_tag(rd)
	if offer_box.visible:
		(offer_box.get_node("Pennant") as Control).queue_redraw()
	halyard.queue_redraw()
	if _press_money >= 0.0:
		_press_money += rd
		if _press_money > 0.9:
			_press_money = -1.0
			open_dev()


func _on_money_input(e: InputEvent) -> void:
	## Playtest builds only: hold the money cartouche to open the dev log.
	if dev == null:
		return
	if (e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT) or e is InputEventScreenTouch:
		_press_money = 0.0 if e.pressed else -1.0


func open_dev() -> void:
	## Never over another panel, the aquarium or the ending.
	if dev == null or shop.visible or world.paused_world or ending != null or (world.ending_shot != null and world.ending_shot.running):
		return
	close_callout()
	dev.open()


func _unhandled_key_input(event: InputEvent) -> void:
	if dev != null and event is InputEventKey and event.pressed and (event as InputEventKey).keycode == KEY_F9:
		if dev.visible:
			dev.close()
		else:
			open_dev()


func _something_affordable() -> bool:
	var gs = GameState
	var c: float = gs.next_pump_cost()
	if c > 0.0 and gs.money >= c:
		return true
	for u in Balance.UPGRADES:
		var uc: float = gs.upgrade_cost(u.key)
		if uc > 0.0 and gs.money >= uc and int(gs.upgrade_levels[u.key]) < 2:
			return true
	return false


func _update_status() -> void:
	var gs = GameState
	var lines: Array = []
	if gs.owns_remove_ads:
		lines.append("Permanent 2x pumping")
	if gs.is_boost_active():
		lines.append("2x pumping  %s" % Fmt.duration(gs.boost_seconds_left()))
	if gs.is_helper_rush_active():
		lines.append("Helpers 3x  %s" % Fmt.duration(gs.helper_rush_seconds_left()))
	if gs.is_ticket_rush_active():
		lines.append("Double tickets  %s" % Fmt.duration(gs.ticket_rush_seconds_left()))
	while status_box.get_child_count() < lines.size():
		var l := UiTheme.label("", 22, UiTheme.PAPER, UiTheme.bold())
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		l.add_theme_color_override("font_outline_color", UiTheme.INK)
		l.add_theme_constant_override("outline_size", 7)
		status_box.add_child(l)
	for i in status_box.get_child_count():
		var l: Label = status_box.get_child(i)
		l.visible = i < lines.size()
		if l.visible:
			l.text = lines[i]
	status_box.visible = not offer_box.visible and flags_box.visible


# --- One message at a time -------------------------------------------------------------------------
func say(text: String, anchor: Vector3 = Vector3.INF, seconds: float = 3.6, title: String = "", screen: Vector2 = Vector2.INF) -> void:
	## Queues an event message on the tag, tied to `anchor` (a world point) or
	## `screen` (a point on the HUD, like a flag), or to nothing.
	for q in _queue:
		if q.text == text:
			return
	if _tag_kind == "message" and _tag_text() == text:
		_tag_t = maxf(_tag_t, seconds)
		return
	_queue.append({"text": text, "title": title, "anchor": anchor, "screen": screen, "secs": seconds, "born": _t})


func toast(text: String, seconds: float = 3.2) -> void:
	say(text, Vector3.INF, seconds)


func message_count() -> int:
	return _queue.size() + (1 if _tag_kind == "message" or _tag_kind == "find" else 0)


func _tag_text() -> String:
	return str(_tag.get_meta("text", ""))


func set_hint(text: String, anchor: Vector3 = Vector3.INF) -> void:
	_hint_text = text
	_hint_anchor = anchor
	notice_label.text = text


func ring_banner(ring: int) -> void:
	## A new ring surfaced: its name inks in on the seabed (ChartLettering);
	## the tag ties a line of copy to the lettering.
	var r: Dictionary = Balance.RINGS[ring]
	var subs := ["The tide's out on the sandbars.", "Kelp, standing up in the shallows.", "The reef's coming up for air.",
		"Masts. Three of them.", "It goes down a long way here.", "Rooftops. The lost town."]
	var at := Vector3.INF
	if lettering != null:
		lettering.reveal(ring)
		at = lettering.anchor_of(ring)
	say(subs[clampi(ring, 0, subs.size() - 1)], at, 4.2, "%s, %d m down" % [str(r.name), int(-float(r.top))])


func _update_tag(rd: float) -> void:
	var hud_on: bool = staff.visible
	if _tag_kind == "message" or _tag_kind == "find":
		_tag_t -= rd
		if _tag_kind == "find" and _find_btn != null:
			_find_btn.visible = _tag_t > 3.0 and Monetization.is_rewarded_ready(Monetization.PLACEMENT_DOUBLE_FIND)
		if _tag_t <= 0.0:
			_hide_tag()
	if _tag_kind == "" or _tag_kind == "hint":
		# Next waiting message (dropping stale ones).
		while not _queue.is_empty() and _t - float(_queue[0].born) > 10.0:
			_queue.pop_front()
		if not _queue.is_empty() and hud_on:
			var q: Dictionary = _queue.pop_front()
			_show_tag("message", q.anchor, q.screen, str(q.title), [q.text])
			_tag_t = float(q.secs)
			_tag.set_meta("text", q.text)
	if _tag_kind == "" or _tag_kind == "hint":
		# Hints: tied to their object when they have one, else the notice slip.
		var want_tag := _hint_text != "" and _hint_anchor != Vector3.INF and hud_on
		if want_tag:
			if _tag_kind != "hint" or _tag_text() != _hint_text or _tag_anchor.distance_to(_hint_anchor) > 0.5:
				_show_tag("hint", _hint_anchor, Vector2.INF, "", [_hint_text])
				_tag.set_meta("text", _hint_text)
		elif _tag_kind == "hint":
			_hide_tag()
	notice.visible = hud_on and _tag_kind == "" and _hint_text != "" and _hint_anchor == Vector3.INF
	if notice.visible:
		notice.reset_size()
		notice.position = Vector2(SAFE_LEFT - 10, root.size.y - notice.size.y - 18)
	_place_tag()


func _show_tag(kind: String, anchor: Vector3, screen: Vector2, title: String, lines: Array, action: String = "",
		action_sub: String = "", enabled: bool = true, on_action: Callable = Callable(), style: String = "tag") -> void:
	for c in _tag.get_children():
		_tag.remove_child(c)
		c.queue_free()
	_tag.style = style
	_tag.add_theme_constant_override("margin_left", 38 if style == "tag" else 22)
	_tag.queue_redraw()
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 4)
	_tag.add_child(vb)
	if title != "":
		vb.add_child(UiTheme.wrap(UiTheme.label(title, 28, UiTheme.INK, UiTheme.display()), 300))
	for ln in lines:
		vb.add_child(UiTheme.wrap(UiTheme.label(str(ln), 23, Color(UiTheme.INK, 0.82), UiTheme.body()), 300))
	_callout_btn = null
	if action != "":
		var b := StampButton.new(action, action_sub, 26)
		b.disabled = not enabled
		b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_callout_action = on_action
		b.pressed.connect(func():
			if _callout_action.is_valid():
				_callout_action.call())
		vb.add_child(b)
		_callout_btn = b
	_tag_kind = kind
	_tag_anchor = anchor
	_tag_screen = screen
	_tag.set_meta("text", "")
	callout.visible = true
	_tag.reset_size()
	_tag.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(_tag, "modulate:a", 1.0, 0.18).set_ease(Tween.EASE_OUT)
	_place_tag()


func _hide_tag() -> void:
	_tag_kind = ""
	_tag_anchor = Vector3.INF
	_tag_screen = Vector2.INF
	callout.visible = false
	_find_idx = -1
	_find_btn = null


func _anchor_screen() -> Vector2:
	if _tag_screen != Vector2.INF:
		return _tag_screen
	if _tag_anchor == Vector3.INF:
		return Vector2.INF
	var cam: Camera3D = world.rig.camera
	if cam.is_position_behind(_tag_anchor):
		return Vector2.INF
	return cam.unproject_position(_tag_anchor)


func _place_tag() -> void:
	if not callout.visible:
		return
	var vs := root.get_viewport_rect().size
	var bs := _tag.size
	var sp := _anchor_screen()
	var pos: Vector2
	if sp == Vector2.INF:
		if _tag_kind == "callout":
			_hide_tag()
			return
		pos = Vector2((vs.x - bs.x) * 0.5 + 60.0, SAFE_TOP + 10.0)
	else:
		# beside the thing, never on it: up and to the right, else wherever fits
		pos = sp + Vector2(56, -bs.y * 0.5 - 30)
		if pos.x + bs.x > vs.x - 12:
			pos.x = sp.x - bs.x - 56
		if pos.x < SAFE_LEFT:
			pos.x = sp.x + 56
		pos.x = clampf(pos.x, SAFE_LEFT, vs.x - bs.x - 12)
		pos.y = clampf(pos.y, SAFE_TOP, vs.y - bs.y - 14)
		if Rect2(pos, bs).grow(10).has_point(sp):
			pos.y = sp.y - bs.y - 40 if sp.y - bs.y - 40 > SAFE_TOP else sp.y + 40
			pos.y = clampf(pos.y, SAFE_TOP, vs.y - bs.y - 14)
	_tag.position = pos
	callout.queue_redraw()


func _draw_thread() -> void:
	var sp := _anchor_screen()
	if sp == Vector2.INF or not callout.visible:
		return
	var eye: Vector2 = _tag.position + (_tag.eyelet if _tag.style == "tag" else Vector2(0, _tag.size.y * 0.5))
	if _tag.style != "tag":
		eye = _tag.position + Vector2(0 if sp.x < _tag.position.x else _tag.size.x, _tag.size.y * 0.5)
	var pts := PackedVector2Array()
	var sag := minf(30.0, eye.distance_to(sp) * 0.12)
	for i in 13:
		var u := float(i) / 12.0
		pts.append(eye.lerp(sp, u) + Vector2(0, sin(u * PI) * sag))
	callout.draw_polyline(pts, Color(UiTheme.INK, 0.25), 4.0, true)
	callout.draw_polyline(pts, UiTheme.ROPE_DARK, 2.0, true)
	callout.draw_arc(sp, 9.0, 0, TAU, 20, UiTheme.INK, 2.2, true)
	callout.draw_arc(sp, 9.0, 0, TAU, 20, Color(UiTheme.PAPER, 0.6), 0.8, true)
	callout.draw_circle(sp, 3.0, UiTheme.CORAL)


func show_callout(at: Vector3, title: String, lines: Array, action: String = "", action_sub: String = "", enabled: bool = true, on_action: Callable = Callable()) -> void:
	## A tap's answer: the tag tied to what was tapped, with its one action.
	## It goes in front of anything else (an event message waits behind it).
	if _tag_kind == "message":
		_queue.push_front({"text": _tag_text(), "title": "", "anchor": _tag_anchor, "screen": _tag_screen, "secs": maxf(_tag_t, 1.5), "born": _t})
	_show_tag("callout", at, Vector2.INF, title, lines, action, action_sub, enabled, on_action)


func callout_open() -> bool:
	return callout.visible and _tag_kind == "callout"


func close_callout() -> void:
	if _tag_kind == "callout":
		_hide_tag()


func show_find(f: int, value: float, at: Vector3 = Vector3.INF) -> void:
	## A find's specimen label, tied to where it lay, with "double it".
	## Not while the HUD is away (the ending, the chandlery, the aquarium):
	## a salvage crab can still pick something up then, and the card used to
	## pop up in the middle of the ending's shot.
	if not staff.visible:
		return
	var def: Dictionary = Balance.FINDS[f]
	if _tag_kind == "message":
		_queue.push_front({"text": _tag_text(), "title": "", "anchor": _tag_anchor, "screen": _tag_screen, "secs": maxf(_tag_t, 1.5), "born": _t})
	_show_tag("find", at, Vector2.INF, str(def.name), [str(def.note), "+%s" % Fmt.num(value)], "Double it", "watch a short ad", true,
		func():
			if _find_idx >= 0:
				double_find_requested.emit(_find_idx), "label")
	var no := UiTheme.label("FIND No. %d OF %d" % [f + 1, Balance.FINDS.size()], 21, UiTheme.RUST, UiTheme.bold())
	(_tag.get_child(0) as VBoxContainer).add_child(no)
	(_tag.get_child(0) as VBoxContainer).move_child(no, 0)
	_find_idx = f
	_find_btn = _callout_btn
	_tag_t = 9.0
	_tag.reset_size()


func hide_find() -> void:
	if _tag_kind == "find":
		_hide_tag()


func find_card_up() -> bool:
	return _tag_kind == "find"


func float_text(at: Vector3, text: String, col: Color = UiTheme.PAPER, big: bool = false) -> void:
	if not staff.visible:
		return
	var l := UiTheme.label(text, 28 if big else 24, col, UiTheme.display())
	l.add_theme_color_override("font_outline_color", UiTheme.INK)
	l.add_theme_constant_override("outline_size", 7)
	floaters.add_child(l)
	_floats.append({"label": l, "at": at, "t": 0.0})
	while _floats.size() > 6:
		(_floats.pop_front().label as Label).queue_free()


func _update_floats(rd: float) -> void:
	var cam: Camera3D = world.rig.camera
	for k in range(_floats.size() - 1, -1, -1):
		var f: Dictionary = _floats[k]
		f.t = float(f.t) + rd
		var l: Label = f.label
		var u := float(f.t) / 1.4
		if u >= 1.0 or cam.is_position_behind(f.at) or not staff.visible:
			l.queue_free()
			_floats.remove_at(k)
			continue
		var sp := cam.unproject_position(f.at)
		var rise := 1.0 - pow(1.0 - u, 3.0)
		l.position = sp + Vector2(-l.size.x * 0.5, -36.0 - 56.0 * rise)
		l.modulate.a = 1.0 if u < 0.6 else (1.0 - u) / 0.4
		l.scale = Vector2.ONE * (0.75 + 0.25 * minf(u * 6.0, 1.0))


func clear_floaters() -> void:
	for f in _floats:
		(f.label as Label).queue_free()
	_floats.clear()


# --- Offer -------------------------------------------------------------------------------------
func show_offer(kind: String) -> void:
	offer_kind = kind
	offer_label.text = AdOffers.headline(kind)
	offer_box.visible = true


func update_offer(frac: float) -> void:
	offer_bar.custom_minimum_size.x = 300.0 * clampf(frac, 0.0, 1.0)


func hide_offer() -> void:
	offer_box.visible = false
	offer_kind = ""


# --- Panels ------------------------------------------------------------------------------------
func open_shop(tab: String = "") -> void:
	close_callout()
	shop.open(tab)


func close_shop() -> void:
	shop.close()


func shop_open() -> bool:
	return shop.visible or (dev != null and dev.visible)


func set_touch_mode(on: bool) -> void:
	touch_mode = on


func set_hud_visible(on: bool) -> void:
	## Hide every piece of HUD chrome (the ending and the aquarium get the
	## whole screen); showing brings back the chrome only.
	for c in [staff, money_paper, dial, halyard, flags_box, status_box]:
		c.visible = on
	if not on:
		_hide_tag()
		_queue.clear()
		hide_offer()
		notice.visible = false
		clear_floaters()


func show_ending(lines: Array) -> void:
	## The ending's card: a folded chart, slid in from the left once the
	## camera has settled on the clock tower (the world calls this after the
	## shot), off to one side so the town stays in view.
	set_hud_visible(false)
	_queue.clear()
	ending = Control.new()
	ending.set_anchors_preset(Control.PRESET_FULL_RECT)
	ending.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ending)
	var p := Paper.new(81, 36)
	p.style = "folded"
	p.add_theme_constant_override("margin_left", 40)
	p.add_theme_constant_override("margin_right", 44)
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	ending.add_child(p)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	p.add_child(vb)
	vb.add_child(UiTheme.label("THE BAY IS DRY", 22, UiTheme.RUST, UiTheme.bold()))
	vb.add_child(UiTheme.label("The lost town", 58, UiTheme.INK, UiTheme.italic()))
	for ln in lines:
		vb.add_child(UiTheme.wrap(UiTheme.label(str(ln), 24, UiTheme.INK, UiTheme.body()), 420))
	var b := StampButton.new("Back to the bay", "", 28)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.pressed.connect(func():
		ending.queue_free()
		ending = null
		set_hud_visible(true)
		ending_closed.emit())
	vb.add_child(b)
	p.reset_size()
	var vs := root.get_viewport_rect().size
	var to := Vector2(maxf(40.0, vs.x * 0.06), (vs.y - p.size.y) * 0.5)
	p.position = to - Vector2(p.size.x + 60.0, 0)
	p.rotation = deg_to_rad(-2.0)
	p.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(p, "position", to, 0.9).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(p, "modulate:a", 1.0, 0.5)
