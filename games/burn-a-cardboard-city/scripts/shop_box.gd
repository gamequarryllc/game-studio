class_name ShopBox
extends Control
## The shop is a cardboard box, seen from above and in front: it slides up, its
## flaps swing open, and you look down inside it at darker inner walls, a corrugated
## rim and a card divider with five tabs cut to different widths (tools, tricks,
## helpers, extras, finds). The next tool you can buy is propped up at the front; the
## rest are paper strips taped in. Settings are behind the little dial by the lid.
## Dev boosts (playtest builds only) aren't a tab: F1, or hold the box's stencilled
## name for a second.

signal closed

const TABS := [
	# key, icon, label, extra width (the tabs were cut by hand)
	["tools", "magnifier", "Tools", 52],
	["upgrades", "heat", "Tricks", 0],
	["helpers", "windup", "Helpers", 30],
	["extras", "tv", "Extras", 10],
	["finds", "duck", "Finds", 22],
]
const NOTES := {
	"tools": "Each one burns hotter. Thicker card needs a hotter tool.",
	"upgrades": "Little tricks of the trade.",
	"helpers": "Toys that like fire as much as you do.",
	"extras": "A hand for a while, for a short ad. Or for giants in a hurry.",
	"finds": "Things that were in the boxes.",
	"settings": "Knobs and dials.",
	"dev": "Playtest builds only. None of this is in the real game.",
}

var hud
var tab := "tools"
var _tab_buttons := {}
var _list: VBoxContainer
var _note: Label
var _coins: Label
var _refreshers: Array = []
var _t := 0.0
var _open := 0.0
var _scroll: ScrollContainer
var _content: Control
var _inside: BoxInside
var _card_seed := 100
var _title_hold := 0.0
var _title_down := false


class BoxInside:
	extends Control
	## The box: two flaps standing open above the opening, inner walls in perspective,
	## the back wall the cards sit on, a corrugated cut rim all round.
	var open := 0.0
	var opening := Rect2()        # the mouth of the box on screen
	var back := Rect2()           # the back wall

	func _flute_edge(a: Vector2, b: Vector2, depth: float, col: Color) -> void:
		## A cut edge of corrugated board: a band with the flutes showing.
		var n := (b - a).normalized().orthogonal() * depth
		draw_colored_polygon(PackedVector2Array([a, b, b + n, a + n]), col)
		var count := int(a.distance_to(b) / 7.0)
		var pts := PackedVector2Array()
		for k in count + 1:
			var p := a.lerp(b, float(k) / count) + n * (0.5 + 0.32 * (1.0 if k % 2 == 0 else -1.0))
			pts.append(p)
		draw_polyline(pts, col.darkened(0.25), 1.6, true)
		draw_line(a, b, col.darkened(0.35), 2.0, true)
		draw_line(a + n, b + n, col.darkened(0.35), 2.0, true)

	func _draw() -> void:
		var o := opening
		var bk := back
		var wall := Craft.KRAFT.darkened(0.3)
		var side_l := Craft.KRAFT.darkened(0.42)
		var side_r := Craft.KRAFT.darkened(0.36)
		var floor_c := Craft.KRAFT.darkened(0.5)
		# Flaps first (behind): standing up and splaying out from the top edge.
		var a := deg_to_rad(lerpf(180.0, 52.0, open))
		var h := minf(120.0, o.size.y * 0.28)
		for side in [-1.0, 1.0]:
			var x0 := o.position.x + 8.0 if side < 0 else o.position.x + o.size.x * 0.5 + 3.0
			var x1 := o.position.x + o.size.x * 0.5 - 3.0 if side < 0 else o.end.x - 8.0
			var ha := Vector2(x0, o.position.y)
			var hb := Vector2(x1, o.position.y)
			var out := Vector2(side * sin(a) * 64.0, -cos(a) * h)
			var lean := Vector2(side * sin(a) * 22.0, 0)
			var pts := PackedVector2Array([ha, hb, hb + out + lean * (0.3 if side < 0 else 1.0), ha + out + lean * (1.0 if side < 0 else 0.3)])
			var sh := PackedVector2Array()
			for p in pts:
				sh.append(p + Vector2(4, 6))
			draw_colored_polygon(sh, Color(0, 0, 0, 0.25))
			draw_colored_polygon(pts, Craft.KRAFT.darkened(0.12) if cos(a) > 0.0 else Craft.KRAFT)
			var cl := pts.duplicate()
			cl.append(pts[0])
			draw_polyline(cl, Craft.KRAFT_DARK.darkened(0.2), 2.5, true)
			_flute_edge(pts[3], pts[2], 5.0, Craft.KRAFT_PALE)
		# Inside: floor, side walls, back wall.
		draw_colored_polygon(PackedVector2Array([bk.position + Vector2(0, bk.size.y), bk.end, o.end, Vector2(o.position.x, o.end.y)]), floor_c)
		draw_colored_polygon(PackedVector2Array([o.position, bk.position, Vector2(bk.position.x, bk.end.y), Vector2(o.position.x, o.end.y)]), side_l)
		draw_colored_polygon(PackedVector2Array([Vector2(o.end.x, o.position.y), Vector2(bk.end.x, bk.position.y), bk.end, o.end]), side_r)
		draw_colored_polygon(PackedVector2Array([o.position, Vector2(o.end.x, o.position.y), Vector2(bk.end.x, bk.position.y), bk.position]), wall.darkened(0.15))
		draw_rect(bk, wall)
		# Corrugation lines on the inner walls, and the creases in the corners.
		var y := bk.position.y + 10.0
		while y < bk.end.y - 4.0:
			draw_line(Vector2(bk.position.x + 4, y), Vector2(bk.end.x - 4, y), Color(wall.darkened(0.08), 0.6), 1.0)
			y += 7.0
		for c in [[o.position, bk.position], [Vector2(o.end.x, o.position.y), Vector2(bk.end.x, bk.position.y)],
				[Vector2(o.position.x, o.end.y), Vector2(bk.position.x, bk.end.y)], [o.end, bk.end]]:
			draw_line(c[0], c[1], Color(0, 0, 0, 0.35), 2.0, true)
		draw_rect(bk, Color(0, 0, 0, 0.3), false, 2.0)
		# The rim: the cut top edges of the four walls.
		_flute_edge(o.position, Vector2(o.end.x, o.position.y), -9.0, Craft.KRAFT_PALE)
		_flute_edge(Vector2(o.position.x, o.end.y), o.end, 10.0, Craft.KRAFT)
		_flute_edge(o.position, Vector2(o.position.x, o.end.y), 9.0, Craft.KRAFT_PALE.darkened(0.06))
		_flute_edge(Vector2(o.end.x, o.end.y), Vector2(o.end.x, o.position.y), 9.0, Craft.KRAFT_PALE.darkened(0.06))
		# A strip of tape that held the flaps shut, torn and left hanging over the front.
		var tp := Vector2(o.position.x + o.size.x * 0.62, o.end.y - 4.0)
		draw_colored_polygon(PackedVector2Array([tp, tp + Vector2(46, 0), tp + Vector2(42, 34), tp + Vector2(4, 30)]), Color(Craft.TAPE, 0.85))


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.06, 0.07, 0.09, 0.6)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	_inside = BoxInside.new()
	_inside.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_inside.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_inside)
	_content = Control.new()
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_content)
	var v := VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.add_theme_constant_override("separation", 6)
	_content.add_child(v)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	v.add_child(head)
	var title := Craft.label(34, Craft.PAPER)
	title.text = "THE BOX"
	title.rotation = -0.025
	title.mouse_filter = Control.MOUSE_FILTER_STOP
	title.gui_input.connect(_on_title_input)
	head.add_child(title)
	head.add_child(Craft.icon_rect("coin", 38))
	_coins = Craft.label(34, Craft.PAPER, Craft.marker())
	head.add_child(_coins)
	var fill := Control.new()
	fill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(fill)
	var gear := Button.new()
	gear.icon = Craft.icon("gear")
	gear.expand_icon = true
	gear.custom_minimum_size = Vector2(54, 50)
	Craft.tag_button(gear, Craft.KRAFT_PALE, 20, 79)
	gear.tooltip_text = "Settings"
	gear.pressed.connect(func():
		Sound.play("tape", -10.0, 1.0, 0.1)
		select("settings"))
	head.add_child(gear)
	var close := Button.new()
	close.text = "Close"
	close.icon = Craft.icon("close")
	Craft.tag_button(close, Craft.PAPER, 22, 78)
	close.custom_minimum_size = Vector2(0, 50)
	close.pressed.connect(func(): closed.emit())
	head.add_child(close)
	# The divider: tabs of different widths standing up off a strip of card.
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 3)
	tabs.custom_minimum_size = Vector2(0, 52)
	v.add_child(tabs)
	for t in TABS:
		var b := Button.new()
		b.text = str(t[2]).to_upper()
		b.icon = Craft.icon(t[1])
		b.custom_minimum_size = Vector2(0, 46)
		b.size_flags_vertical = Control.SIZE_SHRINK_END
		var key: String = t[0]
		b.set_meta("extra", int(t[3]))
		b.pressed.connect(func():
			Sound.play("tape", -10.0, 1.0, 0.1)
			select(key))
		tabs.add_child(b)
		_tab_buttons[key] = b
	var strip := ColorRect.new()
	strip.color = Craft.KRAFT_PALE
	strip.custom_minimum_size = Vector2(0, 5)
	v.add_child(strip)
	_note = Craft.body(21, Color(Craft.PAPER, 0.88))
	v.add_child(_note)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 10)
	_scroll.add_child(_list)
	select(tab)
	_layout()


func _on_title_input(e: InputEvent) -> void:
	## Hold the box's name for a second to get the dev boosts (playtest builds only).
	if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		_title_down = e.pressed
		_title_hold = 0.0


func _layout() -> void:
	var vp := get_viewport_rect().size if is_inside_tree() else Vector2(1280, 720)
	var mx := clampf(vp.x * 0.035, 16.0, 60.0)
	var top := clampf(vp.y * 0.15, 70.0, 120.0)
	var u := clampf(_open * 1.6, 0.0, 1.0)
	var back_ease := 1.0 + 2.2 * pow(u - 1.0, 3.0) + 1.2 * pow(u - 1.0, 2.0)
	var slide := (1.0 - back_ease) * vp.y * 0.6
	var o := Rect2(mx, top + slide, vp.x - mx * 2.0, vp.y - top - 8.0)
	var inset := Vector2(clampf(vp.x * 0.035, 18.0, 48.0), clampf(vp.y * 0.03, 10.0, 26.0))
	var bk := Rect2(o.position + inset, o.size - Vector2(inset.x * 2.0, inset.y * 2.6))
	_inside.opening = o
	_inside.back = bk
	_content.position = bk.position + Vector2(16, 6)
	_content.size = bk.size - Vector2(32, 10)


func _process(delta: float) -> void:
	_open = minf(1.0, _open + delta * 2.6)
	var f := clampf((_open - 0.35) / 0.65, 0.0, 1.0)
	_inside.open = 1.0 - pow(1.0 - f, 3.0) + sin(f * PI) * 0.06
	_layout()
	_inside.queue_redraw()
	if _title_down:
		_title_hold += delta
		if _title_hold > 1.0 and GameState.dev_enabled() and tab != "dev":
			_title_down = false
			select("dev")
	_t += delta
	if _t >= 0.2:
		_t = 0.0
		refresh()


func select(key: String) -> void:
	if key == "dev" and not GameState.dev_enabled():
		key = "tools"
	tab = key
	var keys := _tab_buttons.keys()
	for k in _tab_buttons:
		var b: Button = _tab_buttons[k]
		var on: bool = k == key
		Craft.tag_button(b, Craft.PAPER if on else Craft.KRAFT_PALE, 18, 90 + keys.find(k))
		b.add_theme_constant_override("icon_max_width", 24)
		var extra: int = b.get_meta("extra")
		for st in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
			var sb := b.get_theme_stylebox(st) as CardStyle
			sb.content_margin_left = 10 + extra * 0.5
			sb.content_margin_right = 10 + extra * 0.5
			sb.content_margin_top = 12 if on else 8
			sb.shadow = Vector2(2, 0)
		b.custom_minimum_size = Vector2(0, 50 if on else 42)
		b.rotation = (-0.02 if on else 0.0) + (keys.find(k) % 3 - 1) * 0.006
	_note.text = NOTES.get(key, "")
	rebuild()


func rebuild() -> void:
	for c in _list.get_children():
		c.queue_free()
	_refreshers.clear()
	_card_seed = 100
	match tab:
		"tools":
			_build_tools()
		"upgrades":
			_build_upgrades()
		"helpers":
			_build_helpers()
		"extras":
			_build_extras()
		"finds":
			_build_finds()
		"settings":
			_build_settings()
		"dev":
			_build_dev()
	_scroll.scroll_vertical = 0
	refresh()


func refresh() -> void:
	_coins.text = Fmt.num(GameState.coins)
	for r in _refreshers:
		r.call()


# =====================================================================================
# Rows: paper strips taped into the box, each a little crooked and indented its own way
# =====================================================================================
func _card(icon: String, title: String, desc: String, big: bool = false) -> Dictionary:
	_card_seed += 1
	var wrap := MarginContainer.new()
	var jitter := (_card_seed * 37) % 23
	wrap.add_theme_constant_override("margin_left", 4 + jitter)
	wrap.add_theme_constant_override("margin_right", 26 - jitter)
	var p := PanelContainer.new()
	var s := Craft.paper(_card_seed, 1 if _card_seed % 3 == 0 else (3 if _card_seed % 3 == 1 else 0))
	s.content_margin_left = 16 if not big else 22
	s.content_margin_right = 14
	s.content_margin_top = 10 if not big else 16
	s.content_margin_bottom = 8 if not big else 14
	if big:
		s.fill = Color("#fbf4e2")
	p.add_theme_stylebox_override("panel", s)
	p.rotation = ((_card_seed * 13) % 7 - 3) * 0.002
	wrap.add_child(p)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 14)
	p.add_child(h)
	var ic := Craft.icon_rect(icon, 84 if big else 54)
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(ic)
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 0)
	h.add_child(v)
	var tl := Craft.label(30 if big else 22)
	tl.text = title
	v.add_child(tl)
	var dl := Craft.body(22 if big else 19, Color(Craft.INK, 0.85))
	dl.text = desc
	dl.custom_minimum_size = Vector2(200, 0)
	v.add_child(dl)
	var xl := Craft.body(19, Craft.FLAME_DEEP)
	xl.custom_minimum_size = Vector2(200, 0)
	xl.visible = false
	v.add_child(xl)
	var b := Button.new()
	b.custom_minimum_size = Vector2(170 if big else 140, 64 if big else 54)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	Craft.price_button(b, _card_seed + 300)
	if big:
		b.add_theme_font_size_override("font_size", 30)
	h.add_child(b)
	_list.add_child(wrap)
	return {"panel": p, "title": tl, "desc": dl, "extra": xl, "button": b, "icon": ic}


func _set_btn(card: Dictionary, text: String, enabled: bool, hot: bool = false, icon: String = "") -> void:
	var b: Button = card.button
	if b.text != text:
		b.text = text
		b.add_theme_font_override("font", Craft.number_font(text))
	var tex: Texture2D = Craft.icon(icon) if icon != "" else null
	if b.icon != tex:
		b.icon = tex
	b.disabled = not enabled
	Craft.hot(b, hot and enabled)


func _extra(card: Dictionary, text: String) -> void:
	var l: Label = card.extra
	l.visible = text != ""
	if l.text != text:
		l.text = text


func _section(text: String) -> void:
	var l := Craft.label(22, Craft.PAPER)
	l.text = text.to_upper()
	l.rotation = -0.015
	_list.add_child(l)


func _buy_feedback(ok: bool, what: String) -> void:
	if ok:
		Sound.play("buy", -3.0)
		hud.toast(what)
	else:
		Sound.play("nope", -6.0)
	refresh()


func _tool_row(i: int, big: bool) -> void:
	var t: Dictionary = Balance.TOOLS[i]
	var title := ("Next: the %s" % str(t.name).to_lower()) if big else str(t.name)
	var card := _card(str(t.key), title, str(t.desc), big)
	var idx := i
	card.button.pressed.connect(func():
		_buy_feedback(GameState.buy_tool(idx), "%s in hand" % t.name))
	_refreshers.append(func():
		_extra(card, "Lights %s" % t.lights)
		if idx == GameState.tool_index:
			_set_btn(card, "In hand", false, false, "check")
		elif idx < GameState.tool_index:
			_set_btn(card, "Owned", false, false, "check")
		elif idx == GameState.next_tool_index():
			var cost := GameState.tool_cost(idx)
			var gate := GameState.tool_gate_text(idx)
			if GameState.on_clearance(idx):
				_extra(card, "Clearance: the last one in the box, yours for what you've got")
			if gate != "":
				_set_btn(card, Fmt.num(cost), false, false, "lock")
				_extra(card, gate)
			else:
				var can := GameState.coins >= cost
				_set_btn(card, Fmt.num(cost), can, can, "coin")
		else:
			_set_btn(card, Fmt.num(float(t.cost)), false, false, "lock")
			_extra(card, "Buy the %s first" % str(Balance.TOOLS[idx - 1].name).to_lower()))


func _build_tools() -> void:
	var nt := GameState.next_tool_index()
	if nt >= 0:
		_tool_row(nt, true)
	for i in Balance.TOOLS.size():
		if i != nt:
			_tool_row(i, false)
	if GameState.short_for_next_tool() and GameState.tool_gate_text(nt) == "":
		_section("Short of coins?")
		_packs()


func _packs() -> void:
	var icons := ["sock_coins", "jar", "shoebox"]
	for k in Monetization.PACK_PRODUCTS.size():
		var id: String = Monetization.PACK_PRODUCTS[k]
		var p: Dictionary = Monetization.PRODUCTS[id]
		var card := _card(icons[k], str(p.title), "")
		var pack := k
		card.button.pressed.connect(func(): Monetization.buy(id))
		_refreshers.append(func():
			var amount := GameState.coin_pack_amount(pack)
			card.desc.text = "+%s coins, right now." % Fmt.num(amount)
			var nt := GameState.next_tool_index()
			if nt >= 0 and GameState.coins + amount >= GameState.tool_cost(nt):
				_extra(card, "Enough for the %s" % str(Balance.TOOLS[nt].name).to_lower())
			else:
				_extra(card, "")
			_set_btn(card, Monetization.price(id), true))


func _build_upgrades() -> void:
	for u in Balance.UPGRADES:
		var card := _card(str(u.key), str(u.name), str(u.desc))
		var key: String = u.key
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_upgrade(key), "%s, level %d" % [u.name, int(GameState.upgrade_levels[key])]))
		_refreshers.append(func():
			var lv := int(GameState.upgrade_levels[key])
			card.title.text = "%s  %d/%d" % [u.name, lv, int(u.max)]
			if GameState.upgrade_maxed(key):
				_set_btn(card, "Full", false, false, "check")
			else:
				var cost := GameState.upgrade_cost(key)
				var can := GameState.coins >= cost
				_set_btn(card, Fmt.num(cost), can, can, "coin"))


func _build_helpers() -> void:
	for i in Balance.HELPERS.size():
		var h: Dictionary = Balance.HELPERS[i]
		var card := _card(str(h.key), str(h.name), str(h.desc))
		var idx := i
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_helper(idx), "Another %s" % str(h.name).to_lower()))
		_refreshers.append(func():
			var n := int(GameState.helper_counts[idx])
			card.title.text = "%s  x%d" % [h.name, n] if n > 0 else str(h.name)
			var cost := GameState.helper_cost(idx)
			var can := GameState.coins >= cost
			_set_btn(card, Fmt.num(cost), can, can, "coin"))


func _build_extras() -> void:
	_section("Free, for a short ad")
	var boost := _card("flame", "2x fire for 5 minutes", "Everything burns twice as hot and pays twice the coins. Watch again to stack it, up to 15 minutes.")
	boost.button.pressed.connect(func(): hud.watch_ad("boost"))
	_refreshers.append(func():
		var left := GameState.boost_seconds_left()
		_extra(boost, "Running: %s left" % Fmt.duration(left) if left > 0.0 else "")
		if GameState.boost_full():
			_set_btn(boost, "Full", false)
		else:
			_set_btn(boost, "Watch", not Monetization.is_watching(), hud.offers.current == "boost", "tv"))
	var rush := _card("windup", "Helpers 3x for 3 minutes", "Your wind-up cars and paper planes burn three times as hot, and hurry.")
	rush.button.pressed.connect(func(): hud.watch_ad("helper_rush"))
	_refreshers.append(func():
		if not GameState.has_helpers():
			_set_btn(rush, "No helpers", false)
			_extra(rush, "Get a wind-up car first")
		elif GameState.is_helper_rush_active():
			_set_btn(rush, Fmt.duration(GameState.helper_rush_seconds_left()), false)
			_extra(rush, "")
		else:
			_set_btn(rush, "Watch", not Monetization.is_watching(), hud.offers.current == "helper_rush", "tv")
			_extra(rush, ""))
	var instant := _card("coin", "Free coins", "")
	instant.button.pressed.connect(func(): hud.watch_ad("instant"))
	_refreshers.append(func():
		instant.desc.text = "+%s coins now, about three minutes of burning." % Fmt.num(GameState.instant_amount())
		var tool := AdOffers.unlocks_tool()
		_extra(instant, "Enough for the %s" % tool.to_lower() if tool != "" else "")
		if not GameState.instant_ready():
			_set_btn(instant, Fmt.duration(GameState.instant_ready_at - GameState.now()), false)
		else:
			_set_btn(instant, "Watch", not Monetization.is_watching(), hud.offers.current == "instant", "tv"))
	_section("For giants in a hurry")
	var ra := Monetization.PRODUCT_REMOVE_ADS_2X
	var card := _card("noads", "No ads, and 2x for good", "No more ads between breaks, and everything burns twice as hot and pays twice the coins, forever.")
	card.button.pressed.connect(func(): Monetization.buy(ra))
	_refreshers.append(func():
		if Monetization.owns(ra):
			_set_btn(card, "Yours", false, false, "check")
		else:
			_set_btn(card, Monetization.price(ra), true, true))
	var sp := Monetization.PRODUCT_STARTER
	var starter := _card("gift", "A box of matches", "The starter pack: +%s coins and party sparks (every tool throws sparks in every colour of the felt-tip set). One time only." % Fmt.num(Balance.STARTER_COINS))
	starter.button.pressed.connect(func(): Monetization.buy(sp))
	_refreshers.append(func():
		_set_btn(starter, "Yours" if Monetization.owns(sp) else Monetization.price(sp), not Monetization.owns(sp), false, "check" if Monetization.owns(sp) else ""))
	var gl := Monetization.PRODUCT_GOLDEN
	var golden := _card("lens", "The golden lens", "A magnifying glass that belonged to someone important. Every tool burns with gold fire, 10% hotter.")
	golden.button.pressed.connect(func():
		if Monetization.owns(gl):
			GameState.golden_on = not GameState.golden_on
			refresh()
		else:
			Monetization.buy(gl))
	_refreshers.append(func():
		if Monetization.owns(gl):
			_set_btn(golden, "On" if GameState.golden_on else "Off", true)
		else:
			_set_btn(golden, Monetization.price(gl), true))
	if GameState.owns_starter:
		var party := _card("gift", "Party sparks", "Sparks in every colour.")
		party.button.pressed.connect(func():
			GameState.party_on = not GameState.party_on
			refresh())
		_refreshers.append(func(): _set_btn(party, "On" if GameState.party_on else "Off", true))
	_packs()
	var restore := _card("restore", "Restore purchases", "Bought something on another device? Get it back here.")
	restore.button.pressed.connect(func():
		Monetization.restore()
		hud.toast("Asked the store for your purchases"))
	_set_btn(restore, "Restore", true)


func _build_finds() -> void:
	var all: Array = Balance.FINDS.duplicate()
	all.append({"key": "ticket", "name": "A golden ticket"})
	for f in all:
		var key: String = f.key
		var n := int(GameState.finds.get(key, 0))
		var card := _card(key, str(f.name) if n > 0 else "Not found yet", "Found %d" % n if n > 0 else "Keep burning. Finds pop out of buildings as they fall.")
		card.button.visible = false
		if n == 0:
			(card.icon as TextureRect).modulate = Color(0.2, 0.18, 0.16, 0.35)


func _build_settings() -> void:
	var vol := _card("speaker", "Sound", "Crackling, crumpling, coins.")
	var h: HBoxContainer = vol.button.get_parent()
	var minus := Button.new()
	minus.text = "-"
	minus.custom_minimum_size = Vector2(64, 54)
	minus.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	Craft.tag_button(minus, Craft.PAPER, 30, 201, Craft.marker())
	h.add_child(minus)
	h.move_child(minus, vol.button.get_index())
	vol.button.custom_minimum_size = Vector2(64, 54)
	minus.pressed.connect(func():
		Sound.set_volume(Sound.volume - 0.1)
		refresh())
	vol.button.pressed.connect(func():
		Sound.set_volume(Sound.volume + 0.1)
		Sound.play("coin", -8.0)
		refresh())
	_refreshers.append(func():
		vol.title.text = "Sound  %d%%" % int(round(Sound.volume * 100.0))
		_set_btn(vol, "+", Sound.volume < 1.0)
		minus.disabled = Sound.volume <= 0.0)
	var mute := _card("mute", "Mute everything", "")
	mute.button.pressed.connect(func():
		Sound.set_muted(not Sound.muted)
		refresh())
	_refreshers.append(func(): _set_btn(mute, "Unmute" if Sound.muted else "Mute", true))
	if GameState.dev_enabled():
		var dev := _card("gear", "Playtest tools", "Time scale, income, skip ahead. Not in the real game.")
		dev.button.pressed.connect(func(): select("dev"))
		_set_btn(dev, "Open", true)


func _build_dev() -> void:
	## Dev boosts for playtesting (the `playtest` feature tag only).
	var speed := _card("fan", "Time scale", "Everything runs faster (Engine.time_scale).")
	speed.button.pressed.connect(func():
		var steps := [1.0, 5.0, 10.0, 50.0]
		var k := steps.find(Engine.time_scale)
		Engine.time_scale = steps[(k + 1) % steps.size()]
		refresh())
	_refreshers.append(func(): _set_btn(speed, "%dx" % int(Engine.time_scale), true))
	var income := _card("coins", "Income", "Multiplies every coin the fire pays.")
	income.button.pressed.connect(func():
		GameState.dev_income = 1.0 if GameState.dev_income >= 100.0 else GameState.dev_income * 10.0
		refresh())
	_refreshers.append(func(): _set_btn(income, "x%d" % int(GameState.dev_income), true))
	var cash := _card("coin", "Give coins", "Adds ten times what you have (at least 1K).")
	cash.button.pressed.connect(func():
		GameState.grant_coins(maxf(1000.0, GameState.coins * 10.0))
		refresh())
	_set_btn(cash, "Add", true)
	var unlock := _card("lock", "Unlock everything", "Every tool, upgrades to 5, three of each helper, every district open.")
	unlock.button.pressed.connect(func():
		GameState.dev_unlock_everything()
		refresh())
	_set_btn(unlock, "Unlock", true)
	for z in [1, 2, 3]:
		var zone: int = z
		var skip := _card(["house", "office", "skyscraper", "castle"][z], "Skip to %s" % str(Balance.ZONES[z].short).to_lower(),
			"Everything outside it has burned. You get the tool it needs.")
		skip.button.pressed.connect(func():
			hud.world.skip_to_district(zone)
			closed.emit())
		_set_btn(skip, "Go", true)
	var burn := _card("flame", "Burn this district", "Everything in the district you're standing in catches at once.")
	burn.button.pressed.connect(func():
		var g: Node3D = hud.giant
		var c: CityGrid = hud.city
		var cell := c.cell_at(g.position.x, g.position.z)
		var z := Balance.zone_for_cell(cell % c.n, cell / c.n) if cell >= 0 else 0
		c.burn_zone(z)
		closed.emit())
	_set_btn(burn, "Burn", true)
	var ads := _card("tv", "Fake ads and purchases", "")
	_refreshers.append(func():
		var cnt = Monetization.provider.get("counts")
		var c: Dictionary = cnt if cnt != null else {}
		ads.desc.text = "Rewarded %d, interstitial %d, purchases %d" % [int(c.get("rewarded", 0)), int(c.get("interstitial", 0)), int(c.get("purchases", 0))]
		ads.button.visible = false)
	var wipe := _card("restore", "Start over", "A fresh city. Keeps purchases.")
	wipe.button.pressed.connect(func():
		Engine.time_scale = 1.0
		GameState.wipe_save()
		get_tree().reload_current_scene())
	_set_btn(wipe, "Reset", true)
