class_name CameraRig
extends Node3D
## The tilted diorama camera. Drag to pan (the ground under your finger stays
## under it), pinch or wheel to zoom, tap to act. Mouse drag and click work
## the same on a computer; WASD / arrows pan and +/- zoom too.

signal tapped(screen_pos: Vector2)

const PITCH := deg_to_rad(49.0)
const YAW := deg_to_rad(-16.0)       # looking north, turned a little to the west
const FOV := 30.0
const DIST_MIN := 34.0
const DIST_MAX := 190.0
const TAP_MOVE := 16.0               # px a finger can move and still be a tap
const TAP_TIME := 0.45
const BOUNDS := Rect2(-58.0, -60.0, 116.0, 120.0)

var camera: Camera3D
var target := Vector2(6.0, 14.0)     # x, z on the ground
var target_y := 0.0
var zoom := 0.62                     # 0 = closest, 1 = the whole bay
var _zoom_goal := 0.62
var _vel := Vector2.ZERO
var _touches := {}                   # index -> position
var _press_pos := Vector2.ZERO
var _press_t := 0.0
var _press_moved := false
var _pinch_dist := 0.0
var _pinch_zoom := 0.0
var _mouse_down := false
var _drag_ground := Vector3.INF
var enabled := true
var last_input_touch := true         # for hint wording


func _ready() -> void:
	camera = Camera3D.new()
	camera.fov = FOV
	camera.near = 0.5
	camera.far = 1600.0
	camera.current = true
	add_child(camera)
	_apply()


func distance() -> float:
	return lerpf(DIST_MIN, DIST_MAX, zoom * zoom * 0.6 + zoom * 0.4)


func _apply() -> void:
	var d := distance()
	var look := Vector3(target.x, target_y, target.y)
	var back := Vector3(sin(YAW) * cos(PITCH), sin(PITCH), cos(YAW) * cos(PITCH)) * d
	camera.position = look + back
	camera.look_at(look, Vector3.UP)


func set_view(x: float, z: float, zm: float) -> void:
	target = Vector2(x, z)
	zoom = clampf(zm, 0.0, 1.0)
	_zoom_goal = zoom
	_vel = Vector2.ZERO
	_clamp()
	_apply()


func _clamp() -> void:
	# Zoomed out, you can't wander far from the middle.
	var shrink := zoom * 40.0
	var r := BOUNDS.grow(-shrink)
	target.x = clampf(target.x, r.position.x, r.end.x)
	target.y = clampf(target.y, r.position.y, r.end.y)


func _process(delta: float) -> void:
	var dt := minf(delta / maxf(Engine.time_scale, 0.001), 0.1)
	if enabled:
		var k := Vector2.ZERO
		if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
			k.x -= 1
		if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
			k.x += 1
		if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
			k.y -= 1
		if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
			k.y += 1
		if k != Vector2.ZERO:
			target += k.normalized().rotated(-YAW) * distance() * 0.6 * dt
	if _touches.is_empty() and not _mouse_down:
		target += _vel * dt
		_vel *= pow(0.02, dt)
	zoom = lerpf(zoom, _zoom_goal, 1.0 - pow(0.0005, dt))
	_clamp()
	_apply()


func ground_point(screen: Vector2) -> Vector3:
	var o := camera.project_ray_origin(screen)
	var d := camera.project_ray_normal(screen)
	if absf(d.y) < 0.001:
		return Vector3.INF
	var t := (target_y - o.y) / d.y
	if t < 0.0:
		return Vector3.INF
	return o + d * t


func _drag_to(screen: Vector2) -> void:
	var g := ground_point(screen)
	if g == Vector3.INF or _drag_ground == Vector3.INF:
		_drag_ground = g
		return
	var delta := Vector2(_drag_ground.x - g.x, _drag_ground.z - g.z)
	target += delta
	_clamp()
	_apply()
	var dt := maxf(get_process_delta_time(), 0.001)
	_vel = _vel.lerp(delta / dt, 0.35)
	_drag_ground = ground_point(screen)


func zoom_by(f: float) -> void:
	_zoom_goal = clampf(_zoom_goal + f, 0.0, 1.0)


func handle_input(event: InputEvent) -> bool:
	## World input (anything the HUD didn't take). True when used.
	if not enabled:
		return false
	if event is InputEventScreenTouch:
		last_input_touch = true
		var e := event as InputEventScreenTouch
		if e.pressed:
			_touches[e.index] = e.position
			if _touches.size() == 1:
				_press_pos = e.position
				_press_t = Time.get_ticks_msec() / 1000.0
				_press_moved = false
				_drag_ground = ground_point(e.position)
				_vel = Vector2.ZERO
			elif _touches.size() == 2:
				_press_moved = true
				var ps: Array = _touches.values()
				_pinch_dist = (ps[0] as Vector2).distance_to(ps[1])
				_pinch_zoom = _zoom_goal
				_drag_ground = ground_point(((ps[0] as Vector2) + ps[1]) * 0.5)
		else:
			_touches.erase(e.index)
			if _touches.is_empty():
				var quick := Time.get_ticks_msec() / 1000.0 - _press_t < TAP_TIME
				if not _press_moved and quick and e.position.distance_to(_press_pos) < TAP_MOVE:
					tapped.emit(e.position)
				_drag_ground = Vector3.INF
			else:
				var ps2: Array = _touches.values()
				_drag_ground = ground_point(ps2[0])
		return true
	if event is InputEventScreenDrag:
		var e := event as InputEventScreenDrag
		_touches[e.index] = e.position
		if e.position.distance_to(_press_pos) > TAP_MOVE:
			_press_moved = true
		if _touches.size() >= 2:
			var ps: Array = _touches.values()
			var dd := (ps[0] as Vector2).distance_to(ps[1])
			if _pinch_dist > 10.0:
				_zoom_goal = clampf(_pinch_zoom - (dd / _pinch_dist - 1.0) * 0.8, 0.0, 1.0)
				zoom = _zoom_goal
			_drag_to(((ps[0] as Vector2) + ps[1]) * 0.5)
		elif _press_moved:
			_drag_to(e.position)
		return true
	if event is InputEventMouseButton:
		var e := event as InputEventMouseButton
		if e.device == InputEvent.DEVICE_ID_EMULATION:
			return false
		last_input_touch = false
		if e.button_index == MOUSE_BUTTON_WHEEL_UP and e.pressed:
			zoom_by(-0.07)
			return true
		if e.button_index == MOUSE_BUTTON_WHEEL_DOWN and e.pressed:
			zoom_by(0.07)
			return true
		if e.button_index == MOUSE_BUTTON_LEFT or e.button_index == MOUSE_BUTTON_RIGHT:
			if e.pressed:
				_mouse_down = true
				_press_pos = e.position
				_press_t = Time.get_ticks_msec() / 1000.0
				_press_moved = false
				_drag_ground = ground_point(e.position)
				_vel = Vector2.ZERO
			else:
				_mouse_down = false
				var quick := Time.get_ticks_msec() / 1000.0 - _press_t < TAP_TIME * 1.5
				if not _press_moved and quick and e.button_index == MOUSE_BUTTON_LEFT:
					tapped.emit(e.position)
				_drag_ground = Vector3.INF
			return true
	if event is InputEventMouseMotion:
		var e := event as InputEventMouseMotion
		if e.device == InputEvent.DEVICE_ID_EMULATION:
			return false
		if _mouse_down:
			if e.position.distance_to(_press_pos) > TAP_MOVE * 0.5:
				_press_moved = true
			if _press_moved:
				_drag_to(e.position)
			return true
	if event is InputEventKey and event.pressed:
		var k := event as InputEventKey
		if k.keycode == KEY_EQUAL or k.keycode == KEY_KP_ADD:
			zoom_by(-0.1)
			return true
		if k.keycode == KEY_MINUS or k.keycode == KEY_KP_SUBTRACT:
			zoom_by(0.1)
			return true
	if event is InputEventMagnifyGesture:
		zoom_by((1.0 - (event as InputEventMagnifyGesture).factor) * 0.6)
		return true
	if event is InputEventPanGesture:
		target += (event as InputEventPanGesture).delta.rotated(-YAW) * distance() * 0.01
		return true
	return false
