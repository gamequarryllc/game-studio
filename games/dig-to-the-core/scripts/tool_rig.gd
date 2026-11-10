class_name ToolRig
extends Node3D
## The tool in your hands and everything it throws about.
##
## Sits on the camera. Shows the current tool (shovel, pickaxe, jackhammer,
## drill, dynamite, laser drill, earth-borer) with the gloved hands holding it,
## as composed in Blender (art/blender/tools.py: each model is framed in
## camera space, so it goes at the eye as it is). Only the viewmodel camera
## draws it (Player.VIEWMODEL_LAYER), so it never clips into the rock. It
## animates: shovels and pickaxes swing from the shoulder in time with their
## strikes (the blow lands exactly when the strike happens), the jackhammer
## shakes, the drill bit spins, the laser fires a beam from its muzzle. Where a strike lands: rock chips in
## the rock's own colour, a dust puff, sparks on hard rock, clods of dirt
## from the shovel. Dynamite is thrown in an arc and goes off a moment later.

var player: Player
var _model: Node3D
var _bit: Node3D            # the part that spins (drill bit, borer head)
var _muzzle: Node3D         # where the laser beam starts
var _idle_t := 0.0
var _shown := -1
var _shown_skin := "-"
var _phase := 0.0
var _vib := 0.0
var _spin := 0.0
var _active := false
var _hitting := false
var _rock_color := Color(0.45, 0.32, 0.2)
var _hard := 1.0             # how many strikes the rock under the crosshair takes (1 = soft)

var _debris: CPUParticles3D
var _clods: CPUParticles3D
var _dust: CPUParticles3D
var _sparks: CPUParticles3D
var _flash: OmniLight3D
var _beam: MeshInstance3D
var _beam_mat: StandardMaterial3D
var _beam_end: MeshInstance3D
var _sticks: Array = []     # dynamite in flight: {node, from, to, t, fuse, damage, normal, landed}
var _hand_stick_t := 0.0

# Where each tool swings from (camera space, Godot axes): the hands, so the
# working end rises and falls and nothing swings back into your face.
const PIVOTS := {
	"shovel": Vector3(0.4, -0.24, -0.3),
	"pickaxe": Vector3(0.26, -0.25, -0.32),
	"dynamite": Vector3(0.3, -0.45, -0.3),
}


func _ready() -> void:
	position = Vector3.ZERO
	_debris = _particles(true, 0.075, 70)
	_debris.direction = Vector3(0, 1, 0)
	_debris.spread = 55.0
	_debris.initial_velocity_min = 1.6
	_debris.initial_velocity_max = 4.2
	_debris.gravity = Vector3(0, -14.0, 0)
	_debris.lifetime = 1.0
	_debris.angular_velocity_min = -400.0
	_debris.angular_velocity_max = 400.0
	_debris.scale_amount_min = 0.5
	_debris.scale_amount_max = 1.6
	_clods = _particles(true, 0.16, 18)
	_clods.direction = Vector3(0, 1, 0)
	_clods.spread = 35.0
	_clods.initial_velocity_min = 2.0
	_clods.initial_velocity_max = 3.6
	_clods.gravity = Vector3(0, -12.0, 0)
	_clods.lifetime = 1.1
	_clods.scale_amount_min = 0.5
	_clods.scale_amount_max = 1.3
	_dust = _particles(false, 0.3, 8)
	_dust.direction = Vector3(0, 1, 0)
	_dust.spread = 80.0
	_dust.initial_velocity_min = 0.2
	_dust.initial_velocity_max = 0.9
	_dust.gravity = Vector3(0, 0.15, 0)
	_dust.lifetime = 1.4
	_dust.scale_amount_min = 0.6
	_dust.scale_amount_max = 1.6
	_dust.color_ramp = _ramp(Color(1, 1, 1, 0.13), Color(1, 1, 1, 0.0))
	var curve := Curve.new()
	curve.add_point(Vector2(0, 0.5))
	curve.add_point(Vector2(1, 1.6))
	_dust.scale_amount_curve = curve
	_sparks = _particles(false, 0.045, 40)
	_sparks.direction = Vector3(0, 1, 0)
	_sparks.spread = 70.0
	_sparks.initial_velocity_min = 3.5
	_sparks.initial_velocity_max = 7.5
	_sparks.gravity = Vector3(0, -10.0, 0)
	_sparks.lifetime = 0.35
	_sparks.color_ramp = _ramp(Color(1.0, 0.95, 0.7, 1.0), Color(1.0, 0.45, 0.1, 0.0))
	_sparks.color = Color(1, 1, 1)
	(_sparks.mesh.surface_get_material(0) as StandardMaterial3D).billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	_flash = OmniLight3D.new()
	_flash.light_color = Color(1.0, 0.7, 0.35)
	_flash.omni_range = 2.6
	_flash.omni_attenuation = 1.6
	_flash.light_energy = 0.0
	_flash.top_level = true
	_flash.layers = 1 | Player.VIEWMODEL_LAYER
	add_child(_flash)
	# The laser beam: a thin glowing cylinder stretched to the target.
	_beam = MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.025
	cyl.bottom_radius = 0.025
	cyl.height = 1.0
	cyl.radial_segments = 8
	cyl.rings = 1
	_beam.mesh = cyl
	_beam_mat = StandardMaterial3D.new()
	_beam_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_beam_mat.albedo_color = Color(1.0, 0.25, 0.4)
	_beam_mat.emission_enabled = true
	_beam_mat.emission = Color(1.0, 0.3, 0.45)
	_beam_mat.emission_energy_multiplier = 3.0
	_beam.material_override = _beam_mat
	_beam.top_level = true
	_beam.visible = false
	_beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_beam)
	_beam_end = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(0.6, 0.6)
	var em := StandardMaterial3D.new()
	em.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	em.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	em.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	em.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	em.albedo_texture = UiTheme.soft_dot()
	em.albedo_color = Color(1.0, 0.45, 0.55)
	q.material = em
	_beam_end.mesh = q
	_beam_end.top_level = true
	_beam_end.visible = false
	add_child(_beam_end)


func _particles(shaded: bool, size: float, amount: int) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = amount
	p.emitting = false
	p.one_shot = true
	p.explosiveness = 0.95
	p.local_coords = false
	p.top_level = true
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.vertex_color_is_srgb = true   # rock colours are picked in sRGB, like the rock's painted texture
	# Nothing kicked up by the tool may cover the lens: fade out right in front of it.
	mat.distance_fade_mode = BaseMaterial3D.DISTANCE_FADE_PIXEL_ALPHA
	mat.distance_fade_min_distance = 0.45
	mat.distance_fade_max_distance = 1.3
	if shaded:
		# Chips and clods: lit by the rock's own headlamp (chips.gdshader) on
		# the rock's render layer, so the player's spot (strong right at the
		# lens) can't flare them into pale confetti.
		var box := BoxMesh.new()
		box.size = Vector3(size, size * 0.8, size * 0.9)
		box.material = chip_material()
		p.mesh = box
		p.layers = Player.ROCK_VIS_LAYER
	else:
		var quad := QuadMesh.new()
		quad.size = Vector2(size, size)
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		mat.billboard_keep_scale = true
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.albedo_texture = UiTheme.soft_dot()
		quad.material = mat
		p.mesh = quad
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.12
	add_child(p)
	return p


static var _chip_mat: ShaderMaterial


static func chip_material() -> ShaderMaterial:
	## Shared by every rig's chips and clods; Player keeps its headlamp
	## uniforms in step with the rock's.
	if _chip_mat == null:
		_chip_mat = ShaderMaterial.new()
		_chip_mat.shader = load("res://shaders/chips.gdshader")
	return _chip_mat


static func _ramp(a: Color, b: Color) -> Gradient:
	var g := Gradient.new()
	g.set_color(0, a)
	g.set_color(1, b)
	return g


func kind() -> String:
	return str(GameState.tool_def().kind)


func first_strike_phase() -> float:
	## Where the strike clock starts when you start digging: the swinging tools
	## land their first blow after a short wind-up, the others right away.
	match kind():
		"shovel":
			return 0.62
		"pickaxe":
			return 0.55
		"dynamite":
			return 0.9
	return 0.95


# =====================================================================================
# Every frame
# =====================================================================================
func update(delta: float, active: bool, phase: float, target: Dictionary) -> void:
	if _shown != GameState.tool_index or _shown_skin != GameState.skin:
		_build_model()
	_active = active
	_hitting = active and target.hit
	if target.hit and player.field != null:
		var info := player.field.point_info(target.pos - target.normal * 0.15)
		if not info.wall:
			var mt: int = info.mat
			_rock_color = Balance.ORES[info.ore].color if int(info.ore) > 0 else Balance.MATERIALS[mt].color
			var per := GameState.tool_damage() / maxf(float(info.hp), 0.001)
			_hard = 0.5 / maxf(per, 0.0001)
	var k := kind()
	# Swing tools follow the strike clock; the rest settle to their rest pose.
	_phase = phase if active else move_toward(_phase, 0.0, delta * 2.5)
	_vib = move_toward(_vib, 1.0 if active else 0.0, delta * 8.0)
	var xf := Transform3D()
	_idle_t += delta
	var pv: Vector3 = PIVOTS.get(k, Vector3(0.15, -0.4, 0.0))
	match k:
		"shovel":
			# Wind up: pull back and lift; the blow: a thrust forward and down.
			var a := _cock(_phase)
			xf = Transform3D(Basis(), Vector3(0.0, 0.03 * a, 0.05 * a - 0.07 * (1.0 - a) * float(active))) * _about(pv, Vector3.RIGHT, 0.26 * a - 0.08 * float(active))
		"pickaxe":
			var a := _cock(_phase)
			xf = Transform3D(Basis(), Vector3(0.0, 0.05 * a, 0.03 * a)) * _about(pv, Vector3.RIGHT, 0.55 * a - 0.2 * float(active))
		"jackhammer", "borer":
			var j := 0.009 if k == "jackhammer" else 0.006
			if _vib > 0.0:
				xf = xf.translated_local(Vector3(randf_range(-j, j), randf_range(-j, j), randf_range(-j, j) * 2.0 + 0.012) * _vib)
		"drill", "laser":
			if _vib > 0.0:
				xf = xf.translated_local(Vector3(randf_range(-0.003, 0.003), randf_range(-0.003, 0.003), 0.012) * _vib)
		"dynamite":
			_hand_stick_t = maxf(0.0, _hand_stick_t - delta)
			var a := _cock(_phase)
			xf = Transform3D(Basis(), Vector3(0.0, 0.05 * a, 0.08 * a)) * _about(pv, Vector3.RIGHT, 0.4 * a)
			if _model != null:
				_model.visible = _hand_stick_t <= 0.0
	# A slow breath when nothing's happening.
	var calm := 1.0 - _vib
	xf = xf.translated(Vector3(0.0, sin(_idle_t * 1.4) * 0.004 * calm, 0.0))
	if _model != null:
		_model.transform = xf
	if _bit != null:
		var spin_to := 30.0 if active else 0.0
		_spin = move_toward(_spin, spin_to, delta * 40.0)
		_bit.rotate_object_local(Vector3.FORWARD, _spin * delta)
	# Continuous tools: chips, dust and sparks stream out while they're on the rock.
	var continuous := k in ["jackhammer", "drill", "laser", "borer"]
	if continuous:
		_stream(_hitting, target, k, delta)
	else:
		_stream(false, target, k, delta)
	_update_beam(k, active, target)
	_update_sticks(delta)
	_flash.light_energy = move_toward(_flash.light_energy, 0.0, delta * 9.0)
	_update_sound(k, active, _hitting)


static func _about(pivot: Vector3, axis: Vector3, angle: float) -> Transform3D:
	## A turn of `angle` about `axis` through `pivot` (camera space).
	return Transform3D(Basis(), pivot) * Transform3D(Basis(axis, angle), Vector3.ZERO) * Transform3D(Basis(), -pivot)


static func _cock(ph: float) -> float:
	## 0 = the blow has just landed, 1 = fully wound up. Winds up slowly,
	## comes down fast.
	if ph < 0.7:
		return smoothstep(0.0, 0.7, ph)
	var t := (ph - 0.7) / 0.3
	return 1.0 - t * t


var _stream_on := false


func _stream(on: bool, target: Dictionary, k: String, _delta: float) -> void:
	if on:
		var at: Vector3 = target.pos + target.normal * 0.06
		for p in [_debris, _dust, _sparks]:
			(p as CPUParticles3D).global_position = at
			(p as CPUParticles3D).direction = target.normal
		if not _stream_on:
			_debris.amount = 18
			_dust.amount = 5
			_debris.one_shot = false
			_debris.explosiveness = 0.0
			_debris.emitting = true
			# Only the jackhammer kicks up dust; the drills and the laser throw sparks.
			_dust.one_shot = false
			_dust.explosiveness = 0.0
			_dust.emitting = k == "jackhammer"
			_sparks.one_shot = false
			_sparks.explosiveness = 0.0
			_sparks.emitting = k != "jackhammer" or _hard > 3.0
			_stream_on = true
		_debris.color = _rock_color.darkened(0.25)
		_dust.color = _rock_color.darkened(0.2)
		var light := _hard > 2.0 or k == "laser"
		_sparks.emitting = light or k == "drill" or k == "borer"
		_sparks.color = Color(1.0, 0.5, 0.6) if k == "laser" else Color(1, 1, 1)
		_flash.global_position = at + target.normal * 0.3
		_flash.light_energy = maxf(_flash.light_energy, 0.35 if k != "jackhammer" else 0.15)
		_flash.light_color = Color(1.0, 0.35, 0.45) if k == "laser" else Color(1.0, 0.68, 0.32)
	elif _stream_on:
		_stream_on = false
		for p in [_debris, _dust, _sparks]:
			(p as CPUParticles3D).emitting = false
			(p as CPUParticles3D).one_shot = true
			(p as CPUParticles3D).explosiveness = 0.95


func on_strike(r: Dictionary, at: Vector3, normal: Vector3) -> void:
	## A blow just landed (called by the player for every strike).
	var k := kind()
	var vol: float = r.get("volume", 0.0)
	var ore: int = r.get("ore", 0)
	if k == "shovel" or k == "pickaxe":
		var p := at + normal * 0.08
		_burst(_debris, p, normal, _rock_color, clampi(8 + int(vol * 60.0), 8, 40))
		_burst(_dust, p, normal, _rock_color.darkened(0.1), 5)
		if k == "shovel":
			_burst(_clods, p, (normal + Vector3.UP).normalized(), _rock_color.darkened(0.1), clampi(3 + int(vol * 12.0), 3, 12))
			player.shake(0.12)
		else:
			if _hard > 1.6 or ore > 0:
				_burst(_sparks, p, normal, Color(1, 1, 1), 14)
				_flash.global_position = p + normal * 0.3
				_flash.light_energy = 0.8
			player.shake(0.25)
	elif k == "jackhammer" or k == "borer":
		player.shake(0.08 if k == "jackhammer" else 0.12)
	_strike_sound(k, r, at)


func _burst(p: CPUParticles3D, at: Vector3, normal: Vector3, col: Color, n: int) -> void:
	if _stream_on and (p == _debris or p == _dust or p == _sparks):
		return
	p.global_position = at
	p.direction = normal
	p.color = col
	p.amount = maxi(1, n)
	p.restart()


# =====================================================================================
# Dynamite
# =====================================================================================
func throw_stick(to: Vector3, normal: Vector3, damage: float) -> void:
	var node := _stick_mesh()
	node.top_level = true
	add_child(node)
	var from := global_position + global_transform.basis * Vector3(0.0, 0.1, -0.2)
	node.global_position = from
	_sticks.append({"node": node, "from": from, "to": to + normal * 0.12, "t": 0.0, "fuse": 1.0,
		"damage": damage, "normal": normal, "landed": false})
	_hand_stick_t = 0.45
	Sound.play("throw", -6.0, 1.0, 0.1)


func _update_sticks(delta: float) -> void:
	for i in range(_sticks.size() - 1, -1, -1):
		var s: Dictionary = _sticks[i]
		var node: Node3D = s.node
		if not s.landed:
			s.t = float(s.t) + delta * 2.2
			var t := minf(float(s.t), 1.0)
			var p: Vector3 = (s.from as Vector3).lerp(s.to, t)
			p.y += sin(t * PI) * 1.2
			node.global_position = p
			node.rotate_x(delta * 12.0)
			if t >= 1.0:
				s.landed = true
				Sound.play_at("fuse", node.global_position, -6.0)
		else:
			s.fuse = float(s.fuse) - delta
			if randf() < 0.5:
				_burst_small_sparks(node.global_position)
			if float(s.fuse) <= 0.0:
				_explode(s)
				node.queue_free()
				_sticks.remove_at(i)


func _burst_small_sparks(at: Vector3) -> void:
	if _stream_on:
		return
	_sparks.global_position = at + Vector3(0, 0.1, 0)
	_sparks.direction = Vector3.UP
	_sparks.amount = 4
	_sparks.restart()


func _explode(s: Dictionary) -> void:
	var at: Vector3 = (s.node as Node3D).global_position
	var nrm: Vector3 = s.normal
	var r := player.field.dig(at - nrm * 0.3, GameState.tool_radius(), float(s.damage))
	var info := player.field.point_info(at - nrm * 0.5)
	var col: Color = Balance.MATERIALS[int(info.mat)].color if not info.wall else Color(0.4, 0.35, 0.3)
	_debris.one_shot = true
	_burst(_debris, at, nrm, col, 70)
	_burst(_clods, at, nrm, col.darkened(0.1), 18)
	_burst(_dust, at, nrm, Color(0.9, 0.8, 0.6), 24)
	_flash.global_position = at + nrm * 0.6
	_flash.light_color = Color(1.0, 0.75, 0.4)
	_flash.light_energy = 6.0
	var d := player.eye_pos().distance_to(at)
	player.shake(clampf(1.4 - d * 0.1, 0.2, 1.0))
	Sound.play_at("boom", at, 2.0, 1.0, 0.08)
	player.struck.emit(r, at, nrm)


# =====================================================================================
# The laser beam
# =====================================================================================
func _update_beam(k: String, active: bool, target: Dictionary) -> void:
	var on := k == "laser" and active
	_beam.visible = on
	_beam_end.visible = on and target.hit
	if not on:
		return
	var from := _muzzle.global_position if _muzzle != null else global_transform * Vector3(0.12, -0.12, -0.6)
	var to: Vector3 = target.pos if target.hit else player.eye_pos() + player.aim_dir() * GameState.tool_reach()
	var mid := (from + to) * 0.5
	var len := from.distance_to(to)
	var up := (to - from).normalized()
	var side := up.cross(Vector3.UP)
	if side.length_squared() < 0.001:
		side = Vector3.RIGHT
	side = side.normalized()
	var fwd := side.cross(up).normalized()
	var w := 1.0 + 0.25 * sin(Time.get_ticks_msec() * 0.05)
	_beam.global_transform = Transform3D(Basis(side * w, up * len, fwd * w), mid)
	if target.hit:
		_beam_end.global_position = target.pos + target.normal * 0.05
		_beam_end.scale = Vector3.ONE * (0.8 + 0.3 * randf())


# =====================================================================================
# Sound
# =====================================================================================
func _update_sound(k: String, active: bool, hitting: bool) -> void:
	var pitch := clampf(GameState.speed_mult() / GameState.debug_speed, 1.0, 2.0)
	pitch = 1.0 + (pitch - 1.0) * 0.12
	Sound.loop("tool", "%s_loop" % k, active and k in ["jackhammer", "drill", "laser", "borer"], -6.0, pitch)
	Sound.loop("grind", "grind_loop", hitting and k in ["drill", "laser", "borer"], -10.0 + clampf(_hard, 0.0, 4.0), 1.0 if k != "laser" else 1.6)


func _strike_sound(k: String, r: Dictionary, at: Vector3) -> void:
	var vol: float = r.get("volume", 0.0)
	match k:
		"shovel":
			Sound.play_at("shovel", at, -3.0, 1.0, 0.08)
		"pickaxe":
			if _hard > 1.6:
				Sound.play_at("pick_clink", at, -3.0, 1.0, 0.06)
			else:
				Sound.play_at("pick_thud", at, -2.0, 1.0, 0.08)
	if vol > 0.25 and k in ["shovel", "pickaxe", "dynamite"]:
		Sound.play_at("crumble", at, -8.0 + minf(vol * 4.0, 6.0), 1.0, 0.1, 0.12)
	if int(r.get("ore", 0)) > 0:
		var ore: int = r.ore
		Sound.play("ore_ping", -9.0, 0.9 + 0.05 * float(ore), 0.03, 0.09)


# =====================================================================================
# Models (Blender: art/blender/tools.py)
# =====================================================================================
func _stick_mesh() -> Node3D:
	return Models.instance("dynamite_stick")


func _skin_material() -> Material:
	match GameState.skin:
		"golden":
			var m := StandardMaterial3D.new()
			m.albedo_color = Color(1.0, 0.78, 0.3)
			m.metallic = 0.9
			m.roughness = 0.25
			m.vertex_color_use_as_albedo = true
			return m
		"crystal":
			var m := StandardMaterial3D.new()
			m.albedo_color = Color(0.72, 0.5, 1.0)
			m.metallic = 0.2
			m.roughness = 0.1
			m.emission_enabled = true
			m.emission = Color(0.45, 0.2, 0.8)
			m.emission_energy_multiplier = 0.8
			m.vertex_color_use_as_albedo = true
			return m
	return null


func _apply_skin(n: Node, m: Material) -> void:
	## The skin's material on the tool (never on the gloves), and every part on
	## the viewmodel layer, so only the viewmodel camera draws it.
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		if not str(mi.name).begins_with("Glove") and not str(mi.get_parent().name).begins_with("Glove"):
			mi.material_override = m
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.layers = Player.VIEWMODEL_LAYER
	for c in n.get_children():
		_apply_skin(c, m)


# Where each tool sits in the view (camera space, added to its modelled
# pose): left of the right thumb's buttons and above the tool plate, so the
# working end is always in the clear (TouchControls lays out the buttons).
const FRAME := {
	"shovel": Vector3(-0.07, 0.03, 0.0), "pickaxe": Vector3(-0.09, 0.02, 0.0), "jackhammer": Vector3(-0.17, 0.05, 0.0),
	"drill": Vector3(-0.16, 0.045, 0.0), "dynamite": Vector3(-0.11, 0.03, 0.0), "laser": Vector3(-0.17, 0.05, 0.0),
	"borer": Vector3(-0.16, 0.055, 0.0),
}


func _build_model() -> void:
	_shown = GameState.tool_index
	_shown_skin = GameState.skin
	if _model != null:
		_model.queue_free()
	var k := kind()
	position = FRAME.get(k, Vector3.ZERO)
	_model = Models.instance("tool_" + k)
	add_child(_model)
	_bit = Models.find(_model, "Bit")
	_muzzle = Models.find(_model, "Muzzle")
	_apply_skin(_model, _skin_material())
	_model.transform = Transform3D()
