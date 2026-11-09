class_name TideStaff
extends Control
## The harbour tide board: a white board with black "E" graduations, one per
## metre, numbered every two. The water stands in front of it at the bay's
## level (with a foam line), and the rings are marked down its side in chart
## italic. The main HUD element.

var level := 0.0                 # the main water's y
var shown := 0.0
var depth_max := 24.5
var rings: Array = []
var current_ring := 0
var _t := 0.0


func _init() -> void:
	custom_minimum_size = Vector2(150, 430)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _process(delta: float) -> void:
	_t += delta / maxf(Engine.time_scale, 0.001)
	shown = lerpf(shown, level, 1.0 - pow(0.001, delta))
	queue_redraw()


func _y_of(depth_m: float, top: float, height: float) -> float:
	return top + depth_m / depth_max * height


func _draw() -> void:
	var bw := 56.0
	var bx := 12.0
	var top := 22.0
	var height := size.y - 44.0
	var board := Rect2(bx, top - 10, bw, height + 20)
	# post and board
	draw_rect(Rect2(bx + bw * 0.5 - 7, 0, 14, size.y), UiTheme.ROPE_DARK.darkened(0.2))
	draw_colored_polygon(UiTheme.rough_rect(Rect2(board.position + Vector2(3, 5), board.size), 4, 1.0), Color(0.05, 0.12, 0.15, 0.35))
	draw_colored_polygon(UiTheme.rough_rect(board, 11, 1.2), Color("#f7f1e2"))
	draw_polyline(UiTheme._closed(UiTheme.rough_rect(board, 11, 1.2)), Color(UiTheme.INK, 0.6), 1.5)
	# graduations: an E per metre, alternating sides
	var f := UiTheme.bold()
	for m in int(depth_max) + 1:
		var y0 := _y_of(float(m), top, height)
		var y1 := _y_of(float(m) + 1.0, top, height)
		if m < int(depth_max):
			var left := m % 2 == 0
			var ex := bx + (8.0 if left else bw * 0.5 + 2.0)
			var ew := bw * 0.5 - 10.0
			var hh := (y1 - y0)
			draw_rect(Rect2(ex if left else ex + ew - 3.0, y0, 3.0, hh * 0.92), UiTheme.INK)
			for k in 3:
				var yy := y0 + hh * 0.46 * k
				draw_rect(Rect2(ex, yy, ew, maxf(1.5, hh * 0.1)), UiTheme.INK)
		if m % 2 == 0 and m > 0:
			var s := str(m)
			var tw := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
			draw_rect(Rect2(bx + bw * 0.5 - tw * 0.5 - 2, y0 - 8, tw + 4, 15), Color("#f7f1e2"))
			draw_string(f, Vector2(bx + bw * 0.5 - tw * 0.5, y0 + 5), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, UiTheme.FLAG_RED)
	# the water in front of the board
	var d := clampf(-shown, 0.0, depth_max)
	var wy := _y_of(d, top, height)
	var water := PackedVector2Array()
	var n := 10
	for i in n + 1:
		var x := bx - 6 + (bw + 12) * float(i) / n
		water.append(Vector2(x, wy + sin(_t * 2.0 + i * 0.9) * 1.6))
	water.append(Vector2(bx + bw + 6, board.end.y + 4))
	water.append(Vector2(bx - 6, board.end.y + 4))
	draw_colored_polygon(water, Color(UiTheme.TEAL, 0.42))
	var foam := PackedVector2Array()
	for i in n + 1:
		foam.append(water[i])
	draw_polyline(foam, UiTheme.PAPER, 2.5, true)
	# ring names down the side, in chart italic
	var it := UiTheme.italic()
	for i in rings.size():
		var rt := -float(rings[i].top)
		var ry := _y_of(rt, top, height)
		draw_line(Vector2(bx + bw + 2, ry), Vector2(bx + bw + 10, ry), UiTheme.INK, 1.5)
		var nm := str(rings[i].name)
		var passed := -float(rings[i].bottom) < d
		var nw := it.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		var tag := Rect2(Vector2(bx + bw + 10, ry + 1), Vector2(nw + 12, 22))
		draw_colored_polygon(UiTheme.rough_rect(tag, i + 60, 0.7, 3), Color(UiTheme.PAPER, 0.92 if i == current_ring else 0.7))
		var tc := UiTheme.INK if i == current_ring else (Color(UiTheme.INK, 0.45) if passed else Color(UiTheme.INK, 0.75))
		draw_string(it, Vector2(tag.position.x + 6, ry + 17), nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, tc)
	# the level tag
	var label := "%.1f m" % d
	var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x
	var tag := Rect2(Vector2(bx + bw + 8, wy - 14), Vector2(lw + 16, 28))
	var pts := PackedVector2Array([Vector2(bx + bw - 2, wy), tag.position + Vector2(0, 6), tag.position, Vector2(tag.end.x, tag.position.y), tag.end, Vector2(tag.position.x, tag.end.y), tag.position + Vector2(0, 22)])
	draw_colored_polygon(pts, UiTheme.PAPER)
	draw_polyline(PackedVector2Array(Array(pts) + [pts[0]]), UiTheme.INK, 1.5, true)
	draw_string(f, Vector2(tag.position.x + 8, wy + 7), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 19, UiTheme.INK)
