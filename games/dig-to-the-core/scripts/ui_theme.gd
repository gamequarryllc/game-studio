class_name UiTheme
extends RefCounted
## The look of every panel and button (see the art bible in NOTES.md). Each
## element's material follows its job:
##  - riveted brass for money and instruments (the money plate, the depth
##    gauge, the shop's title plate): RivetBox, the only thing with rivets;
##  - chipped vitreous enamel for signs (hints, prompts, layer banners, plain
##    buttons): EnamelBox;
##  - paper for things you read and buy (ledger cards with stamped prices, the
##    find's specimen card, the offer tag): PaperBox, TicketBox("stamp");
##  - a cream ticket with a red play stamp for "watch a short ad": TicketBox;
##  - blackened iron for the frames everything sits in. Lettering: Rye, a woodtype face like old
## mining-company signage, for signs and titles only; Zilla Slab for
## everything people read. Icons are the game's own SVGs in ui/icons/.

const DISPLAY_FONT_PATH := "res://fonts/Rye-Regular.woff2"
const BODY_FONT_PATH := "res://fonts/ZillaSlab-500.woff2"
const BOLD_FONT_PATH := "res://fonts/ZillaSlab-700.woff2"

# The palette (art bible): lamp amber, hoist brass, enamel cream, signal red,
# soot iron, verdigris, topsoil umber. The rest are tints of these.
const BRASS := Color(0.753, 0.541, 0.243)
const BRASS_LIGHT := Color(0.98, 0.84, 0.5)
const BRASS_DARK := Color(0.42, 0.28, 0.11)
const COPPER := Color(0.74, 0.4, 0.22)
const IRON := Color(0.15, 0.13, 0.12)
const IRON_LIGHT := Color(0.27, 0.24, 0.21)
const SOOT := Color(0.141, 0.11, 0.09)
const CREAM := Color(0.937, 0.89, 0.784)
const AMBER := Color(0.949, 0.71, 0.267)
const ENAMEL_RED := Color(0.71, 0.2, 0.165)
const LAMP_GREEN := Color(0.31, 0.639, 0.569)   # verdigris: "go" and "buy"
const UMBER := Color(0.42, 0.29, 0.18)
const DIM := Color(0.62, 0.58, 0.52)
const PAPER := Color(0.93, 0.88, 0.76)
const MANILA := Color(0.82, 0.72, 0.52)          # the shop's file-folder tabs
const INK := Color(0.2, 0.14, 0.09)              # text printed on paper

static var _soft_dot: Texture2D
static var _display: Font
static var _body: Font
static var _bold: Font
static var _icons := {}


static func install_fonts() -> void:
	if _display != null:
		return
	_body = load(BODY_FONT_PATH)
	_bold = load(BOLD_FONT_PATH)
	var display := FontVariation.new()
	display.base_font = load(DISPLAY_FONT_PATH)
	display.spacing_glyph = 1
	display.fallbacks = [_bold]
	_display = display
	ThemeDB.fallback_font = _body
	ThemeDB.get_default_theme().default_font = _body


static func display_font() -> Font:
	## Rye: signs, titles, zone names. Never for body text.
	install_fonts()
	return _display


static func body_font() -> Font:
	install_fonts()
	return _body


static func bold_font() -> Font:
	## Zilla Slab bold: numbers, buttons, short labels.
	install_fonts()
	return _bold


static func icon(name: String) -> Texture2D:
	## One of the game's own icons (ui/icons/<name>.svg, drawn by art/icons/make_icons.py).
	if not _icons.has(name):
		var path := "res://ui/icons/%s.svg" % name
		_icons[name] = load(path) if ResourceLoader.exists(path) else load("res://ui/icons/unknown.svg")
	return _icons[name]


static func is_brass(c: Color) -> bool:
	## Brass, amber and their tints: the only plates that get rivets.
	var h := c.h
	return c.s > 0.35 and h > 0.07 and h < 0.15 and c.v > 0.45


static func plate(color: Color = BRASS, rivets: bool = true, pad: Vector4 = Vector4(16, 10, 16, 12)) -> RivetBox:
	var b := RivetBox.new()
	b.color = color
	b.rivets = rivets and is_brass(color)
	b.content_margin_left = pad.x
	b.content_margin_top = pad.y
	b.content_margin_right = pad.z
	b.content_margin_bottom = pad.w
	return b


static func iron_panel(pad: float = 22.0) -> RivetBox:
	## A blackened iron panel with a bevelled iron frame (the shop, popups).
	var b := plate(Color(0.24, 0.21, 0.18), false, Vector4(pad, pad, pad, pad))
	b.inset = 7.0
	b.inset_color = IRON
	b.chamfer = 12.0
	return b


static func enamel(color: Color = CREAM, pad: Vector4 = Vector4(18, 8, 18, 10), seed: int = 0, edge: Color = Color(-1, 0, 0)) -> EnamelBox:
	var b := EnamelBox.new()
	b.color = color
	b.seed = seed
	if edge.r >= 0.0:
		b.edge = edge
	else:
		b.edge = SOOT if color.get_luminance() > 0.5 else CREAM
	b.content_margin_left = pad.x
	b.content_margin_top = pad.y
	b.content_margin_right = pad.z
	b.content_margin_bottom = pad.w
	return b


static func paper(pad: Vector4 = Vector4(18, 10, 18, 10), seed: int = 0, ledger: bool = false, color: Color = PAPER) -> PaperBox:
	var b := PaperBox.new()
	b.color = color
	b.seed = seed
	b.ledger = ledger
	b.content_margin_left = pad.x
	b.content_margin_top = pad.y
	b.content_margin_right = pad.z
	b.content_margin_bottom = pad.w
	return b


static func ticket(pad: Vector4 = Vector4(18, 8, 22, 9)) -> TicketBox:
	var b := TicketBox.new()
	b.content_margin_left = pad.x
	b.content_margin_top = pad.y
	b.content_margin_right = pad.z
	b.content_margin_bottom = pad.w
	return b


static func stamp(seed: int = 0, ink: Color = ENAMEL_RED, pad: Vector4 = Vector4(14, 6, 14, 7)) -> TicketBox:
	var b := ticket(pad)
	b.kind = "stamp"
	b.ink = ink
	b.seed = seed
	b.tilt = (float((seed * 37) % 7) - 3.0) * 0.012
	return b


static func screen(color: Color = Color(0.09, 0.075, 0.06, 0.92), pad: float = 10.0) -> RivetBox:
	## A dark readout window with a thin brass bezel (gauges, toasts).
	var b := plate(BRASS_DARK, false, Vector4(pad, pad * 0.6, pad, pad * 0.7))
	b.inset = 3.0
	b.inset_color = color
	b.rim_width = 2.0
	b.chamfer = 7.0
	b.gloss = false
	return b


static func outlined(c: Control, size: int, color: Color = CREAM, outline: int = 6, display: bool = true) -> void:
	## display = true: bold slab lettering (numbers, labels); false: body text.
	## For signage in Rye use sign_text().
	if display:
		c.add_theme_font_override("font", bold_font())
	else:
		c.add_theme_font_override("font", body_font())
	c.add_theme_font_size_override("font_size", size)
	c.add_theme_color_override("font_color", color)
	c.add_theme_color_override("font_outline_color", SOOT)
	c.add_theme_constant_override("outline_size", outline)


static func sign_text(c: Control, size: int, color: Color = CREAM, outline: int = 0) -> void:
	## Rye lettering, like a painted sign.
	c.add_theme_font_override("font", display_font())
	c.add_theme_font_size_override("font_size", size)
	c.add_theme_color_override("font_color", color)
	c.add_theme_color_override("font_outline_color", SOOT)
	c.add_theme_constant_override("outline_size", outline)


static func label(text: String, size: int, color: Color = CREAM, outline: int = 6, display: bool = true) -> Label:
	var l := Label.new()
	l.text = text
	outlined(l, size, color, outline, display)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func no_keyboard(b: BaseButton) -> void:
	## Buttons are for clicks and taps only: Space (jump) or Enter must never
	## press a button the mouse clicked earlier.
	b.focus_mode = Control.FOCUS_NONE


static func style_button(b: Button, color: Color = BRASS, size: int = 24) -> void:
	no_keyboard(b)
	b.add_theme_font_override("font", bold_font())
	b.add_theme_constant_override("icon_max_width", int(size * 1.5))
	b.add_theme_constant_override("h_separation", 8)
	b.add_theme_font_size_override("font_size", size)
	var dark_text := color.get_luminance() > 0.45
	var tc := Color(0.16, 0.1, 0.05) if dark_text else CREAM
	for st in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, tc)
	b.add_theme_color_override("font_disabled_color", Color(0.55, 0.5, 0.45))
	b.add_theme_color_override("font_outline_color", Color(1, 1, 1, 0.25) if dark_text else SOOT)
	b.add_theme_constant_override("outline_size", 2 if dark_text else 5)
	var pad := Vector4(18, 8, 18, 10)
	var seed := b.get_instance_id() % 97
	if is_brass(color):
		b.add_theme_stylebox_override("normal", plate(color, true, pad))
		b.add_theme_stylebox_override("hover", plate(color.lightened(0.1), true, pad))
		var pr := plate(color.darkened(0.15), true, Vector4(pad.x, pad.y + 2, pad.z, pad.w - 2))
		pr.pressed = true
		b.add_theme_stylebox_override("pressed", pr)
		b.add_theme_stylebox_override("hover_pressed", pr)
	else:
		b.add_theme_stylebox_override("normal", enamel(color, pad, seed))
		b.add_theme_stylebox_override("hover", enamel(color.lightened(0.08), pad, seed))
		var pe := enamel(color.darkened(0.12), Vector4(pad.x, pad.y + 2, pad.z, pad.w - 2), seed)
		pe.pressed = true
		b.add_theme_stylebox_override("pressed", pe)
		b.add_theme_stylebox_override("hover_pressed", pe)
	var dis := enamel(IRON_LIGHT, pad, seed, Color(0.4, 0.36, 0.32))
	dis.chips = 1
	b.add_theme_stylebox_override("disabled", dis)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())


static func style_ticket(b: Button, size: int = 21) -> void:
	## "Watch a short ad": a cream ticket, the red play stamp as its icon.
	no_keyboard(b)
	b.icon = icon("ad")
	b.add_theme_font_override("font", bold_font())
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_constant_override("icon_max_width", int(size * 1.6))
	b.add_theme_constant_override("h_separation", 14)
	for st in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, INK)
	b.add_theme_color_override("font_disabled_color", Color(0.45, 0.4, 0.34))
	b.add_theme_constant_override("outline_size", 0)
	b.add_theme_stylebox_override("normal", ticket())
	var hv := ticket()
	hv.color = CREAM.lightened(0.05)
	b.add_theme_stylebox_override("hover", hv)
	var pr := ticket(Vector4(18, 10, 22, 7))
	pr.pressed = true
	b.add_theme_stylebox_override("pressed", pr)
	b.add_theme_stylebox_override("hover_pressed", pr)
	var dis := ticket()
	dis.color = Color(0.62, 0.58, 0.5)
	dis.ink = Color(0.4, 0.36, 0.3)
	b.add_theme_stylebox_override("disabled", dis)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())


static func style_stamp(b: Button, size: int = 22, ink: Color = ENAMEL_RED) -> void:
	## A price stamped on a ledger card, in ink.
	no_keyboard(b)
	var seed := b.get_instance_id() % 89
	b.add_theme_font_override("font", bold_font())
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_constant_override("icon_max_width", int(size * 1.3))
	b.add_theme_constant_override("h_separation", 8)
	b.add_theme_constant_override("outline_size", 0)
	for st in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, ink.darkened(0.1))
	b.add_theme_color_override("font_disabled_color", Color(0.5, 0.45, 0.38))
	b.add_theme_stylebox_override("normal", stamp(seed, ink))
	var hv := stamp(seed, ink.lightened(0.1))
	b.add_theme_stylebox_override("hover", hv)
	var pr := stamp(seed, ink)
	pr.pressed = true
	b.add_theme_stylebox_override("pressed", pr)
	b.add_theme_stylebox_override("hover_pressed", pr)
	b.add_theme_stylebox_override("disabled", stamp(seed, Color(0.5, 0.45, 0.38)))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())


static func make_theme() -> Theme:
	install_fonts()
	var t := Theme.new()
	t.default_font = body_font()
	t.default_font_size = 22
	t.set_color("font_color", "Label", CREAM)
	t.set_color("font_outline_color", "Label", SOOT)
	return t


static func soft_dot() -> Texture2D:
	## A soft round blob for particles (dust, sparks, glows). Built from an
	## Image with mipmaps (a GradientTexture2D renders black on some WebGL).
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


static func draw_rivet(ci: CanvasItem, at: Vector2, r: float, base: Color) -> void:
	ci.draw_circle(at, r + 1.2, SOOT)
	ci.draw_circle(at, r, base.darkened(0.15))
	ci.draw_circle(at + Vector2(-r * 0.3, -r * 0.3), r * 0.45, base.lightened(0.45))


static func draw_text_centered(ci: CanvasItem, font: Font, text: String, center: Vector2, size: int, color: Color, outline: int = 0) -> void:
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var at := Vector2(center.x - w * 0.5, center.y + size * 0.36)
	if outline > 0:
		var oc := SOOT
		oc.a = color.a
		ci.draw_string_outline(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, outline, oc)
	ci.draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)
