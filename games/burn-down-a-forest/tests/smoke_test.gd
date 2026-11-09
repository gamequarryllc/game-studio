extends SceneTree
## Headless smoke test: godot --headless -s res://tests/smoke_test.gd
## Builds the forest, lights a cell and checks the fire spreads to a neighbour,
## that burning pays embers, that the tool lights what the crosshair is on,
## the phone controls, buying in the notebook, the 2x rewarded boost (it doubles
## income), Remove Ads + permanent 2x, the offer tag's wording, helpers, a
## save/load round trip, and the ending. Exits with code 1 if anything fails.
## Variables stay untyped: this script compiles before the GameState autoload
## exists, so it can't name classes that use it (World, Keeper, Hud...).

var ok := true


func check(cond: bool, what: String) -> void:
	print(("  ok    " if cond else "  FAIL  ") + what)
	if not cond:
		ok = false


func _initialize() -> void:
	create_timer(240.0).timeout.connect(func():
		print("SMOKE TEST TIMED OUT")
		quit(2))
	_run.call_deferred()


func _frames(n: int) -> void:
	for _i in n:
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


func _run() -> void:
	var t0 := Time.get_ticks_msec()
	var gs = root.get_node("GameState")
	var mon = root.get_node("Monetization")
	gs.wipe_save(false)
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await _frames(3)
	print("    world built in %d ms" % (Time.get_ticks_msec() - t0))
	var f = world.forest
	var hud = world.hud
	var keeper = world.keeper
	check(f != null and f.total_flammable > 3000, "forest built (%d cells that can burn)" % f.total_flammable)
	check(f.burning.size() == 0 and f.burned == 0, "nothing burning at the start")
	check(f.kind[f.elder_cell] == 5, "the Elder Tree stands at the heart")

	# --- Fire spreads from one cell to its neighbours.
	var start := -1
	for i in f.kind.size():
		var x: int = i % f.n
		var y: int = i / f.n
		if x < 2 or y < 2 or x > f.n - 3 or y > f.n - 3 or f.kind[i] != 0 or f.damp[i] == 1:
			continue
		var all_grass := true
		for d in 8:
			var j: int = (x + f.DX[d]) + (y + f.DY[d]) * f.n
			if f.kind[j] != 0 or f.damp[j] == 1:
				all_grass = false
		if all_grass:
			start = i
			break
	check(start >= 0, "found a patch of dry cursed grass")
	f.ignite(start)
	check(f.state[start] == 1, "a lit cell burns")
	var spread := false
	for _t in 150:
		f.tick(0.1)
		var sx: int = start % f.n
		var sy: int = start / f.n
		for d in 8:
			if f.state[(sx + f.DX[d]) + (sy + f.DY[d]) * f.n] != 0:
				spread = true
		if spread:
			break
	check(spread, "fire spread from the lit cell to a neighbour")
	for _t in 60:
		f.tick(0.1)
	check(f.burned > 1, "cells burned out to ash (%d so far)" % f.burned)

	# --- Burning pays embers.
	var e0: float = gs.embers
	var raw: float = f.take_pay()
	var got: float = gs.earn(raw)
	check(raw > 0.0 and got > 0.0 and gs.embers > e0, "burning paid %.1f embers" % got)
	for _t in 200:
		f.tick(0.1)
	check(f.state[start] == 3, "ash turned into a meadow")

	# --- The tool lights what's under the crosshair.
	keeper.position = Vector3(0, f.height_at(0, 53), 53)
	keeper.set_view(0.0, -0.6)
	keeper.update_aim()
	var aim_cell: int = keeper.aim.cell
	check(aim_cell >= 0 and keeper.aim.in_range, "the crosshair lands on the forest in front of the keeper")
	keeper.firing = true
	keeper._update_tool(0.016)
	check(f.sources.has("tool"), "holding the tool heats the forest")
	var lit := false
	for _t in 30:
		f.tick(0.1)
		if f.burning.size() > 0 or f.state[aim_cell] != 0:
			lit = true
			break
	keeper.firing = false
	keeper._update_tool(0.016)
	check(lit, "the matchstick set the cursed grass alight")
	check(not f.sources.has("tool"), "letting go stops the heat")
	var pine := -1
	for i in f.kind.size():
		if f.kind[i] == 2 and f.state[i] == 0 and f.damp[i] == 0:
			pine = i
			break
	check(not f.can_light(pine, gs.tool_heat()), "the matchstick can't light a cursed pine")

	# --- Phone controls.
	hud.set_touch_mode(true)
	await _frames(1)
	var touch = hud.touch
	_touch(0, touch.fire_center(), true)
	await _frames(1)
	world._controls()
	check(touch.firing and keeper.firing, "holding the 🔥 button burns")
	_touch(1, Vector2(200, touch.size.y - 160), true)
	_drag(1, Vector2(200, touch.size.y - 250), Vector2(0, -90))
	await _frames(1)
	check(touch.move_vector.y > 0.5, "the left stick walks forward (%s)" % touch.move_vector)
	var yaw0: float = keeper.cam_yaw
	_touch(2, Vector2(touch.size.x * 0.6, 300), true)
	_drag(2, Vector2(touch.size.x * 0.6 + 60, 300), Vector2(60, 0))
	await _frames(1)
	world._controls()
	check(absf(keeper.cam_yaw - yaw0) > 0.05, "dragging the right side orbits the camera")
	_touch(0, touch.fire_center(), false)
	_touch(1, Vector2(200, touch.size.y - 250), false)
	_touch(2, Vector2(touch.size.x * 0.6 + 60, 300), false)
	await _frames(1)
	world._controls()
	check(not keeper.firing and touch.move_vector == Vector2.ZERO, "letting go stops burning and walking")
	_touch(3, touch.jump_center(), true)
	await _frames(1)
	world._controls()
	_touch(3, touch.jump_center(), false)
	check(keeper.jumped > 0, "the JUMP button jumps")

	# --- The notebook (shop).
	hud.open_notebook()
	await _frames(1)
	check(hud.notebook != null and not keeper.input_enabled, "the notebook opens full screen and pauses the keeper")
	gs.embers = 1000.0
	check(gs.buy_tool(1) and gs.tool_index == 1 and is_equal_approx(gs.embers, 750.0), "bought the Lighter for 250 embers")
	check(f.can_light(pine, gs.tool_heat()), "the Lighter can light a cursed pine")
	check(not gs.buy_tool(3), "can't skip ahead to the Flamethrower")
	var lv: int = gs.upgrade_levels["heat"]
	check(gs.buy_upgrade("heat") and gs.upgrade_levels["heat"] == lv + 1, "bought Hotter Flame")
	check(gs.buy_helper(0) and gs.helper_counts[0] == 1, "hired a Fire Sprite")
	for tab in ["tools", "upgrades", "helpers", "magic", "shop", "settings"]:
		hud.notebook.select(tab)
	await _frames(1)
	check(hud.notebook.tab == "settings", "every notebook chapter opens")
	hud.close_notebook()
	await _frames(2)
	check(hud.notebook == null and keeper.input_enabled, "the notebook closes")
	check(world.helpers._walkers.size() == 1, "the Fire Sprite came out to help")

	# --- The 2x rewarded boost doubles income.
	gs.boost_until = 0.0
	gs.owns_remove_ads_2x = false
	var plain: float = gs.earn(100.0)
	var heat_plain: float = gs.tool_heat()
	hud.watch_ad("boost")
	await _frames(1)
	check(mon.is_watching(), "the rewarded ad starts (stub)")
	mon.provider._close()
	mon._on_rewarded_completed(mon.PLACEMENT_BOOST)
	await _frames(1)
	check(gs.is_boost_active() and gs.boost_seconds_left() > 290.0, "watching it starts 2x fire for 5 min")
	var boosted: float = gs.earn(100.0)
	check(is_equal_approx(boosted, plain * 2.0), "the boost doubles income (%.0f -> %.0f)" % [plain, boosted])
	check(is_equal_approx(gs.tool_heat(), heat_plain * 2.0), "the boost doubles the tool's heat")
	for _k in 4:
		gs.start_boost()
	check(gs.boost_seconds_left() <= 900.5 and gs.boost_full(), "the boost stacks to 15 min and no further")

	# --- Remove Ads + permanent 2x.
	gs.boost_until = 0.0
	mon.buy(mon.PRODUCT_REMOVE_ADS_2X)
	await create_timer(0.6).timeout
	check(gs.owns_remove_ads_2x and mon.owns(mon.PRODUCT_REMOVE_ADS_2X), "Remove Ads purchase granted (stub)")
	check(is_equal_approx(gs.earn(100.0), plain * 2.0), "Remove Ads doubles income for good")
	gs.play_time = 9999.0
	check(not mon.maybe_show_interstitial("test"), "no interstitials with Remove Ads")
	gs.owns_remove_ads_2x = false
	mon._last_interstitial = 0.0
	gs.play_time = 10.0
	check(not mon.maybe_show_interstitial("test"), "no interstitials in the first minutes")

	# --- The timed offer tag names what it buys.
	gs.tool_index = 1
	gs.embers = 4000.0
	gs.instant_ready_at = 0.0
	gs._income = [150.0, 150.0, 150.0, 150.0]
	var offers_script = load("res://scripts/ad_offers.gd")
	var line: String = offers_script.headline("instant")
	check(line.begins_with("FREE: +") and line.contains("Tiki Torch"), "offer tag: \"%s\"" % line)
	check(offers_script.new().pick() == "instant", "the offer worth taking comes first")

	# --- Save / load round trip.
	gs.embers = 1234.5
	gs.tool_index = 2
	gs.upgrade_levels["wind"] = 3
	gs.owns_phoenix = true
	gs.critters_saved = 7
	gs.save_game()
	var saved_forest: String = f.to_save_string()
	var burned_before: int = f.burned
	gs.reset_state()
	check(gs.embers == 0.0 and gs.tool_index == 0, "state reset")
	gs.load_game()
	check(is_equal_approx(gs.embers, 1234.5) and gs.tool_index == 2 and gs.upgrade_levels["wind"] == 3 \
		and gs.owns_phoenix and gs.critters_saved == 7, "embers, tools, upgrades, purchases and stats load back")
	check(gs.forest_save == saved_forest, "the forest's cells were saved")
	var g2 = ForestGrid.new()
	g2.generate(1)   # wrong seed on purpose is fine: same size
	g2.generate(Balance.WORLD_SEED)
	g2.load_save_string(gs.forest_save)
	check(g2.burned + g2.burning.size() >= burned_before, "a reloaded forest keeps its ash and meadows (%d)" % g2.burned)

	# --- The ending: the Elder Tree burns and the curse lifts.
	f.ignite(f.elder_cell)
	for _t in 320:
		f.tick(0.1)
	gs.check_win()
	await _frames(2)
	check(gs.has_won, "burning the Elder Tree lifts the curse")
	check(hud.popups.get_child_count() > 0, "the ending shows its stats")

	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	print("SMOKE TEST %s in %d ms" % ["PASSED" if ok else "FAILED", Time.get_ticks_msec() - t0])
	quit(0 if ok else 1)
