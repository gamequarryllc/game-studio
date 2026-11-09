class_name Aquarium
extends Node3D
## The aquarium on the pier: its own little scene, far from the bay on its own
## render layer, with its own camera and light. Everything you've rescued
## swims in the big tank; the specimen register on the left lists every
## species (a dash for the ones still out there); the ticket board shows the
## takings. Visitors pay to see what you've rescued, so the tank is also the
## idle earner.

signal closed

const ORIGIN := Vector3(4000.0, 0.0, 0.0)
const TANK := Vector3(14.0, 6.0, 5.0)
const LAYER := 2

var camera: Camera3D
var fish: Array = []             # {"node", "vel", "species"}
var ui: CanvasLayer
var register_box: VBoxContainer
var takings: Label
var ad_btn: StampButton
var _shown_counts: Array = []
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
	camera.fov = 48.0
	camera.position = Vector3(0, 3.0, 12.5)
	camera.cull_mask = 1 << (LAYER - 1)
	add_child(camera)
	camera.look_at(global_position + Vector3(0, 2.6, 0), Vector3.UP)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#0b2f38")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#5f9c98")
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color("#1f5f66")
	env.fog_density = 0.035
	camera.environment = env
	# The tank: back wall, sand floor, side walls, a timber frame.
	var back := _box(Vector3(TANK.x, TANK.y, 0.2), Vector3(0, TANK.y * 0.5, -TANK.z * 0.5), Color("#174f59"))
	back.name = "BackWall"
	_box(Vector3(TANK.x, 0.6, TANK.z), Vector3(0, 0.0, 0), Color("#d8bd8a"))
	_box(Vector3(0.3, TANK.y, TANK.z), Vector3(-TANK.x * 0.5, TANK.y * 0.5, 0), Color("#1b5560"))
	_box(Vector3(0.3, TANK.y, TANK.z), Vector3(TANK.x * 0.5, TANK.y * 0.5, 0), Color("#1b5560"))
	var wood := Color("#6e4a2a")
	_box(Vector3(TANK.x + 1.2, 0.5, 0.5), Vector3(0, TANK.y + 0.1, TANK.z * 0.5 + 0.2), wood)
	_box(Vector3(TANK.x + 1.2, 0.9, 0.5), Vector3(0, -0.2, TANK.z * 0.5 + 0.2), wood)
	_box(Vector3(0.5, TANK.y + 1.0, 0.5), Vector3(-TANK.x * 0.5 - 0.35, TANK.y * 0.5, TANK.z * 0.5 + 0.2), wood)
	_box(Vector3(0.5, TANK.y + 1.0, 0.5), Vector3(TANK.x * 0.5 + 0.35, TANK.y * 0.5, TANK.z * 0.5 + 0.2), wood)
	# Scenery inside, from the bay's own models.
	for e in [["rock_round", Vector3(-4.6, 0.3, -1.4), 1.6], ["rock_flat", Vector3(3.8, 0.3, -1.6), 1.4], ["coral_brain", Vector3(-2.0, 0.3, -1.8), 1.3],
			["coral_branch", Vector3(1.4, 0.3, -1.9), 1.5], ["coral_fan", Vector3(5.2, 0.3, -2.0), 1.4], ["rock_round", Vector3(5.6, 0.3, 0.6), 0.8]]:
		var n := Models.instance(str(e[0]))
		n.position = e[1]
		n.scale = Vector3.ONE * float(e[2])
		n.rotation.y = randf() * TAU
		add_child(n)
	for x in [-5.8, -5.2, -3.4, 2.6, 3.2, 6.0]:
		var k := Models.instance("kelp")
		k.position = Vector3(x, 0.3, -2.0 + randf() * 0.6)
		k.scale = Vector3.ONE * randf_range(1.0, 1.5)
		add_child(k)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color("#bfe6dc")
	sun.light_energy = 0.9
	sun.rotation_degrees = Vector3(-62, 20, 0)
	sun.light_cull_mask = 1 << (LAYER - 1)
	add_child(sun)
	var warm := OmniLight3D.new()
	warm.light_color = Color("#ffc890")
	warm.light_energy = 1.4
	warm.omni_range = 14.0
	warm.position = Vector3(-3.0, 5.0, 6.0)
	warm.light_cull_mask = 1 << (LAYER - 1)
	add_child(warm)
	_layer_all(self)


func _box(sz: Vector3, at: Vector3, col: Color) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = sz
	mi.mesh = bm
	mi.position = at
	mi.material_override = Models.flat(col, 0.9)
	add_child(mi)
	return mi


func _build_ui() -> void:
	ui = CanvasLayer.new()
	ui.layer = 12
	add_child(ui)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(root)
	var reg := Paper.new(101, 20)
	reg.position = Vector2(20, 20)
	reg.rotation = deg_to_rad(-0.8)
	root.add_child(reg)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 0)
	reg.add_child(vb)
	vb.add_child(UiTheme.label("SPECIMEN REGISTER", 15, UiTheme.RUST, UiTheme.bold()))
	vb.add_child(UiTheme.label("Rescued from the bay", 30, UiTheme.INK, UiTheme.italic()))
	register_box = VBoxContainer.new()
	register_box.add_theme_constant_override("separation", -2)
	vb.add_child(register_box)
	var board := Paper.new(103, 18)
	board.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	board.position = Vector2(-380, 20)
	board.rotation = deg_to_rad(0.9)
	root.add_child(board)
	var bv := VBoxContainer.new()
	bv.add_theme_constant_override("separation", 6)
	board.add_child(bv)
	bv.add_child(UiTheme.label("TICKET OFFICE", 15, UiTheme.RUST, UiTheme.bold()))
	takings = UiTheme.wrap(UiTheme.label("", 28, UiTheme.INK, UiTheme.display()), 320)
	bv.add_child(takings)
	bv.add_child(UiTheme.wrap(UiTheme.label("Visitors pay to see what you've rescued. Every creature in the tank sells tickets, even while you're out on the bay.", 18, UiTheme.DIM_INK, UiTheme.body()), 320))
	ad_btn = StampButton.new("Double ticket sales", "10 minutes, for a short ad", 22)
	ad_btn.ink = UiTheme.TEAL
	ad_btn.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	ad_btn.pressed.connect(func():
		Monetization.watch_for_reward("tickets", func(ok, text):
			if ok:
				Sound.play("reward", -3.0)
				_refresh_ui()))
	bv.add_child(ad_btn)
	var bp := Paper.new(105, 10)
	bp.grid = false
	bp.fold = false
	bp.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	bp.position = Vector2(-330, -112)
	root.add_child(bp)
	var back := StampButton.new("Back to the bay", "", 26)
	back.ink = UiTheme.INK
	back.pressed.connect(close)
	bp.add_child(back)


func open() -> void:
	is_open = true
	camera.current = true
	ui.visible = true
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
	for c in register_box.get_children():
		c.queue_free()
	var gs = GameState
	for i in Balance.SPECIES.size():
		var sp: Dictionary = Balance.SPECIES[i]
		var n := int(gs.species_counts[i])
		var hb := HBoxContainer.new()
		hb.add_theme_constant_override("separation", 8)
		register_box.add_child(hb)
		var no := UiTheme.label("%02d" % (i + 1), 16, UiTheme.RUST, UiTheme.bold())
		no.custom_minimum_size.x = 26
		hb.add_child(no)
		var nm := UiTheme.label(str(sp.name) if n > 0 else "not yet found", 19, UiTheme.INK if n > 0 else UiTheme.DIM_INK, UiTheme.italic() if n > 0 else UiTheme.body())
		nm.custom_minimum_size.x = 170
		hb.add_child(nm)
		var cnt := ""
		if n > 0:
			cnt = "went home" if sp.get("release", false) else "x%d" % n
		hb.add_child(UiTheme.label(cnt, 17, UiTheme.INK, UiTheme.bold()))
	var inc: float = gs.aquarium_income()
	takings.text = "%s a second" % Fmt.num(inc) if inc >= 1.0 else ("%.1f a second" % inc if inc > 0.0 else "No visitors yet")
	ad_btn.disabled = inc <= 0.0 or gs.is_ticket_rush_active()
	ad_btn.set_label("Double ticket sales", ("running: %s" % Fmt.duration(gs.ticket_rush_seconds_left())) if gs.is_ticket_rush_active() else "10 minutes, for a short ad")


func _sync_fish() -> void:
	var gs = GameState
	var want: Array = []
	for i in Balance.SPECIES.size():
		if Balance.SPECIES[i].get("release", false):
			continue
		for k in mini(int(gs.species_counts[i]), 3):
			want.append(i)
	want = want.slice(0, Balance.AQUARIUM_TANK_MAX)
	var have := {}
	for f in fish:
		have[f.species] = int(have.get(f.species, 0)) + 1
	var need := {}
	for s in want:
		need[s] = int(need.get(s, 0)) + 1
	for s in need:
		for k in int(need[s]) - int(have.get(s, 0)):
			var n := Models.instance(str(Balance.SPECIES[s].model))
			n.position = Vector3(randf_range(-5, 5), randf_range(1.2, 4.6), randf_range(-1.5, 1.5))
			n.scale = Vector3.ONE * 2.3
			add_child(n)
			_layer_all(n)
			fish.append({"node": n, "species": s, "vel": Vector3(randf_range(-1, 1), 0, randf_range(-0.3, 0.3)).normalized() * 0.8,
				"phase": randf() * TAU})


func _process(delta: float) -> void:
	if not is_open:
		return
	_t += delta
	if Engine.get_process_frames() % 30 == 0:
		_refresh_ui()
	for f in fish:
		var n: Node3D = f.node
		var key := str(Balance.SPECIES[int(f.species)].key)
		var ground := key in ["hermit_crab", "starfish", "urchin", "lobster", "flounder"]
		var v: Vector3 = f.vel
		var p := n.position
		var hx := TANK.x * 0.5 - 1.0
		if p.x > hx or p.x < -hx:
			v.x = -v.x
		if absf(p.z) > TANK.z * 0.5 - 1.0:
			v.z = -v.z
		v = v.rotated(Vector3.UP, sin(_t * 0.3 + float(f.phase)) * delta * 0.4)
		f.vel = v
		p += v * delta * (0.3 if ground else 1.0)
		p.x = clampf(p.x, -hx, hx)
		p.z = clampf(p.z, -TANK.z * 0.5 + 1.0, TANK.z * 0.5 - 1.0)
		if ground:
			p.y = 0.35
		else:
			p.y = clampf(p.y + sin(_t * 0.7 + float(f.phase)) * delta * 0.3, 1.0, TANK.y - 0.8)
		n.position = p
		n.rotation.y = atan2(-v.x, -v.z)
