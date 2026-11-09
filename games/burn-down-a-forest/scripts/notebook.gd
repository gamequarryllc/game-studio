class_name Notebook
extends Control
## The shop: the fire-keeper's field notebook, opened full screen from the HUD.
## A leather cover, two cream pages with grain and a stitched spine, index
## tabs of different sizes down the edge, a red ribbon to close it. The left
## page is the contents (embers, the chapter, a note in the keeper's hand) over
## a burn map drawn from the forest itself (burned ground hatched, fires dotted
## in red, an x where I stand) and a doodle for the chapter. The right page is
## ruled, and every line of writing sits on a rule. Each chapter is kept its own
## way: tools as big sketches with their heat written under them, upgrades as
## tally marks, helpers as portraits pasted in with tape, free magic circled in
## ink, the shop and the dials plain. Prices are on taped tags you tap.

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
const LINE := 31.0                    # the rule spacing on the right page; every line of writing sits on one

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
var _map: BurnMap
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


class BurnMap:
	## The forest as the keeper has drawn it: the square of the valley, the
	## rings in ink, burned ground hatched in scorch brown, fires burning now
	## as red dots, the river in blue, the Elder Tree at the heart (a stump once
	## it's gone) and an x where I stand. Redrawn from the real forest.
	extends Control
	var grid: ForestGrid
	var me := Vector2(0.5, 0.9)
	var caption := ""
	var _sig := -1

	func refresh_from(g: ForestGrid, keeper_pos: Vector3) -> void:
		grid = g
		if g == null:
			return
		me = Vector2((keeper_pos.x - g.origin.x) / (g.n * Balance.CELL), (keeper_pos.z - g.origin.y) / (g.n * Balance.CELL))
		var sig := g.burned * 7 + g.burning.size() * 131 + int(me.x * 40.0) * 3 + int(me.y * 40.0) * 5
		if sig != _sig:
			_sig = sig
			queue_redraw()

	func _draw() -> void:
		var side := minf(size.x, size.y - 34.0)
		if side < 40.0:
			return
		var o := Vector2((size.x - side) * 0.5, 4.0)
		var rng := RandomNumberGenerator.new()
		rng.seed = 33
		var ink := Color(UiTheme.HAND_INK, 0.8)
		# the valley's edge, drawn freehand
		var edge := PackedVector2Array()
		for k in 4:
			var a: Vector2 = [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)][k]
			var b: Vector2 = [Vector2(1, 0), Vector2(1, 1), Vector2(0, 1), Vector2(0, 0)][k]
			for j in 6:
				edge.append(o + a.lerp(b, j / 6.0) * side + Vector2(rng.randf_range(-1.2, 1.2), rng.randf_range(-1.2, 1.2)))
		edge.append(edge[0])
		draw_polyline(edge, ink, 1.6, true)
		if grid == null:
			return
		var n := grid.n
		var cell := side / float(n)
		var hatch := PackedVector2Array()
		var water := PackedVector2Array()
		for by in range(0, n, 2):
			for bx in range(0, n, 2):
				var burned := 0
				var fire := false
				var wet := 0
				for oy in 2:
					for ox in 2:
						var i := (bx + ox) + (by + oy) * n
						var st := grid.state[i]
						if st == ForestGrid.ASH or st == ForestGrid.MEADOW:
							burned += 1
						elif st == ForestGrid.BURNING:
							fire = true
						if grid.kind[i] == Balance.WATER:
							wet += 1
				var p := o + Vector2(bx, by) * cell
				if burned >= 2:
					hatch.append(p + Vector2(0.2, 1.8) * cell)
					hatch.append(p + Vector2(1.8, 0.2) * cell)
				if wet >= 2 and (bx + by) % 4 == 0:
					water.append(p + Vector2(0.0, 1.0) * cell)
					water.append(p + Vector2(1.0, 0.6) * cell)
					water.append(p + Vector2(1.0, 0.6) * cell)
					water.append(p + Vector2(2.0, 1.0) * cell)
				if fire:
					draw_circle(p + Vector2(1, 1) * cell, cell * 0.9, Color(UiTheme.STAMP, 0.85))
		if hatch.size() >= 2:
			draw_multiline(hatch, Color(UiTheme.SCORCH, 0.75), 1.3)
		if water.size() >= 2:
			draw_multiline(water, Color("#5C7FA8", 0.8), 1.4)
		# the rings, inked round the heart
		var c := o + Vector2(side, side) * 0.5
		for rr in [28.5, 18.5, 9.5]:
			var pts := PackedVector2Array()
			for a in 41:
				var ang := TAU * a / 40.0
				pts.append(c + Vector2(cos(ang), sin(ang)) * rr * cell * (1.0 + rng.randf_range(-0.03, 0.03)))
			pts[40] = pts[0]
			draw_polyline(pts, Color(UiTheme.HAND_INK, 0.5), 1.2, true)
		# the Elder Tree (a little tree, or a stump with a sprout once it's gone)
		var standing := grid.state[grid.elder_cell] == ForestGrid.INTACT
		draw_line(c + Vector2(0, 5), c + Vector2(0, -4), ink, 2.0, true)
		if standing:
			draw_circle(c + Vector2(0, -7), 5.0, Color(UiTheme.HAND_INK, 0.85))
		else:
			draw_line(c + Vector2(0, -4), c + Vector2(4, -8), Color("#5E7D42"), 2.0, true)
		# the village at the bottom: three roofs
		for k in 3:
			var hp := o + Vector2(side * (0.36 + 0.13 * k), side * 0.93)
			draw_polyline(PackedVector2Array([hp + Vector2(-5, 3), hp + Vector2(0, -3), hp + Vector2(5, 3)]), ink, 1.4, true)
		# where I am
		var mp := o + me.clamp(Vector2(0.02, 0.02), Vector2(0.98, 0.98)) * side
		draw_line(mp + Vector2(-5, -5), mp + Vector2(5, 5), UiTheme.POPPY, 2.6, true)
		draw_line(mp + Vector2(5, -5), mp + Vector2(-5, 5), UiTheme.POPPY, 2.6, true)
		# the caption, written under the map
		if caption != "":
			var f := UiTheme.hand()
			var tw := f.get_string_size(caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 23).x
			draw_string(f, Vector2(maxf(0.0, (size.x - tw) * 0.5), o.y + side + 26.0), caption, HORIZONTAL_ALIGNMENT_LEFT, size.x, 23, UiTheme.HAND_INK)


class Lines:
	## Writing on a ruled page: every line of text sits on a rule (the page's
	## rules are LINE apart and this control is a whole number of lines tall,
	## starting on a rule). Parts: a name in the display face, a line or two in
	## the body face, a note in the keeper's hand, or a tally of marks. Words
	## wrap, and the last line never holds a lone word.
	extends Control
	const LINE := 31.0
	var parts: Array = []           # [{kind, text, font, size, color, level, max}]
	var _lines: Array = []          # [[part index, text]]
	var _w := -1.0

	func set_parts(p: Array) -> void:
		parts = p
		_w = -1.0
		_layout()
		queue_redraw()

	func _notification(what: int) -> void:
		if what == NOTIFICATION_RESIZED and absf(size.x - _w) > 0.5:
			_layout()
			queue_redraw()

	func _layout() -> void:
		_w = size.x
		var width := maxf(size.x, 120.0)
		_lines.clear()
		for pi in parts.size():
			var part: Dictionary = parts[pi]
			if part.kind == "tally":
				_lines.append([pi, ""])
				continue
			var text: String = part.text
			if text == "":
				continue
			var mine: PackedStringArray = UiTheme.wrap(text, part.font, part.size, width).split("\n")
			for ln in mine:
				_lines.append([pi, ln])
		custom_minimum_size.y = maxf(1.0, _lines.size()) * LINE

	func _draw() -> void:
		for li in _lines.size():
			var part: Dictionary = parts[_lines[li][0]]
			var base := (li + 1) * LINE - 6.0
			if part.kind == "tally":
				_tally(Vector2(2.0, base), int(part.level), int(part.max))
				continue
			draw_string(part.font, Vector2(0, base), _lines[li][1], HORIZONTAL_ALIGNMENT_LEFT, -1, part.size, part.color)

	func _tally(at: Vector2, level: int, most: int) -> void:
		## Tally marks for the levels bought (four strokes and a slash through
		## each five), pencil dots for the levels still to buy.
		var rng := RandomNumberGenerator.new()
		rng.seed = most * 13 + 5
		var x := at.x
		for k in most:
			var g := k % 5
			if k < level:
				if g < 4:
					var lean := rng.randf_range(-1.5, 1.5)
					draw_line(Vector2(x + lean, at.y - 18), Vector2(x - lean * 0.5, at.y + 1), UiTheme.HAND_INK, 2.2, true)
				else:
					draw_line(Vector2(x - 34, at.y - 5), Vector2(x + 2, at.y - 14), UiTheme.HAND_INK, 2.2, true)
			else:
				draw_circle(Vector2(x, at.y - 6), 1.7, Color(UiTheme.PENCIL, 0.7))
			x += 9.0 if g < 4 else 0.0
			if g == 4:
				x += 12.0
		draw_string(UiTheme.hand(), Vector2(x + 10.0, at.y), "%d of %d" % [level, most], HORIZONTAL_ALIGNMENT_LEFT, -1, 22, UiTheme.HAND_INK)


class RuledList:
	## The right page's column: entries stacked a whole number of lines tall,
	## with the rules drawn behind them all the way down, so they scroll together.
	extends VBoxContainer
	const LINE := 31.0

	func _draw() -> void:
		var segs := PackedVector2Array()
		var y := LINE
		while y < size.y + 0.5:
			segs.append(Vector2(-18, y))
			segs.append(Vector2(size.x + 40, y))
			y += LINE
		if segs.size() >= 2:
			draw_multiline(segs, Color("#7C93A8", 0.3), 1.0)


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
	page.custom_minimum_size = Vector2(340, 0)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	page.add_child(v)
	var title := UiTheme.label(UiTheme.T_LABEL + 1, UiTheme.INK, UiTheme.display())
	title.text = "The fire-keeper's notebook"
	title.clip_text = true
	v.add_child(title)
	var eh := HBoxContainer.new()
	eh.add_theme_constant_override("separation", 8)
	v.add_child(eh)
	var coal := TextureRect.new()
	coal.texture = UiTheme.icon("coal")
	coal.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	coal.custom_minimum_size = Vector2(40, 40)
	eh.add_child(coal)
	_embers = UiTheme.label(UiTheme.T_BIG + 2, UiTheme.INK, UiTheme.display())
	eh.add_child(_embers)
	var rule := Rule.new()
	rule.custom_minimum_size = Vector2(0, 10)
	rule.seed = 3
	v.add_child(rule)
	var hh := HBoxContainer.new()
	hh.add_theme_constant_override("separation", 6)
	v.add_child(hh)
	var hv := VBoxContainer.new()
	hv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hv.add_theme_constant_override("separation", 0)
	hh.add_child(hv)
	_heading = UiTheme.label(UiTheme.T_BIG - 2, UiTheme.INK, UiTheme.display())
	_heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART     # (so no chapter's name widens the page)
	_heading.custom_minimum_size = Vector2(150, 0)
	hv.add_child(_heading)
	_note = UiTheme.label(25, UiTheme.HAND_INK, UiTheme.hand())   # (wrapped by UiTheme.wrap: no lone last words)
	_note.custom_minimum_size = Vector2(176, 0)
	hv.add_child(_note)
	# the chapter's doodle, top right of the page, with a line about it
	var dv := VBoxContainer.new()
	dv.add_theme_constant_override("separation", -4)
	hh.add_child(dv)
	_sketch = TextureRect.new()
	_sketch.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_sketch.custom_minimum_size = Vector2(78, 78)
	_sketch.pivot_offset = Vector2(39, 39)
	_sketch.rotation = -0.12
	_sketch.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	dv.add_child(_sketch)
	_sketch_note = UiTheme.label(22, UiTheme.HAND_INK, UiTheme.hand())
	_sketch_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sketch_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_sketch_note.custom_minimum_size = Vector2(104, 0)
	dv.add_child(_sketch_note)
	# the burn map fills the rest of the page
	_map = BurnMap.new()
	_map.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_map.custom_minimum_size = Vector2(0, 150)
	_map.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(_map)
	_progress = UiTheme.label(22, UiTheme.HAND_INK, UiTheme.hand())   # (kept for code that reads it; the map writes the caption)
	_progress.visible = false
	v.add_child(_progress)
	return page


func _right_page() -> Control:
	var page := _page(212, 0.0, 40.0)
	page.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page.custom_minimum_size = Vector2(570, 0)      # wider than any chapter's widest entry: no chapter changes the width
	page.clip_contents = true
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(_scroll)
	var m := MarginContainer.new()
	m.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.add_theme_constant_override("margin_left", 22)
	m.add_theme_constant_override("margin_right", 30)
	m.add_theme_constant_override("margin_top", 0)
	_scroll.add_child(m)
	_list = RuledList.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 0)
	m.add_child(_list)
	# the rules run to the bottom of the page even when a chapter is short
	_scroll.resized.connect(func(): _list.custom_minimum_size.y = _scroll.size.y)
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
	_note.text = UiTheme.wrap(NOTES[key], UiTheme.hand(), 25, 176.0)
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
		var kp: Vector3 = GameState.keeper.position if GameState.keeper != null else Vector3(0, 0, 50)
		var z := f.zone_at(kp.x, kp.z)
		_progress.text = "%d%% burned. I'm in %s." % [int(f.progress() * 100.0), str(Balance.ZONES[z].name).to_lower()]
		if _map.caption != _progress.text:
			_map.caption = _progress.text
			_map.queue_redraw()
		_map.refresh_from(f, kp)
	_left_page_sketch()
	for r in _refreshers:
		r.call()


func _left_page_sketch() -> void:
	## Each chapter gets its own doodle on the left page, with a note about it.
	var td := GameState.tool_def()
	var icon_name := str(td.icon)
	var note := "in hand"
	match tab:
		"upgrades":
			icon_name = "bellows"
			var bits: Array = []
			for u in Balance.UPGRADES:
				var lv := int(GameState.upgrade_levels[u.key])
				if lv > 0:
					bits.append("%s %d" % [str(u.name).to_lower().split(" ")[0], lv])
			var levels := 0
			for u in Balance.UPGRADES:
				levels += int(GameState.upgrade_levels[u.key])
			note = "%d notches up" % levels if levels > 0 else "none yet"
		"helpers":
			icon_name = "salamander" if int(GameState.helper_counts[1]) > 0 else "sprite"
			var n0 := int(GameState.helper_counts[0])
			var n1 := int(GameState.helper_counts[1])
			note = "%d at work" % (n0 + n1) if n0 + n1 > 0 else "lonely work"
		"magic":
			icon_name = "magic_lantern"
			note = "%s left" % Fmt.duration(GameState.boost_seconds_left()) if GameState.is_boost_active() else "nothing on"
		"shop":
			icon_name = "parcel"
			note = "or burn for it"
		"settings":
			icon_name = "dial"
			note = "sound %d%%" % int(round(Sound.volume * 100.0)) if not Sound.muted else "all quiet"
	_sketch.rotation = [-0.12, 0.08, -0.05, 0.1, -0.09, 0.04][TABS.map(func(t): return t[0]).find(tab) % 6]
	_sketch.texture = UiTheme.icon(icon_name)
	_sketch_note.text = note


# =====================================================================================
# Entries
# =====================================================================================
func _card(icon_name: String, title: String, desc: String, kind: String = "tag", style: String = "") -> Dictionary:
	## One entry, written on the rules: a sketch (drawn big for tools, pasted in
	## as a photo for helpers, circled in ink for magic), the name, a line or two
	## about it, a note in the keeper's hand or a tally, and on the right the
	## price tag you tap to buy it (settings use stamps), with any margin note
	## written under the tag.
	_seed += 1
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var ic := UiParts.Sketch.new()
	ic.texture = UiTheme.icon(icon_name)
	ic.style = style
	var big := style == "big"
	ic.custom_minimum_size = Vector2(100, 100) if big else Vector2(82, 82)
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ic.tilt = [-0.08, 0.05, -0.03, 0.09, -0.06][_seed % 5] * (2.0 if style == "photo" else 1.0)
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(ic)
	var lines := Lines.new()
	lines.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lines.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	lines.custom_minimum_size = Vector2(170, LINE * 4)
	lines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(lines)
	var side := VBoxContainer.new()
	side.custom_minimum_size = Vector2(150, 0)
	side.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	side.add_theme_constant_override("separation", 0)
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
	var note := UiTheme.label(22, UiTheme.HAND_INK, UiTheme.hand())
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	note.rotation = -0.06
	note.visible = false
	side.add_child(note)
	# (the entry's name as a Label, for code that looks entries up by name; the page writes it on the rules)
	var tl := Label.new()
	tl.text = title
	tl.visible = false
	row.add_child(tl)
	_list.add_child(row)
	var card := {"panel": row, "title": tl, "lines": lines, "name": title, "desc": desc, "extra": "", "tally": [],
		"title_color": UiTheme.INK, "button": b, "icon": ic, "note": note}
	lines.resized.connect(func(): _fit_row(card))
	_relayout(card)
	_cards.append(card)
	return card


func _relayout(card: Dictionary) -> void:
	var parts: Array = [{"kind": "text", "text": card.name, "font": UiTheme.display(), "size": UiTheme.T_TITLE - 2, "color": card.title_color}]
	if card.desc != "":
		parts.append({"kind": "text", "text": card.desc, "font": UiTheme.body(), "size": UiTheme.T_BODY - 1, "color": Color(UiTheme.INK, 0.86)})
	if not (card.tally as Array).is_empty():
		parts.append({"kind": "tally", "level": card.tally[0], "max": card.tally[1]})
	if card.extra != "":
		parts.append({"kind": "text", "text": card.extra, "font": UiTheme.hand(), "size": 23, "color": UiTheme.HAND_INK})
	(card.lines as Lines).set_parts(parts)
	_fit_row(card)


func _fit_row(card: Dictionary) -> void:
	## A whole number of lines tall, with a blank line under it, so the next
	## entry starts on a rule too.
	var lines: Lines = card.lines
	var n := maxi(3, int(round(lines.custom_minimum_size.y / LINE)))
	var want := (n + 1) * LINE
	var row: HBoxContainer = card.panel
	if absf(row.custom_minimum_size.y - want) > 0.5:
		row.custom_minimum_size.y = want


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
	if card.title_color != UiTheme.INK:
		card.title_color = UiTheme.INK
		_relayout(card)


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
	if card.title_color != UiTheme.PENCIL:
		card.title_color = UiTheme.PENCIL
		_relayout(card)
	_extra(card, why)


func _margin(card: Dictionary, note: String) -> void:
	## A word in the margin, written under the tag ("next!", "save up", "on now").
	var l: Label = card.note
	l.visible = note != ""
	if l.text != note:
		l.text = note


func _extra(card: Dictionary, text: String) -> void:
	if card.extra != text:
		card.extra = text
		_relayout(card)


func _desc(card: Dictionary, text: String) -> void:
	if card.desc != text:
		card.desc = text
		_relayout(card)


func _tally(card: Dictionary, level: int, most: int) -> void:
	var t: Array = card.tally
	if t.is_empty() or t[0] != level or t[1] != most:
		card.tally = [level, most]
		_relayout(card)


func _section(text: String) -> void:
	var l := Lines.new()
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.custom_minimum_size = Vector2(0, LINE * 2)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_list.add_child(l)
	l.set_parts([{"kind": "text", "text": text, "font": UiTheme.display(), "size": UiTheme.T_TITLE, "color": UiTheme.INK}])
	l.custom_minimum_size.y = LINE * 2


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
		var card := _card(str(t.icon), t.name, t.desc, "tag", "big")
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
				_desc(card, "%s embers right now." % Fmt.num(amount))
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
			_tally(card, lv, int(u.max))
			if GameState.upgrade_maxed(key):
				_set_btn(card, "Full", false, "", "", true)
			else:
				var cost := GameState.upgrade_cost(key)
				_set_btn(card, "Buy", GameState.embers >= cost, Fmt.num(cost))
			_margin(card, "a good one" if key == "value" and lv == 0 else ""))


func _build_helpers() -> void:
	for i in Balance.HELPERS.size():
		var h: Dictionary = Balance.HELPERS[i]
		var card := _card(str(h.icon), h.name, h.desc, "tag", "photo")
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
	var boost := _card("hourglass", "2x fire for 5 minutes", "Everything burns twice as hot and pays twice the embers. Watch again to stack it, up to 15 minutes.", "tag", "circled")
	boost.button.pressed.connect(func(): hud.watch_ad("boost"))
	_refreshers.append(func():
		var left := GameState.boost_seconds_left()
		_extra(boost, "running, %s left" % Fmt.duration(left) if left > 0.0 else "")
		_margin(boost, "on now" if left > 0.0 else "")
		if GameState.boost_full():
			_set_btn(boost, "Full", false, "", "", true)
		else:
			_set_btn(boost, "Watch", not Monetization.is_watching(), "free", "magic_lantern"))
	var rush := _card("rush", "Helpers work 3x for 3 minutes", "Your sprites and salamanders burn three times as hot, and hurry.", "tag", "circled")
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
	var instant := _card("coals", "Free embers", "", "tag", "circled")
	instant.button.pressed.connect(func(): hud.watch_ad("instant"))
	_refreshers.append(func():
		_desc(instant, "%s embers now, a few minutes of your burning." % Fmt.num(GameState.instant_amount()))
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
	var starter := _card("parcel", Monetization.PRODUCTS[sp].title, "%s embers and the rainbow sparkler, a striped matchstick that fizzes in four colours. One per keeper." % [
		Fmt.num(Balance.STARTER_EMBERS)])
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
			_desc(pc, "%s embers." % Fmt.num(GameState.ember_pack_amount(pack)))
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
		_desc(skip, "Burns the rings outside it, gives its tool and walks you to its edge: %s." % (
			"the Elder Tree" if z >= Balance.ZONES.size() else str(Balance.ZONES[z].name).to_lower()))
		_set_btn(skip, "Skip", true))
	var fire := _card("flame", "Fire speed", "Multiplies all tool and helper heat.", "stamp")
	fire.button.pressed.connect(func():
		GameState.debug_speed = 1.0 if GameState.debug_speed >= 100.0 else GameState.debug_speed * 10.0
		refresh())
	_refreshers.append(func(): _set_btn(fire, "x%d" % int(GameState.debug_speed), true))
	var ads := _card("chart", "Fake ads and purchases", "", "stamp")
	_refreshers.append(func():
		var c: Dictionary = Monetization.provider.get("counts") if Monetization.provider.get("counts") != null else {}
		_desc(ads, "rewarded %d, interstitial %d, purchases %d" % [int(c.get("rewarded", 0)), int(c.get("interstitial", 0)), int(c.get("purchases", 0))])
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
