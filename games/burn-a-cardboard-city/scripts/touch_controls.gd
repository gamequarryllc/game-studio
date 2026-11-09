class_name TouchControls
extends Control
## Multi-touch phone controls drawn over the game, cut from cardboard:
##  left side = a floating thumb stick to walk (a red bottle cap on a card disc),
##  right side = drag to look round,
##  the big taped fire badge = hold to use the tool (dragging from it also looks),
##  the jump tag = tap to jump.
## Godot's Buttons only see the first finger, so this reads raw touches, and
## on-screen buttons registered in `buttons` are tapped from here with any finger.
## Each finger is tracked by its own index and its motion worked out from its own
## last position; iPhone Safari hands out big, sometimes negative indexes, so
## "no finger" is NONE, never -1. (Finger bookkeeping as in the studio's Melt a Glacier.)

const STICK_RADIUS := 85.0
const STICK_DEAD := 0.12
const STICK_ZONE := 0.42
const FIRE_RADIUS := 92.0
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
	if (window.__cityTouchWatch) return;
	window.__cityTouchWatch = true;
	window.__cityTouchIds = '';
	var update = function (e) {
		var ids = [];
		for (var k = 0; k < e.touches.length; k++) ids.push(e.touches[k].identifier | 0);
		window.__cityTouchIds = ids.join(',');
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
	var ids = JavaScriptBridge.eval("window.__cityTouchIds", true)
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


# --- Drawing: cardboard, a bottle cap, marker -------------------------------------------
func _disc(center: Vector2, radius: float, fill: Color, edge: Color, seed: int) -> void:
	var r := RandomNumberGenerator.new()
	r.seed = seed
	var pts := PackedVector2Array()
	var n := 28
	for k in n:
		var a := TAU * k / n
		pts.append(center + Vector2(cos(a), sin(a)) * radius * (1.0 + r.randf_range(-0.025, 0.025)))
	var shadow := PackedVector2Array()
	for q in pts:
		shadow.append(q + Vector2(3, 5))
	draw_colored_polygon(shadow, Color(0, 0, 0, 0.28 * fill.a))
	draw_colored_polygon(pts, fill)
	var y := center.y - radius + 8.0
	while y < center.y + radius - 6.0:
		var half := sqrt(maxf(0.0, radius * radius - (y - center.y) * (y - center.y))) - 6.0
		if half > 4.0:
			draw_line(Vector2(center.x - half, y), Vector2(center.x + half, y), Color(fill.darkened(0.08), 0.5 * fill.a), 1.0)
		y += 6.0
	var closed := pts.duplicate()
	closed.append(pts[0])
	draw_polyline(closed, edge, 2.5, true)


func _cap(center: Vector2, radius: float, lit: float) -> void:
	## A red bottle cap with a crimped rim.
	var pts := PackedVector2Array()
	for k in 42:
		var a := TAU * k / 42.0
		var rr := radius * (1.0 if k % 2 == 0 else 0.9)
		pts.append(center + Vector2(cos(a), sin(a)) * rr)
	var sh := PackedVector2Array()
	for q in pts:
		sh.append(q + Vector2(2, 4))
	draw_colored_polygon(sh, Color(0, 0, 0, 0.3))
	draw_colored_polygon(pts, Color("#c8402f").lightened(0.15 * lit))
	draw_circle(center, radius * 0.72, Color("#d9564a").lightened(0.15 * lit))
	draw_arc(center, radius * 0.72, 0, TAU, 32, Color("#8f2a20"), 2.0, true)
	draw_arc(center + Vector2(-radius * 0.15, -radius * 0.2), radius * 0.4, 3.6, 4.6, 10, Color(1, 1, 1, 0.45), 3.0, true)


func _draw() -> void:
	var font := Craft.marker()
	var kraft := Craft.KRAFT
	# The stick.
	var base := _stick_origin if _stick_finger != NONE else stick_home()
	var knob := _stick_pos if _stick_finger != NONE else base
	var a := 0.95 if _stick_finger != NONE else 0.62
	_disc(base, STICK_RADIUS, Color(kraft, 0.72 * a), Color(Craft.KRAFT_DARK, 0.8 * a), 11)
	for k in 4:
		var ang := TAU * k / 4.0
		var p := base + Vector2(cos(ang), sin(ang)) * (STICK_RADIUS - 16.0)
		var tip := base + Vector2(cos(ang), sin(ang)) * (STICK_RADIUS - 6.0)
		draw_line(p, tip, Color(Craft.INK, 0.55 * a), 3.0, true)
	_cap(knob, 32.0, 1.0 if _stick_finger != NONE else 0.0)
	if _stick_finger == NONE:
		_text(font, "walk", base + Vector2(0, STICK_RADIUS + 24), 22, Color(Craft.PAPER, 0.9))
	# The fire badge: pushed in and ringed with marker while you hold it.
	var fc := fire_center()
	var press := Vector2(0, 4) if firing else Vector2.ZERO
	var fill := Craft.KRAFT if heat_ok else Color(0.7, 0.66, 0.6)
	if firing:
		fill = fill.lerp(Craft.FLAME, 0.35)
	_disc(fc + press, FIRE_RADIUS, Color(fill, 0.92), Color(Craft.KRAFT_DARK, 0.95), 23)
	var t0 := fc + Vector2(-FIRE_RADIUS * 0.75, -FIRE_RADIUS * 0.82)
	draw_colored_polygon(PackedVector2Array([t0, t0 + Vector2(46, -22), t0 + Vector2(54, -7), t0 + Vector2(8, 15)]), Color(Craft.TAPE, 0.88))
	var ic := Craft.icon("flame")
	if ic != null:
		var s := 84.0 + (6.0 * sin(_t * 9.0) if firing else 0.0)
		draw_texture_rect(ic, Rect2(fc + press - Vector2(s, s) * 0.5 - Vector2(0, 12), Vector2(s, s)), false)
	_text(font, "hold", fc + press + Vector2(0, 44), 24, Craft.INK, false)
	if firing:
		var r := RandomNumberGenerator.new()
		r.seed = int(_t * 8.0)
		var pts := PackedVector2Array()
		for k in 34:
			var ang := TAU * k / 32.0
			pts.append(fc + press + Vector2(cos(ang), sin(ang)) * (FIRE_RADIUS + 9.0 + r.randf_range(-3, 3)))
		draw_polyline(pts, Craft.FLAME, 5.0, true)
	# Jump: a paper tag.
	var jc := jump_center()
	var jp := Vector2(0, 3) if _jump_finger != NONE else Vector2.ZERO
	_disc(jc + jp, JUMP_RADIUS, Color(Craft.PAPER, 0.9), Color(0.55, 0.5, 0.42, 0.95), 37)
	_text(font, "jump", jc + jp, 22, Craft.INK, false)


func _text(font: Font, s: String, center: Vector2, font_size: int, color: Color, outline: bool = true) -> void:
	var w := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var at := Vector2(center.x - w * 0.5, center.y + font_size * 0.35)
	if outline:
		draw_string_outline(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, maxi(4, font_size / 4), Color(Craft.INK, color.a))
	draw_string(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)
