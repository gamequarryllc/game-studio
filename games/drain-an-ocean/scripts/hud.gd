class_name Hud
extends CanvasLayer
## Everything on screen over the bay. Left: the tide board. Top: the money
## cartouche and the pumps' brass dial. Top right: the halyard with the
## signal-flag buttons (chandlery, aquarium, 2x pumping) and whatever boost
## is running. A callout with a leader line points at whatever you tapped,
## one at a time. Hints are notices to mariners pinned up crooked.

signal shop_requested(tab: String)
signal aquarium_requested
signal boost_requested
signal offer_taken(kind: String)
signal double_find_requested(f: int)
signal ending_closed

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
var callout: Control
var _callout_anchor := Vector3.INF
var _callout_box: Paper
var _callout_action: Callable
var _callout_btn: StampButton
var floaters: Control
var _floats: Array = []
var banner: Paper
var _banner_t := 0.0
var toast_box: Paper
var toast_label: Label
var _toast_t := 0.0
var find_card: Paper
var _find_t := 0.0
var _find_idx := -1
var _find_btn: StampButton
var offer_box: Control
var offer_label: Label
var offer_btn: StampButton
var offer_bar: ColorRect
var offer_kind := ""
var shop: ShopPanel
var ending: Control
var halyard: Control
var _t := 0.0
var touch_mode := true


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
	_build_banner()
	_build_toast()
	_build_find_card()
	_build_offer()
	_build_callout()
	shop = ShopPanel.new()
	shop.world = world
	shop.hud = self
	root.add_child(shop)
	shop.visible = false


# --- Building ----------------------------------------------------------------------------------
func _build_staff() -> void:
	staff = TideStaff.new()
	staff.rings = Balance.RINGS
	staff.position = Vector2(4, 104)
	staff.size = Vector2(170, 480)
	root.add_child(staff)


func _build_money() -> void:
	var p := Paper.new(4, 16)
	money_paper = p
	p.position = Vector2(18, 12)
	p.add_theme_constant_override("margin_left", 22)
	p.add_theme_constant_override("margin_right", 26)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(p)
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 10)
	hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(hb)
	var ic := TextureRect.new()
	ic.texture = UiTheme.icon("coin")
	ic.custom_minimum_size = Vector2(46, 46)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hb.add_child(ic)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", -6)
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hb.add_child(vb)
	money_label = UiTheme.label("0", 44, UiTheme.INK, UiTheme.display())
	money_label.custom_minimum_size.x = 150
	vb.add_child(money_label)
	income_label = UiTheme.label("", 17, UiTheme.RUST, UiTheme.bold())
	vb.add_child(income_label)
	dial = FlowDial.new()
	dial.position = Vector2(312, 4)
	root.add_child(dial)


func _build_flags() -> void:
	halyard = Control.new()
	halyard.mouse_filter = Control.MOUSE_FILTER_IGNORE
	halyard.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	halyard.position = Vector2(-470, 0)
	halyard.size = Vector2(470, 40)
	halyard.draw.connect(func():
		UiTheme.rope(halyard, Vector2(0, 6), Vector2(470, 4), 10.0, 6.0))
	root.add_child(halyard)
	flags_box = HBoxContainer.new()
	flags_box.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	flags_box.position = Vector2(-440, 12)
	flags_box.add_theme_constant_override("separation", 14)
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
	status_box.position = Vector2(-300, 158)
	status_box.size = Vector2(290, 10)
	status_box.alignment = BoxContainer.ALIGNMENT_END
	status_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(status_box)


func _build_notice() -> void:
	notice = Paper.new(17, 16)
	notice.grid = false
	notice.fold = false
	notice.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	notice.position = Vector2(196, -150)
	notice.rotation = deg_to_rad(-1.4)
	notice.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(notice)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 2)
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	notice.add_child(vb)
	notice_title = UiTheme.label("NOTICE TO MARINERS", 14, UiTheme.RUST, UiTheme.bold())
	vb.add_child(notice_title)
	notice_label = UiTheme.wrap(UiTheme.label("", 23, UiTheme.INK), 430)
	vb.add_child(notice_label)
	notice.visible = false


func _build_banner() -> void:
	banner = Paper.new(31, 22)
	banner.set_anchors_preset(Control.PRESET_CENTER_TOP)
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner.add_theme_constant_override("margin_left", 40)
	banner.add_theme_constant_override("margin_right", 40)
	root.add_child(banner)
	var vb := VBoxContainer.new()
	vb.name = "VBoxContainer"
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner.add_child(vb)
	var a := UiTheme.label("", 40, UiTheme.INK, UiTheme.italic())
	a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	a.name = "Title"
	vb.add_child(a)
	var b := UiTheme.label("", 20, UiTheme.RUST, UiTheme.bold())
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.name = "Sub"
	vb.add_child(b)
	banner.visible = false


func _build_toast() -> void:
	toast_box = Paper.new(41, 12)
	toast_box.grid = false
	toast_box.fold = false
	toast_box.border = false
	toast_box.set_anchors_preset(Control.PRESET_CENTER_TOP)
	toast_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_box.add_theme_constant_override("margin_left", 22)
	toast_box.add_theme_constant_override("margin_right", 22)
	root.add_child(toast_box)
	toast_label = UiTheme.label("", 22, UiTheme.INK, UiTheme.body())
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_box.add_child(toast_label)
	toast_box.visible = false


func _build_find_card() -> void:
	find_card = Paper.new(51, 20)
	find_card.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	find_card.position = Vector2(-372, -110)
	find_card.rotation = deg_to_rad(1.2)
	root.add_child(find_card)
	var vb := VBoxContainer.new()
	vb.name = "VBoxContainer"
	vb.add_theme_constant_override("separation", 4)
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	find_card.add_child(vb)
	var no := UiTheme.label("", 15, UiTheme.RUST, UiTheme.bold())
	no.name = "No"
	vb.add_child(no)
	var nm := UiTheme.wrap(UiTheme.label("", 32, UiTheme.INK, UiTheme.italic()), 300)
	nm.name = "Name"
	vb.add_child(nm)
	var note := UiTheme.wrap(UiTheme.label("", 19, UiTheme.DIM_INK, UiTheme.body()), 300)
	note.name = "Note"
	vb.add_child(note)
	var val := UiTheme.label("", 26, UiTheme.INK, UiTheme.display())
	val.name = "Value"
	vb.add_child(val)
	_find_btn = StampButton.new("Double it", "watch a short ad", 24)
	_find_btn.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_find_btn.pressed.connect(func():
		if _find_idx >= 0:
			double_find_requested.emit(_find_idx))
	vb.add_child(_find_btn)
	find_card.visible = false


func _build_offer() -> void:
	offer_box = Control.new()
	offer_box.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	offer_box.position = Vector2(-360, 196)
	offer_box.size = Vector2(350, 200)
	offer_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(offer_box)
	var pen := Control.new()
	pen.position = Vector2(250, 0)
	pen.size = Vector2(90, 46)
	pen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pen.draw.connect(func():
		UiTheme.flag(pen, Rect2(Vector2.ZERO, pen.size), "pennant", _t, 9))
	pen.name = "Pennant"
	offer_box.add_child(pen)
	var p := Paper.new(61, 16)
	p.grid = false
	p.position = Vector2(0, 40)
	p.rotation = deg_to_rad(-1.0)
	offer_box.add_child(p)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	p.add_child(vb)
	offer_label = UiTheme.wrap(UiTheme.label("", 21, UiTheme.INK, UiTheme.bold()), 300)
	vb.add_child(offer_label)
	offer_btn = StampButton.new("Watch ad", "", 22)
	offer_btn.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	offer_btn.pressed.connect(func(): offer_taken.emit(offer_kind))
	vb.add_child(offer_btn)
	offer_bar = ColorRect.new()
	offer_bar.color = UiTheme.CORAL
	offer_bar.custom_minimum_size = Vector2(300, 4)
	offer_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(offer_bar)
	offer_box.visible = false


func _build_callout() -> void:
	callout = Control.new()
	callout.set_anchors_preset(Control.PRESET_FULL_RECT)
	callout.mouse_filter = Control.MOUSE_FILTER_IGNORE
	callout.draw.connect(_draw_leader)
	root.add_child(callout)
	_callout_box = Paper.new(71, 16)
	_callout_box.grid = true
	callout.add_child(_callout_box)
	callout.visible = false


# --- Per frame ---------------------------------------------------------------------------------
func _process(delta: float) -> void:
	var rd := delta / maxf(Engine.time_scale, 0.001)
	_t += rd
	var gs = GameState
	money_label.text = Fmt.num(gs.money)
	var ipm: float = gs.income_per_minute()
	income_label.text = "+%s a minute" % Fmt.num(ipm) if ipm >= 1.0 else "salvage and rescues pay"
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
	_update_callout()
	if banner.visible:
		_banner_t -= rd
		banner.modulate.a = clampf(_banner_t / 0.6, 0.0, 1.0) if _banner_t < 0.6 else clampf((4.6 - _banner_t) / 0.4, 0.0, 1.0) if _banner_t > 4.2 else 1.0
		banner.position.y = 168.0 - 30.0 * (1.0 - banner.modulate.a)
		banner.position.x = (root.size.x - banner.size.x) * 0.5
		if _banner_t <= 0.0:
			banner.visible = false
			if _pending_toast != "":
				var pt := _pending_toast
				_pending_toast = ""
				toast(pt, _pending_secs)
	if toast_box.visible:
		_toast_t -= rd
		toast_box.modulate.a = clampf(_toast_t / 0.5, 0.0, 1.0)
		toast_box.position.x = (root.size.x - toast_box.size.x) * 0.5
		toast_box.position.y = 168.0 + banner.size.y + 14.0 if banner.visible else 168.0
		if _toast_t <= 0.0:
			toast_box.visible = false
	if find_card.visible:
		_find_t -= rd
		_find_btn.visible = _find_t > 0.0 and Monetization.is_rewarded_ready(Monetization.PLACEMENT_DOUBLE_FIND)
		if _find_t < -3.0:
			find_card.visible = false
	if offer_box.visible:
		var pen: Control = offer_box.get_node("Pennant")
		pen.queue_redraw()
	halyard.queue_redraw()


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
		var l := UiTheme.label("", 18, UiTheme.PAPER, UiTheme.bold())
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		l.add_theme_color_override("font_outline_color", UiTheme.INK)
		l.add_theme_constant_override("outline_size", 6)
		status_box.add_child(l)
	for i in status_box.get_child_count():
		var l: Label = status_box.get_child(i)
		l.visible = i < lines.size()
		if l.visible:
			l.text = lines[i]
	status_box.visible = not offer_box.visible


# --- Hints, toasts, banners ----------------------------------------------------------------------
func set_hint(text: String) -> void:
	notice.visible = text != "" and staff.visible
	notice_label.text = text
	if text != "":
		notice_label.text = text
		notice.reset_size()
		notice.position = Vector2(196, root.size.y - notice.size.y - 26)


var _pending_toast := ""
var _pending_secs := 0.0


func toast(text: String, seconds: float = 3.2) -> void:
	## One message at a time: a toast waits while a ring banner is up.
	if banner.visible:
		_pending_toast = text
		_pending_secs = seconds
		return
	toast_label.text = text
	toast_box.reset_size()
	toast_box.visible = true
	_toast_t = seconds


func ring_banner(ring: int) -> void:
	var r: Dictionary = Balance.RINGS[ring]
	(banner.get_node("VBoxContainer/Title") as Label).text = str(r.name)
	var subs := ["The tide's out on the sandbars.", "Kelp, standing up in the shallows.", "The reef's coming up for air.",
		"Masts. Three of them.", "It goes down a long way here.", "Rooftops. The lost town."]
	(banner.get_node("VBoxContainer/Sub") as Label).text = "%s  %d m down" % [subs[clampi(ring, 0, subs.size() - 1)], int(-float(r.top))]
	banner.reset_size()
	banner.visible = true
	_banner_t = 4.6


func show_find(f: int, value: float) -> void:
	var def: Dictionary = Balance.FINDS[f]
	(find_card.get_node("VBoxContainer/No") as Label).text = "FIND No. %d OF %d" % [f + 1, Balance.FINDS.size()]
	(find_card.get_node("VBoxContainer/Name") as Label).text = str(def.name)
	(find_card.get_node("VBoxContainer/Note") as Label).text = str(def.note)
	(find_card.get_node("VBoxContainer/Value") as Label).text = "+%s" % Fmt.num(value)
	_find_idx = f
	_find_t = 9.0
	find_card.reset_size()
	find_card.visible = true


func hide_find() -> void:
	find_card.visible = false
	_find_idx = -1


func float_text(at: Vector3, text: String, col: Color = UiTheme.PAPER, big: bool = false) -> void:
	var l := UiTheme.label(text, 30 if big else 24, col, UiTheme.display())
	l.add_theme_color_override("font_outline_color", UiTheme.INK)
	l.add_theme_constant_override("outline_size", 7)
	floaters.add_child(l)
	_floats.append({"label": l, "at": at, "t": 0.0})


func _update_floats(rd: float) -> void:
	var cam: Camera3D = world.rig.camera
	for k in range(_floats.size() - 1, -1, -1):
		var f: Dictionary = _floats[k]
		f.t = float(f.t) + rd
		var l: Label = f.label
		var u := float(f.t) / 1.6
		if u >= 1.0 or cam.is_position_behind(f.at):
			l.queue_free()
			_floats.remove_at(k)
			continue
		var sp := cam.unproject_position(f.at)
		var rise := 1.0 - pow(1.0 - u, 3.0)
		l.position = sp + Vector2(-l.size.x * 0.5, -40.0 - 70.0 * rise)
		l.modulate.a = 1.0 if u < 0.6 else (1.0 - u) / 0.4
		l.scale = Vector2.ONE * (0.7 + 0.3 * minf(u * 6.0, 1.0))


# --- Callout -----------------------------------------------------------------------------------
func show_callout(at: Vector3, title: String, lines: Array, action: String = "", action_sub: String = "", enabled: bool = true, on_action: Callable = Callable()) -> void:
	for c in _callout_box.get_children():
		c.queue_free()
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 4)
	_callout_box.add_child(vb)
	vb.add_child(UiTheme.label(title, 28, UiTheme.INK, UiTheme.display()))
	for ln in lines:
		vb.add_child(UiTheme.wrap(UiTheme.label(str(ln), 19, UiTheme.DIM_INK, UiTheme.body()), 280))
	_callout_btn = null
	if action != "":
		var b := StampButton.new(action, action_sub, 24)
		b.disabled = not enabled
		b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_callout_action = on_action
		b.pressed.connect(func():
			if _callout_action.is_valid():
				_callout_action.call())
		vb.add_child(b)
		_callout_btn = b
	_callout_anchor = at
	callout.visible = true
	_callout_box.reset_size()
	_update_callout()


func callout_open() -> bool:
	return callout.visible


func close_callout() -> void:
	callout.visible = false
	_callout_anchor = Vector3.INF


func _update_callout() -> void:
	if not callout.visible or _callout_anchor == Vector3.INF:
		return
	var cam: Camera3D = world.rig.camera
	if cam.is_position_behind(_callout_anchor):
		close_callout()
		return
	var sp := cam.unproject_position(_callout_anchor)
	var vs := root.get_viewport_rect().size
	var bs := _callout_box.size
	var pos := sp + Vector2(46, -bs.y - 46)
	if pos.x + bs.x > vs.x - 12:
		pos.x = sp.x - bs.x - 46
	if pos.y < 150:
		pos.y = sp.y + 46
	pos.x = clampf(pos.x, 180, vs.x - bs.x - 12)
	pos.y = clampf(pos.y, 12, vs.y - bs.y - 12)
	_callout_box.position = pos
	callout.queue_redraw()


func _draw_leader() -> void:
	if _callout_anchor == Vector3.INF:
		return
	var sp: Vector2 = world.rig.camera.unproject_position(_callout_anchor)
	var r := Rect2(_callout_box.position, _callout_box.size)
	var tgt := Vector2(clampf(sp.x, r.position.x + 14, r.end.x - 14), clampf(sp.y, r.position.y + 14, r.end.y - 14))
	callout.draw_line(sp, tgt, Color(UiTheme.INK, 0.85), 2.0, true)
	callout.draw_arc(sp, 7.0, 0, TAU, 18, UiTheme.INK, 2.0, true)
	callout.draw_circle(sp, 3.0, UiTheme.CORAL)


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
	return shop.visible


func set_touch_mode(on: bool) -> void:
	touch_mode = on


func set_hud_visible(on: bool) -> void:
	## Hide every piece of HUD chrome (the ending and the aquarium get the
	## whole screen); showing brings back the chrome only.
	for c in [staff, money_paper, dial, halyard, flags_box, status_box]:
		c.visible = on
	notice.visible = on and notice_label.text != ""
	if not on:
		close_callout()
		hide_offer()
		hide_find()
		banner.visible = false
		toast_box.visible = false


func show_ending(lines: Array) -> void:
	set_hud_visible(false)
	ending = Control.new()
	ending.set_anchors_preset(Control.PRESET_FULL_RECT)
	ending.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(ending)
	var shade := ColorRect.new()
	shade.color = Color(0.06, 0.18, 0.22, 0.0)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ending.add_child(shade)
	var p := Paper.new(81, 34)
	p.set_anchors_preset(Control.PRESET_CENTER)
	ending.add_child(p)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	p.add_child(vb)
	vb.add_child(UiTheme.label("THE BAY IS DRY", 16, UiTheme.RUST, UiTheme.bold()))
	vb.add_child(UiTheme.label("The lost town", 58, UiTheme.INK, UiTheme.italic()))
	for ln in lines:
		vb.add_child(UiTheme.label(str(ln), 22, UiTheme.INK, UiTheme.body()))
	var b := StampButton.new("Back to the bay", "", 26)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.pressed.connect(func():
		ending.queue_free()
		ending = null
		set_hud_visible(true)
		ending_closed.emit())
	vb.add_child(b)
	p.reset_size()
	p.position = (root.size - p.size) * 0.5
	p.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_interval(1.2)
	tw.tween_property(shade, "color:a", 0.45, 1.5)
	tw.parallel().tween_property(p, "modulate:a", 1.0, 1.2).set_delay(0.6)
