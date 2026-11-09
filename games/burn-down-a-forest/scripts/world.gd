class_name World
extends Node3D
## The cursed valley. Builds the sky, the forest (ForestGrid + ForestView), the
## fire-keeper, helpers, critters and the HUD in code, then runs the loop: the
## fire ticks, embers come in, floating numbers rise off the big fires, the
## wind shifts now and then, first-run hints, the starter pack offer, the ending.

const SPAWN := Vector3(-0.6, 0.0, 52.4)
const SPAWN_YAW := 0.0
const SPAWN_PITCH := -0.58           # low enough to see the path lead into the woods and the moon over them
const INTRO_PITCH := 0.02            # the establishing shot: level, the Elder Tree's crown over the woods
const AMBIENT_COLD := Color("#6A6294")    # cursed night (the moon is the key light; the shadows stay plum)
const FILL_NIGHT := Color(0.68, 0.65, 0.74)   # linear: the flat fill that keeps the woods' shadows at L* 20-25 on a phone
const FILL_STRENGTH := 9.5
const FOG_DENSITY := 0.0058
const MOON_ENERGY := 3.0
const STRAYS := 150                  # fewer cells than this (~3% of the forest) left to light counts as nothing left (the safety net)
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
var force_move := Vector2.ZERO       # ...and push the stick (the playthrough bot walks with this)

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
var intro_t := -1.0                  # the establishing shot on a fresh game (< 0: not running)
var ending_t := -1.0                 # the ending: dawn and a camera sweep over the valley (< 0: not running)
var sky_mat: ProceduralSkyMaterial
var _end_from := Vector3.ZERO
var _end_angle := 0.0
var _dawn := 0.0
var _stuck_t := 0.0
var _intro_pitch := 0.0


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
		if GameState.tutorial_step == 0 and GameState.play_time < 1.0:
			# A fresh forest: open on the Elder Tree's crown over the woods, then
			# ease down to the village and the grass to light.
			intro_t = 0.0
			_intro_pitch = INTRO_PITCH
			keeper.set_view(SPAWN_YAW, INTRO_PITCH)
	GameState.keeper = keeper
	if GameState.has_won:
		_set_dawn(1.0)              # a finished forest stays at dawn
	view.add_lit(keeper.material())
	keeper.material().set_shader_parameter("lantern_gain", 0.4)

	helpers = HelperSwarm.new()
	helpers.grid = forest
	helpers.keeper = keeper
	add_child(helpers)
	critters = Critters.new()
	critters.grid = forest
	add_child(critters)
	critters.golden_found.connect(_on_golden)
	for m in [critters._mat, critters._gold_mat, helpers._sprite_mat, helpers._lizard_mat]:
		view.add_lit(m)
	view.set_fill(FILL_NIGHT * FILL_STRENGTH)
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
	sky_mat = ProceduralSkyMaterial.new()
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
	env.fog_density = FOG_DENSITY
	env.fog_sky_affect = 0.15
	env.glow_enabled = false
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	# The key light: cool moonlight from the upper left with real cast shadows
	# (trees, cottages and the keeper cast them; grass, bushes and flowers don't).
	moon = DirectionalLight3D.new()
	moon.light_color = Color("#C4D2F2")
	moon.light_energy = MOON_ENERGY
	moon.shadow_enabled = true
	moon.shadow_opacity = 0.62
	moon.shadow_blur = 1.5
	moon.shadow_bias = 0.06
	moon.shadow_normal_bias = 1.2
	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	moon.directional_shadow_max_distance = 32.0 if DisplayServer.is_touchscreen_available() else 48.0
	moon.directional_shadow_fade_start = 0.75
	add_child(moon)
	# from the west-north-west and high: the upper left of the view from the village
	moon.look_at_from_position(Vector3(-60.0, 70.0, -25.0), Vector3.ZERO, Vector3.UP)
	_build_moon_disc()


var _moon_disc: MeshInstance3D


func _build_moon_disc() -> void:
	## A big pale storybook moon low in the north, just behind the Elder Tree's
	## crown as seen from the village, so the Elder stands out on the skyline as
	## a black hand against it. (The light itself comes from higher up; this is
	## the picture.) Fades out at dawn.
	var n := 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var d := Vector2(x + 0.5 - n * 0.5, y + 0.5 - n * 0.5).length() / (n * 0.5)
			var disc := clampf((0.6 - d) / 0.012, 0.0, 1.0)
			var halo := pow(clampf(1.0 - d, 0.0, 1.0), 2.2) * 0.35
			var crater := 0.0
			for cc in [[Vector2(0.42, 0.4), 0.09], [Vector2(0.6, 0.55), 0.06], [Vector2(0.47, 0.64), 0.05]]:
				if Vector2(float(x) / n, float(y) / n).distance_to(cc[0]) < float(cc[1]):
					crater = 0.08
			var c := Color("#E9E4F2").darkened(crater) if disc > 0.0 else Color("#B9A9D8")
			img.set_pixel(x, y, Color(c.r, c.g, c.b, maxf(disc, halo)))
	img.generate_mipmaps()
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_texture = ImageTexture.create_from_image(img)
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.disable_fog = true
	mat.no_depth_test = false
	var q := QuadMesh.new()
	q.size = Vector2(46, 46)
	_moon_disc = MeshInstance3D.new()
	_moon_disc.mesh = q
	_moon_disc.material_override = mat
	_moon_disc.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_moon_disc.position = Vector3(-10.0, 50.0, -168.0)
	add_child(_moon_disc)


func _update_intro(d: float) -> void:
	if intro_t < 0.0:
		return
	if absf(keeper.cam_pitch - _intro_pitch) > 0.001:
		intro_t = -1.0          # the player (or a test) took the camera: stop
		return
	intro_t += d
	var t := clampf((intro_t - 1.6) / 2.4, 0.0, 1.0)
	var e := t * t * (3.0 - 2.0 * t)
	_intro_pitch = lerpf(INTRO_PITCH, SPAWN_PITCH, e)
	keeper.cam_pitch = _intro_pitch
	if t >= 1.0:
		intro_t = -1.0


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
	var d := minf(delta, 0.1 * maxf(1.0, Engine.time_scale))
	_watch_frame_rate(delta)
	_controls()
	forest.spread_mult = GameState.spread_mult()
	_update_wind(d)
	forest.step(d)
	if forest.ticks != _last_tick:
		_last_tick = forest.ticks
		_after_tick()
	view.advance(d)
	view.set_camera(keeper.camera.global_position, keeper.position + Vector3(0, 1.9, 0))
	view.set_lantern(keeper.lantern_pos(), keeper.lantern_flicker)
	_update_intro(d)
	_update_ending(d)
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
	mv += force_move
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
		l.font = UiTheme.numbers()         # lining figures: "+11", never "+II"
		l.font_size = 64
		l.outline_size = 18
		l.pixel_size = 0.0085
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.no_depth_test = true
		l.fixed_size = false
		l.modulate = UiTheme.CORE
		l.outline_modulate = UiTheme.INK
		l.visible = false
		add_child(l)
		_floats.append({"node": l, "t": 9.0, "k": 0.0007})


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
		# never on top of another number still rising
		var sp := keeper.camera.unproject_position(top)
		var crowded := false
		for f in _floats:
			if float(f.t) < 1.0 and (f.node as Label3D).visible and keeper.camera.unproject_position((f.node as Label3D).position).distance_to(sp) < 70.0:
				crowded = true
		if crowded:
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
	# the bigger the payday, the bigger the number (3.5-5% of the screen's height)
	f.k = clampf(0.00066 + log(v + 1.0) * 0.00003, 0.00068, 0.00098)
	f.t = 0.0


func _update_floats(d: float) -> void:
	for f in _floats:
		if float(f.t) >= 1.6:
			continue
		f.t = float(f.t) + d
		var l: Label3D = f.node
		l.position.y += d * 1.6
		# the same size on screen near or far: readable on a phone, never a wall of digits
		l.pixel_size = float(f.k) * maxf(4.0, l.position.distance_to(keeper.camera.global_position))
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
	# The valley warms as the meadow spreads (and after the ending it's dawn).
	if _dawn <= 0.0:
		var healed := clampf(forest.progress() * 1.4, 0.0, 1.0)
		env.ambient_light_color = AMBIENT_COLD.lerp(AMBIENT_WARM, healed)
		env.fog_light_color = Color("#514468").lerp(Color("#6E6266"), healed)
	GameState.check_win()
	# The safety net: nothing left the tool can light and the next tool's out of reach.
	_stuck_t += 0.5
	if _stuck_t >= 2.0:
		_stuck_t = 0.0
		var was := GameState.stuck
		GameState.stuck = false
		var short := GameState.short_for_next_tool()
		# (a few stray cells by the water or in corners don't count as something left to burn)
		GameState.stuck = short and forest.burning.is_empty() and helpers_idle() and not forest.any_lightable(GameState.tool_heat(), STRAYS)
		if GameState.stuck and not was:
			var nt := GameState.next_tool_index()
			hud.toast("Nothing left the %s can light. The %s is yours for what you have, in the notebook" % [
				str(GameState.tool_def().name).to_lower(), str(Balance.TOOLS[nt].name).to_lower()])
	if not GameState.starter_offered and not GameState.owns_starter and GameState.play_time >= Balance.STARTER_AFTER \
			and not hud.is_blocking() and not Monetization.is_showing_ad():
		GameState.starter_offered = true
		GameState.save_game()
		hud.show_starter_offer()


func helpers_idle() -> bool:
	## Helpers can't light anything either (they use the same heat tiers as tools, or less).
	for i in Balance.HELPERS.size():
		if int(GameState.helper_counts[i]) > 0 and forest.any_lightable(float(Balance.HELPERS[i].heat) * GameState.upgrade_mult("heat"), STRAYS):
			return false
	return true


func _on_won() -> void:
	## The curse lifts: the rest of the forest withers in a wave out from the
	## heart and blooms, the HUD goes, night turns to dawn, the camera sweeps up
	## over the restored valley and comes down low behind the keeper, who has
	## come to stand by the Elder Tree's stump: a sapling growing out of it,
	## the village roofs beyond with smoke from every chimney, a low warm sun
	## throwing long shadows across the meadow. Then the letter.
	Sound.play("reward", 0.0)
	if hud.notebook != null:
		hud.close_notebook()
	forest.lift_curse()
	view.green_trails()
	view.update_elder_remains()
	hud.begin_ending()
	keeper.cinematic = true
	keeper.firing = false
	ending_t = 0.0
	_end_from = keeper.camera.global_position
	_end_angle = atan2(_end_from.x, _end_from.z)
	# where the closing shot stands: north of the stump, looking south past it to the village
	var sc := forest.cell_center(forest.elder_cell)
	_end_stump = Vector3(sc.x, forest.height_at(sc.x, sc.y), sc.y)
	# the camera stands north of the stump, a little east, looking due south;
	# the frame's right is west. The letter takes the left of the screen, so
	# everything is set in the right half: the stump just right of centre, the
	# village beyond it, the keeper a few steps ahead on the far right
	_end_cam = _end_stump + Vector3(4.2, 0.0, -14.0)
	_end_cam.y = forest.height_at(_end_cam.x, _end_cam.z) + 3.1
	_end_keeper = Vector3(_end_cam.x - 5.6, 0.0, _end_cam.z + 7.4)
	_end_keeper.y = forest.height_at(_end_keeper.x, _end_keeper.z)
	# long shadows need to reach the village from here
	moon.directional_shadow_max_distance = 90.0


var _end_stump := Vector3.ZERO
var _end_keeper := Vector3.ZERO
var _end_cam := Vector3.ZERO


func _update_ending(d: float) -> void:
	if ending_t < 0.0:
		return
	ending_t += d
	_set_dawn(clampf(ending_t / 7.0, 0.0, 1.0))
	var cam := keeper.camera
	# 1. the sweep: up from where the keeper stood, round and over the valley (0-7 s)
	var t := clampf(ending_t / 7.0, 0.0, 1.0)
	var e := t * t * (3.0 - 2.0 * t)
	var a := _end_angle + e * 1.6
	var r := lerpf(Vector2(_end_from.x, _end_from.z).length(), 36.0, e)
	var h := lerpf(_end_from.y, 18.0, e)
	var sweep := Vector3(sin(a) * r, h, cos(a) * r)
	if ending_t < 2.0:
		sweep = _end_from.lerp(sweep, ending_t / 2.0)
	var sweep_look := Vector3(0, 4.0, 0).lerp(Vector3(0, 2.0, 0), e)
	# the keeper walks to the stump while we're up high
	if ending_t > 3.0 and keeper.position.distance_to(_end_keeper) > 0.05:
		keeper.position = _end_keeper
		keeper.face_toward(_end_stump)
	# 2. down low behind the keeper, toward the stump and the village beyond (7-11 s)
	var low_cam := _end_cam
	var low_look := Vector3(_end_cam.x - 0.4, _end_stump.y + 1.2, _end_stump.z + 36.0)
	var u := clampf((ending_t - 7.0) / 4.0, 0.0, 1.0)
	var eu := u * u * (3.0 - 2.0 * u)
	# a slow push in once it's settled
	low_cam += (low_look - low_cam).normalized() * maxf(0.0, ending_t - 11.0) * 0.08
	var pos := sweep.lerp(low_cam, eu)
	var look := sweep_look.lerp(low_look, eu)
	cam.global_position = pos
	if pos.distance_to(look) > 0.5:
		cam.look_at(look, Vector3.UP)
	if ending_t >= 11.5 and not hud.ending_letter_shown():
		hud.show_ending()


func end_ending() -> void:
	## "Walk the meadow": the keeper's back, at dawn.
	ending_t = -1.0
	keeper.cinematic = false
	keeper.set_view(keeper.cam_yaw, keeper.cam_pitch)


func _set_dawn(k: float) -> void:
	## Night (0) to dawn over the restored valley (1).
	_dawn = k
	var e := k * k * (3.0 - 2.0 * k)
	sky_mat.sky_top_color = Color("#1B1430").lerp(Color("#3A4C86"), e)
	sky_mat.sky_horizon_color = Color("#5E4C74").lerp(Color("#F2A87A"), e)
	sky_mat.ground_horizon_color = Color("#3A2E4A").lerp(Color("#B98A86"), e)
	env.ambient_light_color = env.ambient_light_color.lerp(Color("#7E8298"), e)
	env.fog_light_color = Color("#514468").lerp(Color("#B4979C"), e)
	env.fog_density = FOG_DENSITY * lerpf(1.0, 0.55, e)     # the dawn air clears
	view.set_healed(e)
	if _moon_disc != null:
		(_moon_disc.material_override as StandardMaterial3D).albedo_color.a = 1.0 - e
		_moon_disc.visible = e < 0.99
	moon.light_color = Color("#C4D2F2").lerp(Color("#FFCF9A"), e)
	moon.light_energy = lerpf(MOON_ENERGY, 3.3, e)
	moon.shadow_opacity = lerpf(0.62, 0.8, e)
	# a low sun from the east-north-east: long shadows across the meadow, toward the camera's left
	var from := Vector3(-60.0, 70.0, -25.0).lerp(Vector3(80.0, 15.0, -26.0), e)
	moon.look_at_from_position(from, Vector3.ZERO, Vector3.UP)
	view.set_fill(FILL_NIGHT.lerp(Color(0.5, 0.48, 0.52), e) * lerpf(FILL_STRENGTH, FILL_STRENGTH * 0.3, e))


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
			elif GameState.embers >= GameState.tool_cost(1):
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
