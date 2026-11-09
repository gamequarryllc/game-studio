class_name Craft
extends RefCounted
## The game's look, from the fiction: cut-out cardboard tags held on with masking
## tape. Headers are stencilled like the markings on a shipping box (Saira Stencil
## One, OFL); numbers and the chain stamp are thick marker (Permanent Marker,
## Apache 2.0); notes are handwriting (Patrick Hand, OFL). Icons are drawn for the
## game (icons/*.svg, built by tools/make_icons.py). See the art bible in NOTES.md.

const MARKER_PATH := "res://fonts/PermanentMarker-Regular.ttf"
const HAND_PATH := "res://fonts/PatrickHand-Regular.ttf"
const STENCIL_PATH := "res://fonts/SairaStencilOne-Regular.ttf"

# The palette (art bible).
const KRAFT := Color("#c89a64")       # cardboard: panels, tags, the city
const KRAFT_DARK := Color("#8e6236")  # cut edges, shadows, quiet text on paper
const INK := Color("#221d1b")         # marker lettering and outlines
const TAPE := Color("#e8d8a8")        # masking tape, highlights
const STEEL := Color("#5c6b7a")       # warehouse blue-grey: cool backgrounds
const FLAME := Color("#ef7a28")       # fire: the one hot colour, for actions
const PAPER := Color("#f7f1e3")       # paper labels and price tags
# Helpers derived from the palette.
const KRAFT_PALE := Color("#dcbb8a")
const FLAME_DEEP := Color("#c4511c")
const GREEN_INK := Color("#3d7a3a")
const RED_INK := Color("#c23a2b")

static var _marker: Font
static var _hand: Font
static var _stencil: Font
static var _icons := {}
static var _icons3d := {}


static func clear() -> void:
	_marker = null
	_hand = null
	_stencil = null
	_icons.clear()
	_icons3d.clear()


static func install_fonts() -> void:
	if _marker != null:
		return
	var m := FontVariation.new()
	m.base_font = load(MARKER_PATH)
	m.spacing_glyph = 1
	_marker = m
	var h := FontVariation.new()
	h.base_font = load(HAND_PATH)
	_hand = h
	var st := FontVariation.new()
	st.base_font = load(STENCIL_PATH)
	st.spacing_glyph = 2
	_stencil = st
	ThemeDB.fallback_font = h
	ThemeDB.get_default_theme().default_font = h


static func marker() -> Font:
	install_fonts()
	return _marker


static func hand() -> Font:
	install_fonts()
	return _hand


static func stencil() -> Font:
	## Box markings: headers, tabs, titles, button words.
	install_fonts()
	return _stencil


static func icon(name: String) -> Texture2D:
	if not _icons.has(name):
		var path := "res://icons/%s.svg" % name
		_icons[name] = load(path) if ResourceLoader.exists(path) else null
	return _icons[name]


static func icon3d(name: String) -> Texture2D:
	## The same icon with mipmaps, for drawing in the 3D world (finds, paper citizens).
	if not _icons3d.has(name):
		var t := icon(name)
		if t == null:
			return null
		var img := t.get_image()
		if img.is_compressed():
			img.decompress()
		img.generate_mipmaps()
		_icons3d[name] = ImageTexture.create_from_image(img)
	return _icons3d[name]


# =====================================================================================
# Styles
# =====================================================================================
static func card(fill: Color = KRAFT, seed: int = 1, tape: int = 0, hole: bool = false) -> CardStyle:
	var s := CardStyle.new()
	s.fill = fill
	s.edge = fill.darkened(0.42) if fill.get_luminance() > 0.5 else fill.darkened(0.3)
	s.seed = seed
	s.tape_corners = tape
	s.hole = hole
	s.notch = hole
	s.lines = fill.get_luminance() < 0.75
	if hole:
		s.content_margin_left = 30
	return s


static func paper(seed: int = 1, tape: int = 0, hole: bool = false) -> CardStyle:
	var s := card(PAPER, seed, tape, hole)
	s.edge = Color(0.62, 0.55, 0.45)
	s.lines = false
	return s


static func tag_button(b: Button, fill: Color = KRAFT, size: int = 26, seed: int = 3, font: Font = null) -> void:
	## A cardboard tag of a button: stencilled words (or marker numbers), pushed in when pressed.
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", font if font != null else stencil())
	b.add_theme_font_size_override("font_size", size)
	var normal := card(fill, seed)
	normal.content_margin_left = 18
	normal.content_margin_right = 18
	var hover := card(fill.lightened(0.08), seed)
	hover.content_margin_left = 18
	hover.content_margin_right = 18
	var pressed := card(fill.darkened(0.08), seed)
	pressed.shadow = Vector2(1, 1)
	pressed.content_margin_left = 19
	pressed.content_margin_right = 17
	pressed.content_margin_top = 12
	pressed.content_margin_bottom = 8
	var disabled := card(fill.lerp(Color(0.62, 0.6, 0.57), 0.55), seed)
	disabled.shadow_alpha = 0.12
	disabled.content_margin_left = 18
	disabled.content_margin_right = 18
	b.add_theme_stylebox_override("normal", normal)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", pressed)
	b.add_theme_stylebox_override("hover_pressed", pressed)
	b.add_theme_stylebox_override("disabled", disabled)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	var text := INK if fill.get_luminance() > 0.35 else PAPER
	for k in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(k, text)
	b.add_theme_color_override("font_disabled_color", Color(INK, 0.45))
	b.add_theme_constant_override("h_separation", 8)
	b.add_theme_constant_override("icon_max_width", int(size * 1.35))


static func price_button(b: Button, seed: int = 5) -> void:
	## A paper price tag on a string (the buy buttons in the shop box).
	tag_button(b, PAPER, 24, seed, marker())
	for k in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		var s := b.get_theme_stylebox(k) as CardStyle
		s.hole = true
		s.notch = true
		s.lines = false
		s.edge = Color(0.6, 0.53, 0.43)
		s.content_margin_left = 30
		if k == "hover":
			s.fill = Color("#fff9ea")
		elif k == "disabled":
			s.fill = Color(0.82, 0.8, 0.76)


static func hot(b: Button, on: bool) -> void:
	## Mark a buy button you can afford: a stripe of orange highlighter across the tag.
	var s := b.get_theme_stylebox("normal") as CardStyle
	if s == null:
		return
	s.fill = Color("#ffd9a8") if on else PAPER


static func label(size: int, color: Color = INK, font: Font = null, outline: int = 0, outline_color: Color = PAPER) -> Label:
	var l := Label.new()
	l.add_theme_font_override("font", font if font != null else stencil())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if outline > 0:
		l.add_theme_color_override("font_outline_color", outline_color)
		l.add_theme_constant_override("outline_size", outline)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func body(size: int = 22, color: Color = INK) -> Label:
	var l := label(size, color, hand())
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


static func icon_rect(name: String, size: float) -> TextureRect:
	var t := TextureRect.new()
	t.texture = icon(name)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(size, size)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t


static func rich(size: int = 22, color: Color = INK) -> RichTextLabel:
	## Text that can carry [coin] icons inline (see coins_bb()).
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	r.add_theme_font_override("normal_font", hand())
	r.add_theme_font_override("bold_font", stencil())
	r.add_theme_font_size_override("normal_font_size", size)
	r.add_theme_font_size_override("bold_font_size", size)
	r.add_theme_color_override("default_color", color)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func number_font(text: String) -> Font:
	## Marker for numbers and prices, stencil for words.
	var t := text.strip_edges()
	if t != "" and (t[0] == "$" or t[0] == "+" or t[0].is_valid_int() or t[0] == "x"):
		return marker()
	return stencil()


static func coins_bb(text: String, size: int) -> String:
	## "[coin]" -> the drawn coin icon, sized to the text.
	return text.replace("[coin]", "[img=%dx%d]res://icons/coin.svg[/img]" % [size, size])


static func make_theme() -> Theme:
	install_fonts()
	var t := Theme.new()
	t.default_font = hand()
	t.default_font_size = 22
	t.set_color("font_color", "Label", INK)
	var grab := StyleBoxFlat.new()
	grab.bg_color = Color(KRAFT_DARK, 0.8)
	grab.set_corner_radius_all(3)
	t.set_stylebox("grabber", "VScrollBar", grab)
	t.set_stylebox("grabber_highlight", "VScrollBar", grab)
	t.set_stylebox("grabber_pressed", "VScrollBar", grab)
	var track := StyleBoxFlat.new()
	track.bg_color = Color(0, 0, 0, 0.12)
	track.content_margin_left = 8
	t.set_stylebox("scroll", "VScrollBar", track)
	return t
