extends SceneTree
## Renders the key moments for checking the look:
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/ocean-shots [names...]
## With names, only shots whose name starts with one of them are saved.
## (Untyped on purpose: this compiles before the autoloads exist.)

var out_dir := "/tmp/ocean-shots"
var only: Array = []


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		out_dir = args[0]
	for i in range(1, args.size()):
		only.append(args[i])
	DirAccess.make_dir_recursive_absolute(out_dir)
	_run.call_deferred()


func _want(name: String) -> bool:
	if only.is_empty():
		return true
	for o in only:
		if name.begins_with(o):
			return true
	return false


func _shot(name: String) -> void:
	if not _want(name):
		return
	await RenderingServer.frame_post_draw
	var img := root.get_texture().get_image()
	img.save_png("%s/%s.png" % [out_dir, name])
	print("saved ", name)


func _frames(n: int) -> void:
	for _i in n:
		await process_frame


func _run() -> void:
	var gs = root.get_node("GameState")
	root.get_node("Monetization").provider.instant = true
	DisplayServer.window_set_size(Vector2i(1280, 720))
	gs.SAVE_PATH = "user://ocean_save_shots.json"
	gs.reset_state(false)
	gs.save_game()
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	var rig = world.rig
	var hud = world.hud
	var bay = world.bay
	await _frames(10)

	# Only the ending asked for: go straight there (software GL is slow).
	var ending_only := not only.is_empty()
	for o in only:
		if not str(o).begins_with("07"):
			ending_only = false
	if ending_only:
		await _ending(world, gs, hud)
		return

	# 01: the whole bay at the start, full of water.
	rig.set_view(-2.0, 2.0, 1.0)
	await _frames(8)
	await _shot("01_bay_start")
	rig.set_view(4.0, 30.0, 0.42)
	await _frames(6)
	await _shot("01b_town_shore")

	gs.hints_done["look"] = true
	# 02: mid-drain: down past the sandbars and kelp, lagoons cut off, things stranded.
	world.skip_to_ring(1)
	world.step_water(2.0)
	bay.lower_body(bay.main_id, -4.2, world.game_time)
	world.step_water(1.0)
	gs.money = 2600.0
	gs.pads[1] = 1
	gs.pads[2] = 3
	world.pumps.refresh()
	var lag := -1
	for id in bay.pool_ids():
		if bay.body_name(id) == "West lagoon":
			lag = id
	if lag != -1:
		var dv = bay.vertex_pos(bay.deepest_vertex(lag))
		world.send_barge(dv.x, dv.z)
		world.step_water(5.0)
	world.game_time += 20.0
	hud._queue.clear()
	hud._hide_tag()
	await _frames(2)
	rig.set_view(-4.0, 24.0, 0.55)
	await _frames(4)
	world._update_hints(0.1)
	await _frames(4)
	await _shot("02_mid_drain")
	rig.set_view(-20.0, 30.0, 0.18)
	await _frames(5)
	await _shot("02b_lagoon_close")
	# A callout on a pad.
	rig.set_view(world.pumps.pads[2].pos.x, world.pumps.pads[2].pos.z - 9.0, 0.3)
	await _frames(4)
	world.act_on({"kind": "pad", "idx": 2, "at": world.pumps.pads[2].pos})
	await _frames(4)
	await _shot("02c_pad_callout")
	hud.close_callout()

	# 03: a shipwreck out of the water, then the shelf with its lettering.
	world.skip_to_ring(4)
	world.step_water(1.0)
	world.game_time += 30.0
	hud._queue.clear()
	var w = world.finds.wrecks[0]
	rig.set_view(w.pos.x + 2.0, w.pos.z + 10.0, 0.24)
	await _frames(6)
	await _shot("03_wreck")
	rig.set_view(-2.0, -6.0, 0.7)
	await _frames(3)
	hud._queue.clear()
	hud.ring_banner(3)
	await _frames(6)
	await _shot("03b_wreck_shelf")
	hud._queue.clear()
	hud._hide_tag()

	# 04: the aquarium, and its register.
	for i in world.creatures.spots.size():
		var sp = world.creatures.spots[i]
		if int(sp.ring) <= 4 and not gs.is_rescued(i) and str(Balance.SPECIES[int(sp.species)].key) != "whale":
			gs.rescue(i, int(sp.species))
	world.open_aquarium()
	await _frames(8)
	await _shot("04_aquarium")
	world.aquarium.open_plate(true)
	await _frames(3)
	await _shot("04b_register")
	world.aquarium.open_plate(false)
	world.aquarium.close()
	await _frames(3)

	# 05: the chandlery's pegboard, and the harbour office.
	gs.money = 52000.0
	hud.open_shop("pumps")
	await _frames(5)
	await _shot("05_shop")
	hud.shop.press("office")
	await _frames(4)
	await _shot("05b_office")
	hud.close_shop()
	await _frames(2)

	# 06: phone size (iPhone landscape), touch wording, a hint tied to its pad, the offer pennant.
	DisplayServer.window_set_size(Vector2i(1266, 585))
	root.size = Vector2i(1266, 585)
	await _frames(4)
	gs.hints_done = {"look": true}
	rig.last_input_touch = true
	rig.set_view(2.0, 26.0, 0.5)
	world._update_hints(0.1)
	world.offers.current = "boost"
	world.offers.time_left = 30.0
	hud.show_offer("boost")
	await _frames(6)
	await _shot("06_phone_touch")
	hud.hide_offer()
	DisplayServer.window_set_size(Vector2i(1280, 720))
	root.size = Vector2i(1280, 720)
	await _frames(3)

	if not _want("07"):
		gs.delete_save()
		quit()
		return
	await _ending(world, gs, hud)


func _ending(world, gs, hud) -> void:
	# 07: the end: the lost town, the shot on the clock tower, the card after,
	# at phone size (844x390 at 1.5x).
	DisplayServer.window_set_size(Vector2i(1266, 585))
	root.size = Vector2i(1266, 585)
	await _frames(3)
	gs.unlock_everything()
	world.on_shop_bought()
	world.skip_to_ring(5)
	world.step_water(900.0)
	await _frames(2)
	await _shot("07a_beat")
	var guard := 0
	var shot_dolly := false
	var t0 := Time.get_ticks_msec()
	while hud.ending == null and guard < 400:
		guard += 1
		await process_frame
		if not shot_dolly and world.ending_shot != null and world.ending_shot._phase == 1 and world.ending_shot._t > 2.5:
			shot_dolly = true
			await _shot("07b_dolly")
	print("ending card after %d frames, %.1f s" % [guard, (Time.get_ticks_msec() - t0) / 1000.0])
	await _frames(6)
	await _shot("07_lost_town")
	gs.delete_save()
	quit()
