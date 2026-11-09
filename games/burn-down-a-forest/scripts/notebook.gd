class_name Notebook
extends Control
## The shop: the fire-keeper's field notebook, opened full screen from the HUD.
## A leather cover, two cream pages with grain and ruled lines and a stitched
## spine, coloured index tabs down the edge, a red ribbon to close it. The left
## page is the contents (embers, the chapter, a note in the keeper's hand); the
## right page lists the chapter's entries, each with a sketch, a price on a
## taped tag and an ink stamp to buy it.

signal closed

const TABS := [
	["tools", "matchstick", "Tools", Color("#D98A4E")],
	["upgrades", "bellows", "Upgrades", Color("#C9A253")],
	["helpers", "sprite", "Helpers", Color("#8FAE5E")],
	["magic", "magic_lantern", "Free magic", Color("#7FA7B5")],
	["shop", "parcel", "Shop", Color("#D9483B")],
	["settings", "dial", "Settings", Color("#A89C8E")],
]
const NOTES := {
	"tools": "Each one burns hotter. Hotter fire lights tougher trees.",
	"upgrades": "Little tricks of the trade.",
	"helpers": "Friends who like fire as much as I do.",
	"magic": "A short ad, and the old magic helps out for a while.",
	"shop": "For keepers in a hurry. Everything can be earned by burning, too.",
	"settings": "Knobs and dials.",
}
const PACK_ICONS := ["pouch", "jar", "cauldron"]

var hud                               # the Hud (untyped: it calls back into it)
var tab := "tools"
var _tab_buttons := {}
var _list: VBoxContainer
var _heading: Label
var _note: Label
var _embers: Label
var _progress: Label
var _sketch: TextureRect
var _sketch_note: Label
var _refreshers: Array = []
var _cards: Array = []
var _t := 0.0
var _scroll: ScrollContainer
var _book: Control
var _spine: Control
var _map: RingMap
var _seed := 0


class Cover:
	## The leather cover behind the pages, with a stitched border.
	extends Control

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		var rng := RandomNumberGenerator.new()
		rng.seed = 5
		var pts := PackedVector2Array()
		var corners := [r.position, Vector2(r.end.x, 0), r.end, Vector2(0, r.end.y)]
		for c in 4:
			var a: Vector2 = corners[c]
			var b: Vector2 = corners[(c + 1) % 4]
			for k in 8:
				pts.append(a.lerp(b, k / 8.0) + Vector2(rng.randf_range(-1.5, 1.5), rng.randf_range(-1.5, 1.5)))
		var sh := PackedVector2Array()
		for p in pts:
			sh.append(p + Vector2(6, 8))
		draw_colored_polygon(sh, Color(UiTheme.CHAR, 0.9))
		draw_colored_polygon(pts, UiTheme.LEATHER)
		draw_texture_rect(UiTheme.grain(), r, true, Color(0.25, 0.15, 0.1, 0.35))
		var inset := r.grow(-9.0)
		var stitch := Color("#B08A5A")
		UiTheme.dashed(get_canvas_item(), inset.position, Vector2(inset.end.x, inset.position.y), stitch, 2.0, 7.0, 6.0)
		UiTheme.dashed(get_canvas_item(), Vector2(inset.position.x, inset.end.y), inset.end, stitch, 2.0, 7.0, 6.0)
		UiTheme.dashed(get_canvas_item(), inset.position, Vector2(inset.position.x, inset.end.y), stitch, 2.0, 7.0, 6.0)
		UiTheme.dashed(get_canvas_item(), Vector2(inset.end.x, inset.position.y), inset.end, stitch, 2.0, 7.0, 6.0)


class Spine:
	## The gutter between the pages: shadow and the binding stitches.
	extends Control

	func _draw() -> void:
		var w := size.x
		var h := size.y
		draw_rect(Rect2(Vector2.ZERO, size), Color(UiTheme.SCORCH, 0.35))
		var cols := PackedColorArray([Color(UiTheme.INK, 0.0), Color(UiTheme.INK, 0.55), Color(UiTheme.INK, 0.55), Color(UiTheme.INK, 0.0)])
		draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(w * 0.5, 0), Vector2(w * 0.5, h), Vector2(0, h)]),
			PackedColorArray([cols[0], cols[1], cols[2], cols[3]]))
		draw_polygon(PackedVector2Array([Vector2(w * 0.5, 0), Vector2(w, 0), Vector2(w, h), Vector2(w * 0.5, h)]),
			PackedColorArray([cols[1], cols[0], cols[3], cols[2]]))
		var y := 24.0
		while y < h - 20.0:
			draw_line(Vector2(w * 0.5, y), Vector2(w * 0.5, y + 10.0), Color("#C9A87A"), 2.0, true)
			y += 46.0


class RingMap:
	## A doodle of the forest's rings in the margin: burned share hatched, an x where I am.
	extends Control
	var progress := 0.0
	var zone := 0

	func _draw() -> void:
		var c := Vector2(size.x * 0.5, size.y * 0.5)
		var r := minf(size.x, size.y) * 0.47
		var rng := RandomNumberGenerator.new()
		rng.seed = 21
		var radii := [1.0, 0.72, 0.47, 0.24]
		for k in radii.size():
			var pts := PackedVector2Array()
			for a in 33:
				var ang := TAU * a / 32.0
				var rr: float = r * float(radii[k]) * (1.0 + rng.randf_range(-0.035, 0.035))
				pts.append(c + Vector2(cos(ang), sin(ang) * 0.82) * rr)
			pts[32] = pts[0]
			draw_polyline(pts, Color(UiTheme.HAND_INK, 0.75), 1.6, true)
		# hatch the outer ring part-way round: how much has burned
		var sweep := TAU * clampf(progress, 0.0, 1.0)
		var n := int(sweep / 0.12)
		for k in n:
			var ang := -PI * 0.5 + k * 0.12
			var a0 := c + Vector2(cos(ang), sin(ang) * 0.82) * r * 0.74
			var a1 := c + Vector2(cos(ang + 0.05), sin(ang + 0.05) * 0.82) * r * 0.98
			draw_line(a0, a1, Color(UiTheme.SCORCH, 0.8), 1.3, true)
		# the Elder Tree at the heart, and where I am
		draw_circle(c, 4.0, Color(UiTheme.HAND_INK, 0.85))
		var zr: float = r * [0.86, 0.6, 0.36, 0.12][clampi(zone, 0, 3)]
		var me := c + Vector2(0, zr * 0.82)
		draw_line(me + Vector2(-6, -6), me + Vector2(6, 6), UiTheme.POPPY, 2.6, true)
		draw_line(me + Vector2(6, -6), me + Vector2(-6, 6), UiTheme.POPPY, 2.6, true)


class Rule:
	## A hand-drawn dashed rule between entries.
	extends Control
	var seed := 1

	func _draw() -> void:
		var rng := RandomNumberGenerator.new()
		rng.seed = seed
		var x := 4.0
		while x < size.x - 8.0:
			var l := rng.randf_range(10.0, 22.0)
			var y := size.y * 0.5 + rng.randf_range(-0.8, 0.8)
			draw_line(Vector2(x, y), Vector2(minf(x + l, size.x - 4.0), y + rng.randf_range(-0.6, 0.6)), Color(UiTheme.INK, 0.28), 1.4, true)
			x += l + rng.randf_range(5.0, 9.0)


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(UiTheme.CHAR, 0.66)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	_book = Control.new()
	_book.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_book.offset_left = 26
	_book.offset_right = -146
	_book.offset_top = 22
	_book.offset_bottom = -16
	_book.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_book)
	var cover := Cover.new()
	cover.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cover.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_book.add_child(cover)
	var tabs := VBoxContainer.new()
	tabs.anchor_left = 1.0
	tabs.anchor_right = 1.0
	tabs.offset_left = -16
	tabs.offset_right = 142
	tabs.offset_top = 64
	tabs.add_theme_constant_override("separation", 4)
	_book.add_child(tabs)
	var spread := HBoxContainer.new()
	spread.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	spread.offset_left = 14
	spread.offset_right = -14
	spread.offset_top = 12
	spread.offset_bottom = -12
	spread.add_theme_constant_override("separation", 0)
	_book.add_child(spread)
	spread.add_child(_left_page())
	var spine := Spine.new()
	spine.custom_minimum_size = Vector2(26, 0)
	spine.mouse_filter = Control.MOUSE_FILTER_IGNORE
	spread.add_child(spine)
	_spine = spine
	spread.add_child(_right_page())
	for k in TABS.size():
		var t: Array = TABS[k]
		var b := UiParts.Tab.new(t[3], t[2], t[1], 300 + k)
		var key: String = t[0]
		b.pressed.connect(func():
			Sound.play("page", -6.0, 1.0, 0.08)
			select(key))
		tabs.add_child(b)
		_tab_buttons[key] = b
	# The ribbon bookmark hangs from the top of the spine, over both pages.
	var ribbon := UiParts.Ribbon.new()
	ribbon.size = Vector2(64, 132)
	ribbon.pressed.connect(func(): closed.emit())
	_book.add_child(ribbon)
	var place_ribbon := func():
		ribbon.position = Vector2(spine.position.x + spread.position.x - 19.0, -12.0)
	spine.resized.connect(place_ribbon)
	spine.item_rect_changed.connect(place_ribbon)
	place_ribbon.call_deferred()
	select(tab)
	# opening: the book lifts up a little and settles (eased)
	_book.pivot_offset = Vector2(560, 360)
	_book.scale = Vector2(0.97, 0.97)
	_book.modulate.a = 0.0
	var tw := _book.create_tween()
	tw.set_parallel(true)
	tw.tween_property(_book, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_book, "modulate:a", 1.0, 0.15)


func _page(seed: int, ruled: float, margin: float) -> PanelContainer:
	var p := PanelContainer.new()
	var s := UiTheme.PaperBox.new(seed, 26.0)
	s.ruled = ruled
	s.margin_line = margin
	s.shadow = Vector2.ZERO
	s.scorch = 0.9
	s.tear = 1.2
	p.add_theme_stylebox_override("panel", s)
	return p


func _left_page() -> Control:
	var page := _page(211, 0.0, -1.0)
	page.custom_minimum_size = Vector2(330, 0)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	page.add_child(v)
	var title := UiTheme.label(UiTheme.T_TITLE, UiTheme.INK, UiTheme.display())
	title.text = "The fire-keeper's notebook"
	v.add_child(title)
	var eh := HBoxContainer.new()
	eh.add_theme_constant_override("separation", 8)
	v.add_child(eh)
	var coal := TextureRect.new()
	coal.texture = UiTheme.icon("coal")
	coal.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	coal.custom_minimum_size = Vector2(44, 44)
	eh.add_child(coal)
	_embers = UiTheme.label(UiTheme.T_BIG + 4, UiTheme.INK, UiTheme.display())
	eh.add_child(_embers)
	var rule := Rule.new()
	rule.custom_minimum_size = Vector2(0, 14)
	rule.seed = 3
	v.add_child(rule)
	_heading = UiTheme.label(UiTheme.T_HUGE, UiTheme.INK, UiTheme.display())
	v.add_child(_heading)
	_note = UiTheme.label(27, UiTheme.HAND_INK, UiTheme.hand())
	_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_note.custom_minimum_size = Vector2(270, 0)
	v.add_child(_note)
	_map = RingMap.new()
	_map.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_map.custom_minimum_size = Vector2(0, 90)
	_map.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(_map)
	var sk := HBoxContainer.new()
	sk.add_theme_constant_override("separation", 6)
	v.add_child(sk)
	_sketch = TextureRect.new()
	_sketch.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_sketch.custom_minimum_size = Vector2(96, 96)
	_sketch.pivot_offset = Vector2(48, 48)
	_sketch.rotation = -0.12
	sk.add_child(_sketch)
	_sketch_note = UiTheme.label(25, UiTheme.HAND_INK, UiTheme.hand())
	_sketch_note.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sk.add_child(_sketch_note)
	_progress = UiTheme.label(24, UiTheme.HAND_INK, UiTheme.hand())
	_progress.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_progress.custom_minimum_size = Vector2(270, 0)
	v.add_child(_progress)
	return page


func _right_page() -> Control:
	var page := _page(212, 31.0, 40.0)
	page.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page.clip_contents = true
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(_scroll)
	var m := MarginContainer.new()
	m.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.add_theme_constant_override("margin_left", 22)
	m.add_theme_constant_override("margin_right", 46)
	m.add_theme_constant_override("margin_top", 4)
	_scroll.add_child(m)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 2)
	m.add_child(_list)
	return page


func select(key: String) -> void:
	tab = key
	for k in _tab_buttons:
		var b: UiParts.Tab = _tab_buttons[k]
		b.active = k == key
		b.queue_redraw()
	for t in TABS:
		if t[0] == key:
			_heading.text = str(t[2])
	_note.text = NOTES[key]
	rebuild()


func rebuild() -> void:
	for c in _list.get_children():
		c.queue_free()
	_refreshers.clear()
	_cards.clear()
	_seed = 0
	match tab:
		"tools":
			_build_tools()
		"upgrades":
			_build_upgrades()
		"helpers":
			_build_helpers()
		"magic":
			_build_magic()
		"shop":
			_build_shop()
		"settings":
			_build_settings()
	_scroll.scroll_vertical = 0
	refresh()


func _process(delta: float) -> void:
	_t += delta
	if _t >= 0.2:
		_t = 0.0
		refresh()


func refresh() -> void:
	_embers.text = Fmt.num(GameState.embers)
	var f := GameState.forest
	if f != null:
		var z := f.zone_at(GameState.keeper.position.x, GameState.keeper.position.z) if GameState.keeper != null else 0
		_progress.text = "%d%% of the cursed forest burned. I'm in %s." % [int(f.progress() * 100.0), str(Balance.ZONES[z].name).to_lower()]
		_map.progress = f.progress()
		_map.zone = z
		_map.queue_redraw()
	_left_page_sketch()
	for r in _refreshers:
		r.call()


func _left_page_sketch() -> void:
	## Each chapter gets its own doodle on the left page, with a note about it.
	var td := GameState.tool_def()
	var icon_name := str(td.icon)
	var note := "in hand:\nthe %s" % str(td.name).to_lower()
	match tab:
		"upgrades":
			icon_name = "bellows"
			var bits: Array = []
			for u in Balance.UPGRADES:
				var lv := int(GameState.upgrade_levels[u.key])
				if lv > 0:
					bits.append("%s %d" % [str(u.name).to_lower().split(" ")[0], lv])
			note = "so far:\n" + (", ".join(bits) if not bits.is_empty() else "nothing yet")
		"helpers":
			icon_name = "salamander" if int(GameState.helper_counts[1]) > 0 else "sprite"
			var n0 := int(GameState.helper_counts[0])
			var n1 := int(GameState.helper_counts[1])
			note = "%d sprite%s,\n%d salamander%s" % [n0, "" if n0 == 1 else "s", n1, "" if n1 == 1 else "s"] if n0 + n1 > 0 else "no helpers yet.\nlonely work"
		"magic":
			icon_name = "magic_lantern"
			note = "2x fire, %s left" % Fmt.duration(GameState.boost_seconds_left()) if GameState.is_boost_active() else "nothing\nrunning now"
		"shop":
			icon_name = "parcel"
			note = "nothing here you\ncan't burn for"
		"settings":
			icon_name = "dial"
			note = "sound at %d%%" % int(round(Sound.volume * 100.0)) if not Sound.muted else "all quiet"
	var big := tab != "tools"
	_map.visible = not big
	_sketch.custom_minimum_size = Vector2(150, 150) if big else Vector2(96, 96)
	_sketch.pivot_offset = _sketch.custom_minimum_size * 0.5
	_sketch.rotation = -0.12 if not big else 0.07
	_sketch.texture = UiTheme.icon(icon_name)
	_sketch_note.text = note


# =====================================================================================
# Entries
# =====================================================================================
func _card(icon_name: String, title: String, desc: String, kind: String = "tag") -> Dictionary:
	## One entry: a sketch (with room for a note in the margin), the name and a
	## line about it, and the price tag you tap to buy it (settings use stamps).
	_seed += 1
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.custom_minimum_size = Vector2(0, 108)
	var ic := UiParts.Sketch.new()
	ic.texture = UiTheme.icon(icon_name)
	ic.custom_minimum_size = Vector2(76, 76)
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ic.tilt = [-0.08, 0.05, -0.03, 0.09, -0.06][_seed % 5]
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(ic)
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	v.add_theme_constant_override("separation", 0)
	row.add_child(v)
	var tl := UiTheme.label(UiTheme.T_TITLE - 2, UiTheme.INK, UiTheme.display())
	tl.text = title
	tl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART   # long names wrap: the page never widens
	tl.custom_minimum_size = Vector2(160, 0)
	v.add_child(tl)
	var dl := UiTheme.rich(UiTheme.T_BODY - 1, Color(UiTheme.INK, 0.86), UiTheme.body())
	dl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dl.custom_minimum_size = Vector2(180, 0)
	dl.text = desc
	v.add_child(dl)
	var xl := UiTheme.rich(23, UiTheme.HAND_INK, UiTheme.hand())
	xl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	xl.custom_minimum_size = Vector2(180, 0)
	xl.visible = false
	v.add_child(xl)
	var side := VBoxContainer.new()
	side.custom_minimum_size = Vector2(150, 0)
	side.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	side.add_theme_constant_override("separation", 4)
	side.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(side)
	var b: Button
	if kind == "stamp":
		var st := UiParts.Stamp.new(700 + _seed * 7)
		st.custom_minimum_size = Vector2(134, 56)
		b = st
	else:
		var pt := UiParts.PriceTag.new(500 + _seed * 7)
		pt.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b = pt
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	side.add_child(b)
	_list.add_child(row)
	var rule := Rule.new()
	rule.seed = _seed
	rule.custom_minimum_size = Vector2(0, 8)
	_list.add_child(rule)
	var card := {"panel": row, "title": tl, "desc": dl, "extra": xl, "button": b, "icon": ic}
	_cards.append(card)
	return card


func _set_btn(card: Dictionary, stamp: String, enabled: bool, price: String = "", price_icon: String = "coal", done: bool = false) -> void:
	## Set an entry's button: on a price tag, `stamp` is the small word on the tag
	## (buy, hire, watch) or, once `done`, what gets stamped across it.
	var b: Button = card.button
	if b is UiParts.PriceTag:
		var t := b as UiParts.PriceTag
		t.locked = false
		t.action = "" if done else stamp.to_lower()
		t.stamp = stamp.to_lower() if done else ""
		t.price = "" if done else price
		t.price_icon = UiTheme.icon(price_icon) if price_icon != "" and not done else null
		t.affordable = enabled or done
		t.disabled = not enabled or done
		t.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if enabled and not done else Control.CURSOR_ARROW
		t.queue_redraw()
	else:
		var st := b as UiParts.Stamp
		if st.text != stamp:
			st.text = stamp
		st.disabled = not enabled or done
		st.done = done
		st.queue_redraw()
	var sk: UiParts.Sketch = card.icon
	sk.set_pencil(false)
	(card.title as Label).add_theme_color_override("font_color", UiTheme.INK)


func _set_locked(card: Dictionary, price: String, why: String) -> void:
	## Not in reach yet: sketched in pencil, the tag only an outline.
	var t := card.button as UiParts.PriceTag
	t.locked = true
	t.stamp = ""
	t.action = "later"
	t.price = price
	t.price_icon = UiTheme.icon("coal")
	t.affordable = false
	t.disabled = true
	t.mouse_default_cursor_shape = Control.CURSOR_ARROW
	t.queue_redraw()
	(card.icon as UiParts.Sketch).set_pencil(true)
	(card.title as Label).add_theme_color_override("font_color", UiTheme.PENCIL)
	_extra(card, why)


func _margin(card: Dictionary, note: String) -> void:
	var sk: UiParts.Sketch = card.icon
	if sk.note != note:
		sk.note = note
		sk.queue_redraw()


func _extra(card: Dictionary, text: String) -> void:
	var l: RichTextLabel = card.extra
	l.visible = text != ""
	if l.text != text:
		l.text = text


func _section(text: String) -> void:
	var l := UiTheme.label(UiTheme.T_TITLE, UiTheme.INK, UiTheme.display())
	l.text = text
	_list.add_child(l)


func _buy_feedback(ok: bool, what: String) -> void:
	if ok:
		Sound.play("buy", -3.0)
		hud.toast(what)
	else:
		Sound.play("nope", -6.0)
	refresh()


func _build_tools() -> void:
	for i in Balance.TOOLS.size():
		var t: Dictionary = Balance.TOOLS[i]
		var card := _card(str(t.icon), t.name, t.desc)
		var idx := i
		card.button.pressed.connect(func():
			var ok := GameState.buy_tool(idx)
			_buy_feedback(ok, "The %s is yours" % str(t.name).to_lower()))
		_refreshers.append(func():
			var heat := float(t.heat) * GameState.upgrade_mult("heat")
			_extra(card, "heat %s, lights %s" % [Fmt.num(heat), t.lights])
			if idx == GameState.tool_index:
				_set_btn(card, "In hand", false, "", "", true)
				_margin(card, "")
			elif idx < GameState.tool_index:
				_set_btn(card, "Kept", false, "", "", true)
				_margin(card, "")
			elif idx == GameState.next_tool_index():
				var cost := GameState.tool_cost(idx)
				_set_btn(card, "Buy", GameState.embers >= cost, Fmt.num(cost))
				_margin(card, "a fair price" if GameState.stuck else ("next!" if GameState.embers >= cost else "save up"))
			else:
				_set_locked(card, Fmt.num(float(t.cost)), "buy the %s first" % str(Balance.TOOLS[idx - 1].name).to_lower())
				_margin(card, ""))
	# Ember packs, when you're short for the next tool.
	if GameState.short_for_next_tool():
		_section("Short on embers?")
		for k in Monetization.PACK_PRODUCTS.size():
			var id: String = Monetization.PACK_PRODUCTS[k]
			var p: Dictionary = Monetization.PRODUCTS[id]
			var card := _card(PACK_ICONS[k], p.title, "")
			var pack := k
			card.button.pressed.connect(func(): Monetization.buy(id))
			_refreshers.append(func():
				var amount := GameState.ember_pack_amount(pack)
				card.desc.text = "%s %s embers right now." % [UiTheme.icon_bb("coal", 20), Fmt.num(amount)]
				var nt := GameState.next_tool_index()
				if nt >= 0 and GameState.embers + amount >= GameState.tool_cost(nt):
					_extra(card, "enough for the %s" % str(Balance.TOOLS[nt].name).to_lower())
				else:
					_extra(card, "")
				_set_btn(card, "Buy", true, Monetization.price(id), ""))


func _build_upgrades() -> void:
	for u in Balance.UPGRADES:
		var card := _card(str(u.icon), u.name, u.desc)
		var key: String = u.key
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_upgrade(key), "%s, one notch up" % u.name))
		_refreshers.append(func():
			var lv := int(GameState.upgrade_levels[key])
			_extra(card, "level %d of %d" % [lv, int(u.max)])
			if GameState.upgrade_maxed(key):
				_set_btn(card, "Full", false, "", "", true)
			else:
				var cost := GameState.upgrade_cost(key)
				_set_btn(card, "Buy", GameState.embers >= cost, Fmt.num(cost))
			_margin(card, "a good one" if key == "value" and lv == 0 else ""))


func _build_helpers() -> void:
	for i in Balance.HELPERS.size():
		var h: Dictionary = Balance.HELPERS[i]
		var card := _card(str(h.icon), h.name, h.desc)
		var idx := i
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_helper(idx), "A new %s joins in" % str(h.name).to_lower()))
		_refreshers.append(func():
			var n := int(GameState.helper_counts[idx])
			var each := "heat %s each" % Fmt.num(float(h.heat) * GameState.upgrade_mult("heat"))
			_extra(card, ("%d at work, %s" % [n, each]) if n > 0 else each)
			var cost := GameState.helper_cost(idx)
			_set_btn(card, "Hire", GameState.embers >= cost, Fmt.num(cost)))


func _build_magic() -> void:
	var boost := _card("hourglass", "2x fire for 5 minutes", "Everything burns twice as hot and pays twice the embers. Watch again to stack it, up to 15 minutes.")
	boost.button.pressed.connect(func(): hud.watch_ad("boost"))
	_refreshers.append(func():
		var left := GameState.boost_seconds_left()
		_extra(boost, "running, %s left" % Fmt.duration(left) if left > 0.0 else "")
		_margin(boost, "on now" if left > 0.0 else "")
		if GameState.boost_full():
			_set_btn(boost, "Full", false, "", "", true)
		else:
			_set_btn(boost, "Watch", not Monetization.is_watching(), "free", "magic_lantern"))
	var rush := _card("rush", "Helpers work 3x for 3 minutes", "Your sprites and salamanders burn three times as hot, and hurry.")
	rush.button.pressed.connect(func(): hud.watch_ad("helper_rush"))
	_refreshers.append(func():
		if not GameState.has_helpers():
			_set_btn(rush, "Watch", false, "free", "magic_lantern")
			_extra(rush, "hire a fire sprite first")
		elif GameState.is_helper_rush_active():
			_set_btn(rush, Fmt.duration(GameState.helper_rush_seconds_left()), false, "", "", true)
			_extra(rush, "")
		else:
			_set_btn(rush, "Watch", not Monetization.is_watching(), "free", "magic_lantern")
			_extra(rush, ""))
	var instant := _card("coals", "Free embers", "")
	instant.button.pressed.connect(func(): hud.watch_ad("instant"))
	_refreshers.append(func():
		instant.desc.text = "%s %s embers now, a few minutes of your burning." % [UiTheme.icon_bb("coal", 20), Fmt.num(GameState.instant_amount())]
		var tool := AdOffers.unlocks_tool()
		_extra(instant, "enough for the %s" % tool.to_lower() if tool != "" else "")
		if not GameState.instant_ready():
			_set_btn(instant, Fmt.duration(GameState.instant_ready_at - GameState.now()), false, "", "", true)
		else:
			_set_btn(instant, "Watch", not Monetization.is_watching(), "free", "magic_lantern"))


func _build_shop() -> void:
	var ra := Monetization.PRODUCT_REMOVE_ADS_2X
	var card := _card("no_ads", Monetization.PRODUCTS[ra].title, "No more ads between breaks, and everything burns 2x and pays 2x embers, for good.")
	card.button.pressed.connect(func(): Monetization.buy(ra))
	_refreshers.append(func():
		if Monetization.owns(ra):
			_set_btn(card, "Yours", false, "", "", true)
		else:
			_set_btn(card, "Buy", true, Monetization.price(ra), ""))
	var sp := Monetization.PRODUCT_STARTER
	var starter := _card("parcel", Monetization.PRODUCTS[sp].title, "%s %s embers and the rainbow sparkler, a striped matchstick that fizzes in four colours. One per keeper." % [
		UiTheme.icon_bb("coal", 20), Fmt.num(Balance.STARTER_EMBERS)])
	starter.button.pressed.connect(func(): Monetization.buy(sp))
	_refreshers.append(func():
		if Monetization.owns(sp):
			_set_btn(starter, "Yours", false, "", "", true)
		else:
			_set_btn(starter, "Buy", true, Monetization.price(sp), ""))
	var ph := Monetization.PRODUCT_PHOENIX
	var phoenix := _card("phoenix", Monetization.PRODUCTS[ph].title, "Every tool burns with golden phoenix fire, and 10% hotter.")
	phoenix.button.pressed.connect(func():
		if Monetization.owns(ph):
			GameState.phoenix_on = not GameState.phoenix_on
			refresh()
		else:
			Monetization.buy(ph))
	_refreshers.append(func():
		if Monetization.owns(ph):
			_set_btn(phoenix, "On" if GameState.phoenix_on else "Off", true)
		else:
			_set_btn(phoenix, "Buy", true, Monetization.price(ph), ""))
	if GameState.owns_starter:
		var spk := _card("sparkler", "Rainbow sparkler", "Carry the striped matchstick instead of the plain one.")
		spk.button.pressed.connect(func():
			GameState.sparkler_on = not GameState.sparkler_on
			refresh())
		_refreshers.append(func(): _set_btn(spk, "On" if GameState.sparkler_on else "Off", true))
	_section("Embers")
	for k in Monetization.PACK_PRODUCTS.size():
		var id: String = Monetization.PACK_PRODUCTS[k]
		var p: Dictionary = Monetization.PRODUCTS[id]
		var pc := _card(PACK_ICONS[k], p.title, "")
		var pack := k
		pc.button.pressed.connect(func(): Monetization.buy(id))
		_refreshers.append(func():
			pc.desc.text = "%s %s embers." % [UiTheme.icon_bb("coal", 20), Fmt.num(GameState.ember_pack_amount(pack))]
			_set_btn(pc, "Buy", true, Monetization.price(id), ""))
	var restore := _card("restore", "Restore purchases", "Bought something on another device? Get it back here.")
	restore.button.pressed.connect(func():
		Monetization.restore()
		hud.toast("Asked the store for your purchases"))
	_set_btn(restore, "Restore", true)


func _build_settings() -> void:
	var vol := _card("horn", "Sound effects", "Crackling, whooshing, footsteps.", "stamp")
	var side: VBoxContainer = vol.button.get_parent()
	var minus := UiParts.Stamp.new(901)
	minus.text = "Softer"
	minus.ink = UiTheme.INK
	minus.custom_minimum_size = Vector2(134, 50)
	side.add_child(minus)
	vol.button.ink = UiTheme.INK
	minus.pressed.connect(func():
		Sound.set_volume(Sound.volume - 0.1)
		refresh())
	vol.button.pressed.connect(func():
		Sound.set_volume(Sound.volume + 0.1)
		Sound.play("buy", -8.0)
		refresh())
	_refreshers.append(func():
		_extra(vol, "at %d%%" % int(round(Sound.volume * 100.0)))
		_set_btn(vol, "Louder", Sound.volume < 1.0)
		minus.disabled = Sound.volume <= 0.0
		minus.queue_redraw())
	var mute := _card("horn_mute", "Mute everything", "On a computer, M does this too.", "stamp")
	mute.button.ink = UiTheme.INK
	mute.button.pressed.connect(func():
		Sound.set_muted(not Sound.muted)
		refresh())
	_refreshers.append(func(): _set_btn(mute, "Unmute" if Sound.muted else "Mute", true))
	if OS.is_debug_build() or OS.has_feature("playtest"):
		_build_dev_tools()


func _build_dev_tools() -> void:
	## Playtest builds only (the `playtest` feature tag): speed the game up to
	## play it end to end, and jump about in it.
	_section("Developer tools, playtest builds only")
	var speed := _card("hourglass", "Time", "Runs the whole game faster: fire, walking, boosts, offers.", "stamp")
	speed.button.pressed.connect(func():
		var steps := [1.0, 5.0, 10.0, 50.0]
		var k := (steps.find(Engine.time_scale) + 1) % steps.size()
		Engine.time_scale = steps[k]
		refresh())
	_refreshers.append(func(): _set_btn(speed, "x%d" % int(Engine.time_scale), true))
	var income := _card("ember_value", "Income", "Multiplies every ember the fire pays.", "stamp")
	income.button.pressed.connect(func():
		GameState.dev_income = 1.0 if GameState.dev_income >= 100.0 else GameState.dev_income * 10.0
		refresh())
	_refreshers.append(func(): _set_btn(income, "x%d" % int(GameState.dev_income), true))
	var cash := _card("coals", "Free embers", "Adds 10x your embers, at least 1K.", "stamp")
	cash.button.pressed.connect(func():
		GameState.grant_embers(maxf(1000.0, GameState.embers * 10.0))
		refresh())
	_set_btn(cash, "Add", true)
	var unlock := _card("padlock", "Unlock everything", "Every tool, the upgrades at their top, three of each helper.", "stamp")
	unlock.button.pressed.connect(func():
		GameState.dev_unlock_all()
		rebuild())
	_set_btn(unlock, "Unlock", true)
	var skip := _card("chart", "Skip to a ring", "", "stamp")
	skip.button.pressed.connect(func():
		GameState.dev_skip_to_ring(_next_ring())
		closed.emit())
	_refreshers.append(func():
		var z := _next_ring()
		skip.desc.text = "Burns the rings outside it, gives its tool and walks you to its edge: %s." % (
			"the Elder Tree" if z >= Balance.ZONES.size() else str(Balance.ZONES[z].name).to_lower())
		_set_btn(skip, "Skip", true))
	var fire := _card("flame", "Fire speed", "Multiplies all tool and helper heat.", "stamp")
	fire.button.pressed.connect(func():
		GameState.debug_speed = 1.0 if GameState.debug_speed >= 100.0 else GameState.debug_speed * 10.0
		refresh())
	_refreshers.append(func(): _set_btn(fire, "x%d" % int(GameState.debug_speed), true))
	var ads := _card("chart", "Fake ads and purchases", "", "stamp")
	_refreshers.append(func():
		var c: Dictionary = Monetization.provider.get("counts") if Monetization.provider.get("counts") != null else {}
		ads.desc.text = "rewarded %d, interstitial %d, purchases %d" % [int(c.get("rewarded", 0)), int(c.get("interstitial", 0)), int(c.get("purchases", 0))]
		_set_btn(ads, "Count", false, "", "", true))
	var wipe := _card("sprout", "Start over", "A fresh cursed forest. Keeps purchases.", "stamp")
	wipe.button.pressed.connect(func():
		Engine.time_scale = 1.0
		GameState.wipe_save()
		get_tree().reload_current_scene())
	_set_btn(wipe, "Wipe", true)
	var wipe_all := _card("restore", "Reset the save", "Everything, purchases too, as if newly installed.", "stamp")
	wipe_all.button.pressed.connect(func():
		Engine.time_scale = 1.0
		GameState.wipe_save(false)
		get_tree().reload_current_scene())
	_set_btn(wipe_all, "Reset", true)


func _next_ring() -> int:
	var f := GameState.forest
	if f == null or GameState.keeper == null:
		return 1
	return mini(f.zone_at(GameState.keeper.position.x, GameState.keeper.position.z) + 1, Balance.ZONES.size())


func press(title: String) -> bool:
	## Press an entry's tag (or stamp) the way a finger would: the playthrough
	## bot shops through this. False if there's no such entry or it can't be pressed.
	for c in _cards:
		var tl: Label = c.title
		if tl.text == title:
			var b: Button = c.button
			if b.disabled:
				return false
			b.pressed.emit()
			return true
	return false
