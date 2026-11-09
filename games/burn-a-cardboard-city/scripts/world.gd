class_name World
extends Node3D
## The warehouse and the cardboard city. Builds the building, the city
## (CityGrid + CityView), the giant, helpers, paper citizens and the HUD in code,
## then runs the loop: the fire ticks, coins come in, buildings fall, chains pay,
## finds pop out, the fans change the wind now and then, first-run hints, the
## starter pack offer, the ending.
##
## For tests, the dev menu and a playthrough bot, the game's actions are plain
## calls: ignite_at(point), move_giant_to(point), GameState.buy("tool:candle"),
## skip_to_district(z).

const SPAWN := Vector3(0.0, 0.0, 28.0)
const SPAWN_YAW := 0.0
const SPAWN_PITCH := -0.62
const FLOAT_POOL := 16

var city: CityGrid
var view: CityView
var house: Warehouse
var giant: Giant
var helpers: HelperSwarm
var citizens: Citizens
var hud: Hud
var force_fire := false              # tests and screenshots hold the button down

var _mouse_fire := false
var _quality := 1.0
var _fps_t := 0.0
var _float_t := 0.0
var _slow_t := 0.0
var _floats: Array = []
var _float_i := 0
var _last_tick := -1
var _wind_t := 45.0
var _wind_target := 0.0
var _wind_angle := 0.0
var _coach_t := 0.0
var _step_seen := 0
var _tick_float := 0.0
var _tick_float_at := Vector3.ZERO
var _next_float_ms := 0
var _land_seen := 0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	Craft.install_fonts()
	_rng.randomize()
	house = Warehouse.new()
	add_child(house)
	house.build()
	city = CityGrid.new()
	city.generate(Balance.WORLD_SEED)
	_wind_angle = atan2(city.wind.y, city.wind.x)
	_wind_target = _wind_angle
	if GameState.city_save != "":
		city.load_save_string(GameState.city_save)
	GameState.city = city
	view = CityView.new()
	add_child(view)
	view.build(city)
	view.show_loaded_state()
	view.set_wind(city.wind * city.wind_strength)

	giant = Giant.new()
	giant.grid = city
	add_child(giant)
	var pos := GameState.giant_pos if GameState.giant_pos.is_finite() else SPAWN
	giant.teleport(pos)
	if GameState.giant_pos.is_finite():
		giant.set_view(GameState.giant_yaw, GameState.giant_pitch)
	else:
		giant.set_view(SPAWN_YAW, SPAWN_PITCH)
	GameState.giant = giant
	giant.fx.rocket_launched.connect(func(): Sound.play("rocket_launch", -6.0, 1.0, 0.1))
	giant.fx.rocket_burst.connect(func(at: Vector3):
		Sound.play_at("rocket_burst", at, 0.0, 1.0, 0.12)
		giant.add_shake(0.12))

	helpers = HelperSwarm.new()
	helpers.grid = city
	helpers.giant = giant
	add_child(helpers)
	citizens = Citizens.new()
	citizens.grid = city
	add_child(citizens)
	citizens.found.connect(_on_find)

	hud = Hud.new()
	hud.giant = giant
	hud.city = city
	hud.world = self
	add_child(hud)
	hud.shop_closed.connect(func(): Monetization.maybe_show_interstitial(Monetization.PLACEMENT_INTERSTITIAL))
	GameState.tool_bought.connect(func(i: int):
		Sound.play("reward", -4.0)
		hud.toast("The %s. It lights %s." % [str(Balance.TOOLS[i].name).to_lower(), Balance.TOOLS[i].lights]))
	GameState.won.connect(_on_won)
	_build_float_pool()
	get_window().size_changed.connect(_fit_render_scale)
	_fit_render_scale()


func _exit_tree() -> void:
	if GameState.city == city:
		GameState.save_game()
		GameState.city = null
		GameState.giant = null


# =====================================================================================
# Actions (callable from code: tests, the dev menu, a playthrough bot)
# =====================================================================================
func ignite_at(point: Vector3, power: float = -1.0) -> bool:
	## Light whatever stands at a point, if `power` (default: your tool's) is enough.
	var s := city.structure_at(point.x, point.z)
	var p := GameState.tool_power() if power < 0.0 else power
	if s < 0 or not city.can_light(s, p):
		return false
	city.ignite(s, Vector2(point.x, point.z))
	return true


func move_giant_to(point: Vector3, look_at_point: Vector3 = Vector3.INF) -> void:
	## Stand somewhere (nudged out of anything too tall to stand in), optionally looking at a point.
	giant.teleport(free_spot_near(point))
	if look_at_point.is_finite():
		giant.aim_at(look_at_point)


func free_spot_near(p: Vector3) -> Vector3:
	var here := Vector2(p.x, p.z)
	if not giant.is_blocked(here, 0.0):
		return p
	for ring in range(1, 30):
		var r := ring * 0.25
		for k in 16:
			var a := TAU * k / 16.0
			var q := here + Vector2(cos(a), sin(a)) * r
			if not giant.is_blocked(q, 0.0):
				return Vector3(q.x, 0.0, q.y)
	return p


func skip_to_district(z: int) -> void:
	## Dev: everything outside district z has already burned down; stand at its edge
	## with the tool it needs.
	for s in city.count:
		if city.s_zone[s] < z and city.s_state[s] != CityGrid.RUBBLE:
			city.burning.erase(s)
			city.s_state[s] = CityGrid.RUBBLE
			city.s_fall[s] = CityGrid.CRUMPLE
			city.fallen += 1
			city.zone_fallen[city.s_zone[s]] += 1
	GameState.tool_index = maxi(GameState.tool_index, mini(z, Balance.TOOLS.size() - 1))
	GameState.tool_bought.emit(GameState.tool_index)
	view.show_loaded_state()
	var edge := (Balance.GRID * 0.5 - 1.5 - z * (Balance.BLOCK + Balance.STREET)) * Balance.CELL
	move_giant_to(Vector3(0, 0, edge + 1.0))
	giant.set_view(0.0, -0.5)
	GameState.changed.emit()


# =====================================================================================
# Rendering scale (phones draw the 3D view smaller; the HUD stays sharp)
# =====================================================================================
func _fit_render_scale() -> void:
	## Phones have tiny, very dense screens: draw the 3D view at a lower resolution
	## so it runs smoothly. Slow devices get turned down further by
	## _watch_frame_rate(). (Same approach as the studio's Melt a Glacier.)
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
	if Time.get_ticks_msec() < 8000 or Engine.time_scale != 1.0:
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
	city.spread_mult = GameState.spread_mult()
	city.burn_mult = GameState.burn_mult()
	_update_wind(d)
	city.step(d)
	if city.ticks != _last_tick:
		_last_tick = city.ticks
		_after_tick()
	view.flame_style = 1.0 if GameState.golden_on else 0.0
	view.advance(d)
	var earned := GameState.earn(city.take_pay())
	if earned > 0.0:
		var r := GameState.income_per_second_now()
		Sound.play("coin", -22.0 + clampf(log(r + 1.0) * 1.5, 0.0, 9.0), 0.95 + randf() * 0.15, 0.0, 0.14)
	_float_t += d
	if _float_t >= 0.8:
		_float_t = 0.0
		_show_burn_pay()
	_update_floats(d)
	Sound.tool_on = giant.firing and giant.input_enabled and GameState.tool_index < 3
	Sound.tool_index = GameState.tool_index
	if giant.steps != _step_seen:
		_step_seen = giant.steps
		Sound.play("step", -9.0, 1.0, 0.1)
	if giant.landed != _land_seen:
		_land_seen = giant.landed
		Sound.play("land", -5.0, 1.0, 0.1)
		giant.add_shake(0.25)
	_slow_t += d
	if _slow_t >= 0.5:
		_slow_t = 0.0
		_update_slow()
	_coach_t += d
	_update_coach()


func _after_tick() -> void:
	var ignited := city.take("ignited")
	var collapsed := city.take("collapsed")
	var impacts := city.take("impacts")
	var extinguished := city.take("extinguished")
	var debris_new := city.take("debris_new")
	var debris_out := city.take("debris_out")
	view.apply_events(ignited, collapsed, impacts, extinguished, debris_new, debris_out)
	citizens.on_ignited(ignited)
	var cam := giant.camera.global_position
	var big := 0
	var small := 0
	for s in ignited:
		if city.s_kind[s] >= Balance.OFFICE and city.s_kind[s] != Balance.TRUCK:
			big += 1
		else:
			small += 1
	if big > 0:
		Sound.play("catch_big", -8.0 + minf(6.0, big), 1.0, 0.12, 0.3)
	elif small > 0:
		Sound.play("catch", -11.0 + minf(5.0, small * 0.6), 1.0, 0.15, 0.2)
	for s in collapsed:
		if city.s_fall[s] != CityGrid.CRUMPLE:
			Sound.play_at("topple", _top(s), 2.0, 1.0 - clampf(city.s_height[s] * 0.04, 0.0, 0.2), 0.08)
	_tick_float = 0.0
	for e in impacts:
		_on_impact(e[0], e[1], e[2])
	if _tick_float > 0.0 and Time.get_ticks_msec() >= _next_float_ms:
		_next_float_ms = Time.get_ticks_msec() + 350
		_float_text(_tick_float_at, "+" + Fmt.num(_tick_float), _tick_float)
	for e in city.take("sprays"):
		var t: int = e[0]
		var s: int = e[1]
		var from := Vector3(city.s_center[t].x, 0.55, city.s_center[t].y)
		view.splash(from, _top(s) - Vector3(0, city.s_height[s] * 0.3, 0))
		Sound.play_at("spray", from, -4.0, 1.0, 0.1)
	for s in extinguished:
		Sound.play_at("hiss_out", _top(s), -6.0)
	var spots := city.take("spots")
	if not spots.is_empty():
		Sound.play("ember", -14.0, 1.0, 0.2, 0.4)
	view.update_fire(cam)
	var near := 0.0
	for s in city.burning:
		var dd := Vector2(cam.x, cam.z).distance_squared_to(city.s_center[s])
		if dd < 625.0:
			near += (1.0 + float(city.s_kind[s] >= Balance.OFFICE) * 2.0) * city.s_fire[s]
	near += minf(20.0, city.debris.size() * 0.1)
	Sound.fire_near = near


func _top(s: int) -> Vector3:
	return Vector3(city.s_center[s].x, city.s_height[s], city.s_center[s].y)


func _on_impact(s: int, bonus: float, chain: int) -> void:
	GameState.collapses += 1
	GameState.best_chain = maxi(GameState.best_chain, chain)
	var at := view.impact_point(s)
	var kind := city.s_kind[s]
	var big := kind >= Balance.OFFICE and kind != Balance.TRUCK
	Sound.play_at("crumple_big" if big else "crumple", at, 0.0 if big else -4.0, 1.0, 0.12)
	var v := bonus * GameState.coin_mult()
	# One number per tick at most: the biggest thing that fell.
	if v >= 1.0 and v > _tick_float:
		_tick_float = v
		_tick_float_at = at + Vector3(0, 0.6 + minf(2.0, city.s_height[s] * 0.5), 0)
	if big:
		Sound.play("coins_big", -6.0, 1.0, 0.1, 0.2)
	var dist := at.distance_to(giant.global_position)
	if big and dist < 20.0:
		giant.add_shake(clampf(city.s_height[s] * 0.1, 0.1, 0.6) * (1.0 - dist / 20.0))
	if chain >= 3:
		hud.show_chain(chain)
		Sound.play("chain", -6.0, 1.0 + minf(1.0, (chain - 3) * 0.06), 0.0, 0.25)
	citizens.maybe_find(s, at)


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
		giant.add_look(touch.take_look_delta() * Balance.LOOK_SENSITIVITY_TOUCH)
		if touch.take_jump():
			giant.jump()
	giant.move_input = mv
	if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		_mouse_fire = false
	giant.firing = giant.input_enabled and (_mouse_fire or force_fire or (touch.visible and touch.firing))


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
			_mouse_fire = event.pressed
	elif event is InputEventMouseMotion:
		if event.device != InputEvent.DEVICE_ID_EMULATION and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			giant.add_look(event.relative * Balance.LOOK_SENSITIVITY_MOUSE)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_SPACE:
				giant.jump()
				Sound.play("jump", -10.0)
			KEY_E, KEY_TAB:
				hud.toggle_shop()
			KEY_B:
				hud.take_offer()
			KEY_G:
				hud.take_find()
			KEY_M:
				Sound.set_muted(not Sound.muted)
				hud.toast("Sound off (M turns it back on)" if Sound.muted else "Sound on")
			KEY_F1:
				if GameState.dev_enabled():
					hud.open_shop("dev")
			KEY_ESCAPE:
				if hud.shop != null:
					hud.close_shop()
				Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


# =====================================================================================
# Wind (the fans), floating coins
# =====================================================================================
func _update_wind(d: float) -> void:
	_wind_t -= d
	if _wind_t <= 0.0:
		_wind_t = _rng.randf_range(70.0, 130.0)
		# A different fan comes on: the wind swings round to blow from its wall.
		var dirs := [PI * 0.5, -PI * 0.5, 0.0, PI]
		_wind_target = dirs[_rng.randi() % 4] + _rng.randf_range(-0.35, 0.35)
		city.wind_strength = _rng.randf_range(0.35, 0.85)
	_wind_angle = lerp_angle(_wind_angle, _wind_target, 1.0 - exp(-d * 0.2))
	city.wind = Vector2(cos(_wind_angle), sin(_wind_angle))
	view.set_wind(city.wind * city.wind_strength)
	house.update_fans(city.wind, city.wind_strength, d)
	var fan_d := 99.0
	for f in house.fans:
		fan_d = minf(fan_d, (f.body as Node3D).global_position.distance_to(giant.global_position))
	Sound.fan_level = clampf(0.35 - fan_d * 0.008, 0.06, 0.35)


func _build_float_pool() -> void:
	for _i in FLOAT_POOL:
		var root := Node3D.new()
		var coin := Sprite3D.new()
		coin.texture = Craft.icon3d("coin")
		coin.pixel_size = 0.0028
		coin.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		coin.no_depth_test = true
		coin.render_priority = 5
		root.add_child(coin)
		var l := Label3D.new()
		l.font = Craft.marker()
		l.font_size = 72
		l.outline_size = 16
		l.pixel_size = 0.006
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.no_depth_test = true
		l.render_priority = 6
		l.modulate = Craft.INK
		l.outline_modulate = Craft.TAPE
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		root.add_child(l)
		root.visible = false
		add_child(root)
		_floats.append({"node": root, "coin": coin, "label": l, "t": 9.0})


func _show_burn_pay() -> void:
	var paid := city.take_pay_by()
	if paid.is_empty():
		return
	var cam := giant.camera
	var list: Array = []
	for s in paid:
		list.append([s, float(paid[s])])
	list.sort_custom(func(a, b): return float(a[1]) > float(b[1]))
	var mult := GameState.coin_mult()
	var shown := 0
	for e in list:
		var s: int = e[0]
		var v := float(e[1]) * mult
		if v < 1.0 or city.s_state[s] != CityGrid.BURNING or city.s_kind[s] < Balance.OFFICE:
			continue
		var top := _top(s) + Vector3(0, 0.5, 0)
		if top.distance_to(cam.global_position) > 26.0 or cam.is_position_behind(top):
			continue
		if cam.unproject_position(top).y < 120.0:
			continue
		_float_text(top, "+" + Fmt.num(v), v * 0.5)
		shown += 1
		if shown >= 2:
			break


func _float_text(at: Vector3, text: String, v: float) -> void:
	var f: Dictionary = _floats[_float_i]
	_float_i = (_float_i + 1) % _floats.size()
	var root: Node3D = f.node
	var l: Label3D = f.label
	var coin: Sprite3D = f.coin
	var big := clampf(0.8 + log(v + 1.0) * 0.12, 0.8, 1.9)
	l.text = text
	l.font_size = int(64 * big)
	l.position = Vector3(0.0, 0.0, 0.0)
	l.offset = Vector2(l.font_size * 0.55, 0)
	coin.pixel_size = 0.0026 * big
	coin.offset = Vector2(-40, 0)
	root.position = at
	root.visible = true
	root.scale = Vector3.ONE * 0.4
	f.t = 0.0


func _update_floats(d: float) -> void:
	for f in _floats:
		if float(f.t) >= 1.7:
			continue
		f.t = float(f.t) + d
		var root: Node3D = f.node
		var t := float(f.t) / 1.7
		root.position.y += d * 0.9 * (1.0 - t)
		# Pops in with a little overshoot, then fades.
		var pop := minf(1.0, float(f.t) / 0.18)
		var s := 1.0 + 0.25 * sin(pop * PI) if pop < 1.0 else 1.0
		root.scale = Vector3.ONE * lerpf(0.4, 1.0, pop) * s
		var a := 1.0 - clampf((t - 0.6) / 0.4, 0.0, 1.0)
		(f.label as Label3D).modulate.a = a
		(f.label as Label3D).outline_modulate.a = a
		(f.coin as Sprite3D).modulate.a = a
		if float(f.t) >= 1.7:
			root.visible = false


func _on_find(key: String, golden: bool, amount: float, at: Vector3) -> void:
	GameState.grant_coins(amount, true)
	GameState.note_find(key)
	Sound.play("golden" if golden else "find", -4.0 if golden else -7.0)
	_float_text(at + Vector3(0, 1.2, 0), "+" + Fmt.num(amount), amount)
	hud.show_find(key, golden, amount)


# =====================================================================================
# Slow updates: the starter pack, the ending, hints
# =====================================================================================
func _update_slow() -> void:
	GameState.check_win()
	if not GameState.starter_offered and not GameState.owns_starter and GameState.play_time >= Balance.STARTER_AFTER \
			and not hud.is_blocking() and not Monetization.is_showing_ad():
		GameState.starter_offered = true
		GameState.save_game()
		hud.show_starter_offer()


func _on_won() -> void:
	Sound.play("reward", 0.0)
	if hud.shop != null:
		hud.close_shop()
	hud.show_ending()


func _update_coach() -> void:
	## First-run hints, one at a time.
	var touch := hud.touch_mode
	var text := ""
	match GameState.tutorial_step:
		0:
			text = ("Hold the fire button" if touch else "Hold the left mouse button") + " with the crosshair on a box house. The glass catches the skylight."
			if city.burning.size() > 0:
				_next_step()
		1:
			text = "It spreads by itself, and every box that burns drops coins."
			if _coach_t > 7.0 or GameState.coins >= 15.0:
				_next_step()
		2:
			text = "When a building burns through it falls, onto whatever is next to it. Line them up."
			if GameState.collapses > 0 and _coach_t > 3.0:
				_next_step()
			elif _coach_t > 12.0:
				_next_step()
		3:
			text = "Right side of the screen to look, left thumb to walk. You can step over houses." if touch \
				else "Mouse to look, WASD to walk, Space to jump. You can step over houses."
			if _coach_t > 7.0:
				_next_step()
		4:
			if GameState.tool_index >= 1:
				_next_step()
			elif GameState.coins >= float(Balance.TOOLS[1].cost):
				text = "You can afford the candle. Open the box (top right)" + ("." if touch else ", or press E.")
		5:
			text = "Downtown's office boxes are thicker card. Drip candle wax on them."
			if _coach_t > 9.0:
				_next_step()
		6:
			text = "Streets stop a fire. Cars, falling towers and the fans' breeze carry it across."
			if _coach_t > 9.0:
				_next_step()
	hud.set_coach(text)


func _next_step() -> void:
	GameState.tutorial_step += 1
	_coach_t = 0.0
