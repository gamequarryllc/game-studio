class_name DepthGauge
extends Control
## The depth gauge on the left of the HUD, like the dial on a mine hoist: a
## brass readout plate on top (the depth and the layer you're in), and under
## it one brass tube with a glass window showing the whole planet down to the
## core: each layer's colour band (lit where you've dug through it), a brass
## tick at every layer line, the buried finds ("?" until dug out, then their
## icon), your deepest point (gold), the lift stop (a lamp mark) and the
## needle: you. One tube, nothing to cross-read.

const W := 186.0
const HEADER_H := 74.0
const TUBE_W := 58.0

var depth := 0.0
var deepest := 0.0
var lift_depth := -1.0
var finds_at: Array = []         # [depth, icon, found]
var _shown := Vector3(-1, -1, -1)
var _font: Font
var _sign: Font
var _zone_flash := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = UiTheme.bold_font()
	_sign = UiTheme.display_font()
	custom_minimum_size = Vector2(W, 300)


func flash_zone() -> void:
	_zone_flash = 1.0


func _process(delta: float) -> void:
	_zone_flash = maxf(0.0, _zone_flash - delta * 0.6)
	var key := Vector3(snappedf(depth, 0.25), snappedf(deepest, 0.25), lift_depth)
	if key != _shown or _zone_flash > 0.0:
		_shown = key
		queue_redraw()


static func zone_at(d: float) -> int:
	return clampi(int(floor(d / Balance.ZONE_DEPTH)), 0, Balance.zone_count() - 1)


func _draw() -> void:
	var h := size.y
	var total := Balance.ZONE_DEPTH * Balance.zone_count()
	var zi := zone_at(depth)
	# --- Header plate: depth readout and the layer's name --------------------------------
	var hdr := Rect2(0, 0, W, HEADER_H)
	_plate(hdr, UiTheme.BRASS)
	var win := Rect2(8, 8, W - 16, HEADER_H - 16)
	draw_rect(win, UiTheme.SOOT)
	draw_rect(win.grow(-2), Color(0.1, 0.075, 0.05))
	var dtext := "%d m" % int(floor(depth)) if depth < 1000.0 else Fmt.num(depth) + " m"
	UiTheme.draw_text_centered(self, _font, dtext, Vector2(W * 0.5, win.position.y + 19), 30, UiTheme.AMBER)
	var zc := UiTheme.CREAM.lerp(Color.WHITE, _zone_flash * 0.6)
	UiTheme.draw_text_centered(self, _font, sentence(str(Balance.ZONES[zi].name)) if depth > 0.4 else "The field", Vector2(W * 0.5, win.position.y + 44), 20, zc)
	# --- The tube ---------------------------------------------------------------------------
	var tx := (W - TUBE_W) * 0.5
	var tube := Rect2(tx, HEADER_H + 4, TUBE_W, h - HEADER_H - 4)
	# A collar where the tube meets the plate.
	draw_rect(Rect2(tx - 6, HEADER_H - 2, TUBE_W + 12, 10), UiTheme.SOOT)
	draw_rect(Rect2(tx - 4, HEADER_H, TUBE_W + 8, 6), UiTheme.BRASS_DARK)
	_plate(tube, UiTheme.BRASS, false)
	var glass := Rect2(tube.position.x + 9, tube.position.y + 10, tube.size.x - 18, tube.size.y - 30)
	draw_rect(glass.grow(2), UiTheme.SOOT)
	var ppm := glass.size.y / total
	for z in Balance.zone_count():
		var y0 := glass.position.y + z * Balance.ZONE_DEPTH * ppm
		var y1 := y0 + Balance.ZONE_DEPTH * ppm
		var col: Color = Balance.ZONES[z].band
		draw_rect(Rect2(glass.position.x, y0, glass.size.x, y1 - y0), col.darkened(0.62))
		# The part you've dug through is lit.
		var dy := clampf(glass.position.y + deepest * ppm, y0, y1)
		if dy > y0:
			draw_rect(Rect2(glass.position.x, y0, glass.size.x, dy - y0), col.darkened(0.08))
		if z > 0:
			draw_line(Vector2(glass.position.x, y0), Vector2(glass.end.x, y0), Color(UiTheme.SOOT, 0.7), 1.5)
			# Brass ticks out through the tube wall at each layer line.
			draw_line(Vector2(tube.position.x - 5, y0), Vector2(tube.position.x + 6, y0), UiTheme.SOOT, 3.0)
			draw_line(Vector2(tube.position.x - 4, y0), Vector2(tube.position.x + 5, y0), UiTheme.BRASS_LIGHT, 1.5)
	# The core at the bottom: a glowing bulb.
	var bulb := Vector2(tube.get_center().x, tube.end.y - 11)
	draw_circle(bulb, 11.0, UiTheme.SOOT)
	draw_circle(bulb, 8.5, Color(1.0, 0.72, 0.28) if deepest >= total - 1.0 else Color(0.55, 0.36, 0.14))
	draw_circle(bulb + Vector2(-2.5, -2.5), 2.6, Color(1.0, 0.95, 0.8, 0.8))
	# Finds: "?" where something's buried, the icon once you've dug it out.
	for fa in finds_at:
		var fd: float = fa[0]
		var y := glass.position.y + fd * ppm
		var cx := glass.end.x - 9.0
		if fa[2]:
			draw_texture_rect(UiTheme.icon(str(fa[1])), Rect2(cx - 9, y - 9, 18, 18), false)
		else:
			draw_circle(Vector2(cx, y), 6.5, UiTheme.SOOT)
			draw_circle(Vector2(cx, y), 5.0, UiTheme.AMBER.darkened(0.1))
	# The lift stop and your deepest point.
	if lift_depth >= 0.0:
		var ly := glass.position.y + lift_depth * ppm
		draw_rect(Rect2(tube.end.x - 4, ly - 6, 12, 12), UiTheme.SOOT)
		draw_rect(Rect2(tube.end.x - 2, ly - 4, 8, 8), Color(0.95, 0.72, 0.12))
	var deep_y := glass.position.y + deepest * ppm
	draw_line(Vector2(glass.position.x, deep_y), Vector2(glass.end.x, deep_y), Color(1.0, 0.82, 0.3), 2.0)
	# The needle: you.
	var ny := glass.position.y + clampf(depth, 0.0, total) * ppm
	draw_line(Vector2(glass.position.x, ny), Vector2(glass.end.x, ny), Color(0.95, 0.25, 0.15, 0.95), 2.5)
	var tip := PackedVector2Array([Vector2(tube.position.x - 14, ny - 9), Vector2(tube.position.x + 4, ny), Vector2(tube.position.x - 14, ny + 9)])
	draw_colored_polygon(tip, Color(0.95, 0.25, 0.15))
	draw_polyline(PackedVector2Array([tip[0], tip[1], tip[2], tip[0]]), UiTheme.SOOT, 2.0)
	# Glass sheen.
	draw_rect(Rect2(glass.position.x + glass.size.x * 0.22, glass.position.y, 4, glass.size.y), Color(1, 1, 1, 0.08))
	draw_rect(Rect2(glass.position.x + glass.size.x * 0.22 + 6, glass.position.y, 1.5, glass.size.y), Color(1, 1, 1, 0.05))


static func sentence(t: String) -> String:
	## "Dinosaur Graveyard" -> "Dinosaur graveyard" (sentence case, the house style).
	return t.substr(0, 1) + t.substr(1).to_lower()


func _plate(r: Rect2, c: Color, rivets: bool = true) -> void:
	draw_rect(r, UiTheme.SOOT)
	var inner := r.grow(-2.5)
	var steps := 6
	for i in steps:
		var t := float(i) / steps
		var col := c.lightened(0.14).lerp(c.darkened(0.3), t)
		if r.size.y > r.size.x * 2.0:
			# A tube: shaded across, light down one side.
			var x0 := inner.position.x + inner.size.x * t
			col = c.lightened(0.22).lerp(c.darkened(0.35), absf(t - 0.3) * 1.4)
			draw_rect(Rect2(x0, inner.position.y, inner.size.x / steps + 1, inner.size.y), col)
		else:
			draw_rect(Rect2(inner.position.x, inner.position.y + inner.size.y * t, inner.size.x, inner.size.y / steps + 1), col)
	draw_line(inner.position + Vector2(3, 1), Vector2(inner.end.x - 3, inner.position.y + 1), c.lightened(0.5), 1.5)
	if rivets:
		for p in [inner.position + Vector2(5, 5), Vector2(inner.end.x - 5, inner.position.y + 5),
				Vector2(inner.position.x + 5, inner.end.y - 5), inner.end - Vector2(5, 5)]:
			UiTheme.draw_rivet(self, p, 2.4, c)
