class_name EndingShot
extends Node3D
## The lost town's payoff. The HUD goes, the last water drains away and
## the calf goes home over the wall in a held beat; then the camera leaves
## the diorama view and dollies down to the clock tower in low gold light,
## the haze in the deep lifting, weed dripping off its ledges and every wet
## stone glinting. Only once the camera has settled does the card come in,
## a folded chart slid in from the left, out of the way of the tower.

var world
var running := false
var cam: Camera3D
var _lines: Array = []
var _overlays: Array = []
var _drips: Array = []
var _warm: OmniLight3D
var _saved := {}
var _t := 0.0
var _from: Transform3D
var _look_from := Vector3.ZERO
var _to_pos := Vector3.ZERO
var _look_to := Vector3.ZERO
var _phase := 0
var _card_shown := false
var _hidden: Array = []

const BEAT := 1.9
const DOLLY := 5.2


func play(w, lines: Array) -> void:
	world = w
	_lines = lines
	running = true
	_t = 0.0
	_phase = 0
	world.hud.ending_closed.connect(_on_closed, CONNECT_ONE_SHOT)


func _process(delta: float) -> void:
	if not running:
		return
	var rd := delta / maxf(Engine.time_scale, 0.001)
	_t += rd
	if _phase == 0 and _t >= BEAT:
		_phase = 1
		_t = 0.0
		_start_dolly()
	elif _phase == 1:
		var u := clampf(_t / DOLLY, 0.0, 1.0)
		var e := u * u * u * (u * (u * 6.0 - 15.0) + 10.0)        # smootherstep
		var look := _look_from.lerp(_look_to, e)
		var pos := _from.origin.lerp(_to_pos, e)
		# a little lift through the middle of the move, like a crane
		pos.y += sin(u * PI) * 3.0
		cam.global_transform = Transform3D(Basis.looking_at(look - pos, Vector3.UP), pos)
		if u >= 1.0:
			_phase = 2
			_t = 0.0
	elif _phase == 2:
		# settle, then the card; keep a slow push-in going under it
		var push := minf(_t / 30.0, 1.0)
		var pos := _to_pos.lerp(_look_to, 0.12 * push)
		cam.global_transform = Transform3D(Basis.looking_at(_look_to - pos, Vector3.UP), pos)
		if not _card_shown and _t > 0.6:
			_card_shown = true
			world.hud.show_ending(_lines)


func _start_dolly() -> void:
	var rig = world.rig
	_from = rig.camera.global_transform
	_look_from = _from.origin + (-_from.basis.z) * rig.distance()
	var tower: Node3D = world.props.clock_tower
	var base: Vector3 = tower.global_position if tower != null else world.bay.vertex_pos(world.bay.sink)
	_look_to = base + Vector3(0.0, 10.2, 0.0)
	# from the south-south-west, low, so the sun rakes across the tower's face,
	# but never inside the slope of the basin: rise until the camera clears
	# the seabed and can see the tower's foot (it used to sit 1.7 m under the
	# sand, looking through the back of the terrain)
	_to_pos = base + Vector3(-8.5, 6.5, 22.0)
	for _i in 40:
		if sightline_clear(_to_pos, base):
			break
		_to_pos.y += 0.5
	cam = Camera3D.new()
	cam.fov = 38.0
	cam.near = 0.3
	cam.far = 1200.0
	add_child(cam)
	cam.global_transform = _from
	cam.current = true
	rig.enabled = false
	# nothing stranded flopping in front of the lens: the shot is the tower's
	world.creatures.clear_view = [_to_pos, base + Vector3(0, 2.0, 0), 4.0]
	# and no barge left aground in the square in front of the lens
	for b in world.pumps.barges:
		var bn: Node3D = b.node
		if bn.visible and world.creatures._in_the_way(bn.global_position):
			bn.visible = false
			_hidden.append(bn)
	_light_up(base)


func sightline_clear(eye: Vector3, base: Vector3) -> bool:
	## The camera at `eye` is above the seabed and sees the tower's foot.
	var bay = world.bay
	var foot := base + Vector3(0, 2.5, 0)
	for k in 19:
		var p := eye.lerp(foot, float(k) / 20.0)
		if bay.height_at(p.x, p.z) + (1.5 if k == 0 else 0.6) > p.y:
			return false
	return true


func _light_up(base: Vector3) -> void:
	## Low gold light on the town, the haze in the deep lifting, wet glints.
	var sun: DirectionalLight3D = world.sun
	var env: Environment = world.env.environment
	_saved = {"sun_col": sun.light_color, "sun_e": sun.light_energy, "fog_h": env.fog_height_density, "fog_d": env.fog_density,
		"amb": env.ambient_light_energy}
	var tw := create_tween().set_parallel(true)
	tw.tween_property(sun, "light_color", Color("#ffb06a"), 3.5)
	tw.tween_property(sun, "light_energy", 2.15, 3.5)
	tw.tween_property(env, "fog_height_density", 0.004, 3.0)
	tw.tween_property(env, "fog_density", 0.0004, 3.0)
	tw.tween_property(env, "ambient_light_energy", 0.5, 3.0)
	_warm = OmniLight3D.new()
	_warm.light_color = Color("#ffc58a")
	_warm.light_energy = 0.0
	_warm.omni_range = 26.0
	_warm.position = base + Vector3(-7.0, 9.0, 9.0)
	add_child(_warm)
	tw.tween_property(_warm, "light_energy", 1.6, 3.0)
	# every building in the town glistens: an added specular coat
	var gloss := StandardMaterial3D.new()
	gloss.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	gloss.albedo_color = Color(0, 0, 0)
	gloss.roughness = 0.14
	gloss.metallic_specular = 1.0
	for n in world.props.town_nodes:
		_coat(n, gloss)
	# weed dripping from the tower's ledges, and off the chapel
	if world.props.clock_tower != null:
		_drips.append(_dripper(base + Vector3(0, 12.5, 0), Vector3(2.3, 0.6, 2.3), 34))
		_drips.append(_dripper(base + Vector3(0, 15.6, 0), Vector3(1.9, 0.3, 1.9), 18))
		_drips.append(_dripper(base + Vector3(0, 6.0, 0), Vector3(2.0, 3.5, 2.0), 14))
	for n in world.props.town_nodes:
		if n != world.props.clock_tower:
			_drips.append(_dripper((n as Node3D).global_position + Vector3(0, 4.6, 0), Vector3(2.6, 0.3, 2.6), 10))


func _coat(n: Node, m: Material) -> void:
	if n is GeometryInstance3D:
		(n as GeometryInstance3D).material_overlay = m
		_overlays.append(n)
	for c in n.get_children():
		_coat(c, m)


func _dripper(at: Vector3, box: Vector3, amount: int) -> CPUParticles3D:
	var ps := CPUParticles3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(0.03, 0.18)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	m.albedo_color = Color(0.7, 0.86, 0.86, 0.45)
	q.material = m
	ps.mesh = q
	ps.amount = amount
	ps.lifetime = 1.1
	ps.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	ps.emission_box_extents = box
	ps.direction = Vector3.DOWN
	ps.spread = 2.0
	ps.initial_velocity_min = 0.2
	ps.initial_velocity_max = 0.6
	ps.gravity = Vector3(0, -9.8, 0)
	ps.position = at
	ps.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(ps)
	return ps


func _on_closed() -> void:
	running = false
	var sun: DirectionalLight3D = world.sun
	var env: Environment = world.env.environment
	if not _saved.is_empty():
		sun.light_color = _saved.sun_col
		sun.light_energy = _saved.sun_e
		env.fog_height_density = _saved.fog_h
		env.fog_density = _saved.fog_d
		env.ambient_light_energy = _saved.amb
	for n in _overlays:
		if is_instance_valid(n):
			(n as GeometryInstance3D).material_overlay = null
	world.creatures.clear_view = []
	for n in _hidden:
		if is_instance_valid(n):
			(n as Node3D).visible = true
	world.rig.enabled = true
	world.rig.camera.current = true
	queue_free()
