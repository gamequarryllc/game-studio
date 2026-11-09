class_name UiParts
extends RefCounted
## Drawn UI pieces used by the HUD, the notebook and the popups. Everything is
## drawn in code with a seeded wobble, so no two pieces are quite the same and
## nothing looks like a stock widget.


class Stamp:
	## The buy button: a rubber ink stamp. Ember ink when it can be pressed,
	## faded grey when not; pressing thumps it down and leaves an imprint.
	extends Button
	var seed := 1
	var ink := UiTheme.STAMP
	var round_stamp := false
	var tilt := 0.0
	var done := false            # already bought: an inked "kept" mark that can't be pressed
	var _thump := 0.0

	func _init(s: int = 1) -> void:
		seed = s
		UiTheme.plain_button(self)
		add_theme_font_override("font", UiTheme.display())
		add_theme_font_size_override("font_size", UiTheme.T_LABEL)
		for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_disabled_color"]:
			add_theme_color_override(c, Color(0, 0, 0, 0))   # the text is drawn in _draw
		custom_minimum_size = Vector2(120, 60)
		var rng := RandomNumberGenerator.new()
		rng.seed = s
		tilt = rng.randf_range(-0.07, 0.07)
		pressed.connect(func():
			_thump = 1.0
			queue_redraw())

	func _process(delta: float) -> void:
		if _thump > 0.0:
			_thump = maxf(0.0, _thump - delta * 4.0)
			queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		var col := ink if not disabled else UiTheme.STAMP_OFF
		if done:
			col = Color(UiTheme.INK, 0.72)
		var sc := 1.0 - 0.12 * sin(_thump * PI)
		draw_set_transform(c, tilt + (0.05 if done else 0.0), Vector2(sc, sc))
		var rng := RandomNumberGenerator.new()
		rng.seed = seed
		var hw := size.x * 0.5 - 6.0
		var hh := size.y * 0.5 - 6.0
		var hover := is_hovered() and not disabled and not done
		# the stamp's shape: a double ink border, slightly broken, like a worn rubber stamp
		for ring in 2:
			var inset := 0.0 if ring == 0 else 5.0
			var pts := PackedVector2Array()
			var n := 28
			for k in n + 1:
				var a := TAU * k / n
				var v := Vector2(cos(a), sin(a))
				# a superellipse: a rounded rectangle
				var p := Vector2(signf(v.x) * pow(absf(v.x), 0.35) * (hw - inset), signf(v.y) * pow(absf(v.y), 0.35) * (hh - inset))
				if round_stamp:
					p = v * (minf(hw, hh) - inset)
				pts.append(p + Vector2(rng.randf_range(-0.8, 0.8), rng.randf_range(-0.8, 0.8)))
			var w := 3.0 if ring == 0 else 1.6
			for k in n:
				if rng.randf() < 0.08:
					continue            # a gap where the ink didn't take
				draw_line(pts[k], pts[k + 1], col, w, true)
		if hover:
			var fill := PackedVector2Array()
			for k in 20:
				var a := TAU * k / 20
				var v := Vector2(cos(a), sin(a))
				fill.append(Vector2(signf(v.x) * pow(absf(v.x), 0.35) * (hw - 7), signf(v.y) * pow(absf(v.y), 0.35) * (hh - 7)))
			draw_colored_polygon(fill, Color(col, 0.12))
		var f := UiTheme.display()
		var fs := get_theme_font_size("font_size")
		var t := text
		var tw := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		while tw > hw * 2.0 - 14.0 and fs > 14:
			fs -= 1
			tw = f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var ic: Texture2D = icon
		var iw := 0.0
		if ic != null:
			iw = fs * 1.15 + 4.0
		var x0 := -(tw + iw) * 0.5
		if ic != null:
			draw_texture_rect(ic, Rect2(Vector2(x0, -fs * 0.6), Vector2(fs * 1.15, fs * 1.15)), false,
				Color(1, 1, 1, 0.45) if disabled or done else Color.WHITE)
		draw_string(f, Vector2(x0 + iw, fs * 0.33), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
		# speckles of ink around the edge
		for k in 7:
			var a := rng.randf_range(0.0, TAU)
			draw_circle(Vector2(cos(a) * (hw + 2), sin(a) * (hh + 2)), rng.randf_range(0.6, 1.4), Color(col, 0.6))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


class Tab:
	## A coloured index tab sticking out of the notebook's edge.
	extends Button
	var fill := UiTheme.EMBER
	var active := false
	var icon_name := ""
	var seed := 1

	func _init(color: Color, label_text: String, icon_n: String, s: int) -> void:
		fill = color
		text = label_text
		icon_name = icon_n
		seed = s
		UiTheme.plain_button(self)
		for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color"]:
			add_theme_color_override(c, Color(0, 0, 0, 0))
		custom_minimum_size = Vector2(158, 62)

	func _draw() -> void:
		var out := 0.0 if active else 10.0      # inactive tabs sit a little further in, behind the page
		var r := Rect2(Vector2(-out, 3), Vector2(size.x, size.y - 6))
		var pts := PackedVector2Array([r.position, Vector2(r.end.x - 14, r.position.y), Vector2(r.end.x, r.position.y + 12),
			Vector2(r.end.x, r.end.y - 12), Vector2(r.end.x - 14, r.end.y), Vector2(r.position.x, r.end.y)])
		var sh := PackedVector2Array()
		for p in pts:
			sh.append(p + Vector2(3, 3))
		draw_colored_polygon(sh, UiTheme.INK)
		var col := fill if active else fill.darkened(0.18)
		draw_colored_polygon(pts, col)
		draw_texture_rect(UiTheme.grain(), r, true, Color(0.4, 0.3, 0.2, 0.12))
		draw_polyline(pts, UiTheme.INK, 1.6, true)
		var ic := UiTheme.icon(icon_name)
		var x := r.position.x + 18.0 + out
		if ic != null:
			draw_texture_rect(ic, Rect2(Vector2(x, r.get_center().y - 16), Vector2(32, 32)), false)
		var f := UiTheme.bold()
		var tc := UiTheme.INK if fill.get_luminance() > 0.45 else UiTheme.PAPER
		draw_string(f, Vector2(x + 37, r.get_center().y + 7), text, HORIZONTAL_ALIGNMENT_LEFT, -1, UiTheme.T_BODY, tc)


class Ribbon:
	## The ribbon bookmark hanging off the top of the notebook: tap it to close.
	extends Button

	func _init() -> void:
		UiTheme.plain_button(self)
		text = "close"
		for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color"]:
			add_theme_color_override(c, Color(0, 0, 0, 0))
		custom_minimum_size = Vector2(64, 132)

	func _draw() -> void:
		var w := size.x
		var h := size.y
		var pts := PackedVector2Array([Vector2(6, 0), Vector2(w - 6, 0), Vector2(w - 4, h), Vector2(w * 0.5, h - 18), Vector2(4, h)])
		var sh := PackedVector2Array()
		for p in pts:
			sh.append(p + Vector2(3, 3))
		draw_colored_polygon(sh, UiTheme.INK)
		draw_colored_polygon(pts, UiTheme.RIBBON.lightened(0.08) if is_hovered() else UiTheme.RIBBON)
		draw_line(Vector2(12, 4), Vector2(12, h - 14), Color(1, 1, 1, 0.12), 2.0)
		draw_polyline(pts + PackedVector2Array([pts[0]]), UiTheme.INK, 1.5, true)
		var f := UiTheme.hand()
		var fs := 23
		var tw := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string(f, Vector2(w * 0.5 - tw * 0.5, h - 40), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UiTheme.PAPER)


class Fuse:
	## Progress as a burning fuse: ash behind the spark, rope ahead of it.
	extends Control
	var value := 0.0
	var t := 0.0

	func _process(delta: float) -> void:
		t += delta
		queue_redraw()

	func _draw() -> void:
		var y := size.y * 0.5
		var x0 := 4.0
		var x1 := size.x - 4.0
		var xs := lerpf(x0, x1, clampf(value, 0.0, 1.0))
		var rope := PackedVector2Array()
		var ash := PackedVector2Array()
		for k in 41:
			var x := lerpf(x0, x1, k / 40.0)
			var p := Vector2(x, y + sin(k * 1.3) * 1.3)
			if x <= xs:
				ash.append(p)
			if x >= xs - 3.0:
				rope.append(p)
		if rope.size() >= 2:
			draw_polyline(rope, UiTheme.INK, 6.0, true)
			draw_polyline(rope, Color("#B9935E"), 3.0, true)
			for k in range(0, rope.size() - 1, 2):
				draw_line(rope[k] + Vector2(-1, -2), rope[k] + Vector2(2, 2), Color("#7A5A34"), 1.2)
		if ash.size() >= 2:
			draw_polyline(ash, UiTheme.INK, 5.0, true)
			draw_polyline(ash, Color("#6A625C"), 2.4, true)
		if value > 0.001 and value < 0.999:
			var flick := 0.5 + 0.5 * sin(t * 13.0)
			draw_circle(Vector2(xs, y), 5.5 + flick, UiTheme.INK)
			draw_circle(Vector2(xs, y), 4.0 + flick * 0.8, UiTheme.EMBER)
			draw_circle(Vector2(xs, y - 0.5), 2.0, UiTheme.CORE)


class WindDisc:
	## Which way the wind blows (relative to the camera): an ink arrow burned
	## into a slice of wood, with three notches for how hard.
	extends Control
	var angle := 0.0
	var strength := 0.5

	func _draw() -> void:
		var c := Vector2(24, size.y * 0.5)
		draw_circle(c + Vector2(2, 3), 21.0, UiTheme.INK)
		draw_circle(c, 21.0, Color("#3D2B22"))
		draw_circle(c, 17.0, Color("#8C6844"))
		for k in 3:
			draw_arc(c, 5.0 + k * 4.0, 0, TAU, 20, Color("#6B4E33"), 1.0, true)
		var d := Vector2(sin(angle), -cos(angle))
		var side := Vector2(-d.y, d.x)
		var tip := c + d * 13.0
		draw_line(c - d * 11.0, tip - d * 3.0, UiTheme.INK, 3.0, true)
		draw_colored_polygon(PackedVector2Array([tip + d * 2.0, tip - d * 7.0 + side * 6.0, tip - d * 7.0 - side * 6.0]), UiTheme.INK)
		draw_string(UiTheme.hand(), Vector2(52, size.y * 0.5 + 8), "wind", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, UiTheme.CREAM)
		for k in 3:
			var on := strength > 0.3 + 0.2 * k
			var x := 104.0 + k * 9.0
			var h := 7.0 + k * 4.0
			draw_rect(Rect2(Vector2(x + 1, size.y * 0.5 + 8 - h + 1), Vector2(5, h)), UiTheme.INK)
			draw_rect(Rect2(Vector2(x, size.y * 0.5 + 8 - h), Vector2(5, h)), UiTheme.CORE if on else Color(UiTheme.ASH, 0.35))


class Parcel:
	## The starter pack: a brown paper parcel tied up with twine.
	extends Control
	var t := 0.0

	func _process(delta: float) -> void:
		t += delta
		queue_redraw()

	func _draw() -> void:
		var w := size.x
		var h := size.y
		var wob := sin(t * 2.0) * 1.5
		var top := PackedVector2Array([Vector2(w * 0.08, h * 0.28 + wob), Vector2(w * 0.55, h * 0.1), Vector2(w * 0.95, h * 0.24), Vector2(w * 0.48, h * 0.44 + wob)])
		var front := PackedVector2Array([Vector2(w * 0.08, h * 0.28 + wob), Vector2(w * 0.48, h * 0.44 + wob), Vector2(w * 0.5, h * 0.96), Vector2(w * 0.1, h * 0.8)])
		var right := PackedVector2Array([Vector2(w * 0.48, h * 0.44 + wob), Vector2(w * 0.95, h * 0.24), Vector2(w * 0.93, h * 0.78), Vector2(w * 0.5, h * 0.96)])
		for poly in [front, right, top]:
			var sh := PackedVector2Array()
			for p in poly:
				sh.append(p + Vector2(5, 6))
			draw_colored_polygon(sh, UiTheme.INK)
		draw_colored_polygon(front, Color("#B98F5C"))
		draw_colored_polygon(right, Color("#96703F"))
		draw_colored_polygon(top, Color("#CFA672"))
		for poly in [front, right, top]:
			draw_texture_rect(UiTheme.grain(), Rect2(Vector2.ZERO, size), true, Color(0.4, 0.3, 0.2, 0.0))
			draw_polyline(poly + PackedVector2Array([poly[0]]), UiTheme.INK, 2.4, true)
		# twine both ways round, and a bow on top
		var twine := Color("#EFE3C8")
		var a := top[0].lerp(top[1], 0.5)
		var b := top[3].lerp(top[2], 0.5)
		var c := top[0].lerp(top[3], 0.5)
		var d := top[1].lerp(top[2], 0.5)
		for seg in [[a, b], [c, d], [b, front[3].lerp(front[2], 0.5) + Vector2(w * 0.2, 0) * 0.0], [c, front[3].lerp(front[0], 0.5)]]:
			draw_line(seg[0], seg[1], UiTheme.INK, 6.0, true)
			draw_line(seg[0], seg[1], twine, 3.0, true)
		var mid := (a + b) * 0.5
		var down1 := b.lerp(front[2], 1.0)
		draw_line(b, Vector2(b.x + 2, front[2].y - 4), UiTheme.INK, 6.0, true)
		draw_line(b, Vector2(b.x + 2, front[2].y - 4), twine, 3.0, true)
		draw_line(d, Vector2(d.x - 2, right[2].y - 4), UiTheme.INK, 6.0, true)
		draw_line(d, Vector2(d.x - 2, right[2].y - 4), twine, 3.0, true)
		for side in [-1.0, 1.0]:
			var loop := PackedVector2Array()
			for k in 13:
				var ang := TAU * k / 12.0
				loop.append(mid + Vector2(side * (14.0 + cos(ang) * 13.0), -6.0 + sin(ang) * 8.0))
			draw_polyline(loop, UiTheme.INK, 5.0, true)
			draw_polyline(loop, twine, 2.6, true)
		draw_circle(mid, 6.0, UiTheme.INK)
		draw_circle(mid, 4.0, twine)
		var _unused := down1


class Finger:
	## The drawn hand in the first-run hints, pressing down on a control.
	extends TextureRect
	var t := 0.0
	var press := true

	func _init() -> void:
		texture = UiTheme.icon("finger")
		expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		flip_v = true
		size = Vector2(72, 72)
		pivot_offset = Vector2(36, 72)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(delta: float) -> void:
		t += delta
		var k := 0.5 + 0.5 * sin(t * 4.0)
		var e := k * k * (3.0 - 2.0 * k)   # eased in and out, not linear
		scale = Vector2(1.0 - 0.06 * e, 1.0 - 0.1 * e) if press else Vector2.ONE
		position.y = get_meta("base_y", position.y) + (8.0 * e if press else 0.0)
		position.x = get_meta("base_x", position.x) + (0.0 if press else sin(t * 2.2) * 26.0)
