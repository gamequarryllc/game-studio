class_name Player
extends CharacterBody3D
## First-person miner: a capsule on Godot's physics, walking on the rock's
## collision meshes. Carries the tool (ToolRig) and a headlamp. Hold DIG to
## strike whatever the crosshair is on: each tool strikes `rate` times a
## second (the 2x boost makes you strike twice as fast).

signal struck(result: Dictionary, at: Vector3, normal: Vector3)   # a strike landed on rock
signal whiffed                                                   # a swing with nothing in reach

const RADIUS := 0.3
const HEIGHT := 1.7
const EYE := 1.55
const GRAVITY := 20.0
const STEP_HEIGHT := 0.5
const WORLD_LAYER := 1       # the field, the shack, the lift
const ROCK_LAYER := 2        # the dig site
const MAX_STRIKES_PER_FRAME := 3
const VIEWMODEL_LAYER := 1 << 10   # the tool and hands: drawn only by the viewmodel camera
const LAMP_COLOR := Color(1.0, 0.83, 0.58)   # lamp amber, a little whiter in the middle of the beam

var field: DigField
var bounds_min := Vector3(-36.0, -300.0, -36.0)
var bounds_max := Vector3(36.0, 40.0, 36.0)

# Set by the controls every frame.
var move_input := Vector2.ZERO
var digging := false
var input_enabled := true

var on_floor := false
var yaw := 0.0
var pitch := -0.2
var camera: Camera3D
var vm_camera: Camera3D            # draws the tool on top of the world (its own SubViewport)
var vm_viewport: SubViewport
var vm_env: Environment
var head: Node3D
var rig: ToolRig
var lamp: SpotLight3D
var fill: OmniLight3D
var target: Dictionary = {"hit": false}   # what the crosshair is on: {hit, pos, normal, dist}
var steps := 0
var strikes := 0                           # strikes landed (tests count these)
var fall_speed := 0.0                      # how fast we were falling when we landed (for the thud)
var landed := false

var _shape: CollisionShape3D
var _probe := CapsuleShape3D.new()
var _cam_offset_y := 0.0
var _bob_t := 0.0
var _strike_acc := 0.0
var _was_digging := false
var _shake := 0.0
var _was_floor := true


func _ready() -> void:
	collision_layer = 4
	collision_mask = WORLD_LAYER | ROCK_LAYER
	floor_max_angle = deg_to_rad(52.0)
	floor_snap_length = 0.35
	floor_constant_speed = true
	safe_margin = 0.02
	var capsule := CapsuleShape3D.new()
	capsule.radius = RADIUS
	capsule.height = HEIGHT
	_shape = CollisionShape3D.new()
	_shape.shape = capsule
	_shape.position = Vector3(0, HEIGHT * 0.5, 0)
	add_child(_shape)
	_probe.radius = RADIUS - 0.06
	_probe.height = HEIGHT - 0.12

	head = Node3D.new()
	head.position = Vector3(0, EYE, 0)
	add_child(head)
	camera = Camera3D.new()
	camera.fov = 74.0
	camera.near = 0.06
	camera.far = 400.0
	camera.current = true
	camera.cull_mask = 0xFFFFF & ~VIEWMODEL_LAYER
	head.add_child(camera)
	_build_viewmodel_camera()

	lamp = SpotLight3D.new()
	lamp.light_color = LAMP_COLOR
	lamp.light_energy = 1.5
	lamp.spot_range = Balance.HEADLAMP_RANGE
	lamp.spot_angle = Balance.HEADLAMP_ANGLE
	lamp.spot_angle_attenuation = 0.6   # a soft edge to the pool, not a torch circle
	lamp.spot_attenuation = 0.55  # a flat falloff (no blow-out at the lens): the zone-tinted fog takes it the rest of the way to black
	lamp.light_specular = 0.6
	lamp.position = Vector3(0.0, 0.12, 0.0)
	lamp.layers = 1 | VIEWMODEL_LAYER   # lights only reach cameras whose cull mask includes their layers
	camera.add_child(lamp)
	fill = OmniLight3D.new()
	fill.light_color = Color(1.0, 0.72, 0.42)
	fill.light_energy = 0.1
	fill.omni_range = 2.6
	fill.omni_attenuation = 2.0
	fill.light_specular = 0.0
	fill.layers = 1 | VIEWMODEL_LAYER
	camera.add_child(fill)

	rig = ToolRig.new()
	rig.player = self
	camera.add_child(rig)

	rotation.y = yaw
	head.rotation.x = pitch


func _build_viewmodel_camera() -> void:
	## The tool in your hands is drawn by a second camera into a transparent
	## SubViewport laid over the 3D view (under the HUD). It shares the world,
	## so the headlamp and the sun still light it, but it can never clip into
	## the rock or the near plane.
	var layer := CanvasLayer.new()
	layer.layer = 1
	add_child(layer)
	var box := SubViewportContainer.new()
	box.stretch = true
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(box)
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	vm_viewport = SubViewport.new()
	vm_viewport.transparent_bg = true
	vm_viewport.handle_input_locally = false
	vm_viewport.gui_disable_input = true
	vm_viewport.audio_listener_enable_3d = false
	box.add_child(vm_viewport)
	vm_env = Environment.new()
	vm_env.background_mode = Environment.BG_CLEAR_COLOR
	vm_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	vm_env.ambient_light_color = Color(0.5, 0.5, 0.5)
	vm_env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	vm_env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	vm_env.tonemap_white = 6.0
	vm_camera = Camera3D.new()
	vm_camera.cull_mask = VIEWMODEL_LAYER
	vm_camera.near = 0.01
	vm_camera.far = 6.0
	vm_camera.fov = camera.fov
	vm_camera.environment = vm_env
	vm_viewport.add_child(vm_camera)
	vm_camera.current = true


func sync_viewmodel(env: Environment, render_scale: float = -1.0) -> void:
	## Keeps the tool lit like the world around it (called by World).
	vm_env.ambient_light_color = env.ambient_light_color
	vm_env.ambient_light_energy = env.ambient_light_energy
	if render_scale > 0.0:
		vm_viewport.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
		vm_viewport.scaling_3d_scale = render_scale


# --- Looking -------------------------------------------------------------------------
func add_look(d: Vector2) -> void:
	yaw -= d.x
	pitch = clampf(pitch - d.y, -1.5, 1.45)
	rotation.y = yaw
	head.rotation.x = pitch


func set_view(p_yaw: float, p_pitch: float) -> void:
	yaw = p_yaw
	pitch = clampf(p_pitch, -1.5, 1.45)
	rotation.y = yaw
	if head != null:
		head.rotation.x = pitch


func look_at_point(p: Vector3) -> void:
	var eye := position + Vector3(0, EYE, 0)
	var d := p - eye
	set_view(atan2(-d.x, -d.z), atan2(d.y, Vector2(d.x, d.z).length()))


func aim_dir() -> Vector3:
	return -camera.global_transform.basis.z


func eye_pos() -> Vector3:
	return camera.global_position


# --- Moving --------------------------------------------------------------------------
func jump() -> void:
	if on_floor and input_enabled:
		velocity.y = Balance.JUMP_VELOCITY
		on_floor = false
		Sound.play("jump", -10.0, 1.0, 0.05)


func teleport(at: Vector3, p_yaw: float, p_pitch: float = -0.2) -> void:
	position = at
	velocity = Vector3.ZERO
	set_view(p_yaw, p_pitch)
	unstick()


func _physics_process(delta: float) -> void:
	_move(delta)
	_update_tool(delta)


func _process(delta: float) -> void:
	_animate_camera(minf(delta, 0.05))
	if vm_camera != null and camera.is_inside_tree():
		vm_camera.global_transform = camera.global_transform
		vm_camera.fov = camera.fov


func _move(delta: float) -> void:
	var speed := Balance.WALK_SPEED
	var turn := Basis(Vector3.UP, yaw)
	var mv := move_input.limit_length(1.0) if input_enabled else Vector2.ZERO
	var wish := turn * Vector3(mv.x, 0.0, -mv.y) * speed
	velocity.x = wish.x
	velocity.z = wish.z
	if not on_floor:
		velocity.y -= GRAVITY * delta
		velocity.y = maxf(velocity.y, -40.0)
	var falling := -velocity.y
	if on_floor and mv.length() > 0.1 and _step_up(Vector3(wish.x, 0.0, wish.z) * delta):
		velocity.x = 0.0
		velocity.z = 0.0
	_slide(delta)
	velocity.x = wish.x
	velocity.z = wish.z
	on_floor = is_on_floor()
	if on_floor and not _was_floor:
		landed = true
		fall_speed = falling
	_was_floor = on_floor
	if on_floor and velocity.y < 0.0:
		velocity.y = 0.0
	var p := position
	p.x = clampf(p.x, bounds_min.x + RADIUS, bounds_max.x - RADIUS)
	p.z = clampf(p.z, bounds_min.z + RADIUS, bounds_max.z - RADIUS)
	position = p
	# Inside the rock? (A floor that was dug out from under us before the
	# chunk below had its new mesh.) Climb out.
	if field != null and field.density_at(position + Vector3(0, 0.2, 0)) > 0.55:
		unstick()
	if field != null and position.y < field.bottom_y - 2.0:
		position.y = field.bottom_y + 2.0
		velocity = Vector3.ZERO
	if on_floor and mv.length() > 0.1:
		var before := _bob_t
		_bob_t += delta * speed * 2.2
		if floori(_bob_t / PI) != floori(before / PI):
			steps += 1


func _slide(delta: float) -> void:
	var engine_dt := get_physics_process_delta_time() if Engine.is_in_physics_frame() else get_process_delta_time()
	if engine_dt <= 0.0 or absf(engine_dt - delta) < 0.00001:
		move_and_slide()
		return
	var k := delta / engine_dt
	velocity *= k
	move_and_slide()
	velocity /= k


func _step_up(motion: Vector3) -> bool:
	## Walking into a low ledge: hop up onto it instead of stopping.
	var col := KinematicCollision3D.new()
	if not test_move(global_transform, motion, col):
		return false
	if col.get_normal().y > 0.65:
		return false
	var up := Vector3(0, STEP_HEIGHT, 0)
	if test_move(global_transform, up):
		return false
	var raised := global_transform.translated(up)
	if test_move(raised, motion):
		return false
	var down := KinematicCollision3D.new()
	if not test_move(raised.translated(motion), -up, down):
		return false
	var rise := STEP_HEIGHT - down.get_travel().length()
	if rise <= 0.03:
		return false
	global_position += motion + Vector3(0, rise + 0.01, 0)
	_cam_offset_y -= rise
	return true


func collides(p: Vector3) -> bool:
	if field != null:
		for h in [0.25, 0.85, 1.45]:
			if field.solid_at(p + Vector3(0, h, 0)):
				return true
	if not is_inside_tree():
		return false
	# A slightly slimmer capsule than the real one: leaning on a wall isn't
	# being stuck in it (and unstick() mustn't push you up the wall for it).
	var q := PhysicsShapeQueryParameters3D.new()
	q.shape = _probe
	q.transform = Transform3D(Basis(), p + Vector3(0, HEIGHT * 0.5 + 0.06, 0))
	q.collision_mask = WORLD_LAYER | ROCK_LAYER
	q.exclude = [get_rid()]
	return not get_world_3d().direct_space_state.intersect_shape(q, 1).is_empty()


func unstick() -> void:
	## If digging or loading ever leaves us inside something, pop up on top.
	var guard := 0
	while collides(position) and guard < 200:
		position.y += 0.2
		guard += 1
	if guard > 0:
		velocity.y = maxf(velocity.y, 0.0)
	on_floor = false


func _animate_camera(delta: float) -> void:
	_cam_offset_y = lerpf(_cam_offset_y, 0.0, minf(1.0, delta * 12.0))
	var bob := sin(_bob_t) * 0.035
	_shake = maxf(0.0, _shake - delta * 3.5)
	var sh := Vector3(randf_range(-1, 1), randf_range(-1, 1), 0.0) * _shake * 0.05
	head.position = Vector3(sh.x, EYE + _cam_offset_y + bob + sh.y, 0.0)


func shake(amount: float) -> void:
	_shake = clampf(maxf(_shake, amount), 0.0, 1.0)


# --- The tool ---------------------------------------------------------------------------
func _update_tool(delta: float) -> void:
	var reach := GameState.tool_reach()
	if field != null and camera != null and is_inside_tree():
		target = field.raycast(eye_pos(), aim_dir(), reach)
	else:
		target = {"hit": false}
	var active := digging and input_enabled
	if active and not _was_digging:
		_strike_acc = rig.first_strike_phase()   # the first blow lands quickly
	_was_digging = active
	if active:
		_strike_acc += delta * GameState.tool_rate()
		var n := floori(_strike_acc)
		if n > 0:
			_strike_acc -= n
			var dmg := GameState.tool_damage()
			if n > MAX_STRIKES_PER_FRAME:
				dmg *= float(n) / MAX_STRIKES_PER_FRAME
				n = MAX_STRIKES_PER_FRAME
			for _i in n:
				strike(dmg)
	rig.update(delta, active, _strike_acc, target)
	# Headlamp: brighter underground, reach from the upgrade.
	var under := clampf(-position.y / 6.0, 0.0, 1.0)
	lamp.spot_range = GameState.lamp_range() * 0.86
	lamp.light_energy = lerpf(0.4, 2.8, under)
	fill.light_energy = lerpf(0.0, 0.1, under)
	if field != null and field.material != null:
		field.material.set_shader_parameter("lamp_pos", eye_pos())
		field.material.set_shader_parameter("lamp_range", lamp.spot_range)
		for m in field.decor_mats.values():
			(m as ShaderMaterial).set_shader_parameter("lamp_range", lamp.spot_range)


func strike(damage: float) -> Dictionary:
	## One blow of the tool at the crosshair.
	if not target.hit:
		whiffed.emit()
		return {}
	strikes += 1
	if rig.kind() == "dynamite":
		rig.throw_stick(target.pos, target.normal, damage)
		return {}
	var at: Vector3 = target.pos
	var nrm: Vector3 = target.normal
	var r := field.dig(at - nrm * 0.18, GameState.tool_radius(), damage)
	rig.on_strike(r, at, nrm)
	struck.emit(r, at, nrm)
	return r
