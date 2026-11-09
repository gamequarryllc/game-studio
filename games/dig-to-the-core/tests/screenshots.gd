extends SceneTree
## Renders screenshots of key moments for checking the look:
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/dig-shots
## (Untyped on purpose: this compiles before the autoloads exist.)

var out_dir := "/tmp/dig-shots"


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		out_dir = args[0]
	DirAccess.make_dir_recursive_absolute(out_dir)
	_run.call_deferred()


func _shot(name: String) -> void:
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
		field.dig(Vector3(x, y, z), radius, 1e9)
		y -= 0.25


func _stand(player, field, at: Vector3) -> void:
	player.velocity = Vector3.ZERO
	player.position = Vector3(at.x, field.floor_below(at + Vector3(0, 1.0, 0), 40.0) + 0.05, at.z)


func _run() -> void:
	var gs = root.get_node("GameState")
	gs.wipe_save()
	gs.tutorial_step = 0
	var world = load("res://scenes/world.tscn").instantiate()
	root.add_child(world)
	var hud = world.hud
	var player = world.player
	var field = world.field
	await _frames(12)
	await _shot("01_surface_spawn")
	hud.set_touch_mode(true)
	await _frames(3)
	await _shot("01b_surface_touch")
	# Look at the shack and the lift from the dig site.
	player.position = Vector3(-4.0, 0.0, 9.0)
	player.look_at_point(Vector3(-13.5, 2.6, 0.5))
	await _frames(4)
	await _shot("01c_shack_and_lift")
	hud.set_touch_mode(false)

	# Dig at the middle of the field, looking down.
	gs.tutorial_step = 1
	player.position = Vector3(0.5, 0.05, 1.5)
	player.set_view(0.3, -1.05)
	await _frames(3)
	world.force_dig = true
	gs.debug_speed = 2.0
	await _frames(70)
	await _shot("02_digging_surface")
	world.force_dig = false
	gs.debug_speed = 1.0

	# A shaft 12 m down; stand at the bottom, digging the wall by headlamp.
	gs.grant_money(400)
	gs.buy_tool(1)
	_carve_shaft(field, 0.0, 0.0, 0.0, -12.0, 1.4)
	field.flush()
	_stand(player, field, Vector3(0.0, -10.0, 0.0))
	gs.note_depth(-player.position.y)
	gs.lift_stop = player.position + Vector3(0.9, 0, 0.6)
	world._place_lift_stop()
	player.set_view(-0.6, -0.35)
	await _frames(20)
	world.force_dig = true
	await _frames(40)
	await _shot("03_shaft_headlamp")
	world.force_dig = false
	await _frames(30)
	player.set_view(2.4, -0.25)
	await _frames(5)
	await _shot("03b_shaft_lift_stop")
	# Looking up the shaft at the sky.
	player.set_view(0.2, 1.35)
	await _frames(5)
	await _shot("03c_shaft_looking_up")

	# Deeper: a chamber in the Clay, then the Fossil Bed.
	for spec in [["04_clay", -36.0, 1], ["05_fossil_bed", -84.0, 3]]:
		var y: float = spec[1]
		gs.tool_index = 3
		_carve_shaft(field, 0.0, 0.0, y + 8.0, y, 1.4)
		for k in 6:
			var a: float = k * 1.05
			field.dig(Vector3(cos(a) * 2.2, y + 1.2, sin(a) * 2.2), 1.5, 1e9)
		field.ensure_loaded(field.zone_of_y(y))
		field.flush()
		_stand(player, field, Vector3(0.0, y + 0.6, 0.0))
		gs.note_depth(-player.position.y)
		player.set_view(1.0, -0.2)
		await _frames(25)
		world.force_dig = true
		await _frames(30)
		await _shot(spec[0])
		world.force_dig = false

	# Some moles digging at the lift stop.
	gs.grant_money(5000)
	for _i in 4:
		gs.buy_helper(0)
	gs.lift_stop = player.position + Vector3(1.5, 0, 0)
	world._place_lift_stop()
	player.look_at_point(gs.lift_stop + Vector3(0, 0.3, 0))
	await _frames(120)
	await _shot("06_moles")

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
	hud.close_shop()

	# A find popping out, and the find card.
	var f := 2
	var spot: Vector3 = field.find_spot(f)
	field.ensure_loaded(field.zone_of_y(spot.y))
	_carve_shaft(field, spot.x + 2.0, spot.z, spot.y + 6.0, spot.y - 1.0, 1.3)
	field.flush()
	_stand(player, field, Vector3(spot.x + 2.0, spot.y + 1.0, spot.z))
	player.look_at_point(spot)
	await _frames(10)
	field.dig(spot, 1.2, 1e9)
	await _frames(25)
	await _shot("08_find")

	# The offer tag, on the phone layout.
	hud.set_touch_mode(true)
	hud.offers._wait = 0.0
	await _frames(3)
	await _shot("09_touch_offer")

	# Riding the lift.
	gs.lift_stop = player.position
	world.ride_lift(false)
	await _frames(14)
	await _shot("10_lift_ride")
	await _frames(200)
	await _shot("11_back_at_top")
	gs.wipe_save()
	quit(0)
