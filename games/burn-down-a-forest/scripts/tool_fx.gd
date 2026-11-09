class_name ToolFx
extends Node3D
## What comes out of each tool, all particles in world space:
##  Matchstick: a tiny flame and a flick of sparks arcing to the target.
##  Lighter: a steady flame and a thin jet of sparks.
##  Tiki Torch: a big flame on the torch, lobbing fireballs in an arc.
##  Flamethrower: a roaring cone of fire that billows as it goes.
##  Dragon Breath: the same, but huge, magenta and purple.
##  Meteor Shower: shooting stars falling from the sky onto the target.
## The Phoenix Flame purchase turns every tool's fire gold. Embers puff up where it lands.

var tool := -1
var _tip_flame: CPUParticles3D        # the small flame on the tool (always lit for some tools)
var _stream: CPUParticles3D           # tip -> target
var _trail: CPUParticles3D            # embers following the stream
var _impact: CPUParticles3D           # where it lands
var _arc := false
var _from_sky := false
var _life := 0.5
var _gold := false


func _ready() -> void:
	_tip_flame = _particles(18, 0.12)
	_stream = _particles(40, 0.2)
	_trail = _particles(30, 0.08)
	_impact = _particles(26, 0.16)
	_impact.direction = Vector3.UP
	_impact.spread = 55.0
	_impact.initial_velocity_min = 1.5
	_impact.initial_velocity_max = 4.0
	_impact.gravity = Vector3(0, -3.0, 0)
	_impact.lifetime = 0.7
	_impact.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	_impact.emission_sphere_radius = 0.5


func _particles(amount: int, size: float) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = amount
	p.emitting = false
	p.local_coords = false
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
	add_child(p)
	p.top_level = true
	return p


func _ramp(p: CPUParticles3D, colors: Array) -> void:
	var g := Gradient.new()
	var offs := PackedFloat32Array()
	var cols := PackedColorArray()
	for k in colors.size():
		offs.append(float(k) / float(colors.size() - 1))
		cols.append(colors[k])
	g.offsets = offs
	g.colors = cols
	p.color_ramp = g


func _grow(p: CPUParticles3D, a: float, b: float) -> void:
	var c := Curve.new()
	c.add_point(Vector2(0, a))
	c.add_point(Vector2(1, b))
	p.scale_amount_curve = c


func _size(p: CPUParticles3D, s: float) -> void:
	(p.mesh as QuadMesh).size = Vector2(s, s)


func setup(i: int) -> void:
	tool = i
	_gold = GameState.phoenix_on
	_arc = false
	_from_sky = false
	# Warm, never white: hot core -> flame body -> deep red -> soot (art bible palette).
	var core := Color("#FFC15E")
	var body := Color("#E8642C")
	var deep := Color("#B8361E")
	var soot := Color("#3B2D3A")
	var fire := [core, Color(body, 0.95), Color(deep, 0.7), Color(soot, 0.0)]
	if _gold:
		fire = [Color("#FFE08A"), Color(Color("#F2C14E"), 0.95), Color(Color("#D9862E"), 0.7), Color(soot, 0.0)]
	_ramp(_tip_flame, fire)
	_ramp(_stream, fire)
	_ramp(_trail, [core, Color(body, 0.85), Color(soot, 0.0)])
	_ramp(_impact, [core, Color(body, 0.85), Color(soot, 0.0)])
	_tip_flame.direction = Vector3.UP
	_tip_flame.spread = 12.0
	_tip_flame.gravity = Vector3(0, 1.5, 0)
	_tip_flame.initial_velocity_min = 0.2
	_tip_flame.initial_velocity_max = 0.5
	_tip_flame.lifetime = 0.35
	_grow(_tip_flame, 1.0, 0.2)
	_stream.spread = 4.0
	_trail.spread = 10.0
	_grow(_stream, 1.0, 1.0)
	match i:
		0:
			_size(_tip_flame, 0.12)
			_stream.amount = 14
			_size(_stream, 0.12)
			_life = 0.5
			_arc = true
			_trail.amount = 10
		1:
			_size(_tip_flame, 0.16)
			_stream.amount = 44
			_size(_stream, 0.2)
			_grow(_stream, 0.7, 1.8)
			_life = 0.38
			_trail.amount = 16
		2:
			_size(_tip_flame, 0.42)
			_tip_flame.amount = 26
			_tip_flame.lifetime = 0.5
			_stream.amount = 9
			_size(_stream, 0.55)
			_life = 0.62
			_arc = true
			_trail.amount = 40
		3:
			_size(_tip_flame, 0.14)
			_stream.amount = 120
			_size(_stream, 0.32)
			_grow(_stream, 0.6, 4.2)
			_stream.spread = 7.0
			_life = 0.48
			_trail.amount = 30
		4:
			_size(_tip_flame, 0.22)
			_stream.amount = 140
			_size(_stream, 0.45)
			_grow(_stream, 0.6, 4.6)
			_stream.spread = 9.0
			_life = 0.55
			_trail.amount = 40
			if not _gold:
				_ramp(_stream, [Color("#F0A0E8"), Color(Color("#9B4FD1"), 0.95), Color(Color("#5C2B8C"), 0.7), Color(soot, 0.0)])
		_:
			_size(_tip_flame, 0.2)
			_stream.amount = 12
			_size(_stream, 1.1)
			_life = 0.8
			_from_sky = true
			_trail.amount = 60
			if not _gold:
				_ramp(_stream, [Color("#FFE08A"), Color(core, 1.0), Color(body, 0.8), Color(soot, 0.0)])
	_stream.lifetime = _life
	_trail.lifetime = _life * 1.3


func update(active: bool, tip: Vector3, target: Vector3, _delta: float) -> void:
	if tool < 0:
		return
	if _gold != GameState.phoenix_on:
		setup(tool)
	# The torch is always lit; the match and the flamethrower's pilot light too.
	_tip_flame.global_position = tip
	_tip_flame.emitting = active or tool in [0, 2, 3]
	_stream.emitting = active
	_trail.emitting = active
	_impact.emitting = active
	if not active:
		return
	var from := tip
	if _from_sky:
		from = target + Vector3(-6.0, 22.0, 4.0)
	var d := target - from
	var v: Vector3
	if _arc:
		var t := _life * 0.85
		var g := Vector3(0, -9.0, 0)
		v = (d - 0.5 * g * t * t) / t
		_stream.gravity = g
		_trail.gravity = g
	else:
		v = d / (_life * 0.85)
		_stream.gravity = Vector3(0, 1.2, 0)
		_trail.gravity = Vector3(0, 0.8, 0)
	_stream.global_position = from
	_stream.direction = v.normalized()
	_stream.initial_velocity_min = v.length() * 0.93
	_stream.initial_velocity_max = v.length() * 1.05
	_trail.global_position = from
	_trail.direction = v.normalized()
	_trail.initial_velocity_min = v.length() * 0.75
	_trail.initial_velocity_max = v.length() * 1.0
	_impact.global_position = target + Vector3(0, 0.3, 0)
	_impact.emission_sphere_radius = GameState.tool_radius() * 0.6


static func glow_color() -> Color:
	return Color(1.0, 0.55, 0.2)
