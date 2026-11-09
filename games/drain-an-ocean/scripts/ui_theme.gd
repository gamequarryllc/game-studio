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
		ty = -size * 0.28
	var tw := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	ci.draw_string(font, Vector2(-tw * 0.5, ty + size * 0.36), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)
	if sub != "":
		var ss := int(size * 0.55)
		var sw := body().get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
		ci.draw_string(body(), Vector2(-sw * 0.5, ty + size * 0.36 + ss * 1.25), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, ss, Color(col, col.a * 0.85))
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
