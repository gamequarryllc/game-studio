class_name RivetBox
extends StyleBox
## A riveted metal plate, drawn in code: a dark rim, a fill shaded from light
## at the top to dark at the bottom, a glint along the top edge, chamfered
## corners and a rivet in each. With `inset_color` set, an inner window is
## cut into it (a dark iron panel in a brass frame, a gauge's glass).

var color := Color(0.8, 0.6, 0.29)
var rim := Color(0.06, 0.05, 0.04)
var rim_width := 3.0
var chamfer := 9.0
var rivets := true
var rivet_inset := 8.0
var rivet_radius := 3.2
var gloss := true
var pressed := false
var inset := 0.0
var inset_color := Color(0, 0, 0, 0)
var wear := 1.0          # grain, scratches and chipped paint (0 = factory new)
var seed := 0            # each plate wears differently


func _chamfered(r: Rect2, c: float) -> PackedVector2Array:
	## A chamfered outline whose corners are cut a little unevenly, so no two
	## plates are identical (hand-cut sheet metal).
	c = minf(c, minf(r.size.x, r.size.y) * 0.5)
	var a := r.position
	var b := r.end
	var h := _hash(int(r.size.x) * 31 + int(r.size.y) * 17 + seed)
	var k := [1.0 + 0.35 * _u(h, 0), 1.0 + 0.35 * _u(h, 1), 1.0 + 0.35 * _u(h, 2), 1.0 + 0.35 * _u(h, 3)]
	return PackedVector2Array([
		Vector2(a.x + c * k[0], a.y), Vector2(b.x - c * k[1], a.y), Vector2(b.x, a.y + c * k[1]), Vector2(b.x, b.y - c * k[2]),
		Vector2(b.x - c * k[2], b.y), Vector2(a.x + c * k[3], b.y), Vector2(a.x, b.y - c * k[3]), Vector2(a.x, a.y + c * k[0])])


static func _hash(x: int) -> int:
	x = ((x >> 16) ^ x) * 0x45d9f3b
	x = ((x >> 16) ^ x) * 0x45d9f3b
	return ((x >> 16) ^ x) & 0x7fffffff


static func _u(h: int, i: int) -> float:
	return float((_hash(h + i * 7919) >> 4) & 1023) / 1023.0


func _shaded(pts: PackedVector2Array, top: Color, bottom: Color, r: Rect2) -> PackedColorArray:
	var cols := PackedColorArray()
	for p in pts:
		var t := clampf((p.y - r.position.y) / maxf(r.size.y, 1.0), 0.0, 1.0)
		cols.append(top.lerp(bottom, t))
	return cols


func _draw(ci: RID, rect: Rect2) -> void:
	if rect.size.x < 4.0 or rect.size.y < 4.0:
		return
	var rs := RenderingServer
	var outer := _chamfered(rect, chamfer)
	rs.canvas_item_add_polygon(ci, outer, PackedColorArray([rim, rim, rim, rim, rim, rim, rim, rim]))
	var fill_r := rect.grow(-rim_width)
	var fill := _chamfered(fill_r, chamfer - rim_width * 0.5)
	var top := color.lightened(0.16) if not pressed else color.darkened(0.12)
	var bottom := color.darkened(0.3) if not pressed else color.darkened(0.05)
	rs.canvas_item_add_polygon(ci, fill, _shaded(fill, top, bottom, fill_r))
	if gloss and not pressed and fill_r.size.x > 2.0 * chamfer:
		var gl := color.lightened(0.55)
		gl.a = 0.7
		rs.canvas_item_add_line(ci, Vector2(fill_r.position.x + chamfer, fill_r.position.y + 1.5),
			Vector2(fill_r.end.x - chamfer, fill_r.position.y + 1.5), gl, 2.0)
	if inset > 0.0 and inset_color.a > 0.0:
		var in_r := fill_r.grow(-inset)
		var shadow := _chamfered(in_r.grow(1.5), maxf(chamfer - inset, 3.0))
		rs.canvas_item_add_polygon(ci, shadow, PackedColorArray([rim, rim, rim, rim, rim, rim, rim, rim]))
		var win := _chamfered(in_r, maxf(chamfer - inset, 3.0))
		rs.canvas_item_add_polygon(ci, win, _shaded(win, inset_color.lightened(0.06), inset_color.darkened(0.25), in_r))
	if wear > 0.0:
		_draw_wear(ci, fill_r)
	if rivets and rect.size.x > rivet_inset * 4.0 and rect.size.y > rivet_inset * 2.5:
		var ri := rivet_inset + rim_width
		var dark := Color(rim, 1.0)
		var base := color.darkened(0.1)
		var hi := color.lightened(0.5)
		for p in [Vector2(rect.position.x + ri, rect.position.y + ri), Vector2(rect.end.x - ri, rect.position.y + ri),
				Vector2(rect.position.x + ri, rect.end.y - ri), Vector2(rect.end.x - ri, rect.end.y - ri)]:
			rs.canvas_item_add_circle(ci, p, rivet_radius + 1.2, dark)
			rs.canvas_item_add_circle(ci, p, rivet_radius, base)
			rs.canvas_item_add_circle(ci, p + Vector2(-rivet_radius * 0.3, -rivet_radius * 0.3), rivet_radius * 0.45, hi)


func _draw_wear(ci: RID, r: Rect2) -> void:
	## Grain specks, a few fine scratches, and chipped paint at the edges.
	var rs := RenderingServer
	var h := _hash(int(r.size.x * 7.0) + int(r.size.y * 13.0) + seed * 101)
	var area := r.size.x * r.size.y
	var specks := clampi(int(area / 180.0 * wear), 0, 160)
	var dark := Color(0, 0, 0, 0.13)
	var light := Color(1, 1, 1, 0.07)
	for i in specks:
		var p := r.position + Vector2(_u(h, i * 3) * r.size.x, _u(h, i * 3 + 1) * r.size.y)
		rs.canvas_item_add_rect(ci, Rect2(p, Vector2(1.5, 1.5)), dark if (i & 1) == 0 else light)
	var scratches := clampi(int(r.size.x / 70.0 * wear), 0, 8)
	for i in scratches:
		var p := r.position + Vector2(_u(h, 500 + i) * r.size.x, (0.15 + 0.7 * _u(h, 600 + i)) * r.size.y)
		var d := Vector2(10.0 + 30.0 * _u(h, 700 + i), (_u(h, 800 + i) - 0.5) * 6.0)
		rs.canvas_item_add_line(ci, p, p + d, Color(1, 1, 1, 0.08), 1.0)
	# Chips: little bare-metal nicks along the top and bottom edges.
	var chips := clampi(int(r.size.x / 90.0 * wear), 0, 6)
	for i in chips:
		var x := r.position.x + (0.08 + 0.84 * _u(h, 900 + i)) * r.size.x
		var top := (i & 1) == 0
		var y := r.position.y + (1.5 if top else r.size.y - 4.0)
		var w := 3.0 + 6.0 * _u(h, 950 + i)
		rs.canvas_item_add_rect(ci, Rect2(x, y, w, 2.5), Color(rim, 0.55))
