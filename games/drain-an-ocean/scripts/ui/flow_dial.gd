class_name FlowDial
extends Control
## A brass pressure dial for the pumps: the needle sweeps a log scale of
## tonnes a minute, with the number on a small plate under it.

var flow := 0.0                  # m³/s the pumps move
var seep := 0.0                  # m³/s the sea pushes back in (the red needle)
var _seep_needle := 0.0
var boosted := false
var _needle := 0.0
var _t := 0.0


func _init() -> void:
	custom_minimum_size = Vector2(132, 150)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _value_angle(tpm: float) -> float:
	# 10 t/min .. 10M t/min over 270 degrees
	var u := clampf((log(maxf(tpm, 10.0)) / log(10.0) - 1.0) / 6.0, 0.0, 1.0)
	return deg_to_rad(135.0 + 270.0 * u)


func _process(delta: float) -> void:
	_t += delta / maxf(Engine.time_scale, 0.001)
	var want := _value_angle(flow * 60.0) + sin(_t * 23.0) * 0.012 * (1.0 if flow > 0.0 else 0.0)
	_needle = lerpf(_needle, want, 1.0 - pow(0.02, delta))
	_seep_needle = lerpf(_seep_needle, _value_angle(seep * 60.0) if seep > 0.0 else deg_to_rad(135.0), 1.0 - pow(0.02, delta))
	queue_redraw()


func _draw() -> void:
	var c := Vector2(size.x * 0.5, 64)
	var r := 56.0
	draw_circle(c + Vector2(3, 5), r + 2, Color(0.05, 0.12, 0.15, 0.35))
	draw_circle(c, r, UiTheme.BRASS_DARK)
	draw_circle(c, r - 3, UiTheme.BRASS)
	draw_arc(c, r - 5, deg_to_rad(200), deg_to_rad(320), 16, Color(1, 0.93, 0.7, 0.6), 2.0)
	draw_circle(c, r - 9, Color("#f4ecd8"))
	# scale
	var f := UiTheme.bold()
	for k in 7:
		var a := deg_to_rad(135.0 + 45.0 * k)
		var dir := Vector2(cos(a), sin(a))
		draw_line(c + dir * (r - 12), c + dir * (r - 22), UiTheme.INK, 2.0)
		if k < 6:
			for m in 4:
				var am := a + deg_to_rad(45.0 * (m + 1) / 5.0)
				var dm := Vector2(cos(am), sin(am))
				draw_line(c + dm * (r - 12), c + dm * (r - 17), Color(UiTheme.INK, 0.6), 1.0)
		if k % 2 == 0:
			var lab: String = ["10", "", "1K", "", "100K", "", "10M"][k]
			var tw := f.get_string_size(lab, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			var lp := c + dir * (r - 31) + Vector2(-tw * 0.5, 4)
			draw_string(f, lp, lab, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, UiTheme.INK)
	# red arc at the top end, like a real gauge
	draw_arc(c, r - 14, deg_to_rad(360.0 + 45.0 - 40.0), deg_to_rad(405.0), 8, Color(UiTheme.FLAG_RED, 0.8), 4.0)
	var it := UiTheme.italic()
	var cap := "pumps"
	var cw := it.get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	draw_string(it, c + Vector2(-cw * 0.5, 40), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(UiTheme.INK, 0.8))
	# the sea's needle (red, thin): when it catches the pumps' needle, you've stalled
	if seep > 0.0:
		var sd := Vector2(cos(_seep_needle), sin(_seep_needle))
		draw_line(c - sd * 6.0, c + sd * (r - 18), UiTheme.FLAG_RED, 2.0, true)
	# the pumps' needle
	var nd := Vector2(cos(_needle), sin(_needle))
	var tail := c - nd * 10.0
	var tip := c + nd * (r - 16)
	var side := nd.orthogonal() * 3.0
	draw_colored_polygon(PackedVector2Array([tail + side, tip, tail - side]), UiTheme.RUST)
	draw_circle(c, 5.5, UiTheme.BRASS_DARK)
	draw_circle(c, 3.0, UiTheme.BRASS)
	# value plate
	var val := Fmt.flow(flow)
	var vw := f.get_string_size(val, HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x
	var plate := Rect2(Vector2(c.x - vw * 0.5 - 10, c.y + r - 4), Vector2(vw + 20, 28))
	draw_colored_polygon(UiTheme.rough_rect(plate, 21, 0.8), UiTheme.PAPER)
	draw_polyline(UiTheme._closed(UiTheme.rough_rect(plate, 21, 0.8)), Color(UiTheme.INK, 0.7), 1.2)
	draw_string(f, Vector2(plate.position.x + 10, plate.position.y + 21), val, HORIZONTAL_ALIGNMENT_LEFT, -1, 19, UiTheme.FLAG_RED if boosted else UiTheme.INK)
