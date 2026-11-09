class_name Warehouse
extends Node3D
## The empty warehouse the city was built in: corrugated steel walls, a roof of
## trusses with strips of skylights, shafts of daylight slanting down through the
## dust, four big floor fans (whichever is running sets the wind), and the stuff
## whoever built the city left lying about (tape, a marker, scissors, pallets of
## flattened boxes).

const HALF := 41.0                 # half the inside width of the building
const WALL_H := 11.0
const SKYLIGHT_Z := [-22.0, -7.0, 8.0, 23.0]

var env: Environment
var sun: DirectionalLight3D
var fans: Array = []               # {body, blades, dir: Vector2 (the way it blows), spin}
var _steel: StandardMaterial3D


func build() -> void:
	_environment()
	_steel = StandardMaterial3D.new()
	_steel.albedo_color = Color(0.36, 0.4, 0.45)
	_steel.metallic = 0.4
	_steel.roughness = 0.5
	_walls()
	_roof()
	_shafts()
	_fans()
	_props()


const KEY_ELEVATION := 28.0         # degrees: low late-afternoon light, long shadows
const KEY_YAW := -141.5             # from the west-north-west: shadows fall to the east-south-east
const AMBIENT := 0.4
const FOG := Color(0.42, 0.47, 0.55)
const FOG_SMOKE := Color(0.24, 0.21, 0.19)

var fill: DirectionalLight3D
var obstacles: Array = []          # [Vector2 centre, radius]: props too tall to step over


func _environment() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.08, 0.09, 0.11)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#7f93b0")
	env.ambient_light_energy = AMBIENT
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.12
	env.fog_enabled = true
	env.fog_light_color = FOG
	env.fog_density = 0.012
	env.fog_sky_affect = 0.0
	env.glow_enabled = true
	env.glow_intensity = 0.6
	env.glow_bloom = 0.05
	env.glow_hdr_threshold = 1.0
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	# The key: warm late-afternoon light through the high west windows.
	sun = DirectionalLight3D.new()
	sun.light_color = Color("#ffe2b0")
	sun.light_energy = 1.55
	sun.rotation = Vector3(deg_to_rad(-KEY_ELEVATION), deg_to_rad(KEY_YAW), 0.0)
	# Real shadows on computers; phones get the long shadows baked into the floor.
	sun.shadow_enabled = not DisplayServer.is_touchscreen_available()
	sun.shadow_bias = 0.05
	sun.shadow_normal_bias = 1.4
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 36.0
	sun.shadow_opacity = 0.82
	add_child(sun)
	# A cool fill from the other side (sky bouncing off the far wall).
	fill = DirectionalLight3D.new()
	fill.light_color = Color("#7f93b0")
	fill.light_energy = 0.38
	fill.rotation = Vector3(deg_to_rad(-22.0), deg_to_rad(KEY_YAW + 180.0), 0.0)
	fill.shadow_enabled = false
	add_child(fill)


func shadow_dir() -> Vector2:
	## Which way shadows fall across the floor (world x, z), and how steep the light is.
	var d := -sun.global_transform.basis.z if sun.is_inside_tree() else Vector3(0.62, -0.47, 0.78)
	return Vector2(d.x, d.z).normalized()


func set_haze(k: float, glow: float) -> void:
	## As the city burns the warehouse fills with smoke: the haze browns and thickens,
	## the daylight dims, and the fires take over.
	k = clampf(k, 0.0, 1.0)
	env.fog_light_color = FOG.lerp(FOG_SMOKE, k)
	env.fog_density = 0.012 + 0.016 * k
	env.ambient_light_energy = AMBIENT * (1.0 - 0.4 * k)
	sun.light_energy = 1.55 * (1.0 - 0.3 * k)
	fill.light_energy = 0.38 * (1.0 - 0.35 * k)
	env.tonemap_exposure = 1.12 + 0.08 * k - minf(glow, 4.0) * 0.015


func _box(size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var b := BoxMesh.new()
	b.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = b
	mi.material_override = mat
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


func _walls() -> void:
	var wall := ShaderMaterial.new()
	wall.shader = load("res://shaders/metal_wall.gdshader")
	var t := 0.4
	_box(Vector3(HALF * 2 + 1, WALL_H, t), Vector3(0, WALL_H / 2, -HALF), wall)
	_box(Vector3(HALF * 2 + 1, WALL_H, t), Vector3(0, WALL_H / 2, HALF), wall)
	_box(Vector3(t, WALL_H, HALF * 2 + 1), Vector3(-HALF, WALL_H / 2, 0), wall)
	_box(Vector3(t, WALL_H, HALF * 2 + 1), Vector3(HALF, WALL_H / 2, 0), wall)
	# Steel columns along the walls, and a yellow-and-black kick rail at the bottom.
	var stripe := StandardMaterial3D.new()
	stripe.albedo_color = Color(0.9, 0.72, 0.16)
	stripe.roughness = 0.6
	for k in range(-3, 4):
		var p := k * 11.0
		for side in [-1.0, 1.0]:
			_box(Vector3(0.45, WALL_H, 0.45), Vector3(p, WALL_H / 2, side * (HALF - 0.4)), _steel)
			_box(Vector3(0.45, WALL_H, 0.45), Vector3(side * (HALF - 0.4), WALL_H / 2, p), _steel)
	for side in [-1.0, 1.0]:
		_box(Vector3(HALF * 2, 0.35, 0.12), Vector3(0, 0.3, side * (HALF - 0.25)), stripe)
		_box(Vector3(0.12, 0.35, HALF * 2), Vector3(side * (HALF - 0.25), 0.3, 0), stripe)
	# A big roller door in the south wall.
	var door := StandardMaterial3D.new()
	door.albedo_color = Color(0.52, 0.56, 0.6)
	door.metallic = 0.3
	door.roughness = 0.45
	_box(Vector3(9.0, 7.0, 0.2), Vector3(-14.0, 3.5, HALF - 0.25), door)
	for k in 14:
		_box(Vector3(9.0, 0.06, 0.05), Vector3(-14.0, 0.3 + k * 0.5, HALF - 0.38), _steel)


func _roof() -> void:
	var roof := StandardMaterial3D.new()
	roof.albedo_color = Color(0.22, 0.25, 0.29)
	roof.roughness = 0.8
	_box(Vector3(HALF * 2 + 1, 0.3, HALF * 2 + 1), Vector3(0, WALL_H + 2.4, 0), roof)
	var glass := StandardMaterial3D.new()
	glass.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glass.albedo_color = Color(1.6, 1.55, 1.42)
	for z in SKYLIGHT_Z:
		_box(Vector3(HALF * 1.8, 0.05, 3.0), Vector3(0, WALL_H + 2.22, z), glass)
	# Trusses: a bottom chord and a top chord with diagonals, every 11 m.
	for k in range(-3, 4):
		var x := k * 11.0
		_box(Vector3(0.18, 0.25, HALF * 2), Vector3(x, WALL_H, 0), _steel)
		_box(Vector3(0.14, 0.18, HALF * 2), Vector3(x, WALL_H + 2.0, 0), _steel)
		var z := -HALF + 1.0
		var up := true
		while z < HALF - 1.0:
			var d := _box(Vector3(0.08, 2.2, 0.08), Vector3(x, WALL_H + 1.0, z + 1.0), _steel)
			d.rotation.x = 0.75 if up else -0.75
			up = not up
			z += 2.0
	for z in range(-33, 34, 6):
		_box(Vector3(HALF * 2, 0.12, 0.1), Vector3(0, WALL_H + 2.05, z), _steel)


func _shafts() -> void:
	## Daylight from the skylights, slanting the way the sun shines.
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/light_shaft.gdshader")
	var dir := -sun.global_transform.basis.z
	if dir.y > -0.1:
		dir = Vector3(0.3, -0.8, 0.3).normalized()
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	var r := RandomNumberGenerator.new()
	r.seed = 4
	for z in SKYLIGHT_Z:
		for k in 3:
			var top := Vector3(r.randf_range(-24.0, 24.0), WALL_H + 2.1, z + r.randf_range(-0.8, 0.8))
			var t := top.y / -dir.y
			var bottom := top + dir * t
			var mid := (top + bottom) * 0.5
			var mi := MeshInstance3D.new()
			mi.mesh = quad
			mi.material_override = mat
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			var axis := (top - bottom)
			var y := axis.normalized()
			var x := y.cross(Vector3(0, 0, 1)).normalized()
			var zz := x.cross(y).normalized()
			mi.transform = Transform3D(Basis(x * r.randf_range(2.2, 3.4), axis, zz), mid)
			add_child(mi)


func _fans() -> void:
	var spots := [
		[Vector3(0, 0, -HALF + 2.0), Vector2(0, 1)],
		[Vector3(0, 0, HALF - 2.0), Vector2(0, -1)],
		[Vector3(-HALF + 2.0, 0, 6.0), Vector2(1, 0)],
		[Vector3(HALF - 2.0, 0, -6.0), Vector2(-1, 0)],
	]
	for s in spots:
		var pos: Vector3 = s[0]
		var dir: Vector2 = s[1]
		var body := MeshInstance3D.new()
		body.mesh = ModelLib.prop_mesh("fan_body")
		body.position = pos
		body.rotation.y = atan2(dir.x, dir.y)   # the guard (model +z) faces the city
		add_child(body)
		var blades := MeshInstance3D.new()
		blades.mesh = ModelLib.prop_mesh("fan_blades")
		blades.position = Vector3(0, 2.6, 0.12)
		body.add_child(blades)
		fans.append({"body": body, "blades": blades, "dir": dir, "spin": 0.0})


func update_fans(wind: Vector2, strength: float, delta: float) -> void:
	## The fan blowing most nearly the way the wind goes is the one running.
	var best := 0
	var best_dot := -INF
	for k in fans.size():
		var d: float = (fans[k].dir as Vector2).dot(wind)
		if d > best_dot:
			best_dot = d
			best = k
	for k in fans.size():
		var f: Dictionary = fans[k]
		var want := (6.0 + strength * 16.0) if k == best else 0.0
		f.spin = lerpf(float(f.spin), want, 1.0 - exp(-delta * 0.8))
		(f.blades as Node3D).rotation.z += float(f.spin) * delta


func _place(name: String, pos: Vector3, yaw: float, scale: float, block_radius: float = 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = ModelLib.prop_mesh(name)
	mi.position = pos
	mi.rotation.y = yaw
	mi.scale = Vector3.ONE * scale
	add_child(mi)
	if block_radius > 0.0:
		obstacles.append([Vector2(pos.x, pos.z), block_radius])
	return mi


func _props() -> void:
	var r := RandomNumberGenerator.new()
	r.seed = 9
	var stacks := [Vector3(-36, 0, -34), Vector3(-33.5, 0, -36), Vector3(35, 0, 34), Vector3(37, 0, 31.5),
		Vector3(36, 0, -22), Vector3(-37, 0, 20)]
	for p in stacks:
		_place("card_stack" if r.randf() < 0.6 else "pallet", p, r.randf_range(-0.3, 0.3), 1.6)
		if r.randf() < 0.5:
			_place("card_stack", p + Vector3(r.randf_range(-0.1, 0.1), 0.74, r.randf_range(-0.1, 0.1)), r.randf_range(-0.4, 0.4), 1.6)
	# Left where the builder stopped working, by the door.
	_place("tape_roll", Vector3(-4.6, 0, 33.4), 0.3, 1.6)
	_place("marker_pen", Vector3(3.8, 0, 35.2), -0.4, 1.6)
	_place("scissors", Vector3(6.8, 0, 33.1), 1.1, 1.6)
	_place("card_stack", Vector3(-9.0, 0, 34.4), 0.15, 1.6)
	# The builder's own things, giant beside the city, standing in the bare floor
	# between the districts (off the middle of the strip, where the wind-up cars drive).
	_place("paint_can", Vector3(11.2, 0, 22.4), 0.4, 1.05, 0.62)
	_place("tape_roll", Vector3(-10.5, 0, 24.1), 0.9, 3.0)
	_place("mug", Vector3(-24.1, 0, -5.0), 2.2, 1.1, 0.6)
	_place("pallet", Vector3(22.4, 0, 9.0), 0.05, 2.35)
	_place("card_stack", Vector3(22.5, 0.3, 9.1), -0.08, 1.9)
	_place("marker_pen", Vector3(-15.0, 0, 9.5), 1.5, 2.6)
	_place("scissors", Vector3(16.6, 0, -11.0), 0.7, 2.4)
	_place("paint_can", Vector3(-6.5, 0, -24.0), 2.0, 0.85, 0.5)
	_place("mug", Vector3(24.0, 0, -18.0), -0.6, 0.95, 0.52)
	_place("tape_roll", Vector3(-16.6, 0, -9.0), 0.2, 2.2)
	# The castle stands on a pallet.
	_place("castle_pallet", Vector3.ZERO, 0.0, 0.965)
