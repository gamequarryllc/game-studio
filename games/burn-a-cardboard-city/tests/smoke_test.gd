extends SceneTree
## Headless smoke test: godot --headless -s res://tests/smoke_test.gd
## Builds the city and checks: fire spreads from a lit building to a neighbour; a
## building collapses at zero integrity, and when it hits the ground it sets a
## neighbour alight (both crumpling and toppling); burning pays coins and a
## collapse pays a lump; the tool lights what the crosshair is on; the phone
## controls; buying in the shop (and by id); the 2x rewarded boost doubles income;
## Remove Ads + permanent 2x; the offer tag names what it buys; fire trucks douse
## fires; helpers; dev boosts; a save/load round trip; the ending.
## Exits with code 1 if anything fails. Variables stay untyped where they hold
## scripts that use the autoloads (this compiles before they exist).

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


func _neighbour_pair(g: CityGrid, kind: int, max_gap: int) -> Array:
	## A structure of `kind` with a standing neighbour of the same kind, away from fire trucks.
	for s in g.count:
		if g.s_kind[s] != kind:
			continue
		var near_truck := false
		for t in g.trucks:
			if g.s_center[t].distance_to(g.s_center[s]) < 8.0:
				near_truck = true
		if near_truck:
			continue
		var nb: PackedInt32Array = g.s_nb[s]
		var ng: PackedByteArray = g.s_ngap[s]
		for i in nb.size():
			if g.s_kind[nb[i]] == kind and ng[i] <= max_gap:
				return [s, nb[i]]
	return []


func _run() -> void:
	var t0 := Time.get_ticks_msec()
	var gs = root.get_node("GameState")
	var mon = root.get_node("Monetization")
	gs.wipe_save(false)

	# --- The city and its fire, on their own ----------------------------------------
	var g := CityGrid.new()
	g.generate(Balance.WORLD_SEED)
	check(g.count > 400, "the city is built (%d structures)" % g.count)
	check(g.keep_id >= 0 and g.s_kind[g.keep_id] == Balance.KEEP, "the castle keep stands in the middle")
	check(g.trucks.size() >= 3, "toy fire trucks are parked in the streets (%d)" % g.trucks.size())
	check(g.burning.is_empty() and g.fallen == 0, "nothing is burning at the start")
	g.wind_strength = 0.0
	var pair := _neighbour_pair(g, Balance.HOUSE, 1)
	check(not pair.is_empty(), "found two neighbouring box houses")
	var a: int = pair[0]
	var b: int = pair[1]
	g.ignite(a)
	check(g.s_state[a] == CityGrid.BURNING, "a lit house burns")
	var spread := false
	var paid := 0.0
	for _k in 400:
		g.tick(0.1)
		paid += g.take_pay()
		if g.s_state[b] != CityGrid.STANDING:
			spread = true
			break
	check(spread, "fire spread from the lit house to its neighbour")
	for _k in 200:
		if g.s_state[a] >= CityGrid.FALLING:
			break
		g.tick(0.1)
		paid += g.take_pay()
	check(paid > 0.0, "burning paid coins (%.1f raw)" % paid)
	check(g.fallen >= 1 or g.s_state[a] >= CityGrid.FALLING, "the first house burned through and fell")

	# Collapse at zero integrity: a crumpling house lights the house next to it.
	var g2 := CityGrid.new()
	g2.generate(Balance.WORLD_SEED)
	g2.wind_strength = 0.0
	var p2 := _neighbour_pair(g2, Balance.HOUSE, 1)
	var h: int = p2[0]
	var nbr: int = p2[1]
	g2.ignite(h)
	g2.s_fire[h] = 1.0
	g2.s_integ[h] = 0.001
	g2.s_heat[nbr] = 0.0
	g2.tick(0.1)
	check(g2.s_state[h] == CityGrid.FALLING, "at zero integrity a house collapses")
	check(g2.s_state[nbr] == CityGrid.STANDING, "its neighbour is still standing as it falls")
	var bonus := 0.0
	for _k in 8:
		g2.tick(0.1)
	var imp: Array = g2.take("impacts")
	for e in imp:
		bonus += float(e[1])
	check(g2.s_state[h] == CityGrid.RUBBLE, "the house hits the ground as rubble")
	check(bonus > 0.0, "the collapse paid a lump of coins (%.1f raw)" % bonus)
	for _k in 3:
		g2.tick(0.1)
	check(g2.s_state[nbr] == CityGrid.BURNING, "the falling house set its neighbour alight")
	check(not g2.take("debris_new").is_empty(), "burning debris scattered round it")

	# A tall office box topples across onto what's beside it.
	var g3 := CityGrid.new()
	g3.generate(Balance.WORLD_SEED)
	g3.wind_strength = 0.0
	var tower := -1
	var victim := -1
	for s in g3.count:
		if g3.s_kind[s] != Balance.OFFICE:
			continue
		for d in 4:
			g3.s_fall[s] = d
			var strip := g3.fall_strip(s)
			for y in range(maxi(0, strip.position.y), mini(g3.n, strip.end.y)):
				for x in range(maxi(0, strip.position.x), mini(g3.n, strip.end.x)):
					var t := g3.sid[x + y * g3.n]
					if t >= 0 and t != s and g3.s_kind[t] == Balance.OFFICE and victim < 0:
						victim = t
		if victim >= 0:
			tower = s
			break
		g3.s_fall[s] = CityGrid.CRUMPLE
	check(tower >= 0, "found an office box with another in reach if it falls")
	g3.ignite(tower)
	g3.s_fire[tower] = 1.0
	g3.s_integ[tower] = 0.001
	g3.tick(0.1)
	check(g3.s_state[tower] == CityGrid.FALLING and g3.s_fall[tower] != CityGrid.CRUMPLE, "a tall building topples")
	for _k in 14:
		g3.tick(0.1)
	var lit_by_fall := false
	for s in g3.count:
		if s != tower and g3.s_state[s] == CityGrid.BURNING:
			lit_by_fall = true
	check(g3.s_state[tower] == CityGrid.RUBBLE and lit_by_fall, "the toppled tower set what it landed on alight")

	# Fire trucks squirt water at fires near them.
	var g4 := CityGrid.new()
	g4.generate(Balance.WORLD_SEED)
	var truck: int = g4.trucks[0]
	var near := -1
	for s in g4.count:
		if g4.s_kind[s] == Balance.HOUSE and g4.s_center[s].distance_to(g4.s_center[truck]) < Balance.SPRAY_RANGE - 0.3:
			near = s
			break
	if near >= 0:
		g4.ignite(near)
		g4.truck_t[truck] = 0.0
		g4.tick(0.1)
		check(not g4.take("sprays").is_empty(), "a toy fire truck squirts water at a fire near it")
	var dry_truck: int = g4.trucks[0]
	for t in g4.trucks:
		if g4.s_thresh[t] <= float(Balance.KINDS[Balance.TRUCK].ignite) * 1.3 and g4.s_state[t] == CityGrid.STANDING:
			dry_truck = t
	check(not g4.can_light(dry_truck, Balance.TOOLS[0].power) and g4.can_light(dry_truck, Balance.TOOLS[1].power),
		"the magnifying glass can't light a fire truck; the candle can")

	# --- The game ----------------------------------------------------------------------
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await _frames(3)
	print("    world built in %d ms" % (Time.get_ticks_msec() - t0))
	var city = world.city
	var hud = world.hud
	var giant = world.giant
	check(world.view.flame_count() == 0, "no flames at the start")

	# The tool lights what's under the crosshair.
	var house := -1
	for s in city.count:
		if city.s_kind[s] == Balance.HOUSE and city.s_zone[s] == 0 and city.s_center[s].y > 18.0:
			house = s
			break
	var hc: Vector2 = city.s_center[house]
	world.move_giant_to(Vector3(hc.x, 0, hc.y + 3.5), Vector3(hc.x, 0.3, hc.y))
	check(giant.aim.sid == house and giant.aim.in_range, "the crosshair lands on the house in front of the giant")
	world.force_fire = true
	world._controls()
	giant._update_tool(0.016)
	check(city.sources.has("tool"), "holding the tool focuses heat on it")
	var lit := false
	for _k in 40:
		city.tick(0.1)
		if city.s_state[house] != CityGrid.STANDING:
			lit = true
			break
	world.force_fire = false
	world._controls()
	giant._update_tool(0.016)
	check(lit, "the magnifying glass set the house alight")
	check(not city.sources.has("tool"), "letting go stops the heat")
	var office := -1
	for s in city.count:
		if city.s_kind[s] == Balance.OFFICE and city.s_state[s] == CityGrid.STANDING:
			office = s
			break
	check(not city.can_light(office, gs.tool_power()), "the magnifying glass can't light an office box")
	check(world.ignite_at(Vector3(city.s_center[office].x, 0, city.s_center[office].y), 500.0), "ignite_at() lights a building from code")
	for _k in 5:
		city.tick(0.1)
	world._after_tick()
	check(world.view.flame_count() > 0, "burning buildings get paper flames")

	# Phone controls.
	hud.set_touch_mode(true)
	await _frames(1)
	var touch = hud.touch
	_touch(0, touch.fire_center(), true)
	await _frames(1)
	world._controls()
	check(touch.firing and giant.firing, "holding the fire button burns")
	_touch(1, Vector2(200, touch.size.y - 160), true)
	_drag(1, Vector2(200, touch.size.y - 250), Vector2(0, -90))
	await _frames(1)
	check(touch.move_vector.y > 0.5, "the left stick walks forward (%s)" % touch.move_vector)
	var yaw0: float = giant.yaw
	_touch(2, Vector2(touch.size.x * 0.6, 300), true)
	_drag(2, Vector2(touch.size.x * 0.6 + 60, 300), Vector2(60, 0))
	await _frames(1)
	world._controls()
	check(absf(giant.yaw - yaw0) > 0.05, "dragging the right side looks round")
	_touch(0, touch.fire_center(), false)
	_touch(1, Vector2(200, touch.size.y - 250), false)
	_touch(2, Vector2(touch.size.x * 0.6 + 60, 300), false)
	await _frames(1)
	world._controls()
	check(not giant.firing and touch.move_vector == Vector2.ZERO, "letting go stops burning and walking")
	_touch(3, touch.jump_center(), true)
	await _frames(1)
	world._controls()
	_touch(3, touch.jump_center(), false)
	check(giant.jumped > 0, "the jump tag jumps")
	# Walking: houses can be stepped over, skyscrapers can't.
	var sky := -1
	for s in city.count:
		if city.s_kind[s] == Balance.SKY:
			sky = s
			break
	check(giant.is_blocked(city.s_center[sky], 0.0), "a skyscraper is too tall to step over")
	var other := -1
	for s in city.count:
		if city.s_kind[s] == Balance.HOUSE and city.s_state[s] == CityGrid.STANDING and s != house:
			other = s
			break
	check(not giant.is_blocked(city.s_center[other], 0.0), "box houses are low enough to step over")

	# The shop box.
	hud.open_shop()
	await _frames(2)
	check(hud.shop != null and not giant.input_enabled, "the shop box opens and pauses the giant")
	gs.coins = 1000.0
	check(gs.buy_tool(1) and gs.tool_index == 1 and is_equal_approx(gs.coins, 850.0), "bought the candle for 150 coins")
	check(city.can_light(office, gs.tool_power()) or city.s_state[office] != CityGrid.STANDING, "the candle lights office boxes")
	check(not gs.buy_tool(3), "can't skip ahead to the rockets")
	var lv: int = gs.upgrade_levels["dry"]
	check(gs.buy("upgrade:dry") and gs.upgrade_levels["dry"] == lv + 1, "bought dry cardboard by id")
	check(gs.buy("helper:windup") and gs.helper_counts[0] == 1, "got a wind-up car by id")
	for tab in ["tools", "upgrades", "helpers", "free", "shop", "finds", "settings", "dev"]:
		hud.shop.select(tab)
		await _frames(1)
	check(hud.shop.tab == "dev", "every tab of the box opens (dev included in playtest)")
	hud.close_shop()
	await _frames(2)
	check(hud.shop == null and giant.input_enabled, "the box closes")
	check(world.helpers.count() == 1, "the wind-up car came out to help")

	# The 2x rewarded boost doubles income.
	gs.boost_until = 0.0
	gs.owns_remove_ads_2x = false
	var plain: float = gs.earn(100.0)
	var power_plain: float = gs.tool_power()
	hud.watch_ad("boost")
	await _frames(1)
	check(mon.is_watching(), "the rewarded ad starts (stub)")
	mon.provider._close()
	mon._on_rewarded_completed(mon.PLACEMENT_BOOST)
	await _frames(1)
	check(gs.is_boost_active() and gs.boost_seconds_left() > 290.0, "watching it starts 2x fire for 5 min")
	var boosted: float = gs.earn(100.0)
	check(is_equal_approx(boosted, plain * 2.0), "the boost doubles income (%.0f -> %.0f)" % [plain, boosted])
	check(is_equal_approx(gs.tool_power(), power_plain * 2.0), "the boost doubles the tool's power")
	for _k in 4:
		gs.start_boost()
	check(gs.boost_seconds_left() <= 900.5 and gs.boost_full(), "the boost stacks to 15 min and no further")

	# Remove Ads + permanent 2x.
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

	# The timed offer tag names what it buys.
	gs.tool_index = 1
	gs.coins = 1500.0
	gs.instant_ready_at = 0.0
	gs._income = [40.0, 40.0, 40.0, 40.0]
	var offers_script = load("res://scripts/ad_offers.gd")
	var line: String = offers_script.headline("instant")
	check(line.begins_with("Free: +") and line.contains("blowtorch"), "offer tag: \"%s\"" % line)
	check(offers_script.new().pick() == "instant", "the offer worth taking comes first")

	# Dev boosts.
	gs.dev_income = 10.0
	check(is_equal_approx(gs.earn(100.0), plain * 10.0), "dev income x10 multiplies coins")
	gs.dev_income = 1.0
	Engine.time_scale = 5.0
	check(Engine.time_scale == 5.0, "dev time scale")
	Engine.time_scale = 1.0

	# Save / load round trip.
	for _k in 30:
		city.tick(0.1)
	gs.coins = 4321.5
	gs.tool_index = 2
	gs.upgrade_levels["glue"] = 3
	gs.owns_golden = true
	gs.citizens_saved = 7
	gs.note_find("sock")
	gs.save_game()
	var saved_city: String = city.to_save_string()
	var fallen_before := 0
	for s in city.count:
		if city.s_state[s] >= CityGrid.FALLING:
			fallen_before += 1
	gs.reset_state()
	check(gs.coins == 0.0 and gs.tool_index == 0, "state reset")
	gs.load_game()
	check(is_equal_approx(gs.coins, 4321.5) and gs.tool_index == 2 and gs.upgrade_levels["glue"] == 3 \
		and gs.owns_golden and gs.citizens_saved == 7 and int(gs.finds.get("sock", 0)) == 1,
		"coins, tools, upgrades, purchases, stats and finds load back")
	check(gs.city_save == saved_city, "the city's state was saved")
	var g5 := CityGrid.new()
	g5.generate(Balance.WORLD_SEED)
	g5.load_save_string(gs.city_save)
	check(g5.fallen == fallen_before and fallen_before > 0, "a reloaded city keeps its rubble (%d)" % g5.fallen)

	# The ending: the keep falls.
	city.ignite(city.keep_id)
	city.s_fire[city.keep_id] = 1.0
	city.s_integ[city.keep_id] = 0.001
	for _k in 12:
		city.tick(0.1)
	gs.check_win()
	await _frames(2)
	check(gs.has_won, "bringing down the keep ends the game")
	check(hud.popups.get_child_count() > 0, "the ending shows its stats")

	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	print("SMOKE TEST %s in %d ms" % ["PASSED" if ok else "FAILED", Time.get_ticks_msec() - t0])
	quit(0 if ok else 1)
