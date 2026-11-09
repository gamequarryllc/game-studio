class_name PaperBox
extends StyleBox
## Paper, drawn in code: a slightly deckled edge (no two the same), a soft
## shadow under it, fibre specks, and optionally a ledger's ruled lines and red
## margin (shop cards), or a punched hole and string (the offer tag).

var color := Color(0.93, 0.88, 0.76)
var shadow := Color(0.0, 0.0, 0.0, 0.35)
var ledger := false
var hole := false
var seed := 0
var wobble := 1.3
var pressed := false
var ink := Color(0.42, 0.29, 0.18)


static func _hash(x: int) -> int:
	x = ((x >> 16) ^ x) * 0x45d9f3b
	x = ((x >> 16) ^ x) * 0x45d9f3b
	return ((x >> 16) ^ x) & 0x7fffffff


static func _u(h: int, i: int) -> float:
	return float((_hash(h + i * 7919) >> 4) & 1023) / 1023.0


func _outline(r: Rect2, h: int) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var step := 14.0
	var nx := maxi(2, int(r.size.x / step))
	var ny := maxi(2, int(r.size.y / step))
	var k := 0
	for i in nx:
		pts.append(Vector2(r.position.x + r.size.x * i / nx, r.position.y + (_u(h, k) - 0.5) * wobble))
		k += 1
	for i in ny:
		pts.append(Vector2(r.end.x + (_u(h, k) - 0.5) * wobble, r.position.y + r.size.y * i / ny))
		k += 1
	for i in nx:
		pts.append(Vector2(r.end.x - r.size.x * i / nx, r.end.y + (_u(h, k) - 0.5) * wobble))
		k += 1
	for i in ny:
		pts.append(Vector2(r.position.x + (_u(h, k) - 0.5) * wobble, r.end.y - r.size.y * i / ny))
		k += 1
	return pts


func _draw(ci: RID, rect: Rect2) -> void:
	if rect.size.x < 6.0 or rect.size.y < 6.0:
		return
	var rs := RenderingServer
	var h := _hash(int(rect.size.x) * 17 + int(rect.size.y) * 29 + seed * 977)
	var r := rect.grow(-1.0)
	if shadow.a > 0.0 and not pressed:
		var sh := _outline(r.grow(0.5), h)
		for i in sh.size():
			sh[i] += Vector2(2.0, 3.0)
		var sc := PackedColorArray()
		sc.resize(sh.size())
		sc.fill(shadow)
		rs.canvas_item_add_polygon(ci, sh, sc)
	var poly := _outline(r, h)
	var cols := PackedColorArray()
	var c0 := color if not pressed else color.darkened(0.08)
	for p in poly:
		var t := clampf((p.y - r.position.y) / maxf(r.size.y, 1.0), 0.0, 1.0)
		cols.append(c0.lerp(c0.darkened(0.07), t))
	rs.canvas_item_add_polygon(ci, poly, cols)
	# Edge toning: paper goes a little darker at its edges.
	var edge := poly.duplicate()
	edge.append(edge[0])
	rs.canvas_item_add_polyline(ci, edge, PackedColorArray([Color(ink, 0.35)]), 1.2, true)
	if ledger:
		var y := r.position.y + 26.0
		while y < r.end.y - 6.0:
			rs.canvas_item_add_line(ci, Vector2(r.position.x + 6.0, y), Vector2(r.end.x - 6.0, y), Color(ink, 0.13), 1.0)
			y += 22.0
		var mx := r.position.x + 92.0
		rs.canvas_item_add_line(ci, Vector2(mx, r.position.y + 2.0), Vector2(mx, r.end.y - 2.0), Color(0.71, 0.2, 0.165, 0.32), 1.0)
		rs.canvas_item_add_line(ci, Vector2(mx + 3.0, r.position.y + 2.0), Vector2(mx + 3.0, r.end.y - 2.0), Color(0.71, 0.2, 0.165, 0.2), 1.0)
	# Fibres and the odd foxing spot.
	var area := r.size.x * r.size.y
	for i in clampi(int(area / 420.0), 0, 120):
		var p := r.position + Vector2(_u(h, 100 + i * 2) * r.size.x, _u(h, 101 + i * 2) * r.size.y)
		rs.canvas_item_add_rect(ci, Rect2(p, Vector2(1.5, 1.0)), Color(ink, 0.12))
	if _u(h, 900) > 0.55 and r.size.x > 120.0:
		var fp := r.position + Vector2((0.2 + 0.6 * _u(h, 901)) * r.size.x, (0.2 + 0.6 * _u(h, 902)) * r.size.y)
		rs.canvas_item_add_circle(ci, fp, 5.0 + 6.0 * _u(h, 903), Color(0.62, 0.45, 0.22, 0.06))
	if hole:
		var hp := Vector2(r.position.x + 16.0, r.position.y + r.size.y * 0.5)
		rs.canvas_item_add_circle(ci, hp, 5.5, Color(ink, 0.5))
		rs.canvas_item_add_circle(ci, hp, 4.0, Color(0.1, 0.08, 0.06, 0.9))
