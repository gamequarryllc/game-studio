class_name ShopPanel
extends Control
## The supply shack's counter: a blackened iron panel under the brass title
## plate, manila file-folder tabs (each cut to its label, so they're uneven)
## for tools, upgrades, the crew, your collection of finds, and bonuses (free
## rewards for a short ad, and the purchases). Items are paper ledger cards
## with their price stamped in red ink; ads are cream tickets. Opened from the
## shack at the top. `buttons` maps an item id to its buy button (bots, tests).

signal closed
signal bought(kind: String)
signal message(text: String)

const TABS := [["tools", "Tools", "pickaxe"], ["upgrades", "Upgrades", "power"], ["crew", "Crew", "mole"], ["finds", "Finds", "trex"], ["bonus", "Bonus", "coin"]]

var tab := "tools"
var _list: VBoxContainer
var _scroll: ScrollContainer
var _money: Label
var _tab_buttons := {}
var _refreshers: Array = []
var _refresh_t := 0.0
var _banner: Control
var _panel: PanelContainer
var _banner_button: Button
var buttons := {}                 # item id ("pickaxe", "power", "mole", "ad_cash", product id) -> Button


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.015, 0.01, 0.72)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", UiTheme.iron_panel(26.0))
	center.add_child(_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	_panel.add_child(v)
	# Title row.
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 14)
	v.add_child(top)
	var title := PanelContainer.new()
	title.add_theme_stylebox_override("panel", UiTheme.plate(UiTheme.BRASS, true, Vector4(22, 6, 22, 8)))
	var tl := UiTheme.label("The Supply Shack", 32, Color(0.18, 0.11, 0.05), 0)
	UiTheme.sign_text(tl, 34, Color(0.18, 0.11, 0.05), 0)
	title.add_child(tl)
	top.add_child(title)
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(sp)
	var mbox := PanelContainer.new()
	mbox.add_theme_stylebox_override("panel", UiTheme.screen(Color(0.08, 0.06, 0.04, 1.0), 14.0))
	var mrow := HBoxContainer.new()
	mrow.add_theme_constant_override("separation", 6)
	mbox.add_child(mrow)
	mrow.add_child(_icon("coin", 32))
	_money = UiTheme.label("", 28, UiTheme.AMBER, 0)
	mrow.add_child(_money)
	top.add_child(mbox)
	var close := Button.new()
	close.icon = UiTheme.icon("close")
	close.custom_minimum_size = Vector2(64, 56)
	UiTheme.style_button(close, UiTheme.ENAMEL_RED, 28)
	close.pressed.connect(close_shop)
	top.add_child(close)
	# Tabs: manila folder tabs, each as wide as its label (so they're uneven),
	# set slightly apart and not quite in line.
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 6)
	tabs.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(tabs)
	var lead := Control.new()
	lead.custom_minimum_size = Vector2(14, 0)
	tabs.add_child(lead)
	for i in TABS.size():
		var t: Array = TABS[i]
		var b := Button.new()
		b.text = t[1]
		b.icon = UiTheme.icon(t[2])
		b.custom_minimum_size = Vector2(0, 50)
		b.size_flags_vertical = Control.SIZE_SHRINK_END
		b.pressed.connect(func():
			Sound.play("click", -6.0)
			show_tab(t[0]))
		tabs.add_child(b)
		_tab_buttons[t[0]] = b
	# The anchor offer, always on top until it's bought.
	_banner = _make_banner()
	v.add_child(_banner)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 8)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	GameState.changed.connect(_refresh)
	Monetization.purchases_changed.connect(func(): show_tab(tab))
	get_viewport().size_changed.connect(_fit)
	_fit()
	show_tab(tab)


func _fit() -> void:
	var vs := get_viewport_rect().size
	_panel.custom_minimum_size = Vector2(minf(1120.0, vs.x - 40.0), minf(640.0, vs.y - 30.0))


func close_shop() -> void:
	Sound.play("ui_close", -6.0)
	closed.emit()


func _process(delta: float) -> void:
	_refresh_t += delta
	if _refresh_t > 0.5:
		_refresh_t = 0.0
		_refresh()


func _refresh() -> void:
	if not is_inside_tree():
		return
	_money.text = Fmt.num(GameState.money)
	for r in _refreshers:
		(r as Callable).call()
	_banner.visible = not GameState.owns_remove_ads


func _style_tab(b: Button, active: bool, i: int) -> void:
	UiTheme.no_keyboard(b)
	b.add_theme_font_override("font", UiTheme.bold_font())
	b.add_theme_font_size_override("font_size", 20)
	b.add_theme_constant_override("icon_max_width", 28)
	b.add_theme_constant_override("h_separation", 8)
	b.add_theme_constant_override("outline_size", 0)
	for st in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, UiTheme.INK if active else UiTheme.INK.lightened(0.15))
	# The active tab stands taller and lighter; the others sit lower, in manila.
	var lift := 8 if active else 2 + (i % 3) * 2
	var pad := Vector4(18 + (i * 5) % 9, lift, 20 + (i * 3) % 7, 6)
	var st := UiTheme.paper(pad, 40 + i, false, UiTheme.PAPER if active else UiTheme.MANILA.darkened(0.05 * (i % 2)))
	st.shadow = Color(0, 0, 0, 0.0 if active else 0.25)
	for key in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		b.add_theme_stylebox_override(key, st)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())


func button_for(id: String) -> Button:
	## The buy (or watch) button for an item on the current tab, or null.
	var b: Button = buttons.get(id)
	return b if b != null and is_instance_valid(b) else null


func show_tab(t: String) -> void:
	tab = t
	var i := 0
	for k in _tab_buttons:
		_style_tab(_tab_buttons[k], k == t, i)
		i += 1
	for c in _list.get_children():
		c.queue_free()
	_refreshers.clear()
	buttons.clear()
	match t:
		"tools":
			_build_tools()
		"upgrades":
			_build_upgrades()
		"crew":
			_build_crew()
		"finds":
			_build_finds()
		"bonus":
			_build_bonus()
	_scroll.scroll_vertical = 0
	_refresh()


# --- Building blocks ---------------------------------------------------------------------------
func _icon(name: String, size: float) -> TextureRect:
	var t := TextureRect.new()
	t.texture = UiTheme.icon(name)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(size, size)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t

func _row(icon: String, title: String, desc: String, tint: Color = UiTheme.PAPER) -> Dictionary:
	## A ledger card: the item's picture in the margin, its name and notes in
	## ink, the price stamped on the right.
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiTheme.paper(Vector4(14, 8, 16, 8), _list.get_child_count() * 7 + title.length(), true, tint))
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 18)
	p.add_child(h)
	var ic := _icon(icon, 62)
	h.add_child(ic)
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 0)
	h.add_child(v)
	var tl := UiTheme.label(title, 24, UiTheme.INK, 0)
	v.add_child(tl)
	var dl := UiTheme.label(desc, 17, UiTheme.INK.lightened(0.22), 0, false)
	dl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(dl)
	var b := Button.new()
	b.custom_minimum_size = Vector2(190, 58)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiTheme.style_stamp(b, 22)
	h.add_child(b)
	_list.add_child(p)
	return {"panel": p, "title": tl, "desc": dl, "button": b, "icon": ic}


func _section(text: String) -> void:
	var l := UiTheme.label(text, 22, UiTheme.BRASS_LIGHT, 4)
	UiTheme.sign_text(l, 22, UiTheme.BRASS_LIGHT, 4)
	_list.add_child(l)


func _set_buy(b: Button, cost: float, ok_text: String = "") -> void:
	## The price, stamped in red when you can pay it, in grey pencil when you can't.
	var afford := GameState.money >= cost
	b.text = ok_text if ok_text != "" else Fmt.num(cost)
	b.icon = null if ok_text != "" else UiTheme.icon("coin")
	b.disabled = not afford


func _set_owned(b: Button, text: String) -> void:
	b.text = text
	b.icon = UiTheme.icon("check")
	b.disabled = true


func _fail_sound() -> void:
	Sound.play("cant_afford", -5.0, 1.0, 0.05)


# --- Tabs ------------------------------------------------------------------------------------------
func _build_tools() -> void:
	for i in Balance.TOOLS.size():
		var t: Dictionary = Balance.TOOLS[i]
		var r := _row(str(t.icon), str(t.name), str(t.desc))
		var idx := i
		var b: Button = r.button
		b.pressed.connect(func():
			if GameState.buy_tool(idx):
				Sound.play("buy_tool", -2.0)
				message.emit("The %s is yours. Go try it." % str(t.name).to_lower())
				bought.emit("tool")
				show_tab("tools")
			else:
				_fail_sound())
		_refreshers.append(func():
			var stats := "Power %s · %s hits a second · %.1f m wide" % [Fmt.num(float(t.damage)), Fmt.num(float(t.rate)), float(t.radius) * 2.0]
			(r.desc as Label).text = "%s\n%s" % [t.desc, stats]
			if idx <= GameState.tool_index:
				_set_owned(b, "In hand" if idx == GameState.tool_index else "Owned")
			elif idx == GameState.next_tool_index():
				_set_buy(b, float(t.cost))
			else:
				b.text = Fmt.num(float(t.cost))
				b.icon = UiTheme.icon("lock")
				b.disabled = true)
		buttons[str(t.icon)] = b
		# Short for the next tool: the free cash ad and the cash packs, right here.
		if i == GameState.next_tool_index() and GameState.money < float(t.cost):
			_build_short_strip(float(t.cost))


func _build_short_strip(cost: float) -> void:
	## Short for the next tool: a manila note pinned under it.
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiTheme.paper(Vector4(18, 6, 14, 6), 77, false, UiTheme.MANILA))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	p.add_child(h)
	var l := UiTheme.label("%s short." % Fmt.num(cost - GameState.money), 20, UiTheme.INK, 0)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(l)
	var ad := Button.new()
	ad.text = "Free +%s" % Fmt.num(GameState.instant_cash_amount())
	ad.custom_minimum_size = Vector2(0, 48)
	UiTheme.style_ticket(ad, 18)
	ad.pressed.connect(func(): _watch("cash"))
	h.add_child(ad)
	buttons["ad_cash_short"] = ad
	for id in [Monetization.PRODUCT_CASH_SMALL, Monetization.PRODUCT_CASH_MEDIUM]:
		var b := Button.new()
		var pk: String = Monetization.PRODUCTS[id].pack
		b.text = "+%s  %s" % [Fmt.num(GameState.cash_pack_amount(pk)), Monetization.price(id)]
		b.custom_minimum_size = Vector2(0, 48)
		UiTheme.style_stamp(b, 18, UiTheme.UMBER)
		var pid: String = id
		b.pressed.connect(func(): Monetization.buy(pid))
		h.add_child(b)
		buttons[pid + "_short"] = b
	_list.add_child(p)


func _build_upgrades() -> void:
	for u in Balance.UPGRADES:
		var key: String = u.key
		var r := _row(str(u.icon), str(u.name), str(u.desc))
		var b: Button = r.button
		b.pressed.connect(func():
			if GameState.buy_upgrade(key):
				Sound.play("buy_upgrade", -3.0, 1.0, 0.04)
				bought.emit("upgrade")
			else:
				_fail_sound())
		_refreshers.append(func():
			var lv := int(GameState.upgrade_levels[key])
			(r.title as Label).text = "%s  ·  Lv %d/%d" % [u.name, lv, int(u.max)]
			if GameState.upgrade_maxed(key):
				_set_owned(b, "Maxed")
			else:
				_set_buy(b, GameState.upgrade_cost(key)))
		buttons[key] = b


func _build_crew() -> void:
	for i in Balance.HELPERS.size():
		var hd: Dictionary = Balance.HELPERS[i]
		var idx := i
		var r := _row(str(hd.icon), str(hd.name), str(hd.desc))
		var b: Button = r.button
		b.pressed.connect(func():
			if GameState.buy_helper(idx):
				Sound.play("hire", -3.0, 1.0 + 0.15 * idx, 0.05)
				message.emit("%s hired. It digs at the bottom of your shaft." % hd.name)
				bought.emit("helper")
			else:
				_fail_sound())
		_refreshers.append(func():
			var n := int(GameState.helper_counts[idx])
			(r.title as Label).text = "%s  ×%d" % [hd.name, n]
			(r.desc as Label).text = "%s\nDigs %s power/s each%s" % [hd.desc, Fmt.num(float(hd.power)), "" if n == 0 else "  ·  crew total %s/s" % Fmt.num(GameState.helper_power(idx))]
			_set_buy(b, GameState.helper_cost(idx)))
		buttons[str(hd.key)] = b
	var note := UiTheme.label("The crew digs around the lift stop, even while you're up here shopping.", 17, UiTheme.CREAM.darkened(0.1), 3, false)
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_list.add_child(note)


func _build_finds() -> void:
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_child(grid)
	var count := 0
	for f in Balance.FINDS.size():
		var d: Dictionary = Balance.FINDS[f]
		var got: bool = GameState.found[f]
		if got:
			count += 1
		var rc: Color = Balance.rarity(f).color
		var p := PanelContainer.new()
		p.add_theme_stylebox_override("panel", UiTheme.paper(Vector4(10, 8, 10, 8), f * 13, false, UiTheme.PAPER if got else UiTheme.MANILA.darkened(0.25)))
		p.custom_minimum_size = Vector2(240, 120)
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var v := VBoxContainer.new()
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.add_theme_constant_override("separation", 0)
		p.add_child(v)
		var ic := _icon(str(d.icon) if got else "unknown", 56)
		ic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		if not got:
			ic.modulate = Color(0.6, 0.55, 0.5, 0.8)
		v.add_child(ic)
		var zone_name: String = Balance.ZONES[int(d.zone)].name
		var nl := UiTheme.label(str(d.name) if got else "Somewhere in the " + zone_name.to_lower(), 17 if got else 15, UiTheme.INK if got else UiTheme.INK.lightened(0.3), 0)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		nl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		v.add_child(nl)
		if got:
			var rl := UiTheme.label("%s · %s" % [Balance.rarity(f).name, Fmt.num(GameState.find_value(f))], 14, rc.darkened(0.35), 0)
			rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			v.add_child(rl)
		grid.add_child(p)
	var head := UiTheme.label("%d of %d found" % [count, Balance.FINDS.size()], 20, UiTheme.BRASS_LIGHT, 5)
	_list.add_child(head)
	_list.move_child(head, 0)


func _build_bonus() -> void:
	_section("Free, for a short ad")
	for kind in ["boost", "cash", "helper_rush"]:
		var rw: Dictionary = Balance.AD_REWARDS[kind]
		var r := _row(str(rw.icon), str(rw.title), "")
		var b: Button = r.button
		var k: String = kind
		b.pressed.connect(func(): _watch(k))
		_refreshers.append(func():
			var ok := AdOffers.eligible(k) or (k == "boost" and GameState.boost_can_stack())
			match k:
				"boost":
					(r.desc as Label).text = "Swing twice as fast. Stacks up to 15 minutes." + ("  Now: %s left" % Fmt.duration(GameState.boost_seconds_left()) if GameState.is_boost_active() else "")
				"cash":
					(r.desc as Label).text = "+%s cash, right now" % Fmt.num(GameState.instant_cash_amount())
				"helper_rush":
					(r.desc as Label).text = "Moles and robo-moles dig three times as hard for 3 minutes." if GameState.has_helpers() else "Hire some crew first."
			if k == "helper_rush":
				ok = GameState.has_helpers()
			if k == "cash":
				ok = true
			b.text = "Watch"
			b.disabled = not ok or Monetization.is_watching())
		UiTheme.style_ticket(b, 21)
		buttons["ad_" + k] = b
	_section("For sale")
	_product_row(Monetization.PRODUCT_REMOVE_ADS_2X, "noads", "No more ad breaks, and every tool swings twice as fast. For good.")
	if not GameState.owns_starter:
		_product_row(Monetization.PRODUCT_STARTER, "gift", "%s cash and the crystal tools, which glow purple. Once only." % Fmt.num(GameState.starter_cash()))
	_product_row(Monetization.PRODUCT_GOLDEN, "golden", "Every tool in polished gold, and 10% more digging power.")
	for id in [Monetization.PRODUCT_CASH_SMALL, Monetization.PRODUCT_CASH_MEDIUM, Monetization.PRODUCT_CASH_LARGE]:
		var pk: String = Monetization.PRODUCTS[id].pack
		_product_row(id, {"small": "sack", "medium": "crate", "large": "cart"}[pk], "+%s cash" % Fmt.num(GameState.cash_pack_amount(pk)))
	# Skins you own.
	if GameState.owns_golden or GameState.owns_starter:
		_section("Tool finish")
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 8)
		_list.add_child(h)
		var opts := [["", "Plain steel"]]
		if GameState.owns_golden:
			opts.append(["golden", "Golden"])
		if GameState.owns_starter:
			opts.append(["crystal", "Crystal"])
		for o in opts:
			var b := Button.new()
			b.text = o[1]
			b.custom_minimum_size = Vector2(0, 52)
			b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var sk: String = o[0]
			UiTheme.style_button(b, UiTheme.BRASS if GameState.skin == sk else UiTheme.IRON_LIGHT, 20)
			b.pressed.connect(func():
				GameState.skin = sk
				GameState.changed.emit()
				show_tab("bonus"))
			h.add_child(b)
	_section("Settings")
	var srow := HBoxContainer.new()
	srow.add_theme_constant_override("separation", 8)
	_list.add_child(srow)
	var mute := Button.new()
	mute.custom_minimum_size = Vector2(0, 52)
	mute.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	srow.add_child(mute)
	buttons["mute"] = mute
	var upd_mute := func():
		mute.text = "Sound off" if Sound.muted else "Sound on"
		mute.icon = UiTheme.icon("sound_off" if Sound.muted else "sound_on")
		UiTheme.style_button(mute, UiTheme.IRON_LIGHT, 20)
	upd_mute.call()
	mute.pressed.connect(func():
		Sound.set_muted(not Sound.muted)
		upd_mute.call())
	var restore := Button.new()
	restore.text = "Restore purchases"
	restore.custom_minimum_size = Vector2(0, 52)
	restore.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	UiTheme.style_button(restore, UiTheme.IRON_LIGHT, 20)
	restore.pressed.connect(func():
		Monetization.restore()
		message.emit("Purchases restored"))
	srow.add_child(restore)
	buttons["restore"] = restore
	if OS.has_feature("editor") or OS.has_feature("playtest"):
		_build_dev()


func _product_row(id: String, icon: String, desc: String) -> void:
	var r := _row(icon, str(Monetization.PRODUCTS[id].title), desc)
	var b: Button = r.button
	b.pressed.connect(func(): Monetization.buy(id))
	buttons[id] = b
	_refreshers.append(func():
		if Monetization.owns(id):
			_set_owned(b, "Owned")
		else:
			b.text = Monetization.price(id)
			b.icon = null
			b.disabled = false)


func _make_banner() -> Control:
	## The anchor offer: a signal-red enamel sign with a brass price plate.
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiTheme.enamel(UiTheme.ENAMEL_RED, Vector4(20, 8, 12, 8), 19))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	p.add_child(h)
	h.add_child(_icon("noads", 44))
	var l := UiTheme.label("No ads, and 2x digging for good", 22, UiTheme.CREAM, 5)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.add_child(l)
	var b := Button.new()
	b.text = Monetization.price(Monetization.PRODUCT_REMOVE_ADS_2X)
	b.custom_minimum_size = Vector2(180, 50)
	UiTheme.style_button(b, UiTheme.BRASS, 20)
	b.pressed.connect(func(): Monetization.buy(Monetization.PRODUCT_REMOVE_ADS_2X))
	h.add_child(b)
	_banner_button = b
	return p


func _watch(kind: String) -> void:
	Monetization.watch_for_reward(kind, func(ok: bool, text: String):
		if ok:
			Sound.play("reward", -3.0)
			message.emit(text)
		show_tab(tab))


func _build_dev() -> void:
	## Playtest builds only (the "playtest" feature tag, or the editor).
	_section("Playtest tools (not in the store build)")
	var row := func() -> HBoxContainer:
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 6)
		_list.add_child(h)
		return h
	var add := func(h: HBoxContainer, text: String, on: bool, cb: Callable):
		var b := Button.new()
		b.text = text
		b.custom_minimum_size = Vector2(0, 46)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		UiTheme.style_button(b, UiTheme.UMBER.lightened(0.15) if on else UiTheme.IRON_LIGHT, 17)
		b.pressed.connect(func():
			cb.call()
			show_tab("bonus"))
		h.add_child(b)
	var h1: HBoxContainer = row.call()
	for ts in [1.0, 5.0, 10.0, 50.0]:
		var t: float = ts
		add.call(h1, "time %dx" % int(t), is_equal_approx(Engine.time_scale, t), func(): Engine.time_scale = t)
	var h2: HBoxContainer = row.call()
	for im in [1.0, 10.0, 100.0]:
		var m: float = im
		add.call(h2, "income %dx" % int(m), is_equal_approx(GameState.income_mult, m), func(): GameState.income_mult = m)
	add.call(h2, "dig %dx" % (1 if GameState.debug_speed > 1.0 else 10), GameState.debug_speed > 1.0, func():
		GameState.debug_speed = 1.0 if GameState.debug_speed > 1.0 else 10.0)
	var h3: HBoxContainer = row.call()
	add.call(h3, "+cash (10x next tool)", false, func(): GameState.grant_money(maxf(1000.0, GameState.next_tool_cost() * 10.0)))
	add.call(h3, "unlock everything", false, func(): GameState.unlock_everything())
	add.call(h3, "reset save", false, func():
		Engine.time_scale = 1.0
		GameState.wipe_save()
		get_tree().reload_current_scene())
	var h4: HBoxContainer = row.call()
	for z in Balance.zone_count():
		var zz: int = z
		add.call(h4, str(z + 1), false, func():
			var w := get_tree().current_scene
			if w != null and w.has_method("skip_to_zone"):
				closed.emit()
				w.skip_to_zone(zz))
	var hint := UiTheme.label("Skip to a layer (1 = topsoil, 10 = inner core). Time scale: %sx · income %sx" % [Fmt.num(Engine.time_scale), Fmt.num(GameState.income_mult)], 15, UiTheme.DIM, 3, false)
	_list.add_child(hint)
	var stats := UiTheme.label("Ads watched %d · interstitials %d · purchases %d · played %s" % [GameState.ads_watched, Monetization.interstitials_shown, GameState.purchases_made, Fmt.duration(GameState.play_time)], 15, UiTheme.DIM, 3, false)
	_list.add_child(stats)
