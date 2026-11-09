class_name TouchControls
extends Control
## Multi-touch phone controls drawn over the game:
##  left side = a floating thumb stick to walk,
##  right side = drag to orbit the camera,
##  the big 🔥 button = hold to use the tool (dragging from it also turns the camera),
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
	return Vector2(size.x - 150.0, size.y - 150.0)


func jump_center() -> Vector2:
	return Vector2(size.x - 300.0, size.y - 76.0)


func stick_home() -> Vector2:
	return Vector2(170.0, size.y - 160.0)


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
	if pos.distance_to(fire_center()) <= FIRE_RADIUS + 25.0:
		_release(_fire_finger)
		_fire_finger = i
		firing = true
	elif pos.distance_to(jump_center()) <= JUMP_RADIUS + 22.0:
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
		if d.length() > STICK_RADIUS:
			_stick_origin += d - d.normalized() * STICK_RADIUS   # the base follows your thumb
			d = _stick_pos - _stick_origin
		var v := Vector2(d.x, -d.y) / STICK_RADIUS
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


# --- Drawing: coals in a dark ring ---------------------------------------------------
func _coal(center: Vector2, radius: float, rim: Color, lit: float) -> void:
	## A dark disc with a glowing rim; `lit` 0..1 warms it from inside.
	for k in 4:
		var r := radius + 4.0 + k * 5.0
		draw_arc(center, r, 0, TAU, 48, Color(rim.r, rim.g * 0.8, rim.b, (0.12 - k * 0.025) * (0.6 + lit)), 6.0, true)
	draw_circle(center, radius, Color(UiTheme.CHARCOAL, 0.8))
	draw_circle(center, radius * 0.86, Color(rim.r * 0.5, rim.g * 0.3, rim.b * 0.2, 0.35 + 0.4 * lit))
	draw_circle(center, radius * 0.6, Color(rim.r * 0.8, rim.g * 0.5, rim.b * 0.3, 0.2 + 0.5 * lit))
	draw_arc(center, radius, 0, TAU, 64, rim, 4.0, true)


func _draw() -> void:
	var font := UiTheme.bold()
	# The stick.
	var base := _stick_origin if _stick_finger != NONE else stick_home()
	var knob := _stick_pos if _stick_finger != NONE else base
	var a := 0.95 if _stick_finger != NONE else 0.55
	draw_circle(base, STICK_RADIUS, Color(UiTheme.CHARCOAL, 0.35 * a))
	draw_arc(base, STICK_RADIUS, 0, TAU, 64, Color(UiTheme.EMBER, 0.55 * a), 3.0, true)
	for k in 8:
		var ang := TAU * k / 8.0
		draw_line(base + Vector2(cos(ang), sin(ang)) * (STICK_RADIUS - 12.0), base + Vector2(cos(ang), sin(ang)) * (STICK_RADIUS - 4.0),
			Color(UiTheme.EMBER_HOT, 0.4 * a), 3.0, true)
	_coal(knob, 34.0, Color(UiTheme.EMBER, a), 0.6 if _stick_finger != NONE else 0.2)
	if _stick_finger == NONE:
		_text(font, "MOVE", base + Vector2(0, STICK_RADIUS + 26), 22, Color(UiTheme.CREAM, 0.75))
	# The fire button: it breathes, and roars while held.
	var fc := fire_center()
	var press := Vector2(0, 4) if firing else Vector2.ZERO
	var pulse := 0.5 + 0.5 * sin(_t * 3.0)
	var rim := UiTheme.EMBER if heat_ok else Color(0.6, 0.55, 0.6)
	_coal(fc + press, FIRE_RADIUS, Color(rim, 1.0), (1.0 if firing else 0.35 + 0.15 * pulse))
	_text(font, "🔥", fc + press + Vector2(0, -14), 58, Color.WHITE)
	_text(font, "HOLD TO BURN", fc + press + Vector2(0, 46), 19, UiTheme.CREAM)
	# Jump.
	var jc := jump_center()
	var jp := Vector2(0, 3) if _jump_finger != NONE else Vector2.ZERO
	_coal(jc + jp, JUMP_RADIUS, Color(UiTheme.EMBER_HOT, 0.85), 0.6 if _jump_finger != NONE else 0.15)
	_text(font, "JUMP", jc + jp, 22, UiTheme.CREAM)


func _text(font: Font, s: String, center: Vector2, font_size: int, color: Color) -> void:
	var w := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var at := Vector2(center.x - w * 0.5, center.y + font_size * 0.35)
	draw_string_outline(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, maxi(4, font_size / 4), Color(UiTheme.SOOT, color.a))
	draw_string(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)
