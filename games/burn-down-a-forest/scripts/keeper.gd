class_name Keeper
extends Node3D
## The fire-keeper: a round figure in a soot-stained cape, an ember scarf and a
## round hood, a brass lantern hanging from a crooked pole in one hand and the
## tool in the other (models/keeper.glb), walked around the forest floor (the
## ground's height field, no physics needed) and followed by an elevated chase
## camera that orbits around them. The tool heats the forest where the
## screen's centre lands (the crosshair), out to the tool's range; aim further
## and it lands at the edge of the range in that direction.
##
## The camera never loses the keeper: it pulls in when its spot would be inside
## a canopy, tilts down to look over the trees in the dense rings, and
## everything between it and the keeper is cut away in a clean round window
## (shaders/plant.gdshader and prop.gdshader, from `focus_pos`).

const EYE := 2.7                    # the camera orbits a point this high above the keeper's feet,
const SHOULDER := 0.95              # this far to their right (an over-the-shoulder view: the crosshair
const LOOK_AHEAD := 1.2             # and the ring sit clear of the keeper), looking this far ahead
const MODEL_SCALE := 1.6            # the keeper reads clearly at phone size from the chase camera
const DENSE_TILT := 0.3             # in thick woods the camera tilts down this much more (radians)
const HAND_TOOL := Vector3(-0.42, 0.55, 0.1)     # the tool hand (screen right, beside the crosshair)
const HAND_POLE := Vector3(0.42, 0.56, 0.04)     # the lantern-pole hand (screen left, clear of the crosshair)
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
var lantern_flicker := 1.0
var cinematic := false                # the ending's camera sweep has the camera
var _light: OmniLight3D
var _lantern: Node3D
var _pole: Node3D
var _scarf: Node3D
var _outline: ShaderMaterial
var _dense := 0.0                     # how thick the woods are round the keeper (0..1), smoothed
var _pitch_eff := -0.5
var fx: ToolFx
var _cam_pos := Vector3.ZERO
var _mat: ShaderMaterial
var _touch_device := DisplayServer.is_touchscreen_available()


func _ready() -> void:
	_mat = ShaderMaterial.new()
	_mat.shader = load("res://shaders/prop.gdshader")
	_mat.set_shader_parameter("rim", 0.85)                    # moonlit rim so the hero reads against the woods
	_mat.set_shader_parameter("rim_color", Color("#A9C0F2"))
	_mat.set_shader_parameter("ink_edge", 0.35)
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
	_outline = ShaderMaterial.new()
	_outline.shader = load("res://shaders/outline.gdshader")
	_mat.next_pass = _outline           # an inked outline round the hero, so they read against any woods
	_model = Node3D.new()
	_model.scale = Vector3.ONE * MODEL_SCALE
	add_child(_model)
	_body = _part("body", _model, Vector3.ZERO)
	_head = Node3D.new()
	_head.position = Vector3(0, 1.13, 0)
	_body.add_child(_head)
	_part("head", _head, Vector3.ZERO)
	_part("hood", _head, Vector3.ZERO)
	_hand_l = _part("hand", _body, HAND_POLE)
	_hand_r = _part("hand", _body, HAND_TOOL)
	_foot_l = _part("foot", _model, Vector3(-0.15, 0.0, 0.06))
	_foot_r = _part("foot", _model, Vector3(0.15, 0.0, 0.06))
	# The scarf's tail flies out behind from the knot at the back of the neck.
	_scarf = Node3D.new()
	_scarf.position = Vector3(0.05, 0.88, -0.17)
	_body.add_child(_scarf)
	_part("scarf", _scarf, Vector3.ZERO)
	# The lantern hangs from the hook of a crooked pole, held up beside the
	# head on the side away from the crosshair; it sways as the keeper walks.
	_pole = Node3D.new()
	_pole.rotation = Vector3(-0.22, 0.0, -0.14)
	_hand_l.add_child(_pole)
	_part("pole", _pole, Vector3.ZERO)
	_lantern = Node3D.new()
	_lantern.position = Vector3(0.0, 1.13, 0.26)
	_pole.add_child(_lantern)
	_part("lantern", _lantern, Vector3.ZERO)
	_tool_holder = Node3D.new()
	_hand_r.add_child(_tool_holder)
	_shadow = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(0.9 * MODEL_SCALE, 0.9 * MODEL_SCALE)
	q.orientation = PlaneMesh.FACE_Y
	_shadow.mesh = q
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.albedo_color = Color(0, 0, 0, 0.4)
	sm.albedo_texture = UiTheme.soft_dot()
	_shadow.material_override = sm
	_shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_shadow)
	_shadow.top_level = true


func _part(name: String, parent: Node3D, pos: Vector3) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = Models.keeper_part(name)
	mi.material_override = _mat
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	parent.add_child(mi)
	return mi


func lantern_pos() -> Vector3:
	## Where the lantern's glass is (the light the ground, trees and props take).
	return _lantern.global_position + Vector3(0, -0.45, 0) if _lantern != null else position + Vector3(0, 2.0, 0)


func material() -> ShaderMaterial:
	return _mat


func _build_ring() -> void:
	## The ring on the ground where the flame lands: a hand-inked dashed circle
	## (ink outside, colour inside), painted on, not glowing.
	var n := 192
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 12
	var wob := []
	for k in 16:
		wob.append(rng.randf_range(-0.02, 0.02))
	for y in n:
		for x in n:
			var v := Vector2(x + 0.5 - n * 0.5, y + 0.5 - n * 0.5) / (n * 0.5)
			var d := v.length()
			var a := atan2(v.y, v.x)
			var seg := (a + PI) / TAU * 16.0
			var k0 := int(floor(seg)) % 16
			var r0 := 0.8 + lerpf(wob[k0], wob[(k0 + 1) % 16], seg - floor(seg))
			var dash := 1.0 if fmod(seg * 1.5, 1.0) < 0.7 else 0.0
			var paint := clampf(1.0 - absf(d - r0) / 0.045, 0.0, 1.0) * dash
			var ink := clampf(1.0 - absf(d - r0) / 0.085, 0.0, 1.0) * dash
			var inner := 0.1 * clampf(1.0 - d / r0, 0.0, 1.0)
			var col := Color(0.18, 0.12, 0.08).lerp(Color.WHITE, paint)
			img.set_pixel(x, y, Color(col.r, col.g, col.b, clampf(maxf(ink, inner), 0.0, 1.0)))
	img.generate_mipmaps()
	_ring = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	q.orientation = PlaneMesh.FACE_Y
	_ring.mesh = q
	_ring_mat = StandardMaterial3D.new()
	_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
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
	_facing = atan2(-sin(yaw), -cos(yaw))    # the keeper looks where the camera looks (into the woods)
	_snap_camera()


func cam_forward() -> Vector3:
	## Where the camera looks (the player's pitch, tilted down further in thick woods).
	var p := _pitch_eff
	return Vector3(-sin(cam_yaw) * cos(p), sin(p), -cos(cam_yaw) * cos(p))


func aim_forward() -> Vector3:
	return cam_forward()


func _pivot() -> Vector3:
	return position + Vector3(0, EYE, 0) + Vector3(cos(cam_yaw), 0, -sin(cam_yaw)) * SHOULDER


func _camera_target() -> Vector3:
	return _pivot() + Vector3(-sin(cam_yaw), 0, -cos(cam_yaw)) * LOOK_AHEAD


func _update_view_shape(d: float) -> void:
	## Thick woods round the keeper tilt the camera down to look over the canopy.
	if grid != null:
		var c := grid.cell_at(position.x, position.z)
		var tall := 0
		var seen := 0
		if c >= 0:
			var cx := c % grid.n
			var cy := c / grid.n
			for oy in range(-4, 5, 2):
				for ox in range(-4, 5, 2):
					var x := cx + ox
					var y := cy + oy
					if x < 0 or y < 0 or x >= grid.n or y >= grid.n:
						continue
					seen += 1
					var i := x + y * grid.n
					if grid.state[i] == ForestGrid.INTACT and grid.kind[i] >= Balance.PINE and grid.kind[i] <= Balance.ELDER:
						tall += 1
		var want := smoothstep(0.2, 0.6, float(tall) / maxf(1.0, float(seen)))
		_dense = lerpf(_dense, want, 1.0 - exp(-d * 1.5))
	# a tilt the player can still drag against (a hard clamp would stop the
	# crosshair reaching anything more than a few metres off in the woods)
	_pitch_eff = clampf(cam_pitch - DENSE_TILT * _dense, Balance.CAM_PITCH.x, Balance.CAM_PITCH.y)


func canopy_top_at(p: Vector3, radius: float = 2.2) -> float:
	## The highest canopy top within `radius` of a point (-INF: open sky).
	if grid == null:
		return -INF
	var top := -INF
	var c := grid.cell_at(p.x, p.z)
	if c < 0:
		return top
	var cx := c % grid.n
	var cy := c / grid.n
	var reach := int(ceil(radius / Balance.CELL)) + 1
	for oy in range(-reach, reach + 1):
		for ox in range(-reach, reach + 1):
			var x := cx + ox
			var y := cy + oy
			if x < 0 or y < 0 or x >= grid.n or y >= grid.n:
				continue
			var i := x + y * grid.n
			if grid.state[i] != ForestGrid.INTACT or grid.kind[i] < Balance.PINE or grid.kind[i] > Balance.ELDER:
				continue
			var cc := grid.cell_center(i)
			var crown := Balance.CELL * (0.9 if grid.kind[i] == Balance.PINE else 1.6 * grid.size_mult[i])
			if Vector2(p.x - cc.x, p.z - cc.y).length() < radius + crown:
				top = maxf(top, grid.height_at(cc.x, cc.y) + grid.plant_height(i) * 1.05)
	return top


func _wanted_cam_pos() -> Vector3:
	## Behind and above the keeper. If that spot is inside a canopy, the camera
	## rises over it (never closer: up close in the woods all you'd see is leaves);
	## the trees in between are cut away by the round window.
	var p := _pivot() - cam_forward() * Balance.CAM_DISTANCE
	if grid != null:
		p.y = maxf(p.y, grid.height_at(p.x, p.z) + 0.8)
		var top := canopy_top_at(p)
		if top > p.y - 0.8:
			p.y = top + 0.8
	return p


func _snap_camera() -> void:
	if camera == null:
		return
	_update_view_shape(10.0)
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
	var d := minf(delta, 0.05 * maxf(1.0, Engine.time_scale))
	if cinematic:
		_animate(d)
		return
	var steps_n := int(ceil(d / 0.05))
	for _k in steps_n:
		_move(d / steps_n)
	_update_view_shape(d)
	_cam_pos = _cam_pos.lerp(_wanted_cam_pos(), 1.0 - exp(-d * 10.0))
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
	# Trees between the camera and the keeper, and just round them, are cut away
	# (see shaders/plant.gdshader): start looking a little beyond the keeper.
	var start := maxf(0.0, from.distance_to(position + Vector3(0, EYE, 0)) + 1.6)
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
		var ec := grid.cell_center(grid.elder_cell)
		var over_tree := i >= 0 and grid.state[i] == ForestGrid.INTACT and grid.kind[i] >= Balance.PINE and grid.kind[i] <= Balance.ELDER
		if not over_tree and grid.state[grid.elder_cell] == ForestGrid.INTACT and Vector2(p.x - ec.x, p.z - ec.y).length() < 3.4:
			i = grid.elder_cell        # the Elder's trunk fills its (cleared) neighbours' cells too
		if i >= 0:
			var top := g + grid.plant_height(i) * 0.92
			if p.y <= top and grid.kind[i] >= Balance.PINE:
				var c := grid.cell_center(i)
				var hit_r := Balance.CELL * (0.75 if grid.kind[i] == Balance.PINE else 1.1)
				if grid.kind[i] == Balance.ELDER:
					hit_r = 3.4             # its trunk and roots are far wider than one cell
				if Vector2(p.x - c.x, p.z - c.y).length() < hit_r:
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
	var col := Color("#FFC15E")
	if grid != null and cell >= 0 and grid.is_flammable(cell) and not grid.can_light(cell, GameState.tool_heat()):
		col = Color(0.75, 0.7, 0.72, 0.7)
	if not aim.in_range:
		col.a *= 0.6
	if active:
		col = Color("#E8642C")
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
	# the cape squashes a touch as each step lands (weight, not floaty)
	var land := (1.0 - absf(sin(_walk_t))) * 0.035 if moving else 0.0
	_body.scale = Vector3(1.0 + land, 1.0 - land, 1.0 + land)
	_foot_l.position = Vector3(-0.15, maxf(0.0, s) * 0.12 if moving else 0.0, 0.06 + (s * 0.2 if moving else 0.0))
	_foot_r.position = Vector3(0.15, maxf(0.0, -s) * 0.12 if moving else 0.0, 0.06 - (s * 0.2 if moving else 0.0))
	_hand_l.position = HAND_POLE + Vector3(0.0, 0.03 * s if moving else 0.0, -(s * 0.08 if moving else 0.0))
	if firing:
		_hand_r.position = _hand_r.position.lerp(Vector3(-0.28, 0.74, 0.44), 1.0 - exp(-d * 18.0))
		# Point the tool at where the flame lands.
		var local: Vector3 = _model.global_transform.affine_inverse() * (aim.point as Vector3)
		var from := _hand_r.position + _body.position
		var dir: Vector3 = (local - from).normalized()
		var pitch := asin(clampf(dir.y, -0.9, 0.9))
		var yaw := atan2(dir.x, dir.z)
		_tool_holder.rotation = Vector3(-pitch, yaw, 0)
	else:
		var swing := -s * 0.12 if moving else 0.0
		_hand_r.position = _hand_r.position.lerp(HAND_TOOL + Vector3(0, 0, swing), 1.0 - exp(-d * 12.0))
		_tool_holder.rotation = _tool_holder.rotation.lerp(Vector3(-0.9, -0.15, 0), 1.0 - exp(-d * 10.0))
	_head.rotation.x = -0.15 if firing else 0.0
	# the pole rocks with the stride, the lantern swings under it, lagging behind
	_pole.rotation.x = lerpf(_pole.rotation.x, -0.22 + (s * 0.08 if moving else 0.0), 1.0 - exp(-d * 8.0))
	_lantern.rotation.z = lerpf(_lantern.rotation.z, (s * 0.3 if moving else 0.0) + breathe * 3.0, 1.0 - exp(-d * 5.0))
	_lantern.rotation.x = lerpf(_lantern.rotation.x, (0.3 if moving else 0.0) + 0.22, 1.0 - exp(-d * 4.0))
	# the scarf's tail streams out behind when walking, hangs when standing
	var t := Time.get_ticks_msec() * 0.001
	var flow := 0.9 if moving else 0.15
	_scarf.rotation.x = lerpf(_scarf.rotation.x, -0.25 + flow * 0.6 + sin(t * 7.0) * 0.12 * flow, 1.0 - exp(-d * 6.0))
	_scarf.rotation.z = sin(t * 4.3) * 0.15 * flow
	var g := grid.height_at(position.x, position.z) if grid != null else 0.0
	var floor_y := maxf(g, ForestGrid.WATER_LEVEL)
	_shadow.global_position = Vector3(position.x, floor_y + 0.04, position.z)
	var lift := clampf((position.y - g) / 3.0, 0.0, 0.7)
	_shadow.scale = Vector3.ONE * (1.0 - lift)
	lantern_flicker = 1.0 + 0.08 * sin(t * 9.0) + 0.05 * sin(t * 23.0)

