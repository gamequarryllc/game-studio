class_name CardStyle
extends StyleBox
## A piece of cut cardboard (or paper), drawn for any panel or button: slightly
## irregular edges (cut by hand, never the same twice), faint corrugation lines,
## a darker cut edge, a soft drop shadow, and optionally strips of masking tape on
## its corners or a luggage-tag hole. Everything is seeded by `seed`, so a panel
## keeps its shape from frame to frame.

@export var fill := Color(0.78, 0.6, 0.39)
@export var edge := Color(0.45, 0.3, 0.17)
@export var seed := 1
@export var wobble := 2.4                # how far corners wander, in pixels
@export var tape_corners := 0            # 0 none, 1 top-left, 2 both top corners, 3 top-right only
@export var tape_color := Color(0.91, 0.85, 0.66, 0.9)
@export var lines := true                # corrugation
@export var shadow := Vector2(3, 4)
@export var shadow_alpha := 0.32
@export var hole := false                # a luggage tag: a punched hole at the left
@export var notch := false               # and its corners clipped


func _init() -> void:
	content_margin_left = 16
	content_margin_right = 16
	content_margin_top = 10
	content_margin_bottom = 10


func _outline(rect: Rect2) -> PackedVector2Array:
	var r := RandomNumberGenerator.new()
	r.seed = seed * 7919 + int(rect.size.x) * 31 + int(rect.size.y)
	var w := wobble
	var p := PackedVector2Array()
	var a := rect.position
	var b := rect.end
	var corners: Array
	if notch:
		var c := minf(rect.size.y * 0.28, 14.0)
		corners = [Vector2(a.x + c, a.y), Vector2(b.x, a.y), Vector2(b.x, b.y), Vector2(a.x + c, b.y), Vector2(a.x, b.y - c), Vector2(a.x, a.y + c)]
	else:
		corners = [a, Vector2(b.x, a.y), b, Vector2(a.x, b.y)]
	for k in corners.size():
		var c0: Vector2 = corners[k] + Vector2(r.randf_range(-w, w), r.randf_range(-w, w))
		var c1: Vector2 = corners[(k + 1) % corners.size()]
		p.append(c0)
		# A couple of in-between points so long edges aren't ruler straight.
		var steps := clampi(int(c0.distance_to(c1) / 90.0), 0, 4)
		for s in steps:
			var t := float(s + 1) / float(steps + 1)
			var q := c0.lerp(c1, t)
			var nrm := (c1 - c0).normalized().orthogonal()
			p.append(q + nrm * r.randf_range(-w * 0.5, w * 0.5))
	return p


func _draw(to_canvas_item: RID, rect: Rect2) -> void:
	var rs := RenderingServer
	var pts := _outline(rect)
	if shadow_alpha > 0.0:
		var sp := PackedVector2Array()
		for q in pts:
			sp.append(q + shadow)
		rs.canvas_item_add_polygon(to_canvas_item, sp, PackedColorArray([Color(0, 0, 0, shadow_alpha)]))
	rs.canvas_item_add_polygon(to_canvas_item, pts, PackedColorArray([fill]))
	if lines and rect.size.y > 18.0:
		var lc := Color(fill.darkened(0.07), 0.6)
		var y := rect.position.y + 7.0
		while y < rect.end.y - 5.0:
			rs.canvas_item_add_line(to_canvas_item, Vector2(rect.position.x + 6, y), Vector2(rect.end.x - 6, y), lc, 1.0)
			y += 6.0
	var closed := pts.duplicate()
	closed.append(pts[0])
	rs.canvas_item_add_polyline(to_canvas_item, closed, PackedColorArray([edge]), 2.0, true)
	if hole:
		var c := Vector2(rect.position.x + 15.0, rect.position.y + rect.size.y * 0.5)
		rs.canvas_item_add_circle(to_canvas_item, c, 6.0, edge)
		rs.canvas_item_add_circle(to_canvas_item, c, 4.0, Color(0.13, 0.12, 0.12, 0.85))
	var r := RandomNumberGenerator.new()
	r.seed = seed * 104729
	if tape_corners == 1 or tape_corners == 2:
		_tape(to_canvas_item, rect.position + Vector2(6, 2), -0.62 + r.randf_range(-0.12, 0.12), r)
	if tape_corners == 2 or tape_corners == 3:
		_tape(to_canvas_item, Vector2(rect.end.x - 6, rect.position.y + 2), 0.62 + r.randf_range(-0.12, 0.12), r)


func _tape(ci: RID, at: Vector2, angle: float, r: RandomNumberGenerator) -> void:
	var w := 44.0 + r.randf_range(-6, 6)
	var h := 15.0
	var dir := Vector2(cos(angle), sin(angle))
	var nrm := dir.orthogonal()
	var p := PackedVector2Array()
	var teeth := 3
	for k in teeth + 1:
		p.append(at - dir * (w * 0.5 + r.randf_range(-2.5, 2.5)) + nrm * (h * (0.5 - float(k) / teeth)))
	for k in teeth + 1:
		p.append(at + dir * (w * 0.5 + r.randf_range(-2.5, 2.5)) + nrm * (h * (-0.5 + float(k) / teeth)))
	RenderingServer.canvas_item_add_polygon(ci, p, PackedColorArray([tape_color]))


func copy_with(f: Color, s: int) -> CardStyle:
	var c := duplicate() as CardStyle
	c.fill = f
	c.seed = s
	return c
