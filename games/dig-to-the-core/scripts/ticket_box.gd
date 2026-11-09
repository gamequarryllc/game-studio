class_name TicketBox
extends StyleBox
## Two looks for buttons that cost something:
##  - kind "ticket": a cream admission ticket with a bite out of each end and a
##    perforated stub (the "watch a short ad" buttons; the red play stamp is the
##    button's icon).
##  - kind "stamp": an ink stamp on paper, a double ruled box knocked a little
##    crooked, in signal red (prices on the shop's ledger cards).

var kind := "ticket"
var color := Color(0.937, 0.89, 0.784)
var ink := Color(0.71, 0.2, 0.165)
var rim := Color(0.141, 0.11, 0.09)
var pressed := false
var seed := 0
var tilt := 0.0             # stamps: radians


static func _hash(x: int) -> int:
	x = ((x >> 16) ^ x) * 0x45d9f3b
	x = ((x >> 16) ^ x) * 0x45d9f3b
	return ((x >> 16) ^ x) & 0x7fffffff


static func _u(h: int, i: int) -> float:
	return float((_hash(h + i * 7919) >> 4) & 1023) / 1023.0


func _draw(ci: RID, rect: Rect2) -> void:
	if rect.size.x < 8.0 or rect.size.y < 8.0:
		return
	if kind == "stamp":
		_draw_stamp(ci, rect)
	else:
		_draw_ticket(ci, rect)


func _draw_ticket(ci: RID, rect: Rect2) -> void:
	var rs := RenderingServer
	var r := rect.grow(-1.0)
	var bite := minf(r.size.y * 0.18, 9.0)
	var midy := r.position.y + r.size.y * 0.5
	var pts := PackedVector2Array()
	pts.append(r.position)
	pts.append(Vector2(r.end.x, r.position.y))
	for i in 9:
		var a := -PI * 0.5 + PI * i / 8.0
		pts.append(Vector2(r.end.x - cos(a) * bite, midy + sin(a) * bite))
	pts.append(r.end)
	pts.append(Vector2(r.position.x, r.end.y))
	for i in 9:
		var a := PI * 0.5 - PI * i / 8.0
		pts.append(Vector2(r.position.x + cos(a) * bite, midy + sin(a) * bite))
	var sh := pts.duplicate()
	for i in sh.size():
		sh[i] += Vector2(2.0, 3.0)
	var sc := PackedColorArray()
	sc.resize(sh.size())
	sc.fill(Color(0, 0, 0, 0.3 if not pressed else 0.0))
	rs.canvas_item_add_polygon(ci, sh, sc)
	var cols := PackedColorArray()
	var c0 := color if not pressed else color.darkened(0.1)
	for p in pts:
		cols.append(c0.lerp(c0.darkened(0.08), clampf((p.y - r.position.y) / r.size.y, 0.0, 1.0)))
	rs.canvas_item_add_polygon(ci, pts, cols)
	var ol := pts.duplicate()
	ol.append(ol[0])
	rs.canvas_item_add_polyline(ci, ol, PackedColorArray([rim]), 2.0, true)
	# Perforations between the stub and the ticket.
	var px := r.position.x + minf(46.0, r.size.x * 0.22)
	var y := r.position.y + 5.0
	while y < r.end.y - 5.0:
		rs.canvas_item_add_rect(ci, Rect2(px, y, 1.6, 3.0), Color(rim, 0.55))
		y += 6.0
	# A thin inner frame, printed.
	var inner := Rect2(px + 5.0, r.position.y + 4.0, r.end.x - px - 5.0 - bite - 4.0, r.size.y - 8.0)
	if inner.size.x > 10.0:
		rs.canvas_item_add_polyline(ci, PackedVector2Array([inner.position, Vector2(inner.end.x, inner.position.y), inner.end,
			Vector2(inner.position.x, inner.end.y), inner.position]), PackedColorArray([Color(ink, 0.45)]), 1.0, true)


func _draw_stamp(ci: RID, rect: Rect2) -> void:
	var rs := RenderingServer
	var h := _hash(int(rect.size.x) * 11 + int(rect.size.y) * 3 + seed * 313)
	var c := rect.get_center()
	var a := tilt
	var xf := Transform2D(a, c)
	rs.canvas_item_add_set_transform(ci, xf)
	var hs := rect.size * 0.5 - Vector2(3, 3)
	var fill := Color(ink, 0.1 if not pressed else 0.24)
	rs.canvas_item_add_rect(ci, Rect2(-hs, hs * 2.0), fill)
	for ring in 2:
		var g := 0.0 if ring == 0 else 4.0
		var pts := PackedVector2Array()
		var corners := [Vector2(-hs.x + g, -hs.y + g), Vector2(hs.x - g, -hs.y + g), Vector2(hs.x - g, hs.y - g), Vector2(-hs.x + g, hs.y - g)]
		for i in 4:
			var p0: Vector2 = corners[i]
			var p1: Vector2 = corners[(i + 1) % 4]
			for k in 6:
				var t := float(k) / 6.0
				pts.append(p0.lerp(p1, t) + Vector2(_u(h, i * 13 + k + ring * 97) - 0.5, _u(h, i * 17 + k + ring * 89) - 0.5) * 1.2)
		pts.append(pts[0])
		var ic := Color(ink, 0.85 if ring == 0 else 0.55)
		rs.canvas_item_add_polyline(ci, pts, PackedColorArray([ic]), 2.2 if ring == 0 else 1.2, true)
	# Ink that didn't take: a few gaps.
	for i in 4:
		var p := Vector2((_u(h, 500 + i) - 0.5) * hs.x * 2.0, (-1.0 if i % 2 == 0 else 1.0) * hs.y)
		rs.canvas_item_add_rect(ci, Rect2(p - Vector2(3, 2), Vector2(4.0 + 6.0 * _u(h, 600 + i), 4)), Color(0.93, 0.88, 0.76, 0.7))
	rs.canvas_item_add_set_transform(ci, Transform2D())
