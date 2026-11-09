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

	# A building caught mid-fall by a save comes back burning (its collapse still to pay), not as rubble.
	var g6 := CityGrid.new()
	g6.generate(Balance.WORLD_SEED)
	var f6 := -1
	for s in g6.count:
		if g6.s_kind[s] == Balance.HOUSE:
			f6 = s
			break
	g6.ignite(f6)
	g6.s_fire[f6] = 1.0
	g6.s_integ[f6] = 0.001
	g6.tick(0.1)
	check(g6.s_state[f6] == CityGrid.FALLING and g6.to_save_string()[f6] == "1", "a save made while a house is falling keeps it burning")
	var g7 := CityGrid.new()
	g7.generate(Balance.WORLD_SEED)
	# No dead ends: every building (damp or not) can be lit by the tool it's meant for at base
	# power, without upgrades. (The bot once stood at the castle with rockets that couldn't
	# light the damp towers by the moat, and nothing left to earn the upgrade with.)
	var unreachable := 0
	for s in g7.count:
		if s != g7.keep_id and not g7.can_light(s, float(Balance.TOOLS[Balance.TIER[g7.s_kind[s]]].power)):
			unreachable += 1
	check(unreachable == 0, "every building can be lit by its own tool at base power (%d can't)" % unreachable)
	g7.load_save_string(g6.to_save_string())
	check(g7.fallen == 0, "and the reloaded city doesn't count it as down yet")
	# The keep stays shielded until most of its walls and towers are down.
	check(g7.keep_shielded(g7.keep_id) and not g7.can_light(g7.keep_id, 99999.0), "the keep won't catch while its walls stand")
	for s in g7.count:
		if g7.s_zone[s] == 3 and s != g7.keep_id:
			g7.s_state[s] = CityGrid.RUBBLE
			g7.zone_fallen[3] += 1
	check(not g7.keep_shielded(g7.keep_id) and g7.can_light(g7.keep_id, 99999.0), "with the walls down the keep can burn")

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
	# A truck's tank runs dry (it used to protect its street forever, with the candle
	# gated behind those same houses: a dead end the playthrough bot found).
	g4.truck_water[truck] = 1
	for s in g4.count:
		if g4.s_kind[s] == Balance.HOUSE and g4.s_center[s].distance_to(g4.s_center[truck]) < Balance.SPRAY_RANGE - 0.3 and g4.s_state[s] == CityGrid.STANDING:
			g4.ignite(s)
	for _k in 60:
		g4.tick(0.1)
	check(g4.truck_dry(truck), "a fire truck runs out of water")
	var sprays_before: int = g4.take("sprays").size()
	for _k in 40:
		g4.tick(0.1)
	check(g4.take("sprays").is_empty(), "and then stops squirting")

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
	for _k in 60:
		giant._update_tool(0.1)
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

	# The district tag: the district you're in, and a notch where the next tool goes on sale.
	world.move_giant_to(Vector3(0.6, 0.0, 33.6), Vector3(0.0, 0.0, 0.0))
	hud._refresh()
	check(hud.zone_label.text == str(Balance.ZONES[0].name) and is_equal_approx(hud.zone_bar.gate, float(Balance.TOOL_GATE[1]))
		and is_equal_approx(hud.zone_bar.value, city.zone_progress(0)), "the district tag shows the suburbs' own progress and the candle's notch")

	# The shop box.
	hud.open_shop()
	await _frames(2)
	check(hud.shop != null and not giant.input_enabled, "the shop box opens and pauses the giant")
	gs.coins = 1000.0
	check(not gs.buy_tool(1) and gs.tool_gate_text(1) != "", "the candle isn't on sale until enough of the suburbs is down")
	gs.dev_gates_open = true
	check(gs.buy_tool(1) and gs.tool_index == 1 and is_equal_approx(gs.coins, 1000.0 - float(Balance.TOOLS[1].cost)), "bought the candle")
	check(city.can_light(office, gs.tool_power()) or city.s_state[office] != CityGrid.STANDING, "the candle lights office boxes")
	check(not gs.buy_tool(3), "can't skip ahead to the rockets")
	# No dead ends: with nothing left the candle can light and too few coins for the
	# blowtorch, the blowtorch goes on clearance for what you've got (the bot overspent once).
	var keep_coins: float = gs.coins
	gs.coins = 120.0
	gs.out_of_fuel = true
	check(gs.tool_cost(2) == 120.0 and gs.on_clearance(2), "out of things to light and short: the next tool goes on clearance")
	gs.out_of_fuel = false
	check(gs.tool_cost(2) == float(Balance.TOOLS[2].cost), "and back to full price while there's still something to burn")
	gs.coins = keep_coins
	var lv: int = gs.upgrade_levels["dry"]
	check(gs.buy("upgrade:dry") and gs.upgrade_levels["dry"] == lv + 1, "bought dry cardboard by id")
	check(gs.buy("helper:windup") and gs.helper_counts[0] == 1, "got a wind-up car by id")
	for tab in ["tools", "upgrades", "helpers", "extras", "finds", "settings", "dev"]:
		hud.shop.select(tab)
		await _frames(1)
	check(hud.shop.tab == "dev", "every tab of the box opens (dev included in playtest)")
	hud.close_shop()
	await _frames(2)
	check(hud.shop == null and giant.input_enabled, "the box closes")
	check(world.helpers.count() == 1, "the wind-up car came out to help")

	# The box: five divider tabs; dev tools aren't one of them (F1 / hold the box's name).
	hud.open_shop()
	await _frames(2)
	check(hud.shop._tab_buttons.size() == 5 and not hud.shop._tab_buttons.has("dev"), "the box has five tabs and no dev tab")
	hud.shop.select("dev")
	await _frames(1)
	check(hud.shop.tab == "dev", "dev tools still open in playtest builds")
	hud.shop.select("tools")
	await _frames(1)
	var featured: Label = hud.shop.featured_title
	check(featured != null and featured.text.begins_with("Next: the"), "the next tool is the one in the big slot (\"%s\")" % (featured.text if featured != null else "none"))
	check(hud.shop.tool_slots == Balance.TOOLS.size(), "every tool is laid in its own cut-out in the insert")
	hud.close_shop()
	await _frames(2)

	# Finds come out of a bag (every kind before repeats) and don't count as income (that compounded).
	var ipm: float = gs.income_per_minute()
	world._on_find("duck", false, 5000.0, Vector3.ZERO)
	check(is_equal_approx(gs.income_per_minute(), ipm), "a find's coins don't count as income")
	var seen := {"duck": true}
	for _k in Balance.FINDS.size() - 1:
		var key: String = world.citizens._next_from_bag()
		gs.note_find(key)
		seen[key] = true
	check(seen.size() == Balance.FINDS.size(), "the find bag hands out every kind before repeating")

	# One note at a time, and no numbers over a chain stamp.
	hud._notes.clear()
	if hud._note_panel != null:
		hud._note_panel.visible = false
	hud.toast("one")
	hud.toast("two")
	hud._update_notes(0.016)
	check(hud._note_panel.visible and hud._notes.size() == 1, "notes queue up one at a time")
	# Two things paying at once show one number, not two piled up (the visual run caught a
	# pair over the keep filling a third of the screen).
	world.hide_floats()
	world._next_float_t = 0.0
	world._float_text(Vector3.ZERO, "+5", 5.0)
	world._float_text(Vector3(1.0, 0.0, 0.0), "+6", 6.0)
	var shown := 0
	for f in world._floats:
		if (f.node as Control).visible:
			shown += 1
	check(shown == 1, "two coin numbers at once: only one shows")
	hud.show_chain(3)
	var any_float := false
	for f in world._floats:
		if (f.node as Control).visible:
			any_float = true
	check(not any_float, "a chain stamp clears the floating numbers out of its way")

	# The stamp never jumps back to a smaller chain while a bigger one is still on screen.
	hud.show_chain(8)
	hud.show_chain(5)
	check(hud.chain_label.text == "chain x8", "a smaller chain doesn't stamp over a bigger one (%s)" % hud.chain_label.text)
	for _k in 30:
		hud._update_chain(0.06)
	check(not hud.chain_label.visible, "the chain stamp lifts off and goes")
	# One note spot: a note takes the hint's place; the hint comes back after.
	hud._notes.clear()
	hud._note_panel.visible = false
	hud.set_coach("a hint")
	check(hud.coach.visible, "the first-run hint shows when no note is up")
	hud.toast("a note")
	hud._update_notes(0.016)
	hud.set_coach("a hint")
	check(hud._note_panel.visible and not hud.coach.visible, "a note and the hint never show at once")
	hud._note_panel.visible = false
	hud.set_coach("")
	# Coin numbers are drawn flat on the screen, big enough to read on a phone.
	var fl: Label = world._floats[0].label
	check(fl.get_theme_font_size("font_size") >= 34 and world._floats[0].node.get_parent() == hud.floats_layer,
		"floating coin numbers are screen text at 34 px or more")
	check(hud.rate_label.text != "light something", "no placeholder copy on the coin tag")

	# Phone wording on phones.
	hud.set_touch_mode(true)
	gs.tutorial_step = 0
	world._update_coach()
	var c0: String = hud.coach_label.text
	gs.tutorial_step = 3
	world._update_coach()
	var c3: String = hud.coach_label.text
	var banned := ["click", "mouse", "press ", "key", "wasd"]
	var desk := false
	for w in banned:
		if c0.to_lower().contains(w) or c3.to_lower().contains(w):
			desk = true
	check(not desk, "touch hints have no mouse or keyboard words (\"%s\")" % c0)
	hud.show_find("ticket", true, 10.0)
	hud._update_find(0.0)
	check(not hud._find_text.text.to_lower().contains("click") and not hud._find_text.text.contains("press G"), "the golden ticket says tap on a phone")
	hud.find_tag.visible = false
	gs.tutorial_step = 9

	# The hand is framed above the phone's buttons: the fist sits above the fire cap and
	# clear of the jump cap (it used to sit under JUMP, and under the fire cap on 4:3 tablets).
	hud.set_touch_mode(true)
	await _frames(40)
	var grip: Vector2 = giant.grip_screen_point()
	var tc = hud.touch
	check(grip.y < tc.fire_center().y - tc.FIRE_RADIUS + 10.0 and grip.distance_to(tc.jump_center()) > tc.JUMP_RADIUS + 60.0,
		"the hand is framed above the fire and jump caps (%s)" % str(grip))

	# The starter pack: a matchbox with a price tag on a string and a scribbled "not now".
	hud.show_starter_offer()
	await _frames(2)
	var sp: Dictionary = hud._last_popup
	check(sp.has("tag") and sp.has("nope") and sp.box is Control, "the starter pack is a matchbox with a tag and \"not now\"")
	sp.nope.pressed.emit()
	await _frames(2)
	check(not hud.is_blocking() and giant.input_enabled, "\"not now\" closes it and hands the game back")

	# Boosts run on play time.
	var clk: float = gs.clock
	gs.start_boost()
	gs.clock += Balance.BOOST_DURATION + 1.0
	check(not gs.is_boost_active(), "the 2x boost lasts its five minutes of play, then stops")
	gs.clock = clk
	gs.boost_until = 0.0

	# The held tools are hands now, and the lens camera only runs for the magnifying glass.
	check(ModelLib.has("hand_magnifier") and ModelLib.has("hand_bottle") and ModelLib.has("rocket"), "the hand-held tools are in tools.glb")
	var want_lens: int = SubViewport.UPDATE_ALWAYS if gs.tool_index == 0 else SubViewport.UPDATE_DISABLED
	check(giant._lens_vp.render_target_update_mode == want_lens, "the lens camera only runs while the magnifying glass is in hand")

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
	gs.coins = float(Balance.TOOLS[2].cost) - 1500.0
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
	gs.finds = {}
	for _k in 300:
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
	var v5 := CityView.new()
	root.add_child(v5)
	v5.build(g5)
	v5.show_loaded_state()
	check(v5.rubble_count() == g5.fallen, "and the burnt-out shells are laid back where things fell (%d)" % v5.rubble_count())
	v5.queue_free()

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
	check(not hud.coin_tag.visible and not hud.shop_button.visible, "the HUD steps aside for the ending")
	check(not giant.hand_visible and giant.cinematic, "the ending hides the hand and moves the camera itself")
	for _k in 80:
		city.tick(0.1)
	world._after_tick()
	check(city.standing_count() == 0, "nothing is left standing at the ending (%d)" % city.standing_count())
	await _frames(3)
	var note_rect: Rect2 = (hud._last_popup.note as Control).get_global_rect()
	check(Rect2(Vector2.ZERO, hud.root.get_viewport_rect().size).encloses(note_rect),
		"the delivery note is pinned up on screen (%s)" % str(note_rect))
	hud._last_popup.button.pressed.emit()
	await _frames(2)
	check(hud.coin_tag.visible and not hud.is_blocking(), "\"Walk around the ashes\" brings the HUD back")
	check(giant.hand_visible and not giant.cinematic, "and the giant's own eyes and hand")

	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	print("SMOKE TEST %s in %d ms" % ["PASSED" if ok else "FAILED", Time.get_ticks_msec() - t0])
	quit(0 if ok else 1)
