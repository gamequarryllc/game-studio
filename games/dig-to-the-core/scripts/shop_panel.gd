class_name ShopPanel
extends Control
## The supply shack's counter, built as the shack itself (no modal box): its
## plank back wall, the brass title plate, and five things on the wall you
## can turn to, each its own object and material:
##  - Tools: a pegboard, every tool hanging on its hook with a paper price tag
##    tied on (tap the tag to buy); a note on the bench says what's next.
##  - Upgrades: the open ledger, one entry each, your level kept in pencil
##    tally marks, the price stamped in red.
##  - Crew: two "hands wanted" notices pinned up.
##  - Finds: a cabinet of drawers, one per find, each with a brass label
##    holder and a card you can read; dug-out finds sit in their open drawer.
##  - Bonus: one enamel sign for No ads + 2x (the only place it's sold), free
##    tickets for a short ad, price tags for the rest, the settings.
## `buttons` maps an item id to its buy button (bots, tests).

signal closed
signal bought(kind: String)
signal message(text: String)

const TABS := [["tools", "Tools", "pickaxe"], ["upgrades", "Upgrades", "power"], ["crew", "Crew", "mole"], ["finds", "Finds", "trex"], ["bonus", "Bonus", "coin"]]
const KRAFT := Color(0.8, 0.66, 0.44)
const INK := UiTheme.INK

var tab := "tools"
var _list: VBoxContainer
var _scroll: ScrollContainer
var _money: Label
var _tab_buttons := {}
var _refreshers: Array = []
var _refresh_t := 0.0
var _panel: PanelContainer
var buttons := {}                 # item id ("pickaxe", "power", "mole", "ad_cash", product id) -> Button


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.015, 0.01, 0.78)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_panel = PanelContainer.new()
	var wall := WoodBox.new()
	wall.kind = "planks"
	wall.seed = 3
	wall.content_margin_left = 26
	wall.content_margin_right = 26
	wall.content_margin_top = 18
	wall.content_margin_bottom = 40
	_panel.add_theme_stylebox_override("panel", wall)
	center.add_child(_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	_panel.add_child(v)
	# Title row: the brass plate (kept from before), the cash window, the close sign.
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 14)
	v.add_child(top)
	var title := PanelContainer.new()
	title.add_theme_stylebox_override("panel", UiTheme.plate(UiTheme.BRASS, true, Vector4(22, 6, 22, 8)))
	var tl := UiTheme.label("The Supply Shack", 32, Color(0.18, 0.11, 0.05), 0)
	UiTheme.sign_text(tl, 34, Color(0.18, 0.11, 0.05), 0)
	title.add_child(tl)
	title.rotation = -0.008
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
	# What's on the wall: five different objects, not five equal tabs.
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 14)
	tabs.custom_minimum_size = Vector2(0, 58)
	v.add_child(tabs)
	for i in TABS.size():
		var t: Array = TABS[i]
		var b := Button.new()
		b.text = t[1]
		b.icon = UiTheme.icon(t[2])
		b.custom_minimum_size = Vector2(0, 50)
		b.size_flags_vertical = Control.SIZE_SHRINK_BEGIN if i % 2 else Control.SIZE_SHRINK_END
		b.pressed.connect(func():
			Sound.play("click", -6.0)
			show_tab(t[0]))
		tabs.add_child(b)
		_tab_buttons[t[0]] = b
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 12)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	GameState.changed.connect(_refresh)
	Monetization.purchases_changed.connect(func(): show_tab(tab))
	get_viewport().size_changed.connect(_fit)
	_fit()
	show_tab(tab)


func _fit() -> void:
	var vs := get_viewport_rect().size
	_panel.custom_minimum_size = Vector2(minf(1140.0, vs.x - 30.0), minf(660.0, vs.y - 24.0))


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


func _style_tab(b: Button, active: bool, i: int) -> void:
	## Each section is its own object on the wall: a kraft tool tag, the
	## ledger's red cloth spine, a pinned paper notice, a brass drawer plate,
	## an enamel sign. The one you're looking at stands out; the rest sit back.
	UiTheme.no_keyboard(b)
	b.add_theme_font_override("font", UiTheme.bold_font())
	b.add_theme_font_size_override("font_size", 22)
	b.add_theme_constant_override("icon_max_width", 30)
	b.add_theme_constant_override("h_separation", 8)
	b.add_theme_constant_override("outline_size", 0)
	var st: StyleBox
	var tc := INK
	match i:
		0:
			var p := UiTheme.paper(Vector4(30, 8, 18, 8), 41, false, KRAFT)
			p.hole = true
			st = p
		1:
			var e := UiTheme.enamel(Color(0.42, 0.12, 0.09), Vector4(20, 8, 20, 8), 42, UiTheme.BRASS_LIGHT)
			e.chips = 1
			st = e
			tc = UiTheme.BRASS_LIGHT
		2:
			st = UiTheme.paper(Vector4(18, 10, 20, 8), 43, false, UiTheme.PAPER)
		3:
			st = UiTheme.plate(UiTheme.BRASS, true, Vector4(20, 7, 20, 8))
			tc = Color(0.18, 0.11, 0.05)
		_:
			st = UiTheme.enamel(UiTheme.CREAM, Vector4(18, 8, 18, 8), 44, UiTheme.ENAMEL_RED)
			tc = UiTheme.ENAMEL_RED.darkened(0.2)
	for k in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		b.add_theme_stylebox_override(k, st)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(c, tc)
	b.modulate = Color.WHITE if active else Color(0.68, 0.64, 0.6)
	b.rotation = [-0.03, 0.02, -0.015, 0.0, 0.025][i] * (0.5 if active else 1.0)
	b.pivot_offset = b.size * 0.5
	b.scale = Vector2(1.06, 1.06) if active else Vector2.ONE


func button_for(id: String) -> Button:
	## The buy (or watch) button for an item on the current section, or null.
	var b: Button = buttons.get(id)
	return b if b != null and is_instance_valid(b) else null


func show_tab(t: String) -> void:
	tab = t
	var i := 0
	for k in _tab_buttons:
		_style_tab(_tab_buttons[k], k == t, i)
		i += 1
	for c in _list.get_children():
		_list.remove_child(c)
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


func _ink(text: String, size: int = 20, color: Color = INK, bold: bool = false) -> Label:
	var l := UiTheme.label(text, size, color, 0, bold)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


func _wall_heading(text: String) -> Label:
	## Painted on the planks, in Rye.
	var l := UiTheme.label(text, 26, UiTheme.CREAM, 0)
	UiTheme.sign_text(l, 26, UiTheme.CREAM.darkened(0.06), 6)
	return l


func _stamp_button(min_w: float = 150.0) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(min_w, 50)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiTheme.style_stamp(b, 22)
	return b


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


func _pin(c: Control, at_x: float = 0.5) -> void:
	## A brass drawing pin at the top of a notice.
	c.draw.connect(func():
		var p := Vector2(c.size.x * at_x, 9.0)
		c.draw_circle(p + Vector2(1.5, 2.0), 7.0, Color(0, 0, 0, 0.35))
		c.draw_circle(p, 6.5, Color(0.42, 0.28, 0.11))
		c.draw_circle(p, 5.0, UiTheme.BRASS)
		c.draw_circle(p + Vector2(-1.5, -1.5), 1.8, UiTheme.BRASS_LIGHT))


# --- Tools: the pegboard -----------------------------------------------------------------------------
func _build_tools() -> void:
	var board := PanelContainer.new()
	var pb := WoodBox.new()
	pb.kind = "pegboard"
	pb.seed = 11
	pb.content_margin_left = 22
	pb.content_margin_right = 22
	pb.content_margin_top = 16
	pb.content_margin_bottom = 16
	board.add_theme_stylebox_override("panel", pb)
	board.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_child(board)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 8)
	board.add_child(grid)
	for i in Balance.TOOLS.size():
		var t: Dictionary = Balance.TOOLS[i]
		var idx := i
		var slot := VBoxContainer.new()
		slot.add_theme_constant_override("separation", 0)
		slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		slot.custom_minimum_size = Vector2(240, 0)
		grid.add_child(slot)
		# The tool on its hook.
		var hang := Control.new()
		hang.custom_minimum_size = Vector2(0, 96)
		slot.add_child(hang)
		var ic := _icon(str(t.icon), 92)
		hang.add_child(ic)
		ic.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
		ic.offset_left = -46
		ic.offset_right = 46
		ic.offset_top = -40
		ic.offset_bottom = 52
		ic.rotation = (float(i % 3) - 1.0) * 0.06
		ic.pivot_offset = Vector2(46, 4)
		hang.draw.connect(func():
			var cx := hang.size.x * 0.5
			hang.draw_line(Vector2(cx - 10, 6), Vector2(cx - 10, 16), Color(0.15, 0.13, 0.12), 3.0)
			hang.draw_line(Vector2(cx + 10, 6), Vector2(cx + 10, 16), Color(0.15, 0.13, 0.12), 3.0)
			hang.draw_circle(Vector2(cx - 10, 6), 2.5, Color(0.5, 0.48, 0.45))
			hang.draw_circle(Vector2(cx + 10, 6), 2.5, Color(0.5, 0.48, 0.45)))
		# The paper tag tied on with string.
		var tag := PanelContainer.new()
		var tb := UiTheme.paper(Vector4(30, 6, 12, 8), 60 + i * 7, false, KRAFT if i % 2 == 0 else KRAFT.lightened(0.06))
		tb.hole = true
		tag.add_theme_stylebox_override("panel", tb)
		tag.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		tag.rotation = (float((i * 5) % 7) - 3.0) * 0.012
		slot.add_child(tag)
		var tv := VBoxContainer.new()
		tv.add_theme_constant_override("separation", 2)
		tag.add_child(tv)
		var nm := _ink(str(t.name), 22, INK, true)
		nm.autowrap_mode = TextServer.AUTOWRAP_OFF
		tv.add_child(nm)
		var b := _stamp_button(150.0)
		tv.add_child(b)
		b.pressed.connect(func():
			if GameState.buy_tool(idx):
				Sound.play("buy_tool", -2.0)
				message.emit("The %s is yours. Go try it." % str(t.name).to_lower())
				bought.emit("tool")
				show_tab("tools")
			else:
				_fail_sound())
		_refreshers.append(func():
			if idx <= GameState.tool_index:
				_set_owned(b, "In hand" if idx == GameState.tool_index else "Owned")
				ic.modulate = Color.WHITE
			elif idx == GameState.next_tool_index():
				_set_buy(b, float(t.cost))
				ic.modulate = Color.WHITE
			else:
				b.text = Fmt.num(float(t.cost))
				b.icon = UiTheme.icon("lock")
				b.disabled = true
				ic.modulate = Color(0.55, 0.5, 0.45))
		buttons[str(t.icon)] = b
	# The note on the bench: what's next, in the shack's own words.
	var ni := GameState.next_tool_index()
	var note := PanelContainer.new()
	note.add_theme_stylebox_override("panel", UiTheme.paper(Vector4(26, 16, 22, 14), 77, true))
	note.rotation = -0.006
	_list.add_child(note)
	var nv := VBoxContainer.new()
	nv.add_theme_constant_override("separation", 4)
	note.add_child(nv)
	_pin(note, 0.5)
	if ni >= 0:
		var t: Dictionary = Balance.TOOLS[ni]
		var head := HBoxContainer.new()
		head.add_theme_constant_override("separation", 12)
		nv.add_child(head)
		var tl := _ink("Next up: the %s" % str(t.name).to_lower(), 26, INK, true)
		tl.autowrap_mode = TextServer.AUTOWRAP_OFF
		head.add_child(tl)
		var d := _ink("%s Power %s, %s hits a second, %.1f m wide." % [t.desc, Fmt.num(float(t.damage)), Fmt.num(float(t.rate)), float(t.radius) * 2.0], 20, INK.lightened(0.15))
		nv.add_child(d)
		if GameState.money < float(t.cost):
			_build_short_strip(nv, float(t.cost))
	else:
		nv.add_child(_ink("Every tool on the board is yours. Nothing left to buy but upgrades.", 22, INK, true))


func _build_short_strip(into: Container, cost: float) -> void:
	## Short for the next tool: the free cash ad and two cash packs, right on the note.
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	into.add_child(h)
	var l := _ink("%s short." % Fmt.num(cost - GameState.money), 22, UiTheme.ENAMEL_RED.darkened(0.15), true)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	h.add_child(l)
	var ad := Button.new()
	ad.text = "Free +%s" % Fmt.num(GameState.instant_cash_amount())
	ad.custom_minimum_size = Vector2(0, 50)
	UiTheme.style_ticket(ad, 20)
	ad.pressed.connect(func(): _watch("cash"))
	h.add_child(ad)
	buttons["ad_cash_short"] = ad
	for id in [Monetization.PRODUCT_CASH_SMALL, Monetization.PRODUCT_CASH_MEDIUM]:
		var b := Button.new()
		var pk: String = Monetization.PRODUCTS[id].pack
		b.text = "+%s  %s" % [Fmt.num(GameState.cash_pack_amount(pk)), Monetization.price(id)]
		b.custom_minimum_size = Vector2(0, 50)
		UiTheme.style_stamp(b, 20, UiTheme.UMBER)
		var pid: String = id
		b.pressed.connect(func(): Monetization.buy(pid))
		h.add_child(b)
		buttons[pid + "_short"] = b


# --- Upgrades: the ledger ------------------------------------------------------------------------------
func _build_upgrades() -> void:
	var book := PanelContainer.new()
	var lb := WoodBox.new()
	lb.kind = "ledger"
	lb.seed = 21
	lb.content_margin_left = 30
	lb.content_margin_right = 30
	lb.content_margin_top = 24
	lb.content_margin_bottom = 22
	book.add_theme_stylebox_override("panel", lb)
	book.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_child(book)
	var pages := HBoxContainer.new()
	pages.add_theme_constant_override("separation", 56)
	book.add_child(pages)
	var cols: Array = []
	for k in 2:
		var pv := VBoxContainer.new()
		pv.add_theme_constant_override("separation", 22)
		pv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		pages.add_child(pv)
		cols.append(pv)
	for ui in Balance.UPGRADES.size():
		var u: Dictionary = Balance.UPGRADES[ui]
		var key: String = u.key
		var e := HBoxContainer.new()
		e.add_theme_constant_override("separation", 12)
		(cols[ui / 2] as VBoxContainer).add_child(e)
		var ic := _icon(str(u.icon), 56)
		e.add_child(ic)
		var tv := VBoxContainer.new()
		tv.add_theme_constant_override("separation", 0)
		tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		e.add_child(tv)
		var nm := _ink(str(u.name), 24, INK, true)
		tv.add_child(nm)
		var tally := Control.new()
		tally.custom_minimum_size = Vector2(0, 26)
		tv.add_child(tally)
		var lvl := _ink("", 20, INK.lightened(0.2))
		tv.add_child(lvl)
		var desc := _ink(str(u.desc), 20, INK.lightened(0.2))
		tv.add_child(desc)
		tally.draw.connect(func():
			# The level in pencil, five-bar gates.
			var n := int(GameState.upgrade_levels[key])
			var x := 2.0
			var col := Color(0.25, 0.22, 0.2, 0.85)
			for g in range((n + 4) / 5):
				var in_g := mini(5, n - g * 5)
				for s in mini(in_g, 4):
					var xx := x + s * 6.0
					tally.draw_line(Vector2(xx, 4 + (s % 2)), Vector2(xx + 1.5, 22), col, 2.0)
				if in_g == 5:
					tally.draw_line(Vector2(x - 3, 18), Vector2(x + 23, 6), col, 2.0)
				x += 34.0)
		var b := _stamp_button(150.0)
		e.add_child(b)
		b.pressed.connect(func():
			if GameState.buy_upgrade(key):
				Sound.play("buy_upgrade", -3.0, 1.0, 0.04)
				bought.emit("upgrade")
			else:
				_fail_sound())
		_refreshers.append(func():
			var lv := int(GameState.upgrade_levels[key])
			lvl.text = "Level %d of %d" % [lv, int(u.max)]
			tally.queue_redraw()
			if GameState.upgrade_maxed(key):
				_set_owned(b, "Maxed")
			else:
				_set_buy(b, GameState.upgrade_cost(key)))
		buttons[key] = b


# --- Crew: notices on the wall ------------------------------------------------------------------------
func _build_crew() -> void:
	_list.add_child(_wall_heading("Hands wanted"))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 26)
	_list.add_child(row)
	for i in Balance.HELPERS.size():
		var hd: Dictionary = Balance.HELPERS[i]
		var idx := i
		var card := PanelContainer.new()
		card.add_theme_stylebox_override("panel", UiTheme.paper(Vector4(22, 22, 22, 16), 90 + i * 11, false, UiTheme.PAPER if i == 0 else UiTheme.MANILA.lightened(0.1)))
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.rotation = 0.012 if i == 0 else -0.018
		row.add_child(card)
		_pin(card, 0.5)
		var cv := VBoxContainer.new()
		cv.add_theme_constant_override("separation", 4)
		card.add_child(cv)
		var top := HBoxContainer.new()
		top.add_theme_constant_override("separation", 14)
		cv.add_child(top)
		top.add_child(_icon(str(hd.icon), 96))
		var tv := VBoxContainer.new()
		tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		top.add_child(tv)
		var nm := UiTheme.label(str(hd.name), 28, INK, 0)
		UiTheme.sign_text(nm, 30, INK, 0)
		tv.add_child(nm)
		var cnt := _ink("", 22, UiTheme.ENAMEL_RED.darkened(0.15), true)
		tv.add_child(cnt)
		var desc := _ink(str(hd.desc), 20, INK.lightened(0.15))
		cv.add_child(desc)
		var stat := _ink("", 20, INK.lightened(0.15))
		cv.add_child(stat)
		var b := _stamp_button(180.0)
		b.size_flags_horizontal = Control.SIZE_SHRINK_END
		cv.add_child(b)
		b.pressed.connect(func():
			if GameState.buy_helper(idx):
				Sound.play("hire", -3.0, 1.0 + 0.15 * idx, 0.05)
				message.emit("%s hired. It digs at the bottom of your shaft." % hd.name)
				bought.emit("helper")
			else:
				_fail_sound())
		_refreshers.append(func():
			var n := int(GameState.helper_counts[idx])
			cnt.text = "None on the crew yet" if n == 0 else "%d on the crew" % n
			stat.text = "Digs %s a second each%s" % [Fmt.num(float(hd.power)), "" if n == 0 else ", %s all together" % Fmt.num(GameState.helper_power(idx))]
			_set_buy(b, GameState.helper_cost(idx)))
		buttons[str(hd.key)] = b
	var note := UiTheme.label("They dig round the lift stop, even while you're up here shopping.", 21, UiTheme.CREAM, 5, false)
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_list.add_child(note)


# --- Finds: the cabinet of drawers ---------------------------------------------------------------------
func _build_finds() -> void:
	var count := 0
	for f in Balance.FINDS.size():
		if GameState.found[f]:
			count += 1
	_list.add_child(_wall_heading("Finds cabinet  ·  %d of %d" % [count, Balance.FINDS.size()]))
	var cab := PanelContainer.new()
	var cb := WoodBox.new()
	cb.kind = "cabinet"
	cb.seed = 31
	cb.content_margin_left = 14
	cb.content_margin_right = 14
	cb.content_margin_top = 14
	cb.content_margin_bottom = 16
	cab.add_theme_stylebox_override("panel", cb)
	cab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_child(cab)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	cab.add_child(grid)
	for f in Balance.FINDS.size():
		var d: Dictionary = Balance.FINDS[f]
		var got: bool = GameState.found[f]
		var drawer := PanelContainer.new()
		var db := WoodBox.new()
		db.kind = "drawer"
		db.seed = 200 + f
		db.color = Color(0.4, 0.27, 0.16) if got else Color(0.33, 0.22, 0.13)
		db.lit = got
		db.content_margin_left = 12
		db.content_margin_right = 12
		db.content_margin_top = 8
		db.content_margin_bottom = 28
		drawer.add_theme_stylebox_override("panel", db)
		drawer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		drawer.custom_minimum_size = Vector2(250, 150)
		grid.add_child(drawer)
		var dv := VBoxContainer.new()
		dv.alignment = BoxContainer.ALIGNMENT_CENTER
		dv.add_theme_constant_override("separation", 4)
		drawer.add_child(dv)
		var ic := _icon(str(d.icon) if got else "unknown", 54)
		ic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		if not got:
			ic.modulate = Color(0.5, 0.42, 0.34, 0.45)
		dv.add_child(ic)
		# The brass label holder and its card.
		var holder := PanelContainer.new()
		holder.add_theme_stylebox_override("panel", UiTheme.plate(UiTheme.BRASS, true, Vector4(9, 5, 9, 6)))
		holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		dv.add_child(holder)
		var card := PanelContainer.new()
		var cs := StyleBoxFlat.new()
		cs.bg_color = UiTheme.PAPER if got else UiTheme.PAPER.darkened(0.06)
		cs.content_margin_left = 6
		cs.content_margin_right = 6
		cs.content_margin_top = 1
		cs.content_margin_bottom = 2
		card.add_theme_stylebox_override("panel", cs)
		holder.add_child(card)
		var zone_name: String = DepthGauge.sentence(str(Balance.ZONES[int(d.zone)].name))
		var txt := str(d.name) if got else "Still buried: %s" % zone_name.to_lower()
		var nl := _ink(txt, 20, INK, got)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		card.add_child(nl)
		if got:
			var rl := _ink("%s, %s" % [str(Balance.rarity(f).name).to_lower(), Fmt.num(GameState.find_value(f))], 20, UiTheme.CREAM, false)
			rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			UiTheme.outlined(rl, 20, (Balance.rarity(f).color as Color).lightened(0.35), 4, true)
			dv.add_child(rl)


# --- Bonus: the enamel sign, free tickets, price tags, settings --------------------------------------
func _build_bonus() -> void:
	# The anchor offer: one enamel sign, sold only here.
	var sign := PanelContainer.new()
	sign.add_theme_stylebox_override("panel", UiTheme.enamel(UiTheme.ENAMEL_RED, Vector4(26, 14, 18, 14), 19, UiTheme.CREAM))
	sign.rotation = -0.01
	_list.add_child(sign)
	var sh := HBoxContainer.new()
	sh.add_theme_constant_override("separation", 18)
	sign.add_child(sh)
	sh.add_child(_icon("noads", 72))
	var sv := VBoxContainer.new()
	sv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sv.add_theme_constant_override("separation", 0)
	sh.add_child(sv)
	var st := UiTheme.label("No ads, and 2x digging", 32, UiTheme.CREAM, 0)
	UiTheme.sign_text(st, 32, UiTheme.CREAM, 0)
	sv.add_child(st)
	var ss := UiTheme.label("", 21, UiTheme.CREAM, 0, false)
	ss.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sv.add_child(ss)
	var rb := Button.new()
	rb.custom_minimum_size = Vector2(170, 60)
	rb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiTheme.style_button(rb, UiTheme.BRASS, 24)
	rb.pressed.connect(func(): Monetization.buy(Monetization.PRODUCT_REMOVE_ADS_2X))
	sh.add_child(rb)
	buttons[Monetization.PRODUCT_REMOVE_ADS_2X] = rb
	_refreshers.append(func():
		if Monetization.owns(Monetization.PRODUCT_REMOVE_ADS_2X):
			ss.text = "Yours, for good. Thank you."
			_set_owned(rb, "Yours")
		else:
			ss.text = "No more ad breaks, and every tool swings twice as fast. For good."
			rb.text = Monetization.price(Monetization.PRODUCT_REMOVE_ADS_2X)
			rb.icon = null
			rb.disabled = false)
	# Free tickets, pinned up.
	_list.add_child(_wall_heading("Free, for a short ad"))
	var trow := HBoxContainer.new()
	trow.add_theme_constant_override("separation", 14)
	_list.add_child(trow)
	for kind in ["boost", "cash", "helper_rush"]:
		var rw: Dictionary = Balance.AD_REWARDS[kind]
		var k: String = kind
		var card := PanelContainer.new()
		card.add_theme_stylebox_override("panel", UiTheme.paper(Vector4(16, 18, 16, 12), 120 + k.length(), false, UiTheme.MANILA.lightened(0.12)))
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		trow.add_child(card)
		_pin(card, 0.5)
		var cv := VBoxContainer.new()
		cv.add_theme_constant_override("separation", 4)
		card.add_child(cv)
		var hrow := HBoxContainer.new()
		hrow.add_theme_constant_override("separation", 8)
		cv.add_child(hrow)
		hrow.add_child(_icon(str(rw.icon), 44))
		var tl := _ink(str(rw.title), 21, INK, true)
		tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hrow.add_child(tl)
		var desc := _ink("", 20, INK.lightened(0.2))
		desc.custom_minimum_size = Vector2(0, 52)
		cv.add_child(desc)
		var b := Button.new()
		b.text = "Watch"
		b.custom_minimum_size = Vector2(0, 52)
		UiTheme.style_ticket(b, 21)
		b.pressed.connect(func(): _watch(k))
		cv.add_child(b)
		buttons["ad_" + k] = b
		_refreshers.append(func():
			var ok := AdOffers.eligible(k) or (k == "boost" and GameState.boost_can_stack())
			match k:
				"boost":
					desc.text = "Swing twice as fast. Stacks up to 15 minutes." + (" %s left now." % Fmt.duration(GameState.boost_seconds_left()) if GameState.is_boost_active() else "")
				"cash":
					desc.text = "+%s cash, right now." % Fmt.num(GameState.instant_cash_amount())
				"helper_rush":
					desc.text = "The crew digs three times as hard for 3 minutes." if GameState.has_helpers() else "Hire some crew first."
			if k == "helper_rush":
				ok = GameState.has_helpers()
			if k == "cash":
				ok = true
			b.disabled = not ok or Monetization.is_watching())
	# Price tags for the rest.
	_list.add_child(_wall_heading("For sale"))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 12)
	_list.add_child(grid)
	if not GameState.owns_starter:
		_product_tag(grid, Monetization.PRODUCT_STARTER, "gift", "%s cash and the crystal tools, which glow purple. Once only." % Fmt.num(GameState.starter_cash()))
	_product_tag(grid, Monetization.PRODUCT_GOLDEN, "golden", "Every tool in polished gold, and 10% more digging power.")
	for id in [Monetization.PRODUCT_CASH_SMALL, Monetization.PRODUCT_CASH_MEDIUM, Monetization.PRODUCT_CASH_LARGE]:
		var pk: String = Monetization.PRODUCTS[id].pack
		_product_tag(grid, id, {"small": "sack", "medium": "crate", "large": "cart"}[pk], "+%s cash" % Fmt.num(GameState.cash_pack_amount(pk)))
	# Tool finish (skins you own).
	if GameState.owns_golden or GameState.owns_starter:
		_list.add_child(_wall_heading("Tool finish"))
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
			UiTheme.style_button(b, UiTheme.BRASS if GameState.skin == sk else UiTheme.IRON_LIGHT, 21)
			b.pressed.connect(func():
				GameState.skin = sk
				GameState.changed.emit()
				show_tab("bonus"))
			h.add_child(b)
	# Settings: two small enamel plates.
	_list.add_child(_wall_heading("Settings"))
	var srow := HBoxContainer.new()
	srow.add_theme_constant_override("separation", 10)
	_list.add_child(srow)
	var mute := Button.new()
	mute.custom_minimum_size = Vector2(0, 52)
	mute.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	srow.add_child(mute)
	buttons["mute"] = mute
	var upd_mute := func():
		mute.text = "Sound off" if Sound.muted else "Sound on"
		mute.icon = UiTheme.icon("sound_off" if Sound.muted else "sound_on")
		UiTheme.style_button(mute, UiTheme.IRON_LIGHT, 21)
	upd_mute.call()
	mute.pressed.connect(func():
		Sound.set_muted(not Sound.muted)
		upd_mute.call())
	var restore := Button.new()
	restore.text = "Restore purchases"
	restore.custom_minimum_size = Vector2(0, 52)
	restore.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	UiTheme.style_button(restore, UiTheme.IRON_LIGHT, 21)
	restore.pressed.connect(func():
		Monetization.restore()
		message.emit("Purchases restored"))
	srow.add_child(restore)
	buttons["restore"] = restore
	if OS.has_feature("editor") or OS.has_feature("playtest"):
		_build_dev()


func _product_tag(into: Container, id: String, icon: String, desc: String) -> void:
	## A paper price tag on the wall: picture, name, what you get, the price stamped.
	var card := PanelContainer.new()
	var pb := UiTheme.paper(Vector4(30, 12, 16, 12), 140 + id.length() * 3, false, KRAFT.lightened(0.1))
	pb.hole = true
	card.add_theme_stylebox_override("panel", pb)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	into.add_child(card)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	card.add_child(h)
	h.add_child(_icon(icon, 56))
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 2)
	h.add_child(v)
	var tl := _ink(str(Monetization.PRODUCTS[id].title), 21, INK, true)
	v.add_child(tl)
	var dl := _ink(desc, 20, INK.lightened(0.2))
	v.add_child(dl)
	var b := _stamp_button(130.0)
	b.size_flags_horizontal = Control.SIZE_SHRINK_END
	v.add_child(b)
	b.pressed.connect(func(): Monetization.buy(id))
	buttons[id] = b
	_refreshers.append(func():
		if Monetization.owns(id):
			_set_owned(b, "Owned")
		else:
			b.text = Monetization.price(id)
			b.icon = null
			b.disabled = false)


func _watch(kind: String) -> void:
	Monetization.watch_for_reward(kind, func(ok: bool, text: String):
		if ok:
			Sound.play("reward", -3.0)
			message.emit(text)
		show_tab(tab))


func _build_dev() -> void:
	## Playtest builds only (the "playtest" feature tag, or the editor).
	_list.add_child(_wall_heading("Playtest tools (not in the store build)"))
	var row := func() -> HBoxContainer:
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 6)
		_list.add_child(h)
		return h
	var add := func(h: HBoxContainer, text: String, on: bool, cb: Callable):
		var b := Button.new()
		b.text = text
		b.custom_minimum_size = Vector2(0, 48)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		UiTheme.style_button(b, UiTheme.UMBER.lightened(0.15) if on else UiTheme.IRON_LIGHT, 20)
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
	var hint := UiTheme.label("Skip to a layer (1 = topsoil, 10 = inner core). Time %sx, income %sx. Ads and purchases here are fake." % [Fmt.num(Engine.time_scale), Fmt.num(GameState.income_mult)], 20, UiTheme.CREAM.darkened(0.15), 4, false)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_list.add_child(hint)
	var stats := UiTheme.label("Ads watched %d, interstitials %d, purchases %d, played %s" % [GameState.ads_watched, Monetization.interstitials_shown, GameState.purchases_made, Fmt.duration(GameState.play_time)], 20, UiTheme.CREAM.darkened(0.15), 4, false)
	stats.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_list.add_child(stats)
