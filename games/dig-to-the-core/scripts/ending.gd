class_name Ending
extends Control
## The ending's own moment: the HUD and the tool step aside, a camera circles
## slowly round the heart of the planet, and an assay certificate is laid
## over it with the run's figures stamped on (time, rock dug, ore, finds,
## money), signed and stamped by the assay office. Two buttons under it:
## keep digging, or start a new hole. Lives in Hud.popups, so it blocks
## input like a popup and the bots answer it the same way.

signal closed(new_hole: bool)

const INK := Color(0.2, 0.14, 0.09)
const RED_INK := Color(0.64, 0.16, 0.12)
const PAPER := Color(0.94, 0.9, 0.8)

var stats := {}          # depth, time, dug, ore, finds, finds_total, earned
var _cert: Control


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# A soft dark band behind the certificate so it reads over the bright core
	# (no full-screen dim: the core is the picture).
	var shade := Control.new()
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.draw.connect(func():
		var s := shade.size
		var clear := Color(0.03, 0.02, 0.01, 0.0)
		var dark := Color(0.03, 0.02, 0.01, 0.62)
		shade.draw_polygon(PackedVector2Array([Vector2(s.x * 0.4, 0), Vector2(s.x * 0.62, 0), Vector2(s.x * 0.62, s.y), Vector2(s.x * 0.4, s.y)]),
			PackedColorArray([clear, dark, dark, clear]))
		shade.draw_rect(Rect2(s.x * 0.62, 0, s.x * 0.38 + 1.0, s.y), dark))
	_build()


func _label(text: String, size: int, color: Color, display := false) -> Label:
	var l := UiTheme.label(text, size, color, 0, display)
	return l


func _build() -> void:
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_theme_constant_override("separation", 12)
	add_child(col)
	col.set_anchors_and_offsets_preset(Control.PRESET_CENTER_RIGHT)
	col.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	col.grow_vertical = Control.GROW_DIRECTION_BOTH
	col.offset_right = -40
	col.offset_left = -40 - 600
	var cert := PanelContainer.new()
	cert.add_theme_stylebox_override("panel", UiTheme.paper(Vector4(46, 30, 46, 30), 240, false, PAPER))
	cert.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cert.custom_minimum_size = Vector2(600, 0)
	col.add_child(cert)
	_cert = cert
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cert.add_child(v)
	var title := _label("You reached the core", 40, RED_INK, true)
	UiTheme.sign_text(title, 40, RED_INK, 0)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(title)
	var office := _label("Certificate of assay  ·  Deep Earth Assay Office", 22, INK)
	office.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(office)
	v.add_child(_rule())
	var depth := int(stats.get("depth", 240))
	var body := _label("This is to certify that a shaft was sunk %d m straight down, through ten layers of planet, to the very middle of it." % depth, 22, INK)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(body)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 18)
	grid.add_theme_constant_override("v_separation", 2)
	grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(grid)
	var rows := [
		["Time taken", str(stats.get("time", ""))],
		["Rock dug", "%s m³" % str(stats.get("dug", ""))],
		["Ore brought up", "%s bits" % str(stats.get("ore", ""))],
		["Finds", "%d of %d" % [int(stats.get("finds", 0)), int(stats.get("finds_total", 16))]],
		["Earned", str(stats.get("earned", ""))],
	]
	var k := 0
	for r in rows:
		var name_l := _label(str(r[0]), 23, INK)
		name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		grid.add_child(name_l)
		grid.add_child(_stamped(str(r[1]), k))
		k += 1
	v.add_child(_rule())
	var foot := _label("The Earth is very slightly hollow now.", 22, INK.lightened(0.15))
	foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(foot)
	var sign_row := Control.new()
	sign_row.custom_minimum_size = Vector2(0, 74)
	sign_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sign_row.draw.connect(_draw_signature.bind(sign_row))
	v.add_child(sign_row)
	var btns := HBoxContainer.new()
	btns.alignment = BoxContainer.ALIGNMENT_CENTER
	btns.add_theme_constant_override("separation", 16)
	col.add_child(btns)
	var keep := Button.new()
	keep.text = "Keep digging"
	keep.custom_minimum_size = Vector2(240, 64)
	UiTheme.style_button(keep, UiTheme.BRASS, 23)
	keep.pressed.connect(func(): _close(false))
	btns.add_child(keep)
	var fresh := Button.new()
	fresh.text = "Start a new hole"
	fresh.custom_minimum_size = Vector2(260, 64)
	UiTheme.style_button(fresh, UiTheme.IRON_LIGHT, 23)
	fresh.pressed.connect(func(): _close(true))
	btns.add_child(fresh)
	# Laid down a little crooked; it fades in once the camera has settled.
	cert.rotation = -0.02
	col.modulate.a = 0.0
	var tw := col.create_tween()
	tw.tween_interval(0.5)
	tw.tween_property(col, "modulate:a", 1.0, 0.6)


func _rule() -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, 14)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.draw.connect(func():
		var y := c.size.y * 0.5
		c.draw_line(Vector2(20, y - 2), Vector2(c.size.x - 20, y - 2), Color(INK, 0.6), 1.5)
		c.draw_line(Vector2(20, y + 2), Vector2(c.size.x - 20, y + 2), Color(INK, 0.35), 1.0)
		# a little diamond in the middle, like the printer's ornament
		var m := Vector2(c.size.x * 0.5, y)
		c.draw_colored_polygon(PackedVector2Array([m + Vector2(-8, 0), m + Vector2(0, -5), m + Vector2(8, 0), m + Vector2(0, 5)]), PAPER)
		c.draw_polyline(PackedVector2Array([m + Vector2(-8, 0), m + Vector2(0, -5), m + Vector2(8, 0), m + Vector2(0, 5), m + Vector2(-8, 0)]), Color(INK, 0.7), 1.5))
	return c


func _stamped(text: String, k: int) -> Control:
	## A figure rubber-stamped in red into its box: a ruled frame and the
	## value, each set a touch off true.
	var c := Control.new()
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var f := UiTheme.bold_font()
	var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 25).x + 26.0
	c.custom_minimum_size = Vector2(maxf(w, 120.0), 40)
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var tilt: float = [-0.03, 0.025, -0.015, 0.035, -0.025][k % 5]
	c.draw.connect(func():
		c.draw_set_transform(Vector2(6, 20), tilt, Vector2.ONE)
		var r := Rect2(Vector2(0, -16), Vector2(w, 34))
		c.draw_rect(r, Color(RED_INK, 0.85), false, 2.0)
		c.draw_string(f, Vector2(13, 9), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 25, Color(RED_INK, 0.95))
		c.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE))
	return c


func _draw_signature(c: Control) -> void:
	var f := UiTheme.bold_font()
	# The assayer's line and a quick signature over it.
	var y := c.size.y - 18.0
	c.draw_line(Vector2(30, y), Vector2(260, y), Color(INK, 0.7), 1.5)
	c.draw_string(f, Vector2(30, y + 16), "Assayer", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(INK, 0.8))
	var pts := PackedVector2Array()
	for i in 40:
		var t := float(i) / 39.0
		pts.append(Vector2(44 + t * 190.0, y - 10.0 - 12.0 * sin(t * 11.0) * (1.0 - t * 0.6) - 6.0 * sin(t * 3.0)))
	c.draw_polyline(pts, Color(0.12, 0.12, 0.3, 0.9), 2.0, true)
	# The office's round stamp, struck at an angle across the corner.
	var ctr := Vector2(c.size.x - 110.0, y - 16.0)
	c.draw_set_transform(ctr, -0.25, Vector2.ONE)
	c.draw_arc(Vector2.ZERO, 50.0, 0, TAU, 48, Color(RED_INK, 0.8), 3.0)
	c.draw_arc(Vector2.ZERO, 42.0, 0, TAU, 48, Color(RED_INK, 0.8), 1.5)
	var word := "ASSAYED"
	var ww := f.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
	c.draw_string(f, Vector2(-ww * 0.5, -4), word, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(RED_INK, 0.85))
	var w2 := "CORE"
	var ww2 := f.get_string_size(w2, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	c.draw_string(f, Vector2(-ww2 * 0.5, 20), w2, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(RED_INK, 0.85))
	c.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _close(new_hole: bool) -> void:
	closed.emit(new_hole)
	if get_parent() != null:
		get_parent().remove_child(self)
	queue_free()
