class_name ShopPanel
extends Control
## The Chandlery: a ship chandler's price list printed on chart paper. The
## sections are thumb-cut index tabs down the left margin (each its own
## width, like a ledger); the goods are tide-table rows with a ruled line
## between them and the price as an ink stamp you tap. No second buy button.

const PAD_NAMES := ["Town beach", "Slipway", "Pier steps", "West dunes", "East point", "North rocks"]

var world
var hud
var tab := "pumps"
var sheet: Paper
var tabs_box: VBoxContainer
var list: VBoxContainer
var scroll: ScrollContainer
var title: Label
var _dirty := true
var _rebuild_t := 0.0


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade := ColorRect.new()
	shade.color = Color(0.04, 0.14, 0.17, 0.55)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	shade.gui_input.connect(func(e):
		if (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or (e is InputEventScreenTouch and e.pressed):
			close())
	add_child(shade)
	tabs_box = VBoxContainer.new()
	tabs_box.add_theme_constant_override("separation", 6)
	add_child(tabs_box)
	sheet = Paper.new(91, 26)
	add_child(sheet)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	sheet.add_child(vb)
	var head := HBoxContainer.new()
	vb.add_child(head)
	var tv := VBoxContainer.new()
	tv.add_theme_constant_override("separation", -4)
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tv)
	title = UiTheme.label("The Chandlery", 44, UiTheme.INK, UiTheme.display())
	tv.add_child(title)
	tv.add_child(UiTheme.label("ship's chandler and pump merchant, on the town quay", 18, UiTheme.DIM_INK, UiTheme.italic()))
	var close_b := StampButton.new("Back to the bay", "", 22)
	close_b.ink = UiTheme.INK
	close_b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	close_b.pressed.connect(close)
	head.add_child(close_b)
	var rule := ColorRect.new()
	rule.color = Color(UiTheme.INK, 0.7)
	rule.custom_minimum_size = Vector2(0, 2)
	vb.add_child(rule)
	scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	vb.add_child(scroll)
	list = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 0)
	scroll.add_child(list)
	GameState.changed.connect(func(): _dirty = true)
	Monetization.purchases_changed.connect(func(): _dirty = true)
	resized.connect(_layout)
	_layout()


func _layout() -> void:
	var vs := get_viewport_rect().size
	var w := minf(vs.x - 260.0, 1020.0)
	var h := vs.y - 56.0
	sheet.position = Vector2((vs.x - w) * 0.5 + 70.0, 28.0)
	sheet.size = Vector2(w, h)
	sheet.custom_minimum_size = Vector2(w, h)
	tabs_box.position = Vector2(sheet.position.x - 150.0, 70.0)
	tabs_box.size = Vector2(160, h - 80)


func open(t: String = "") -> void:
	if t != "":
		tab = t
	visible = true
	_dirty = true
	if hud != null:
		hud.set_hud_visible(false)
	_layout()
	_rebuild()
	Sound.play("ui_open", -4.0)


func close() -> void:
	if not visible:
		return
	visible = false
	if hud != null:
		hud.set_hud_visible(true)
	Sound.play("ui_close", -5.0)
	GameState.save_game()
	if world != null:
		world.on_panel_closed()


func _process(delta: float) -> void:
	if not visible:
		return
	_rebuild_t -= delta
	if _dirty and _rebuild_t <= 0.0:
		_rebuild()


func _tabs() -> Array:
	var t := [["pumps", "Pumps"], ["barges", "Barges"], ["upgrades", "Upgrades"], ["helpers", "Helpers"], ["purchases", "Purchases"]]
	if GameState.is_playtest():
		t.append(["dev", "Playtest"])
	return t


func _rebuild() -> void:
	_dirty = false
	_rebuild_t = 0.25
	var keep_scroll := scroll.scroll_vertical
	for c in tabs_box.get_children():
		c.queue_free()
	var k := 0
	for td in _tabs():
		var b := IndexTab.new(str(td[1]), td[0] == tab, k)
		var key: String = td[0]
		b.pressed.connect(func():
			tab = key
			scroll.scroll_vertical = 0
			Sound.play("click", -6.0)
			_rebuild())
		tabs_box.add_child(b)
		k += 1
	for c in list.get_children():
		c.queue_free()
	match tab:
		"pumps":
			_pumps()
		"barges":
			_barges()
		"upgrades":
			_upgrades()
		"helpers":
			_helpers()
		"purchases":
			_purchases()
		"dev":
			_dev()
	await get_tree().process_frame
	scroll.scroll_vertical = keep_scroll


# --- Rows --------------------------------------------------------------------------------------
func _section(text: String) -> void:
	var l := UiTheme.label(text, 26, UiTheme.INK, UiTheme.italic())
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 14)
	m.add_theme_constant_override("margin_bottom", 2)
	m.add_child(l)
	list.add_child(m)


func _note(text: String) -> void:
	var l := UiTheme.wrap(UiTheme.label(text, 19, UiTheme.DIM_INK, UiTheme.body()), 700)
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_bottom", 6)
	m.add_child(l)
	list.add_child(m)


func _row(icon: String, name: String, desc: String, effect: String, stamp: String, sub: String, enabled: bool, cb: Callable, ink: Color = UiTheme.RUST) -> StampButton:
	var row := TableRow.new()
	list.add_child(row)
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 14)
	row.add_child(hb)
	var ic := TextureRect.new()
	ic.texture = UiTheme.icon(icon)
	ic.custom_minimum_size = Vector2(52, 52)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hb.add_child(ic)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 0)
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hb.add_child(vb)
	vb.add_child(UiTheme.label(name, 24, UiTheme.INK, UiTheme.bold()))
	if desc != "":
		vb.add_child(UiTheme.wrap(UiTheme.label(desc, 18, UiTheme.DIM_INK, UiTheme.body()), 380))
	var eff := UiTheme.label(effect, 19, UiTheme.INK, UiTheme.italic())
	eff.custom_minimum_size.x = 170
	eff.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hb.add_child(eff)
	var b: StampButton = null
	if stamp != "":
		b = StampButton.new(stamp, sub, 24)
		if ink == UiTheme.RUST and stamp.length() > 0 and (stamp[0].is_valid_int()):
			b.icon = UiTheme.icon("coin")
			b._fit()
		b.ink = ink
		b.disabled = not enabled
		b.custom_minimum_size.x = maxf(b.custom_minimum_size.x, 150)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(cb)
		hb.add_child(b)
	return b


func _price(c: float) -> String:
	return Fmt.num(c) if c > 0.0 else ""


func _buy(id: String) -> void:
	if world.buy(id):
		Sound.play("buy", -3.0)
	else:
		Sound.play("cant_afford", -6.0)


# --- Tabs ----------------------------------------------------------------------------------------
func _cash_help() -> void:
	## When you're short for the next pump: free cash (ad) and the cash packs.
	var gs = GameState
	var nxt: float = gs.next_pump_cost()
	if nxt <= 0.0 or gs.money >= nxt:
		return
	_section("Short by %s for the next pump" % Fmt.num(nxt - gs.money))
	_row("ad", "Free coins", "Watch a short ad.", "+%s" % Fmt.num(gs.instant_cash_amount()), "Watch ad", "", Monetization.is_rewarded_ready(Monetization.PLACEMENT_CASH), func(): world.watch_ad("cash"), UiTheme.TEAL)
	for pid in [Monetization.PRODUCT_CASH_SMALL, Monetization.PRODUCT_CASH_MEDIUM]:
		var pd: Dictionary = Monetization.PRODUCTS[pid]
		_row("coins", str(pd.title), "", "+%s" % Fmt.num(gs.cash_pack_amount(str(pd.pack))), Monetization.price(pid), "", true, func(): Monetization.buy(pid), UiTheme.TEAL)


func _pumps() -> void:
	var gs = GameState
	_note("Every pad on the shore takes one pump; buying here puts the next one on that pad. Or tap a pad on the beach.")
	_cash_help()
	_section("Pump pads")
	for i in gs.pads.size():
		var t := int(gs.pads[i])
		var cur := "empty pad" if t == 0 else str(Balance.pump_def(t).name)
		var c: float = gs.pad_next_cost(i)
		if c <= 0.0:
			_row("pump_%d" % t, "Pad %d, %s" % [i + 1, PAD_NAMES[i]], cur, Fmt.flow(gs.pump_flow(t, world.bay.main_level())), "", "", false, Callable())
			continue
		var nd: Dictionary = Balance.pump_def(t + 1)
		var desc := "%s. Next: %s. %s" % ["An empty pad" if t == 0 else cur + " now", str(nd.name).to_lower(), str(nd.desc)]
		var pid: int = i
		_row("pump_%d" % (t + 1), "Pad %d, %s" % [i + 1, PAD_NAMES[i]], desc, Fmt.flow(gs.pump_flow(t + 1, world.bay.main_level())), _price(c), "", gs.money >= c, func(): _buy("pad:%d" % pid))
	_section("The pumps")
	for k in Balance.PUMPS.size():
		var pd: Dictionary = Balance.PUMPS[k]
		_row("pump_%d" % (k + 1), str(pd.name), str(pd.desc), "%s each" % Fmt.flow(float(pd.flow)), "", "", false, Callable())


func _barges() -> void:
	var gs = GameState
	_note("A barge pump floats on whatever water you send it to. Tap a pool on the bay to send one; it slides down with the water as the pool drops.")
	var c: float = gs.barge_cost()
	_row("barge", "Barge pump", "You have %d of %d." % [gs.barges.size(), Balance.BARGE_COSTS.size()], Fmt.flow(gs.barge_flow(-2.0)), _price(c), "", c > 0.0 and gs.money >= c, func(): _buy("barge"))
	if world.bay.pool_ids().size() > 0:
		_section("Pools still holding water")
		for id in world.bay.pool_ids():
			var nm: String = world.bay.body_name(id)
			var d: float = world.bay.max_depth(id)
			var bid: int = id
			_row("pool", nm, "%.1f m deep at its deepest." % d, "", "Show me", "", true, func():
				close()
				world.focus_body(bid), UiTheme.TEAL)


func _upgrades() -> void:
	var gs = GameState
	for u in Balance.UPGRADES:
		var lvl := int(gs.upgrade_levels[u.key])
		var c: float = gs.upgrade_cost(u.key)
		var key: String = u.key
		var eff := "level %d of %d" % [lvl, int(u.max)]
		_row("up_" + key, str(u.name), str(u.desc), eff, _price(c) if c > 0.0 else "", "", c > 0.0 and gs.money >= c, func(): _buy("up:" + key))


func _helpers() -> void:
	var gs = GameState
	for hd in Balance.HELPERS:
		var c: float = gs.helper_cost(hd.key)
		var key: String = hd.key
		_row("helper_" + key, str(hd.name), str(hd.desc), "%d working" % gs.helper_count(key), _price(c), "", c > 0.0 and gs.money >= c, func(): _buy("helper:" + key))
	_section("Give them a hand")
	_row("ad", "Helper rush", "Pelicans and crabs work three times as fast for 3 minutes.", "", "Watch ad", "", gs.has_helpers() and Monetization.is_rewarded_ready(Monetization.PLACEMENT_HELPER_RUSH), func(): world.watch_ad("helper_rush"), UiTheme.TEAL)


func _purchases() -> void:
	var gs = GameState
	_section("Free, for a short ad")
	_row("ad", "2x pumping", "Every pump works twice as hard for 5 minutes. Stacks to 15.", "", "Watch ad", "", gs.boost_can_stack(), func(): world.watch_ad("boost"), UiTheme.TEAL)
	_row("ad", "Free coins", "A few minutes of takings.", "+%s" % Fmt.num(gs.instant_cash_amount()), "Watch ad", "", true, func(): world.watch_ad("cash"), UiTheme.TEAL)
	_row("ad", "Double ticket sales", "The aquarium sells twice the tickets for 10 minutes.", "", "Watch ad", "", gs.aquarium_income() > 0.0, func(): world.watch_ad("tickets"), UiTheme.TEAL)
	_section("From the harbour office")
	var ra := Monetization.PRODUCT_REMOVE_ADS_2X
	_row("flag_z", "No ads, and 2x pumping for good", "Every pump and helper works twice as hard, forever. No ad breaks.", "owned" if gs.owns_remove_ads else "", "" if gs.owns_remove_ads else Monetization.price(ra), "", true, func(): Monetization.buy(ra))
	var br := Monetization.PRODUCT_BRASS
	_row("pump_5", "Polished brass pumps", "Every pump in gleaming brass, and 10% more flow.", "owned" if gs.owns_brass else "", "" if gs.owns_brass else Monetization.price(br), "", true, func(): Monetization.buy(br))
	if gs.starter_offered and not gs.owns_starter:
		var st := Monetization.PRODUCT_STARTER
		_row("chest", "Harbour starter pack", "A strongbox of coins and the signal-flag livery for your pumps. Once only.", "+%s" % Fmt.num(gs.starter_cash()), Monetization.price(st), "", true, func(): Monetization.buy(st))
	for pid in [Monetization.PRODUCT_CASH_SMALL, Monetization.PRODUCT_CASH_MEDIUM, Monetization.PRODUCT_CASH_LARGE]:
		var pd: Dictionary = Monetization.PRODUCTS[pid]
		_row("coins", str(pd.title), "", "+%s" % Fmt.num(gs.cash_pack_amount(str(pd.pack))), Monetization.price(pid), "", true, func(): Monetization.buy(pid))
	_row("restore", "Restore purchases", "Bought on another device? Get it back here.", "", "Restore", "", true, func():
		Monetization.restore()
		hud.toast("Purchases restored."), UiTheme.INK)
	_section("Sound")
	_row("sound", "Sound", "Pumps, gulls and the sea.", "off" if Sound.muted else "on", "Turn on" if Sound.muted else "Turn off", "", true, func():
		Sound.set_muted(not Sound.muted)
		_dirty = true, UiTheme.INK)


func _dev() -> void:
	var gs = GameState
	_note("Playtest builds only. Ads watched: %d, purchases: %d, interstitials: %d. Played %s." % [gs.ads_watched, gs.purchases_made, Monetization.interstitials_shown, Fmt.duration(gs.play_time)])
	_section("Time")
	for ts in [1.0, 5.0, 10.0, 50.0]:
		var v: float = ts
		_row("clock", "Time x%d" % int(ts), "", "now" if is_equal_approx(Engine.time_scale, ts) else "", "Set", "", true, func():
			Engine.time_scale = v
			_dirty = true, UiTheme.INK)
	_section("Money")
	for im in [1.0, 10.0, 100.0]:
		var v: float = im
		_row("coins", "Income x%d" % int(im), "", "now" if is_equal_approx(gs.income_mult, im) else "", "Set", "", true, func():
			gs.income_mult = v
			_dirty = true, UiTheme.INK)
	_row("coins", "Give coins", "Ten times the next pump.", "", "Give", "", true, func(): gs.grant_money(maxf(gs.next_pump_cost(), 1000.0) * 10.0), UiTheme.INK)
	_row("chest", "Unlock everything", "Every pump, upgrade, helper and barge.", "", "Unlock", "", true, func():
		gs.unlock_everything()
		world.on_shop_bought(), UiTheme.INK)
	_section("Skip to a ring")
	for r in Balance.RINGS.size():
		var rr: int = r
		_row("pool", str(Balance.RINGS[r].name), "", "", "Skip", "", true, func():
			close()
			world.skip_to_ring(rr), UiTheme.INK)
	_section("Save")
	_row("restore", "Reset the save", "Start the bay over (purchases kept).", "", "Reset", "", true, func():
		close()
		world.dev_reset(), UiTheme.FLAG_RED)


class IndexTab extends BaseButton:
	## A thumb-cut ledger tab: paper, the name in italic, each its own width.
	var text := ""
	var active := false
	var k := 0

	func _init(t: String, on: bool, idx: int) -> void:
		text = t
		active = on
		k = idx
		focus_mode = Control.FOCUS_NONE
		custom_minimum_size = Vector2(150, 62)

	func _draw() -> void:
		var inset := 0.0 if active else 14.0 + 6.0 * UiTheme.jitter(k, 2)
		var w := size.x - inset
		var r := Rect2(Vector2(inset, 0), Vector2(w + 30, size.y - 4))
		var col := UiTheme.PAPER if active else UiTheme.PAPER_SHADE
		draw_colored_polygon(UiTheme.rough_rect(Rect2(r.position + Vector2(3, 4), r.size), k + 40, 1.0), Color(0.05, 0.12, 0.15, 0.3))
		draw_colored_polygon(UiTheme.rough_rect(r, k + 20, 1.2), col)
		var f := UiTheme.italic()
		draw_string(f, Vector2(inset + 16, size.y * 0.5 + 8), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 24, UiTheme.INK if active else UiTheme.DIM_INK)


class TableRow extends MarginContainer:
	## One printed row: a ruled line under it.
	func _init() -> void:
		add_theme_constant_override("margin_top", 8)
		add_theme_constant_override("margin_bottom", 8)
		add_theme_constant_override("margin_left", 4)
		add_theme_constant_override("margin_right", 10)

	func _draw() -> void:
		draw_line(Vector2(0, size.y - 1), Vector2(size.x, size.y - 1), Color(UiTheme.INK, 0.28), 1.0)
