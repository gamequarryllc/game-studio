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
	check(touch.firing and keeper.firing, "holding the burn button burns")
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
	gs.embers = float(Balance.TOOLS[2].cost) * 0.75
	gs.instant_ready_at = 0.0
	gs._income = [150.0, 150.0, 150.0, 150.0]
	var offers_script = load("res://scripts/ad_offers.gd")
	var line: String = offers_script.headline("instant")
	check(line.begins_with("Free: ") and line.contains("tiki torch") and not line.contains("!"), "offer tag: \"%s\"" % line)
	check(offers_script.new().pick() == "instant", "the offer worth taking comes first")
	check(not offers_script.eligible(""), "no earlier offer is fine (it used to log an error every 20 s)")


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

	# --- Regression checks for bugs the playtests found (NOTES.md, QA).
	# A fire front (3 burning neighbours, strong wind, Dry Winds maxed) never
	# lights the next tougher kind of tree: no whole-forest jackpots.
	var dry := 1.0 + float(Balance.UPGRADES[1].per_level) * float(Balance.UPGRADES[1].max)
	var jackpot := false
	for k in range(Balance.BUSH, Balance.GIANT):
		var push := float(Balance.PLANTS[k].heat) * Balance.TIER_UP * 3.0 * 1.6 * dry * 1.45 / Balance.COOL
		if push >= float(Balance.PLANTS[k + 1].ignite) * 0.75:
			jackpot = true
	check(not jackpot, "a fire front can't light the next tier of tree by itself")
	check(float(Balance.PLANTS[Balance.ELDER].ignite) * Balance.COOL / 0.97 > float(Balance.TOOLS[4].heat) * gs.upgrade_mult("heat") * 0 + float(Balance.TOOLS[4].heat) * (1.0 + float(Balance.UPGRADES[0].per_level) * float(Balance.UPGRADES[0].max)) * Balance.PHOENIX_HEAT,
		"the Elder Tree needs the meteor shower (every tool is part of the run)")
	# Golden critters can't pay for the game during a jackpot fire.
	gs._income = [1e7, 1e7, 1e7, 1e7]
	gs.tool_index = 2
	check(gs.golden_amount() <= float(Balance.TOOLS[3].cost) * 0.25 + 1.0, "a golden critter pays at most a quarter of the next tool")
	gs.tool_index = Balance.TOOLS.size() - 1
	check(gs.golden_amount() <= 20000.0, "with every tool bought, a golden critter is still capped")
	gs._income = []
	# The keeper looks into the woods at spawn, not back at the camera.
	keeper.set_view(0.0, -0.5)
	check(absf(wrapf(keeper._facing - PI, -PI, PI)) < 0.01, "the keeper faces where the camera looks")
	# Flames standing between the camera and the keeper shrink away (they know where the keeper is).
	world.view.set_camera(keeper.camera.global_position, keeper.position + Vector3(0, 1.9, 0))
	check((world.view.flame_mat.get_shader_parameter("focus_pos") as Vector3).distance_to(keeper.position) < 2.5, "the flames know where the keeper is (so they never hide them)")
	# The ground's meadow mask is set (unset, it defaulted to white: meadow everywhere).
	check(world.view.ground_mat.get_shader_parameter("meadow") != null, "the ground has its meadow mask")
	# Grass and bushes are flagged so the round window never cuts holes in them.
	var flagged: bool = world.view.standing_flag(0) < 0.75 and world.view.standing_flag(1) < 0.75 and world.view.standing_flag(2) >= 0.75
	check(flagged, "grass is spared by the see-through window")
	# In the thick of the grove the camera rises over the canopy, never inside it.
	keeper.position = Vector3(3.0, f.height_at(3.0, 6.0), 6.0)
	keeper.set_view(0.3, -0.5)
	var cam: Vector3 = keeper.camera.global_position
	check(keeper.canopy_top_at(cam) < cam.y, "the camera is never inside a canopy (%.1f m up)" % cam.y)
	check(keeper._pitch_eff < keeper.cam_pitch - 0.2, "the camera tilts down in the dense rings")
	keeper.set_view(0.3, -0.2)
	check(keeper._pitch_eff > -0.6, "in the dense rings the player can still raise the camera to aim far (%.2f rad)" % keeper._pitch_eff)
	# Aiming at the Elder Tree's trunk lands on the Elder (its trunk is wider than a cell).
	f.dev_clear_outside(Balance.ZONES.size())     # the grove's giants burned: the Elder stands alone
	var ec: Vector3 = f.cell_pos(f.elder_cell)
	keeper.position = Vector3(ec.x, f.height_at(ec.x, ec.z + 8.0), ec.z + 8.0)
	var on_elder := false
	for pp in [-0.6, -0.5, -0.4, -0.35, -0.3]:
		keeper.set_view(0.0, pp)
		keeper.update_aim()
		if keeper.aim.cell == f.elder_cell:
			on_elder = true
	check(on_elder, "the crosshair can land on the Elder Tree's trunk")
	# The safety net: nothing left the matchstick can light and too poor for the lighter.
	var g3 = ForestGrid.new()
	g3.generate(Balance.WORLD_SEED)
	check(g3.any_lightable(8.0) and not g3.any_lightable(0.5), "the forest knows what a tool can still light")
	check(not g3.any_lightable(8.0, 100000), "a few stray cells don't count as something left to burn")
	gs.tool_index = 0
	gs.embers = 120.0
	gs.stuck = true
	check(gs.tool_cost(1) <= 120.0 and gs.buy_tool(1), "stuck with nothing to burn, the next tool is yours for what you have")
	gs.stuck = false
	check(gs.tool_cost(2) == float(Balance.TOOLS[2].cost), "otherwise tools cost their price")
	# The fire keeps up when time runs faster (developer time scale).
	var g4 = ForestGrid.new()
	g4.generate(Balance.WORLD_SEED)
	Engine.time_scale = 10.0
	g4.step(1.0)
	Engine.time_scale = 1.0
	check(g4.ticks >= 9, "at 10x time the fire ticks 10x (%d ticks in a 1 s frame)" % g4.ticks)
	# Interstitials and boosts run on the game's clock, not the wall clock.
	gs.play_time = 9999.0
	mon._last_interstitial = gs.now()
	gs._clock += Balance.INTERSTITIAL_COOLDOWN + 1.0
	check(mon.maybe_show_interstitial("test"), "the interstitial cooldown follows the game's clock")
	await _frames(1)
	var layer = mon.provider.get("_layer")
	if layer != null:
		for n in layer.find_children("*", "Button", true, false):
			n.pressed.emit()
	mon.provider._close()
	mon._interstitial_open = false
	# Two ads asked for at once: the second is refused with an answer, nothing stays stuck.
	var answers: Array = []
	mon.show_rewarded(mon.PLACEMENT_BOOST, func(ok): answers.append(["boost", ok]))
	mon.show_rewarded(mon.PLACEMENT_INSTANT, func(ok): answers.append(["instant", ok]))
	await _frames(2)
	check(answers.size() == 1 and answers[0][0] == "instant" and answers[0][1] == false, "an ad asked for during another is refused, not dropped")
	mon.provider._close()
	mon._on_rewarded_failed(mon.PLACEMENT_BOOST, "test")
	await _frames(1)
	check(not mon.is_showing_ad() and answers.size() == 2, "after the first ad closes nothing is left waiting")
	keeper.input_enabled = true
	# On a phone everything says tap.
	hud.set_touch_mode(true)
	hud.show_golden(500.0)
	hud._update_find(0.016)
	check(hud._find_label.text.contains("Tap") and not hud._find_label.text.contains("Click"), "phones say tap, not click")
	hud.find_tag.visible = false
	hud.set_touch_mode(false)
	# The notebook doesn't change width between chapters (Free magic used to widen and clip the tabs).
	hud.open_notebook("tools")
	await _frames(2)
	var widths: Array = []
	for tab in ["tools", "upgrades", "helpers", "magic", "shop", "settings"]:
		hud.notebook.select(tab)
		await _frames(2)
		widths.append(hud.notebook._scroll.get_parent().size.x)
	check(widths.max() - widths.min() < 1.0, "every notebook chapter is the same width (%s)" % str(widths))
	# Locked tools are pencil sketches; the price tag itself is the buy button.
	hud.notebook.select("tools")
	await _frames(1)
	var locked_ok := false
	for c in hud.notebook._cards:
		if (c.title as Label).text == str(Balance.TOOLS[5].name):
			locked_ok = (c.button as UiParts.PriceTag).locked and (c.icon as UiParts.Sketch).pencil
	check(locked_ok, "tools out of reach are drawn in pencil")
	# Developer tools: skip to a ring, unlock everything.
	gs.dev_skip_to_ring(2)
	check(f.zone_progress(0) > 0.99 and f.zone_progress(1) > 0.99 and gs.tool_index >= 2, "skip to a ring burns the rings outside it and hands over its tool")
	gs.dev_unlock_all()
	check(gs.tool_index == Balance.TOOLS.size() - 1 and gs.upgrade_maxed("heat"), "unlock everything works")
	hud.close_notebook()
	await _frames(1)

	# --- The ending: the Elder Tree burns and the curse lifts.
	f.ignite(f.elder_cell)
	for _t in 320:
		f.tick(0.1)
	gs.check_win()
	await _frames(2)
	check(gs.has_won, "burning the Elder Tree lifts the curse")
	check(hud.ending_active and not hud.root.visible and keeper.cinematic, "the ending hides the HUD and takes the camera for the dawn sweep")
	check(f.lifted, "the curse lifts: whatever's left of the forest withers (%d cells here)" % f.withered.size())
	world._update_ending(9.5)
	await _frames(1)
	check(hud.ending_letter_shown(), "after the sweep, the letter shows the stats")
	check(world._dawn > 0.99, "it's dawn over the valley")
	check(world.env.fog_density < world.FOG_DENSITY * 0.6, "the dawn air clears (the hill woods keep their shapes)")
	var trail := -1
	for i in f.kind.size():
		if f.kind[i] == 8 and i / f.n < f.n - 12 and i / f.n > 10:
			trail = i
			break
	check(trail >= 0 and world.view._meadow_img.get_pixel(trail % f.n, trail / f.n).r > 0.5, "with the curse lifted, the old trails green over too")
	hud.close_ending()
	await _frames(1)
	check(not hud.ending_active and hud.root.visible and keeper.input_enabled and not keeper.cinematic, "walking the meadow brings the HUD and the keeper back")

	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	print("SMOKE TEST %s in %d ms" % ["PASSED" if ok else "FAILED", Time.get_ticks_msec() - t0])
	quit(0 if ok else 1)
