class_name HelperSwarm
extends Node3D
## Helpers that wander the forest and light things on their own.
##  Fire Sprites: giggling floating sparks, hot enough for grass and bushes.
##  Ember Salamanders: little glowing lizards that scurry to pines and oaks.
## Each picks something it can light near the keeper, goes there, and holds
## its heat on it until it catches. Past MAX_VISIBLE_HELPERS of a kind, the
## ones you see just burn hotter.

var grid: ForestGrid
var keeper: Node3D
var _walkers: Array = []          # {node, type, pos, target, t, id, phase, legs}
var _rng := RandomNumberGenerator.new()
var _next_id := 0
var _sprite_mat: StandardMaterial3D
var _eye_mat: StandardMaterial3D
var _lizard_mat: StandardMaterial3D


func _ready() -> void:
	_rng.seed = Balance.WORLD_SEED + 31
	_sprite_mat = StandardMaterial3D.new()
	_sprite_mat.albedo_color = Color(1.0, 0.7, 0.3)
	_sprite_mat.emission_enabled = true
	_sprite_mat.emission = Color(1.0, 0.55, 0.15)
	_sprite_mat.emission_energy_multiplier = 1.6
	_eye_mat = StandardMaterial3D.new()
	_eye_mat.albedo_color = Color(0.1, 0.05, 0.08)
	_eye_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_lizard_mat = StandardMaterial3D.new()
	_lizard_mat.albedo_color = Color(0.95, 0.35, 0.12)
	_lizard_mat.emission_enabled = true
	_lizard_mat.emission = Color(0.9, 0.25, 0.05)
	_lizard_mat.emission_energy_multiplier = 0.7


func _process(delta: float) -> void:
	if grid == null:
		return
	var d := minf(delta, 0.05)
	_sync()
	for w in _walkers:
		_step(w, d)


func _sync() -> void:
	for type in Balance.HELPERS.size():
		var want := mini(int(GameState.helper_counts[type]), Balance.MAX_VISIBLE_HELPERS)
		var have := 0
		for w in _walkers:
			if w.type == type:
				have += 1
		while have < want:
			_spawn(type)
			have += 1


func _spawn(type: int) -> void:
	var node := Node3D.new()
	add_child(node)
	var legs: Array = []
	if type == 0:
		var orb := MeshInstance3D.new()
		var s := SphereMesh.new()
		s.radius = 0.2
		s.height = 0.4
		s.radial_segments = 10
		s.rings = 6
		orb.mesh = s
		orb.material_override = _sprite_mat
		node.add_child(orb)
		for side in [-1.0, 1.0]:
			var eye := MeshInstance3D.new()
			var e := SphereMesh.new()
			e.radius = 0.035
			e.height = 0.07
			e.radial_segments = 6
			e.rings = 3
			eye.mesh = e
			eye.material_override = _eye_mat
			eye.position = Vector3(0.07 * side, 0.04, 0.17)
			node.add_child(eye)
		var flame := _flame(0.28, 14)
		flame.position = Vector3(0, 0.12, 0)
		node.add_child(flame)
	else:
		var body := MeshInstance3D.new()
		var c := CapsuleMesh.new()
		c.radius = 0.13
		c.height = 0.6
		c.radial_segments = 8
		c.rings = 2
		body.mesh = c
		body.rotation.x = PI / 2.0
		body.position = Vector3(0, 0.16, 0)
		body.material_override = _lizard_mat
		node.add_child(body)
		var head := MeshInstance3D.new()
		var hs := SphereMesh.new()
		hs.radius = 0.12
		hs.height = 0.2
		hs.radial_segments = 8
		hs.rings = 4
		head.mesh = hs
		head.position = Vector3(0, 0.2, 0.34)
		head.material_override = _lizard_mat
		node.add_child(head)
		var tail := MeshInstance3D.new()
		var tc := CylinderMesh.new()
		tc.top_radius = 0.01
		tc.bottom_radius = 0.07
		tc.height = 0.45
		tc.radial_segments = 6
		tail.mesh = tc
		tail.rotation.x = -PI / 2.0 + 0.2
		tail.position = Vector3(0, 0.12, -0.5)
		tail.material_override = _lizard_mat
		node.add_child(tail)
		for side in [-1.0, 1.0]:
			var eye := MeshInstance3D.new()
			var e := SphereMesh.new()
			e.radius = 0.03
			e.height = 0.06
			eye.mesh = e
			eye.material_override = _eye_mat
			eye.position = Vector3(0.07 * side, 0.27, 0.42)
			node.add_child(eye)
			for fb in [-1.0, 1.0]:
				var leg := MeshInstance3D.new()
				var lc := BoxMesh.new()
				lc.size = Vector3(0.05, 0.05, 0.16)
				leg.mesh = lc
				leg.material_override = _lizard_mat
				leg.position = Vector3(0.16 * side, 0.06, 0.16 * fb)
				leg.rotation.y = 1.1 * side
				node.add_child(leg)
				legs.append(leg)
		var flame := _flame(0.3, 10)
		flame.position = Vector3(0, 0.3, -0.05)
		node.add_child(flame)
	var start := keeper.position if keeper != null else Vector3.ZERO
	start += Vector3(_rng.randf_range(-2, 2), 0, _rng.randf_range(-2, 2))
	_next_id += 1
	_walkers.append({"node": node, "type": type, "pos": start, "target": -1, "t": 0.0,
		"id": "helper%d" % _next_id, "phase": _rng.randf() * TAU, "legs": legs, "cool": 0.0})
	node.position = start


func _flame(size: float, amount: int) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = amount
	p.lifetime = 0.45
	p.local_coords = false
	p.direction = Vector3.UP
	p.spread = 15.0
	p.gravity = Vector3(0, 2.0, 0)
	p.initial_velocity_min = 0.3
	p.initial_velocity_max = 0.7
	var quad := QuadMesh.new()
	quad.size = Vector2(size, size)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.billboard_keep_scale = true
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.vertex_color_use_as_albedo = true
	mat.albedo_texture = UiTheme.soft_dot()
	quad.material = mat
	p.mesh = quad
	var g := Gradient.new()
	g.colors = PackedColorArray([Color(1, 0.9, 0.5, 1), Color(1, 0.4, 0.1, 0.7), Color(0.6, 0.1, 0.05, 0.0)])
	g.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
	p.color_ramp = g
	var c := Curve.new()
	c.add_point(Vector2(0, 1))
	c.add_point(Vector2(1, 0.2))
	p.scale_amount_curve = c
	return p


func _step(w: Dictionary, d: float) -> void:
	var type: int = w.type
	var def: Dictionary = Balance.HELPERS[type]
	var heat := GameState.helper_each_heat(type)
	var pos: Vector3 = w.pos
	var target: int = w.target
	w.cool = float(w.cool) - d
	if target >= 0 and not grid.is_flammable(target):
		target = -1
	if target < 0 and float(w.cool) <= 0.0:
		var near: Vector2 = Vector2(keeper.position.x, keeper.position.z) if keeper != null else Vector2.ZERO
		target = grid.find_target(near, 20.0, heat, 30)
		if target < 0:
			target = grid.find_target(Vector2(pos.x, pos.z), 40.0, heat, 40)
		if target < 0:
			w.cool = 1.5   # nothing it can light around here; look again soon
		w.t = 0.0
	w.target = target
	var goal: Vector3
	if target >= 0:
		goal = grid.cell_pos(target)
	else:
		var a := Time.get_ticks_msec() * 0.0006 + float(w.phase)
		goal = keeper.position + Vector3(cos(a) * 2.5, 0, sin(a) * 2.5) if keeper != null else pos
	var flat := Vector2(goal.x - pos.x, goal.z - pos.z)
	var speed := float(def.speed) * (1.6 if GameState.is_helper_rush_active() else 1.0)
	var arrived := flat.length() < 0.6
	if not arrived:
		var step := flat.normalized() * minf(flat.length(), speed * d)
		pos.x += step.x
		pos.z += step.y
		(w.node as Node3D).rotation.y = lerp_angle((w.node as Node3D).rotation.y, atan2(flat.x, flat.y), 1.0 - exp(-d * 10.0))
	if target >= 0 and flat.length() < 1.6:
		grid.set_source(w.id, grid.cell_center(target), 0.9, heat)
		w.t = float(w.t) + d
		if float(w.t) > 6.0:
			w.target = -1   # it's not catching; try something else
			w.cool = 0.5
	else:
		grid.clear_source(w.id)
	var g := grid.height_at(pos.x, pos.z)
	var ph: float = w.phase
	var t := Time.get_ticks_msec() * 0.001
	if type == 0:
		pos.y = maxf(g, ForestGrid.WATER_LEVEL) + 1.25 + sin(t * 3.0 + ph) * 0.18
	else:
		pos.y = maxf(g, ForestGrid.WATER_LEVEL)
		var wig := sin(t * 18.0 + ph) * (0.5 if not arrived else 0.1)
		for k in (w.legs as Array).size():
			(w.legs[k] as Node3D).rotation.x = wig * (1.0 if k % 2 == 0 else -1.0)
	w.pos = pos
	(w.node as Node3D).position = pos


func clear() -> void:
	for w in _walkers:
		grid.clear_source(w.id)
		(w.node as Node3D).queue_free()
	_walkers.clear()
