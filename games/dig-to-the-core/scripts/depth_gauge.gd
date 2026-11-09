class_name DepthGauge
extends Control
## The big vertical depth gauge on the left of the HUD, like the dial on a
## mine hoist: a riveted brass tube with a glass window.
##
## Inside: a close-up column that scrolls as you go down (WINDOW_M metres
## around you), with each zone's colour band, metre ticks, the zone names
## beside it, where the buried finds are ("?" until you dig them out), your
## deepest point (gold) and the lift stop. Next to it, a thin column with the
## whole planet down to the core, so you always see how far there is to go.
## On top, a readout plate with the depth and the zone you're in.

const WINDOW_M := 46.0
const W := 132.0
const HEADER_H := 74.0

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
	var key := Vector3(snappedf(depth, 0.05), snappedf(deepest, 0.1), lift_depth)
	if key != _shown or _zone_flash > 0.0:
		_shown = key
		queue_redraw()


static func zone_at(d: float) -> int:
	return clampi(int(floor(d / Balance.ZONE_DEPTH)), 0, Balance.zone_count() - 1)


func _draw() -> void:
	var h := size.y
	var total := Balance.ZONE_DEPTH * Balance.zone_count()
	var zi := zone_at(depth)
	var zone: Dictionary = Balance.ZONES[zi]
	# --- Header plate: depth readout and zone name -----------------------------------------
	var hdr := Rect2(0, 0, W, HEADER_H)
	_plate(hdr, UiTheme.BRASS)
	var win := Rect2(8, 8, W - 16, HEADER_H - 16)
	draw_rect(win, UiTheme.SOOT)
	draw_rect(win.grow(-2), Color(0.1, 0.075, 0.05))
	var amber := UiTheme.AMBER
	var dtext := "%d m" % int(floor(depth)) if depth < 1000.0 else Fmt.num(depth) + " m"
	UiTheme.draw_text_centered(self, _font, dtext, Vector2(W * 0.5, win.position.y + 20), 28, amber)
	var zname := str(zone.name)
	var zsize := 15 if zname.length() <= 11 else 11
	var zc := (zone.band as Color).lightened(0.35).lerp(Color.WHITE, _zone_flash * 0.6)
	UiTheme.draw_text_centered(self, _sign, zname, Vector2(W * 0.5, win.position.y + 45), zsize, zc)
	# --- The tube -----------------------------------------------------------------------------
	var tube := Rect2(0, HEADER_H + 6, W - 34, h - HEADER_H - 6)
	_plate(tube, UiTheme.BRASS)
	var glass := Rect2(tube.position.x + 10, tube.position.y + 12, tube.size.x - 20, tube.size.y - 24)
	draw_rect(glass.grow(2), UiTheme.SOOT)
	var top_m := depth - WINDOW_M * 0.45
	var ppm := glass.size.y / WINDOW_M
	# Zone bands.
	for z in Balance.zone_count():
		var z0 := z * Balance.ZONE_DEPTH
		var z1 := z0 + Balance.ZONE_DEPTH
		var y0 := glass.position.y + (z0 - top_m) * ppm
		var y1 := glass.position.y + (z1 - top_m) * ppm
		var a := maxf(y0, glass.position.y)
		var b := minf(y1, glass.end.y)
		if b <= a:
			continue
		var col: Color = Balance.ZONES[z].band
		var dug := clampf((deepest - z0) / Balance.ZONE_DEPTH, 0.0, 1.0)
		draw_rect(Rect2(glass.position.x, a, glass.size.x, b - a), col.darkened(0.55))
		# The part you've dug through is lit.
		var dy := minf(glass.position.y + (deepest - top_m) * ppm, b)
		if dy > a:
			draw_rect(Rect2(glass.position.x, a, glass.size.x, dy - a), col.darkened(0.15))
		if y0 >= glass.position.y and y0 <= glass.end.y:
			draw_line(Vector2(glass.position.x, y0), Vector2(glass.end.x, y0), col.lightened(0.5), 2.0)
	# Sky above the surface.
	var sky_y := glass.position.y + (0.0 - top_m) * ppm
	if sky_y > glass.position.y:
		draw_rect(Rect2(glass.position.x, glass.position.y, glass.size.x, minf(sky_y, glass.end.y) - glass.position.y), Color(0.45, 0.68, 0.9))
		if sky_y < glass.end.y:
			draw_rect(Rect2(glass.position.x, sky_y - 3, glass.size.x, 3), DigField.GRASS)
	# Ticks every 2 m, numbers every 10 m.
	var m0 := int(ceil(top_m / 2.0)) * 2
	var m := m0
	while m < top_m + WINDOW_M:
		if m >= 0:
			var y := glass.position.y + (m - top_m) * ppm
			var big := m % 10 == 0
			draw_line(Vector2(glass.position.x, y), Vector2(glass.position.x + (12 if big else 6), y), Color(1, 0.95, 0.85, 0.75 if big else 0.4), 2.0 if big else 1.0)
			if big:
				draw_string(_font, Vector2(glass.position.x + 15, y + 5), str(m), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(1, 0.95, 0.85, 0.85))
		m += 2
	# Finds: "?" where something's buried, the icon once you've dug it out.
	for fa in finds_at:
		var fd: float = fa[0]
		var y := glass.position.y + (fd - top_m) * ppm
		if y < glass.position.y + 6 or y > glass.end.y - 6:
			continue
		var cx := glass.end.x - 12
		if fa[2]:
			draw_texture_rect(UiTheme.icon(str(fa[1])), Rect2(cx - 10, y - 10, 20, 20), false)
		else:
			draw_circle(Vector2(cx, y), 8.5, UiTheme.SOOT)
			draw_circle(Vector2(cx, y), 7.0, UiTheme.AMBER.darkened(0.1))
			UiTheme.draw_text_centered(self, _font, "?", Vector2(cx, y), 12, UiTheme.SOOT)
	# The lift stop and your deepest point.
	if lift_depth >= 0.0:
		var ly := glass.position.y + (lift_depth - top_m) * ppm
		if ly > glass.position.y and ly < glass.end.y:
			draw_rect(Rect2(glass.position.x + 2, ly - 5, 14, 10), UiTheme.SOOT)
			draw_rect(Rect2(glass.position.x + 4, ly - 3, 10, 6), Color(0.95, 0.72, 0.12))
	var deep_y := glass.position.y + (deepest - top_m) * ppm
	if deep_y > glass.position.y and deep_y < glass.end.y:
		draw_line(Vector2(glass.position.x, deep_y), Vector2(glass.end.x, deep_y), Color(1.0, 0.82, 0.3), 2.0)
	# The needle: you, at a fixed height in the window.
	var ny := glass.position.y + (depth - top_m) * ppm
	draw_line(Vector2(glass.position.x, ny), Vector2(glass.end.x, ny), Color(1.0, 0.3, 0.2, 0.9), 2.0)
	var tip := PackedVector2Array([Vector2(glass.position.x - 9, ny - 8), Vector2(glass.position.x + 4, ny), Vector2(glass.position.x - 9, ny + 8)])
	draw_colored_polygon(tip, Color(0.95, 0.25, 0.15))
	draw_polyline(PackedVector2Array([tip[0], tip[1], tip[2], tip[0]]), UiTheme.SOOT, 1.5)
	# Glass sheen.
	draw_rect(Rect2(glass.position.x + glass.size.x * 0.62, glass.position.y, 5, glass.size.y), Color(1, 1, 1, 0.07))
	# --- Whole-planet column ----------------------------------------------------------------------
	var col_r := Rect2(W - 26, HEADER_H + 6, 22, h - HEADER_H - 6)
	_plate(col_r, UiTheme.BRASS_DARK, false)
	var pc := Rect2(col_r.position.x + 5, col_r.position.y + 7, col_r.size.x - 10, col_r.size.y - 14)
	draw_rect(pc.grow(1), UiTheme.SOOT)
	for z in Balance.zone_count():
		var y0 := pc.position.y + pc.size.y * z / Balance.zone_count()
		var y1 := pc.position.y + pc.size.y * (z + 1) / Balance.zone_count()
		var col: Color = Balance.ZONES[z].band
		draw_rect(Rect2(pc.position.x, y0, pc.size.x, y1 - y0), col if deepest >= z * Balance.ZONE_DEPTH else col.darkened(0.6))
	var dpy := pc.position.y + pc.size.y * clampf(deepest / total, 0.0, 1.0)
	draw_rect(Rect2(pc.position.x - 3, dpy - 1.5, pc.size.x + 6, 3), Color(1.0, 0.85, 0.35))
	var py := pc.position.y + pc.size.y * clampf(depth / total, 0.0, 1.0)
	draw_circle(Vector2(pc.get_center().x, py), 4.5, Color(0.95, 0.25, 0.15))
	draw_circle(Vector2(pc.get_center().x, pc.end.y - 3), 4.0, Color(1.0, 0.95, 0.7))   # the core
	# Zone names beside the tube, for the bands in view.
	for z in Balance.zone_count():
		var y0 := glass.position.y + (z * Balance.ZONE_DEPTH - top_m) * ppm
		var y1 := y0 + Balance.ZONE_DEPTH * ppm
		var ymid := clampf(maxf(y0, glass.position.y) + 14.0, glass.position.y + 10, glass.end.y - 6)
		if y1 < glass.position.y + 20 or y0 > glass.end.y - 10:
			continue
		var name := str(Balance.ZONES[z].name).to_lower()
		if deepest < z * Balance.ZONE_DEPTH - Balance.ZONE_DEPTH * 0.5:
			continue   # not reached yet: a mystery
		draw_string_outline(_font, Vector2(W + 6, ymid), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, 4, Color(0, 0, 0, 0.75))
		draw_string(_font, Vector2(W + 6, ymid), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, (Balance.ZONES[z].band as Color).lightened(0.4))


func _plate(r: Rect2, c: Color, rivets: bool = true) -> void:
	draw_rect(r, UiTheme.SOOT)
	var inner := r.grow(-2.5)
	var steps := 6
	for i in steps:
		var t := float(i) / steps
		var col := c.lightened(0.14).lerp(c.darkened(0.3), t)
		draw_rect(Rect2(inner.position.x, inner.position.y + inner.size.y * t, inner.size.x, inner.size.y / steps + 1), col)
	draw_line(inner.position + Vector2(3, 1), Vector2(inner.end.x - 3, inner.position.y + 1), c.lightened(0.5), 1.5)
	if rivets:
		for p in [inner.position + Vector2(5, 5), Vector2(inner.end.x - 5, inner.position.y + 5),
				Vector2(inner.position.x + 5, inner.end.y - 5), inner.end - Vector2(5, 5)]:
			UiTheme.draw_rivet(self, p, 2.4, c)
