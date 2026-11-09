class_name Surface
extends Node3D
## The sunny field at the top: grass all round the dig site (a 16 x 16 m
## square of the planet you dig), the little supply shack where the shop is,
## the lift's timber headframe with its cage, a rope fence, trees and hills.
## Everything is simple shapes built here; the ground uses the rock shader so
## it matches the dig site's own grass exactly.

const SHACK_POS := Vector3(-16.0, 0.0, -3.0)   # centre of the shack
const SHACK_DOOR := Vector3(-12.4, 0.0, -3.0)  # standing in front of its door
const LIFT_POS := Vector3(-10.9, 0.0, 4.2)     # the cage at the top
const SPAWN := Vector3(-3.5, 0.0, 12.5)
const SHACK_SIZE := Vector3(6.0, 3.2, 5.0)

var body: StaticBody3D
var cage: Node3D
var sheave: Node3D
var rock_material: Material
var _mats := {}


func build(p_rock_material: Material) -> void:
	rock_material = p_rock_material
	body = StaticBody3D.new()
	body.collision_layer = Player.WORLD_LAYER
	body.collision_mask = 0
	add_child(body)
	_build_ground()
	_build_shack()
	_build_headframe()
	_build_fence()
	_build_trees()
	_build_hills()


func _mat(c: Color, rough: float = 0.85, metal: float = 0.0) -> StandardMaterial3D:
	var key := "%s/%s/%s" % [c, rough, metal]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	_mats[key] = m
	return m


func _box(size: Vector3, pos: Vector3, m: Material, rot := Vector3.ZERO, collide := false, parent: Node3D = null) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.material_override = m
	mi.position = pos
	mi.rotation = rot
	(parent if parent != null else self).add_child(mi)
	if collide:
		_collider(size, mi.global_transform if mi.is_inside_tree() else Transform3D(Basis.from_euler(rot), pos))
	return mi


func _collider(size: Vector3, xf: Transform3D) -> void:
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	cs.shape = bs
	cs.transform = xf
	body.add_child(cs)


func _cyl(r0: float, r1: float, h: float, pos: Vector3, m: Material, rot := Vector3.ZERO, seg := 8, parent: Node3D = null) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = r0
	c.bottom_radius = r1
	c.height = h
	c.radial_segments = seg
	c.rings = 1
	mi.mesh = c
	mi.material_override = m
	mi.position = pos
	mi.rotation = rot
	(parent if parent != null else self).add_child(mi)
	return mi


# --- Ground -----------------------------------------------------------------------------------
func _build_ground() -> void:
	## A grid of grass around the hole, flat near the dig site and rolling
	## further out. Vertex colours: grass, trampled dirt near the site and
	## the shack, a path between them.
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var noise := FastNoiseLite.new()
	noise.seed = Balance.WORLD_SEED + 3
	noise.frequency = 0.03
	var step := 4.0
	var n := 50
	var half := n * step * 0.5
	var hfun := func(x: float, z: float) -> float:
		var r := Vector2(x, z).length()
		var rise := smoothstep(34.0, 90.0, r)
		return rise * (6.0 + noise.get_noise_2d(x, z) * 9.0) + rise * rise * 10.0
	for gz in n:
		for gx in n:
			var x0 := -half + gx * step
			var z0 := -half + gz * step
			if x0 >= -DigField.HALF - 0.01 and x0 + step <= DigField.HALF + 0.01 and z0 >= -DigField.HALF - 0.01 and z0 + step <= DigField.HALF + 0.01:
				continue   # the dig site
			var c := [Vector3(x0, 0, z0), Vector3(x0 + step, 0, z0), Vector3(x0 + step, 0, z0 + step), Vector3(x0, 0, z0 + step)]
			for p in c:
				p.y = hfun.call(p.x, p.z)
			var cols: Array = []
			for p in c:
				cols.append(_ground_color(p, noise))
			var nrm: Vector3 = ((c[2] - c[0]) as Vector3).cross(c[1] - c[0]).normalized()
			if nrm.y < 0.0:
				nrm = -nrm
			for t in [[0, 1, 2], [0, 2, 3]]:
				for v in t:
					st.set_color(cols[v])
					st.set_uv(Vector2.ZERO)
					st.set_normal(nrm)
					st.add_vertex(c[v])
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = rock_material
	add_child(mi)
	# Collision: four slabs round the hole (the hole itself is the dig site).
	var h := DigField.HALF
	var far := 40.0
	_collider(Vector3(far * 2, 2, far - h), Transform3D(Basis(), Vector3(0, -1, -(h + far) * 0.5)))
	_collider(Vector3(far * 2, 2, far - h), Transform3D(Basis(), Vector3(0, -1, (h + far) * 0.5)))
	_collider(Vector3(far - h, 2, h * 2), Transform3D(Basis(), Vector3(-(h + far) * 0.5, -1, 0)))
	_collider(Vector3(far - h, 2, h * 2), Transform3D(Basis(), Vector3((h + far) * 0.5, -1, 0)))


func _ground_color(p: Vector3, noise: FastNoiseLite) -> Color:
	var g := DigField.GRASS * (0.9 + 0.22 * noise.get_noise_2d(p.x * 3.0, p.z * 3.0))
	var far := smoothstep(30.0, 80.0, Vector2(p.x, p.z).length())
	g = g.lerp(Color(0.42, 0.6, 0.25), far * 0.5)
	# A worn path from the shack to the lift and the site.
	var path := _seg_dist(Vector2(p.x, p.z), Vector2(SHACK_DOOR.x, SHACK_DOOR.z), Vector2(-8.5, 1.0))
	path = minf(path, _seg_dist(Vector2(p.x, p.z), Vector2(SHACK_DOOR.x, SHACK_DOOR.z), Vector2(LIFT_POS.x, LIFT_POS.z)))
	var dirt := Color(0.5, 0.38, 0.24)
	g = g.lerp(dirt, clampf(1.0 - path / 2.2, 0.0, 1.0) * 0.8)
	return Color(g.r, g.g, g.b, 0.0)


static func _seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var t := clampf((p - a).dot(ab) / maxf(ab.length_squared(), 0.0001), 0.0, 1.0)
	return p.distance_to(a + ab * t)


# --- The shack, the lift, the fence, the trees (Blender models) ----------------------------------
func _place(name: String, pos: Vector3, yaw: float = 0.0, scale: float = 1.0) -> Node3D:
	var n := Models.instance(name)
	n.position = pos
	n.rotation.y = yaw
	n.scale = Vector3.ONE * scale
	add_child(n)
	return n


func _build_shack() -> void:
	_place("shack", SHACK_POS)
	var s := SHACK_SIZE
	_collider(Vector3(s.x + 0.3, s.y + 0.3, s.z + 0.3), Transform3D(Basis(), SHACK_POS + Vector3(0, (s.y + 0.3) * 0.5, 0)))
	# The lettering on its enamel sign, in the woodtype face.
	var sign := Label3D.new()
	sign.text = "Supply Shack"
	sign.font = UiTheme.display_font()
	sign.font_size = 72
	sign.outline_size = 0
	sign.modulate = Color(0.71, 0.2, 0.165)
	sign.pixel_size = 0.0058
	sign.position = SHACK_POS + Vector3(s.x * 0.5 + 0.17, 0.3 + s.y - 0.1, 0)
	sign.rotation = Vector3(0, PI / 2, 0)
	add_child(sign)
	var sub := Label3D.new()
	sub.text = "tools · upgrades · crew"
	sub.font = UiTheme.bold_font()
	sub.font_size = 40
	sub.modulate = Color(0.141, 0.11, 0.09)
	sub.outline_size = 0
	sub.pixel_size = 0.0042
	sub.position = SHACK_POS + Vector3(s.x * 0.5 + 0.17, 0.3 + s.y - 0.3, 0)
	sub.rotation = Vector3(0, PI / 2, 0)
	add_child(sub)
	var lamp := OmniLight3D.new()
	lamp.light_color = Color(1.0, 0.75, 0.4)
	lamp.light_energy = 1.2
	lamp.omni_range = 5.0
	lamp.position = SHACK_POS + Vector3(s.x * 0.5 + 0.8, 2.6, 0.95)
	add_child(lamp)
	# Clutter by the door: crates, a barrel.
	_place("crate", SHACK_POS + Vector3(s.x * 0.5 + 0.9, 0, -1.9), 0.3)
	_place("crate", SHACK_POS + Vector3(s.x * 0.5 + 0.85, 0.7, -1.85), -0.2, 0.75)
	_place("barrel", SHACK_POS + Vector3(s.x * 0.5 + 0.75, 0, 2.05))
	_place("crate", SHACK_POS + Vector3(-s.x * 0.5 - 0.7, 0, 1.6), 1.1)
	_collider(Vector3(1.0, 1.4, 1.0), Transform3D(Basis(), SHACK_POS + Vector3(s.x * 0.5 + 0.9, 0.7, -1.9)))
	_collider(Vector3(0.8, 1.0, 0.8), Transform3D(Basis(), SHACK_POS + Vector3(s.x * 0.5 + 0.75, 0.5, 2.05)))


func _build_headframe() -> void:
	var frame := _place("headframe", LIFT_POS)
	sheave = Models.find(frame, "Sheave")
	if sheave == null:
		sheave = Node3D.new()
	cage = _place("cage", LIFT_POS)
	var w := 1.9
	for c in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
		_collider(Vector3(0.45, 2.2, 0.45), Transform3D(Basis(), LIFT_POS + Vector3(c.x * w, 1.1, c.y * w)))
	# The cage: bars on three sides, open towards the shack (north).
	_collider(Vector3(0.12, 2.5, 2.0), Transform3D(Basis(), LIFT_POS + Vector3(-0.95, 1.25, 0)))
	_collider(Vector3(0.12, 2.5, 2.0), Transform3D(Basis(), LIFT_POS + Vector3(0.95, 1.25, 0)))
	_collider(Vector3(2.0, 2.5, 0.12), Transform3D(Basis(), LIFT_POS + Vector3(0, 1.25, 0.95)))
	var lamp := OmniLight3D.new()
	lamp.light_color = Color(1.0, 0.8, 0.5)
	lamp.light_energy = 0.8
	lamp.omni_range = 3.5
	lamp.position = Vector3(0, 2.2, 0)
	cage.add_child(lamp)
	var label := Label3D.new()
	label.text = "Lift"
	label.font = UiTheme.display_font()
	label.font_size = 64
	label.outline_size = 14
	label.modulate = Color(0.949, 0.71, 0.267)
	label.outline_modulate = Color(0.141, 0.11, 0.09)
	label.pixel_size = 0.006
	label.position = Vector3(0, 2.9, 0)
	label.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	cage.add_child(label)


func _build_fence() -> void:
	## Yellow-and-black posts with a rope round the dig site; a gap on the
	## side by the lift, where you walk in.
	var rope_m := _mat(Color(0.75, 0.62, 0.4), 0.9)
	var h := DigField.HALF + 0.6
	var posts: Array = []
	var n := 6
	for side in 4:
		for i in n:
			var t := -1.0 + 2.0 * float(i) / float(n)
			posts.append(Vector3(t * h, 0, -h).rotated(Vector3.UP, -side * PI / 2))
	var rng := RandomNumberGenerator.new()
	rng.seed = Balance.WORLD_SEED + 9
	for i in posts.size():
		var p: Vector3 = posts[i]
		var q: Vector3 = posts[(i + 1) % posts.size()]
		var gap := p.x < -h + 0.1 and q.x < -h + 0.1 and absf((p.z + q.z) * 0.5) < 4.0
		var post := _place("fence_post", p, rng.randf() * TAU)
		post.rotation.z = rng.randf_range(-0.05, 0.05)   # not every post went in straight
		if gap:
			continue
		var mid := (p + q) * 0.5 + Vector3(0, 0.78, 0)
		var len := p.distance_to(q)
		var rope := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(len, 0.03, 0.03)
		rope.mesh = bm
		rope.material_override = rope_m
		rope.position = mid
		rope.rotation = Vector3(0, -atan2(q.z - p.z, q.x - p.x), 0)
		add_child(rope)


func _build_trees() -> void:
	## Hand-placed groves (sightlines kept open to the shack and the lift)
	## plus a looser scatter further out.
	var groves := [Vector3(-26, 0, -16), Vector3(-30, 0, 10), Vector3(20, 0, -24), Vector3(26, 0, 14), Vector3(4, 0, 30), Vector3(-8, 0, -30)]
	var rng := RandomNumberGenerator.new()
	rng.seed = Balance.WORLD_SEED + 17
	var placed := 0
	for g in groves:
		for k in 6:
			var p: Vector3 = g + Vector3(rng.randf_range(-6, 6), 0, rng.randf_range(-6, 6))
			if p.distance_to(SHACK_POS) < 7.5 or p.distance_to(LIFT_POS) < 6.0 or p.distance_to(SPAWN) < 7.0:
				continue
			var big := rng.randf_range(0.75, 1.4)
			_place("pine" if rng.randf() < 0.65 else "oak", p, rng.randf() * TAU, big)
			_collider(Vector3(0.45, 3.0, 0.45) * big, Transform3D(Basis(), p + Vector3(0, 1.5 * big, 0)))
			placed += 1
	for k in 24:
		var a := rng.randf() * TAU
		var r := rng.randf_range(38.0, 60.0)
		var p := Vector3(cos(a) * r, 0, sin(a) * r)
		p.y = smoothstep(34.0, 90.0, r) * 6.0
		_place("pine" if rng.randf() < 0.7 else "oak", p, rng.randf() * TAU, rng.randf_range(1.0, 1.8))


func _build_hills() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = Balance.WORLD_SEED + 23
	for i in 14:
		var a := float(i) / 14.0 * TAU + rng.randf_range(-0.2, 0.2)
		var r := rng.randf_range(115.0, 150.0)
		var mi := MeshInstance3D.new()
		var sm := SphereMesh.new()
		var rad := rng.randf_range(28.0, 48.0)
		sm.radius = rad
		sm.height = rad * rng.randf_range(0.7, 1.1)
		sm.radial_segments = 14
		sm.rings = 6
		mi.mesh = sm
		mi.material_override = _mat(Color(0.32, 0.5, 0.26).lerp(Color(0.45, 0.58, 0.4), rng.randf() * 0.6))
		mi.position = Vector3(cos(a) * r, -rad * 0.15, sin(a) * r)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
