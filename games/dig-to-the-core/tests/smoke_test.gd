extends SceneTree
## Headless smoke test: godot --headless -s res://tests/smoke_test.gd
## Builds the world, digs with the player, checks the money (deeper rock
## pays more, the 2x boost doubles income), the phone controls, a shop
## purchase, a find, the helpers, zone streaming, the lift both ways, and a
## save/load round trip that keeps the dug shaft. Exits 1 if anything fails.
## Variables stay untyped: this script compiles before the autoloads exist.

var ok := true


func check(cond: bool, what: String) -> void:
	print(("  ok    " if cond else "  FAIL  ") + what)
	if not cond:
		ok = false


func _initialize() -> void:
	create_timer(280.0).timeout.connect(func():
		print("SMOKE TEST TIMED OUT")
		quit(2))
	_run.call_deferred()


func _frames(n: int) -> void:
	for _i in n:
		await process_frame


func _physics(n: int) -> void:
	for _i in n:
		await physics_frame


func _seconds(s: float) -> void:
	var end := Time.get_ticks_msec() + int(s * 1000.0)
	while Time.get_ticks_msec() < end:
		await process_frame


func _touch(index: int, pos: Vector2, pressed: bool) -> void:
	var ev := InputEventScreenTouch.new()
	ev.index = index
	ev.position = pos
	ev.pressed = pressed
	root.push_input(ev, true)


func _drag(index: int, pos: Vector2, rel: Vector2) -> void:
	var ev := InputEventScreenDrag.new()
	ev.index = index
	ev.position = pos
	ev.relative = rel
	root.push_input(ev, true)


func _carve(field, at: Vector3, radius: float) -> void:
	field.dig(at, radius, 1e9)


func _ride(world) -> void:
	var end := Time.get_ticks_msec() + 15000
	while not world._ride.is_empty() and Time.get_ticks_msec() < end:
		await process_frame


func _dig_for(player, seconds: float) -> Array:
	## Strikes with the tool for `seconds` of game time, stepping forward into
	## the tunnel as it gets deeper (no physics). Returns [earned, strikes].
	var gs = root.get_node("GameState")
	var m0: float = gs.money
	var s0: int = player.strikes
	player.digging = true
	var steps := int(seconds * 60.0)
	for _i in steps:
		player._update_tool(1.0 / 60.0)
		if player.target.hit and player.target.dist > 0.9:
			var fwd: Vector3 = player.aim_dir()
			fwd.y = 0.0
			player.position += fwd.normalized() * (player.target.dist - 0.9)
	player.digging = false
	player._update_tool(1.0 / 60.0)
	return [gs.money - m0, player.strikes - s0]


func _run() -> void:
	var gs = root.get_node("GameState")
	var mon = root.get_node("Monetization")
	mon.provider.instant = true
	gs.wipe_save()
	var world = load("res://scenes/world.tscn").instantiate()
	root.add_child(world)
	await _frames(3)
	var field = world.field
	var player = world.player
	var hud = world.hud
	world._update_coach()
	check(field.is_loaded(0) and field.is_loaded(1), "the top two zones are loaded at the start")
	check(not player.collides(player.position), "player spawns in free space at %s" % player.position)
	check(hud.gauge != null and hud._coach.visible, "the depth gauge and the first-run hint are up")

	# --- Digging: stand in the middle of the site, look straight down, hold DIG.
	player.teleport(Vector3(0.5, 0.05, 0.5), 0.0, -1.5)
	await _physics(10)
	var money0: float = gs.money
	var vol0: float = field.dug_volume()
	world.force_dig = true
	await _physics(240)
	world.force_dig = false
	check(field.dug_volume() > vol0 + 0.5, "the shovel dug out %.2f m3" % (field.dug_volume() - vol0))
	check(gs.money > money0, "digging paid out (%.1f)" % (gs.money - money0))
	check(player.position.y < -0.4, "the player sank into the hole they dug (y %.2f)" % player.position.y)
	check(not player.collides(player.position + Vector3(0, 0.05, 0)), "...and isn't stuck inside the rock")
	check(player.strikes >= 6, "the shovel swung %d times in 4 s" % player.strikes)

	# --- Deeper rock pays more (per cubic metre).
	var r0: Dictionary = field.dig(Vector3(5.0, -4.0, 5.0), 0.8, 1e9)
	var r1: Dictionary = field.dig(Vector3(5.0, -30.0, 5.0), 0.8, 1e9)
	var v0: float = (r0.value + r0.ore_value) / maxf(r0.volume, 0.001)
	var v1: float = (r1.value + r1.ore_value) / maxf(r1.volume, 0.001)
	check(r0.points > 0 and r1.points > 0, "rock dug out at 4 m and at 30 m")
	check(v1 > v0 * 1.5, "clay pays more than topsoil: %.1f vs %.1f per m3" % [v1, v0])
	check(field.point_info(Vector3(5.0, -50.0, 5.0)).hp > field.point_info(Vector3(5.0, -10.0, 5.0)).hp, "and deeper rock is harder")

	# --- Phone controls: hold DIG, the stick, drag to look.
	hud.set_touch_mode(true)
	await _frames(1)
	var touch = hud.touch
	_touch(0, touch.dig_center(), true)
	await _frames(1)
	world._controls()
	check(touch.digging and player.digging, "holding the DIG button digs")
	_touch(1, Vector2(200, touch.size.y - 160), true)
	_drag(1, Vector2(200, touch.size.y - 240), Vector2(0, -80))
	await _frames(1)
	check(touch.move_vector.y > 0.5, "dragging the stick up walks forward (%s)" % touch.move_vector)
	var yaw0: float = player.yaw
	_touch(2, Vector2(touch.size.x * 0.6, 300), true)
	_drag(2, Vector2(touch.size.x * 0.6 + 60, 300), Vector2(60, 0))
	await _frames(1)
	world._controls()
	check(absf(player.yaw - yaw0) > 0.05, "dragging on the right turns the view")
	for i in 3:
		_touch(i, Vector2.ZERO, false)
	await _frames(1)
	world._controls()
	check(not player.digging and touch.move_vector == Vector2.ZERO, "letting go stops digging and walking")
	hud.set_touch_mode(false)

	# --- The 2x boost doubles income: dig a tunnel into the clay for the
	# same time with and without it (the rock is put back in between).
	_carve(field, Vector3(-4.0, -30.0, -4.0), 2.2)
	field.flush()
	var zone = field.zones[1]
	var saved = zone.f.duplicate()
	player.set_physics_process(false)
	var tool_before: int = gs.tool_index
	gs.tool_index = 1   # the pickaxe: the right tool for clay
	var runs := []
	for boosted in [false, true]:
		zone.f = saved.duplicate()
		player.position = Vector3(-3.0, -31.6, -4.0)
		player.set_view(-PI / 2.0, -0.1)   # facing +x, towards the middle of the site
		player._update_tool(0.0)
		if boosted:
			hud.watch_ad("boost")
			await _frames(3)
			check(gs.is_boost_active(), "watching the rewarded ad starts the 2x boost (%.0f s left)" % gs.boost_seconds_left())
		runs.append(await _dig_for(player, 8.0))
	player.set_physics_process(true)
	gs.tool_index = tool_before
	var ratio: float = runs[1][0] / maxf(runs[0][0], 0.001)
	check(runs[1][1] >= runs[0][1] * 1.8, "the boost swings twice as fast: %d vs %d strikes in 8 s" % [runs[1][1], runs[0][1]])
	# Income follows the strikes, give or take the rock (the boosted run tunnels
	# twice as far, into different ore and pockets).
	check(runs[0][0] > 0.0 and ratio > 1.5 and ratio < 2.5, "the boost doubles income (give or take the rock): %.1f vs %.1f (x%.2f)" % [runs[1][0], runs[0][0], ratio])
	hud.watch_ad("boost")
	await _frames(3)
	hud.watch_ad("boost")
	await _frames(3)
	hud.watch_ad("boost")
	await _frames(3)
	check(gs.boost_seconds_left() <= 900.5 and gs.boost_seconds_left() > 880.0, "boosts stack up to 15 min (%.0f s)" % gs.boost_seconds_left())
	gs.boost_until = 0.0
	zone.f = saved
	field._touch(0, 31, field.rows - 2 * field.ZN, field.rows - field.ZN - 1, 0, 31)
	field.flush()

	# --- The shop at the shack: open it, buy the pickaxe.
	gs.grant_money(500.0)
	player.teleport(world.surface.SHACK_DOOR + Vector3(0.6, 0.05, 0.0), 0.0)
	await _physics(5)
	world._update_near()
	check(world._near == "shop", "standing at the shack door offers the shop")
	world.use_context()
	await _frames(2)
	check(hud.shop != null, "the shop panel opens")
	var money_before: float = gs.money
	var row = hud.shop._list.get_child(1)
	var buy_button = row.get_child(0).get_child(2)
	buy_button.pressed.emit()
	await _frames(2)
	check(gs.tool_index == 1, "bought the %s" % gs.tool_def().name)
	check(absf(money_before - gs.money - float(gs.next_tool_cost() if false else 120.0)) < 0.01, "it cost 120")
	hud.shop.show_tab("upgrades")
	await _frames(1)
	var lv0: int = gs.upgrade_levels["power"]
	gs.grant_money(100.0)
	check(gs.buy_upgrade("power") and gs.upgrade_levels["power"] == lv0 + 1, "bought a Dig Power upgrade")
	hud.shop.show_tab("bonus")
	await _frames(1)
	hud.close_shop()
	await _frames(1)
	check(hud.shop == null, "the shop closes")

	# --- Remove Ads + permanent 2x (stubbed purchase).
	mon.buy(mon.PRODUCT_REMOVE_ADS_2X)
	await _frames(3)
	check(gs.owns_remove_ads and absf(gs.speed_mult() - 2.0) < 0.01, "Remove Ads is owned and digging is 2x for good")
	check(not mon.interstitial_allowed(), "no interstitials with Remove Ads")
	gs.owns_remove_ads = false

	# --- A find pops out when the rock around it is dug away.
	var f := 0
	var spot: Vector3 = field.find_spot(f)
	var before: float = gs.money
	_carve(field, spot, 0.9)
	await _frames(2)
	check(gs.found[f], "dug out the %s" % "find %d" % f)
	check(gs.money >= before + gs.find_value(f) * 0.99, "the find paid out")

	# --- Helpers: a mole digs on its own at the lift stop.
	gs.lift_stop = Vector3(-4.0, field.floor_below(Vector3(-4.0, -30.0, -4.0), 10.0), -4.0)
	gs.grant_money(1000.0)
	gs.buy_helper(0)
	gs.buy_helper(0)
	var hv0: float = gs.dug_volume
	await _seconds(6.0)
	check(gs.dug_volume > hv0, "the moles dug %.2f m3 by themselves" % (gs.dug_volume - hv0))

	# --- Dig a shaft, stand at the bottom: the lift stop follows you down.
	gs.helper_counts[0] = 0
	gs.lift_stop = Vector3.INF
	var y := 0.0
	while y > -14.0:
		_carve(field, Vector3(2.5, y, 2.5), 1.3)
		y -= 0.3
	field.flush()
	player.teleport(Vector3(2.5, -13.0, 2.5), 0.0)
	await _physics(60)
	await _frames(3)
	check(player.on_floor and player.position.y < -12.0, "standing at the bottom of a 14 m shaft (y %.1f)" % player.position.y)
	check(gs.lift_stop.is_finite() and gs.lift_stop.y < -12.0, "the lift stop came down with you (%s)" % gs.lift_stop)
	check(gs.deepest > 12.0, "deepest point recorded: %.1f m" % gs.deepest)

	# --- The lift: up to the shack, and back down to the bottom.
	world._update_near()
	check(world._near == "lift_stop", "next to the lift stop, the lift is offered")
	world.use_context()
	await _ride(world)
	check(player.position.distance_to(world.surface.LIFT_POS) < 3.0 and player.position.y > -0.5, "the lift took you up to the shack (%s)" % player.position)
	await _physics(5)
	player.teleport(world.surface.LIFT_POS + Vector3(0, 0.1, 0), 0.0)
	await _physics(5)
	world._update_near()
	check(world._near == "lift_top", "in the cage at the top, the lift is offered")
	world.use_context()
	await _ride(world)
	check(player.position.y < -12.0 and player.position.distance_to(gs.lift_stop) < 1.5, "the lift took you down to %.1f m" % -player.position.y)

	# --- Zones stream: go deep, the top zone is packed away and comes back.
	var deep := -62.0
	_carve(field, Vector3(0.0, deep, 0.0), 1.5)   # zone 2 isn't in memory yet: nothing happens
	player.set_physics_process(false)
	player.position = Vector3(0.0, deep, 0.0)
	world._stream(player.position)
	field.flush()
	check(field.is_loaded(2) and field.is_loaded(3) and not field.is_loaded(0), "deep down, zones 1-3 are loaded and the top zone is packed away")
	check(field.saves[0] != "", "...with its dug rock saved")
	player.position = Vector3(2.5, -13.0, 2.5)
	world._stream(player.position)
	field.flush()
	check(field.is_loaded(0) and not field.solid_at(Vector3(2.5, -6.0, 2.5)), "back up, zone 0 reloads with the shaft still dug")
	player.set_physics_process(true)
	player.teleport(Vector3(2.5, -13.0, 2.5), 0.0)

	# --- Dev and bot actions: buy by id, skip to a layer, time scale, income x10.
	gs.grant_money(1e6)
	check(gs.buy("jackhammer") and gs.tool_index == 2, "buy('jackhammer') works from code")
	check(gs.buy("size"), "buy('size') buys an upgrade")
	gs.income_mult = 10.0
	var im0: float = gs.money
	world.dig_at(Vector3(5.0, -20.0, -5.0), 0.7, 1e9)
	check(gs.money > im0, "income x10 still pays (%.0f)" % (gs.money - im0))
	gs.income_mult = 1.0
	world.skip_to_zone(3)
	await _physics(5)
	check(world.field.zone_of_y(player.position.y) == 3 and not player.collides(player.position + Vector3(0, 0.05, 0)), "skip to layer 4 puts you in the Fossil Bed, free (%.0f m)" % -player.position.y)
	Engine.time_scale = 5.0
	await _frames(2)
	Engine.time_scale = 1.0
	world.move_player(Vector3(2.5, -13.0, 2.5))

	# --- Save and load: everything, including the dug shaft.
	gs.save_game()
	var saved_money: float = gs.money
	var saved_tool: int = gs.tool_index
	var saved_deep: float = gs.deepest
	var saved_stop: Vector3 = gs.lift_stop
	var saved_found: int = gs.finds_count()
	world.queue_free()
	await _frames(2)
	gs.reset_state()
	check(gs.money == 0.0, "state cleared before loading")
	gs.load_game()
	check(absf(gs.money - saved_money) < 0.01 and gs.tool_index == saved_tool, "money and tool come back (%s, %s)" % [gs.money, gs.tool_def().name])
	check(absf(gs.deepest - saved_deep) < 0.01 and gs.lift_stop.distance_to(saved_stop) < 0.01, "deepest point and lift stop come back")
	check(gs.finds_count() == saved_found, "finds come back (%d)" % saved_found)
	var world2 = load("res://scenes/world.tscn").instantiate()
	root.add_child(world2)
	await _frames(3)
	var field2 = world2.field
	check(not field2.solid_at(Vector3(2.5, -8.0, 2.5)) and not field2.solid_at(Vector3(2.5, -12.0, 2.5)), "the dug shaft is still there after loading")
	check(field2.solid_at(Vector3(-6.0, -8.0, 6.0)), "and the rock you didn't dig is still rock")
	check(world2.player.position.distance_to(Vector3(2.5, -13.0, 2.5)) < 1.5, "you're back where you saved (%s)" % world2.player.position)
	check(not world2.player.collides(world2.player.position + Vector3(0, 0.05, 0)), "and not stuck in the rock")

	gs.wipe_save()
	print("SMOKE TEST " + ("PASSED" if ok else "FAILED"))
	quit(0 if ok else 1)
