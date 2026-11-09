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
	gs.pads[2] = 2
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
	await _frames(4)
	rig.set_view(-6.0, 22.0, 0.55)
	await _frames(10)
	world._update_hints(0.1)
	await _frames(2)
	await _shot("02_mid_drain")
	rig.set_view(-22.0, 30.0, 0.18)
	await _frames(8)
	await _shot("02b_lagoon_close")
	# A callout on a pad.
	rig.set_view(world.pumps.pads[2].pos.x, world.pumps.pads[2].pos.z - 9.0, 0.3)
	await _frames(6)
	world.act_on({"kind": "pad", "idx": 2, "at": world.pumps.pads[2].pos})
	await _frames(4)
	await _shot("02c_pad_callout")
	hud.close_callout()

	# 03: a shipwreck out of the water.
	world.skip_to_ring(4)
	world.step_water(1.0)
	world.game_time += 30.0
	var w = world.finds.wrecks[0]
	rig.set_view(w.pos.x + 2.0, w.pos.z + 10.0, 0.22)
	await _frames(10)
	await _shot("03_wreck")
	rig.set_view(0.0, -4.0, 0.75)
	await _frames(8)
	hud.ring_banner(3)
	await _frames(30)
	await _shot("03b_wreck_shelf")

	# 04: the aquarium.
	for i in world.creatures.spots.size():
		var sp = world.creatures.spots[i]
		if int(sp.ring) <= 3 and not gs.is_rescued(i):
			gs.rescue(i, int(sp.species))
	world.open_aquarium()
	await _frames(20)
	await _shot("04_aquarium")
	world.aquarium.close()
	await _frames(4)

	# 05: the chandlery.
	gs.money = 52000.0
	hud.open_shop("pumps")
	await _frames(8)
	await _shot("05_shop")
	hud.shop.tab = "purchases"
	hud.shop._rebuild()
	await _frames(6)
	await _shot("05b_shop_purchases")
	hud.close_shop()
	await _frames(3)

	# 06: phone size (iPhone landscape), touch wording, first-run notice.
	DisplayServer.window_set_size(Vector2i(1266, 585))
	root.size = Vector2i(1266, 585)
	await _frames(8)
	gs.hints_done = {}
	rig.last_input_touch = true
	rig.set_view(0.0, 10.0, 0.6)
	world._update_hints(0.1)
	world.offers.current = "boost"
	world.offers.time_left = 30.0
	hud.show_offer("boost")
	await _frames(10)
	await _shot("06_phone_touch")
	hud.hide_offer()
	DisplayServer.window_set_size(Vector2i(1280, 720))
	root.size = Vector2i(1280, 720)
	await _frames(4)

	# 07: the end, the lost town.
	gs.unlock_everything()
	world.on_shop_bought()
	world.skip_to_ring(5)
	world.step_water(900.0)
	await _frames(24)
	await _shot("07_lost_town")
	gs.delete_save()
	quit()
