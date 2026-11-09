class_name WoodBox
extends StyleBox
## The supply shack's own surfaces, drawn in code (the shop is the shack):
##  - "planks": the shack's back wall, vertical boards of three tones with
##    grain lines, dark gaps and nail heads, a little uneven;
##  - "pegboard": brown hardboard with a grid of holes and a timber frame,
##    where the tools hang;
##  - "cabinet": the dark carcass of the finds cabinet;
##  - "drawer": one drawer front, bevelled, a little lighter when it's open;
##  - "ledger": an open ledger book, two cream pages ruled in blue-grey with
##    red margin lines and a shadowed gutter, on a dark red cloth binding.
## Each piece is seeded, so no two boards or drawers are quite alike.

var kind := "planks"
var color := Color(0.42, 0.29, 0.18)
var seed := 0
var lit := false


static func _hash(x: int) -> int:
	x = ((x >> 16) ^ x) * 0x45d9f3b
	x = ((x >> 16) ^ x) * 0x45d9f3b
	return ((x >> 16) ^ x) & 0x7fffffff


static func _u(h: int, i: int) -> float:
	return float((_hash(h + i * 7919) >> 4) & 1023) / 1023.0


func _draw(ci: RID, rect: Rect2) -> void:
	if rect.size.x < 6.0 or rect.size.y < 6.0:
		return
	var h := _hash(seed * 977 + int(rect.size.x) * 3)
	match kind:
		"planks":
			_planks(ci, rect, h)
		"pegboard":
			_pegboard(ci, rect, h)
		"cabinet":
			_cabinet(ci, rect, h)
		"drawer":
			_drawer(ci, rect, h)
		"ledger":
			_ledger(ci, rect, h)


func _grain(ci: RID, r: Rect2, h: int, base: Color, vertical: bool) -> void:
	var rs := RenderingServer
	var n := int((r.size.x if vertical else r.size.y) / 7.0)
	for i in n:
		var t := (float(i) + 0.5 + (_u(h, i) - 0.5) * 0.8) / n
		var c := Color(base.darkened(0.25 + 0.2 * _u(h, i + 50)), 0.35 + 0.3 * _u(h, i + 90))
		var pts := PackedVector2Array()
		var steps := 8
		for k in steps + 1:
			var s := float(k) / steps
			var wob := sin(s * 6.0 + _u(h, i + 200) * 6.0) * 2.0 * _u(h, i + 300)
			if vertical:
				pts.append(Vector2(r.position.x + t * r.size.x + wob, r.position.y + s * r.size.y))
			else:
				pts.append(Vector2(r.position.x + s * r.size.x, r.position.y + t * r.size.y + wob))
		rs.canvas_item_add_polyline(ci, pts, PackedColorArray([c]), 1.0)
	# A knot or two.
	if _u(h, 999) > 0.4:
		var kp := r.position + Vector2(_u(h, 998) * r.size.x, _u(h, 997) * r.size.y)
		rs.canvas_item_add_circle(ci, kp, 5.0 + 4.0 * _u(h, 996), base.darkened(0.4))
		rs.canvas_item_add_circle(ci, kp, 2.5, base.darkened(0.55))


func _planks(ci: RID, r: Rect2, h: int) -> void:
	var rs := RenderingServer
	rs.canvas_item_add_rect(ci, r, Color(0.07, 0.05, 0.035))
	var tones := [Color(0.36, 0.24, 0.15), Color(0.31, 0.21, 0.13), Color(0.4, 0.28, 0.17)]
	var x := r.position.x
	var i := 0
	while x < r.end.x:
		var w := 72.0 + 40.0 * _u(h, i)
		var bw := minf(w, r.end.x - x)
		var b := Rect2(x + 1.5, r.position.y, bw - 3.0, r.size.y)
		var base: Color = tones[(i + int(_u(h, i + 20) * 3.0)) % 3]
		rs.canvas_item_add_rect(ci, b, base)
		# Light down one edge of each board, shadow down the other.
		rs.canvas_item_add_rect(ci, Rect2(b.position.x, b.position.y, 2.0, b.size.y), base.lightened(0.12))
		rs.canvas_item_add_rect(ci, Rect2(b.end.x - 3.0, b.position.y, 3.0, b.size.y), base.darkened(0.25))
		_grain(ci, b.grow_individual(-4, 0, -4, 0), h + i * 31, base, true)
		for ny in [r.position.y + 22.0, r.end.y - 22.0]:
			for nx in [b.position.x + 10.0, b.end.x - 12.0]:
				rs.canvas_item_add_circle(ci, Vector2(nx, ny), 3.2, Color(0.1, 0.08, 0.07))
				rs.canvas_item_add_circle(ci, Vector2(nx - 0.8, ny - 0.8), 1.4, Color(0.55, 0.5, 0.45, 0.8))
		x += w
		i += 1
	# A cross rail along the top and the bottom.
	for y in [r.position.y + 6.0, r.end.y - 34.0]:
		var rail := Rect2(r.position.x, y, r.size.x, 28.0)
		rs.canvas_item_add_rect(ci, rail, Color(0.3, 0.2, 0.12))
		rs.canvas_item_add_rect(ci, Rect2(rail.position.x, rail.position.y, rail.size.x, 2.0), Color(0.45, 0.32, 0.2))
		rs.canvas_item_add_rect(ci, Rect2(rail.position.x, rail.end.y - 3.0, rail.size.x, 3.0), Color(0.12, 0.08, 0.05))
	# Darker toward the corners, like a dim room.
	rs.canvas_item_add_rect(ci, Rect2(r.position, Vector2(r.size.x, 40)), Color(0, 0, 0, 0.18))
	rs.canvas_item_add_rect(ci, Rect2(r.position.x, r.end.y - 40, r.size.x, 40), Color(0, 0, 0, 0.2))


func _pegboard(ci: RID, r: Rect2, h: int) -> void:
	var rs := RenderingServer
	rs.canvas_item_add_rect(ci, Rect2(r.position + Vector2(4, 6), r.size), Color(0, 0, 0, 0.4))
	rs.canvas_item_add_rect(ci, r, Color(0.2, 0.13, 0.08))
	var inner := r.grow(-10.0)
	var board := Color(0.55, 0.4, 0.26)
	rs.canvas_item_add_rect(ci, inner, board)
	# Faint mottling of the hardboard.
	for i in 40:
		var p := inner.position + Vector2(_u(h, i * 2) * inner.size.x, _u(h, i * 2 + 1) * inner.size.y)
		rs.canvas_item_add_circle(ci, p, 10.0 + 18.0 * _u(h, i + 400), Color(board.darkened(0.15), 0.12))
	var step := 26.0
	var y := inner.position.y + step * 0.5
	while y < inner.end.y:
		var x := inner.position.x + step * 0.5
		while x < inner.end.x:
			rs.canvas_item_add_circle(ci, Vector2(x, y), 3.2, Color(0.14, 0.09, 0.05))
			rs.canvas_item_add_circle(ci, Vector2(x, y + 1.2), 2.0, Color(0.08, 0.05, 0.03))
			x += step
		y += step
	# The frame's bevel.
	rs.canvas_item_add_rect(ci, Rect2(r.position.x, r.position.y, r.size.x, 3.0), Color(0.36, 0.24, 0.15))
	rs.canvas_item_add_rect(ci, Rect2(r.position.x, r.position.y, 3.0, r.size.y), Color(0.32, 0.22, 0.13))


func _cabinet(ci: RID, r: Rect2, h: int) -> void:
	var rs := RenderingServer
	rs.canvas_item_add_rect(ci, Rect2(r.position + Vector2(5, 7), r.size), Color(0, 0, 0, 0.45))
	var c := Color(0.22, 0.14, 0.09)
	rs.canvas_item_add_rect(ci, r, c)
	_grain(ci, r.grow(-3), h, c.lightened(0.15), true)
	rs.canvas_item_add_rect(ci, Rect2(r.position.x, r.position.y, r.size.x, 4.0), c.lightened(0.25))
	rs.canvas_item_add_rect(ci, Rect2(r.position.x, r.end.y - 5.0, r.size.x, 5.0), c.darkened(0.4))


func _drawer(ci: RID, r: Rect2, h: int) -> void:
	var rs := RenderingServer
	var c := color.lightened(0.1) if lit else color
	rs.canvas_item_add_rect(ci, r, Color(0.06, 0.04, 0.03))
	var f := r.grow(-3.0)
	rs.canvas_item_add_rect(ci, f, c)
	_grain(ci, f.grow(-2), h, c, false)
	# Bevel: light top and left, dark bottom and right.
	rs.canvas_item_add_rect(ci, Rect2(f.position.x, f.position.y, f.size.x, 2.5), c.lightened(0.22))
	rs.canvas_item_add_rect(ci, Rect2(f.position.x, f.position.y, 2.5, f.size.y), c.lightened(0.15))
	rs.canvas_item_add_rect(ci, Rect2(f.position.x, f.end.y - 3.0, f.size.x, 3.0), c.darkened(0.35))
	rs.canvas_item_add_rect(ci, Rect2(f.end.x - 3.0, f.position.y, 3.0, f.size.y), c.darkened(0.3))
	# The brass pull, under the label.
	var pc := Vector2(f.get_center().x, f.end.y - 13.0)
	rs.canvas_item_add_circle(ci, pc + Vector2(0, 1.5), 9.0, Color(0, 0, 0, 0.4))
	rs.canvas_item_add_circle(ci, pc, 8.0, Color(0.42, 0.28, 0.11))
	rs.canvas_item_add_circle(ci, pc, 6.0, Color(0.75, 0.54, 0.24))
	rs.canvas_item_add_circle(ci, pc + Vector2(-2, -2), 2.0, Color(0.98, 0.84, 0.5))


func _ledger(ci: RID, r: Rect2, h: int) -> void:
	var rs := RenderingServer
	rs.canvas_item_add_rect(ci, Rect2(r.position + Vector2(5, 8), r.size), Color(0, 0, 0, 0.45))
	# The cloth binding, a little bigger than the pages.
	rs.canvas_item_add_rect(ci, r, Color(0.34, 0.1, 0.08))
	rs.canvas_item_add_rect(ci, Rect2(r.position.x, r.position.y, r.size.x, 3.0), Color(0.5, 0.18, 0.13))
	var pages := r.grow(-9.0)
	var mid := pages.get_center().x
	for side in [-1, 1]:
		var pr := Rect2(pages.position.x, pages.position.y, pages.size.x * 0.5, pages.size.y) if side < 0 else Rect2(mid, pages.position.y, pages.size.x * 0.5, pages.size.y)
		rs.canvas_item_add_rect(ci, pr, Color(0.93, 0.88, 0.76))
		# Ruled lines and the red double margin.
		var y := pr.position.y + 30.0
		while y < pr.end.y - 8.0:
			rs.canvas_item_add_line(ci, Vector2(pr.position.x + 8.0, y), Vector2(pr.end.x - 8.0, y), Color(0.35, 0.45, 0.55, 0.22), 1.0)
			y += 24.0
		var mx := pr.position.x + 82.0 if side < 0 else pr.position.x + 82.0
		rs.canvas_item_add_line(ci, Vector2(mx, pr.position.y), Vector2(mx, pr.end.y), Color(0.71, 0.2, 0.165, 0.35), 1.0)
		rs.canvas_item_add_line(ci, Vector2(mx + 3.0, pr.position.y), Vector2(mx + 3.0, pr.end.y), Color(0.71, 0.2, 0.165, 0.22), 1.0)
		# Foxing.
		for i in 3:
			var fp := pr.position + Vector2(_u(h, i * 3 + side * 7) * pr.size.x, _u(h, i * 3 + 1 + side * 7) * pr.size.y)
			rs.canvas_item_add_circle(ci, fp, 6.0 + 8.0 * _u(h, i + 40), Color(0.62, 0.45, 0.22, 0.05))
	# The gutter: shadow either side of the spine.
	for k in 10:
		var a := 0.22 * (1.0 - k / 10.0)
		rs.canvas_item_add_rect(ci, Rect2(mid - k * 2.2 - 2.2, pages.position.y, 2.2, pages.size.y), Color(0.2, 0.12, 0.05, a))
		rs.canvas_item_add_rect(ci, Rect2(mid + k * 2.2, pages.position.y, 2.2, pages.size.y), Color(0.2, 0.12, 0.05, a))
