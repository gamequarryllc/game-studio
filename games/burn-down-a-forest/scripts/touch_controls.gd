class_name TouchControls
extends Control
## Multi-touch phone controls drawn over the game:
##  left side = a floating thumb stick to walk,
##  right side = drag to orbit the camera,
##  the burn button (a log slice with a flame branded in) = hold to use the tool
##  (dragging from it also turns the camera),
##  the JUMP button = tap to jump.
## Godot's Buttons only see the first finger, so this reads raw touches, and
## on-screen buttons registered in `buttons` are tapped from here with any finger.
##
## Each finger is tracked by its own index, and its motion is worked out from
## its own last position (on the web a drag's `relative` can be measured against
## another finger). Finger indexes are whatever the browser hands out; iPhone
## Safari gives big, sometimes negative numbers, so "no finger" is NONE, never -1.
## (The finger bookkeeping follows the studio's Melt a Glacier controls.)

const STICK_RADIUS := 85.0
const STICK_DEAD := 0.12
const STICK_ZONE := 0.42
const FIRE_RADIUS := 96.0
const JUMP_RADIUS := 52.0
const LOOK_DEAD_PX := 8.0
const FIRE_LOOK_DEAD_PX := 22.0
const GLITCH_PX := 220.0
const NONE := -281474976710656

var move_vector := Vector2.ZERO
var firing := false
var jump_held := false
var look_delta := Vector2.ZERO
var buttons: Array = []               # [{control, action}]
var exclusions: Array[Control] = []
var heat_ok := true                   # the fire button glows less when there's nothing it can light
var g := 1.0                          # geometry scale: the HUD draws bigger on phones, the controls stay thumb-sized

var _stick_finger := NONE
var _stick_origin := Vector2.ZERO
var _stick_pos := Vector2.ZERO
var _look_finger := NONE
var _fire_finger := NONE
var _jump_finger := NONE
var _jump_queued := false
var _last := {}
var _travel := {}
var _t := 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_watch_browser_touches()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED \
			or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		release_all()


func _process(delta: float) -> void:
	_t += delta
	if visible:
		queue_redraw()


func fire_center() -> Vector2:
	return Vector2(size.x - 150.0 * g, size.y - 150.0 * g)


func jump_center() -> Vector2:
	return Vector2(size.x - 300.0 * g, size.y - 76.0 * g)


func stick_home() -> Vector2:
	return Vector2(170.0 * g, size.y - 160.0 * g)


func take_look_delta() -> Vector2:
	var d := look_delta
	look_delta = Vector2.ZERO
	return d


func take_jump() -> bool:
	var j := _jump_queued
	_jump_queued = false
	return j


func release_all() -> void:
	_stick_finger = NONE
	_look_finger = NONE
	_fire_finger = NONE
	_jump_finger = NONE
	_last.clear()
	_travel.clear()
	move_vector = Vector2.ZERO
	firing = false
	jump_held = false
	look_delta = Vector2.ZERO
	queue_redraw()


func _excluded(pos: Vector2) -> bool:
	for c in exclusions:
		if is_instance_valid(c) and c.is_visible_in_tree() and c.get_global_rect().has_point(pos):
			return true
	return false


func _button_at(pos: Vector2) -> Dictionary:
	for b in buttons:
		var c: Control = b.control
		if is_instance_valid(c) and c.is_visible_in_tree() and c.get_global_rect().grow(6.0).has_point(pos):
			return b
	return {}


func _input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	if event is InputEventScreenTouch:
		_on_touch(event)
	elif event is InputEventScreenDrag:
		_on_drag(event)


func _on_touch(event: InputEventScreenTouch) -> void:
	var i := event.index
	var pos := event.position
	_release(i)   # a new touch with an index we still hold: its lift-off got lost
	if not event.pressed or event.canceled:
		return
	_drop_lost_fingers(i)
	var b := _button_at(pos)
	if not b.is_empty():
		_flash(b.control)
		b.action.call()
		get_viewport().set_input_as_handled()
		return
	if _excluded(pos):
		return
	if pos.distance_to(fire_center()) <= (FIRE_RADIUS + 25.0) * g:
		_release(_fire_finger)
		_fire_finger = i
		firing = true
	elif pos.distance_to(jump_center()) <= (JUMP_RADIUS + 22.0) * g:
		_release(_jump_finger)
		_jump_finger = i
		jump_held = true
		_jump_queued = true
	elif pos.x < size.x * STICK_ZONE:
		_release(_stick_finger)
		_stick_finger = i
		_stick_origin = pos
		_stick_pos = pos
		move_vector = Vector2.ZERO
	else:
		_release(_look_finger)
		_look_finger = i
	_last[i] = pos
	_travel[i] = 0.0
	get_viewport().set_input_as_handled()


func _release(i: int) -> void:
	if i == NONE:
		return
	_last.erase(i)
	_travel.erase(i)
	if i == _fire_finger:
		_fire_finger = NONE
		firing = false
	if i == _jump_finger:
		_jump_finger = NONE
		jump_held = false
	if i == _stick_finger:
		_stick_finger = NONE
		move_vector = Vector2.ZERO
	if i == _look_finger:
		_look_finger = NONE


# --- In the browser: ask the page which fingers are really still down -----------------
const _JS_WATCH := """(function () {
	if (window.__forestTouchWatch) return;
	window.__forestTouchWatch = true;
	window.__forestTouchIds = '';
	var update = function (e) {
		var ids = [];
		for (var k = 0; k < e.touches.length; k++) ids.push(e.touches[k].identifier | 0);
		window.__forestTouchIds = ids.join(',');
	};
	['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (t) {
		window.addEventListener(t, update, { capture: true, passive: true });
	});
})();"""
var _browser_watch := false


func _watch_browser_touches() -> void:
	if OS.has_feature("web") and ClassDB.class_exists("JavaScriptBridge"):
		JavaScriptBridge.eval(_JS_WATCH, true)
		_browser_watch = true


func _drop_lost_fingers(new_finger: int) -> void:
	if not _browser_watch:
		return
	var ids = JavaScriptBridge.eval("window.__forestTouchIds", true)
	if typeof(ids) != TYPE_STRING:
		return
	var down := {}
	for part in (ids as String).split(",", false):
		down[int(part)] = true
	for f in [_fire_finger, _jump_finger, _stick_finger, _look_finger]:
		if f != NONE and f != new_finger and not down.has(f):
			_release(f)


func _on_drag(event: InputEventScreenDrag) -> void:
	var i := event.index
	if not _last.has(i):
		return
	var pos := event.position
	var step: Vector2 = pos - _last[i]
	_last[i] = pos
	if i == _stick_finger:
		_stick_pos = pos
		var d := _stick_pos - _stick_origin
		var sr := STICK_RADIUS * g
		if d.length() > sr:
			_stick_origin += d - d.normalized() * sr   # the base follows your thumb
			d = _stick_pos - _stick_origin
		var v := Vector2(d.x, -d.y) / sr
		var m := v.length()
		if m < STICK_DEAD:
			move_vector = Vector2.ZERO
		else:
			move_vector = v / m * minf(1.0, (m - STICK_DEAD) / (1.0 - STICK_DEAD))
	elif i == _look_finger or i == _fire_finger:
		var len := step.length()
		if len > GLITCH_PX or len == 0.0:
			return
		var dead := FIRE_LOOK_DEAD_PX if i == _fire_finger else LOOK_DEAD_PX
		var before: float = _travel.get(i, 0.0)
		_travel[i] = before + len
		if before + len <= dead:
			return
		if before < dead:
			step *= (before + len - dead) / len
		look_delta += step
	get_viewport().set_input_as_handled()


func _flash(c: Control) -> void:
	c.modulate = Color(1.4, 1.3, 1.2)
	c.create_tween().tween_property(c, "modulate", Color.WHITE, 0.25)


# --- Drawing: slices of a log, with marks branded into them ----------------------------
func _ring_pts(center: Vector2, radius: float, seed: int, amp: float, n: int = 28) -> PackedVector2Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var pts := PackedVector2Array()
	for k in n:
		var a := TAU * k / n
		pts.append(center + Vector2(cos(a), sin(a)) * (radius + rng.randf_range(-amp, amp)))
	return pts


func _log_slice(center: Vector2, radius: float, seed: int, alpha: float, pressed: bool) -> void:
	## A sawn slice of log: bark round the edge, growth rings, a crack, and a
	## hard ink shadow under it (it sinks into the shadow when pressed).
	var c := center + (Vector2(3, 4) if pressed else Vector2.ZERO)
	if not pressed:
		draw_colored_polygon(_ring_pts(center + Vector2(4, 6), radius + 3.0, seed, 2.0), Color(UiTheme.INK, 0.9 * alpha))
	var bark := _ring_pts(c, radius + 3.0, seed, 2.5)
	draw_colored_polygon(bark, Color("#3D2B22", alpha))
	var wood := _ring_pts(c, radius - 4.0, seed + 1, 1.2)
	draw_colored_polygon(wood, Color("#B58A57", alpha))
	var rng := RandomNumberGenerator.new()
	rng.seed = seed + 2
	# growth rings, all in one batched multiline
	var rings := int(radius / 11.0)
	var segs := PackedVector2Array()
	for k in rings:
		var r := (radius - 8.0) * float(k + 1) / (rings + 1)
		var off := Vector2(rng.randf_range(-2, 2), rng.randf_range(-2, 2)) * (float(k) / rings)
		var ring := _ring_pts(c + off, r, seed + 10 + k, 0.8, 24)
		for j in ring.size():
			segs.append(ring[j])
			segs.append(ring[(j + 1) % ring.size()])
	var a := rng.randf_range(0, TAU)
	segs.append(c + Vector2(cos(a), sin(a)) * radius * 0.35)
	segs.append(c + Vector2(cos(a), sin(a)) * (radius - 4.0))
	draw_multiline(segs, Color("#7E5A3A", 0.7 * alpha), 1.3)
	draw_polyline(wood + PackedVector2Array([wood[0]]), Color(UiTheme.INK, alpha), 2.0, true)
	draw_polyline(bark + PackedVector2Array([bark[0]]), Color(UiTheme.INK, alpha), 2.4, true)


func _brand_flame(c: Vector2, s: float, col: Color) -> void:
	## The flame mark branded into the burn button.
	var pts := PackedVector2Array()
	var shape := [Vector2(0, 1), Vector2(0.55, 0.78), Vector2(0.62, 0.25), Vector2(0.32, -0.15), Vector2(0.36, -0.62),
		Vector2(0.06, -0.38), Vector2(-0.04, -1.0), Vector2(-0.34, -0.45), Vector2(-0.6, -0.2), Vector2(-0.6, 0.6)]
	for p in shape:
		pts.append(c + p * s)
	draw_colored_polygon(pts, col)
	draw_polyline(pts + PackedVector2Array([pts[0]]), UiTheme.INK, 2.2, true)


func _draw() -> void:
	# The stick: a carved wooden ring with a peg for a knob.
	var base := _stick_origin if _stick_finger != NONE else stick_home()
	var knob := _stick_pos if _stick_finger != NONE else base
	var a := 0.95 if _stick_finger != NONE else 0.6
	var sr := STICK_RADIUS * g
	draw_arc(base + Vector2(3, 4), sr, 0, TAU, 48, Color(UiTheme.INK, 0.5 * a), 9.0, true)
	draw_arc(base, sr, 0, TAU, 48, Color("#7A5636", a), 7.0, true)
	draw_arc(base, sr + 3.5, 0, TAU, 48, Color(UiTheme.INK, a), 1.6, true)
	draw_arc(base, sr - 3.5, 0, TAU, 48, Color(UiTheme.INK, a), 1.6, true)
	for k in 4:
		var ang := TAU * k / 4.0 + PI * 0.25
		draw_line(base + Vector2(cos(ang), sin(ang)) * (sr - 3.5), base + Vector2(cos(ang), sin(ang)) * (sr + 3.5),
			Color(UiTheme.INK, a), 2.0, true)
	_log_slice(knob, 32.0 * g, 17, a, false)
	draw_circle(knob, 7.0 * g, Color(UiTheme.INK, 0.5 * a))
	# The burn button: a log slice with a flame branded into it. The brand
	# glows ember only while you burn (the one warm thing in the corner).
	var fc := fire_center()
	_log_slice(fc, FIRE_RADIUS * g, 29, 1.0, firing)
	var press := Vector2(3, 4) if firing else Vector2.ZERO
	var pulse := 0.5 + 0.5 * sin(_t * 9.0)
	var brand := Color("#2A1A12")
	if firing:
		brand = UiTheme.EMBER.lerp(UiTheme.CORE, 0.35 * pulse)
	elif not heat_ok:
		brand = Color("#5E5048")
	_brand_flame(fc + press + Vector2(0, -4) * g, 40.0 * g, brand)
	if firing:
		_brand_flame(fc + press + Vector2(0, 8) * g, 18.0 * g, UiTheme.CORE)
	_text(UiTheme.hand(), "hold to burn", fc + Vector2(0, FIRE_RADIUS * g + 20.0), 25, UiTheme.CREAM)
	# Jump: a smaller slice with a chevron branded in.
	var jc := jump_center()
	var jdown := _jump_finger != NONE
	_log_slice(jc, JUMP_RADIUS * g, 41, 1.0, jdown)
	var jp := Vector2(3, 4) if jdown else Vector2.ZERO
	var chev := PackedVector2Array([jc + jp + Vector2(-18, 10) * g, jc + jp + Vector2(0, -12) * g, jc + jp + Vector2(18, 10) * g])
	draw_polyline(chev, UiTheme.INK, 9.0, true)
	draw_polyline(chev, Color("#2A1A12"), 5.0, true)
	_text(UiTheme.hand(), "jump", jc + Vector2(-JUMP_RADIUS * g - 34.0, 6.0), 24, UiTheme.CREAM)


func _text(font: Font, s: String, center: Vector2, font_size: int, color: Color) -> void:
	var w := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var at := Vector2(center.x - w * 0.5, center.y + font_size * 0.35)
	draw_string_outline(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, maxi(4, font_size / 4), Color(UiTheme.INK, color.a))
	draw_string(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)
