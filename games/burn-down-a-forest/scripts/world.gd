class_name World
extends Node3D
## The cursed valley. Builds the sky, the forest (ForestGrid + ForestView), the
## fire-keeper, helpers, critters and the HUD in code, then runs the loop: the
## fire ticks, embers come in, floating numbers rise off the big fires, the
## wind shifts now and then, first-run hints, the starter pack offer, the ending.

const SPAWN := Vector3(-0.6, 0.0, 52.4)
const SPAWN_YAW := 0.0
const SPAWN_PITCH := -0.58           # low enough to see the path lead into the woods and the moon over them
const AMBIENT_COLD := Color("#776DA2")    # cursed night
const AMBIENT_WARM := Color("#A3967E")    # the valley healing as the meadow spreads
const FLOAT_POOL := 20

var forest: ForestGrid
var view: ForestView
var keeper: Keeper
var helpers: HelperSwarm
var critters: Critters
var hud: Hud
var env: Environment
var moon: DirectionalLight3D
var force_fire := false              # tests and screenshots hold the button down

var _mouse_fire := false
var _quality := 1.0
var _fps_t := 0.0
var _float_t := 0.0
var _slow_t := 0.0
var _floats: Array = []
var _float_i := 0
var _last_tick := -1
var _wind_t := 40.0
var _wind_target := 0.0
var _wind_angle := 0.0
var _coach_t := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	UiTheme.install_fonts()
	_rng.randomize()
	_build_environment()
	forest = ForestGrid.new()
	forest.generate(Balance.WORLD_SEED)
	_wind_angle = atan2(forest.wind.y, forest.wind.x)
	_wind_target = _wind_angle
	if GameState.forest_save != "":
		forest.load_save_string(GameState.forest_save)
	GameState.forest = forest
	view = ForestView.new()
	add_child(view)
	view.build(forest)
	view.show_loaded_state()
	view.set_wind(forest.wind * forest.wind_strength)

	keeper = Keeper.new()
	keeper.grid = forest
	keeper.bounds = Rect2(forest.origin + Vector2(1.5, 1.5), Vector2(forest.n, forest.n) * Balance.CELL - Vector2(3, 3))
	var pos := GameState.keeper_pos if GameState.keeper_pos.is_finite() else SPAWN
	pos.y = forest.height_at(pos.x, pos.z)
	keeper.position = pos
	add_child(keeper)
	if GameState.keeper_pos.is_finite():
		keeper.set_view(GameState.keeper_yaw, GameState.cam_pitch)
	else:
		keeper.set_view(SPAWN_YAW, SPAWN_PITCH)
	GameState.keeper = keeper

	helpers = HelperSwarm.new()
	helpers.grid = forest
	helpers.keeper = keeper
	add_child(helpers)
	critters = Critters.new()
	critters.grid = forest
	add_child(critters)
	critters.golden_found.connect(_on_golden)
	critters.saved.connect(func(_icon): Sound.play("critter_pop", -12.0, 1.0, 0.15, 0.3))

	hud = Hud.new()
	hud.keeper = keeper
	hud.forest = forest
	add_child(hud)
	hud.notebook_closed.connect(func(): Monetization.maybe_show_interstitial(Monetization.PLACEMENT_INTERSTITIAL))
	GameState.tool_bought.connect(func(i: int):
		Sound.play("reward", -4.0)
		hud.toast("The %s. It lights %s." % [str(Balance.TOOLS[i].name).to_lower(), Balance.TOOLS[i].lights]))
	GameState.won.connect(_on_won)
	_build_float_pool()
	get_window().size_changed.connect(_fit_render_scale)
	_fit_render_scale()


func _exit_tree() -> void:
	if GameState.forest == forest:
		GameState.save_game()
		GameState.forest = null
		GameState.keeper = null
	Models.clear_cache()


# =====================================================================================
# Sky and light
# =====================================================================================
func _build_environment() -> void:
	## Night in the cursed valley: cool moonlight from the upper left (as seen
	## from the village), a plum sky with a pale moon, plum fog for depth. The
	## fire is the only warm light. Linear tonemapping and no bloom, so every
	## colour lands where the art bible puts it and a fire never goes white.
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("#1B1430")
	sky_mat.sky_horizon_color = Color("#5E4C74")
	sky_mat.sky_curve = 0.18
	sky_mat.ground_bottom_color = Color("#120D18")
	sky_mat.ground_horizon_color = Color("#3A2E4A")
	sky_mat.sun_angle_max = 2.2
	sky_mat.sun_curve = 0.02
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = AMBIENT_COLD
	env.ambient_light_energy = 1.0
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.tonemap_exposure = 1.15
	env.fog_enabled = true
	env.fog_light_color = Color("#514468")
	env.fog_density = 0.0058
	env.fog_sky_affect = 0.15
	env.glow_enabled = false
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	moon = DirectionalLight3D.new()
	moon.light_color = Color("#C4D2F2")
	moon.light_energy = 2.05
	moon.shadow_enabled = false
	add_child(moon)
	# from the west-north-west and high: the upper left of the view from the village
	moon.look_at_from_position(Vector3(-60.0, 70.0, -25.0), Vector3.ZERO, Vector3.UP)


func _fit_render_scale() -> void:
	## Phones have tiny, very dense screens: draw the 3D view at a lower
	## resolution (the HUD stays sharp) so it runs smoothly. Slow devices get
	## turned down further by _watch_frame_rate(). (Same approach as the
	## studio's Melt a Glacier.)
	var px := Vector2(get_window().size)
	var budget := 1.0e6 if DisplayServer.is_touchscreen_available() else 2.4e6
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


# =====================================================================================
# Per frame
# =====================================================================================
func _process(delta: float) -> void:
	var d := minf(delta, 0.1)
	_watch_frame_rate(delta)
	_controls()
	forest.spread_mult = GameState.spread_mult()
	_update_wind(d)
	forest.step(d)
	if forest.ticks != _last_tick:
		_last_tick = forest.ticks
		_after_tick()
	view.advance(d)
	view.set_camera(keeper.camera.global_position, keeper.position + Vector3(0, 1.5, 0))
	var earned := GameState.earn(forest.take_pay())
	if earned > 0.0:
		var r := GameState.income_per_second_now()
		Sound.play("ember", -20.0 + clampf(log(r + 1.0) * 1.6, 0.0, 9.0), 0.95 + randf() * 0.15, 0.0, 0.16)
	_float_t += d
	if _float_t >= 0.7:
		_float_t = 0.0
		_show_pay_spots()
	_update_floats(d)
	Sound.tool_on = keeper.firing and keeper.input_enabled
	Sound.tool_index = GameState.tool_index
	_slow_t += d
	if _slow_t >= 0.5:
		_slow_t = 0.0
		_update_slow()
	_coach_t += d
	_update_coach()


func _after_tick() -> void:
	var changed := forest.take_changed()
	view.apply_changes(changed)
	var ignited := forest.take_ignited()
	critters.on_ignited(ignited)
	var cam := keeper.camera.global_position
	var big := 0
	var small := 0
	for c in ignited:
		if forest.kind[c] >= Balance.OAK:
			big += 1
		elif forest.kind[c] >= Balance.PINE:
			small += 1
	if big > 0:
		Sound.play("catch_big", -8.0 + minf(6.0, big), 1.0, 0.12, 0.35)
	elif small > 0:
		Sound.play("catch_small", -10.0 + minf(5.0, small * 0.5), 1.0, 0.15, 0.25)
	var bloomed := 0
	for c in changed:
		if forest.state[c] == ForestGrid.MEADOW and forest.cell_pos(c).distance_to(cam) < 30.0:
			bloomed += 1
	if bloomed > 0:
		Sound.play("bloom", -20.0 + minf(6.0, bloomed * 0.5), 1.0 + randf() * 0.2, 0.0, 0.6)
	var spots := forest.take_spots()
	if not spots.is_empty():
		Sound.play("spot", -16.0, 1.0, 0.2, 0.5)
	view.update_fire(cam)
	var near := 0.0
	for c in forest.burning:
		var p := forest.cell_center(c)
		var dd := Vector2(cam.x, cam.z).distance_squared_to(p)
		if dd < 900.0:
			near += 1.0 + float(forest.kind[c])
	Sound.fire_near = near


func _controls() -> void:
	var mv := Vector2.ZERO
	if not hud.is_blocking():
		if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
			mv.y += 1.0
		if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
			mv.y -= 1.0
		if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
			mv.x += 1.0
		if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
			mv.x -= 1.0
	var touch := hud.touch
	if touch.visible:
		mv += touch.move_vector
		keeper.add_look(touch.take_look_delta() * Balance.LOOK_SENSITIVITY_TOUCH)
		if touch.take_jump():
			keeper.jump()
	keeper.move_input = mv
	if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		_mouse_fire = false
	keeper.firing = keeper.input_enabled and (_mouse_fire or force_fire or (touch.visible and touch.firing))


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		if not hud.touch_mode:
			hud.set_touch_mode(true)
		return
	if event is InputEventMouseButton:
		if event.device == InputEvent.DEVICE_ID_EMULATION:
			return   # a finger, already handled by the touch controls
		if hud.touch_mode:
			hud.set_touch_mode(false)
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
				if not hud.is_blocking():
					Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
					get_viewport().gui_release_focus()
				return
			_mouse_fire = event.pressed
	elif event is InputEventMouseMotion:
		if event.device != InputEvent.DEVICE_ID_EMULATION and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			keeper.add_look(event.relative * Balance.LOOK_SENSITIVITY_MOUSE)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_SPACE:
				keeper.jump()
			KEY_N, KEY_TAB:
				hud.toggle_notebook()
			KEY_B:
				hud.take_offer()
			KEY_G:
				hud.take_find()
			KEY_M:
				Sound.set_muted(not Sound.muted)
				hud.toast("Sound off. M turns it back on" if Sound.muted else "Sound on")
			KEY_ESCAPE:
				if hud.notebook != null:
					hud.close_notebook()
				Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


# =====================================================================================
# Wind, embers, floating numbers
# =====================================================================================
func _update_wind(d: float) -> void:
	## The wind shifts every minute or two: fire runs downwind, embers jump with it.
	_wind_t -= d
	if _wind_t <= 0.0:
		_wind_t = _rng.randf_range(70.0, 130.0)
		_wind_target = _wind_angle + _rng.randf_range(-1.6, 1.6)
		forest.wind_strength = _rng.randf_range(0.35, 0.8)
	_wind_angle = lerp_angle(_wind_angle, _wind_target, 1.0 - exp(-d * 0.15))
	forest.wind = Vector2(cos(_wind_angle), sin(_wind_angle))
	view.set_wind(forest.wind * forest.wind_strength)


func _build_float_pool() -> void:
	for _i in FLOAT_POOL:
		var l := Label3D.new()
		l.font = UiTheme.display()
		l.font_size = 72
		l.outline_size = 16
		l.pixel_size = 0.0085
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.no_depth_test = true
		l.fixed_size = false
		l.modulate = UiTheme.CORE
		l.outline_modulate = UiTheme.INK
		l.visible = false
		add_child(l)
		_floats.append({"node": l, "t": 9.0})


func _show_pay_spots() -> void:
	var spots := forest.take_pay_spots()
	if spots.is_empty():
		return
	var cam := keeper.camera.global_position
	spots.sort_custom(func(a, b): return float(a[1]) > float(b[1]))
	var shown := 0
	var mult := GameState.ember_mult()
	for s in spots:
		var v := float(s[1]) * mult
		var at: Vector3 = s[0]
		if v < 1.0 or at.distance_to(cam) > 45.0 or at.distance_to(cam) < 9.0:
			continue
		var top := at + Vector3(0, 3.0 + minf(4.0, log(v + 1.0)), 0)
		if keeper.camera.is_position_behind(top) or keeper.camera.unproject_position(top).y < 130.0:
			continue
		_float_text(at + Vector3(0, 3.0 + minf(4.0, log(v + 1.0)), 0), "+" + Fmt.num(v), v)
		shown += 1
		if shown >= 3:
			break


func _float_text(at: Vector3, text: String, v: float) -> void:
	var f: Dictionary = _floats[_float_i]
	_float_i = (_float_i + 1) % _floats.size()
	var l: Label3D = f.node
	l.text = text
	l.position = at
	l.visible = true
	l.font_size = int(clampf(48.0 + log(v + 1.0) * 7.0, 48.0, 104.0))
	f.t = 0.0


func _update_floats(d: float) -> void:
	for f in _floats:
		if float(f.t) >= 1.6:
			continue
		f.t = float(f.t) + d
		var l: Label3D = f.node
		l.position.y += d * 1.6
		var t := float(f.t) / 1.6
		l.modulate.a = 1.0 - t * t
		l.outline_modulate.a = l.modulate.a
		if float(f.t) >= 1.6:
			l.visible = false


func _on_golden(amount: float, at: Vector3) -> void:
	GameState.grant_embers(amount, true)
	Sound.play("golden", -3.0)
	_float_text(at + Vector3(0, 2.0, 0), "+" + Fmt.num(amount), amount)
	hud.show_golden(amount)


# =====================================================================================
# Slow updates: progress, the starter pack, the ending, hints
# =====================================================================================
func _update_slow() -> void:
	GameState.cells_burned = forest.burned
	# The valley warms as the meadow spreads.
	var healed := clampf(forest.progress() * 1.4, 0.0, 1.0)
	env.ambient_light_color = AMBIENT_COLD.lerp(AMBIENT_WARM, healed)
	env.fog_light_color = Color("#514468").lerp(Color("#6E6266"), healed)
	GameState.check_win()
	if not GameState.starter_offered and not GameState.owns_starter and GameState.play_time >= Balance.STARTER_AFTER \
			and not hud.is_blocking() and not Monetization.is_showing_ad():
		GameState.starter_offered = true
		GameState.save_game()
		hud.show_starter_offer()


func _on_won() -> void:
	Sound.play("reward", 0.0)
	if hud.notebook != null:
		hud.close_notebook()
	hud.show_ending()


func _update_coach() -> void:
	## First-run hints, one at a time, about six words each, beside the control
	## they're about (with a drawn finger on phones).
	var touch := hud.touch_mode
	var step := GameState.tutorial_step
	var text := ""
	var anchor := "center"
	match step:
		0:
			text = "Hold to light the cursed grass" if touch else "Hold the mouse button to light the grass"
			anchor = "burn"
			if forest.burning.size() > 0:
				_next_step()
		1:
			text = "It spreads. Everything burnt pays embers."
			anchor = "embers"
			if _coach_t > 6.0 or GameState.embers >= 40.0:
				_next_step()
		2:
			text = "Drag here to look around" if touch else "Move the mouse to look around"
			anchor = "look"
			if _coach_t > 5.0:
				_next_step()
		3:
			text = "Thumb here to walk" if touch else "W, A, S and D to walk"
			anchor = "stick"
			if _coach_t > 5.0:
				_next_step()
		4:
			anchor = "notebook"
			if GameState.tool_index >= 1:
				_next_step()
			elif GameState.embers >= float(Balance.TOOLS[1].cost):
				text = "Enough for the lighter. Open the notebook."
		5:
			text = "Pines need the lighter. Aim at one."
			if _coach_t > 9.0:
				_next_step()
		6:
			text = "Trails stop fire. Embers jump them."
			anchor = "wind"
			if _coach_t > 8.0:
				_next_step()
	hud.set_coach(text, anchor)


func _next_step() -> void:
	GameState.tutorial_step += 1
	_coach_t = 0.0
