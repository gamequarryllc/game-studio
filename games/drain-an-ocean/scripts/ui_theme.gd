class_name UiTheme
extends RefCounted
## The harbour master's paperwork (see the art bible in NOTES.md): chart paper
## with a faint graticule, ruled double borders and fold creases; rope drawn
## as a laid three-strand line; ink stamps for prices; International Code
## signal flags for the main buttons. Fraunces (titles, money, ring and
## water names in italic, as on charts) and Atkinson Hyperlegible (anything
## read at a glance). Everything is drawn in code, a little uneven on purpose.

const TEAL := Color("#0f4c5c")
const SHOAL := Color("#4fa89b")
const SAND := Color("#e3c48f")
const PAPER := Color("#f3ead3")
const CORAL := Color("#e0603f")
const RUST := Color("#8c4425")
const INK := Color("#1c2a33")
# Mixes of the swatches.
const PAPER_SHADE := Color("#e2d5b6")      # paper in shadow, table rules
const CHART_BLUE := Color("#7fa6a8")       # graticule lines on the paper
const BRASS := Color("#b88a45")            # sand + rust: the dial
const BRASS_DARK := Color("#6e4a26")
const ROPE := Color("#c9a874")
const ROPE_DARK := Color("#8a6a3e")
const FLAG_BLUE := Color("#1d4f7a")        # signal-flag blue (teal + ink)
const FLAG_RED := Color("#c8442f")         # coral deepened for flags
const FLAG_YELLOW := Color("#e8b740")
const DIM_INK := Color(0.11, 0.165, 0.2, 0.62)

static var _display: Font
static var _italic: Font
static var _body: Font
static var _bold: Font
static var _icons := {}


static func install_fonts() -> void:
	if _body != null:
		return
	_body = load("res://fonts/AtkinsonHyperlegible-Regular.ttf")
	_bold = load("res://fonts/AtkinsonHyperlegible-Bold.ttf")
	var f := FontVariation.new()
	f.base_font = load("res://fonts/Fraunces-Variable.ttf")
	f.variation_opentype = {
		TextServerManager.get_primary_interface().name_to_tag("wght"): 640,
		TextServerManager.get_primary_interface().name_to_tag("opsz"): 96,
		TextServerManager.get_primary_interface().name_to_tag("SOFT"): 50,
		TextServerManager.get_primary_interface().name_to_tag("WONK"): 1,
	}
	f.fallbacks = [_bold]
	_display = f
	var it := FontVariation.new()
	it.base_font = load("res://fonts/Fraunces-Italic-Variable.ttf")
	it.variation_opentype = {
		TextServerManager.get_primary_interface().name_to_tag("wght"): 520,
		TextServerManager.get_primary_interface().name_to_tag("opsz"): 48,
		TextServerManager.get_primary_interface().name_to_tag("SOFT"): 80,
		TextServerManager.get_primary_interface().name_to_tag("WONK"): 1,
	}
	it.fallbacks = [_body]
	_italic = it
	ThemeDB.fallback_font = _body
	ThemeDB.fallback_font_size = 22


static func sub_size(size: int) -> int:
	## A stamp's second line: never under 21 px (about 11.4 px on a phone).
	return maxi(21, int(size * 0.8))


static func display() -> Font:
	install_fonts()
	return _display


static func italic() -> Font:
	install_fonts()
	return _italic


static func body() -> Font:
	install_fonts()
	return _body


static func bold() -> Font:
	install_fonts()
	return _bold


static func icon(name: String) -> Texture2D:
	if not _icons.has(name):
		var path := "res://ui/icons/%s.svg" % name
		_icons[name] = load(path) if ResourceLoader.exists(path) else null
	return _icons[name]


static func label(text: String, size: int = 22, color: Color = INK, font: Font = null) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", font if font != null else body())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func wrap(l: Label, width: float) -> Label:
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = width
	return l


# --- Drawing ----------------------------------------------------------------------------------
static func jitter(seed: int, i: int) -> float:
	## A stable small random number per (seed, i), -1..1.
	var x := sin(float(seed) * 12.9898 + float(i) * 78.233) * 43758.5453
	return (x - floor(x)) * 2.0 - 1.0


static func rough_rect(r: Rect2, seed: int, amount: float = 1.6, per_side: int = 6) -> PackedVector2Array:
	## A rectangle with slightly uneven, hand-cut edges.
	var pts := PackedVector2Array()
	var corners := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]
	var k := 0
	for side in 4:
		var a: Vector2 = corners[side]
		var b: Vector2 = corners[(side + 1) % 4]
		var nrm := (b - a).orthogonal().normalized()
		for s in per_side:
			var t := float(s) / float(per_side)
			var off := jitter(seed, k) * amount
			if s == 0:
				off *= 0.4
			pts.append(a.lerp(b, t) + nrm * off)
			k += 1
	return pts


static func paper(ci: CanvasItem, r: Rect2, seed: int = 1, opts: Dictionary = {}) -> void:
	## Chart paper: a soft shadow, a slightly uneven sheet, a faint blue
	## graticule, specks, a fold crease and a ruled double border.
	var col: Color = opts.get("color", PAPER)
	var shadow: bool = opts.get("shadow", true)
	var border: bool = opts.get("border", true)
	var grid: bool = opts.get("grid", true)
	var fold: bool = opts.get("fold", true)
	if shadow:
		var sh := rough_rect(Rect2(r.position + Vector2(4, 6), r.size), seed + 7, 1.6)
		ci.draw_colored_polygon(sh, Color(0.05, 0.12, 0.15, 0.32))
	var poly := rough_rect(r, seed, 1.4)
	var tint := col.darkened(0.03 * (0.5 + 0.5 * jitter(seed, 99)))
	ci.draw_colored_polygon(poly, tint)
	# Age: the edges a little darker.
	var inner := r.grow(-r.size.length() * 0.0)
	ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, 3)), Color(0.55, 0.45, 0.3, 0.08))
	ci.draw_rect(Rect2(Vector2(inner.position.x, inner.end.y - 4), Vector2(inner.size.x, 4)), Color(0.55, 0.45, 0.3, 0.1))
	if grid:
		var step := 46.0
		var gc := Color(CHART_BLUE, 0.16)
		var x := r.position.x + fmod(float(seed) * 13.0, step)
		while x < r.end.x - 4:
			ci.draw_line(Vector2(x, r.position.y + 5), Vector2(x, r.end.y - 5), gc, 1.0)
			x += step
		var y := r.position.y + fmod(float(seed) * 7.0, step)
		while y < r.end.y - 4:
			ci.draw_line(Vector2(r.position.x + 5, y), Vector2(r.end.x - 5, y), gc, 1.0)
			y += step
	# Specks of foxing.
	var n := int(r.size.x * r.size.y / 2600.0)
	for i in n:
		var p := r.position + Vector2((jitter(seed, i * 3) * 0.5 + 0.5) * r.size.x, (jitter(seed, i * 3 + 1) * 0.5 + 0.5) * r.size.y)
		ci.draw_circle(p, 0.6 + absf(jitter(seed, i * 3 + 2)) * 1.1, Color(0.45, 0.33, 0.2, 0.12))
	if fold and r.size.x > 160:
		var fx := r.position.x + r.size.x * (0.38 + 0.2 * (jitter(seed, 50) * 0.5 + 0.5))
		ci.draw_line(Vector2(fx, r.position.y + 2), Vector2(fx + 3, r.end.y - 2), Color(1, 1, 1, 0.35), 1.5)
		ci.draw_line(Vector2(fx + 1.5, r.position.y + 2), Vector2(fx + 4.5, r.end.y - 2), Color(0.4, 0.3, 0.2, 0.12), 1.2)
	if border:
		var b1 := r.grow(-7)
		var b2 := r.grow(-11)
		ci.draw_polyline(_closed(rough_rect(b1, seed + 3, 0.5, 4)), Color(INK, 0.78), 2.0)
		ci.draw_polyline(_closed(rough_rect(b2, seed + 5, 0.4, 4)), Color(INK, 0.55), 1.0)


static func _closed(p: PackedVector2Array) -> PackedVector2Array:
	var q := p.duplicate()
	q.append(p[0])
	return q


static func rope(ci: CanvasItem, a: Vector2, b: Vector2, sag: float = 20.0, thick: float = 7.0) -> PackedVector2Array:
	## A laid rope hanging between two points; returns its centre line.
	var pts := PackedVector2Array()
	var n := 28
	for i in n + 1:
		var t := float(i) / float(n)
		var p := a.lerp(b, t)
		p.y += sin(t * PI) * sag
		pts.append(p)
	ci.draw_polyline(pts, ROPE_DARK, thick + 2.0, true)
	ci.draw_polyline(pts, ROPE, thick, true)
	# Strands: short diagonal marks along the rope.
	var length := 0.0
	var acc := 0.0
	for i in n:
		var p0 := pts[i]
		var p1 := pts[i + 1]
		var seg := p0.distance_to(p1)
		var dir := (p1 - p0).normalized()
		var nrm := dir.orthogonal()
		while acc < seg:
			var q := p0 + dir * acc
			ci.draw_line(q - nrm * thick * 0.45 - dir * thick * 0.3, q + nrm * thick * 0.45 + dir * thick * 0.3, ROPE_DARK, 1.4)
			acc += thick * 0.8
		acc -= seg
		length += seg
	return pts


static func rope_border(ci: CanvasItem, r: Rect2, thick: float = 5.0) -> void:
	## A rope laid round a panel's edge.
	var c := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]
	for i in 4:
		rope(ci, c[i], c[(i + 1) % 4], 0.0, thick)
	for p in c:
		ci.draw_circle(p, thick * 0.9, ROPE_DARK)
		ci.draw_circle(p, thick * 0.65, ROPE)


static func stamp(ci: CanvasItem, r: Rect2, text: String, col: Color, font: Font, size: int, seed: int = 3, sub: String = "") -> void:
	## An ink stamp: uneven double border, slightly turned, ink a bit patchy.
	var c := r.get_center()
	var ang := deg_to_rad(jitter(seed, 1) * 2.5)
	ci.draw_set_transform(c, ang, Vector2.ONE)
	var rr := Rect2(-r.size * 0.5, r.size)
	var outer := rough_rect(rr, seed, 1.2, 8)
	ci.draw_polyline(_closed(outer), col, 3.0, true)
	var inn := rough_rect(rr.grow(-5), seed + 1, 0.8, 8)
	ci.draw_polyline(_closed(inn), Color(col, col.a * 0.7), 1.4, true)
	var ty := 0.0
	if sub != "":
		ty = -size * 0.36
	var tw := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	ci.draw_string(font, Vector2(-tw * 0.5, ty + size * 0.36), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)
	if sub != "":
		var ss := sub_size(size)
		var sw := body().get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
		ci.draw_string(body(), Vector2(-sw * 0.5, ty + size * 0.36 + ss * 1.15), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss, Color(col, col.a * 0.85))
	# patchy ink: a few paper-coloured nicks
	for i in 5:
		var p := Vector2(jitter(seed, i + 10) * rr.size.x * 0.5, jitter(seed, i + 20) * rr.size.y * 0.5)
		ci.draw_circle(p, 1.2 + absf(jitter(seed, i + 30)) * 1.5, Color(PAPER, 0.5))
	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func flag(ci: CanvasItem, r: Rect2, pattern: String, t: float, seed: int = 0) -> void:
	## An International Code signal flag in the breeze (a gentle wave along
	## the fly). Patterns: C, A, Z, P, B and "pennant".
	var cols := 14
	var rows := 6
	var wave := func(u: float, v: float) -> Vector2:
		var amp := 4.0 * u
		return r.position + Vector2(u * r.size.x, v * r.size.y + sin(u * 5.0 - t * 4.0 + float(seed)) * amp)
	for i in cols:
		for j in rows:
			var u0 := float(i) / cols
			var u1 := float(i + 1) / cols
			var v0 := float(j) / rows
			var v1 := float(j + 1) / rows
			var uc := (u0 + u1) * 0.5
			var vc := (v0 + v1) * 0.5
			var c := _flag_color(pattern, uc, vc)
			if c.a <= 0.0:
				continue
			var shade := 0.9 + 0.1 * sin(uc * 5.0 - t * 4.0 + float(seed) + 1.2)
			c = Color(c.r * shade, c.g * shade, c.b * shade, c.a)
			var quad := PackedVector2Array([wave.call(u0, v0), wave.call(u1, v0), wave.call(u1, v1), wave.call(u0, v1)])
			ci.draw_colored_polygon(quad, c)
	# outline along the edges
	var edge := PackedVector2Array()
	for i in cols + 1:
		edge.append(wave.call(float(i) / cols, 0.0))
	if pattern == "A" or pattern == "B":
		edge.append(wave.call(0.72, 0.5))
	for i in range(cols, -1, -1):
		edge.append(wave.call(float(i) / cols, 1.0))
	edge.append(wave.call(0.0, 0.0))
	ci.draw_polyline(edge, Color(INK, 0.6), 1.5, true)


static func _flag_color(p: String, u: float, v: float) -> Color:
	match p:
		"C":   # blue, white, red, white, blue (horizontal)
			var b := int(v * 5.0)
			return [FLAG_BLUE, PAPER, FLAG_RED, PAPER, FLAG_BLUE][clampi(b, 0, 4)]
		"A":   # white hoist, blue swallowtail fly
			if u > 0.72 and absf(v - 0.5) < (u - 0.72) * 1.8:
				return Color(0, 0, 0, 0)
			return PAPER if u < 0.5 else FLAG_BLUE
		"Z":   # four triangles: yellow top, blue fly, red bottom, black hoist
			var dx := u - 0.5
			var dy := v - 0.5
			if absf(dy) > absf(dx):
				return FLAG_YELLOW if dy < 0.0 else FLAG_RED
			return INK if dx < 0.0 else FLAG_BLUE
		"P":   # blue peter: blue with a white square
			if absf(u - 0.5) < 0.2 and absf(v - 0.5) < 0.2:
				return PAPER
			return FLAG_BLUE
		"B":   # red swallowtail
			if u > 0.72 and absf(v - 0.5) < (u - 0.72) * 1.8:
				return Color(0, 0, 0, 0)
			return FLAG_RED
		"pennant":
			if absf(v - 0.5) > 0.5 * (1.0 - u):
				return Color(0, 0, 0, 0)
			return FLAG_RED if fmod(u * 4.0, 1.0) < 0.5 else PAPER
	return PAPER


# --- One material per UI role (art review 1, item 11) -------------------------------------------
# chart: the base chart paper (big sheets). slip: a notice to mariners,
# a torn-off slip pinned up with a brass pin. tag: a manila tag on a thread,
# for anything pointing at the world. cartouche: the engraved title box of a
# chart, with scrolled ends, for the money. label: a museum specimen label,
# for finds. folded: a chart that's been folded in four, for the ending.
# plate: a natural-history plate border, for the aquarium's register.

static func slip(ci: CanvasItem, r: Rect2, seed: int = 1) -> void:
	## A torn-off notice: straight top, torn bottom edge, a brass pin.
	var pts := PackedVector2Array()
	pts.append(r.position)
	pts.append(Vector2(r.end.x, r.position.y))
	var n := int(r.size.x / 9.0)
	for i in n + 1:
		var t := 1.0 - float(i) / float(n)
		var x := r.position.x + r.size.x * t
		var y := r.end.y - 3.0 - absf(jitter(seed, i)) * 5.0 - (3.0 if i % 2 == 0 else 0.0)
		pts.append(Vector2(x, y))
	var sh := PackedVector2Array()
	for p in pts:
		sh.append(p + Vector2(3, 5))
	ci.draw_colored_polygon(sh, Color(0.05, 0.12, 0.15, 0.3))
	ci.draw_colored_polygon(pts, PAPER.darkened(0.02))
	ci.draw_line(r.position + Vector2(10, 9), Vector2(r.end.x - 10, r.position.y + 9), Color(RUST, 0.55), 1.5)
	var pin := Vector2(r.position.x + r.size.x * 0.5 + jitter(seed, 77) * 12.0, r.position.y + 3)
	ci.draw_circle(pin + Vector2(1.5, 2.5), 7.5, Color(0.05, 0.12, 0.15, 0.35))
	ci.draw_circle(pin, 7.5, BRASS_DARK)
	ci.draw_circle(pin, 5.5, BRASS)
	ci.draw_circle(pin + Vector2(-1.8, -1.8), 2.0, Color(1, 0.95, 0.75, 0.8))


static func tag_shape(r: Rect2, notch: float = 18.0) -> PackedVector2Array:
	## A manila tag: a rectangle with its left end clipped to a point.
	return PackedVector2Array([Vector2(r.position.x + notch, r.position.y), Vector2(r.end.x, r.position.y), r.end,
		Vector2(r.position.x + notch, r.end.y), Vector2(r.position.x, r.position.y + r.size.y * 0.5)])


static func tag(ci: CanvasItem, r: Rect2, seed: int = 1, col: Color = Color("#ead9b0")) -> Vector2:
	## Draws a tag and returns the eyelet's centre (where a thread ties on).
	var poly := tag_shape(r)
	var sh := PackedVector2Array()
	for p in poly:
		sh.append(p + Vector2(3, 4))
	ci.draw_colored_polygon(sh, Color(0.05, 0.12, 0.15, 0.3))
	ci.draw_colored_polygon(poly, col)
	ci.draw_polyline(_closed(poly), Color(RUST, 0.35), 1.2, true)
	var eye := Vector2(r.position.x + 15.0, r.position.y + r.size.y * 0.5)
	ci.draw_circle(eye, 7.0, Color(col.darkened(0.25)))
	ci.draw_circle(eye, 4.0, Color(0.06, 0.16, 0.19, 0.9))
	for i in 3:
		var x := r.position.x + r.size.x * (0.3 + 0.25 * i) + jitter(seed, i) * 8.0
		ci.draw_line(Vector2(x, r.position.y + 2), Vector2(x + 2, r.position.y + 6), Color(0.45, 0.33, 0.2, 0.15), 1.0)
	return eye


static func cartouche_points(r: Rect2, k: float = 12.0) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var centres := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]
	var starts := [0.0, PI * 0.5, PI, PI * 1.5]
	for c in 4:
		for s in 7:
			var a: float = starts[c] + PI * 0.5 * (1.0 - float(s) / 6.0)
			pts.append(centres[c] + Vector2(cos(a), sin(a)) * k)
	return pts


static func cartouche(ci: CanvasItem, r: Rect2, seed: int = 1) -> void:
	## A chart's title cartouche: a plate with concave corners, a ruled
	## double border, and scrolled ends curling off each side.
	var k := 12.0
	var pts := PackedVector2Array()
	var corners := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]
	var centres := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]
	var starts := [0.0, PI * 0.5, PI, PI * 1.5]
	for c in 4:
		for s in 7:
			# clockwise round the plate: each corner's concave arc runs from
			# the side before it to the side after it
			var a: float = starts[c] + PI * 0.5 * (1.0 - float(s) / 6.0)
			pts.append(centres[c] + Vector2(cos(a), sin(a)) * k)
	var sh := PackedVector2Array()
	for p in pts:
		sh.append(p + Vector2(3, 5))
	ci.draw_colored_polygon(sh, Color(0.05, 0.12, 0.15, 0.32))
	ci.draw_colored_polygon(pts, PAPER)
	ci.draw_polyline(_closed(pts), Color(INK, 0.85), 2.2, true)
	var inner := PackedVector2Array()
	var rc := (r.position + r.end) * 0.5
	for p in pts:
		inner.append(rc + (p - rc) * Vector2((r.size.x - 14.0) / r.size.x, (r.size.y - 14.0) / r.size.y))
	ci.draw_polyline(_closed(inner), Color(INK, 0.5), 1.0, true)
	# scrolled ends: a curl each side of the plate
	for sx in [-1.0, 1.0]:
		var base := Vector2(r.position.x - 2.0 if sx < 0 else r.end.x + 2.0, r.position.y + r.size.y * 0.5)
		var curl := PackedVector2Array()
		for i in 22:
			var t := float(i) / 21.0
			var a := t * TAU * 1.15
			var rr := 15.0 * (1.0 - t * 0.75)
			curl.append(base + Vector2(sx * (12.0 + rr * cos(a + PI)) , rr * sin(a + PI) * 0.9))
		ci.draw_polyline(curl, Color(INK, 0.8), 2.0, true)
		ci.draw_line(base + Vector2(0, -r.size.y * 0.32), base + Vector2(sx * 8.0, -r.size.y * 0.18), Color(INK, 0.6), 1.5, true)
		ci.draw_line(base + Vector2(0, r.size.y * 0.32), base + Vector2(sx * 8.0, r.size.y * 0.18), Color(INK, 0.6), 1.5, true)


static func label_card(ci: CanvasItem, r: Rect2, seed: int = 1) -> void:
	## A museum specimen label: bright card, a thin black rule inset, a
	## heavier rule outside it, a crease where it was folded to post.
	ci.draw_colored_polygon(rough_rect(Rect2(r.position + Vector2(3, 5), r.size), seed + 3, 0.8), Color(0.05, 0.12, 0.15, 0.3))
	ci.draw_colored_polygon(rough_rect(r, seed, 0.6), Color("#f7f2e4"))
	ci.draw_rect(r.grow(-6), Color(INK, 0.85), false, 2.0)
	ci.draw_rect(r.grow(-10), Color(INK, 0.5), false, 1.0)
	var fy := r.position.y + r.size.y * 0.62
	ci.draw_line(Vector2(r.position.x + 2, fy), Vector2(r.end.x - 2, fy + 2), Color(1, 1, 1, 0.5), 1.5)
	ci.draw_line(Vector2(r.position.x + 2, fy + 1.5), Vector2(r.end.x - 2, fy + 3.5), Color(0.4, 0.3, 0.2, 0.12), 1.2)


static func folded(ci: CanvasItem, r: Rect2, seed: int = 1) -> void:
	## A chart folded in four and opened out: two creases crossing, the
	## panels each a slightly different tone, corners softened with wear.
	ci.draw_colored_polygon(rough_rect(Rect2(r.position + Vector2(5, 8), r.size), seed + 7, 1.6), Color(0.05, 0.12, 0.15, 0.35))
	var cx := r.position.x + r.size.x * (0.5 + 0.03 * jitter(seed, 2))
	var cy := r.position.y + r.size.y * (0.5 + 0.04 * jitter(seed, 3))
	var quads := [Rect2(r.position, Vector2(cx - r.position.x, cy - r.position.y)),
		Rect2(Vector2(cx, r.position.y), Vector2(r.end.x - cx, cy - r.position.y)),
		Rect2(Vector2(r.position.x, cy), Vector2(cx - r.position.x, r.end.y - cy)),
		Rect2(Vector2(cx, cy), Vector2(r.end.x - cx, r.end.y - cy))]
	for i in 4:
		var q: Rect2 = quads[i]
		ci.draw_colored_polygon(rough_rect(q, seed + i, 1.0, 4), PAPER.darkened(0.012 * i + 0.01 * jitter(seed, i + 9)))
	ci.draw_line(Vector2(cx, r.position.y + 2), Vector2(cx, r.end.y - 2), Color(0.4, 0.3, 0.2, 0.22), 2.0)
	ci.draw_line(Vector2(cx + 2, r.position.y + 2), Vector2(cx + 2, r.end.y - 2), Color(1, 1, 1, 0.45), 1.5)
	ci.draw_line(Vector2(r.position.x + 2, cy), Vector2(r.end.x - 2, cy), Color(0.4, 0.3, 0.2, 0.2), 2.0)
	ci.draw_line(Vector2(r.position.x + 2, cy + 2), Vector2(r.end.x - 2, cy + 2), Color(1, 1, 1, 0.4), 1.5)
	var b1 := r.grow(-12)
	ci.draw_polyline(_closed(rough_rect(b1, seed + 3, 0.5, 4)), Color(INK, 0.7), 1.6)
	# a faint compass rose in one panel, as on the real thing
	var rc := Vector2(r.end.x - r.size.x * 0.17, r.end.y - r.size.y * 0.24)
	var rr := minf(r.size.x, r.size.y) * 0.12
	for k in 8:
		var a := k * TAU / 8.0
		var ln := rr if k % 2 == 0 else rr * 0.55
		ci.draw_line(rc, rc + Vector2(cos(a), sin(a)) * ln, Color(INK, 0.16), 1.5, true)
	ci.draw_arc(rc, rr * 0.7, 0.0, TAU, 32, Color(INK, 0.14), 1.2, true)


static func plate(ci: CanvasItem, r: Rect2, seed: int = 1) -> void:
	## A natural-history plate: cream card, an engraved double border with
	## a hatched band between the rules, small corner ornaments.
	ci.draw_colored_polygon(rough_rect(Rect2(r.position + Vector2(4, 6), r.size), seed + 5, 1.0), Color(0.05, 0.12, 0.15, 0.32))
	ci.draw_colored_polygon(rough_rect(r, seed, 0.8), Color("#f4ecd6"))
	var o := r.grow(-8)
	var i := r.grow(-15)
	ci.draw_rect(o, Color(INK, 0.85), false, 1.8)
	ci.draw_rect(i, Color(INK, 0.7), false, 1.0)
	var step := 5.0
	var x := o.position.x
	while x < o.end.x:
		ci.draw_line(Vector2(x, o.position.y + 1), Vector2(x + 4, i.position.y - 1), Color(INK, 0.22), 1.0)
		ci.draw_line(Vector2(x, i.end.y + 1), Vector2(x + 4, o.end.y - 1), Color(INK, 0.22), 1.0)
		x += step
	for c in [o.position, Vector2(o.end.x, o.position.y), o.end, Vector2(o.position.x, o.end.y)]:
		ci.draw_circle(c, 4.0, Color("#f4ecd6"))
		ci.draw_arc(c, 4.0, 0.0, TAU, 12, Color(INK, 0.8), 1.2, true)


static func pegboard(ci: CanvasItem, r: Rect2) -> void:
	## The chandler's pegboard: weathered painted boards with a grid of holes.
	ci.draw_rect(r, Color("#3d5a55"))
	var y := r.position.y
	var k := 0
	while y < r.end.y:
		var h := 58.0
		var tone := Color("#46635d").darkened(0.06 * jitter(77, k))
		ci.draw_rect(Rect2(r.position.x, y, r.size.x, h - 2.0), tone)
		ci.draw_line(Vector2(r.position.x, y + h - 2.0), Vector2(r.end.x, y + h - 2.0), Color(0.05, 0.12, 0.15, 0.5), 2.0)
		k += 1
		y += h
	var gx := r.position.x + 24.0
	while gx < r.end.x - 10.0:
		var gy := r.position.y + 22.0
		while gy < r.end.y - 10.0:
			ci.draw_circle(Vector2(gx, gy), 3.2, Color(0.04, 0.1, 0.12, 0.75))
			gy += 36.0
		gx += 36.0
