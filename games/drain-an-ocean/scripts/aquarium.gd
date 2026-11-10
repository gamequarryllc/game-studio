class_name Aquarium
extends Node3D
## The aquarium on the pier: its own little scene, far from the bay on its
## own render layer, with its own camera and light. A deep tank seen through
## the glass between the pier's timbers: rockwork up the back with ledges
## and a cave, sand sloping up to it, caustic light wandering over it all
## and shafts coming down from the surface. Everything you've rescued lives
## where it would: crabs, starfish, urchins, the lobster and the flounder on
## the sand; the octopus on a ledge; the moray in its crevice; the seahorse
## holding on to the kelp; the deep fish by the cave, glowing; the rest
## swimming their rounds at their own depths, in their own colours.
##
## The panels sit on the timber frame, not over the glass: the way out on
## the lintel, the takings on a slip at the foot of the right-hand post, and
## the specimen register as a tag that opens into a natural-history plate
## (the found as small engraved sketches, the rest as silhouettes).

signal closed

const ORIGIN := Vector3(4000.0, 0.0, 0.0)
const LAYER := 2
const TANK_W := 14.0
const TANK_D := 5.0
const FISH_SCALE := 2.3

# Where each species lives in the tank: [kind, x, y, z] (z: 0 at the glass, -5 at the back).
const HOMES := {
	"hermit_crab": ["ground", -2.4, 0.0, -1.5], "starfish": ["ground", 1.4, 0.0, -1.1], "flounder": ["ground", -0.4, 0.0, -0.9],
	"urchin": ["ground", 4.4, 0.0, -1.7], "lobster": ["ground", -3.6, 0.0, -2.0], "octopus": ["ledge", -4.8, 1.55, -2.6],
	"moray": ["crevice", -4.45, 0.8, -2.8], "seahorse": ["kelp", -6.0, 2.3, -1.9], "anglerfish": ["cave", 3.4, 1.15, -3.6],
	"lanternfish": ["cave", 3.9, 1.9, -3.3], "kelp_bass": ["swim", 0.0, 3.0, -2.2], "clownfish": ["swim", 1.5, 2.0, -1.6],
	"pufferfish": ["swim", -1.0, 3.8, -2.6], "turtle": ["swim", 0.0, 4.4, -2.8], "coelacanth": ["swim", 0.5, 1.4, -3.2],
}

var camera: Camera3D
var fish: Array = []             # {"node", "species", "kind", "home", "phase", "slot"}
var ui: CanvasLayer
var root_ui: Control
var plate: Control
var takings: Label
var ad_btn: StampButton
var caustic_mat: ShaderMaterial
var is_open := false
var _t := 0.0


func _ready() -> void:
	position = ORIGIN
	_build_room()
	_build_ui()
	ui.visible = false


func _layer_all(n: Node) -> void:
	if n is VisualInstance3D:
		(n as VisualInstance3D).layers = 1 << (LAYER - 1)
	for c in n.get_children():
		_layer_all(c)


func _build_room() -> void:
	camera = Camera3D.new()
	camera.fov = 44.0
	camera.position = Vector3(0, 3.1, 12.8)
	camera.cull_mask = 1 << (LAYER - 1)
	add_child(camera)
	camera.look_at(global_position + Vector3(0, 2.7, -2.0), Vector3.UP)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#0d2a31")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#6aa3a0")
	env.ambient_light_energy = 0.5
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.05
	env.fog_enabled = true
	env.fog_light_color = Color("#235f66")
	env.fog_density = 0.012
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.06
	camera.environment = env
	var set := Models.instance("aquarium_set")
	set.name = "TankSet"
	add_child(set)
	caustic_mat = ShaderMaterial.new()
	caustic_mat.shader = load("res://shaders/caustics.gdshader")
	_overlay(set, caustic_mat)
	# rockwork stacked up both ends and along the back from the bay's stones:
	# big ones low, smaller ones climbing, leaning into each other
	var stones := [["rock_tall", -6.4, 0.6, -1.0, 2.0, 0.3], ["rock_round", -6.2, 0.4, -2.6, 2.4, 1.2], ["rock_flat", -6.0, 2.0, -2.2, 1.8, 2.0],
		["rock_tall", -6.5, 3.2, -3.4, 1.7, 0.7], ["rock_round", -5.9, 4.4, -2.8, 1.3, 2.6], ["rock_tall", 6.4, 0.7, -1.2, 2.1, 1.8],
		["rock_round", 6.1, 0.4, -2.8, 2.5, 0.4], ["rock_flat", 6.0, 2.2, -2.4, 1.9, 1.1], ["rock_tall", 6.4, 3.4, -3.6, 1.6, 2.2],
		["rock_round", 5.8, 4.6, -3.0, 1.2, 0.9], ["rock_flat", -2.4, 1.2, -4.3, 2.2, 0.5], ["rock_round", 0.8, 1.4, -4.5, 2.0, 1.6],
		["rock_tall", -0.9, 2.4, -4.6, 1.5, 2.4], ["rock_flat", 5.0, 1.8, -4.2, 1.6, 0.2]]
	for e in stones:
		var n := Models.instance(str(e[0]))
		n.position = Vector3(float(e[1]), float(e[2]), float(e[3]))
		n.scale = Vector3.ONE * float(e[4])
		n.rotation = Vector3(0.15 * sin(float(e[5]) * 3.0), float(e[5]), 0.12 * cos(float(e[5]) * 2.0))
		add_child(n)
	# kelp up the left end, a coral garden on the sand
	for e in [["kelp", Vector3(-6.0, 0.25, -1.9), 1.3], ["kelp", Vector3(-5.5, 0.3, -2.7), 1.1], ["kelp", Vector3(-6.3, 0.3, -3.2), 1.45],
			["kelp", Vector3(6.1, 0.35, -3.6), 1.2], ["coral_brain", Vector3(-1.9, 0.45, -2.9), 1.2], ["coral_branch", Vector3(1.0, 0.5, -3.3), 1.6],
			["coral_fan", Vector3(5.6, 0.55, -3.1), 1.5], ["coral_branch", Vector3(-3.0, 0.35, -2.2), 1.0], ["coral_brain", Vector3(2.6, 0.3, -1.6), 0.8]]:
		var n := Models.instance(str(e[0]))
		n.position = e[1]
		n.scale = Vector3.ONE * float(e[2])
		n.rotation.y = fmod(float(e[1].x) * 1.7, TAU)
		add_child(n)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color("#e6f4ec")
	sun.light_energy = 1.05
	sun.rotation_degrees = Vector3(-70, 15, 0)
	sun.shadow_enabled = true
	sun.light_cull_mask = 1 << (LAYER - 1)
	add_child(sun)
	var warm := OmniLight3D.new()
	warm.light_color = Color("#ffc890")
	warm.light_energy = 0.9
	warm.omni_range = 16.0
	warm.position = Vector3(-4.0, 6.0, 4.0)
	warm.light_cull_mask = 1 << (LAYER - 1)
	add_child(warm)
	var cave := OmniLight3D.new()
	cave.light_color = Color("#9fe0d0")
	cave.light_energy = 0.7
	cave.omni_range = 3.5
	cave.position = Vector3(3.6, 1.4, -3.4)
	cave.light_cull_mask = 1 << (LAYER - 1)
	add_child(cave)
	# shafts of light from the surface
	var shaft_mat := StandardMaterial3D.new()
	shaft_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	shaft_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	shaft_mat.albedo_texture = _shaft_texture()
	shaft_mat.albedo_color = Color(0.1, 0.15, 0.13, 1.0)
	shaft_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	shaft_mat.disable_receive_shadows = true
	shaft_mat.disable_fog = true        # fog on an additive quad paints it solid
	for sh in [[-2.6, 1.6, 0.18], [1.2, 2.2, 0.22], [4.2, 1.3, 0.15]]:
		var sx: float = sh[0]
		var lean: float = sh[2]
		var q := MeshInstance3D.new()
		var qm := QuadMesh.new()
		qm.size = Vector2(float(sh[1]), 6.0)
		q.mesh = qm
		q.material_override = shaft_mat
		q.position = Vector3(sx, 3.2, -2.2)
		q.rotation = Vector3(0, 0, lean)
		q.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(q)
	_layer_all(self)


func _overlay(n: Node, m: Material) -> void:
	if n is GeometryInstance3D and String(n.name).begins_with("Tank"):
		(n as GeometryInstance3D).material_overlay = m
	for c in n.get_children():
		_overlay(c, m)


func _shaft_texture() -> Texture2D:
	var img := Image.create(32, 64, false, Image.FORMAT_RGBA8)
	for y in 64:
		for x in 32:
			var u := absf((x + 0.5) / 32.0 - 0.5) * 2.0
			var v := (y + 0.5) / 64.0
			var a := (1.0 - u * u) * pow(1.0 - v, 1.5) * (0.7 + 0.3 * sin(x * 0.9))
			img.set_pixel(x, y, Color(a, a, a, 1.0))
	return ImageTexture.create_from_image(img)


func _build_ui() -> void:
	ui = CanvasLayer.new()
	ui.layer = 12
	add_child(ui)
	root_ui = Control.new()
	root_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	root_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(root_ui)
	# the way out, a sign on the lintel
	var back := ShopPanel.SignButton.new("Back to the bay", 9)
	back.set_meta("id", "back")
	back.position = Vector2(26, 8)
	back.pressed.connect(close)
	root_ui.add_child(back)
	# the register: a tag that opens the plate
	var reg := ShopPanel.SignButton.new("Specimen register", 11)
	reg.set_meta("id", "register")
	reg.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	reg.position = Vector2(26, -94)
	reg.pressed.connect(func(): open_plate(not plate.visible))
	root_ui.add_child(reg)
	# the takings on a slip pinned to the right-hand post's foot
	var slip := Paper.new(103, 18)
	slip.style = "slip"
	slip.add_theme_constant_override("margin_top", 24)
	slip.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	slip.position = Vector2(-430, -150)
	slip.rotation = deg_to_rad(1.0)
	root_ui.add_child(slip)
	var bv := VBoxContainer.new()
	bv.add_theme_constant_override("separation", 4)
	slip.add_child(bv)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 14)
	bv.add_child(top)
	var tv := VBoxContainer.new()
	tv.add_theme_constant_override("separation", -2)
	top.add_child(tv)
	tv.add_child(UiTheme.label("TICKET OFFICE", 21, UiTheme.RUST, UiTheme.bold()))
	takings = UiTheme.label("", 30, UiTheme.INK, UiTheme.display())
	takings.custom_minimum_size.x = 170
	tv.add_child(takings)
	ad_btn = StampButton.new("Double tickets", "", 24)
	ad_btn.ink = UiTheme.TEAL
	ad_btn.set_meta("id", "ad:tickets")
	ad_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ad_btn.pressed.connect(func():
		Monetization.watch_for_reward("tickets", func(ok, _text):
			if ok:
				Sound.play("reward", -3.0)
				_refresh_ui()))
	top.add_child(ad_btn)
	plate = Control.new()
	plate.set_anchors_preset(Control.PRESET_FULL_RECT)
	plate.mouse_filter = Control.MOUSE_FILTER_STOP
	plate.visible = false
	plate.gui_input.connect(func(e):
		if (e is InputEventMouseButton and e.pressed) or (e is InputEventScreenTouch and e.pressed):
			open_plate(false))
	root_ui.add_child(plate)


func open_plate(on: bool) -> void:
	plate.visible = on
	if on:
		_build_plate()


func _build_plate() -> void:
	for c in plate.get_children():
		plate.remove_child(c)
		c.queue_free()
	var shade := ColorRect.new()
	shade.color = Color(0.03, 0.1, 0.12, 0.55)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(shade)
	var p := Paper.new(107, 30)
	p.style = "plate"
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(p)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	p.add_child(vb)
	var head := HBoxContainer.new()
	vb.add_child(head)
	var t := UiTheme.label("Pl. I.  Rescued from the bay", 36, UiTheme.INK, UiTheme.italic())
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(t)
	head.add_child(UiTheme.label("%d of %d" % [GameState.species_seen(), Balance.SPECIES.size()], 24, UiTheme.RUST, UiTheme.bold()))
	var g := GridContainer.new()
	g.columns = 6
	g.add_theme_constant_override("h_separation", 14)
	g.add_theme_constant_override("v_separation", 6)
	vb.add_child(g)
	for i in Balance.SPECIES.size():
		var sp: Dictionary = Balance.SPECIES[i]
		var n := int(GameState.species_counts[i])
		var cell := VBoxContainer.new()
		cell.add_theme_constant_override("separation", -2)
		g.add_child(cell)
		cell.custom_minimum_size.x = 176
		var tr := TextureRect.new()
		var path := "res://ui/sketches/%s%s.png" % [str(sp.model), "" if n > 0 else "_unknown"]
		tr.texture = load(path) if ResourceLoader.exists(path) else null
		tr.custom_minimum_size = Vector2(150, 96)
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		cell.add_child(tr)
		var nm := UiTheme.label("%d. %s" % [i + 1, str(sp.name) if n > 0 else "not yet found"], 22, UiTheme.INK if n > 0 else Color(UiTheme.INK, 0.55), UiTheme.italic() if n > 0 else UiTheme.body())
		nm.clip_text = true
		nm.custom_minimum_size.x = 176
		cell.add_child(nm)
		var sub := ""
		if n > 0:
			sub = "went home" if sp.get("release", false) else "x%d in the tank" % n
		else:
			var ring := str(Balance.RINGS[int(sp.ring)].name).to_lower()
			sub = "out in %s" % (ring if ring.begins_with("the ") else "the " + ring)
		var sl := UiTheme.label(sub, 21, Color(UiTheme.INK, 0.62), UiTheme.body())
		sl.clip_text = true
		sl.custom_minimum_size.x = 176
		cell.add_child(sl)
	p.reset_size()
	var vs := root_ui.get_viewport_rect().size
	# never wider or taller than the screen, whatever its shape
	var k := minf(1.0, minf((vs.x - 40.0) / maxf(p.size.x, 1.0), (vs.y - 30.0) / maxf(p.size.y, 1.0)))
	p.scale = Vector2.ONE * k
	p.position = (vs - p.size * k) * 0.5


func open() -> void:
	is_open = true
	camera.current = true
	ui.visible = true
	plate.visible = false
	_sync_fish()
	_refresh_ui()
	Sound.play("ui_open", -4.0)


func close() -> void:
	if not is_open:
		return
	is_open = false
	ui.visible = false
	Sound.play("ui_close", -5.0)
	closed.emit()


func _refresh_ui() -> void:
	var gs = GameState
	var inc: float = gs.aquarium_income()
	takings.text = "%s a second" % Fmt.num(inc) if inc >= 1.0 else ("%.1f a second" % inc if inc > 0.0 else "No visitors yet")
	ad_btn.disabled = inc <= 0.0 or gs.is_ticket_rush_active() or not Monetization.is_rewarded_ready(Monetization.PLACEMENT_TICKETS)
	ad_btn.set_label("Double tickets", ("running %s" % Fmt.duration(gs.ticket_rush_seconds_left())) if gs.is_ticket_rush_active() else "for a short ad")


func _sync_fish() -> void:
	var gs = GameState
	var want := {}
	for i in Balance.SPECIES.size():
		if Balance.SPECIES[i].get("release", false):
			continue
		var k := mini(int(gs.species_counts[i]), 3 if str(HOMES.get(str(Balance.SPECIES[i].key), ["swim"])[0]) == "swim" else 1)
		if k > 0:
			want[i] = k
	var have := {}
	for f in fish:
		have[f.species] = int(have.get(f.species, 0)) + 1
	for s in want:
		for k in range(int(have.get(s, 0)), int(want[s])):
			var key := str(Balance.SPECIES[s].key)
			var home: Array = HOMES.get(key, ["swim", 0.0, 2.5, -2.0])
			var n := Models.instance(str(Balance.SPECIES[s].model))
			n.scale = Vector3.ONE * FISH_SCALE * (0.85 + 0.15 * float(k == 0))
			add_child(n)
			_layer_all(n)
			fish.append({"node": n, "species": s, "kind": str(home[0]), "home": Vector3(float(home[1]), float(home[2]), float(home[3])),
				"phase": float(k) * 2.1 + float(s) * 0.7, "slot": k})
	for f in fish:
		_place(f, 0.0)


func _floor_y(x: float, z: float) -> float:
	var v := clampf(-z / TANK_D, 0.0, 1.0)
	return 0.15 + 0.85 * pow(v, 1.6) + 0.12 * sin(x * 0.9) * v


func _place(f: Dictionary, t: float) -> void:
	var n: Node3D = f.node
	var h: Vector3 = f.home
	var ph: float = f.phase
	match str(f.kind):
		"ground":
			# potter about a spot on the sand
			var off := Vector3(sin(t * 0.25 + ph) * 0.5, 0, cos(t * 0.18 + ph) * 0.25) + Vector3(float(f.slot) * 0.9, 0, 0)
			var p := h + off
			n.position = Vector3(p.x, _floor_y(p.x, p.z) + 0.04, p.z)
			n.rotation.y = 0.6 * sin(t * 0.2 + ph) + ph
		"ledge":
			n.position = h
			n.rotation = Vector3(0, 0.6 + 0.15 * sin(t * 0.4), 0)
		"crevice":
			n.position = h + Vector3(0.12 * sin(t * 0.7 + ph), 0.04 * sin(t * 1.3), 0)
			n.rotation = Vector3(0, -0.6 + 0.12 * sin(t * 0.9), 0)
		"kelp":
			n.position = h + Vector3(0.08 * sin(t * 0.9), 0.12 * sin(t * 0.6 + ph), 0)
			n.rotation = Vector3(0, 1.2, 0.08 * sin(t * 0.9))
		"cave":
			n.position = h + Vector3(0.35 * sin(t * 0.3 + ph), 0.1 * sin(t * 0.5 + ph), 0.15 * cos(t * 0.3 + ph))
			n.rotation.y = PI * 0.5 + 0.3 * sin(t * 0.3 + ph)
		_:
			# a round: an ellipse at its own depth, a school strung out along it
			var speed := 0.16 if str(Balance.SPECIES[int(f.species)].key) in ["turtle", "coelacanth"] else 0.28
			var a := t * speed + ph
			var rx := 4.6 if h.y > 2.0 else 3.8
			var p := Vector3(h.x + cos(a) * rx, h.y + 0.3 * sin(a * 2.0 + ph), h.z + sin(a) * 1.1)
			var tangent := Vector3(-sin(a) * rx, 0, cos(a) * 1.1)
			n.position = p
			n.rotation = Vector3(0, atan2(-tangent.x, -tangent.z), 0.06 * sin(t * 2.0 + ph))


func _process(delta: float) -> void:
	if not is_open:
		return
	_t += delta / maxf(Engine.time_scale, 0.001)
	caustic_mat.set_shader_parameter("game_time", _t)
	if Engine.get_process_frames() % 30 == 0:
		_refresh_ui()
	for f in fish:
		_place(f, _t)
