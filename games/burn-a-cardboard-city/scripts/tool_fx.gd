class_name ToolFx
extends Node3D
## What each tool does on screen:
##  Magnifying glass: a shaft of skylight into the lens, a bright cone out of it,
##    and a white-hot point where it lands (with a curl of smoke).
##  Candle: a little paper flame on the wick; drips of burning wax arc to the target.
##  Blowtorch: a blue gas flame at the nozzle and a roaring jet to the target.
##  Firework rockets: rockets fly in an arc and burst where they land (and that's
##    when they heat: a big hit at once, not a steady flame).
## The Golden lens purchase turns the fire gold; the starter pack's party sparks
## make the sparks every colour.

signal rocket_burst(at: Vector3)
signal rocket_launched

var giant                          # the Giant (untyped: it references this class)
var tool := -1
var rockets: Array = []            # {node, trail, from, to, t, T}
var _cooldown := 0.0
var _beam_in: MeshInstance3D
var _beam_out: MeshInstance3D
var _spot: MeshInstance3D
var _spot_mat: StandardMaterial3D
var _held_flame: MeshInstance3D
var _held_mat: ShaderMaterial
var _stream: CPUParticles3D
var _impact: CPUParticles3D
var _wisp: CPUParticles3D
var _bursts: Array = []
var _burst_i := 0


func _ready() -> void:
	var shaft := ShaderMaterial.new()
	shaft.shader = load("res://shaders/light_shaft.gdshader")
	shaft.set_shader_parameter("strength", 0.55)
	var cone := shaft.duplicate() as ShaderMaterial
	cone.set_shader_parameter("strength", 1.4)
	cone.set_shader_parameter("color", Color(1.0, 0.96, 0.82))
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	_beam_in = _mesh(quad, shaft)
	_beam_out = _mesh(quad, cone)
	_spot_mat = StandardMaterial3D.new()
	_spot_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_spot_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_spot_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_spot_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	_spot_mat.albedo_texture = Gfx.soft_dot()
	_spot_mat.albedo_color = Color(1.6, 1.5, 1.2)
	_spot_mat.no_depth_test = true
	_spot = _mesh(quad, _spot_mat)
	_held_mat = ShaderMaterial.new()
	_held_mat.shader = load("res://shaders/paper_flame.gdshader")
	_held_mat.set_shader_parameter("near_fade", 0.0)
	_held_flame = _mesh(quad, _held_mat)
	_stream = Gfx.particles(60, 0.1, [])
	add_child(_stream)
	_stream.top_level = true
	_impact = Gfx.particles(30, 0.07, [Color(1, 0.95, 0.65, 1), Color(1, 0.5, 0.12, 0.9), Color(0.4, 0.12, 0.05, 0)])
	_impact.direction = Vector3.UP
	_impact.spread = 60.0
	_impact.gravity = Vector3(0, -5.0, 0)
	_impact.initial_velocity_min = 0.8
	_impact.initial_velocity_max = 2.4
	_impact.lifetime = 0.6
	_impact.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	_impact.emission_sphere_radius = 0.15
	add_child(_impact)
	_impact.top_level = true
	_wisp = Gfx.particles(14, 0.35, [Color(0.85, 0.85, 0.85, 0.0), Color(0.8, 0.8, 0.82, 0.35), Color(0.7, 0.7, 0.72, 0.0)], false)
	_wisp.direction = Vector3.UP
	_wisp.spread = 12.0
	_wisp.gravity = Vector3(0, 0.6, 0)
	_wisp.initial_velocity_min = 0.3
	_wisp.initial_velocity_max = 0.7
	_wisp.lifetime = 1.4
	_wisp.scale_amount_curve = Gfx.curve(0.4, 1.6)
	add_child(_wisp)
	_wisp.top_level = true
	for _i in 6:
		var b := Gfx.particles(70, 0.1, [Color(1, 1, 1, 1), Color(1, 0.8, 0.3, 1), Color(1, 0.3, 0.2, 0.0)])
		b.one_shot = true
		b.explosiveness = 1.0
		b.lifetime = 1.0
		b.direction = Vector3.UP
		b.spread = 180.0
		b.gravity = Vector3(0, -3.0, 0)
		b.initial_velocity_min = 2.5
		b.initial_velocity_max = 4.5
		b.scale_amount_curve = Gfx.curve(1.0, 0.2)
		add_child(b)
		b.top_level = true
		_bursts.append(b)


func _mesh(m: Mesh, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.visible = false
	add_child(mi)
	mi.top_level = true
	return mi


func _spark_colors() -> Array:
	if GameState.party_on:
		return [Color(1, 0.4, 0.8, 1), Color(0.4, 0.8, 1, 0.9), Color(1, 0.9, 0.3, 0.8), Color(0.5, 1, 0.5, 0)]
	if GameState.golden_on:
		return [Color(1, 1, 0.85, 1), Color(1, 0.8, 0.3, 0.9), Color(0.6, 0.35, 0.1, 0)]
	return [Color(1, 0.95, 0.65, 1), Color(1, 0.5, 0.12, 0.9), Color(0.4, 0.12, 0.05, 0)]


func setup(i: int) -> void:
	tool = i
	Gfx.ramp(_impact, _spark_colors())
	_stream.emitting = false
	match i:
		1:
			_stream.amount = 18
			(_stream.mesh as QuadMesh).size = Vector2(0.07, 0.07)
			Gfx.ramp(_stream, [Color(1, 0.95, 0.75, 1), Color(1, 0.65, 0.2, 1), Color(1, 0.35, 0.1, 0.6)])
			_stream.lifetime = 0.55
		2:
			_stream.amount = 90
			(_stream.mesh as QuadMesh).size = Vector2(0.09, 0.09)
			Gfx.ramp(_stream, [Color(0.75, 0.9, 1, 1), Color(0.3, 0.55, 1, 0.9), Color(1, 0.55, 0.15, 0.7), Color(0.6, 0.2, 0.05, 0)])
			_stream.scale_amount_curve = Gfx.curve(0.5, 3.2)
			_stream.lifetime = 0.32
			_stream.spread = 5.0


func update(active: bool, target: Vector3, delta: float) -> void:
	if tool < 0:
		return
	var tip: Vector3 = giant.tool_tip()
	var style := 1.0 if GameState.golden_on else 0.0
	_cooldown -= delta
	_update_rockets(delta)
	# The flame that's always on the tool (the candle's wick, the torch's pilot).
	_held_flame.visible = tool == 1 or (tool == 2 and active)
	if _held_flame.visible:
		var cam: Camera3D = giant.camera
		var size := Vector2(0.05, 0.08) if tool == 1 else Vector2(0.06, 0.16)
		var up := Vector3.UP
		var at := tip
		if tool == 2:
			at = tip + giant.forward() * 0.03
		_held_flame.global_transform = Transform3D(Basis().scaled(Vector3(size.x, size.y, 1.0)), at)
		_held_mat.set_shader_parameter("single", Vector4(0.3, 1.0, 3.0 if tool == 2 else style, 0.0))
	_beam_in.visible = active and tool == 0
	_beam_out.visible = active and tool == 0
	_spot.visible = active and tool == 0
	_wisp.emitting = active and tool <= 1
	_impact.emitting = active and tool >= 1 and tool <= 2
	if not active:
		_stream.emitting = false
		return
	_wisp.global_position = target + Vector3(0, 0.05, 0)
	_impact.global_position = target + Vector3(0, 0.08, 0)
	match tool:
		0:
			var sun_dir := Vector3(0.28, -0.88, 0.38).normalized()
			_beam(_beam_in, tip - sun_dir * 7.0, tip, 0.42)
			_beam(_beam_out, tip, target, 0.07)
			var pulse := 1.0 + 0.25 * sin(Time.get_ticks_msec() * 0.03)
			var s := GameState.tool_radius() * 0.9 * pulse
			_spot.global_transform = Transform3D(Basis().scaled(Vector3(s, s, s)), target + Vector3(0, 0.06, 0))
		1, 2:
			var life := _stream.lifetime
			var d := target - tip
			var v: Vector3
			if tool == 1:
				var tt := life * 0.85
				var g := Vector3(0, -9.0, 0)
				v = (d - 0.5 * g * tt * tt) / tt
				_stream.gravity = g
			else:
				v = d / (life * 0.9)
				_stream.gravity = Vector3(0, 0.8, 0)
			_stream.global_position = tip
			_stream.direction = v.normalized()
			_stream.initial_velocity_min = v.length() * 0.92
			_stream.initial_velocity_max = v.length() * 1.05
			_stream.emitting = true
		3:
			if _cooldown <= 0.0:
				_cooldown = Balance.ROCKET_EVERY
				launch(tip, target)


func _beam(mi: MeshInstance3D, from: Vector3, to: Vector3, width: float) -> void:
	var axis := from - to
	if axis.length() < 0.01:
		return
	var y := axis
	var x := y.normalized().cross(Vector3(0, 0, 1))
	if x.length() < 0.1:
		x = y.normalized().cross(Vector3(1, 0, 0))
	x = x.normalized() * width
	var z := x.cross(y).normalized()
	mi.global_transform = Transform3D(Basis(x, y, z), (from + to) * 0.5)


# =====================================================================================
# Rockets
# =====================================================================================
func launch(from: Vector3, to: Vector3) -> void:
	var node := MeshInstance3D.new()
	node.mesh = ModelLib.prop_mesh("rocket")
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	node.top_level = true
	var trail := Gfx.particles(40, 0.09, [Color(1, 0.95, 0.7, 1), Color(1, 0.6, 0.2, 0.8), Color(0.5, 0.5, 0.5, 0.0)])
	trail.lifetime = 0.5
	trail.gravity = Vector3(0, 0.3, 0)
	trail.spread = 25.0
	trail.initial_velocity_min = 0.2
	trail.initial_velocity_max = 0.6
	add_child(trail)
	trail.top_level = true
	trail.global_position = from
	trail.emitting = true
	var dist := from.distance_to(to)
	var T := clampf(dist / Balance.ROCKET_SPEED, 0.3, 1.8)
	rockets.append({"node": node, "trail": trail, "from": from, "to": to, "t": 0.0, "T": T, "arc": clampf(dist * 0.18, 0.4, 3.5)})
	if giant.has_method("kick"):
		giant.kick(0.6)
	rocket_launched.emit()


func _update_rockets(delta: float) -> void:
	for k in range(rockets.size() - 1, -1, -1):
		var r: Dictionary = rockets[k]
		r.t = float(r.t) + delta
		var u := clampf(float(r.t) / float(r.T), 0.0, 1.0)
		var from: Vector3 = r.from
		var to: Vector3 = r.to
		var p := from.lerp(to, u) + Vector3(0, sin(u * PI) * float(r.arc), 0)
		var ahead := from.lerp(to, minf(1.0, u + 0.02)) + Vector3(0, sin(minf(1.0, u + 0.02) * PI) * float(r.arc), 0)
		var node: MeshInstance3D = r.node
		node.global_position = p
		var dir := (ahead - p)
		if dir.length() > 0.001:
			var b := Basis.looking_at(dir.normalized(), Vector3.UP if absf(dir.normalized().y) < 0.95 else Vector3.FORWARD)
			node.global_transform.basis = b * Basis(Vector3.RIGHT, -PI * 0.5)
		(r.trail as CPUParticles3D).global_position = p
		if u >= 1.0:
			_burst(to)
			node.queue_free()
			var trail: CPUParticles3D = r.trail
			trail.emitting = false
			get_tree().create_timer(0.6).timeout.connect(trail.queue_free)
			rockets.remove_at(k)


func _burst(at: Vector3) -> void:
	var b: CPUParticles3D = _bursts[_burst_i]
	_burst_i = (_burst_i + 1) % _bursts.size()
	var hue := randf()
	var c1 := Color.from_hsv(hue, 0.6, 1.0)
	var c2 := Color.from_hsv(fmod(hue + 0.35, 1.0), 0.8, 1.0)
	Gfx.ramp(b, [Color(1, 1, 1, 1), c1, c2, Color(c2, 0.0)])
	b.global_position = at + Vector3(0, 0.4, 0)
	b.restart()
	b.emitting = true
	var g: CityGrid = giant.grid
	if g != null:
		g.add_heat_area(Vector2(at.x, at.z), GameState.tool_radius(), GameState.tool_power() * 1.1)
	rocket_burst.emit(at)
