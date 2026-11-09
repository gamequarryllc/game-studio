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

const FLOAT_POOL := 16
const STREAM_EVERY := 0.25

var field: DigField
var surface: Surface
var player: Player
var helpers: HelperCrew
var hud: Hud
var force_dig := false         # tests and screenshots: holds Dig
var bot_move := Vector2.ZERO   # the playthrough bot's walk stick (added to the keys and the touch stick)

var _env: Environment
var _sun: DirectionalLight3D
var _vm_sun: DirectionalLight3D   # the same sun for the tool in your hands (its camera only draws the viewmodel layer)
var _lift_stop: Node3D
var _lift_stop_light: OmniLight3D
var _lift_stop_tag: Label3D       # the floating "Lift" over the lamp post (hidden up close, where it would fill the view)
var _ride: Dictionary = {}     # the lift ride in progress
var _ride_cage: Node3D
var _ride_tube: MeshInstance3D
var _ride_props: Node3D
var _ride_flash: OmniLight3D
var _ride_lamps: Array = []
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
var _bounce_col := Color(0.3, 0.35, 0.45)
var _clods: MultiMeshInstance3D   # dirt thrown up round a hole dug in the field
var _clod_n := 0
var _spoil: Node3D                # the heap of dirt from your first hole
const CLODS_MAX := 110
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
		player.look_at_point(Surface.SPAWN_LOOK)   # the composed spawn view
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
	_build_clods()

	hud = Hud.new()
	hud.player = player
	add_child(hud)
	hud.shop_closed.connect(_on_shop_closed)
	GameState.won.connect(_on_won)
	_zone_seen = GameState.deepest_zone()

	get_window().size_changed.connect(_fit_render_scale)
	_fit_render_scale()
	# Phone first: the touch controls and touch wording until a mouse click or
	# a walking key says otherwise.
	hud.set_touch_mode(true)
	_update_env(1.0)


func is_riding() -> bool:
	return not _ride.is_empty()


func near() -> String:
	## What the context button would do here: "lift_top", "lift_stop", "shop" or "".
	return _near


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
	GameState.lift_spot = at
	GameState.lift_stop = lift_stop_spot(at, 0.0)
	_place_lift_stop()
	move_player(at, 0.0, -0.3)


# =====================================================================================
# Environment: sunny on top, dark underground
# =====================================================================================
func _build_environment() -> void:
	## Late afternoon on top: a low warm sun with long shadows, a cool sky fill
	## and a warm haze that fades the hills. Underground the same environment
	## turns into a zone-tinted dark (see _update_env).
	_env = Environment.new()
	_env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = SKY_TOP
	sm.sky_horizon_color = SKY_HORIZON
	sm.sky_curve = 0.12
	sm.ground_bottom_color = Color(0.22, 0.2, 0.15)
	sm.ground_horizon_color = Color(0.7, 0.6, 0.45)
	sm.sun_angle_max = 24.0
	sm.sun_curve = 0.08
	sky.sky_material = sm
	_env.sky = sky
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = SURFACE_AMBIENT
	_env.ambient_light_energy = 0.55
	_env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	_env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	_env.tonemap_white = 6.0
	_env.fog_enabled = true
	_env.fog_mode = Environment.FOG_MODE_DEPTH
	_env.fog_light_color = SURFACE_HAZE
	_env.fog_density = SURFACE_FOG
	_env.fog_depth_begin = SURFACE_FOG_BEGIN
	_env.fog_depth_end = SURFACE_FOG_END
	_env.fog_depth_curve = 1.0
	_env.fog_sky_affect = 0.0
	var we := WorldEnvironment.new()
	we.environment = _env
	add_child(we)
	_sun = DirectionalLight3D.new()
	# Low in the west-south-west, behind the spawn view's left shoulder.
	_sun.rotation = Vector3(deg_to_rad(-19.0), deg_to_rad(-118.0), 0.0)
	_sun.light_color = SUN_COLOR
	_sun.light_energy = SUN_ENERGY
	_sun.shadow_enabled = true
	_sun.shadow_bias = 0.04
	_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	_sun.directional_shadow_max_distance = 70.0
	add_child(_sun)
	_vm_sun = DirectionalLight3D.new()
	_vm_sun.rotation = _sun.rotation
	_vm_sun.light_color = SUN_COLOR
	_vm_sun.light_energy = SUN_ENERGY
	_vm_sun.shadow_enabled = false
	_vm_sun.layers = Player.VIEWMODEL_LAYER
	add_child(_vm_sun)


const SKY_TOP := Color(0.42, 0.52, 0.64)
const SKY_HORIZON := Color(0.95, 0.8, 0.6)
const SURFACE_AMBIENT := Color(0.56, 0.65, 0.78)   # cool sky fill (#8EA6C8)
const SURFACE_HAZE := Color(0.86, 0.74, 0.58)
const SURFACE_FOG := 0.62                         # depth fog: how far the far hills fade into the haze
const SURFACE_FOG_BEGIN := 22.0
const SURFACE_FOG_END := 190.0
const SUN_COLOR := Color(1.0, 0.83, 0.6)           # warm key (#FFD39A)
const SUN_ENERGY := 1.25
const LAMP_FALLOFF := 8.0                          # metres to near-black with the stock headlamp


func _update_env(blend: float) -> void:
	## Fades from the sunny field to the dark of the shaft as you go down.
	## Down there the headlamp's warm pool falls off into the layer's own dark
	## (DigField.STYLE fog) by about 8 m (further with the Headlamp Range
	## upgrade); a cool fill (ambient, and the rock shader's bounce near you)
	## keeps the shadows readable and the pool's edge soft.
	var d := maxf(0.0, -player.position.y)
	var under := smoothstep(0.5, 9.0, d)
	var zi := field.zone_of_y(player.position.y)
	var st: Dictionary = DigField.STYLE[zi]
	var fog: Color = st.fog
	var fill: Color = st.fill
	var amb := SURFACE_AMBIENT.lerp(fill, under)
	_env.ambient_light_color = _env.ambient_light_color.lerp(amb, blend)
	_env.ambient_light_energy = lerpf(0.55, 0.32, under)
	_env.fog_light_color = _env.fog_light_color.lerp(SURFACE_HAZE.lerp(fog, under), blend)
	# Depth fog: clear for the first couple of metres, the layer's own dark by
	# the lamp's reach.
	var reach := LAMP_FALLOFF * sqrt(GameState.upgrade_mult("lamp"))
	_env.fog_density = lerpf(SURFACE_FOG, 0.96, under)
	_env.fog_depth_begin = lerpf(SURFACE_FOG_BEGIN, 1.8, under)
	_env.fog_depth_end = lerpf(SURFACE_FOG_END, reach * 1.15, under)
	_env.fog_depth_curve = lerpf(1.0, 0.75, under)
	_sun.light_energy = lerpf(SUN_ENERGY, 0.0, smoothstep(0.0, 7.0, d))
	_sun.visible = _sun.light_energy > 0.01
	_vm_sun.light_energy = _sun.light_energy * 0.85
	_vm_sun.visible = _sun.visible
	_sun.shadow_enabled = d < 4.0
	_bounce_col = _bounce_col.lerp(fill, blend)
	var bc := Vector3(_bounce_col.r, _bounce_col.g, _bounce_col.b)
	for m in [field.material] + field.decor_mats.values():
		(m as ShaderMaterial).set_shader_parameter("bounce", under * 0.6)
		(m as ShaderMaterial).set_shader_parameter("bounce_color", bc)
	player.sync_viewmodel(_env)


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
	_update_lift_tag()
	_update_sounds(delta)
	_hit_glow = move_toward(_hit_glow, 0.0, delta * 3.0)
	if player.target.hit:
		field.material.set_shader_parameter("hit_pos", player.target.pos)
	field.material.set_shader_parameter("hit_amount", _hit_glow)
	field.material.set_shader_parameter("hit_radius", GameState.tool_radius() * 0.4)
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
	mv += bot_move
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
		if hud.touch_mode and event.physical_keycode in [KEY_W, KEY_A, KEY_S, KEY_D, KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT]:
			hud.set_touch_mode(false)   # someone's at a keyboard
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
			hud.set_prompt("Ride the lift down to %d m" % int(-GameState.lift_stop.y) if deep else "Dig a shaft first, then the lift can take you down")
		"lift_stop":
			hud.touch.set_action("Up", "to the shack", UiTheme.LAMP_GREEN, "lift_up")
			hud.set_prompt("Ride the lift up to the shack")
		"shop":
			hud.touch.set_action("Shop", "", UiTheme.BRASS.darkened(0.1), "shop")
			hud.set_prompt("Open the shop")
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
	hud._sync_touch()


func ride_lift(down: bool) -> void:
	if not _ride.is_empty():
		return
	var from := player.position
	var to: Vector3
	var yaw: float
	if down:
		to = lift_arrival() + Vector3(0, 0.05, 0)
		# Facing away from the lamp post, into the shaft.
		var away := to - GameState.lift_stop
		away.y = 0.0
		yaw = atan2(-away.x, -away.z) if away.length() > 0.2 else player.yaw
	else:
		to = Surface.LIFT_EXIT + Vector3(0.0, 0.05, 0.0)   # stepping out of the cage, towards the site and the shack
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
		_ride_props.visible = true
		_dress_ride(r.from, r.to)
		# Face the open side of the cage, looking a little along the way
		# you're going, so the walls, sets and signs slide through view.
		player.set_view(PI * 0.25, -0.42 if bool(r.down) else 0.5)
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
		_ride_tube.global_position = p + Vector3(0, 1.0, 0)
		# The nearest set lamp flashes by.
		var best := 99.0
		for lp in _ride_lamps:
			var dd: float = absf((lp as Vector3).y - (p.y + 1.6))
			if dd < best:
				best = dd
				_ride_flash.global_position = lp
		_ride_flash.light_energy = clampf(1.0 - best / 2.0, 0.0, 1.0) * 1.6
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
			_ride_props.visible = false
			_ride_flash.light_energy = 0.0
			for c in _ride_props.get_children():
				if c != _ride_flash:
					c.queue_free()
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
	## What you see while riding: the cage round you with its swinging lamp
	## and the cable overhead, and a shaft that streams past: rock walls in
	## each layer's colour (world-space, so they slide by), timber sets every
	## few metres, a lamp now and then, and an enamel sign at each new layer.
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
	light.light_color = Color(1.0, 0.76, 0.45)
	light.light_energy = 1.4
	light.omni_range = 5.0
	light.position = Vector3(0, -0.4, 0)
	light.layers = 1 | Player.VIEWMODEL_LAYER
	lamp.add_child(light)
	# The cable, rising out of sight.
	var cable := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.025
	cm.bottom_radius = 0.025
	cm.height = 30.0
	cm.radial_segments = 6
	cable.mesh = cm
	cable.material_override = Models.flat(Color(0.2, 0.18, 0.16), 0.5, 0.5)
	cable.position = Vector3(0, 3.0 + 15.0, 0)
	_ride_cage.add_child(cable)
	_ride_tube = MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 3.1
	cyl.bottom_radius = 3.1
	cyl.height = 26.0
	cyl.radial_segments = 18
	cyl.rings = 6
	cyl.cap_top = false
	cyl.cap_bottom = false
	cyl.flip_faces = true
	_ride_tube.mesh = cyl
	var tm := ShaderMaterial.new()
	tm.shader = load("res://shaders/ride_shaft.gdshader")
	tm.set_shader_parameter("paint_tex", load("res://textures/rock_paint.png"))
	tm.set_shader_parameter("strata_tex", DigField.strata_texture())
	var zimg := Image.create(Balance.zone_count(), 1, false, Image.FORMAT_RGB8)
	for z in Balance.zone_count():
		zimg.set_pixel(z, 0, Balance.MATERIALS[int(Balance.ZONES[z].mats[0])].color)
	tm.set_shader_parameter("zone_tex", ImageTexture.create_from_image(zimg))
	var gimg := Image.create(Balance.zone_count(), 1, false, Image.FORMAT_RGB8)
	for z in Balance.zone_count():
		var g := float(Balance.MATERIALS[int(Balance.ZONES[z].mats[0])].get("glow", 0.0))
		gimg.set_pixel(z, 0, Color(g, g, g))
	tm.set_shader_parameter("glow_tex", ImageTexture.create_from_image(gimg))
	tm.set_shader_parameter("zones", float(Balance.zone_count()))
	tm.set_shader_parameter("zone_depth", Balance.ZONE_DEPTH)
	_ride_tube.material_override = tm
	_ride_tube.visible = false
	_ride_tube.position = Vector3(0, 1.0, 0)
	add_child(_ride_tube)
	_ride_props = Node3D.new()
	add_child(_ride_props)
	_ride_flash = OmniLight3D.new()
	_ride_flash.light_color = Color(1.0, 0.74, 0.42)
	_ride_flash.light_energy = 0.0
	_ride_flash.omni_range = 4.0
	_ride_flash.layers = 1 | Player.VIEWMODEL_LAYER
	_ride_props.add_child(_ride_flash)


func _dress_ride(from: Vector3, to: Vector3) -> void:
	## Timber sets, lamps and layer signs along the stretch of shaft the ride
	## covers (freed when it's over).
	for c in _ride_props.get_children():
		if c != _ride_flash:
			c.queue_free()
	_ride_lamps = []
	var top := maxf(from.y, to.y) + 4.0
	var bottom := minf(from.y, to.y) - 4.0
	var span := top - bottom
	var mesh := DigField.decor_mesh("timber_set")
	var xfs: Array = []
	var y := top
	var i := 0
	while y > bottom:
		var t := clampf((from.y - y) / maxf(from.y - to.y, 0.001), 0.0, 1.0) if from.y != to.y else 0.0
		var p := from.lerp(to, t)
		p.y = y
		xfs.append(Transform3D(Basis(Vector3.UP, float(i % 4) * PI * 0.5).scaled(Vector3(1.3, 1.0, 1.3)), p + Vector3(0, 0.5, 0)))
		if i % 2 == 1:
			_ride_lamps.append(p + Vector3(-1.25, 1.4, -1.25) if i % 4 == 1 else p + Vector3(1.6, 1.4, 0.0))
		y -= 3.0
		i += 1
	if mesh != null and not xfs.is_empty():
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = mesh
		mm.instance_count = xfs.size()
		for k in xfs.size():
			mm.set_instance_transform(k, xfs[k])
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		_ride_props.add_child(mi)
	# Lamps on the sets: little glowing boxes (one moving light does the flashes).
	var lm := Models.flat(Color(1.0, 0.82, 0.5), 0.3, 0.0, 3.0)
	for lp in _ride_lamps:
		var b := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.12, 0.18, 0.12)
		b.mesh = bm
		b.material_override = lm
		b.position = lp
		_ride_props.add_child(b)
	# Each layer's own things on the walls as they slide past (roots up top,
	# shells, bones, crystals, magma vents), and its landmark set back in a
	# niche with its own light: something to look at on the way down.
	var zone_lo := field.zone_of_y(top)
	var zone_hi := field.zone_of_y(bottom)
	var rng := RandomNumberGenerator.new()
	rng.seed = 77
	for z in range(zone_lo, zone_hi + 1):
		var y0 := minf(top, field.zone_top(z))
		var y1 := maxf(bottom, field.zone_floor(z))
		if y0 - y1 < 1.0:
			continue
		var zd: Array = DigField.ZONE_DECOR.get(z, [])
		var model := str(zd[0]) if not zd.is_empty() else "pebble"
		var dm := DigField.decor_mesh(model)
		var cols: Array = zd[3] if not zd.is_empty() else [Color(0.5, 0.45, 0.4)]
		if dm != null:
			var n := int(clampf((y0 - y1) * 4.0, 8.0, 120.0))
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.use_colors = true
			mm.mesh = dm
			mm.instance_count = n
			for k in n:
				var yy := rng.randf_range(y1, y0)
				var t := clampf((from.y - yy) / maxf(from.y - to.y, 0.001), 0.0, 1.0) if from.y != to.y else 0.0
				var c := from.lerp(to, t)
				var ang := rng.randf() * TAU
				var nr := Vector3(-cos(ang), 0.0, -sin(ang))
				var at := Vector3(c.x + cos(ang) * 3.05, yy, c.z + sin(ang) * 3.05)
				var s := rng.randf_range(2.0, 3.6)
				mm.set_instance_transform(k, DigField._decor_xf(at, nr, rng.randf() * TAU, s, 0.02))
				mm.set_instance_color(k, cols[k % cols.size()])
			var mi := MultiMeshInstance3D.new()
			mi.multimesh = mm
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			if not zd.is_empty() and str(zd[4]) != "":
				mi.material_override = field._decor_mat(str(zd[4]))
			elif zd.is_empty():
				mi.material_override = field._decor_mat("matte")
			_ride_props.add_child(mi)
		if DigField.LANDMARKS.has(z):
			var d: Dictionary = DigField.LANDMARKS[z]
			var ly := (y0 + y1) * 0.5
			var t := clampf((from.y - ly) / maxf(from.y - to.y, 0.001), 0.0, 1.0) if from.y != to.y else 0.0
			var c := from.lerp(to, t)
			var mark := Models.instance(str(d.model))
			mark.scale = Vector3.ONE * float(d.get("scale", 1.0))
			mark.position = Vector3(c.x - 1.9, ly - 1.2, c.z - 1.9)
			mark.rotation = Vector3(0.0, float(z) * 1.3, 0.0)
			DigField.dress_landmark(mark, str(d.get("melt", "lava")))
			_ride_props.add_child(mark)
			if d.has("light"):
				var ll := OmniLight3D.new()
				ll.light_color = d.light
				ll.light_energy = float(d.energy) * 0.8
				ll.omni_range = 5.0
				ll.position = mark.position + Vector3(0.6, 1.0, 0.0)
				ll.layers = 1 | Player.VIEWMODEL_LAYER
				_ride_props.add_child(ll)
	# A sign at the top of each layer you pass.
	for z in range(1, Balance.zone_count()):
		var zy := -z * Balance.ZONE_DEPTH
		if zy > top or zy < bottom:
			continue
		var t := clampf((from.y - zy) / maxf(from.y - to.y, 0.001), 0.0, 1.0)
		var p := from.lerp(to, t)
		var plate := Models.sign("res://textures/signs/layers.png", Vector2(1.3, 0.375), 0.3, z, Balance.zone_count())
		plate.position = Vector3(p.x - 2.57, zy + 1.6, p.z - 0.6)
		plate.rotation = Vector3(0, PI * 0.5, 0)
		_ride_props.add_child(plate)


func _build_lift_stop() -> void:
	## The bottom end of the lift: a timber post with a lantern, a bell and an
	## enamel plate (Blender: art/blender/world_models.py).
	_lift_stop = Node3D.new()
	_lift_stop.visible = false
	add_child(_lift_stop)
	_lift_stop.add_child(Models.instance("liftstop"))
	_lift_stop_light = OmniLight3D.new()
	_lift_stop_light.light_color = Color(1.0, 0.72, 0.4)
	_lift_stop_light.light_energy = 0.7
	_lift_stop_light.omni_range = 4.5
	_lift_stop_light.position = Vector3(0.6, 1.8, 0)
	_lift_stop_light.layers = 1 | Player.VIEWMODEL_LAYER
	_lift_stop.add_child(_lift_stop_light)
	var plate := Models.sign("res://textures/signs/liftup.png", Vector2(0.46, 0.26), 0.2)
	plate.position = Vector3(0.117, 1.42, 0.0)
	plate.rotation = Vector3(0, PI / 2, 0)
	_lift_stop.add_child(plate)
	var tag := Label3D.new()
	tag.text = "Lift"
	tag.font = UiTheme.bold_font()
	tag.font_size = 30
	tag.outline_size = 8
	tag.modulate = Color(0.949, 0.71, 0.267)
	tag.outline_modulate = Color(0.141, 0.11, 0.09)
	tag.fixed_size = true
	tag.pixel_size = 0.0009
	tag.no_depth_test = false
	tag.position = Vector3(0, 2.65, 0)
	tag.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	_lift_stop.add_child(tag)
	_lift_stop_tag = tag
	_place_lift_stop()


func lift_stop_spot(p: Vector3, facing: float) -> Vector3:
	## Where the lamp post goes when the lift stop follows you down: a step
	## behind you (or to a side), in open space, on the floor. Never right
	## where you stand, so it can't end up in front of your eyes.
	var back := Vector3(sin(facing), 0.0, cos(facing))
	var dirs := [back, back.rotated(Vector3.UP, PI * 0.5), back.rotated(Vector3.UP, -PI * 0.5),
		back.rotated(Vector3.UP, PI * 0.25), back.rotated(Vector3.UP, -PI * 0.25), -back]
	for dist in [1.1, 0.85, 0.65]:
		for dv in dirs:
			var c: Vector3 = p + (dv as Vector3) * float(dist)
			c.x = clampf(c.x, -DigField.HALF + 0.35, DigField.HALF - 0.35)
			c.z = clampf(c.z, -DigField.HALF + 0.35, DigField.HALF - 0.35)
			if field.solid_at(c + Vector3(0, 0.6, 0)) or field.solid_at(c + Vector3(0, 1.5, 0)) or field.solid_at(c + Vector3(0, 2.2, 0)):
				continue
			var fl := field.floor_below(c + Vector3(0, 1.0, 0), 3.0)
			if absf(fl - p.y) > 1.0:
				continue
			return Vector3(c.x, fl, c.z)
	return p + back * 0.6


func lift_arrival() -> Vector3:
	## Where the lift sets you down: the spot you stood on, on today's floor,
	## and always beside the lift stop (if the stop has fallen further down
	## the shaft since, you're set down next to it, not dropped from above).
	var stop := GameState.lift_stop
	var s := GameState.lift_spot if GameState.lift_spot.is_finite() else stop
	# The far end's rock must be there before working out where you land.
	if stop.is_finite():
		field.ensure_loaded(field.zone_of_y(stop.y - 0.3))
	field.ensure_loaded(field.zone_of_y(s.y - 0.3))
	field.flush()
	var fl := field.floor_below(s + Vector3(0, 1.2, 0), 300.0)
	if stop.is_finite() and absf(fl - stop.y) > 2.0:
		return _beside(stop, Vector3(s.x, fl, s.z))
	return Vector3(s.x, fl, s.z)


func _beside(stop: Vector3, fallback: Vector3) -> Vector3:
	## Open floor a step from the lamp post, where your whole body fits (not
	## touching the walls of a narrow pit, or you'd be pushed up out of it).
	for dist in [0.7, 0.5, 0.95]:
		for k in 8:
			var a := float(k) * PI * 0.25
			var c: Vector3 = stop + Vector3(cos(a), 0.0, sin(a)) * float(dist)
			c.x = clampf(c.x, -DigField.HALF + 0.35, DigField.HALF - 0.35)
			c.z = clampf(c.z, -DigField.HALF + 0.35, DigField.HALF - 0.35)
			if field.solid_at(c + Vector3(0, 0.6, 0)) or field.solid_at(c + Vector3(0, 1.5, 0)):
				continue
			var fl := field.floor_below(c + Vector3(0, 1.0, 0), 3.0)
			if absf(fl - stop.y) > 1.0:
				continue
			var at := Vector3(c.x, fl + 0.05, c.z)
			if player.collides(at):
				continue
			return Vector3(c.x, fl, c.z)
	if not player.collides(stop + Vector3(0, 0.05, 0)):
		return stop
	return fallback


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
			GameState.lift_spot = player.position
			GameState.lift_stop = lift_stop_spot(player.position, player.yaw)
			_place_lift_stop()
			if d >= Balance.LIFT_MIN_DEPTH and (first or int(d) % 10 < 3):
				hud.toast("The lift now reaches %d m" % int(d))
	var z := field.zone_of_y(player.position.y)
	if z > _zone_seen:
		_zone_seen = z
		var zone: Dictionary = Balance.ZONES[z]
		hud.big_toast(str(zone.name), str(Balance.ZONE_LINES[z]), zone.band)
		Sound.play("zone", -2.0)


func _update_lift_tag() -> void:
	if _lift_stop_tag != null and _lift_stop.visible:
		var dd := player.eye_pos().distance_to(_lift_stop_tag.global_position)
		_lift_stop_tag.visible = dd > 2.4 and dd < 16.0


func _update_slow() -> void:
	field.settle_landmarks()
	_place_spoil()
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
func _build_clods() -> void:
	## Digging into the field throws clods of dirt and turf onto the grass
	## round the hole, and the first hole's dirt goes on a spoil heap beside it.
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = DigField.decor_mesh("pebble")
	mm.instance_count = CLODS_MAX
	mm.visible_instance_count = 0
	_clods = MultiMeshInstance3D.new()
	_clods.multimesh = mm
	_clods.material_override = field._decor_mat("matte")
	_clods.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(_clods)
	_spoil = Models.instance("spoil_heap")
	_spoil.visible = false
	add_child(_spoil)
	_place_spoil()


func _throw_clods(at: Vector3) -> void:
	if _clod_n >= CLODS_MAX:
		return
	for k in 2:
		var a := randf() * TAU
		var rr := randf_range(0.9, 1.9)
		var p := Vector3(at.x + cos(a) * rr, 0.0, at.z + sin(a) * rr)
		if absf(p.x) > DigField.HALF - 0.3 or absf(p.z) > DigField.HALF - 0.3:
			continue
		if not field.solid_at(p + Vector3(0, -0.2, 0)) or field.solid_at(p + Vector3(0, 0.15, 0)):
			continue
		var fl := field.floor_below(p + Vector3(0, 0.5, 0), 1.5)
		var sc := randf_range(1.6, 3.0)
		var xf := Transform3D(Basis(Vector3.UP, randf() * TAU).scaled(Vector3(sc, sc * 0.8, sc)), Vector3(p.x, fl, p.z))
		var c := Color(0.52, 0.37, 0.23) * randf_range(0.8, 1.1)
		if randf() < 0.3:
			c = Color(0.42, 0.46, 0.22)   # a bit of turf
		_clods.multimesh.set_instance_transform(_clod_n, xf)
		_clods.multimesh.set_instance_color(_clod_n, Color(c.r, c.g, c.b, 1.0))
		_clod_n += 1
		_clods.multimesh.visible_instance_count = _clod_n
		if _clod_n >= CLODS_MAX:
			return
	if not GameState.spoil_at.is_finite():
		# The first hole: heap its dirt a couple of metres off, on grass.
		for k in 8:
			var a := float(k) * PI * 0.25 + 0.4
			var p := Vector3(at.x + cos(a) * 2.6, 0.0, at.z + sin(a) * 2.6)
			if absf(p.x) > DigField.HALF - 1.0 or absf(p.z) > DigField.HALF - 1.0:
				continue
			if field.solid_at(p + Vector3(0, -0.3, 0)) and not field.solid_at(p + Vector3(0, 0.2, 0)):
				GameState.spoil_at = Vector3(p.x, field.floor_below(p + Vector3(0, 0.5, 0), 1.5), p.z)
				_place_spoil()
				return


func _place_spoil() -> void:
	## The heap grows with how much you've dug out near the top, and goes if
	## you dig the ground out from under it.
	if _spoil == null or not GameState.spoil_at.is_finite():
		if _spoil != null:
			_spoil.visible = false
		return
	var s := GameState.spoil_at
	_spoil.visible = field.solid_at(s + Vector3(0, -0.25, 0))
	_spoil.position = s + Vector3(0, -0.05, 0)
	_spoil.rotation.y = s.x * 1.7
	_spoil.scale = Vector3.ONE * clampf(0.28 + GameState.dug_volume / 40.0, 0.28, 0.7)


func _on_dug(r: Dictionary) -> void:
	## Anything dug out of the rock (you, a mole, a blast) pays.
	var v := GameState.on_dug(r)
	var at: Vector3 = r.at
	if at.y > -2.2 and at.distance_to(player.position) < 5.0 and float(r.get("volume", 0.0)) > 0.0:
		_throw_clods(at)
	if at.distance_to(player.position) < 14.0:
		_pending += v
		_pending_at = at
		if int(r.ore) > 0:
			_pending_ore = int(r.ore)


func _on_struck(_r: Dictionary, _at: Vector3, _normal: Vector3) -> void:
	_hit_glow = 0.32 if GameState.tool_def().kind in ["drill", "laser", "borer"] else 0.16


func _build_float_pool() -> void:
	## Money popping off the rock: small Zilla Slab numbers in the colour of
	## what you dug, a fixed size on screen, hidden by rock in front of them
	## (depth tested, placed a little out from the wall towards you). While you
	## keep digging the newest one keeps counting up instead of a new one
	## popping every strike.
	for i in FLOAT_POOL:
		var l := Label3D.new()
		l.font = UiTheme.bold_font()
		l.font_size = 30
		l.outline_size = 8
		l.fixed_size = true
		l.pixel_size = 0.0009
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.no_depth_test = false
		l.render_priority = 2
		l.modulate = UiTheme.AMBER
		l.outline_modulate = Color(0.08, 0.05, 0.02)
		l.visible = false
		add_child(l)
		_floats.append({"node": l, "t": 0.0, "v": Vector3.ZERO, "sum": 0.0, "age": 0.0})


func _float_text(at: Vector3, text: String, color: Color, value: float = -1.0) -> void:
	# Out from the wall towards your eye, so the rock it came from doesn't hide it.
	var eye := player.eye_pos()
	var p := at + (eye - at).normalized() * minf(0.45, at.distance_to(eye) * 0.3)
	# Keep counting on the newest number while it's fresh.
	var last: Dictionary = _floats[(_float_i - 1 + _floats.size()) % _floats.size()]
	if value >= 0.0 and float(last.t) > 0.0 and float(last.age) < 0.7 and float(last.sum) >= 0.0 \
			and _same_hue((last.node as Label3D).modulate, color) and (last.node as Label3D).global_position.distance_to(p) < 1.5:
		last.sum = float(last.sum) + value
		(last.node as Label3D).text = "+" + Fmt.num(float(last.sum))
		last.t = maxf(float(last.t), 0.9)
		return
	var f: Dictionary = _floats[_float_i]
	_float_i = (_float_i + 1) % _floats.size()
	var l: Label3D = f.node
	l.text = text
	l.modulate = color
	l.global_position = p
	l.visible = true
	f.t = 1.1
	f.age = 0.0
	f.sum = value
	f.v = Vector3(randf_range(-0.1, 0.1), 0.55, randf_range(-0.1, 0.1))


static func _same_hue(a: Color, b: Color) -> bool:
	return absf(a.r - b.r) + absf(a.g - b.g) + absf(a.b - b.b) < 0.02


func _update_floats(delta: float) -> void:
	_pending_t += delta
	if _pending_t > 0.25 and _pending > 0.0:
		_pending_t = 0.0
		var col := UiTheme.AMBER
		if _pending_ore > 0:
			col = (Balance.ORES[_pending_ore].glint as Color).lightened(0.1)
		_float_text(_pending_at, "+" + Fmt.num(_pending), col, _pending)
		_pending = 0.0
		_pending_ore = 0
	for f in _floats:
		if float(f.t) <= 0.0:
			continue
		f.t = float(f.t) - delta
		f.age = float(f.age) + delta
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
	# The find itself (art/blender/finds.py), popping out and turning.
	var l := Models.instance("find_" + str(d.icon)) if ResourceLoader.exists("res://models/find_%s.glb" % d.icon) else Node3D.new()
	l.scale = Vector3.ONE * 0.3
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
		_float_text(p + Vector3(0, 0.8, 0), "+" + Fmt.num(v), rc.lightened(0.3), -1.0)


func _update_pops(delta: float) -> void:
	for i in range(_pops.size() - 1, -1, -1):
		var pp: Dictionary = _pops[i]
		pp.t = float(pp.t) + delta
		var t: float = pp.t
		var node: Node3D = pp.node
		var from: Vector3 = pp.from
		var model: Node3D = pp.label
		if t < 1.6:
			# Pop up out of the rock with a little overshoot, turning slowly.
			var k := minf(t / 0.5, 1.0)
			node.global_position = from + Vector3(0, 0.7 * (1.0 - pow(1.0 - k, 3.0)), 0)
			var pop := 1.0 + 0.25 * sin(minf(t / 0.35, 1.0) * PI)
			model.scale = Vector3.ONE * (0.3 + 0.7 * k) * pop
			model.rotation.y = t * 2.2
		else:
			# Fly towards your pocket, shrinking away before it reaches the lens.
			var k := minf((t - 1.6) / 0.45, 1.0)
			var eye := player.eye_pos()
			var start := from + Vector3(0, 0.7, 0)
			var to := eye + (start - eye).normalized() * 0.9 + Vector3(0, -0.45, 0)
			node.global_position = start.lerp(to, k * k)
			model.scale = Vector3.ONE * maxf(0.001, 1.0 - k)
			model.rotation.y += delta * 9.0
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
	if player != null:
		player.sync_viewmodel(_env, s)


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
