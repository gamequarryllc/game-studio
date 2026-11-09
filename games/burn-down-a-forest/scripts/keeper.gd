class_name Keeper
extends Node3D
## The fire-keeper: a small hooded figure with a lantern on their back, walked
## around the forest floor (the ground's height field, no physics needed) and
## followed by an elevated chase camera that orbits around them. The tool heats
## the forest where the screen's centre lands (the crosshair), out to the tool's
## range; aim further and it lands at the edge of the range in that direction.

const EYE := 2.3                     # the camera looks at a point this high above the keeper's feet
const MIN_AIM_DIST := 1.2

var grid: ForestGrid
var camera: Camera3D
var cam_yaw := 0.0                    # 0 = the camera is south of the keeper, looking north (-z)
var cam_pitch := -0.5
var move_input := Vector2.ZERO        # x = right, y = forward, relative to the camera
var firing := false
var input_enabled := true
var bounds := Rect2(-60, -60, 120, 120)
var aim := {"point": Vector3.ZERO, "cell": -1, "in_range": true, "hit": false}
var steps := 0                        # footsteps taken (Sound listens)
var jumped := 0
var landed := 0

var _vel_y := 0.0
var _on_ground := true
var _facing := 0.0
var _walk_t := 0.0
var _model: Node3D
var _body: Node3D
var _head: Node3D
var _hand_l: Node3D
var _hand_r: Node3D
var _foot_l: Node3D
var _foot_r: Node3D
var _tool_holder: Node3D
var _tool: MeshInstance3D
var _shown_tool := -1
var _shown_sparkler := false
var _ring: MeshInstance3D
var _ring_mat: StandardMaterial3D
var _shadow: MeshInstance3D
var _light: OmniLight3D
var fx: ToolFx
var _cam_pos := Vector3.ZERO
var _mat: StandardMaterial3D
var _touch_device := DisplayServer.is_touchscreen_available()


func _ready() -> void:
	_mat = StandardMaterial3D.new()
	_mat.vertex_color_use_as_albedo = true
	_mat.roughness = 0.9
	_build_model()
	camera = Camera3D.new()
	camera.fov = 62.0
	camera.near = 0.15
	camera.far = 260.0
	camera.current = true
	add_child(camera)
	camera.top_level = true
	fx = ToolFx.new()
	add_child(fx)
	_build_ring()
	_light = OmniLight3D.new()
	_light.light_color = Color(1.0, 0.62, 0.3)
	_light.omni_range = 6.0
	_light.light_energy = 0.0
	_light.visible = false
	add_child(_light)
	_light.top_level = true
	_snap_camera()


func _build_model() -> void:
	_model = Node3D.new()
	add_child(_model)
	_body = _part("body", _model, Vector3.ZERO)
	_head = Node3D.new()
	_head.position = Vector3(0, 1.02, 0)
	_body.add_child(_head)
	_part("head", _head, Vector3.ZERO)
	_part("hood", _head, Vector3(0, 0.12, -0.02))
	_hand_l = _part("hand", _body, Vector3(-0.34, 0.5, 0.06))
	_hand_r = _part("hand", _body, Vector3(0.34, 0.5, 0.1))
	_foot_l = _part("foot", _model, Vector3(-0.13, 0.0, 0))
	_foot_r = _part("foot", _model, Vector3(0.13, 0.0, 0))
	# The lantern on the back glows like a coal.
	var lantern := MeshInstance3D.new()
	lantern.mesh = Models.keeper_part("lantern")
	var lm := StandardMaterial3D.new()
	lm.vertex_color_use_as_albedo = true
	lm.emission_enabled = true
	lm.emission = Color(1.0, 0.5, 0.15)
	lm.emission_energy_multiplier = 1.4
	lantern.material_override = lm
	lantern.position = Vector3(0.1, 0.72, -0.34)
	_body.add_child(lantern)
	_tool_holder = Node3D.new()
	_hand_r.add_child(_tool_holder)
	_shadow = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(1.1, 1.1)
	q.orientation = PlaneMesh.FACE_Y
	_shadow.mesh = q
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.albedo_color = Color(0, 0, 0, 0.45)
	sm.albedo_texture = UiTheme.soft_dot()
	_shadow.material_override = sm
	add_child(_shadow)
	_shadow.top_level = true


func _part(name: String, parent: Node3D, pos: Vector3) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = Models.keeper_part(name)
	mi.material_override = _mat
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


func _build_ring() -> void:
	## The glowing ring on the ground where the flame lands.
	var n := 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var d := Vector2(x + 0.5 - n * 0.5, y + 0.5 - n * 0.5).length() / (n * 0.5)
			var ring := exp(-pow((d - 0.82) / 0.07, 2.0))
			var fill := 0.12 * clampf(1.0 - d, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, clampf(ring + fill, 0.0, 1.0)))
	img.generate_mipmaps()
	_ring = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	q.orientation = PlaneMesh.FACE_Y
	_ring.mesh = q
	_ring_mat = StandardMaterial3D.new()
	_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_ring_mat.no_depth_test = true
	_ring_mat.albedo_texture = ImageTexture.create_from_image(img)
	_ring.material_override = _ring_mat
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_ring)
	_ring.top_level = true


# =====================================================================================
# Camera
# =====================================================================================
func add_look(d: Vector2) -> void:
	## d in radians: x orbits left/right, y tilts.
	cam_yaw -= d.x
	cam_pitch = clampf(cam_pitch - d.y, Balance.CAM_PITCH.x, Balance.CAM_PITCH.y)


func set_view(yaw: float, pitch: float) -> void:
	cam_yaw = yaw
	cam_pitch = clampf(pitch, Balance.CAM_PITCH.x, Balance.CAM_PITCH.y)
	_snap_camera()


func cam_forward() -> Vector3:
	return Vector3(-sin(cam_yaw) * cos(cam_pitch), sin(cam_pitch), -cos(cam_yaw) * cos(cam_pitch))


func _camera_target() -> Vector3:
	return position + Vector3(0, EYE, 0)


func _wanted_cam_pos() -> Vector3:
	var p := _camera_target() - cam_forward() * Balance.CAM_DISTANCE
	if grid != null:
		p.y = maxf(p.y, grid.height_at(p.x, p.z) + 0.8)
	return p


func _snap_camera() -> void:
	if camera == null:
		return
	_cam_pos = _wanted_cam_pos()
	_place_camera()


func _place_camera() -> void:
	camera.global_position = _cam_pos
	var t := _camera_target()
	if _cam_pos.distance_to(t) > 0.1:
		camera.look_at(t, Vector3.UP)


# =====================================================================================
# Per frame
# =====================================================================================
func _process(delta: float) -> void:
	var d := minf(delta, 0.05)
	_move(d)
	_cam_pos = _cam_pos.lerp(_wanted_cam_pos(), 1.0 - exp(-d * 14.0))
	_place_camera()
	update_aim()
	_update_tool(d)
	_animate(d)


func jump() -> void:
	if _on_ground and input_enabled:
		_vel_y = Balance.JUMP_VELOCITY
		_on_ground = false
		jumped += 1


func _move(d: float) -> void:
	var fwd := Vector3(-sin(cam_yaw), 0, -cos(cam_yaw))
	var right := Vector3(cos(cam_yaw), 0, -sin(cam_yaw))
	var mv := move_input.limit_length(1.0) if input_enabled else Vector2.ZERO
	var wish := (right * mv.x + fwd * mv.y) * GameState.move_speed()
	var p := position + wish * d
	p.x = clampf(p.x, bounds.position.x, bounds.end.x)
	p.z = clampf(p.z, bounds.position.y, bounds.end.y)
	var ground := grid.height_at(p.x, p.z) if grid != null else 0.0
	var wading := ground < ForestGrid.WATER_LEVEL
	if wading:
		ground = ForestGrid.WATER_LEVEL - 0.25   # wade through the river, waist deep at most
	if _on_ground:
		p.y = ground
	else:
		_vel_y -= Balance.GRAVITY * d
		p.y += _vel_y * d
		if p.y <= ground:
			p.y = ground
			_on_ground = true
			_vel_y = 0.0
			landed += 1
	position = p
	if mv.length() > 0.1:
		var before := _walk_t
		_walk_t += d * GameState.move_speed() * 2.4 * mv.length()
		if _on_ground and floori(_walk_t / PI) != floori(before / PI):
			steps += 1
		var want := atan2(wish.x, wish.z)
		if not firing:
			_facing = lerp_angle(_facing, want, 1.0 - exp(-d * 12.0))
	else:
		_walk_t = lerpf(_walk_t, round(_walk_t / PI) * PI, 1.0 - exp(-d * 10.0))
	if firing:
		var to: Vector3 = aim.point - position
		if Vector2(to.x, to.z).length() > 0.3:
			_facing = lerp_angle(_facing, atan2(to.x, to.z), 1.0 - exp(-d * 16.0))


func update_aim() -> void:
	## Where the crosshair (the centre of the screen) lands on the forest.
	if grid == null or camera == null:
		return
	var from := camera.global_position
	var dir := -camera.global_transform.basis.z
	var start := maxf(0.0, from.distance_to(_camera_target()) - 0.6)   # trees between the camera and the keeper are see-through: skip them
	var hit := Vector3.INF
	var t := start
	var hit_cell := -1
	while t < 90.0:
		var p := from + dir * t
		var g := grid.height_at(p.x, p.z)
		if p.y <= maxf(g, ForestGrid.WATER_LEVEL):
			hit = p
			break
		var i := grid.cell_at(p.x, p.z)
		if i >= 0:
			var top := g + grid.plant_height(i) * 0.92
			if p.y <= top and grid.kind[i] >= Balance.PINE:
				var c := grid.cell_center(i)
				if Vector2(p.x - c.x, p.z - c.y).length() < Balance.CELL * (0.75 if grid.kind[i] == Balance.PINE else 1.1):
					hit = Vector3(c.x, g, c.y)
					hit_cell = i
					break
			elif p.y <= top and grid.kind[i] <= Balance.BUSH:
				hit = Vector3(p.x, g, p.z)
				break
		t += 0.35 if t < 30.0 else 0.8
	var range_m := GameState.tool_range()
	var in_range := true
	var ok_hit := hit.is_finite()
	if not ok_hit:
		hit = from + dir * 90.0
	var flat := Vector2(hit.x - position.x, hit.z - position.z)
	if flat.length() > range_m or not ok_hit:
		in_range = false
		var fd := flat.normalized() if flat.length() > 0.01 else Vector2(-sin(cam_yaw), -cos(cam_yaw))
		var q := Vector2(position.x, position.z) + fd * range_m
		hit = Vector3(q.x, grid.height_at(q.x, q.y), q.y)
		hit_cell = -1
	elif flat.length() < MIN_AIM_DIST:
		var fd := Vector2(sin(_facing), cos(_facing))
		var q := Vector2(position.x, position.z) + fd * MIN_AIM_DIST
		hit = Vector3(q.x, grid.height_at(q.x, q.y), q.y)
	if hit_cell < 0:
		hit_cell = grid.cell_at(hit.x, hit.z)
	aim = {"point": hit, "cell": hit_cell, "in_range": in_range, "hit": ok_hit}


func tool_tip() -> Vector3:
	if _tool == null:
		return position + Vector3(0, 0.9, 0)
	return _tool.global_transform * Models.tool_tip(_shown_tool)


func _update_tool(d: float) -> void:
	if _shown_tool != GameState.tool_index or _shown_sparkler != GameState.sparkler_on:
		_build_tool()
	var active := firing and input_enabled and grid != null
	var point: Vector3 = aim.point
	if active:
		grid.set_source("tool", Vector2(point.x, point.z), GameState.tool_radius(), GameState.tool_heat())
	elif grid != null:
		grid.clear_source("tool")
	fx.update(active, tool_tip(), point, d)
	# The ring where it lands: bright when it can light what's there.
	var r := GameState.tool_radius() * 2.0 + Balance.CELL * 0.7
	_ring.global_position = point + Vector3(0, 0.08, 0)
	var pulse := 1.0 + 0.06 * sin(Time.get_ticks_msec() * 0.008)
	_ring.scale = Vector3(r, 1, r) * pulse
	var cell: int = aim.cell
	var col := Color(1.0, 0.55, 0.18, 0.9)
	if grid != null and cell >= 0 and grid.is_flammable(cell) and not grid.can_light(cell, GameState.tool_heat()):
		col = Color(0.6, 0.55, 0.65, 0.55)
	if not aim.in_range:
		col.a *= 0.55
	if active:
		col = col.lightened(0.2)
	_ring_mat.albedo_color = col
	_light.global_position = tool_tip() + Vector3(0, 0.3, 0)
	_light.light_energy = move_toward(_light.light_energy, 1.6 if active else 0.0, d * 6.0)
	_light.visible = _light.light_energy > 0.01 and not _touch_device   # phones: no extra light passes


func _build_tool() -> void:
	_shown_tool = GameState.tool_index
	_shown_sparkler = GameState.sparkler_on
	if _tool != null:
		_tool.queue_free()
	_tool = MeshInstance3D.new()
	_tool.mesh = Models.tool_mesh(_shown_tool, _shown_sparkler and _shown_tool == 0)
	_tool.material_override = _mat
	_tool_holder.add_child(_tool)
	fx.setup(_shown_tool)


func _animate(d: float) -> void:
	_model.rotation.y = _facing
	var moving := move_input.length() > 0.1 and input_enabled
	var s := sin(_walk_t)
	var bob := absf(sin(_walk_t)) * 0.06 if moving else 0.0
	var breathe := sin(Time.get_ticks_msec() * 0.003) * 0.012
	_body.position.y = 0.04 + bob + breathe
	_body.rotation.z = s * 0.05 if moving else 0.0
	_foot_l.position = Vector3(-0.13, maxf(0.0, s) * 0.12 if moving else 0.0, s * 0.18 if moving else 0.0)
	_foot_r.position = Vector3(0.13, maxf(0.0, -s) * 0.12 if moving else 0.0, -s * 0.18 if moving else 0.0)
	_hand_l.position = Vector3(-0.34, 0.5 + (0.03 * s if moving else 0.0), 0.06 - (s * 0.12 if moving else 0.0))
	if firing:
		_hand_r.position = _hand_r.position.lerp(Vector3(0.26, 0.72, 0.42), 1.0 - exp(-d * 18.0))
		# Point the tool at where the flame lands.
		var local: Vector3 = _model.global_transform.affine_inverse() * (aim.point as Vector3)
		var from := _hand_r.position + _body.position
		var dir: Vector3 = (local - from).normalized()
		var pitch := asin(clampf(dir.y, -0.9, 0.9))
		var yaw := atan2(dir.x, dir.z)
		_tool_holder.rotation = Vector3(-pitch, yaw, 0)
	else:
		var swing := -s * 0.12 if moving else 0.0
		_hand_r.position = _hand_r.position.lerp(Vector3(0.34, 0.5, 0.12 + swing), 1.0 - exp(-d * 12.0))
		_tool_holder.rotation = _tool_holder.rotation.lerp(Vector3(-0.9, 0.15, 0), 1.0 - exp(-d * 10.0))
	_head.rotation.x = -0.15 if firing else 0.0
	var g := grid.height_at(position.x, position.z) if grid != null else 0.0
	_shadow.global_position = Vector3(position.x, maxf(g, ForestGrid.WATER_LEVEL) + 0.04, position.z)
	var lift := clampf((position.y - g) / 3.0, 0.0, 0.7)
	_shadow.scale = Vector3.ONE * (1.0 - lift)
