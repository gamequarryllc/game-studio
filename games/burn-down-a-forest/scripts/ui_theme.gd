class_name UiTheme
extends RefCounted
## The game's UI look (art bible in NOTES.md): a field notebook plus burnt-wood
## signs. Charred planks with uneven saw-cut ends and a hard ink shadow for the
## HUD; cream paper with grain, ruled lines and scorched edges for the notebook;
## price tags on tape, ink stamps to buy. No glows anywhere. Ember orange only
## on the main action.
##
## Type: IM Fell English SC (titles and numbers), Alegreya Sans (body), Caveat
## Brush (the keeper's handwriting, never under 22 px). All SIL OFL, licences
## in fonts/. Icons: ui/icons/*.svg, drawn by art/icons/make_icons.py.

const DISPLAY_PATH := "res://fonts/IMFellEnglishSC-Regular.ttf"
const BODY_PATH := "res://fonts/AlegreyaSans-Medium.ttf"
const BODY_BOLD_PATH := "res://fonts/AlegreyaSans-Bold.ttf"
const BODY_REGULAR_PATH := "res://fonts/AlegreyaSans-Regular.ttf"
const HAND_PATH := "res://fonts/CaveatBrush-Regular.ttf"

# --- Palette (sRGB) -------------------------------------------------------------------
const PAPER := Color("#EFE3C8")
const PAPER_SHADE := Color("#DCCBA6")
const INK := Color("#2E1E14")
const CHAR := Color("#1A1310")
const PLANK := Color("#2B1F1A")
const PLANK_HI := Color("#4C392D")
const EMBER := Color("#E8642C")
const STAMP := Color("#C24A22")           # ember ink on paper (3.8:1 on the page; pure ember is 2.6:1)
const CORE := Color("#FFC15E")
const CREAM := Color("#EFE3C8")
const ASH := Color("#B3A592")
const HAND_INK := Color("#2F3B5C")        # the keeper writes in blue-black ink
const TAG := Color("#E6D2A4")
const TAPE := Color(0.95, 0.92, 0.82, 0.62)
const RIBBON := Color("#A8322A")
const LEATHER := Color("#4A2C1E")
const SAGE := Color("#8FAE5E")
const POPPY := Color("#D9483B")
const MINT := Color("#9FF0D0")
const SCORCH := Color("#5A3420")
const STAMP_OFF := Color("#9A8E80")
# kept for older call sites
const CHARCOAL := CHAR
const EMBER_HOT := CORE
const SOOT := INK
const MEADOW := SAGE

# --- Type scale (px at 1280x720) -------------------------------------------------------
const T_SMALL := 16
const T_BODY := 19
const T_LABEL := 22
const T_TITLE := 28
const T_BIG := 36
const T_HUGE := 48

static var _display: Font
static var _body: Font
static var _bold: Font
static var _regular: Font
static var _hand: Font
static var _numbers: Font
static var _soft_dot: Texture2D
static var _grain: Texture2D
static var _icons := {}


static func clear() -> void:
	## Let go of the cached fonts and textures (on quit, so nothing leaks).
	_display = null
	_body = null
	_bold = null
	_regular = null
	_hand = null
	_numbers = null
	_soft_dot = null
	_grain = null
	_icons.clear()


static func install_fonts() -> void:
	if _body != null:
		return
	_display = load(DISPLAY_PATH)
	_body = load(BODY_PATH)
	_bold = load(BODY_BOLD_PATH)
	_regular = load(BODY_REGULAR_PATH)
	var hand := FontVariation.new()
	hand.base_font = load(HAND_PATH)
	hand.spacing_glyph = 0
	_hand = hand
	# Numbers read at a glance (the HUD counter): Alegreya Sans with lining,
	# tabular figures (IM Fell's old-style figures make 1.00M read like I.ooM).
	var nums := FontVariation.new()
	nums.base_font = load(BODY_BOLD_PATH)
	var ts := TextServerManager.get_primary_interface()
	nums.opentype_features = {ts.name_to_tag("lnum"): 1, ts.name_to_tag("tnum"): 1}
	_numbers = nums
	ThemeDB.fallback_font = _body
	ThemeDB.get_default_theme().default_font = _body


static func display() -> Font:
	install_fonts()
	return _display


static func body() -> Font:
	install_fonts()
	return _body


static func bold() -> Font:
	install_fonts()
	return _bold


static func regular() -> Font:
	install_fonts()
	return _regular


static func numbers() -> Font:
	install_fonts()
	return _numbers


static func hand() -> Font:
	install_fonts()
	return _hand


static func icon(name: String) -> Texture2D:
	if not _icons.has(name):
		var path := "res://ui/icons/%s.svg" % name
		_icons[name] = load(path) if ResourceLoader.exists(path) else null
	return _icons[name]


static func icon_bb(name: String, size: int) -> String:
	## An icon inline in a RichTextLabel.
	return "[img=%dx%d]res://ui/icons/%s.svg[/img]" % [size, size, name]


# --- Labels and buttons --------------------------------------------------------------
static func label(size: int, color: Color = CREAM, font: Font = null, outline: int = 0) -> Label:
	var l := Label.new()
	l.add_theme_font_override("font", font if font != null else bold())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if outline > 0:
		l.add_theme_color_override("font_outline_color", INK)
		l.add_theme_constant_override("outline_size", outline)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func rich(size: int, color: Color = CREAM, font: Font = null, outline: int = 0) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.autowrap_mode = TextServer.AUTOWRAP_OFF
	r.add_theme_font_override("normal_font", font if font != null else bold())
	r.add_theme_font_size_override("normal_font_size", size)
	r.add_theme_color_override("default_color", color)
	if outline > 0:
		r.add_theme_color_override("font_outline_color", INK)
		r.add_theme_constant_override("outline_size", outline)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func plain_button(b: BaseButton) -> void:
	## A button that draws nothing itself (its look comes from a drawn child or panel).
	b.focus_mode = Control.FOCUS_NONE   # Space (jump) or Enter must never press a button
	for s in ["normal", "hover", "pressed", "disabled", "focus", "hover_pressed"]:
		b.add_theme_stylebox_override(s, StyleBoxEmpty.new())


static func plank_button(b: Button, seed: int, font_size: int = T_LABEL, fill: Color = PLANK) -> void:
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", bold())
	b.add_theme_font_size_override("font_size", font_size)
	var n := PlankBox.new(seed, fill)
	var h := PlankBox.new(seed, fill.lightened(0.08))
	var p := PlankBox.new(seed, fill.darkened(0.1))
	p.pressed = true
	var d := PlankBox.new(seed, fill.lerp(Color("#3A3330"), 0.6))
	for k in [["normal", n], ["hover", h], ["pressed", p], ["hover_pressed", p], ["disabled", d]]:
		b.add_theme_stylebox_override(k[0], k[1])
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(c, CREAM)
	b.add_theme_color_override("font_disabled_color", Color(ASH, 0.7))
	b.add_theme_constant_override("icon_max_width", int(font_size * 1.7))
	b.add_theme_constant_override("h_separation", 8)


static func make_theme() -> Theme:
	install_fonts()
	var t := Theme.new()
	t.default_font = body()
	t.default_font_size = T_BODY
	t.set_color("font_color", "Label", CREAM)
	t.set_color("font_outline_color", "Label", INK)
	var grab := StyleBoxFlat.new()
	grab.bg_color = Color(INK, 0.55)
	grab.set_corner_radius_all(3)
	grab.content_margin_left = 6
	for s in ["grabber", "grabber_highlight", "grabber_pressed"]:
		t.set_stylebox(s, "VScrollBar", grab)
	var track := StyleBoxFlat.new()
	track.bg_color = Color(INK, 0.08)
	track.content_margin_left = 6
	t.set_stylebox("scroll", "VScrollBar", track)
	return t


# --- Textures ---------------------------------------------------------------------------
static func soft_dot() -> Texture2D:
	## A soft round blob for smoke and particles. Built from an Image with mipmaps
	## (a GradientTexture2D can render particles black on WebGL).
	if _soft_dot == null:
		var n := 64
		var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
		for y in n:
			for x in n:
				var d := Vector2(x + 0.5 - n * 0.5, y + 0.5 - n * 0.5).length() / (n * 0.5)
				var a := clampf(1.0 - d, 0.0, 1.0)
				img.set_pixel(x, y, Color(1, 1, 1, a * a * (3.0 - 2.0 * a)))
		img.generate_mipmaps()
		_soft_dot = ImageTexture.create_from_image(img)
	return _soft_dot


static func grain() -> Texture2D:
	## Paper grain and wood fibre: a tiling noise, drawn over paper and planks.
	if _grain == null:
		var n := 128
		var noise := FastNoiseLite.new()
		noise.seed = 7
		noise.frequency = 0.09
		noise.fractal_octaves = 3
		var fine := FastNoiseLite.new()
		fine.seed = 11
		fine.frequency = 0.6
		var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
		for y in n:
			for x in n:
				# seamless: blend the four wrapped samples
				var fx := float(x) / n
				var fy := float(y) / n
				var a := noise.get_noise_2d(x, y) * (1 - fx) * (1 - fy) + noise.get_noise_2d(x - n, y) * fx * (1 - fy) \
					+ noise.get_noise_2d(x, y - n) * (1 - fx) * fy + noise.get_noise_2d(x - n, y - n) * fx * fy
				var f := fine.get_noise_2d(x, y)
				var v := clampf(0.5 + a * 0.6 + f * 0.25, 0.0, 1.0)
				img.set_pixel(x, y, Color(v, v, v, 1.0))
		_grain = ImageTexture.create_from_image(img)
	return _grain


static func sign_label(l: Label3D, color: Color = CORE) -> void:
	l.font = display()
	l.modulate = color
	l.outline_modulate = INK


# =====================================================================================
# Drawn pieces
# =====================================================================================
static func wobble_line(ci: RID, from: Vector2, to: Vector2, color: Color, width: float, rng: RandomNumberGenerator,
		amp: float = 1.0, seg: int = 6) -> void:
	var segs := PackedVector2Array()
	wobble_segments(segs, from, to, rng, amp, seg)
	RenderingServer.canvas_item_add_multiline(ci, segs, PackedColorArray([color]), width)


static func wobble_segments(out: PackedVector2Array, from: Vector2, to: Vector2, rng: RandomNumberGenerator,
		amp: float = 1.0, seg: int = 6) -> void:
	## Appends a wobbly line as segment pairs (for one batched multiline call).
	var n := (to - from).normalized().orthogonal()
	var prev := from
	for k in range(1, seg + 1):
		var t := float(k) / seg
		var off := 0.0 if k == seg else rng.randf_range(-amp, amp)
		var p := from.lerp(to, t) + n * off
		out.append(prev)
		out.append(p)
		prev = p


static func dashed(ci: RID, from: Vector2, to: Vector2, color: Color, width: float, dash: float, gap: float) -> void:
	var length := from.distance_to(to)
	var d := (to - from) / maxf(length, 0.001)
	var t := 0.0
	while t < length:
		var e := minf(t + dash, length)
		RenderingServer.canvas_item_add_line(ci, from + d * t, from + d * e, color, width, true)
		t = e + gap


class PlankBox:
	## A charred plank: saw-cut ends that never come out straight, wood grain,
	## ends darkened by fire, and a hard 3px ink shadow (no glow).
	extends StyleBox
	var seed := 1
	var fill := UiTheme.PLANK
	var jag := 9.0
	var shadow := Vector2(3, 4)
	var pressed := false
	var grain_alpha := 0.35

	func _init(s: int = 1, f: Color = UiTheme.PLANK, pad_x: float = 22.0, pad_y: float = 10.0) -> void:
		seed = s
		fill = f
		content_margin_left = pad_x
		content_margin_right = pad_x
		content_margin_top = pad_y
		content_margin_bottom = pad_y + 2.0

	func outline(rect: Rect2) -> PackedVector2Array:
		var rng := RandomNumberGenerator.new()
		rng.seed = seed
		var pts := PackedVector2Array()
		var r := rect
		var j := minf(jag, r.size.y * 0.35)
		# top edge, left to right, with a gentle sag
		var steps := maxi(2, int(r.size.x / 70.0))
		for k in steps + 1:
			var t := float(k) / steps
			var x := lerpf(r.position.x + j * 0.6, r.end.x - j * 0.6, t)
			pts.append(Vector2(x, r.position.y + rng.randf_range(-1.0, 1.5)))
		# right end: a jagged saw cut
		var rn := 4
		for k in range(1, rn):
			var t := float(k) / rn
			pts.append(Vector2(r.end.x - rng.randf_range(0.0, j), lerpf(r.position.y, r.end.y, t)))
		for k in steps + 1:
			var t := float(k) / steps
			var x := lerpf(r.end.x - j * 0.4, r.position.x + j * 0.4, t)
			pts.append(Vector2(x, r.end.y + rng.randf_range(-1.5, 1.0)))
		for k in range(1, rn):
			var t := float(k) / rn
			pts.append(Vector2(r.position.x + rng.randf_range(0.0, j), lerpf(r.end.y, r.position.y, t)))
		return pts

	func _draw(ci: RID, rect: Rect2) -> void:
		var r := rect
		if pressed:
			r.position += Vector2(2, 3)
		var pts := outline(r)
		if not pressed:
			var sh := PackedVector2Array()
			for p in pts:
				sh.append(p + shadow)
			RenderingServer.canvas_item_add_polygon(ci, sh, PackedColorArray([UiTheme.INK]))
		# the plank, lighter along the top edge
		var cols := PackedColorArray()
		for p in pts:
			var t := clampf((p.y - r.position.y) / maxf(r.size.y, 1.0), 0.0, 1.0)
			cols.append(fill.lightened(0.06 * (1.0 - t)).darkened(0.12 * t))
		RenderingServer.canvas_item_add_polygon(ci, pts, cols)
		var rng := RandomNumberGenerator.new()
		rng.seed = seed * 31 + 7
		# grain: long wavy lines, kept clear of the ragged ends (one batched call)
		var lines := maxi(2, int(r.size.y / 9.0))
		var segs := PackedVector2Array()
		for k in lines:
			var y := r.position.y + r.size.y * (float(k) + 0.5 + rng.randf_range(-0.25, 0.25)) / lines
			var x0 := r.position.x + jag + rng.randf_range(0.0, r.size.x * 0.2)
			var x1 := r.end.x - jag - rng.randf_range(0.0, r.size.x * 0.2)
			if x1 - x0 > 20.0:
				UiTheme.wobble_segments(segs, Vector2(x0, y), Vector2(x1, y), rng, 1.2, 8)
		# a knot now and then
		if r.size.x > 160.0:
			var kc := Vector2(r.position.x + r.size.x * rng.randf_range(0.3, 0.75), r.position.y + r.size.y * rng.randf_range(0.3, 0.7))
			var ring := _ring(kc, Vector2(9, 5), 14)
			for k in ring.size() - 1:
				segs.append(ring[k])
				segs.append(ring[k + 1])
		if segs.size() >= 2:
			RenderingServer.canvas_item_add_multiline(ci, segs, PackedColorArray([Color(UiTheme.PLANK_HI, grain_alpha * fill.v * 4.0 + 0.12)]))
		# fire-darkened ends: the char fades in toward each cut
		var w := minf(r.size.x * 0.22, 46.0)
		var burnt := PackedColorArray()
		for p in pts:
			var e := minf(p.x - r.position.x, r.end.x - p.x)
			burnt.append(Color(UiTheme.CHAR, 0.8 * clampf(1.0 - e / w, 0.0, 1.0)))
		RenderingServer.canvas_item_add_polygon(ci, pts, burnt)
		# a thin bright edge along the top: the carved highlight
		var top := PackedVector2Array()
		for k in pts.size():
			if pts[k].y < r.position.y + 3.0 and pts[k].x > r.position.x + jag and pts[k].x < r.end.x - jag:
				top.append(pts[k] + Vector2(0, 1.5))
		if top.size() >= 2:
			RenderingServer.canvas_item_add_polyline(ci, top, PackedColorArray([Color(UiTheme.PLANK_HI.lightened(0.3), 0.5)]), 1.0, true)

	static func _ring(c: Vector2, r: Vector2, n: int) -> PackedVector2Array:
		var p := PackedVector2Array()
		for k in n + 1:
			var a := TAU * k / n
			p.append(c + Vector2(cos(a) * r.x, sin(a) * r.y))
		return p



class PaperBox:
	## A sheet of the notebook: cream paper with grain, optional ruled lines and
	## margin, edges scorched brown and a little torn.
	extends StyleBox
	var seed := 3
	var fill := UiTheme.PAPER
	var ruled := 0.0            # line spacing in px, 0 = plain
	var margin_line := -1.0     # x offset of the red margin line, < 0 = none
	var scorch := 1.0
	var tear := 2.0
	var shadow := Vector2(4, 5)
	var tape := false

	func _init(s: int = 3, pad: float = 22.0) -> void:
		seed = s
		content_margin_left = pad
		content_margin_right = pad
		content_margin_top = pad * 0.8
		content_margin_bottom = pad * 0.8

	func outline(rect: Rect2) -> PackedVector2Array:
		var rng := RandomNumberGenerator.new()
		rng.seed = seed
		var pts := PackedVector2Array()
		var corners := [rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]
		for c in 4:
			var a: Vector2 = corners[c]
			var b: Vector2 = corners[(c + 1) % 4]
			var n := maxi(3, int(a.distance_to(b) / 28.0))
			var nrm := (b - a).normalized().orthogonal()
			for k in n:
				var t := float(k) / n
				pts.append(a.lerp(b, t) + nrm * rng.randf_range(-tear, tear * 0.4))
		return pts

	func _draw(ci: RID, rect: Rect2) -> void:
		var pts := outline(rect)
		if shadow != Vector2.ZERO:
			var sh := PackedVector2Array()
			for p in pts:
				sh.append(p + shadow)
			RenderingServer.canvas_item_add_polygon(ci, sh, PackedColorArray([Color(UiTheme.INK, 0.85)]))
		RenderingServer.canvas_item_add_polygon(ci, pts, PackedColorArray([fill]))
		var g := UiTheme.grain()
		RenderingServer.canvas_item_add_texture_rect(ci, rect.grow(-2.0), g.get_rid(), true, Color(0.55, 0.45, 0.3, 0.11))
		if ruled > 0.0:
			var rules := PackedVector2Array()
			var y := rect.position.y + ruled * 1.6
			while y < rect.end.y - 6.0:
				rules.append(Vector2(rect.position.x + 6, y))
				rules.append(Vector2(rect.end.x - 6, y))
				y += ruled
			if rules.size() >= 2:
				RenderingServer.canvas_item_add_multiline(ci, rules, PackedColorArray([Color("#7C93A8", 0.28)]))
		if margin_line >= 0.0:
			var x := rect.position.x + margin_line
			RenderingServer.canvas_item_add_line(ci, Vector2(x, rect.position.y + 4), Vector2(x, rect.end.y - 4), Color(UiTheme.POPPY, 0.35), 1.2)
		if scorch > 0.0:
			# brown scorch creeping in from the edges, uneven
			var rng := RandomNumberGenerator.new()
			rng.seed = seed * 13
			var inner := PackedVector2Array()
			var c := rect.get_center()
			for p in pts:
				var d := (c - p).normalized()
				inner.append(p + d * (6.0 + rng.randf_range(0.0, 16.0) * scorch))
			# all the scorch quads in one triangle array (one draw call)
			var tp := PackedVector2Array()
			var tc := PackedColorArray()
			var idx := PackedInt32Array()
			var e := Color(UiTheme.SCORCH, 0.55 * scorch)
			var z := Color(UiTheme.SCORCH, 0.0)
			for k in pts.size():
				tp.append(pts[k])
				tc.append(e)
				tp.append(inner[k])
				tc.append(z)
			var n := pts.size()
			for k in n:
				var a := k * 2
				var b := ((k + 1) % n) * 2
				idx.append_array([a, b, b + 1, a, b + 1, a + 1])
			RenderingServer.canvas_item_add_triangle_array(ci, idx, tp, tc)
			RenderingServer.canvas_item_add_polyline(ci, pts + PackedVector2Array([pts[0]]), PackedColorArray([Color(UiTheme.SCORCH.darkened(0.4), 0.7 * scorch)]), 1.4, true)
		if tape:
			var w := minf(90.0, rect.size.x * 0.4)
			var tc := Vector2(rect.get_center().x + 10.0, rect.position.y)
			var tp := PackedVector2Array([tc + Vector2(-w * 0.5, -9), tc + Vector2(w * 0.5, -12), tc + Vector2(w * 0.5 + 2, 8), tc + Vector2(-w * 0.5 + 1, 11)])
			RenderingServer.canvas_item_add_polygon(ci, tp, PackedColorArray([UiTheme.TAPE]))


class TagBox:
	## A manila price tag with a punched hole and a strip of tape holding it on.
	extends StyleBox
	var seed := 5
	var fill := UiTheme.TAG
	var hole := true

	func _init(s: int = 5) -> void:
		seed = s
		content_margin_left = 26
		content_margin_right = 14
		content_margin_top = 6
		content_margin_bottom = 8

	func _draw(ci: RID, rect: Rect2) -> void:
		var r := rect
		var cut := minf(14.0, r.size.y * 0.42)
		var pts := PackedVector2Array([
			Vector2(r.position.x + cut, r.position.y), Vector2(r.end.x, r.position.y + 1), Vector2(r.end.x - 1, r.end.y),
			Vector2(r.position.x + cut, r.end.y - 1), Vector2(r.position.x, r.get_center().y)])
		var sh := PackedVector2Array()
		for p in pts:
			sh.append(p + Vector2(2, 3))
		RenderingServer.canvas_item_add_polygon(ci, sh, PackedColorArray([Color(UiTheme.INK, 0.9)]))
		RenderingServer.canvas_item_add_polygon(ci, pts, PackedColorArray([fill]))
		RenderingServer.canvas_item_add_texture_rect(ci, r.grow(-1.0), UiTheme.grain().get_rid(), true, Color(0.5, 0.4, 0.25, 0.12))
		RenderingServer.canvas_item_add_polyline(ci, pts + PackedVector2Array([pts[0]]), PackedColorArray([UiTheme.INK]), 1.6, true)
		if hole:
			var hc := Vector2(r.position.x + cut * 0.95, r.get_center().y)
			RenderingServer.canvas_item_add_circle(ci, hc, 3.6, UiTheme.INK)
			RenderingServer.canvas_item_add_circle(ci, hc, 2.0, Color(UiTheme.PAPER_SHADE, 0.9))
		# tape across the top right corner
		var tc := Vector2(r.end.x - 10, r.position.y + 2)
		var tp := PackedVector2Array([tc + Vector2(-16, -10), tc + Vector2(14, -4), tc + Vector2(8, 12), tc + Vector2(-20, 6)])
		RenderingServer.canvas_item_add_polygon(ci, tp, PackedColorArray([UiTheme.TAPE]))
