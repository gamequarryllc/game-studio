class_name UiTheme
extends RefCounted
## The game's look: charcoal and ember. Dark rounded panels with a warm orange
## glow at the edges, chunky geometric lettering (Outfit), and the fire-keeper's
## own handwriting in the notebook (Nothing You Could Do). Everything is drawn
## with StyleBoxFlat, so there are no UI images to ship.

const EMOJI_FONT_PATH := "res://fonts/NotoColorEmoji-subset.ttf"
const BOLD_PATH := "res://fonts/Outfit-Bold.ttf"
const REGULAR_PATH := "res://fonts/Outfit-Regular.ttf"
const HAND_PATH := "res://fonts/NothingYouCouldDo-Regular.ttf"

const CHARCOAL := Color(0.075, 0.062, 0.068)
const CHARCOAL_2 := Color(0.14, 0.115, 0.115)
const CHARCOAL_3 := Color(0.2, 0.165, 0.16)
const EMBER := Color(1.0, 0.47, 0.12)
const EMBER_HOT := Color(1.0, 0.74, 0.3)
const EMBER_DEEP := Color(0.78, 0.24, 0.08)
const CREAM := Color(1.0, 0.94, 0.85)
const ASH := Color(0.66, 0.6, 0.57)
const SOOT := Color(0.04, 0.03, 0.035)
const CURSE := Color(0.62, 0.42, 0.95)
const MEADOW := Color(0.52, 0.86, 0.42)

static var _bold: Font
static var _regular: Font
static var _hand: Font
static var _soft_dot: Texture2D


static func clear() -> void:
	## Let go of the cached fonts and textures (on quit, so nothing leaks).
	_bold = null
	_regular = null
	_hand = null
	_soft_dot = null


static func install_fonts() -> void:
	## Emoji are a fallback of every font, so any Label, Label3D or draw_string can show them.
	if _bold != null:
		return
	var fallbacks: Array[Font] = []
	if ResourceLoader.exists(EMOJI_FONT_PATH):
		var emoji := load(EMOJI_FONT_PATH) as FontFile
		emoji.fixed_size_scale_mode = TextServer.FIXED_SIZE_SCALE_ENABLED
		fallbacks.append(emoji)
	var bold := FontVariation.new()
	bold.base_font = load(BOLD_PATH)
	bold.fallbacks = fallbacks
	_bold = bold
	var regular := FontVariation.new()
	regular.base_font = load(REGULAR_PATH)
	regular.fallbacks = fallbacks
	_regular = regular
	var hand := FontVariation.new()
	hand.base_font = load(HAND_PATH)
	hand.fallbacks = fallbacks
	hand.spacing_glyph = 1
	_hand = hand
	ThemeDB.fallback_font = bold
	ThemeDB.get_default_theme().default_font = bold


static func bold() -> Font:
	install_fonts()
	return _bold


static func regular() -> Font:
	install_fonts()
	return _regular


static func hand() -> Font:
	install_fonts()
	return _hand


static func panel(bg: Color = Color(CHARCOAL, 0.86), radius: int = 18, border: Color = Color(EMBER, 0.55),
		glow: float = 0.22, pad: float = 14.0) -> StyleBoxFlat:
	## A dark rounded panel whose rim glows like a coal.
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(radius)
	s.border_color = border
	s.set_border_width_all(2 if border.a > 0.0 else 0)
	s.shadow_color = Color(EMBER.r, EMBER.g * 0.8, EMBER.b, glow)
	s.shadow_size = 10 if glow > 0.0 else 0
	s.content_margin_left = pad
	s.content_margin_right = pad
	s.content_margin_top = pad * 0.6
	s.content_margin_bottom = pad * 0.6
	s.anti_aliasing = true
	return s


static func ember_button(b: Button, color: Color = EMBER, font_size: int = 24) -> void:
	## A glowing coal of a button: a bright face with a darker lip underneath.
	b.focus_mode = Control.FOCUS_NONE   # Space (jump) or Enter must never press a button
	b.add_theme_font_override("font", bold())
	b.add_theme_font_size_override("font_size", font_size)
	b.add_theme_stylebox_override("normal", _button_box(color, false))
	b.add_theme_stylebox_override("hover", _button_box(color.lightened(0.1), false))
	b.add_theme_stylebox_override("pressed", _button_box(color.darkened(0.12), true))
	b.add_theme_stylebox_override("disabled", _button_box(CHARCOAL_3.lerp(color, 0.15), false, true))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	var text := SOOT if color.get_luminance() > 0.55 else CREAM
	b.add_theme_color_override("font_color", text)
	b.add_theme_color_override("font_hover_color", text)
	b.add_theme_color_override("font_pressed_color", text)
	b.add_theme_color_override("font_disabled_color", Color(ASH, 0.8))


static func _button_box(color: Color, pressed: bool, disabled: bool = false) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(16)
	s.border_color = color.darkened(0.45) if not disabled else Color(0, 0, 0, 0.3)
	s.border_width_bottom = 2 if pressed else 6
	s.border_width_top = 2
	s.border_width_left = 2
	s.border_width_right = 2
	s.content_margin_left = 18
	s.content_margin_right = 18
	s.content_margin_top = 8 + (4 if pressed else 0)
	s.content_margin_bottom = 8
	if not disabled:
		s.shadow_color = Color(color.r, color.g * 0.7, color.b * 0.5, 0.35)
		s.shadow_size = 8
	s.anti_aliasing = true
	return s


static func bar_styles(bar: ProgressBar, fill: Color = EMBER) -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(SOOT, 0.85)
	bg.set_corner_radius_all(10)
	bg.border_color = Color(EMBER, 0.35)
	bg.set_border_width_all(2)
	var f := StyleBoxFlat.new()
	f.bg_color = fill
	f.set_corner_radius_all(8)
	f.border_color = fill.lightened(0.35)
	f.border_width_top = 3
	f.shadow_color = Color(fill, 0.45)
	f.shadow_size = 6
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", f)


static func label(size: int, color: Color = CREAM, font: Font = null, outline: int = 0) -> Label:
	var l := Label.new()
	l.add_theme_font_override("font", font if font != null else bold())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if outline > 0:
		l.add_theme_color_override("font_outline_color", SOOT)
		l.add_theme_constant_override("outline_size", outline)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func make_theme() -> Theme:
	install_fonts()
	var t := Theme.new()
	t.default_font = bold()
	t.default_font_size = 22
	t.set_color("font_color", "Label", CREAM)
	t.set_color("font_outline_color", "Label", SOOT)
	t.set_stylebox("normal", "Button", _button_box(EMBER, false))
	t.set_stylebox("hover", "Button", _button_box(EMBER.lightened(0.1), false))
	t.set_stylebox("pressed", "Button", _button_box(EMBER.darkened(0.12), true))
	t.set_stylebox("disabled", "Button", _button_box(CHARCOAL_3, false, true))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_color("font_color", "Button", SOOT)
	t.set_color("font_hover_color", "Button", SOOT)
	t.set_color("font_pressed_color", "Button", SOOT)
	t.set_color("font_disabled_color", "Button", ASH)
	var grab := StyleBoxFlat.new()
	grab.bg_color = Color(EMBER, 0.6)
	grab.set_corner_radius_all(6)
	t.set_stylebox("grabber", "VScrollBar", grab)
	t.set_stylebox("grabber_highlight", "VScrollBar", grab)
	t.set_stylebox("grabber_pressed", "VScrollBar", grab)
	var track := StyleBoxFlat.new()
	track.bg_color = Color(0, 0, 0, 0.25)
	track.set_corner_radius_all(6)
	track.content_margin_left = 8
	t.set_stylebox("scroll", "VScrollBar", track)
	return t


static func soft_dot() -> Texture2D:
	## A soft round blob for particles. Built from an Image with mipmaps (a
	## GradientTexture2D can render particles black on WebGL).
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


static func sign_label(l: Label3D, color: Color = EMBER_HOT) -> void:
	l.font = bold()
	l.modulate = color
	l.outline_modulate = SOOT
