class_name TideStaff
extends Control
## The harbour tide board: a white board with black "E" graduations, one per
## metre, numbered every four in red. The water stands in front of it at the
## bay's level. A brass pointer on the board's left side carries the depth on
## a small tag, so it never sits on the ring names: those are printed in ink
## on a paper strip pinned to the right of the board, each at its depth, the
## ring you're in set bold, the ones you've drained ticked off.

var level := 0.0                 # the main water's y
var shown := 0.0
var depth_max := 24.5
var rings: Array = []
var current_ring := 0
var _t := 0.0

const TAG_W := 92.0
const BOARD_X := 98.0
const BOARD_W := 50.0
const STRIP_X := 158.0
const STRIP_W := 150.0
const TOP := 26.0


func _init() -> void:
	custom_minimum_size = Vector2(STRIP_X + STRIP_W + 6, 470)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _process(delta: float) -> void:
	_t += delta / maxf(Engine.time_scale, 0.001)
	shown = lerpf(shown, level, 1.0 - pow(0.001, delta))
	queue_redraw()


func _y_of(depth_m: float) -> float:
	return TOP + depth_m / depth_max * (size.y - TOP - 26.0)


func _draw() -> void:
	var bx := BOARD_X
	var bw := BOARD_W
	var top := TOP
	var bottom := size.y - 26.0
	var board := Rect2(bx, top - 12, bw, bottom - top + 24)
	# the post behind the board, the board and its shadow
	draw_rect(Rect2(bx + bw * 0.5 - 7, 0, 14, size.y), UiTheme.ROPE_DARK.darkened(0.25))
	draw_colored_polygon(UiTheme.rough_rect(Rect2(board.position + Vector2(3, 5), board.size), 4, 1.0), Color(0.05, 0.12, 0.15, 0.35))
	draw_colored_polygon(UiTheme.rough_rect(board, 11, 1.2), Color("#f7f1e2"))
	draw_polyline(UiTheme._closed(UiTheme.rough_rect(board, 11, 1.2)), Color(UiTheme.INK, 0.6), 1.5)
	# graduations: an E per metre, alternating sides; red numerals every 4 m
	var f := UiTheme.bold()
	for m in int(depth_max) + 1:
		var y0 := _y_of(float(m))
		var y1 := _y_of(float(m) + 1.0)
		if m < int(depth_max):
			var left := m % 2 == 0
			var ex := bx + (6.0 if left else bw * 0.5 + 1.0)
			var ew := bw * 0.5 - 7.0
			var hh := (y1 - y0)
			draw_rect(Rect2(ex if left else ex + ew - 3.0, y0, 3.0, hh * 0.92), UiTheme.INK)
			for k in 3:
				draw_rect(Rect2(ex, y0 + hh * 0.46 * k, ew, maxf(1.5, hh * 0.1)), UiTheme.INK)
		if m % 4 == 0 and m > 0:
			var s := str(m)
			var tw := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
			draw_rect(Rect2(bx + bw * 0.5 - tw * 0.5 - 3, y0 - 11, tw + 6, 22), Color("#f7f1e2"))
			draw_string(f, Vector2(bx + bw * 0.5 - tw * 0.5, y0 + 8), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, UiTheme.FLAG_RED)
	# the water in front of the board
	var d := clampf(-shown, 0.0, depth_max)
	var wy := _y_of(d)
	var water := PackedVector2Array()
	var n := 8
	for i in n + 1:
		var x := bx - 5 + (bw + 10) * float(i) / n
		water.append(Vector2(x, wy + sin(_t * 2.0 + i * 0.9) * 1.6))
	water.append(Vector2(bx + bw + 5, board.end.y + 4))
	water.append(Vector2(bx - 5, board.end.y + 4))
	draw_colored_polygon(water, Color(UiTheme.TEAL, 0.45))
	var foam := PackedVector2Array()
	for i in n + 1:
		foam.append(water[i])
	draw_polyline(foam, UiTheme.PAPER, 2.5, true)
	# the ring strip: a paper strip pinned beside the board, names in ink
	var strip := Rect2(STRIP_X, top - 14, STRIP_W, bottom - top + 28)
	draw_colored_polygon(UiTheme.rough_rect(Rect2(strip.position + Vector2(3, 4), strip.size), 31, 1.0), Color(0.05, 0.12, 0.15, 0.28))
	draw_colored_polygon(UiTheme.rough_rect(strip, 33, 1.3, 8), UiTheme.PAPER)
	draw_circle(Vector2(strip.position.x + strip.size.x * 0.5, strip.position.y + 7), 5.0, UiTheme.BRASS_DARK)
	draw_circle(Vector2(strip.position.x + strip.size.x * 0.5, strip.position.y + 7), 3.5, UiTheme.BRASS)
	var it := UiTheme.italic()
	for i in rings.size():
		var rt := -float(rings[i].top)
		var ry := _y_of(rt)
		var nm := str(rings[i].name)
		var passed := -float(rings[i].bottom) <= d + 0.01
		var here := i == current_ring
		# a rule from the board to the name at the ring's top depth
		draw_line(Vector2(bx + bw + 1, ry), Vector2(strip.position.x + 8, ry), Color(UiTheme.INK, 0.7), 1.5)
		var fs := 22
		var col := UiTheme.INK if here else (Color(UiTheme.INK, 0.5) if passed else Color(UiTheme.INK, 0.78))
		var font := UiTheme.display() if here else it
		var ty := ry + 22.0
		if i == rings.size() - 1:
			ty = minf(ty, bottom + 8.0)
		draw_string(font, Vector2(strip.position.x + 10, ty), nm, HORIZONTAL_ALIGNMENT_LEFT, STRIP_W - 16, fs, col)
		if passed:
			# a small inked tick: drained
			var tx := strip.end.x - 18.0
			draw_polyline(PackedVector2Array([Vector2(tx, ry + 12), Vector2(tx + 4, ry + 17), Vector2(tx + 11, ry + 6)]), Color(UiTheme.RUST, 0.85), 2.2, true)
		if here:
			draw_line(Vector2(strip.position.x + 10, ty + 4), Vector2(strip.position.x + 10 + it.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x, ty + 5), Color(UiTheme.RUST, 0.8), 1.8)
	# the brass pointer on the board's left edge, the depth on its tag
	var label := "%.1f m" % d
	var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	var tag := Rect2(Vector2(bx - 18 - lw - 16, wy - 16), Vector2(lw + 16, 32))
	tag.position.x = maxf(tag.position.x, 2.0)
	var arrow := PackedVector2Array([Vector2(bx - 2, wy), Vector2(bx - 16, wy - 9), Vector2(bx - 16, wy + 9)])
	draw_colored_polygon(arrow, UiTheme.BRASS)
	draw_polyline(PackedVector2Array(Array(arrow) + [arrow[0]]), UiTheme.BRASS_DARK, 1.5, true)
	draw_line(Vector2(tag.end.x, wy), Vector2(bx - 16, wy), UiTheme.BRASS_DARK, 2.0)
	draw_colored_polygon(UiTheme.rough_rect(Rect2(tag.position + Vector2(2, 3), tag.size), 41, 0.7), Color(0.05, 0.12, 0.15, 0.3))
	draw_colored_polygon(UiTheme.rough_rect(tag, 43, 0.7), UiTheme.PAPER)
	draw_polyline(UiTheme._closed(UiTheme.rough_rect(tag, 43, 0.7)), Color(UiTheme.INK, 0.7), 1.4)
	draw_string(f, Vector2(tag.position.x + 8, wy + 8), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, UiTheme.INK)
