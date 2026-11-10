extends SceneTree
## Renders screenshots of key moments, for checking the look by eye:
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/city-shots [844x390]
## (an optional window size renders the same shots at a phone's size)
## The fire is fast-forwarded tick by tick between shots. (Untyped on purpose:
## this compiles before the GameState autoload exists.)

var out_dir := "/tmp/city-shots"
var world
var gs


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		out_dir = args[0]
	if args.size() > 1 and "x" in args[1]:
		var wh: PackedStringArray = args[1].split("x")
		DisplayServer.window_set_size(Vector2i(int(wh[0]), int(wh[1])))
		root.size = Vector2i(int(wh[0]), int(wh[1]))
	DirAccess.make_dir_recursive_absolute(out_dir)
	_run.call_deferred()


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := root.get_texture().get_image()
	img.save_png("%s/%s.png" % [out_dir, name])
	print("saved ", name)


func _frames(n: int) -> void:
	for _i in n:
		await process_frame


func _ff(seconds: float) -> void:
	## Fast-forward the fire (and everything that reacts to it).
	for _i in int(seconds / 0.1):
		world.city.tick(0.1)
		world.view.advance(0.1)
		world._after_tick()
		gs.earn(world.city.take_pay())


func _view_time(seconds: float) -> void:
	## Let the shaders' clock run on without ticking the fire (to catch a fall mid-way).
	world.view.advance(seconds)


func _find(kind: int, zone: int, pick: int = 0) -> int:
	var c = world.city
	var k := 0
	for s in c.count:
		if c.s_kind[s] == kind and c.s_zone[s] == zone and c.s_state[s] == 0:
			if k == pick:
				return s
			k += 1
	return -1


func _center3(s: int, y: float = 0.0) -> Vector3:
	var c: Vector2 = world.city.s_center[s]
	return Vector3(c.x, y, c.y)


func _street_spot(s: int, dist: float) -> Vector3:
	## A clear spot on the floor about `dist` from a structure, preferring the south side, nothing tall in the way.
	var c = world.city
	var at: Vector2 = c.s_center[s]
	var best := Vector3.INF
	var best_score := INF
	for k in 48:
		var a := TAU * k / 48.0
		for dd in [dist, dist + 1.0, dist + 2.0, dist - 1.0]:
			var q: Vector2 = at + Vector2(cos(a), sin(a)) * dd
			var cell: int = c.cell_at(q.x, q.y)
			if cell < 0 or world.giant.is_blocked(q, 0.0):
				continue
			if c.ground[cell] != 0:
				continue
			var score := absf(a - PI * 0.5) + absf(dd - dist) * 0.3
			if score < best_score:
				best_score = score
				best = Vector3(q.x, 0.0, q.y)
	return best if best.is_finite() else Vector3(at.x, 0, at.y + dist)


func _close_popups() -> void:
	for c in world.hud.popups.get_children():
		world.hud.popups.remove_child(c)
		c.queue_free()
	world.giant.input_enabled = true


func _run() -> void:
	gs = root.get_node("GameState")
	gs.wipe_save(false)
	gs.tutorial_step = 0
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	var hud = world.hud
	var giant = world.giant
	var city = world.city
	hud.set_touch_mode(true)
	hud.show_desktop_hint = false
	await _frames(10)
	await _shot("01_spawn_suburbs")
	# The bare floor between districts, with the builder's things standing in it.
	world.move_giant_to(Vector3(6.0, 0, 26.6), Vector3(11.2, 0.6, 22.4))
	giant.set_view(giant.yaw + 0.35, -0.3)
	await _frames(6)
	await _shot("01b_district_gap")

	# The magnifying glass on a house at the edge of the suburbs.
	var h1: int = -1
	for s in city.count:
		if city.s_kind[s] == 0 and city.s_center[s].y > 22.0 and absf(city.s_center[s].x) < 3.0:
			h1 = s
			break
	world.move_giant_to(Vector3(city.s_center[h1].x - 1.2, 0, city.s_center[h1].y + 3.8), _center3(h1, 0.4))
	world.force_fire = true
	await _frames(6)
	giant._focus_sid = giant.aim.sid   # the glass has gathered the light (Balance.FOCUS): it smokes
	giant.focus = 0.97
	await _frames(8)
	await _shot("02_magnifier")
	world.force_fire = false
	world.ignite_at(_center3(h1, 0.4))
	_ff(9.0)
	world.move_giant_to(Vector3(city.s_center[h1].x - 2.0, 0, city.s_center[h1].y + 5.5), _center3(h1, 0.0) + Vector3(0, 0, -2.5))
	await _frames(6)
	await _shot("03_street_on_fire")
	_ff(8.0)
	await _frames(4)
	await _shot("03b_fire_spreading")

	# Computer layout (keys and mouse).
	hud.set_touch_mode(false)
	await _frames(4)
	await _shot("04_desktop_layout")
	hud.set_touch_mode(true)

	# Downtown: a tower toppling.
	gs.dev_gates_open = true
	gs.grant_coins(1e6)
	gs.buy_tool(1)
	gs.tutorial_step = 9
	var t1: int = _find(3, 1, 3)
	world.move_giant_to(_street_spot(t1, 4.5), _center3(t1, 1.0))
	city.ignite(t1)
	city.s_fire[t1] = 1.0
	_ff(2.0)
	await _frames(4)
	await _shot("05_tower_burning")
	city.s_integ[t1] = 0.001
	_ff(0.1)
	_view_time(0.62)
	await _frames(2)
	await _shot("06_tower_collapsing")
	_ff(2.5)
	_view_time(0.5)
	await _frames(4)
	await _shot("06b_tower_down")
	_ff(30.0)
	_view_time(30.0)
	await _frames(4)
	await _shot("06c_ashes")

	# The shop box.
	gs.coins = 1800.0
	gs.tool_index = 1
	hud.open_shop("tools")
	await _frames(24)
	await _shot("07_shop_box")
	hud.shop.select("extras")
	await _frames(6)
	await _shot("07b_shop_extras")
	# The purchases and Restore at the bottom of Extras, then Settings (the privacy links).
	hud.shop._scroll.scroll_vertical = 100000
	await _frames(6)
	await _shot("07c_shop_purchases")
	hud.shop.select("settings")
	await _frames(6)
	await _shot("07d_shop_settings")
	hud.close_shop()
	await _frames(2)

	# The timed offer tag.
	gs.coins = 1500.0
	gs._income = [40.0, 40.0, 40.0, 40.0]
	gs.instant_ready_at = 0.0
	hud.offers.current = "instant"
	hud.offers.time_left = 30.0
	hud._show_offer_tag()
	for _i in 20:
		gs._income = [40.0, 40.0, 40.0, 40.0]
		gs.coins = 1500.0
		hud.offers.time_left = 30.0
		await process_frame
	await _shot("08_offer_tag")
	hud.offers.current = ""
	hud.offer_tag.visible = false

	# Skyscraper row with the blowtorch.
	gs.tool_index = 2
	# The copy-paper tower nearest the main street, seen from the street (room to step back).
	var s1 := -1
	var bd := INF
	for s in city.count:
		if city.s_kind[s] == 4 and city.s_state[s] == 0:
			var dd: float = city.s_center[s].distance_to(Vector2(1.0, 18.0))
			if dd < bd:
				bd = dd
				s1 = s
	world.move_giant_to(Vector3(1.0, 0, 18.5), _center3(s1, 2.4))
	world.force_fire = true
	await _frames(18)
	await _shot("09_blowtorch")
	world.force_fire = false
	city.ignite(s1)
	_ff(10.0)
	world.move_giant_to(Vector3(1.0, 0, 21.5), _center3(s1, 3.6))
	await _frames(4)
	await _shot("10_skyscraper_fire")

	# The castle, and rockets.
	gs.tool_index = 3
	world.move_giant_to(Vector3(1.0, 0, 18.0), Vector3(0, 2.5, 0))
	await _frames(6)
	await _shot("11_castle")
	world.force_fire = true
	for _i in 18:
		await process_frame
	await _shot("12_rockets")
	world.force_fire = false

	# The ending: the keep comes down.
	city.ignite(city.keep_id)
	city.s_fire[city.keep_id] = 1.0
	city.s_integ[city.keep_id] = 0.001
	_ff(1.5)
	_view_time(1.0)
	world.move_giant_to(Vector3(2.0, 0, 13.0), Vector3(0, 1.0, 0))
	gs.check_win()
	# Wait for the delivery note to be pinned up (it fades in after the letterbox closes).
	for _i in 900:
		await process_frame
		if not hud._last_popup.is_empty() and (hud._last_popup.note as Control).modulate.a >= 0.99:
			break
	await _frames(4)
	await _shot("15_ending")
	hud._last_popup.button.pressed.emit()
	await _frames(2)
	# A big blaze across the suburbs and a chain.
	city.burn_zone(0)
	_ff(2.5)
	world.move_giant_to(Vector3(0.6, 0, 34.0), Vector3(-2.0, 0.0, 25.0))
	hud.show_chain(7)
	await _frames(8)
	await _shot("13_blaze_chain")

	hud.show_starter_offer()
	await _frames(40)
	await _shot("14_starter_popup")
	_close_popups()
	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	quit(0)
