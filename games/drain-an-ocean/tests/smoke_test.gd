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
	# Bugs found in the art pass, each pinned down:
	check(not Geometry2D.triangulate_polygon(UiTheme.cartouche_points(Rect2(0, 0, 330, 96))).is_empty(), "the money cartouche's outline triangulates (no self-crossing)")
	check(bay.deepest_vertex(987654) == bay.sink and bay.level_of(987654) < -1e8, "asking about a body of water that's gone is safe")
	check(world.lettering != null and world.lettering.words.size() == Balance.RINGS.size(), "every ring has its chart lettering")
	# Found in the visual run: the land round the bay drew far paler than the bay's own
	# land (a StandardMaterial's sRGB vertex colours in the Compatibility renderer).
	var land: MeshInstance3D = world.view.get_node_or_null("Land")
	check(land != null and land.material_override is ShaderMaterial and (land.material_override as ShaderMaterial).shader.resource_path.ends_with("land.gdshader"),
		"the land round the bay is shaded the same way as the bay's own land")
	await _frames(2)
	var small: Array = []
	for l in world.hud.root.find_children("*", "Label", true, false):
		var fs: int = (l as Label).get_theme_font_size("font_size")
		if fs < 21 and (l as Label).text != "":
			small.append("%s (%d px)" % [(l as Label).text.substr(0, 20), fs])
	check(small.is_empty(), "every HUD label is at least 21 px, about 11.4 px on an 844x390 phone %s" % str(small.slice(0, 3)))

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
		# Found by the boosted playthrough: a pool pumped (or left) shallower than a
		# barge's 15 cm draught could never be finished.
		bay.lower_body(other, bay.floor_of(other) + 0.04)
		world.pumps.settle_barges()
		check(bay.bodies.has(other) and not world.pumps.barges[0].aground and int(world.pumps.barges[0].body) == other, "a barge still floats on a pool only 4 cm deep")
		world.step_water(60.0)
		check(not bay.bodies.has(other), "and pumps it dry")

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
	check(world.hud.shop.grid.get_child_count() > 3, "the chandlery's pegboard hangs its goods")
	check(world.hud.shop.find_button("buy:pad:1") != null and world.hud.shop.find_button("buy:barge") != null and world.hud.shop.find_button("buy:up:power") != null,
		"every kind of good has a named price stamp")
	check(world.hud.shop.find_button("dev:x5") == null and world.hud.shop.find_button("dev") == null, "no playtest tab in the chandlery")
	await _frames(8)
	check(_tags_clear(world.hud.shop), "every tag on the pegboard holds its whole stamp and no tag overlaps the next (screenshots showed rows overlapping) %s" % _tag_report)
	# Found in the screenshots: every aquarium payout rebuilt the whole board
	# (a frame of overlapping rows, and a stamp could vanish under the finger).
	var rb0: int = world.hud.shop.rebuilds
	for _k in 6:
		gs.grant_money(1.0)
		await _frames(10)
	check(world.hud.shop.rebuilds == rb0, "small payouts restamp the board without rebuilding it (%d rebuilds)" % (world.hud.shop.rebuilds - rb0))
	gs.grant_money(1e7)
	await _frames(12)
	check(world.hud.shop.rebuilds > rb0 and world.hud.shop.find_button("buy:pad:2") != null and not world.hud.shop.find_button("buy:pad:2").disabled, "a payout that makes something affordable does rebuild it")
	gs.money = 0.0
	gs.changed.emit()
	await _frames(12)
	var small_s: Array = []
	for l in world.hud.shop.find_children("*", "Label", true, false):
		if (l as Label).get_theme_font_size("font_size") < 21 and (l as Label).text != "":
			small_s.append((l as Label).text.substr(0, 20))
	var tiny_b: Array = []
	for b in world.hud.shop.find_children("*", "StampButton", true, false):
		if (b as Control).custom_minimum_size.y < 64.0 or (b as Control).custom_minimum_size.x < 84.0:
			tiny_b.append(str(b.get_meta("id", "?")))
	check(small_s.is_empty() and tiny_b.is_empty(), "the chandlery's text is phone-sized and every stamp is a generous tap %s %s" % [str(small_s.slice(0, 3)), str(tiny_b.slice(0, 3))])
	world.hud.shop.press("office")
	await _frames(8)
	check(_tags_clear(world.hud.shop), "the harbour office's tags hang clear of each other too %s" % _tag_report)
	check(world.hud.shop.find_button("ad:boost") != null and world.hud.shop.find_button("ad:cash") != null and world.hud.shop.find_button("restore") != null,
		"the harbour office has the ad notice and restore purchases")
	world.hud.shop.press("board")
	await _frames(2)
	world.hud.close_shop()
	world.open_aquarium()
	await _frames(2)
	world.hud.open_dev()
	check(world.hud.dev == null or not world.hud.dev.visible, "the dev log never opens over the aquarium (chaos found F9 did)")
	# Found in the screenshots: the register plate ran off both sides at 1280x720.
	world.aquarium.open_plate(true)
	await _frames(3)
	var vr: Rect2 = world.aquarium.root_ui.get_viewport_rect()
	var plate_ok := true
	for c in world.aquarium.plate.get_children():
		if c is Paper:
			var pr := Rect2((c as Control).position, (c as Control).size * (c as Control).scale)
			plate_ok = vr.encloses(pr)
	check(plate_ok, "the specimen register fits on the screen")
	var reg_text := ""
	for l in world.aquarium.plate.find_children("*", "Label", true, false):
		reg_text += (l as Label).text + "|"
	check(not reg_text.contains("the the"), "the register's copy reads right (it said 'out in the the lost town')")
	world.aquarium.open_plate(false)
	world.aquarium.close()
	await _frames(2)
	world.hud.open_shop("pumps")
	await _frames(2)
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
	for i in world.creatures.stranded_list():
		world.rescue_creature(i)
	gs.hints_done.erase("rescue")
	check(not str(world._hint()[0]).begins_with("Stranded"), "the rescue hint goes once nothing's stranded (it used to linger)")
	gs.hints_done["rescue"] = true
	var ht: String = str(world._hint()[0])
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
	var wi: int = Balance.species_index("whale")
	var calf_home := false
	for i in world.creatures.spots.size():
		if int(world.creatures.spots[i].species) == wi:
			calf_home = gs.is_rescued(i)
	check(calf_home and gs.whale_home, "the whale calf goes home over the wall at the end, even if nobody tapped it")
	check(not world.hud.staff.visible and world.hud.message_count() == 0, "the HUD is hidden the moment the bay is dry (no messages, no floaters)")
	check(world.ending_shot != null and world.ending_shot.running and world.hud.ending == null, "the ending holds a beat before any card")
	# Found in the ending's screenshots: a crab's salvage put a find card up mid-shot.
	world.hud.show_find(0, 100.0, world.props.clock_tower.global_position)
	check(not world.hud.find_card_up(), "no find card over the ending's shot")
	var waited := 0.0
	while world.hud.ending == null and waited < 15.0:
		await create_timer(0.25).timeout
		waited += 0.25
	check(world.hud.ending != null and not world.hud.staff.visible, "the card comes in after the dolly to the clock tower (%.1f s)" % waited)
	check(world.ending_shot.cam != null and world.ending_shot.cam.current and world.ending_shot.cam.global_position.distance_to(world.props.clock_tower.global_position) < 40.0,
		"the ending camera is on the clock tower")
	# Found in the ending's screenshots: the camera ended up under the basin's slope.
	check(world.ending_shot.sightline_clear(world.ending_shot._to_pos, world.props.clock_tower.global_position)
		and world.ending_shot.cam.global_position.y > bay.height_at(world.ending_shot.cam.global_position.x, world.ending_shot.cam.global_position.z) + 1.0,
		"the ending camera is above the seabed with a clear view of the tower's foot")
	check(world.hud._floats.is_empty(), "no money floaters over the ending")
	# Found in the ending's screenshots: stranded fish flopping right in front of the lens.
	var blocking := 0
	for i in world.creatures.spots.size():
		var cn: Node3D = world.creatures.spots[i].node
		if cn != null and cn.visible and not gs.is_rescued(i) and world.creatures._in_the_way(cn.global_position):
			blocking += 1
	for b in world.pumps.barges:
		if (b.node as Node3D).visible and world.creatures._in_the_way((b.node as Node3D).global_position):
			blocking += 1
	for f in world.creatures._flying:
		if is_instance_valid(f.node) and (f.node as Node3D).visible and world.creatures._in_the_way((f.node as Node3D).global_position):
			blocking += 1
	check(world.creatures.clear_view.size() == 3 and blocking == 0, "nothing stranded, aground or in flight stands between the ending camera and the tower")

	print("%d checks, %s" % [checks, "all passed" if ok else "FAILURES"])
	gs.delete_save()
	quit(0 if ok else 1)


var _tag_report := ""


func _tags_clear(shop: Control) -> bool:
	## Each pegboard tag's paper contains everything on it, and tags hung side
	## by side or row under row never overlap.
	_tag_report = ""
	var tags: Array = []
	for n in shop.find_children("*", "MarginContainer", true, false):
		if n.get("tag") != null and n.get("tag") is Control:
			tags.append(n)
	for t in tags:
		var paper: Control = t.tag
		var pr: Rect2 = paper.get_global_rect().grow(8.0)
		for c in paper.find_children("*", "Control", true, false):
			if (c as Control).is_visible_in_tree() and not pr.encloses((c as Control).get_global_rect()):
				_tag_report += "[%s spills out of its tag] " % c.name
				break
	for i in tags.size():
		for j in range(i + 1, tags.size()):
			var a: Rect2 = (tags[i].tag as Control).get_global_rect().grow(-6.0)
			var b: Rect2 = (tags[j].tag as Control).get_global_rect().grow(-6.0)
			if a.intersects(b):
				_tag_report += "[tags %d and %d overlap] " % [i, j]
	return _tag_report == ""
