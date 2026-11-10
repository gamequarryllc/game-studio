class_name ChartLettering
extends Node3D
## Ring names lettered on the seabed the way a chart letters a water
## feature: Fraunces italic, spaced out, bending along the shelf, in ink
## with a faint paper halo. Each ring's name inks in letter by letter when
## its shelf first comes out of the water, and stays, so the drained bay
## reads like a chart of itself. Placement (centre, heading, bend) is
## hand-set per ring in art/bay/make_bay.py.

const LETTER_H := 2.3            # metres tall
const TRACK := 1.18              # letter spacing, as on a chart

var bay: Bay
var words: Array = []            # per ring: {"node", "letters": [Label3D], "shown": bool, "anchor": Vector3}


func setup(b: Bay) -> void:
	bay = b
	var labels: Array = bay.landmarks.get("ring_labels", [])
	var font := UiTheme.italic()
	var fs := 72
	var px := LETTER_H / float(fs)
	for i in Balance.RINGS.size():
		var spec: Dictionary = labels[i] if i < labels.size() else {"x": 0.0, "z": 0.0, "yaw": 0.0, "bend": 0.0}
		var text := str(Balance.RINGS[i].name)
		var node := Node3D.new()
		node.name = "Ring_%d" % i
		add_child(node)
		# total width at this size, to centre the word on its spot
		var widths: Array = []
		var total := 0.0
		for ch in text:
			var w := font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x * px * TRACK
			widths.append(w)
			total += w
		var yaw := deg_to_rad(float(spec.yaw))
		var bend := float(spec.bend)
		var centre := Vector2(float(spec.x), float(spec.z))
		var along := -total * 0.5
		var letters: Array = []
		for k in text.length():
			var ch := text[k]
			var mid := along + float(widths[k]) * 0.5
			along += float(widths[k])
			if ch == " ":
				continue
			# along an arc of curvature `bend` (1/m), centred on the word's middle
			var ang := mid * bend
			var dir := Vector2(cos(yaw), sin(yaw))
			var nrm := Vector2(-dir.y, dir.x)
			var p2: Vector2
			if absf(bend) < 0.0001:
				p2 = centre + dir * mid
			else:
				var r := 1.0 / bend
				p2 = centre + dir * (sin(ang) * r) + nrm * (r - cos(ang) * r)
			var l := Label3D.new()
			l.text = ch
			l.font = font
			l.font_size = fs
			l.pixel_size = px
			l.modulate = Color(UiTheme.INK, 0.0)
			l.outline_size = 10
			l.outline_modulate = Color(UiTheme.PAPER, 0.0)
			l.billboard = BaseMaterial3D.BILLBOARD_DISABLED
			l.double_sided = false
			l.no_depth_test = false
			l.alpha_cut = Label3D.ALPHA_CUT_DISABLED
			l.render_priority = 2
			var gy := bay.height_at(p2.x, p2.y) + 0.12
			l.position = Vector3(p2.x, gy, p2.y)
			# lying flat, reading along the arc, tilted to the slope
			var heading := yaw + ang
			var basis := Basis(Vector3.UP, -heading) * Basis(Vector3.RIGHT, -PI * 0.5)
			var up := bay.normal_at(p2.x, p2.y)
			basis = Basis(Quaternion(Vector3.UP, up.lerp(Vector3.UP, 0.4).normalized())) * basis
			l.basis = basis
			node.add_child(l)
			letters.append(l)
		var anchor := Vector3(centre.x, bay.height_at(centre.x, centre.y) + 0.5, centre.y)
		words.append({"node": node, "letters": letters, "shown": false, "anchor": anchor})
	for i in words.size():
		if i <= GameState.ring_reached and _ring_dry(i):
			_set_alpha(i, 1.0)
			words[i].shown = true


func _ring_dry(i: int) -> bool:
	return bay.main_level() < float(Balance.RINGS[i].top) - 1.2


func _set_alpha(i: int, a: float) -> void:
	for l in words[i].letters:
		(l as Label3D).modulate = Color(UiTheme.INK, 0.86 * a)
		(l as Label3D).outline_modulate = Color(UiTheme.PAPER, 0.45 * a)


func anchor_of(i: int) -> Vector3:
	return words[i].anchor if i < words.size() else Vector3.INF


func reveal(i: int) -> void:
	if i >= words.size() or words[i].shown:
		return
	words[i].shown = true
	var letters: Array = words[i].letters
	for k in letters.size():
		var l: Label3D = letters[k]
		var tw := create_tween()
		tw.tween_interval(0.07 * k + 0.3)
		tw.tween_method(func(a: float):
			l.modulate = Color(UiTheme.INK, 0.86 * a)
			l.outline_modulate = Color(UiTheme.PAPER, 0.45 * a), 0.0, 1.0, 0.5).set_ease(Tween.EASE_OUT)


func update_visibility(paused: bool) -> void:
	## Shown words stay; a word whose shelf is back under water (a reset) hides.
	visible = not paused
	for i in words.size():
		if not words[i].shown and i <= GameState.ring_reached and _ring_dry(i):
			reveal(i)
