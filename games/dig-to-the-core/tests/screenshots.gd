extends SceneTree
## Renders screenshots of key moments for checking the look:
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/dig-shots [names...]
## With names, only those shots (by prefix, e.g. "05" or "07b") are saved.
## (Untyped on purpose: this compiles before the autoloads exist.)

var out_dir := "/tmp/dig-shots"
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


func _carve_shaft(field, x: float, z: float, from_y: float, to_y: float, radius: float) -> void:
	## A round shaft straight down (as if dug), a strike every 0.25 m.
	var want := {}
	for zz in range(field.zone_of_y(from_y), field.zone_of_y(to_y - 2.0) + 1):
		want[zz] = true
	for zz in field.loaded_zones():
		want[zz] = true
	field.want_zones(want)
	for zz in want:
		field.ensure_loaded(zz)
	var y := from_y
	while y > to_y:
		field.dig(Vector3(x, y, z), radius, 1e12)
		y -= 0.25


func _landmark_view(world, z: int, tool: int) -> void:
	## Stand in a layer's landmark cave, a couple of metres off, looking at it.
	var gs = root.get_node("GameState")
	var field = world.field
	gs.tool_index = tool
	world.skip_to_zone(z)
	var cave: Array = field.landmark_cave(z)
	var c: Vector3 = cave[0]
	var away: Vector3 = Vector3(c.x, 0, c.z).normalized()
	var stand: Vector3 = c - away * 1.9
	# A tunnel from the middle of the site into the cave, so the view is open.
	var p := Vector3(0, c.y, 0)
	while p.distance_to(stand) > 0.3:
		field.dig(p, 1.3, 1e12)
		p = p.move_toward(stand, 0.4)
	field.dig(stand, 1.6, 1e12)
	field.flush()
	var fl: float = field.floor_below(stand + Vector3(0, 1.0, 0), 4.0)
	world.move_player(Vector3(stand.x, fl + 0.05, stand.z), 0.0, -0.15)
	gs.note_depth(-fl)
	var lm := Vector3(c.x, field.floor_below(c, 6.0) + 0.5, c.z)
	world.player.look_at_point(lm)


func _run() -> void:
	var gs = root.get_node("GameState")
	root.get_node("Monetization").provider.instant = true
	gs.reset_state(false)
	gs.save_game()
	gs.tutorial_step = 0
	var world = load("res://scenes/world.tscn").instantiate()
	root.add_child(world)
	var hud = world.hud
	var player = world.player
	var field = world.field
	await _frames(14)
	world._update_coach()
	await _frames(2)
	await _shot("01_surface_spawn")
	hud.set_touch_mode(true)
	await _frames(3)
	await _shot("01b_surface_touch")
	hud.set_touch_mode(false)
	# The shack and the lift from the dig site.
	player.position = Vector3(-1.0, 0.0, 6.0)
	player.look_at_point(Vector3(-4.0, 2.6, -2.0))
	await _frames(4)
	await _shot("01c_site_view")
	player.position = Vector3(2.0, 0.0, 4.0)
	player.look_at_point(world.surface.LIFT_POS + Vector3(0, 3.5, 0))
	await _frames(4)
	await _shot("01d_headframe")

	# Digging at the middle of the field, looking down.
	gs.tutorial_step = 1
	player.position = Vector3(0.5, 0.05, 1.5)
	player.set_view(0.3, -1.0)
	await _frames(3)
	world.force_dig = true
	gs.debug_speed = 2.0
	await _frames(60)
	await _shot("02_digging_surface")
	world.force_dig = false
	gs.debug_speed = 1.0

	# A shaft 12 m down; stand at the bottom, digging the wall by headlamp.
	gs.tutorial_step = 4
	gs.grant_money(400)
	gs.buy_tool(1)
	_carve_shaft(field, 0.0, 0.0, 0.0, -12.0, 1.5)
	field.flush()
	world.move_player(Vector3(0.0, field.floor_below(Vector3(0, -10.0, 0), 4.0) + 0.05, 0.0), -0.6, -0.3)
	await _frames(4)
	gs.note_depth(-player.position.y)
	gs.lift_spot = player.position
	gs.lift_stop = world.lift_stop_spot(player.position, player.yaw)
	world._place_lift_stop()
	await _frames(16)
	world.force_dig = true
	await _frames(24)
	await _shot("03_shaft_headlamp")
	world.force_dig = false
	await _frames(30)
	player.look_at_point(gs.lift_stop + Vector3(0, 1.2, 0))
	await _frames(5)
	await _shot("03b_shaft_lift_stop")
	player.set_view(0.2, 1.35)
	await _frames(5)
	await _shot("03c_shaft_looking_up")

	# Each layer's landmark.
	for spec in [["04_clay_timbers", 1, 2], ["05_bedrock_cart", 2, 2], ["05b_fossil_bed", 3, 3], ["05c_graveyard", 4, 3],
			["05d_crystal_caves", 5, 4], ["05e_lava_lakes", 6, 5], ["05f_mantle", 7, 5], ["05g_inner_core", 9, 6]]:
		if not _want(spec[0]):
			continue
		await _landmark_view(world, spec[1], spec[2])
		await _frames(20)
		await _shot(spec[0])

	# The drill working a wall up close (no dust over the lens, no clipping).
	if _want("05h"):
		gs.tool_index = 3
		world.skip_to_zone(3)
		await _frames(10)
		player.set_view(0.6, -0.15)
		world.force_dig = true
		await _frames(80)
		await _shot("05h_drill_close")
		world.force_dig = false

	# The crew digging at the lift stop.
	world.skip_to_zone(1)
	await _frames(5)
	gs.grant_money(1e6)
	for _i in 4:
		gs.buy_helper(0)
	for _i in 2:
		gs.buy_helper(1)
	var y0: float = player.position.y
	for k in 5:
		field.dig(player.position + Vector3(1.2 + k * 0.5, 0.6, 0.0), 1.2, 1e12)
	field.flush()
	gs.lift_stop = player.position + Vector3(1.6, 0, 0)
	world._place_lift_stop()
	player.look_at_point(gs.lift_stop + Vector3(0.6, 0.2, 0))
	await _frames(150)
	await _shot("06_crew")

	# The shop.
	hud.open_shop("tools")
	await _frames(4)
	await _shot("07_shop_tools")
	hud.shop.show_tab("upgrades")
	await _frames(3)
	await _shot("07b_shop_upgrades")
	hud.shop.show_tab("bonus")
	await _frames(3)
	await _shot("07c_shop_bonus")
	hud.shop.show_tab("finds")
	await _frames(3)
	await _shot("07d_shop_finds")
	hud.close_shop()
	await _frames(2)
	for c in hud.popups.get_children():
		c.queue_free()
	await _frames(2)

	# A find popping out, and its card.
	var f := 2
	var spot: Vector3 = field.find_spot(f)
	world.move_player(Vector3(spot.x + 2.2, spot.y, spot.z))
	_carve_shaft(field, spot.x + 2.2, spot.z, spot.y + 6.0, spot.y - 1.0, 1.3)
	field.flush()
	world.move_player(Vector3(spot.x + 2.2, field.floor_below(Vector3(spot.x + 2.2, spot.y + 1.0, spot.z), 4.0) + 0.05, spot.z))
	player.look_at_point(spot)
	await _frames(10)
	field.dig(spot, 1.2, 1e12)
	await _frames(22)
	await _shot("08_find")

	# The offer tag, on the phone layout.
	await _frames(300)
	hud.set_touch_mode(true)
	hud.offers._wait = 0.0
	await _frames(4)
	await _shot("09_touch_offer")
	hud.set_touch_mode(false)

	# Riding the lift up from deep down.
	world.skip_to_zone(4)
	await _frames(5)
	world.ride_lift(false)
	await _frames(14)
	await _shot("10_lift_ride")
	await _frames(200)
	await _shot("11_back_at_top")

	# The ending.
	gs.has_won = false
	world._ended_shown = false
	gs.discover(Balance.core_find())
	await _frames(120)
	await _shot("12_the_core")
	gs.reset_state(false)
	gs.save_game()
	load("res://scripts/dig_field.gd").clear_caches()
	quit(0)
