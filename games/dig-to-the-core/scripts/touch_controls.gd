class_name TouchControls
extends Control
## Multi-touch phone controls drawn over the game: left side = floating
## stick, right side = drag to look, hold the big DIG button to dig (dragging
## from it also turns the view), JUMP, and a context button above them that
## appears near the lift (RIDE UP / RIDE DOWN) or the shack (SHOP).
## Godot's Buttons only see the first finger, so all of this reads raw
## touches; on-screen HUD buttons registered in `buttons` are tapped from here.
##
## Each finger is tracked by its own index with its own last position (on the
## web a drag's `relative` can be measured against another finger). Finger
## indexes can be any number (iPhone Safari gives huge negative ones), so
## "no finger" is NONE, which no real index can be.

const STICK_RADIUS := 86.0
const STICK_DEAD := 0.12
const STICK_ZONE := 0.42
const DIG_RADIUS := 100.0
const JUMP_RADIUS := 56.0
const ACTION_RADIUS := 62.0
const LOOK_DEAD_PX := 8.0
const DIG_LOOK_DEAD_PX := 24.0
const GLITCH_PX := 220.0
const NONE := -281474976710656

var move_vector := Vector2.ZERO
var digging := false
var look_delta := Vector2.ZERO
var buttons: Array = []               # [{control, action}]
var exclusions: Array[Control] = []
var action_text := ""                 # "" = no context button
var action_sub := ""
var action_color := UiTheme.LAMP_GREEN
var action_icon := ""

var _stick_finger := NONE
var _stick_origin := Vector2.ZERO
var _stick_pos := Vector2.ZERO
var _look_finger := NONE
var _dig_finger := NONE
var _jump_finger := NONE
var _action_finger := NONE
var _jump_queued := false
var _action_queued := false
var _last := {}
var _travel := {}
var _pulse := 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_watch_browser_touches()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED \
			or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		release_all()


func dig_center() -> Vector2:
	return Vector2(size.x - 150.0, size.y - 150.0)


func jump_center() -> Vector2:
	# Clear of DIG (rims at least 12 px apart) and of the bottom edge.
	return Vector2(size.x - 335.0, size.y - 74.0)


func action_center() -> Vector2:
	return Vector2(size.x - 330.0, size.y - 252.0)


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


func take_action() -> bool:
	var a := _action_queued
	_action_queued = false
	return a


func set_action(text: String, sub: String = "", color: Color = UiTheme.LAMP_GREEN, icon_name: String = "") -> void:
	if text != action_text or sub != action_sub or color != action_color or icon_name != action_icon:
		action_text = text
		action_sub = sub
		action_color = color
		action_icon = icon_name
		queue_redraw()


func release_all() -> void:
	_stick_finger = NONE
	_look_finger = NONE
	_dig_finger = NONE
	_jump_finger = NONE
	_action_finger = NONE
	_last.clear()
	_travel.clear()
	move_vector = Vector2.ZERO
	digging = false
	look_delta = Vector2.ZERO
	_action_queued = false
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
			if c is BaseButton and (c as BaseButton).disabled:
				continue
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
	_release(i)
	if not event.pressed or event.canceled:
		queue_redraw()
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
	if pos.distance_to(dig_center()) <= DIG_RADIUS + 25.0:
		_release(_dig_finger)
		_dig_finger = i
		digging = true
	elif action_text != "" and pos.distance_to(action_center()) <= ACTION_RADIUS + 18.0:
		_action_finger = i
		_action_queued = true
	elif pos.distance_to(jump_center()) <= JUMP_RADIUS + 25.0:
		_release(_jump_finger)
		_jump_finger = i
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
	queue_redraw()


func _release(i: int) -> void:
	if i == NONE:
		return
	_last.erase(i)
	_travel.erase(i)
	if i == _dig_finger:
		_dig_finger = NONE
		digging = false
	if i == _jump_finger:
		_jump_finger = NONE
	if i == _action_finger:
		_action_finger = NONE
	if i == _stick_finger:
		_stick_finger = NONE
		move_vector = Vector2.ZERO
	if i == _look_finger:
		_look_finger = NONE


# --- In the browser: ask the page which fingers are really still down ---------------
const _JS_WATCH := """(function () {
	if (window.__digTouchWatch) return;
	window.__digTouchWatch = true;
	window.__digTouchIds = '';
	var update = function (e) {
		var ids = [];
		for (var k = 0; k < e.touches.length; k++) ids.push(e.touches[k].identifier | 0);
		window.__digTouchIds = ids.join(',');
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
	var ids = JavaScriptBridge.eval("window.__digTouchIds", true)
	if typeof(ids) != TYPE_STRING:
		return
	var down := {}
	for part in (ids as String).split(",", false):
		down[int(part)] = true
	for f in [_dig_finger, _jump_finger, _stick_finger, _look_finger, _action_finger]:
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
			_stick_origin += d - d.normalized() * STICK_RADIUS
			d = _stick_pos - _stick_origin
		var v := Vector2(d.x, -d.y) / STICK_RADIUS
		var m := v.length()
		if m < STICK_DEAD:
			move_vector = Vector2.ZERO
		else:
			move_vector = v / m * minf(1.0, (m - STICK_DEAD) / (1.0 - STICK_DEAD))
		queue_redraw()
	elif i == _look_finger or i == _dig_finger:
		var len := step.length()
		if len > GLITCH_PX or len == 0.0:
			return
		var dead := DIG_LOOK_DEAD_PX if i == _dig_finger else LOOK_DEAD_PX
		var before: float = _travel.get(i, 0.0)
		_travel[i] = before + len
		if before + len <= dead:
			return
		if before < dead:
			step *= (before + len - dead) / len
		look_delta += step
	get_viewport().set_input_as_handled()


func _flash(c: Control) -> void:
	c.modulate = Color(1.4, 1.4, 1.4)
	c.create_tween().tween_property(c, "modulate", Color.WHITE, 0.25)


func _process(delta: float) -> void:
	if action_text != "":
		_pulse += delta
		queue_redraw()
	elif digging:
		queue_redraw()


# --- Drawing: brass rims, enamel faces, rivets --------------------------------------------------
func _gauge_button(center: Vector2, radius: float, face: Color, pressed: bool) -> void:
	var c := center + (Vector2(0, 4) if pressed else Vector2.ZERO)
	draw_circle(center + Vector2(0, 6), radius + 7.0, Color(0, 0, 0, 0.35))
	draw_circle(c, radius + 7.0, UiTheme.SOOT)
	draw_circle(c, radius + 5.0, UiTheme.BRASS_DARK)
	draw_circle(c, radius + 3.0, UiTheme.BRASS)
	draw_arc(c, radius + 3.5, PI * 1.1, PI * 1.9, 24, UiTheme.BRASS_LIGHT, 2.0)
	draw_circle(c, radius - 3.0, UiTheme.SOOT)
	draw_circle(c, radius - 5.0, face.darkened(0.25))
	draw_circle(c + Vector2(0, -2), radius - 9.0, face)
	draw_arc(c, radius - 14.0, PI * 1.15, PI * 1.85, 24, Color(1, 1, 1, 0.22 * face.a), 5.0)
	var n := 8 if radius > 70.0 else 6
	for k in n:
		var a := TAU * float(k) / float(n) + PI / float(n)
		UiTheme.draw_rivet(self, c + Vector2(cos(a), sin(a)) * (radius + 1.0), 2.6, UiTheme.BRASS)


func _icon(name: String, center: Vector2, size: float, tint: Color = Color.WHITE) -> void:
	draw_texture_rect(UiTheme.icon(name), Rect2(center - Vector2(size, size) * 0.5, Vector2(size, size)), false, tint)


func _draw() -> void:
	var font := UiTheme.display_font()
	var bold := UiTheme.bold_font()
	# Stick: a brass ring with a knob.
	var base := _stick_origin if _stick_finger != NONE else stick_home()
	var knob := _stick_pos if _stick_finger != NONE else base
	var a := 0.95 if _stick_finger != NONE else 0.6
	draw_arc(base, STICK_RADIUS, 0, TAU, 48, Color(UiTheme.SOOT, a * 0.8), 12.0)
	draw_arc(base, STICK_RADIUS, 0, TAU, 48, Color(UiTheme.BRASS, a), 6.0)
	for k in 4:
		var ang := TAU * k / 4.0
		UiTheme.draw_rivet(self, base + Vector2(cos(ang), sin(ang)) * STICK_RADIUS, 3.0, Color(UiTheme.BRASS, a))
	draw_circle(knob, 38.0, Color(UiTheme.SOOT, a))
	draw_circle(knob, 34.0, Color(UiTheme.BRASS.darkened(0.1), a))
	draw_circle(knob + Vector2(-6, -7), 13.0, Color(UiTheme.BRASS_LIGHT, a * 0.6))
	if _stick_finger == NONE:
		UiTheme.draw_text_centered(self, bold, "walk", base + Vector2(0, STICK_RADIUS + 26), 21, Color(UiTheme.CREAM, 0.8), 5)
	# DIG
	var dc := dig_center()
	var face := Color(0.82, 0.2, 0.12, 1.0 if digging else 0.9)
	_gauge_button(dc, DIG_RADIUS, face, digging)
	var off := Vector2(0, 4) if digging else Vector2.ZERO
	_icon(str(GameState.tool_def().icon), dc + off + Vector2(-2, -24), 64.0)
	UiTheme.draw_text_centered(self, font, "Dig", dc + off + Vector2(0, 26), 34, UiTheme.CREAM, 6)
	UiTheme.draw_text_centered(self, bold, "hold", dc + off + Vector2(0, 56), 17, Color(UiTheme.CREAM, 0.85), 4)
	# JUMP: soot iron, so it doesn't compete with DIG.
	var jc := jump_center()
	_gauge_button(jc, JUMP_RADIUS, Color(0.24, 0.21, 0.18, 0.95), _jump_finger != NONE)
	UiTheme.draw_text_centered(self, font, "Jump", jc + (Vector2(0, 4) if _jump_finger != NONE else Vector2.ZERO), 22, UiTheme.CREAM, 5)
	# Context button (lift / shop): no halo; its icon nods now and then so it's noticed.
	if action_text != "":
		var ac := action_center()
		_gauge_button(ac, ACTION_RADIUS, action_color.darkened(0.15), _action_finger != NONE)
		if action_icon != "":
			var nod := maxf(0.0, sin(_pulse * 3.0)) ** 6 * 5.0
			_icon(action_icon, ac + Vector2(0, -20 - nod), 40.0)
		UiTheme.draw_text_centered(self, font, action_text, ac + Vector2(0, 12), 22, UiTheme.CREAM, 5)
		if action_sub != "":
			UiTheme.draw_text_centered(self, bold, action_sub, ac + Vector2(0, 36), 15, UiTheme.CREAM, 4)
