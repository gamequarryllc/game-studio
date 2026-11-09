class_name World
extends Node3D
## The whole game in one scene, built in code: the sunny field and the shack
## at the top (Surface), the planet underneath (DigField, streamed zone by
## zone), the player, the helpers, the HUD and the lift. Digging pays here:
## the field says what came out of the rock, GameState turns it into money.
##
## The lift: at the top it's the cage by the shack; down below it's the lift
## stop, a lamp post that follows your deepest point. A ride locks the
## controls, fades to the inside of the moving cage (bars, a swinging lamp,
## rock streaming past) and the depth gauge spins to the other end.

const SPAWN_YAW := 0.32           # the lift and shack ahead-left, the dig site ahead-right
const FLOAT_POOL := 16
const STREAM_EVERY := 0.25

var field: DigField
var surface: Surface
var player: Player
var helpers: HelperCrew
var hud: Hud
var force_dig := false         # tests and screenshots

var _env: Environment
var _sun: DirectionalLight3D
var _lift_stop: Node3D
var _lift_stop_light: OmniLight3D
var _ride: Dictionary = {}     # the lift ride in progress
var _ride_cage: Node3D
var _ride_tube: MeshInstance3D
var _ride_tube_mat: StandardMaterial3D
var _floats: Array = []
var _float_i := 0
var _pending := 0.0
var _pending_at := Vector3.ZERO
var _pending_ore := 0
var _pending_t := 0.0
var _stream_t := 0.0
var _slow_t := 0.0
var _quality := 1.0
var _fps_t := 0.0
var _mouse_dig := false
var _zone_seen := 0
var _hit_glow := 0.0
var _near := ""                # "lift_top", "lift_stop", "shop" or ""
var _pops: Array = []          # finds popping out: {node, t, from, light}
var _detector_t := 0.0
var _ended_shown := false


func _ready() -> void:
	UiTheme.install_fonts()
	_build_environment()
	field = DigField.new()
	field.name = "Planet"
	field.setup(Balance.WORLD_SEED)
	field.load_saves(GameState.zone_saves)
	for f in Balance.FINDS.size():
		field.found[f] = GameState.found[f]
	add_child(field)
	field.dug.connect(_on_dug)
	field.find_exposed.connect(_on_find_exposed)
	GameState.field = field

	surface = Surface.new()
	surface.name = "Surface"
	add_child(surface)
	surface.build(field.material)

	player = Player.new()
	player.field = field
	add_child(player)
	var pos := GameState.player_pos if GameState.player_pos.is_finite() else Surface.SPAWN
	# Load the rock around where you'll stand before you're placed in it.
	_stream(pos)
	field.ensure_loaded(field.zone_of_y(pos.y))
	field.ensure_loaded(field.zone_of_y(pos.y - 6.0))
	field.focus = pos
	field.flush()
	player.position = pos
	if GameState.player_pos.is_finite():
		player.set_view(GameState.player_yaw, GameState.player_pitch)
	else:
		player.set_view(SPAWN_YAW, -0.18)
	player.unstick()
	GameState.player = player
	player.struck.connect(_on_struck)

	_build_lift_stop()
	_build_ride_cage()
	helpers = HelperCrew.new()
	helpers.field = field
	helpers.player = player
	add_child(helpers)
	_build_float_pool()

	hud = Hud.new()
	hud.player = player
	add_child(hud)
	hud.shop_closed.connect(_on_shop_closed)
	GameState.won.connect(_on_won)
	_zone_seen = GameState.deepest_zone()

	get_window().size_changed.connect(_fit_render_scale)
	_fit_render_scale()
	if DisplayServer.is_touchscreen_available():
		hud.set_touch_mode(true)
	_update_env(1.0)


func _exit_tree() -> void:
	if GameState.field == field:
		GameState.save_game()
		GameState.field = null
		GameState.player = null


# =====================================================================================
# Actions callable from code (bots, tests, the dev menu)
# =====================================================================================
func move_player(at: Vector3, yaw: float = 0.0, pitch: float = -0.2) -> void:
	_stream(at)
	field.ensure_loaded(field.zone_of_y(at.y))
	field.ensure_loaded(field.zone_of_y(at.y - 6.0))
	field.focus = at
	field.flush()
	player.teleport(at, yaw, pitch)


func dig_at(at: Vector3, radius: float = -1.0, damage: float = -1.0) -> Dictionary:
	## One strike at a world point (defaults: the current tool). Pays as usual.
	return field.dig(at, GameState.tool_radius() if radius < 0.0 else radius, GameState.tool_damage() if damage < 0.0 else damage)


func skip_to_zone(z: int) -> void:
	## Dev: a chamber at the top of layer z, with you, the lift stop and your
	## deepest point there.
	z = clampi(z, 0, Balance.zone_count() - 1)
	var y := field.zone_top(z) - 2.0
	var want := field.window_for(y)
	field.want_zones(want)
	for zz in want:
		field.ensure_loaded(zz)
	field.dig(Vector3(0.0, y, 0.0), 1.8, 1e12)
	field.dig(Vector3(0.0, y + 1.2, 0.0), 1.6, 1e12)
	field.flush()
	var fl := field.floor_below(Vector3(0.0, y + 1.0, 0.0), 6.0)
	var at := Vector3(0.0, fl + 0.05, 0.0)
	GameState.note_depth(-at.y)
	GameState.lift_stop = at + Vector3(0.9, 0.0, 0.0)
	_place_lift_stop()
	move_player(at, 0.0, -0.3)


# =====================================================================================
# Environment: sunny on top, dark underground
# =====================================================================================
func _build_environment() -> void:
	_env = Environment.new()
	_env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.3, 0.55, 0.92)
	sm.sky_horizon_color = Color(0.72, 0.84, 0.95)
	sm.ground_bottom_color = Color(0.25, 0.3, 0.2)
	sm.ground_horizon_color = Color(0.62, 0.72, 0.6)
	sm.sun_angle_max = 20.0
	sky.sky_material = sm
	_env.sky = sky
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = Color(0.62, 0.66, 0.72)
	_env.ambient_light_energy = 0.6
	_env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	_env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	_env.tonemap_white = 6.0
	_env.fog_enabled = true
	_env.fog_light_color = Color(0.7, 0.8, 0.9)
	_env.fog_density = 0.002
	_env.fog_sky_affect = 0.0
	var we := WorldEnvironment.new()
	we.environment = _env
	add_child(we)
	_sun = DirectionalLight3D.new()
	_sun.rotation = Vector3(deg_to_rad(-52.0), deg_to_rad(-35.0), 0.0)
	_sun.light_color = Color(1.0, 0.95, 0.85)
	_sun.light_energy = 1.05
	_sun.shadow_enabled = true
	_sun.directional_shadow_max_distance = 60.0
	add_child(_sun)


func _update_env(blend: float) -> void:
	## Fades from the sunny field to the dark of the shaft as you go down.
	var d := maxf(0.0, -player.position.y)
	var under := smoothstep(0.5, 9.0, d)
	var zi := field.zone_of_y(player.position.y)
	var zone: Dictionary = Balance.ZONES[zi]
	var fogc: Color = zone.fog
	var amb := Color(0.62, 0.66, 0.72).lerp(fogc.lightened(0.3), under)
	_env.ambient_light_color = _env.ambient_light_color.lerp(amb, blend)
	_env.ambient_light_energy = lerpf(0.6, 0.07, under)
	_env.fog_light_color = _env.fog_light_color.lerp(Color(0.7, 0.8, 0.9).lerp(fogc.darkened(0.35), under), blend)
	_env.fog_density = lerpf(0.002, 0.07, under)
	_sun.light_energy = lerpf(1.05, 0.0, smoothstep(0.0, 7.0, d))
	_sun.visible = _sun.light_energy > 0.01
	_sun.shadow_enabled = d < 4.0


# =====================================================================================
# Per frame
# =====================================================================================
func _process(delta: float) -> void:
	_watch_frame_rate(delta)
	_controls()
	if not _ride.is_empty():
		_update_ride(delta)
	field.focus = player.position
	if player.on_floor:
		field.flush_near(player.position, 1.2)
	_stream_t += delta
	if _stream_t > STREAM_EVERY:
		_stream_t = 0.0
		_stream(player.position)
	_update_env(minf(1.0, delta * 3.0))
	_update_depth()
	_update_floats(delta)
	_update_pops(delta)
	_update_near()
	_update_sounds(delta)
	_hit_glow = move_toward(_hit_glow, 0.0, delta * 3.0)
	if player.target.hit:
		field.material.set_shader_parameter("hit_pos", player.target.pos)
	field.material.set_shader_parameter("hit_amount", _hit_glow)
	field.material.set_shader_parameter("hit_radius", GameState.tool_radius() * 0.55)
	_slow_t += delta
	if _slow_t > 0.5:
		_slow_t = 0.0
		_update_slow()
	_update_coach()


func _stream(at: Vector3) -> void:
	## Keep the zones around you and around the helpers' dig site in memory.
	var want := field.window_for(at.y)
	if GameState.has_helpers():
		var site := GameState.lift_stop if GameState.lift_stop.is_finite() else Vector3.ZERO
		var z := field.zone_of_y(site.y - 0.5)
		want[z] = true
		if z > 0:
			want[z - 1] = true
	if not _ride.is_empty():
		var to: Vector3 = _ride.to
		for z in field.window_for(to.y):
			want[z] = true
	field.want_zones(want)


func _controls() -> void:
	var mv := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
		mv.y += 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
		mv.y -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
		mv.x += 1.0
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
		mv.x -= 1.0
	var touch := hud.touch
	var blocked := hud.is_blocking() or not _ride.is_empty()
	if touch.visible:
		mv += touch.move_vector
		player.add_look(touch.take_look_delta() * Balance.LOOK_SENSITIVITY_TOUCH)
		if touch.take_jump():
			player.jump()
		if touch.take_action():
			use_context()
	player.move_input = mv if not blocked else Vector2.ZERO
	if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		_mouse_dig = false
	player.digging = not blocked and (_mouse_dig or force_dig or (touch.visible and touch.digging))
	player.input_enabled = not blocked or force_dig


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		if not hud.touch_mode:
			hud.set_touch_mode(true)
		return
	if event is InputEventMouseButton:
		if event.device == InputEvent.DEVICE_ID_EMULATION:
			return
		if hud.touch_mode:
			hud.set_touch_mode(false)
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
				if not hud.is_blocking():
					Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
					get_viewport().gui_release_focus()
				return
			_mouse_dig = event.pressed
	elif event is InputEventMouseMotion:
		if event.device != InputEvent.DEVICE_ID_EMULATION and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and _ride.is_empty():
			player.add_look(event.relative * Balance.LOOK_SENSITIVITY_MOUSE)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_SPACE:
				player.jump()
			KEY_E, KEY_ENTER:
				if hud.shop != null:
					hud.close_shop()
				elif not hud.is_blocking():
					use_context()
			KEY_B:
				hud.take_offer()
			KEY_M:
				Sound.set_muted(not Sound.muted)
				hud.toast("Sound off (M to turn it back on)" if Sound.muted else "Sound on")
			KEY_ESCAPE:
				if hud.shop != null:
					hud.close_shop()
				Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


# =====================================================================================
# Lift and shop: what's near you, and the context button
# =====================================================================================
func _update_near() -> void:
	var p := player.position
	var near := ""
	if not _ride.is_empty() or hud.is_blocking():
		near = ""
	elif p.distance_to(Surface.LIFT_POS) < Balance.LIFT_RANGE and p.y > -1.0:
		near = "lift_top"
	elif GameState.lift_stop.is_finite() and p.distance_to(GameState.lift_stop) < Balance.LIFT_RANGE + 0.8:
		near = "lift_stop"
	elif Vector2(p.x - Surface.SHACK_DOOR.x, p.z - Surface.SHACK_DOOR.z).length() < 3.6 and p.y > -1.0:
		near = "shop"
	_near = near
	match near:
		"lift_top":
			var deep := GameState.lift_stop.is_finite()
			hud.touch.set_action("Down", "%d m" % int(-GameState.lift_stop.y) if deep else "", UiTheme.LAMP_GREEN, "lift_down")
			hud.set_prompt("E: ride the lift down to %d m" % int(-GameState.lift_stop.y) if deep else "Dig a shaft first, then the lift can take you down")
		"lift_stop":
			hud.touch.set_action("Up", "to the shack", UiTheme.LAMP_GREEN, "lift_up")
			hud.set_prompt("E: ride the lift up to the shack")
		"shop":
			hud.touch.set_action("Shop", "", UiTheme.BRASS.darkened(0.1), "shop")
			hud.set_prompt("E: open the shop")
		_:
			hud.touch.set_action("")
			hud.set_prompt("")


func use_context() -> void:
	match _near:
		"lift_top":
			if not GameState.lift_stop.is_finite() or -GameState.lift_stop.y < Balance.LIFT_MIN_DEPTH:
				hud.toast("Dig a shaft first. The lift only goes as deep as you have.")
				Sound.play("cant_afford", -6.0)
				return
			ride_lift(true)
		"lift_stop":
			ride_lift(false)
		"shop":
			hud.open_shop()
			if GameState.tutorial_step < 3:
				GameState.tutorial_step = 3


func _on_shop_closed() -> void:
	GameState.save_game()
	Monetization.maybe_show_interstitial(Monetization.PLACEMENT_INTERSTITIAL)


func ride_lift(down: bool) -> void:
	if not _ride.is_empty():
		return
	var from := player.position
	var to: Vector3
	var yaw: float
	if down:
		to = GameState.lift_stop + Vector3(0, 0.05, 0)
		yaw = atan2(to.x, to.z)   # facing away from the edge, towards the middle
		var away := Vector3(-to.x, 0, -to.z)
		yaw = atan2(-away.x, -away.z) if away.length() > 0.5 else player.yaw
	else:
		to = Surface.LIFT_POS + Vector3(0.0, 0.05, -1.7)   # stepping out of the cage, towards the shack
		yaw = atan2(-(Surface.SHACK_DOOR.x - to.x), -(Surface.SHACK_DOOR.z - to.z))
	var dist := absf(to.y - from.y)
	var dur := clampf(Balance.LIFT_RIDE_MIN + dist * Balance.LIFT_RIDE_PER_M, Balance.LIFT_RIDE_MIN, Balance.LIFT_RIDE_MAX)
	_ride = {"from": from, "to": to, "yaw": yaw, "t": -0.25, "dur": dur, "down": down, "stage": 0}
	hud.riding = true
	player.digging = false
	player.velocity = Vector3.ZERO
	player.set_physics_process(false)
	Sound.play("lift_bell", -4.0)
	hud.fade_to(1.0, 0.22)
	_stream(player.position)


func _update_ride(delta: float) -> void:
	var r := _ride
	r.t = float(r.t) + delta
	var t: float = r.t
	var dur: float = r.dur
	if int(r.stage) == 0 and t >= 0.0:
		# Dark: make sure the far end is ready, then step into the moving cage.
		r.stage = 1
		var to: Vector3 = r.to
		field.ensure_loaded(field.zone_of_y(to.y))
		field.ensure_loaded(field.zone_of_y(to.y - 6.0))
		field.focus = to
		field.flush()
		_ride_cage.visible = true
		_ride_tube.visible = true
		hud.fade_to(0.0, 0.2)
		Sound.loop("lift", "lift_loop", true, -5.0)
	if int(r.stage) == 1:
		var k := clampf(t / dur, 0.0, 1.0)
		var e := k * k * (3.0 - 2.0 * k)
		var from: Vector3 = r.from
		var to: Vector3 = r.to
		var p := from.lerp(to, e)
		player.position = p
		_ride_cage.global_position = p
		_ride_tube.global_position = p
		var zi := field.zone_of_y(p.y)
		_ride_tube_mat.albedo_color = (Balance.ZONES[zi].band as Color).darkened(0.25) if p.y < -1.0 else Color(0.4, 0.3, 0.2)
		player.shake(0.06)
		var swing: Node3D = _ride_cage.get_node("Lamp")
		swing.rotation.z = sin(t * 5.0) * 0.25
		surface.sheave.rotate_x(delta * (8.0 if r.down else -8.0))
		if k >= 1.0:
			r.stage = 2
			hud.fade_to(1.0, 0.15)
			r.t2 = 0.0
	elif int(r.stage) == 2:
		r.t2 = float(r.t2) + delta
		if float(r.t2) >= 0.16:
			_ride_cage.visible = false
			_ride_tube.visible = false
			player.set_physics_process(true)
			player.teleport(r.to, r.yaw, -0.25)
			Sound.loop("lift", "lift_loop", false)
			Sound.play("lift_stop", -4.0)
			hud.fade_to(0.0, 0.25)
			hud.riding = false
			var down: bool = r.down
			_ride = {}
			if down:
				hud.toast("%d m down, in the %s" % [int(-player.position.y), str(Balance.ZONES[field.zone_of_y(player.position.y)].name).to_lower()])
			else:
				hud.toast("Back at the shack. The counter's open.")
				if GameState.tutorial_step == 2:
					GameState.tutorial_step = 3


func _build_ride_cage() -> void:
	## What you see while riding: a cage round you, a swinging lamp, and a
	## tube of rock that streams past (it moves with you, and its texture is
	## in world space, so the rock slides by).
	_ride_cage = Node3D.new()
	_ride_cage.visible = false
	add_child(_ride_cage)
	_ride_cage.add_child(Models.instance("cage"))
	var lamp := Node3D.new()
	lamp.name = "Lamp"
	lamp.position = Vector3(0, 2.55, 0)
	_ride_cage.add_child(lamp)
	var bulb := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.09
	sm.height = 0.18
	bulb.mesh = sm
	var bmat := StandardMaterial3D.new()
	bmat.albedo_color = Color(1.0, 0.85, 0.5)
	bmat.emission_enabled = true
	bmat.emission = Color(1.0, 0.8, 0.45)
	bmat.emission_energy_multiplier = 4.0
	bulb.material_override = bmat
	bulb.position = Vector3(0, -0.35, 0)
	lamp.add_child(bulb)
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.8, 0.5)
	light.light_energy = 1.6
	light.omni_range = 6.0
	light.position = Vector3(0, -0.4, 0)
	lamp.add_child(light)
	_ride_tube = MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 2.0
	cyl.bottom_radius = 2.0
	cyl.height = 14.0
	cyl.radial_segments = 16
	cyl.rings = 4
	cyl.cap_top = false
	cyl.cap_bottom = false
	cyl.flip_faces = true
	_ride_tube.mesh = cyl
	_ride_tube_mat = StandardMaterial3D.new()
	_ride_tube_mat.albedo_texture = DigField.detail_texture(Balance.WORLD_SEED)
	_ride_tube_mat.uv1_triplanar = true
	_ride_tube_mat.uv1_world_triplanar = true
	_ride_tube_mat.uv1_scale = Vector3(0.35, 0.35, 0.35)
	_ride_tube_mat.roughness = 0.95
	_ride_tube.material_override = _ride_tube_mat
	_ride_tube.visible = false
	_ride_tube.position = Vector3(0, 1.0, 0)
	add_child(_ride_tube)


func _build_lift_stop() -> void:
	## The bottom end of the lift: a timber post with a lantern, a bell and a
	## sign (Blender: art/blender/world_models.py).
	_lift_stop = Node3D.new()
	_lift_stop.visible = false
	add_child(_lift_stop)
	_lift_stop.add_child(Models.instance("liftstop"))
	_lift_stop_light = OmniLight3D.new()
	_lift_stop_light.light_color = Color(1.0, 0.75, 0.4)
	_lift_stop_light.light_energy = 1.6
	_lift_stop_light.omni_range = 7.0
	_lift_stop_light.position = Vector3(0.6, 1.8, 0)
	_lift_stop.add_child(_lift_stop_light)
	var sign := Label3D.new()
	sign.text = "Lift\nup"
	sign.font = UiTheme.display_font()
	sign.font_size = 40
	sign.outline_size = 0
	sign.modulate = Color(0.71, 0.2, 0.165)
	sign.pixel_size = 0.004
	sign.position = Vector3(0.03, 1.45, 0.1)
	sign.rotation = Vector3(0, PI / 2, 0)
	_lift_stop.add_child(sign)
	var tag := Label3D.new()
	tag.text = "Lift"
	tag.font = UiTheme.display_font()
	tag.font_size = 56
	tag.outline_size = 12
	tag.modulate = Color(0.949, 0.71, 0.267)
	tag.outline_modulate = Color(0.141, 0.11, 0.09)
	tag.pixel_size = 0.005
	tag.position = Vector3(0, 2.65, 0)
	tag.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	_lift_stop.add_child(tag)
	_place_lift_stop()


func _place_lift_stop() -> void:
	if not GameState.lift_stop.is_finite():
		_lift_stop.visible = false
		return
	_lift_stop.visible = true
	_lift_stop.position = GameState.lift_stop


# =====================================================================================
# Depth: records, the lift stop following you down, new zones
# =====================================================================================
func _update_depth() -> void:
	if not _ride.is_empty():
		return
	var d := -player.position.y
	if player.on_floor and d > 0.3:
		GameState.note_depth(d)
		var stop := GameState.lift_stop
		var inside := absf(player.position.x) < DigField.HALF and absf(player.position.z) < DigField.HALF
		if inside and (not stop.is_finite() or d > -stop.y + Balance.LIFT_STOP_STEP):
			var first := not stop.is_finite() or -stop.y < Balance.LIFT_MIN_DEPTH
			GameState.lift_stop = player.position
			_place_lift_stop()
			if d >= Balance.LIFT_MIN_DEPTH and (first or int(d) % 10 < 3):
				hud.toast("The lift now reaches %d m" % int(d))
	var z := field.zone_of_y(player.position.y)
	if z > _zone_seen:
		_zone_seen = z
		var zone: Dictionary = Balance.ZONES[z]
		var prev: Dictionary = Balance.ZONES[z - 1]
		var ratio := float(zone.hp) * float(zone.worth) / maxf(float(prev.hp) * float(prev.worth), 0.001)
		hud.big_toast(str(zone.name), "Layer %d of %d. Harder rock, worth %sx more." % [z + 1, Balance.zone_count(), Fmt.num(ratio)], zone.band)
		Sound.play("zone", -2.0)


func _update_slow() -> void:
	# The lift stop sits on the floor: if it's been dug out from under, it drops.
	if GameState.lift_stop.is_finite():
		var s := GameState.lift_stop
		if field.is_loaded(field.zone_of_y(s.y - 0.3)) and not field.solid_at(s - Vector3(0, 0.25, 0)):
			var fl := field.floor_below(s, 30.0)
			GameState.lift_stop = Vector3(s.x, fl, s.z)
			_place_lift_stop()
	# The starter pack: offered once, after a while of play.
	if not GameState.starter_offered and not GameState.owns_starter and GameState.play_time > Balance.STARTER_PACK_AFTER \
			and not hud.is_blocking() and _ride.is_empty():
		GameState.starter_offered = true
		hud.popup("Starter pack", "Once only, for new miners: %s cash and the crystal tools, which glow purple." % Fmt.num(GameState.starter_cash()),
			[["%s" % Monetization.price(Monetization.PRODUCT_STARTER), UiTheme.COPPER, func(): Monetization.buy(Monetization.PRODUCT_STARTER)],
			["No thanks", UiTheme.IRON_LIGHT, Callable()]])


# =====================================================================================
# Money from digging, floating numbers, finds
# =====================================================================================
func _on_dug(r: Dictionary) -> void:
	## Anything dug out of the rock (you, a mole, a blast) pays.
	var v := GameState.on_dug(r)
	var at: Vector3 = r.at
	if at.distance_to(player.position) < 14.0:
		_pending += v
		_pending_at = at
		if int(r.ore) > 0:
			_pending_ore = int(r.ore)


func _on_struck(_r: Dictionary, _at: Vector3, _normal: Vector3) -> void:
	_hit_glow = 0.55 if GameState.tool_def().kind in ["drill", "laser", "borer"] else 0.25


func _build_float_pool() -> void:
	for i in FLOAT_POOL:
		var l := Label3D.new()
		l.font = UiTheme.display_font()
		l.font_size = 46
		l.outline_size = 10
		l.pixel_size = 0.004
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.no_depth_test = true
		l.modulate = UiTheme.AMBER
		l.outline_modulate = Color(0.08, 0.05, 0.02)
		l.visible = false
		add_child(l)
		_floats.append({"node": l, "t": 0.0, "v": Vector3.ZERO})


func _float_text(at: Vector3, text: String, color: Color) -> void:
	var f: Dictionary = _floats[_float_i]
	_float_i = (_float_i + 1) % _floats.size()
	var l: Label3D = f.node
	l.text = text
	l.modulate = color
	l.global_position = at
	l.visible = true
	f.t = 1.1
	f.v = Vector3(randf_range(-0.2, 0.2), 1.0, randf_range(-0.2, 0.2))


func _update_floats(delta: float) -> void:
	_pending_t += delta
	if _pending_t > 0.3 and _pending > 0.0:
		_pending_t = 0.0
		var col := UiTheme.AMBER
		var text := "+" + Fmt.num(_pending)
		if _pending_ore > 0:
			col = (Balance.ORES[_pending_ore].glint as Color).lightened(0.1)
			text = "%s +%s" % [Balance.ORES[_pending_ore].name, Fmt.num(_pending)]
		_float_text(_pending_at + Vector3(0, 0.35, 0), text, col)
		_pending = 0.0
		_pending_ore = 0
	for f in _floats:
		if float(f.t) <= 0.0:
			continue
		f.t = float(f.t) - delta
		var l: Label3D = f.node
		l.global_position += (f.v as Vector3) * delta
		l.modulate.a = clampf(float(f.t) / 0.4, 0.0, 1.0)
		if float(f.t) <= 0.0:
			l.visible = false


func _on_find_exposed(f: int) -> void:
	var p := field.find_spot(f)
	var d: Dictionary = Balance.FINDS[f]
	var rc: Color = Balance.rarity(f).color
	var node := Node3D.new()
	add_child(node)
	node.global_position = p
	var l := Sprite3D.new()
	l.texture = UiTheme.icon(str(d.icon))
	l.pixel_size = 0.006
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.shaded = false
	node.add_child(l)
	var light := OmniLight3D.new()
	light.light_color = rc.lightened(0.3)
	light.light_energy = 3.0
	light.omni_range = 5.0
	node.add_child(light)
	var sparks := CPUParticles3D.new()
	sparks.amount = 40
	sparks.one_shot = true
	sparks.explosiveness = 0.9
	sparks.lifetime = 1.0
	sparks.spread = 180.0
	sparks.initial_velocity_min = 1.5
	sparks.initial_velocity_max = 3.5
	sparks.gravity = Vector3(0, -2.0, 0)
	var q := QuadMesh.new()
	q.size = Vector2(0.09, 0.09)
	var qm := StandardMaterial3D.new()
	qm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	qm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	qm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	qm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	qm.albedo_texture = UiTheme.soft_dot()
	qm.vertex_color_use_as_albedo = true
	q.material = qm
	sparks.mesh = q
	sparks.color = rc.lightened(0.4)
	node.add_child(sparks)
	sparks.emitting = true
	_pops.append({"node": node, "t": 0.0, "from": p, "light": light, "label": l, "f": f})
	var v := GameState.discover(f)
	Sound.play("find_%d" % clampi(int(d.get("rarity", 0)) / 2, 0, 2), -1.0)
	if not d.get("core", false):
		_float_text(p + Vector3(0, 0.8, 0), "+" + Fmt.num(v), rc.lightened(0.3))


func _update_pops(delta: float) -> void:
	for i in range(_pops.size() - 1, -1, -1):
		var pp: Dictionary = _pops[i]
		pp.t = float(pp.t) + delta
		var t: float = pp.t
		var node: Node3D = pp.node
		var from: Vector3 = pp.from
		if t < 1.6:
			var k := minf(t / 0.5, 1.0)
			node.global_position = from + Vector3(0, 0.7 * (1.0 - pow(1.0 - k, 3.0)), 0)
			(pp.label as Sprite3D).pixel_size = 0.006 * (0.4 + 0.6 * k + 0.08 * sin(t * 10.0))
		else:
			# Fly into your pocket.
			var k := minf((t - 1.6) / 0.45, 1.0)
			var to := player.eye_pos() + Vector3(0, -0.4, 0)
			node.global_position = (from + Vector3(0, 0.7, 0)).lerp(to, k * k)
			(pp.label as Sprite3D).pixel_size = 0.006 * (1.0 - 0.8 * k)
			(pp.light as OmniLight3D).light_energy = 3.0 * (1.0 - k)
			if k >= 1.0:
				node.queue_free()
				_pops.remove_at(i)
				Sound.play("pocket", -6.0)


func _on_won() -> void:
	if _ended_shown:
		return
	_ended_shown = true
	await get_tree().create_timer(1.6).timeout
	hud.popup("You reached the core",
		"%s straight down, through ten layers of planet.\n\nTime %s   ·   dug %s m³   ·   ore %s bits\nFinds %d of %d   ·   earned %s\n\nThe Earth is very slightly hollow now." % [
			"%d m" % int(field.depth_of_core()), Fmt.duration(GameState.won_time), Fmt.num(GameState.dug_volume),
			Fmt.num(float(GameState.ore_points)), GameState.finds_count(), Balance.FINDS.size(), Fmt.num(GameState.lifetime_money)],
		[["Keep digging", UiTheme.BRASS, Callable()],
		["Start a new hole", UiTheme.IRON_LIGHT, func():
			GameState.wipe_save()
			get_tree().reload_current_scene()]])
	Sound.play("victory", 0.0)


# =====================================================================================
# Sounds that follow what you're doing
# =====================================================================================
var _steps := 0


func _update_sounds(delta: float) -> void:
	if player.steps != _steps:
		_steps = player.steps
		var d := -player.position.y
		Sound.play("step_grass" if d < 0.5 else ("step_dirt" if d < 30.0 else "step_rock"), -14.0, 1.0, 0.1)
	if player.landed:
		player.landed = false
		if player.fall_speed > 4.0:
			Sound.play("land", clampf(-14.0 + player.fall_speed, -14.0, 0.0), 1.0, 0.08)
			player.shake(clampf(player.fall_speed * 0.03, 0.0, 0.5))
	# Metal detector: a soft ping when you're aiming close to something buried.
	_detector_t -= delta
	if player.target.hit and _detector_t <= 0.0:
		var best := INF
		for f in Balance.finds_in(field.zone_of_y(player.target.pos.y)):
			if not GameState.found[f]:
				best = minf(best, (player.target.pos as Vector3).distance_to(field.find_spot(f)))
		if best < 2.6:
			Sound.play("detector", -12.0, 1.0 + (2.6 - best) * 0.2)
			_detector_t = 0.4 + best * 0.4
		else:
			_detector_t = 0.5
	var underground := -player.position.y > 2.0
	Sound.loop("amb_surface", "amb_birds", not underground and _ride.is_empty(), -16.0)
	Sound.loop("amb_cave", "amb_cave", underground and _ride.is_empty(), -14.0)


# =====================================================================================
# First-run hints
# =====================================================================================
func _update_coach() -> void:
	var text := ""
	var touch := hud.touch_mode
	match GameState.tutorial_step:
		0:
			text = "Look down at the grass and hold Dig" if touch else "Click to look around, then hold the left mouse button to dig"
			if GameState.dug_volume > 1.5:
				GameState.tutorial_step = 1
		1:
			text = "Every scoop pays. Dig straight down: deeper rock pays more."
			if GameState.deepest > 4.0:
				GameState.tutorial_step = 2
		2:
			var cost: float = Balance.TOOLS[1].cost
			if GameState.tool_index == 0 and GameState.money >= cost:
				text = "You can afford a pickaxe. Ride the lift up to the shack." if -player.position.y > 1.0 else "You can afford a pickaxe. The counter is in the shack."
			if GameState.tool_index > 0:
				GameState.tutorial_step = 4
		3:
			if hud.shop == null and GameState.tool_index > 0:
				GameState.tutorial_step = 4
		4:
			pass
	if hud.is_blocking() or not _ride.is_empty():
		text = ""
	hud.set_coach(text)


# =====================================================================================
# Render scale (from the reference game): phones draw the 3D view smaller
# =====================================================================================
func _fit_render_scale() -> void:
	var px := Vector2(get_window().size)
	var budget := 1.2e6 if DisplayServer.is_touchscreen_available() else 2.4e6
	var s := clampf(sqrt(budget / maxf(px.x * px.y, 1.0)) * _quality, 0.4, 1.0)
	var vp := get_viewport()
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	vp.scaling_3d_scale = s


func _watch_frame_rate(delta: float) -> void:
	_fps_t += delta
	if _fps_t < 4.0:
		return
	_fps_t = 0.0
	if Time.get_ticks_msec() < 8000:
		return
	var fps := Engine.get_frames_per_second()
	var was := _quality
	if fps < 40.0:
		_quality = maxf(0.55, _quality - 0.12)
	elif fps > 57.0:
		_quality = minf(1.0, _quality + 0.05)
	if _quality != was:
		_fit_render_scale()
