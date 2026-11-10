class_name StampButton
extends BaseButton
## A price or action as an ink stamp you tap. Rust ink when you can, faded
## when you can't; a tiny press-in when touched.

var text := ""
var sub := ""
var ink := UiTheme.RUST
var font_size := 26
var seed := 3
var icon: Texture2D
var _press := 0.0


func _init(t: String = "", s: String = "", size_px: int = 26) -> void:
	text = t
	sub = s
	font_size = size_px
	focus_mode = Control.FOCUS_NONE
	mouse_filter = Control.MOUSE_FILTER_STOP
	seed = randi() % 1000
	_fit()


func set_label(t: String, s: String = "") -> void:
	if t == text and s == sub:
		return
	text = t
	sub = s
	_fit()
	queue_redraw()


func _fit() -> void:
	var f := UiTheme.bold()
	var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	if sub != "":
		w = maxf(w, UiTheme.body().get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, UiTheme.sub_size(font_size)).x)
	var ic := 0.0 if icon == null else font_size * 1.1
	# generous to tap: never under 84 x 64 logical px (about 46 x 35 on a phone)
	custom_minimum_size = Vector2(maxf(w + 38 + ic, 84.0), maxf(font_size * (2.0 if sub == "" else 2.9), 64.0))


func _process(delta: float) -> void:
	var want := 1.0 if is_pressed() and not disabled else 0.0
	if absf(_press - want) > 0.01:
		_press = move_toward(_press, want, delta * 12.0)
		queue_redraw()


func _draw() -> void:
	var c := ink if not disabled else Color(UiTheme.INK, 0.32)
	var sc := 1.0 - 0.05 * _press
	var r := Rect2(size * (1.0 - sc) * 0.5, size * sc)
	if not disabled:
		draw_rect(r.grow(-3), Color(UiTheme.PAPER, 0.55))
	if icon != null:
		var isz := font_size * 1.05
		var ir := Rect2(r.position + Vector2(12, (r.size.y - isz) * 0.5), Vector2(isz, isz))
		draw_texture_rect(icon, ir, false, Color(1, 1, 1, 1.0 if not disabled else 0.4))
		var inner := Rect2(r.position + Vector2(isz + 6, 0), r.size - Vector2(isz + 6, 0))
		UiTheme.stamp(self, inner, text, c, UiTheme.bold(), font_size, seed, sub)
		return
	UiTheme.stamp(self, r, text, c, UiTheme.bold(), font_size, seed, sub)
