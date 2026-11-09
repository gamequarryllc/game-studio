class_name HelperSwarm
extends Node3D
## Helpers that wander the forest and light things on their own.
##  Fire sprites: round flame spirits with faces, hot enough for grass and bushes.
##  Ember salamanders: ember lizards that scurry to pines and oaks.
## Each picks something it can light near the keeper, goes there, and holds
## its heat on it until it catches. Past MAX_VISIBLE_HELPERS of a kind, the
## ones you see just burn hotter.

var grid: ForestGrid
var keeper: Node3D
var _walkers: Array = []          # {node, type, pos, target, t, id, phase, legs}
var _rng := RandomNumberGenerator.new()
var _next_id := 0
var _sprite_mat: ShaderMaterial
var _lizard_mat: ShaderMaterial


func _ready() -> void:
	_rng.seed = Balance.WORLD_SEED + 31
	_sprite_mat = ShaderMaterial.new()
	_sprite_mat.shader = load("res://shaders/prop.gdshader")
	_sprite_mat.set_shader_parameter("glow_strength", 0.9)
	_sprite_mat.set_shader_parameter("ink_edge", 0.6)
	_lizard_mat = ShaderMaterial.new()
	_lizard_mat.shader = _sprite_mat.shader
	_lizard_mat.set_shader_parameter("emit_all", 0.25)
	_lizard_mat.set_shader_parameter("ink_edge", 0.5)


func _process(delta: float) -> void:
	if grid == null:
		return
	var d := minf(delta, 0.05 * maxf(1.0, Engine.time_scale))
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


func _mesh(m: Mesh, mat: Material, parent: Node3D, pos: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


func _spawn(type: int) -> void:
	## Fire sprites are round flame spirits with faces; salamanders are ember
	## lizards with a ridge of flames down the back (models/creatures.glb).
	var node := Node3D.new()
	add_child(node)
	var legs: Array = []
	if type == 0:
		var body := _mesh(Models.creature("sprite"), _sprite_mat, node)
		body.scale = Vector3.ONE * 1.25
		var flame := _flame(0.3, 12)
		flame.position = Vector3(0, 0.4, 0)
		node.add_child(flame)
	else:
		var body := _mesh(Models.creature("salamander"), _lizard_mat, node)
		body.scale = Vector3.ONE * 1.3
		for side in [-1.0, 1.0]:
			for fb in [-1.0, 1.0]:
				var hip := Node3D.new()
				hip.position = Vector3(0.1 * side, 0.2, 0.2 * fb) * 1.3
				hip.scale = Vector3(side, 1.0, 1.0) * 1.3
				node.add_child(hip)
				_mesh(Models.creature("salamander_leg"), _lizard_mat, hip)
				legs.append(hip)
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
	mat.vertex_color_use_as_albedo = true
	mat.albedo_texture = UiTheme.soft_dot()
	quad.material = mat
	p.mesh = quad
	var g := Gradient.new()
	g.colors = PackedColorArray([Color("#FFC15E"), Color(Color("#E8642C"), 0.8), Color(Color("#4A3B4A"), 0.0)])
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
		pos.y = maxf(g, ForestGrid.WATER_LEVEL) + 1.45 + sin(t * 3.0 + ph) * 0.18
		(w.node as Node3D).scale = Vector3(1.0 + sin(t * 6.0 + ph) * 0.06, 1.0 - sin(t * 6.0 + ph) * 0.06, 1.0)
	else:
		pos.y = maxf(g, ForestGrid.WATER_LEVEL)
		var wig := sin(t * 18.0 + ph) * (0.5 if not arrived else 0.1)
		for k in (w.legs as Array).size():
			(w.legs[k] as Node3D).rotation.y = wig * (1.0 if k % 2 == 0 else -1.0)
	w.pos = pos
	(w.node as Node3D).position = pos


func clear() -> void:
	for w in _walkers:
		grid.clear_source(w.id)
		(w.node as Node3D).queue_free()
	_walkers.clear()
