class_name Giant
extends Node3D
## You: a giant in the warehouse, seen from your own eyes, looking down at the
## streets round your feet. You stride over the suburbs (anything below
## Balance.STEP_OVER), jumping clears downtown, skyscrapers and the castle you
## have to walk round. Your tool works where the crosshair (the middle of the
## screen) lands, out to its range; aim further and it falls short on the floor.
## The tool you hold is drawn at the bottom right of the view.

const TOOL_POSE := [
	# camera-space position of the grip, rotation (x, y, z), tip in the model's space.
	# Everything held stays within ~0.3 m of the eye, nearer than any wall can get
	# (the giant's body keeps 0.32 m off), so it's depth-tested normally and never clips.
	[Vector3(0.128, -0.088, -0.24), Vector3(0.1, -0.38, 0.12), Vector3(0, 0.25, -0.012)],
	[Vector3(0.118, -0.098, -0.24), Vector3(0.12, -0.2, 0.06), Vector3(0, 0.205, 0)],
	[Vector3(0.112, -0.09, -0.23), Vector3(0.0, -0.22, 0.04), Vector3(0, 0.19, -0.235)],
	[Vector3(0.112, -0.1, -0.24), Vector3(0.1, -0.25, 0.08), Vector3(0, 0.245, 0)],
]
const TOOL_MODELS := ["hand_magnifier", "hand_candle", "hand_blowtorch", "hand_bottle"]
const TOOL_SCALE := 0.3

var grid: CityGrid
var camera: Camera3D
var yaw := 0.0                       # 0 = looking north (-z)
var pitch := -0.6
var move_input := Vector2.ZERO       # x = right, y = forward
var firing := false
var input_enabled := true
var bounds := Rect2(-Warehouse.HALF + 1.6, -Warehouse.HALF + 1.6, Warehouse.HALF * 2.0 - 3.2, Warehouse.HALF * 2.0 - 3.2)
var aim := {"point": Vector3.ZERO, "sid": -1, "in_range": true, "hit": false}
var steps := 0
var jumped := 0
var landed := 0
var fx: ToolFx
var obstacles: Array = []            # [Vector2 centre, radius]: the warehouse props too tall to step over
var held_rocket: MeshInstance3D
var _reload := 0.0
var focus := 0.0                      # 0..1 how well the tool is focused on what it's pointed at
var _focus_sid := -2
var _lens_vp: SubViewport
var _lens_cam: Camera3D
const LENS_MAGNIFY := 1.9

var _vel_y := 0.0
var _feet := 0.0
var _on_ground := true
var _walk_t := 0.0
var _bob := 0.0
var _shake := 0.0
var _hold: Node3D
var _tool: MeshInstance3D
var _tool_mat: ShaderMaterial
var _shown_tool := -1
var _kick := 0.0
var _sway := Vector2.ZERO


func _ready() -> void:
	camera = Camera3D.new()
	camera.fov = 60.0
	camera.near = 0.05
	camera.far = 140.0
	camera.current = true
	camera.position = Vector3(0, Balance.EYE, 0)
	add_child(camera)
	_hold = Node3D.new()
	_hold.scale = Vector3.ONE * TOOL_SCALE
	camera.add_child(_hold)
	_tool_mat = ShaderMaterial.new()
	_tool_mat.shader = load("res://shaders/held_tool.gdshader")
	fx = ToolFx.new()
	fx.giant = self
	add_child(fx)
	# What you see through the magnifying glass: a small, narrow camera looking out
	# through the lens (it doesn't see the hand, which is on layer 2).
	_lens_vp = SubViewport.new()
	_lens_vp.size = Vector2i(224, 224)
	_lens_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_lens_vp.msaa_3d = Viewport.MSAA_DISABLED
	add_child(_lens_vp)
	_lens_cam = Camera3D.new()
	_lens_cam.cull_mask = 1
	_lens_cam.near = 0.3
	_lens_cam.far = 90.0
	_lens_vp.add_child(_lens_cam)
	_tool_mat.set_shader_parameter("lens_tex", _lens_vp.get_texture())
	_apply_view()


# =====================================================================================
# Looking
# =====================================================================================
func add_look(d: Vector2) -> void:
	yaw -= d.x
	pitch = clampf(pitch - d.y, Balance.PITCH.x, Balance.PITCH.y)


func set_view(y: float, p: float) -> void:
	yaw = y
	pitch = clampf(p, Balance.PITCH.x, Balance.PITCH.y)
	_apply_view()


func forward() -> Vector3:
	return -camera.global_transform.basis.z


func add_shake(amount: float) -> void:
	_shake = minf(1.0, _shake + amount)


func _apply_view() -> void:
	rotation = Vector3(0, yaw, 0)
	var t := Time.get_ticks_msec() * 0.001
	var sh := Vector2(sin(t * 47.0), cos(t * 39.0)) * _shake * 0.02
	camera.rotation = Vector3(pitch + sh.y, sh.x, 0)
	camera.position = Vector3(0, Balance.EYE + _feet + _bob, 0)


# =====================================================================================
# Per frame
# =====================================================================================
func _process(delta: float) -> void:
	var d := minf(delta, 0.05)
	_move(d)
	_shake = move_toward(_shake, 0.0, d * 1.6)
	_apply_view()
	update_aim()
	_update_tool(d)


func jump() -> void:
	if _on_ground and input_enabled:
		_vel_y = Balance.JUMP_VELOCITY
		_on_ground = false
		jumped += 1


func is_blocked(p: Vector2, feet: float) -> bool:
	## Would standing here put a leg through something too tall to step over?
	if grid == null:
		return false
	var r := Balance.BODY_RADIUS
	for o in [Vector2.ZERO, Vector2(r, 0), Vector2(-r, 0), Vector2(0, r), Vector2(0, -r)]:
		var q: Vector2 = p + o
		if grid.top_at(q.x, q.y) > feet + Balance.STEP_OVER:
			return true
	if feet < 0.4:
		for ob in obstacles:
			if p.distance_to(ob[0]) < float(ob[1]) + r:
				return true
	return false


func teleport(p: Vector3) -> void:
	## Put the giant somewhere (tests, the dev menu, a playthrough bot).
	position = Vector3(p.x, 0.0, p.z)
	_feet = 0.0
	_vel_y = 0.0
	_on_ground = true


func _move(d: float) -> void:
	var fwd := Vector3(-sin(yaw), 0, -cos(yaw))
	var right := Vector3(cos(yaw), 0, -sin(yaw))
	var mv := move_input.limit_length(1.0) if input_enabled else Vector2.ZERO
	var wish := (right * mv.x + fwd * mv.y) * GameState.move_speed()
	var here := Vector2(position.x, position.z)
	var step := Vector2(wish.x, wish.z) * d
	var to := here + step
	to.x = clampf(to.x, bounds.position.x, bounds.end.x)
	to.y = clampf(to.y, bounds.position.y, bounds.end.y)
	if is_blocked(to, _feet):
		# Slide along whatever's in the way.
		var tx := Vector2(to.x, here.y)
		var tz := Vector2(here.x, to.y)
		if not is_blocked(tx, _feet):
			to = tx
		elif not is_blocked(tz, _feet):
			to = tz
		else:
			to = here
	if is_blocked(here, _feet) and is_blocked(to, _feet):
		to = here + step   # standing inside something (it just rose?): walk out freely
	position.x = to.x
	position.z = to.y
	if not _on_ground:
		_vel_y -= Balance.GRAVITY * d
		_feet += _vel_y * d
		if _feet <= 0.0:
			_feet = 0.0
			_on_ground = true
			_vel_y = 0.0
			landed += 1
	var moving := mv.length() > 0.1 and _on_ground
	if moving:
		var before := _walk_t
		_walk_t += d * GameState.move_speed() * 1.35 * mv.length()
		if floori(_walk_t / PI) != floori(before / PI):
			steps += 1
	else:
		_walk_t = lerpf(_walk_t, round(_walk_t / PI) * PI, 1.0 - exp(-d * 8.0))
	_bob = -absf(sin(_walk_t)) * 0.07


# =====================================================================================
# Aiming
# =====================================================================================
func update_aim() -> void:
	if grid == null or camera == null:
		return
	var from := camera.global_position
	var dir := forward()
	var hit := Vector3.INF
	var hit_s := -1
	var t := 0.3
	while t < 45.0:
		var p := from + dir * t
		if p.y <= 0.0:
			hit = from + dir * (from.y / maxf(-dir.y, 0.0001))
			hit.y = 0.0
			break
		var s := grid.structure_at(p.x, p.z)
		if s >= 0 and grid.s_state[s] <= CityGrid.BURNING and p.y <= grid.s_height[s]:
			hit = p
			hit_s = s
			break
		t += 0.06 if t < 10.0 else 0.15
	var ok := hit.is_finite()
	if not ok:
		hit = from + dir * 45.0
	var range_m := GameState.tool_range()
	var flat := Vector2(hit.x - position.x, hit.z - position.z)
	var in_range := ok and flat.length() <= range_m
	if not in_range:
		var fd := flat.normalized() if flat.length() > 0.01 else Vector2(-sin(yaw), -cos(yaw))
		var q := Vector2(position.x, position.z) + fd * range_m
		hit = Vector3(q.x, 0.0, q.y)
		hit_s = grid.structure_at(q.x, q.y)
		if hit_s >= 0 and not grid.standing(hit_s):
			hit_s = -1
	aim = {"point": hit, "sid": hit_s, "in_range": in_range, "hit": ok}


func aim_at(point: Vector3) -> void:
	## Turn to look straight at a point (bots, tests, screenshots).
	var eye := global_position + Vector3(0, Balance.EYE + _feet, 0)
	var d := point - eye
	yaw = atan2(-d.x, -d.z)
	pitch = clampf(atan2(d.y, Vector2(d.x, d.z).length()), Balance.PITCH.x, Balance.PITCH.y)
	_apply_view()
	update_aim()


# =====================================================================================
# The tool
# =====================================================================================
func tool_tip() -> Vector3:
	if _tool == null:
		return camera.global_position + forward() * 0.5
	var pose: Array = TOOL_POSE[clampi(_shown_tool, 0, TOOL_POSE.size() - 1)]
	return _tool.global_transform * (pose[2] as Vector3)


func tool_basis() -> Basis:
	return _tool.global_transform.basis if _tool != null else camera.global_transform.basis


func kick(amount: float) -> void:
	_kick = minf(1.0, _kick + amount)
	if held_rocket != null:
		held_rocket.visible = false
		_reload = Balance.ROCKET_EVERY * 0.7


func _build_tool() -> void:
	_shown_tool = GameState.tool_index
	if _tool != null:
		_tool.queue_free()
	_tool = MeshInstance3D.new()
	_tool.mesh = ModelLib.prop_mesh(TOOL_MODELS[_shown_tool], _tool_mat)
	_tool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_tool.layers = 2
	_hold.add_child(_tool)
	_lens_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS if _shown_tool == 0 else SubViewport.UPDATE_DISABLED
	_tool_mat.set_shader_parameter("bottle", 1.0 if _shown_tool == 3 else 0.0)
	_tool_mat.set_shader_parameter("lens_local", TOOL_POSE[_shown_tool][2])
	if held_rocket != null:
		held_rocket.queue_free()
		held_rocket = null
	if _shown_tool == 3:
		# A paper rocket stood in the bottle, ready to go.
		held_rocket = MeshInstance3D.new()
		held_rocket.mesh = ModelLib.prop_mesh("rocket")
		held_rocket.position = Vector3(0.0, 0.2, 0.0)
		held_rocket.scale = Vector3.ONE * 0.62
		held_rocket.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		held_rocket.layers = 2
		_tool.add_child(held_rocket)
	fx.setup(_shown_tool)


func _update_tool(d: float) -> void:
	if _shown_tool != GameState.tool_index:
		_build_tool()
	_tool_mat.set_shader_parameter("gold", 1.0 if GameState.golden_on else 0.0)
	if held_rocket != null and not held_rocket.visible:
		_reload -= d
		if _reload <= 0.0:
			held_rocket.visible = true
	var active := firing and input_enabled and grid != null
	var point: Vector3 = aim.point
	var continuous := GameState.tool_index < 3
	# Focusing: the heat builds up only while the tool stays on the same thing.
	var f_time: float = Balance.FOCUS[clampi(GameState.tool_index, 0, Balance.FOCUS.size() - 1)]
	if active and continuous and aim.in_range:
		if aim.sid != _focus_sid:
			_focus_sid = aim.sid
			focus = 0.0
		focus = minf(1.0, focus + (d / f_time if f_time > 0.0 else 1.0))
	else:
		focus = maxf(0.0, focus - d * 2.0)
		if not active:
			_focus_sid = -2
	if active and continuous and aim.in_range:
		var k := 0.12 + 0.88 * focus * focus
		grid.set_source("tool", Vector2(point.x, point.z), GameState.tool_radius(), GameState.tool_power() * Balance.COOL * k)
	elif grid != null:
		grid.clear_source("tool")
	fx.update(active, point, d)
	# The tool bobs with your stride, leans toward where you aim, kicks when a rocket goes.
	var pose: Array = TOOL_POSE[_shown_tool]
	_kick = move_toward(_kick, 0.0, d * 4.0)
	var stride := Vector2(sin(_walk_t) * 0.012, -absf(cos(_walk_t)) * 0.01)
	_sway = _sway.lerp(stride, 1.0 - exp(-d * 10.0))
	var lean := Vector3(0, 0, 0)
	if active:
		lean = Vector3(-0.05, 0.03, 0.03)
	var pos: Vector3 = pose[0] + Vector3(_sway.x, _sway.y, 0) * 0.45 + Vector3(0, 0, _kick * 0.035) + (Vector3(-0.012, 0.012, -0.015) if active else Vector3.ZERO)
	_hold.position = _hold.position.lerp(pos, 1.0 - exp(-d * 14.0))
	var rot: Vector3 = pose[1] + lean + Vector3(_kick * 0.35, 0, 0)
	_hold.rotation = _hold.rotation.lerp(rot, 1.0 - exp(-d * 12.0))
	if _shown_tool == 0 and _tool != null:
		_aim_lens()


func _aim_lens() -> void:
	## Point the lens camera from the eye through the middle of the glass, narrowed so the
	## disc of glass shows the world LENS_MAGNIFY times bigger.
	var lens: Vector3 = _tool.global_transform * (TOOL_POSE[0][2] as Vector3)
	var eye := camera.global_position
	var d := lens - eye
	if d.length() < 0.01:
		return
	var r := 0.099 * TOOL_SCALE
	var ang := rad_to_deg(2.0 * atan(r / d.length()))
	_lens_cam.fov = clampf(ang / LENS_MAGNIFY, 2.0, 60.0)
	_lens_cam.global_transform = Transform3D(Basis.looking_at(d.normalized(), Vector3.UP), eye)
