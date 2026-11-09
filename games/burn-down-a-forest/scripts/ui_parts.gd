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

	var jut := 0.0                  # each tab cut and glued on by hand: its own height and how far it sticks out

	func _init(color: Color, label_text: String, icon_n: String, s: int) -> void:
		fill = color
		text = label_text
		icon_name = icon_n
		seed = s
		UiTheme.plain_button(self)
		for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color"]:
			add_theme_color_override(c, Color(0, 0, 0, 0))
		var rng := RandomNumberGenerator.new()
		rng.seed = s * 7 + 3
		jut = rng.randf_range(-10.0, 4.0)
		custom_minimum_size = Vector2(150, rng.randf_range(54.0, 70.0))

	func _draw() -> void:
		var out := (0.0 if active else 10.0) - jut     # inactive tabs sit a little further in, behind the page
		var r := Rect2(Vector2(-out, 3), Vector2(size.x - jut * 0.5, size.y - 6))
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
	## The starter pack, drawn in the game's ink style like the icons: a soft
	## bundle of brown paper (not a box), its folded ends tucked under, creases,
	## shading hatched in ink rather than filled, a scorch at one corner, twine
	## round it both ways with a fat knot and a bow whose ends hang loose, and a
	## blob of red sealing wax. Every line wobbles a little, and it breathes.
	extends Control
	var t := 0.0

	func _process(delta: float) -> void:
		t += delta
		queue_redraw()

	func _wob(pts: PackedVector2Array, rng: RandomNumberGenerator, amp: float, n: int = 5) -> PackedVector2Array:
		var out := PackedVector2Array()
		for k in pts.size() - 1:
			var a := pts[k]
			var b := pts[k + 1]
			var nrm := (b - a).normalized().orthogonal()
			for j in n:
				var u := float(j) / n
				out.append(a.lerp(b, u) + nrm * (rng.randf_range(-amp, amp) if j > 0 else 0.0))
		out.append(pts[pts.size() - 1])
		return out

	func _bulge(a: Vector2, b: Vector2, out: float, n: int = 8) -> PackedVector2Array:
		var pts := PackedVector2Array()
		var nrm := (b - a).normalized().orthogonal()
		for k in n + 1:
			var u := float(k) / n
			pts.append(a.lerp(b, u) + nrm * sin(u * PI) * out)
		return pts

	func _draw() -> void:
		var w := size.x
		var h := size.y
		var rng := RandomNumberGenerator.new()
		rng.seed = 41
		var breathe := sin(t * 1.8) * 1.2
		var ink := UiTheme.INK
		# corners of the bundle in a three-quarter view (a soft, slightly squashed parcel)
		var ftl := Vector2(w * 0.1, h * 0.36 + breathe)
		var ftr := Vector2(w * 0.66, h * 0.4 + breathe)
		var fbr := Vector2(w * 0.68, h * 0.9)
		var fbl := Vector2(w * 0.08, h * 0.86)
		var btl := Vector2(w * 0.32, h * 0.14 + breathe)
		var btr := Vector2(w * 0.9, h * 0.18 + breathe)
		var bbr := Vector2(w * 0.92, h * 0.68)
		# faces, their edges bowed out where the paper is stuffed full
		var front := PackedVector2Array()
		front.append_array(_bulge(ftl, ftr, -4.0))
		front.append_array(_bulge(ftr, fbr, -5.0))
		front.append_array(_bulge(fbr, fbl, -3.0))
		front.append_array(_bulge(fbl, ftl, -5.0))
		var top := PackedVector2Array()
		top.append_array(_bulge(btl, btr, -3.0))
		top.append_array(_bulge(btr, ftr, -2.0))
		top.append_array(_bulge(ftr, ftl, 4.0))
		top.append_array(_bulge(ftl, btl, -2.0))
		var side := PackedVector2Array()
		side.append_array(_bulge(ftr, btr, 2.0))
		side.append_array(_bulge(btr, bbr, -4.0))
		side.append_array(_bulge(bbr, fbr, -2.0))
		side.append_array(_bulge(fbr, ftr, 5.0))
		# a hard ink shadow on the ground, then the paper
		var shadow := PackedVector2Array([fbl + Vector2(-6, 2), fbr + Vector2(4, 6), bbr + Vector2(10, 4), bbr + Vector2(14, -6), fbl + Vector2(4, -4)])
		draw_colored_polygon(shadow, Color(ink, 0.55))
		draw_colored_polygon(front, Color("#C79B63"))
		draw_colored_polygon(top, Color("#DDB883"))
		draw_colored_polygon(side, Color("#B48550"))
		draw_texture_rect(UiTheme.grain(), Rect2(Vector2.ZERO, size), true, Color(0.45, 0.3, 0.15, 0.1))
		# hatching for the shade: the side face, and the underside of the front
		var hatch := PackedVector2Array()
		for k in 11:
			var u := (k + 0.5) / 11.0
			var a := ftr.lerp(btr, u) + Vector2(2, 6)
			var b := fbr.lerp(bbr, u) + Vector2(0, -6)
			hatch.append(a.lerp(b, rng.randf_range(0.05, 0.25)))
			hatch.append(a.lerp(b, rng.randf_range(0.75, 0.95)))
		for k in 9:
			var u := (k + 0.5) / 9.0
			var a := fbl.lerp(fbr, u) + Vector2(0, -4)
			hatch.append(a)
			hatch.append(a + Vector2(10, -18 - rng.randf_range(0, 10)))
		draw_multiline(hatch, Color(ink, 0.4), 1.4)
		# the folded end tucked under at the front: a flap and its creases
		var flap := PackedVector2Array([fbl + Vector2(8, -6), fbl.lerp(fbr, 0.5) + Vector2(0, -h * 0.17), fbr + Vector2(-8, -6)])
		draw_polyline(_wob(flap, rng, 1.2), ink, 2.0, true)
		for k in 3:
			var a := fbl.lerp(fbr, 0.25 + 0.2 * k) + Vector2(0, -8)
			draw_polyline(_wob(PackedVector2Array([a, a + Vector2(rng.randf_range(-8, 8), -h * 0.07)]), rng, 1.0, 3), Color(ink, 0.5), 1.3, true)
		# a scorch on the top corner (it came by way of the fire-keeper)
		var sc := btl.lerp(ftl, 0.25) + Vector2(14, 4)
		var blot := PackedVector2Array()
		for k in 14:
			var ang := TAU * k / 14.0
			blot.append(sc + Vector2(cos(ang) * (16.0 + rng.randf_range(-5, 5)), sin(ang) * (9.0 + rng.randf_range(-3, 3))))
		draw_colored_polygon(blot, Color(UiTheme.SCORCH, 0.55))
		# ink outlines, wobbling
		for poly: PackedVector2Array in [front, top, side]:
			var closed: PackedVector2Array = poly.duplicate()
			closed.append(poly[0])
			draw_polyline(_wob(closed, rng, 0.9, 2), ink, 2.6, true)
		# twine: round the front and over the top both ways, outlined in ink
		var twine := Color("#EADBB5")
		var knot := ftl.lerp(btr, 0.5) + Vector2(0, 2)
		var runs := [
			[ftl.lerp(ftr, 0.5), knot, btl.lerp(btr, 0.5)],
			[ftl.lerp(btl, 0.5), knot, ftr.lerp(btr, 0.5)],
			[ftl.lerp(ftr, 0.5), fbl.lerp(fbr, 0.52)],
			[ftr.lerp(btr, 0.5), fbr.lerp(bbr, 0.5)],
		]
		for r in runs:
			var pts := _wob(PackedVector2Array(r), rng, 0.8, 4)
			draw_polyline(pts, ink, 6.4, true)
			draw_polyline(pts, twine, 3.2, true)
		# the bow: two loops and two loose ends, frayed
		for sgn in [-1.0, 1.0]:
			var loop := PackedVector2Array()
			for k in 15:
				var ang := TAU * k / 14.0
				loop.append(knot + Vector2(sgn * (17.0 + cos(ang) * 15.0), -9.0 + sin(ang) * 9.0 - absf(cos(ang)) * 3.0))
			draw_polyline(loop, ink, 5.6, true)
			draw_polyline(loop, twine, 2.8, true)
			var tail := PackedVector2Array([knot, knot + Vector2(sgn * 10.0, 14.0), knot + Vector2(sgn * 6.0 + sin(t * 2.0 + float(sgn)) * 2.0, 30.0)])
			draw_polyline(tail, ink, 5.6, true)
			draw_polyline(tail, twine, 2.8, true)
			for f in 3:
				var e := tail[2]
				draw_line(e, e + Vector2(sgn * (f - 1) * 3.0, 6.0), ink, 1.4, true)
		# the knot, and a blob of red sealing wax pressed under it
		var wax := PackedVector2Array()
		for k in 12:
			var ang := TAU * k / 12.0
			wax.append(knot + Vector2(0, 6) + Vector2(cos(ang), sin(ang) * 0.8) * (11.0 + rng.randf_range(-2, 2)))
		draw_colored_polygon(wax, Color("#A8322A"))
		var wc: PackedVector2Array = wax.duplicate()
		wc.append(wax[0])
		draw_polyline(wc, ink, 2.0, true)
		draw_arc(knot + Vector2(0, 6), 5.5, 0.4, TAU - 0.4, 12, Color("#D9604F"), 1.6, true)
		draw_circle(knot, 6.0, ink)
		draw_circle(knot, 4.0, twine)


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


class PriceTag:
	## The buy button IS the price tag: a manila tag on a string with the price
	## on it. Tap it and an ink stamp thumps down on the tag ("in hand", "kept",
	## "yours", "full"...). Too dear: the tag hangs pale and shakes its head.
	## Locked (not yet in reach): only a pencil outline, the way you'd sketch
	## something you mean to get one day.
	extends Button
	var seed := 1
	var price := ""
	var price_icon: Texture2D
	var action := "buy"           # the word inked small on the tag
	var stamp := ""               # stamped across the tag once it's done
	var locked := false
	var affordable := true
	var _thump := 0.0
	var _shake := 0.0
	var _tilt := 0.0

	func _init(s: int = 1) -> void:
		seed = s
		UiTheme.plain_button(self)
		for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_disabled_color"]:
			add_theme_color_override(c, Color(0, 0, 0, 0))
		custom_minimum_size = Vector2(150, 74)
		var rng := RandomNumberGenerator.new()
		rng.seed = s
		_tilt = rng.randf_range(-0.06, 0.06)
		pressed.connect(func():
			_thump = 1.0
			queue_redraw())

	func nope() -> void:
		_shake = 1.0

	func _process(delta: float) -> void:
		if _thump > 0.0 or _shake > 0.0:
			_thump = maxf(0.0, _thump - delta * 3.5)
			_shake = maxf(0.0, _shake - delta * 3.0)
			queue_redraw()

	func _draw() -> void:
		var rng := RandomNumberGenerator.new()
		rng.seed = seed
		var c := size * 0.5
		var hover := is_hovered() and not disabled and stamp == "" and not locked
		var rot := _tilt + sin(_shake * 18.0) * 0.08 * _shake + (0.03 if hover else 0.0)
		draw_set_transform(c, rot, Vector2.ONE)
		var hw := size.x * 0.5 - 8.0
		var hh := minf(size.y * 0.5 - 8.0, 26.0)
		var cut := 16.0
		var pts := PackedVector2Array([Vector2(-hw + cut, -hh), Vector2(hw, -hh + 1), Vector2(hw - 1, hh), Vector2(-hw + cut, hh - 1), Vector2(-hw, 0)])
		for k in pts.size():
			pts[k] += Vector2(rng.randf_range(-1.0, 1.0), rng.randf_range(-1.0, 1.0))
		var hole := Vector2(-hw + cut * 0.95, 0)
		# the string it hangs by, looping off the punched hole
		var lift := -3.0 if hover else 0.0
		draw_line(hole + Vector2(0, lift), hole + Vector2(-14, -hh - 6), Color(UiTheme.INK, 0.55) if not locked else Color(UiTheme.PENCIL, 0.6), 1.4, true)
		if locked:
			# a pencil outline: dashes in graphite, no fill
			var closed := pts + PackedVector2Array([pts[0]])
			for k in closed.size() - 1:
				UiTheme.dashed(get_canvas_item(), closed[k], closed[k + 1], Color(UiTheme.PENCIL, 0.8), 1.4, 6.0, 4.0)
			draw_set_transform(c, rot, Vector2.ONE)
			draw_arc(hole, 3.4, 0, TAU, 12, Color(UiTheme.PENCIL, 0.8), 1.2, true)
		else:
			var sh := PackedVector2Array()
			for p in pts:
				sh.append(p + Vector2(2, 3))
			draw_colored_polygon(sh, Color(UiTheme.INK, 0.85))
			var fill := UiTheme.TAG if affordable or stamp != "" else UiTheme.TAG.lerp(UiTheme.PAPER, 0.55)
			if hover:
				fill = fill.lightened(0.08)
			draw_colored_polygon(pts, fill)
			draw_texture_rect(UiTheme.grain(), Rect2(Vector2(-hw, -hh), Vector2(hw * 2, hh * 2)), true, Color(0.5, 0.4, 0.25, 0.12))
			draw_polyline(pts + PackedVector2Array([pts[0]]), UiTheme.INK, 1.6, true)
			draw_circle(hole, 3.6, UiTheme.INK)
			draw_circle(hole, 2.0, UiTheme.PAPER_SHADE)
		# the price
		var f := UiTheme.display()
		var fs := UiTheme.T_LABEL
		var ink := UiTheme.INK if not locked else UiTheme.PENCIL
		if not affordable and stamp == "" and not locked:
			ink = Color(UiTheme.INK, 0.5)
		var x0 := -hw + cut + 8.0
		if price != "":
			if price_icon != null:
				draw_texture_rect(price_icon, Rect2(Vector2(x0, -fs * 0.62 - 6), Vector2(fs * 1.05, fs * 1.05)), false,
					Color(1, 1, 1, 0.45 if locked or not affordable else 1.0))
				x0 += fs * 1.05 + 4.0
			var t := price
			var tw := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			while tw > hw - x0 - 4.0 and fs > 15:
				fs -= 1
				tw = f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			draw_string(f, Vector2(x0, fs * 0.2 - 6), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, ink)
		if action != "" and stamp == "" and not locked:
			var hf := UiTheme.hand()
			var ac := UiTheme.STAMP if affordable else Color(UiTheme.STAMP_OFF, 0.9)
			draw_string(hf, Vector2(-hw + cut + 8.0, hh - 6.0 if price != "" else 8.0), action, HORIZONTAL_ALIGNMENT_LEFT, -1,
				22 if price != "" else 28, ac)
		if locked and action != "":
			draw_string(UiTheme.hand(), Vector2(-hw + cut + 8.0, hh - 6.0), action, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(UiTheme.PENCIL, 0.9))
		# the stamp, inked over the tag once it's done (it thumps down when pressed)
		if stamp != "":
			var sc := 1.0 + 0.25 * _thump
			draw_set_transform(c + Vector2(6, 2), rot - 0.16, Vector2(sc, sc))
			var sw := minf(hw * 1.5, f.get_string_size(stamp, HORIZONTAL_ALIGNMENT_LEFT, -1, UiTheme.T_LABEL).x + 22.0)
			var sh2 := 19.0
			var col := Color(UiTheme.STAMP, 0.85 - 0.3 * _thump)
			for ring in 2:
				var ins := 0.0 if ring == 0 else 4.0
				var r := Rect2(Vector2(-sw * 0.5 + ins, -sh2 + ins), Vector2(sw - ins * 2, (sh2 - ins) * 2))
				var corners := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y), r.position]
				for k in 4:
					if rng.randf() < 0.15:
						continue
					draw_line(corners[k], corners[k + 1], col, 2.6 if ring == 0 else 1.3, true)
			var stw := f.get_string_size(stamp, HORIZONTAL_ALIGNMENT_LEFT, -1, UiTheme.T_LABEL - 2).x
			draw_string(f, Vector2(-stw * 0.5, 7), stamp, HORIZONTAL_ALIGNMENT_LEFT, -1, UiTheme.T_LABEL - 2, col)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


class Sketch:
	## An entry's sketch in the notebook. Styles: "" a plain ink sketch, "big"
	## a tool drawn large, "photo" a portrait pasted in (a cream-bordered
	## print, a little crooked, two strips of tape), "circled" a sketch the
	## keeper ringed in ink. In pencil while out of reach.
	extends Control
	var texture: Texture2D
	var note := ""                 # (margin notes are written under the price tag now)
	var pencil := false
	var tilt := 0.0
	var style := ""

	func set_pencil(on: bool) -> void:
		if on == pencil:
			return
		pencil = on
		if on:
			var m := ShaderMaterial.new()
			m.shader = load("res://shaders/pencil.gdshader")
			material = m
		else:
			material = null
		queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		draw_set_transform(c, tilt, Vector2.ONE)
		var half := size * 0.5
		if style == "photo":
			# the print: a cream border round a sepia-dark picture, a hard shadow, tape
			var r := Rect2(-half, size)
			draw_rect(Rect2(r.position + Vector2(3, 4), r.size), Color(UiTheme.INK, 0.55))
			draw_rect(r, Color("#F4ECDA"))
			var inner := r.grow(-7.0)
			inner.size.y -= 8.0
			draw_rect(inner, Color("#5A4636"))
			draw_texture_rect(UiTheme.grain(), inner, true, Color(0.9, 0.7, 0.5, 0.18))
			if texture != null:
				draw_texture_rect(texture, inner.grow(-3.0), false)
			draw_rect(r, Color(UiTheme.INK, 0.6), false, 1.2)
			for k in 2:
				var tc := r.position + Vector2(r.size.x * (0.18 if k == 0 else 0.82), 0)
				var a := -0.5 if k == 0 else 0.45
				var tp := PackedVector2Array()
				for q in [Vector2(-14, -6), Vector2(14, -6), Vector2(14, 6), Vector2(-14, 6)]:
					tp.append(tc + (q as Vector2).rotated(a))
				draw_colored_polygon(tp, UiTheme.TAPE)
		else:
			if texture != null:
				draw_texture_rect(texture, Rect2(-half, size), false)
			if style == "circled":
				# ringed in ink, the loop not quite closing
				var rng := RandomNumberGenerator.new()
				rng.seed = int(tilt * 1000.0) + 7
				var pts := PackedVector2Array()
				for k in 30:
					var ang := -0.6 + TAU * 1.08 * k / 29.0
					var rr := 1.0 + rng.randf_range(-0.03, 0.03)
					pts.append(Vector2(cos(ang) * half.x * 1.12 * rr, sin(ang) * half.y * 0.98 * rr))
				draw_polyline(pts, Color(UiTheme.HAND_INK, 0.75), 2.0, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
