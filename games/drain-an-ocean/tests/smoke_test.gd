extends SceneTree
## Headless smoke test:  godot --headless -s res://tests/smoke_test.gd
## Builds the world on a fresh save and checks the core loop: pumps lower the
## water; a pool cuts off at its rim and keeps its water until a barge pumps
## it; rescues fill the aquarium and its ticket income; salvage pays; the shop
## sells; the 2x boost doubles pumping; Remove Ads gives the permanent 2x; the
## touch controls pan, zoom and tap; the hints use phone wording; and a save /
## load round trip restores the water, the money and what's been rescued.
## Exits 1 if anything fails. Untyped on purpose: compiles before autoloads.

var ok := true
var checks := 0


func check(cond: bool, what: String) -> void:
	checks += 1
	print(("  ok    " if cond else "  FAIL  ") + what)
	if not cond:
		ok = false


func _initialize() -> void:
	create_timer(420.0).timeout.connect(func():
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
	var gs = root.get_node("GameState")
	var mon = root.get_node("Monetization")
	mon.provider.instant = true
	gs.SAVE_PATH = "user://ocean_save_smoke.json"
	gs.reset_state(false)
	gs.save_game()
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await _frames(3)
	var bay = world.bay
	print("Drain an Ocean smoke test")

	# --- The world builds -----------------------------------------------------------------
	check(bay.bodies.size() == 1 and bay.main_id != -1, "the bay starts as one body of water at sea level")
	check(absf(bay.main_level()) < 0.05, "the water starts at the old sea level")
	check(bay.pools.size() >= 10, "the level has its designed pools (%d)" % bay.pools.size())
	check(world.creatures.spots.size() >= 40, "creatures are laid out (%d)" % world.creatures.spots.size())
	check(world.finds.spots.size() == 12, "every find has a spot")
	check(int(gs.pads[0]) == 1, "a bucket brigade is already on pad 1")
	check(world.hud != null and world.hud.staff != null, "the HUD builds with its tide board")

	# --- Pumps lower the level ------------------------------------------------------------------
	world.compute_flows()
	var q0: float = world.main_flow
	check(q0 > 0.0, "the shore pump moves water (%.2f m3/s)" % q0)
	var l0: float = bay.main_level()
	world.step_water(20.0)
	var l1: float = bay.main_level()
	check(l1 < l0 - 0.001, "pumping for 20 s lowers the water (%.3f -> %.3f)" % [l0, l1])
	var drop1 := l0 - l1
	# More pumps, faster.
	gs.money = 1000.0
	check(world.place_pump(1), "placing a second bucket brigade (pad 2) works")
	check(int(gs.pads[1]) == 1, "pad 2 now has a pump")
	world.compute_flows()
	check(world.main_flow > q0 * 1.9, "two brigades pump about twice as much")

	# --- The 2x boost doubles pumping ------------------------------------------------------------
	world.compute_flows()
	var before_boost: float = world.main_flow
	var got := []
	world.watch_ad("boost")
	await _frames(3)
	world.compute_flows()
	check(gs.is_boost_active(), "watching the 2x ad starts the boost")
	check(absf(world.main_flow / before_boost - 2.0) < 0.01, "the boost doubles pumping (%.2fx)" % (world.main_flow / before_boost))
	world.watch_ad("boost")
	await _frames(2)
	world.watch_ad("boost")
	await _frames(2)
	world.watch_ad("boost")
	await _frames(2)
	check(gs.boost_seconds_left() <= 900.5, "the boost stacks to 15 minutes, no more (%.0f s)" % gs.boost_seconds_left())
	gs.boost_until = 0.0

	# --- A pool cuts off and keeps its water until a pump works it --------------------------------
	world.skip_to_ring(1)
	var pools: Array = bay.pool_ids()
	check(pools.size() >= 3, "dropping past the sandbars cuts off the lagoons (%d pools)" % pools.size())
	var lagoon := -1
	for id in pools:
		if bay.body_name(id) == "Town lagoon":
			lagoon = id
	if lagoon == -1 and pools.size() > 0:
		lagoon = pools[0]
	check(lagoon != -1, "the town lagoon is its own body of water")
	var pl0: float = bay.level_of(lagoon)
	check(pl0 > bay.main_level() + 1.0, "the lagoon stays higher than the bay (%.2f vs %.2f)" % [pl0, bay.main_level()])
	world.step_water(30.0)
	check(bay.bodies.has(lagoon) and absf(bay.level_of(lagoon) - pl0) < 0.0001, "with no pump on it the lagoon keeps its water")
	var deep: Vector3 = bay.vertex_pos(bay.deepest_vertex(lagoon))
	gs.money = 500.0
	check(world.send_barge(deep.x, deep.z), "buying a barge onto the lagoon works")
	check(world.pumps.barges.size() == 1 and int(world.pumps.barges[0].body) == lagoon, "the barge floats on the lagoon")
	world.step_water(4.0)
	check(not bay.bodies.has(lagoon) or bay.level_of(lagoon) < pl0 - 0.05, "the barge lowers the lagoon")
	world.step_water(120.0)
	check(not bay.bodies.has(lagoon), "the barge drains the lagoon dry")
	check(world.pumps.barges[0].aground, "the barge is aground once its pool is gone")
	# Tapping water picks it.
	var other := -1
	for id in bay.pool_ids():
		other = id
	if other != -1:
		var ow: Vector3 = bay.vertex_pos(bay.deepest_vertex(other))
		check(world.send_barge(ow.x, ow.z), "an aground barge can be sent to another pool")
		check(not world.pumps.barges[0].aground and int(world.pumps.barges[0].body) == other, "it floats on the new pool")

	# --- Rescues fill the aquarium and its income -------------------------------------------------
	var stranded: Array = world.creatures.stranded_list()
	check(stranded.size() > 0, "creatures are stranded once the water's off them (%d)" % stranded.size())
	var inc0: float = gs.aquarium_income()
	var tank0: int = gs.creatures_in_tank()
	var m0: float = gs.money
	var paid: float = world.rescue_creature(stranded[0])
	check(paid > 0.0 and gs.money > m0, "a rescue pays its bounty (+%.0f)" % paid)
	check(gs.creatures_in_tank() == tank0 + 1, "the rescued creature is in the aquarium")
	check(gs.aquarium_income() > inc0, "the aquarium earns more (%.2f -> %.2f a second)" % [inc0, gs.aquarium_income()])
	check(world.rescue_creature(stranded[0]) == 0.0, "the same creature can't be rescued twice")
	var m1: float = gs.money
	for _i in 30:
		await process_frame
	await create_timer(3.0).timeout
	check(gs.money > m1, "ticket sales come in over time")

	# --- Salvage pays ------------------------------------------------------------------------------
	var exposed: Array = world.finds.exposed_list()
	check(exposed.size() > 0, "finds on the sandbars are out of the water (%d)" % exposed.size())
	if exposed.size() > 0:
		var m2: float = gs.money
		var v: float = world.salvage_find(exposed[0])
		check(v > 0.0 and gs.money >= m2 + v - 0.01, "salvaging a find pays (+%.0f)" % v)
		check(gs.finds_found[exposed[0]], "the find is in the collection")
	world.skip_to_ring(4)
	check(world.finds.wreck_revealed(0), "the wrecks are out of the water by the trench ring")
	var m3: float = gs.money
	var wv: float = world.salvage_wreck(0)
	check(wv > 0.0 and gs.money > m3, "a wreck gives a salvage load (+%.0f)" % wv)
	check(world.salvage_wreck(0) == 0.0, "the wreck has a cooldown between loads")

	# --- A shop purchase works ---------------------------------------------------------------------
	gs.money = 1e6
	var lvl0: int = int(gs.upgrade_levels["power"])
	world.compute_flows()
	var qa: float = world.main_flow
	check(world.buy("up:power"), "buying Pump power works")
	check(int(gs.upgrade_levels["power"]) == lvl0 + 1, "Pump power went up a level")
	world.compute_flows()
	check(world.main_flow > qa * 1.05, "pump power raises the flow")
	check(world.buy("pad:0"), "upgrading pad 1 to a hand pump works")
	check(int(gs.pads[0]) == 2, "pad 1 has a hand pump")
	check(world.buy("helper:pelican"), "hiring a pelican works")
	check(world.helpers.units.size() == 1, "the pelican is on the bay")
	gs.money = 0.0
	check(not world.buy("pad:2"), "you can't buy what you can't afford")
	world.hud.open_shop("pumps")
	await _frames(3)
	check(world.hud.shop_open(), "the chandlery opens")
	for t in ["barges", "upgrades", "helpers", "purchases", "dev", "pumps"]:
		world.hud.shop.tab = t
		world.hud.shop._rebuild()
		await _frames(2)
	check(world.hud.shop.list.get_child_count() > 3, "the chandlery lists its goods")
	world.hud.close_shop()
	await _frames(2)

	# --- Remove Ads + permanent 2x -----------------------------------------------------------------
	world.compute_flows()
	var qb: float = world.main_flow
	mon.buy(mon.PRODUCT_REMOVE_ADS_2X)
	await _frames(3)
	world.compute_flows()
	check(gs.owns_remove_ads, "Remove Ads is owned after buying it")
	check(absf(world.main_flow / qb - 2.0) < 0.01, "Remove Ads doubles pumping for good")
	check(not mon.interstitial_allowed(), "no interstitials with Remove Ads")
	gs.money = 0.0
	world.watch_ad("cash")
	await _frames(3)
	check(gs.money >= 60.0, "the free-cash ad pays")
	world.watch_ad("tickets")
	await _frames(3)
	check(gs.is_ticket_rush_active(), "the aquarium's double-tickets ad runs")
	mon.buy(mon.PRODUCT_CASH_SMALL)
	await _frames(3)
	check(gs.money >= 500.0, "a cash pack pays")
	mon.restore()

	# --- Touch controls ------------------------------------------------------------------------------
	var rig = world.rig
	rig.set_view(0.0, 10.0, 0.5)
	await _frames(2)
	var t0: Vector2 = rig.target
	_touch(0, Vector2(640, 400), true)
	await _frames(1)
	for k in 6:
		_drag(0, Vector2(640 - 30 * (k + 1), 400), Vector2(-30, 0))
		await _frames(1)
	_touch(0, Vector2(460, 400), false)
	await _frames(2)
	check(rig.target.distance_to(t0) > 3.0, "dragging a finger pans the bay")
	var z0: float = rig._zoom_goal
	_touch(0, Vector2(560, 360), true)
	_touch(1, Vector2(720, 360), true)
	await _frames(1)
	for k in 5:
		_drag(1, Vector2(720 + 30 * (k + 1), 360), Vector2(30, 0))
		await _frames(1)
	_touch(1, Vector2(870, 360), false)
	_touch(0, Vector2(560, 360), false)
	await _frames(2)
	check(rig._zoom_goal < z0 - 0.05, "pinching out zooms in (%.2f -> %.2f)" % [z0, rig._zoom_goal])
	var tapped := []
	rig.tapped.connect(func(p): tapped.append(p))
	_touch(0, Vector2(700, 300), true)
	await _frames(1)
	_touch(0, Vector2(702, 301), false)
	await _frames(2)
	check(tapped.size() == 1, "a quick touch is a tap")
	# A tap on a pad opens its callout.
	var cam = rig.camera
	rig.set_view(world.pumps.pads[2].pos.x, world.pumps.pads[2].pos.z - 6.0, 0.3)
	await _frames(3)
	var sp: Vector2 = cam.unproject_position(world.pumps.pads[2].pos + Vector3(0, 1.0, 0))
	var pick = world.pick_at(sp)
	check(not pick.is_empty() and pick.kind == "pad" and int(pick.idx) == 2, "tapping a pump pad picks it")
	world.act_on(pick)
	await _frames(2)
	check(world.hud.callout_open(), "the pad's callout opens")
	rig.last_input_touch = true
	var ht: String = world._hint_text()
	check(not ht.contains("Click") and not ht.contains("click") and not ht.contains("scroll"), "hints use phone wording first")

	# --- Save / load round trip ---------------------------------------------------------------------
	gs.money = 12345.0
	var lvl_save: float = bay.main_level()
	var bodies_save: int = bay.bodies.size()
	var rescued_save: int = gs.rescued.size()
	var pads_save: Array = gs.pads.duplicate()
	gs.save_game()
	gs.money = 1.0
	gs.rescued = {}
	bay.reset_water()
	check(gs.load_game(), "the save loads")
	check(absf(gs.money - 12345.0) < 0.01, "money is restored")
	check(absf(bay.main_level() - lvl_save) < 0.001, "the water level is restored (%.2f)" % bay.main_level())
	check(bay.bodies.size() == bodies_save, "every pool is restored (%d)" % bay.bodies.size())
	check(gs.rescued.size() == rescued_save, "rescues are restored")
	check(gs.pads == pads_save, "the pumps on the pads are restored")
	check(gs.owns_remove_ads, "purchases are restored")

	# --- The end ---------------------------------------------------------------------------------------
	# Seepage: shallow pumps stall in the deep; the top tier gets to the bottom.
	world.skip_to_ring(4)
	world.compute_flows()
	check(world.seep_flow > 0.0, "the sea seeps back in at depth (%.0f m3/s)" % world.seep_flow)
	gs.owns_remove_ads = false
	for i in gs.pads.size():
		gs.pads[i] = 1
	world.on_shop_bought()
	var stall_lvl: float = bay.main_level()
	world.step_water(60.0)
	world.compute_flows()
	check(world.is_stalled() and bay.main_level() > stall_lvl - 0.5, "bucket brigades stall against the seepage at %.1f m" % -bay.main_level())
	gs.unlock_everything()
	world.on_shop_bought()
	world.skip_to_ring(5)
	world.step_water(900.0)
	await _frames(2)
	check(bay.is_drained() and gs.has_won, "pumping out the lost town ends the game")
	check(world.hud.ending != null and not world.hud.staff.visible, "the ending gets its own screen, HUD hidden")

	print("%d checks, %s" % [checks, "all passed" if ok else "FAILURES"])
	gs.delete_save()
	quit(0 if ok else 1)
