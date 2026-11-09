class_name EnamelBox
extends StyleBox
## A vitreous-enamel sign, drawn in code: rounded corners, a soot rim, a fine
## border line inset from the edge (like the stripe on old mine signs), a soft
## gloss along the top, and chips knocked out of the enamel where the dark iron
## shows through. No rivets: enamel signs are screwed on, and the screws are
## under the enamel. Each sign chips differently (seed).

var color := Color(0.937, 0.89, 0.784)
var edge := Color(0.141, 0.11, 0.09)       # the inset border line
var rim := Color(0.06, 0.05, 0.04)
var radius := 8.0
var chips := 3
var seed := 0
var pressed := false
var border_line := true


static func _hash(x: int) -> int:
	x = ((x >> 16) ^ x) * 0x45d9f3b
	x = ((x >> 16) ^ x) * 0x45d9f3b
	return ((x >> 16) ^ x) & 0x7fffffff


static func _u(h: int, i: int) -> float:
	return float((_hash(h + i * 7919) >> 4) & 1023) / 1023.0


static func rounded(r: Rect2, rad: float, steps: int = 4) -> PackedVector2Array:
	rad = minf(rad, minf(r.size.x, r.size.y) * 0.5)
	var pts := PackedVector2Array()
	var cs := [Vector2(r.end.x - rad, r.position.y + rad), Vector2(r.end.x - rad, r.end.y - rad),
		Vector2(r.position.x + rad, r.end.y - rad), Vector2(r.position.x + rad, r.position.y + rad)]
	for c in 4:
		var a0 := -PI * 0.5 + c * PI * 0.5
		for i in steps + 1:
			var a := a0 + PI * 0.5 * float(i) / steps
			pts.append((cs[c] as Vector2) + Vector2(cos(a), sin(a)) * rad)
	return pts


func _draw(ci: RID, rect: Rect2) -> void:
	if rect.size.x < 6.0 or rect.size.y < 6.0:
		return
	var rs := RenderingServer
	var outer := rounded(rect, radius)
	var rim_cols := PackedColorArray()
	rim_cols.resize(outer.size())
	rim_cols.fill(rim)
	rs.canvas_item_add_polygon(ci, outer, rim_cols)
	var fill_r := rect.grow(-2.0)
	var fill := rounded(fill_r, radius - 1.5)
	var top := color.lightened(0.08) if not pressed else color.darkened(0.1)
	var bottom := color.darkened(0.14) if not pressed else color.darkened(0.04)
	var cols := PackedColorArray()
	for p in fill:
		cols.append(top.lerp(bottom, clampf((p.y - fill_r.position.y) / maxf(fill_r.size.y, 1.0), 0.0, 1.0)))
	rs.canvas_item_add_polygon(ci, fill, cols)
	if border_line and fill_r.size.x > 30.0 and fill_r.size.y > 18.0:
		var inner := rounded(fill_r.grow(-3.5), maxf(radius - 4.0, 2.0))
		inner.append(inner[0])
		var ec := Color(edge, 0.75)
		rs.canvas_item_add_polyline(ci, inner, PackedColorArray([ec]), 1.4, true)
	if not pressed:
		var gl := Color(1, 1, 1, 0.16)
		rs.canvas_item_add_line(ci, Vector2(fill_r.position.x + radius, fill_r.position.y + 2.5),
			Vector2(fill_r.position.x + fill_r.size.x * 0.55, fill_r.position.y + 2.5), gl, 2.0)
	# Chips: little irregular patches of bare iron on the edge.
	var h := _hash(int(rect.size.x) * 13 + int(rect.size.y) * 7 + seed * 131)
	for i in chips:
		var along := _u(h, i * 5)
		var side := int(_u(h, i * 5 + 1) * 4.0)
		var at: Vector2
		match side:
			0:
				at = Vector2(fill_r.position.x + radius + along * (fill_r.size.x - 2.0 * radius), fill_r.position.y + 1.0)
			1:
				at = Vector2(fill_r.end.x - 1.0, fill_r.position.y + radius + along * (fill_r.size.y - 2.0 * radius))
			2:
				at = Vector2(fill_r.position.x + radius + along * (fill_r.size.x - 2.0 * radius), fill_r.end.y - 1.0)
			_:
				at = Vector2(fill_r.position.x + 1.0, fill_r.position.y + radius + along * (fill_r.size.y - 2.0 * radius))
		var sz := 2.5 + 4.0 * _u(h, i * 5 + 2)
		var poly := PackedVector2Array()
		for k in 6:
			var a := TAU * k / 6.0 + _u(h, i * 5 + 3) * 2.0
			poly.append(at + Vector2(cos(a), sin(a)) * sz * (0.6 + 0.5 * _u(h, i * 31 + k)))
		var cc := PackedColorArray()
		cc.resize(poly.size())
		cc.fill(Color(rim.lerp(Color(0.3, 0.27, 0.24), 0.4), 0.95))
		rs.canvas_item_add_polygon(ci, poly, cc)
