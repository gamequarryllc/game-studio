class_name Surface
extends Node3D
## The field at the top, late in the afternoon: olive grass round the dig site
## (a 16 x 16 m square of the planet you dig), the supply shack on the west
## side, the timber headframe and its cage on the east side, worn paths
## between them, a timber-post rope fence round the site with one enamel
## "Open shaft" sign at the gap you walk in by, a spoil heap, groves of trees
## and hills that fade into the haze in three steps.
##
## The spawn view is composed: you stand south of the site on the path in,
## the shack at the left of the frame, the headframe at the right, the sign
## and the fence gap in the middle distance. The ground uses the rock shader,
## so its grass matches the dig site's own grass exactly (UV.y = 1 is grass,
## 0 is bare dirt, which the shader paints as packed stones).

const SHACK_POS := Vector3(-15.5, 0.0, 0.5)    # centre of the shack (door on its east side)
const SHACK_DOOR := Vector3(-11.9, 0.0, 0.5)   # standing in front of its door
const LIFT_POS := Vector3(11.0, 0.0, -2.0)     # the cage at the top (open to the west)
const LIFT_EXIT := Vector3(9.1, 0.0, -2.0)     # where the lift sets you down at the top
const LIFT_YAW := PI * 0.5                     # the headframe's back legs point east
const SPAWN := Vector3(3.2, 0.0, 17.0)
const SPAWN_LOOK := Vector3(-2.5, 1.2, -2.0)   # the spawn view looks here
const SHACK_SIZE := Vector3(6.0, 3.2, 5.0)
const GATE_S := Vector2(-1.3, 1.6)             # the fence gap on the south side (x range)
const GATE_W := Vector2(-1.8, 2.6)             # ...and on the west side, towards the shack (z range)
const GATE_E := Vector2(-3.8, -0.4)            # ...and on the east side, by the lift (z range)

const GRASS_DIRT := Color(0.47, 0.35, 0.22)    # packed dirt on the paths (topsoil umber, worn)

var body: StaticBody3D
var cage: Node3D
var sheave: Node3D
var rock_material: Material
var _mats := {}
var _paths: Array = []                         # [a, b, width] in x/z


func build(p_rock_material: Material) -> void:
	rock_material = p_rock_material
	body = StaticBody3D.new()
	body.collision_layer = Player.WORLD_LAYER
	body.collision_mask = 0
	add_child(body)
	_paths = [
		[Vector2(SPAWN.x, SPAWN.z + 6.0), Vector2(0.2, 9.4), 1.5],          # the path in, from the south
		[Vector2(0.2, 9.4), Vector2(-9.4, 9.0), 1.2],                       # round the south-west corner...
		[Vector2(-9.4, 9.0), Vector2(SHACK_DOOR.x, SHACK_DOOR.z), 1.3],      # ...to the shack door
		[Vector2(-9.5, 0.5), Vector2(SHACK_DOOR.x, SHACK_DOOR.z), 1.2],      # the shack to the west gap
		[Vector2(0.2, 9.4), Vector2(9.6, 8.6), 1.1],                         # round the south-east corner...
		[Vector2(9.6, 8.6), Vector2(LIFT_EXIT.x + 0.4, LIFT_EXIT.z), 1.2],   # ...to the lift
	]
	_build_ground()
	_build_shack()
	_build_headframe()
	_build_fence()
	_build_props()
	_build_trees()
	_build_grass()
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


func _collider(size: Vector3, xf: Transform3D) -> void:
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	cs.shape = bs
	cs.transform = xf
	body.add_child(cs)


static func _seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var t := clampf((p - a).dot(ab) / maxf(ab.length_squared(), 0.0001), 0.0, 1.0)
	return p.distance_to(a + ab * t)


func path_amount(x: float, z: float) -> float:
	## 1 on a path's worn middle, 0 off it.
	var best := 0.0
	var p := Vector2(x, z)
	for pa in _paths:
		var d := _seg_dist(p, pa[0], pa[1])
		best = maxf(best, clampf(1.0 - d / float(pa[2]), 0.0, 1.0))
	return best


# --- Ground ------------------------------------------------------------------------------------
static func ground_height(x: float, z: float, noise: FastNoiseLite) -> float:
	var r := Vector2(x, z).length()
	var rise := smoothstep(30.0, 95.0, r)
	return rise * (5.0 + noise.get_noise_2d(x, z) * 8.0) + rise * rise * 9.0


func _build_ground() -> void:
	## Grass round the hole: 1 m squares near the site (so the paths have
	## soft edges), 4 m further out where it rolls up into low hills.
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var noise := FastNoiseLite.new()
	noise.seed = Balance.WORLD_SEED + 3
	noise.frequency = 0.03
	var clump := FastNoiseLite.new()
	clump.seed = Balance.WORLD_SEED + 4
	clump.frequency = 0.21
	for ring in [[-30.0, 30.0, 1.0], [-110.0, 110.0, 4.0]]:
		var lo: float = ring[0]
		var hi: float = ring[1]
		var step: float = ring[2]
		var n := int((hi - lo) / step)
		for gz in n:
			for gx in n:
				var x0 := lo + gx * step
				var z0 := lo + gz * step
				if step > 1.5 and x0 >= -30.0 and x0 + step <= 30.0 and z0 >= -30.0 and z0 + step <= 30.0:
					continue   # the fine ring covers this
				if x0 >= -DigField.HALF - 0.01 and x0 + step <= DigField.HALF + 0.01 and z0 >= -DigField.HALF - 0.01 and z0 + step <= DigField.HALF + 0.01:
					continue   # the dig site
				var c := [Vector3(x0, 0, z0), Vector3(x0 + step, 0, z0), Vector3(x0 + step, 0, z0 + step), Vector3(x0, 0, z0 + step)]
				for i in 4:
					var p: Vector3 = c[i]
					p.y = ground_height(p.x, p.z, noise)
					c[i] = p
				var nrm: Vector3 = ((c[2] - c[0]) as Vector3).cross(c[1] - c[0]).normalized()
				if nrm.y < 0.0:
					nrm = -nrm
				for t in [[0, 1, 2], [0, 2, 3]]:
					for v in t:
						var p: Vector3 = c[v]
						var dirt := path_amount(p.x, p.z)
						var g := DigField.GRASS * (0.86 + 0.24 * clump.get_noise_2d(p.x, p.z))
						var far := smoothstep(30.0, 90.0, Vector2(p.x, p.z).length())
						g = g.lerp(Color(0.56, 0.58, 0.36), far * 0.45)
						var col := g.lerp(GRASS_DIRT, smoothstep(0.15, 0.7, dirt))
						st.set_color(Color(col.r, col.g, col.b, 0.0))
						st.set_uv(Vector2(0.0, 1.0 - smoothstep(0.25, 0.75, dirt)))
						st.set_normal(nrm)
						st.add_vertex(p)
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


# --- The shack, the lift, the fence (Blender models) --------------------------------------------
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
	lamp.light_color = Color(1.0, 0.72, 0.4)
	lamp.light_energy = 1.0
	lamp.omni_range = 4.5
	lamp.position = SHACK_POS + Vector3(s.x * 0.5 + 0.8, 2.6, 0.95)
	add_child(lamp)
	# Clutter by the door: crates stacked, a barrel, a crate round the back.
	_place("crate", SHACK_POS + Vector3(s.x * 0.5 + 0.9, 0, -1.9), 0.3)
	_place("crate", SHACK_POS + Vector3(s.x * 0.5 + 0.85, 0.7, -1.85), -0.2, 0.75)
	_place("barrel", SHACK_POS + Vector3(s.x * 0.5 + 0.75, 0, 2.05), 0.6)
	_place("crate", SHACK_POS + Vector3(-s.x * 0.5 - 0.7, 0, 1.6), 1.1)
	_place("barrel", SHACK_POS + Vector3(-1.2, 0, s.z * 0.5 + 0.6), 2.0, 0.95)
	_collider(Vector3(1.0, 1.4, 1.0), Transform3D(Basis(), SHACK_POS + Vector3(s.x * 0.5 + 0.9, 0.7, -1.9)))
	_collider(Vector3(0.8, 1.0, 0.8), Transform3D(Basis(), SHACK_POS + Vector3(s.x * 0.5 + 0.75, 0.5, 2.05)))


func _build_headframe() -> void:
	var frame := _place("headframe", LIFT_POS, LIFT_YAW)
	sheave = Models.find(frame, "Sheave")
	if sheave == null:
		sheave = Node3D.new()
	cage = _place("cage", LIFT_POS, LIFT_YAW)
	var basis := Basis(Vector3.UP, LIFT_YAW)
	var w := 1.68
	for c in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
		_collider(Vector3(0.62, 2.4, 0.62), Transform3D(basis, LIFT_POS + basis * Vector3(c.x * w, 1.2, c.y * w)))
	# The cage: bars on three sides, open towards the dig site (west).
	_collider(Vector3(0.12, 2.5, 2.0), Transform3D(basis, LIFT_POS + basis * Vector3(-0.95, 1.25, 0)))
	_collider(Vector3(0.12, 2.5, 2.0), Transform3D(basis, LIFT_POS + basis * Vector3(0.95, 1.25, 0)))
	_collider(Vector3(2.0, 2.5, 0.12), Transform3D(basis, LIFT_POS + basis * Vector3(0, 1.25, 0.95)))
	var lamp := OmniLight3D.new()
	lamp.light_color = Color(1.0, 0.76, 0.45)
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
	label.position = Vector3(0, 3.3, 0)
	label.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	cage.add_child(label)


func _build_fence() -> void:
	## Weathered timber posts round the dig site, a rope sagging between them,
	## gaps where the paths come in, and one enamel sign at the south gap.
	var h := DigField.HALF + 0.7
	var rng := RandomNumberGenerator.new()
	rng.seed = Balance.WORLD_SEED + 9
	var rope_m := _mat(Color(0.78, 0.66, 0.46), 0.95)
	var corners := [Vector2(-h, h), Vector2(h, h), Vector2(h, -h), Vector2(-h, -h)]
	var posts: Array = []
	for side in 4:
		var a: Vector2 = corners[side]
		var b: Vector2 = corners[(side + 1) % 4]
		var n := 6
		for i in n:
			posts.append(a.lerp(b, float(i) / n))
	for i in posts.size():
		var p: Vector2 = posts[i]
		var q: Vector2 = posts[(i + 1) % posts.size()]
		var post := _place("timber_post", Vector3(p.x, 0.0, p.y), rng.randf_range(-0.3, 0.3))
		post.rotation.z = rng.randf_range(-0.035, 0.035)
		post.rotation.x = rng.randf_range(-0.03, 0.03)
		if _in_gate((p + q) * 0.5, h):
			continue
		_rope(Vector3(p.x, 0.92, p.y), Vector3(q.x, 0.92, q.y), 0.16 + rng.randf_range(-0.03, 0.04), rope_m)
	# The sign, beside the south gap, facing the path in.
	var sign := _place("shaft_sign", Vector3(GATE_S.y + 0.9, 0.0, h + 0.25), 0.18)   # enamel face (+Z) towards the path in
	# The sun is low behind the site, so the sign's face is in its own shadow:
	# glossy enamel still catches the bright sky, so let the cream face glow a little.
	for mi in sign.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		for si in m3.mesh.get_surface_count():
			var sm := m3.mesh.surface_get_material(si)
			if sm is BaseMaterial3D and (sm as BaseMaterial3D).albedo_color.get_luminance() > 0.6:
				var e := (sm as BaseMaterial3D).duplicate() as BaseMaterial3D
				e.emission_enabled = true
				e.emission = e.albedo_color
				e.emission_energy_multiplier = 0.45
				m3.set_surface_override_material(si, e)
	var t := Label3D.new()
	t.text = "Open shaft"
	t.font = UiTheme.display_font()
	t.font_size = 64
	t.modulate = Color(0.71, 0.2, 0.165)
	t.outline_size = 0
	t.pixel_size = 0.0024
	t.double_sided = false
	t.position = Vector3(0.0, 1.31, 0.125)
	sign.add_child(t)
	var t2 := Label3D.new()
	t2.text = "Mind the edge.\nLift at the headframe."
	t2.font = UiTheme.bold_font()
	t2.font_size = 26
	t2.modulate = Color(0.141, 0.11, 0.09)
	t2.outline_size = 0
	t2.pixel_size = 0.0021
	t2.double_sided = false
	t2.position = Vector3(0.0, 1.16, 0.125)
	sign.add_child(t2)


func _in_gate(m: Vector2, h: float) -> bool:
	if absf(m.y - h) < 0.1 and m.x > GATE_S.x and m.x < GATE_S.y:
		return true
	if absf(m.x + h) < 0.1 and m.y > GATE_W.x and m.y < GATE_W.y:
		return true
	if absf(m.x - h) < 0.1 and m.y > GATE_E.x and m.y < GATE_E.y:
		return true
	return false


func _rope(a: Vector3, b: Vector3, sag: float, m: Material) -> void:
	## A rope hanging between two posts: a few short segments along a catenary.
	var segs := 6
	var prev := a
	for i in range(1, segs + 1):
		var t := float(i) / segs
		var p := a.lerp(b, t)
		p.y -= sag * 4.0 * t * (1.0 - t)
		var mi := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.018
		cm.bottom_radius = 0.018
		cm.height = prev.distance_to(p) + 0.01
		cm.radial_segments = 5
		cm.rings = 1
		mi.mesh = cm
		mi.material_override = m
		add_child(mi)
		var up := (p - prev).normalized()
		var side := up.cross(Vector3.FORWARD if absf(up.z) < 0.9 else Vector3.RIGHT).normalized()
		mi.global_transform = Transform3D(Basis(side, up, side.cross(up)), (prev + p) * 0.5)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		prev = p


# --- Props, trees, grass, hills --------------------------------------------------------------------
func _build_props() -> void:
	# The spoil heap: everything that came out of the hole before the lift went in.
	_place("spoil_heap", Vector3(13.8, 0.0, 6.8), 0.4, 1.15)
	_place("crate", Vector3(9.9, 0.0, 1.0), 0.15, 0.9)
	_place("barrel", Vector3(10.6, 0.0, 2.1), 1.3, 0.9)


func _build_trees() -> void:
	## Hand-placed groves behind the shack, behind the headframe and along the
	## north, framing the spawn view; nothing between you and the site.
	var groves := [[Vector3(-27, 0, -8), 7], [Vector3(-24, 0, 14), 5], [Vector3(-10, 0, -24), 6], [Vector3(8, 0, -26), 6],
		[Vector3(24, 0, -16), 6], [Vector3(27, 0, 8), 4], [Vector3(-30, 0, 2), 4]]
	var rng := RandomNumberGenerator.new()
	rng.seed = Balance.WORLD_SEED + 17
	var noise := FastNoiseLite.new()
	noise.seed = Balance.WORLD_SEED + 3
	noise.frequency = 0.03
	for g in groves:
		var centre: Vector3 = g[0]
		for k in int(g[1]):
			var p: Vector3 = centre + Vector3(rng.randf_range(-7, 7), 0, rng.randf_range(-7, 7))
			if p.distance_to(SHACK_POS) < 7.5 or p.distance_to(LIFT_POS) < 6.0 or p.distance_to(SPAWN) < 8.0:
				continue
			if absf(p.x) < 12.0 and absf(p.z) < 12.0:
				continue
			p.y = ground_height(p.x, p.z, noise)
			var big := rng.randf_range(0.8, 1.5)
			var pine := rng.randf() < 0.6
			_place("pine" if pine else "oak", p, rng.randf() * TAU, big)
			_collider(Vector3(0.45, 3.0, 0.45) * big, Transform3D(Basis(), p + Vector3(0, 1.5 * big, 0)))
	for k in 34:
		var a := rng.randf() * TAU
		var r := rng.randf_range(40.0, 75.0)
		var p := Vector3(cos(a) * r, 0, sin(a) * r)
		p.y = ground_height(p.x, p.z, noise) - 0.2
		_place("pine" if rng.randf() < 0.7 else "oak", p, rng.randf() * TAU, rng.randf_range(1.1, 2.0))


func _build_grass() -> void:
	## Tufts of grass over the field (one MultiMesh), off the paths and the site.
	var mesh := DigField.decor_mesh("grass_tuft")
	if mesh == null:
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = Balance.WORLD_SEED + 21
	var xfs: Array = []
	var cols: Array = []
	var tries := 0
	while xfs.size() < 900 and tries < 5000:
		tries += 1
		var x := rng.randf_range(-34.0, 34.0)
		var z := rng.randf_range(-34.0, 34.0)
		if absf(x) < DigField.HALF + 0.9 and absf(z) < DigField.HALF + 0.9:
			continue
		if path_amount(x, z) > 0.05 or Vector2(x - SHACK_POS.x, z - SHACK_POS.z).length() < 4.5 or Vector2(x - LIFT_POS.x, z - LIFT_POS.z).length() < 3.0:
			continue
		var s := rng.randf_range(0.7, 1.5)
		xfs.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s, s * rng.randf_range(0.8, 1.3), s)), Vector3(x, 0.0, z)))
		var k := rng.randf_range(0.85, 1.15)
		cols.append(Color(k, k, k * 0.95))
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = xfs.size()
	for i in xfs.size():
		mm.set_instance_transform(i, xfs[i])
		mm.set_instance_color(i, cols[i])
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _build_hills() -> void:
	## Three rings of hills, each a step lighter and greyer (the haze does
	## the rest), so the horizon reads in layers.
	var rng := RandomNumberGenerator.new()
	rng.seed = Balance.WORLD_SEED + 23
	var rings := [[95.0, 120.0, 12, Color(0.4, 0.45, 0.25)], [140.0, 170.0, 14, Color(0.5, 0.52, 0.38)], [190.0, 230.0, 16, Color(0.62, 0.6, 0.53)]]
	for ring in rings:
		var count: int = ring[2]
		for i in count:
			var a := float(i) / count * TAU + rng.randf_range(-0.2, 0.2)
			var r := rng.randf_range(ring[0], ring[1])
			var mi := MeshInstance3D.new()
			var sm := SphereMesh.new()
			var rad := rng.randf_range(26.0, 46.0) * (r / 120.0)
			sm.radius = rad
			sm.height = rad * rng.randf_range(0.55, 0.9)
			sm.radial_segments = 12
			sm.rings = 5
			mi.mesh = sm
			mi.material_override = _mat((ring[3] as Color).lerp(Color(0.66, 0.62, 0.54), rng.randf() * 0.15), 1.0)
			mi.position = Vector3(cos(a) * r, -rad * 0.12, sin(a) * r)
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(mi)
