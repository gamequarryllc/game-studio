class_name FlagButton
extends BaseButton
## A main button as an International Code signal flag hanging off the
## halyard, with its name on a small paper tag below.

var pattern := "C"
var caption := ""
var badge := ""
var _t := 0.0
var _press := 0.0


func _init(p: String = "C", cap: String = "") -> void:
	pattern = p
	caption = cap
	focus_mode = Control.FOCUS_NONE
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(118, 132)


func _process(delta: float) -> void:
	_t += delta / maxf(Engine.time_scale, 0.001)
	_press = move_toward(_press, 1.0 if is_pressed() else 0.0, delta * 10.0)
	queue_redraw()


func _draw() -> void:
	var w := size.x
	var fr := Rect2(Vector2(14, 10 + _press * 4.0), Vector2(w - 26, 70))
	# toggle line from the halyard
	draw_line(Vector2(fr.position.x, 0), Vector2(fr.position.x, fr.end.y), UiTheme.ROPE_DARK, 2.0)
	draw_circle(Vector2(fr.position.x, 2), 3.5, UiTheme.BRASS)
	UiTheme.flag(self, fr, pattern, _t, int(pattern.unicode_at(0)))
	# the paper tag with the name
	var f := UiTheme.bold()
	var fs := 20
	var tw := f.get_string_size(caption, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var tag := Rect2(Vector2((w - tw) * 0.5 - 9, fr.end.y + 12), Vector2(tw + 18, 30))
	draw_set_transform(tag.get_center(), deg_to_rad(UiTheme.jitter(int(pattern.unicode_at(0)), 4) * 3.0), Vector2.ONE)
	var lt := Rect2(-tag.size * 0.5, tag.size)
	draw_colored_polygon(UiTheme.rough_rect(Rect2(lt.position + Vector2(2, 3), lt.size), 5, 1.0), Color(0.05, 0.12, 0.15, 0.3))
	draw_colored_polygon(UiTheme.rough_rect(lt, 9, 1.0), UiTheme.PAPER)
	draw_string(f, Vector2(-tw * 0.5, 7), caption, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UiTheme.INK)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	draw_line(Vector2(fr.position.x + 2, fr.end.y), tag.position + Vector2(10, 2), Color(UiTheme.ROPE_DARK, 0.8), 1.2)
	if badge != "":
		var bc := Vector2(fr.end.x - 4, fr.position.y + 6)
		draw_circle(bc, 15, UiTheme.CORAL)
		draw_arc(bc, 15, 0, TAU, 20, UiTheme.INK, 1.5)
		var bw := f.get_string_size(badge, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		draw_string(f, bc + Vector2(-bw * 0.5, 6), badge, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, UiTheme.INK)
