extends SceneTree
## Renders screenshots of key moments, for checking the look by eye:
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/forest-shots
## The fire is fast-forwarded tick by tick between shots, so a run takes a minute or two.
## (Untyped on purpose: this compiles before the GameState autoload exists.)

var out_dir := "/tmp/forest-shots"
var world
var gs


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


func _ff(seconds: float) -> void:
	## Fast-forward the fire (and everything that reacts to it).
	for _i in int(seconds / 0.1):
		world.forest.tick(0.1)
		world.view.advance(0.1)
		world._after_tick()
		gs.earn(world.forest.take_pay())


func _place(pos: Vector3, yaw: float, pitch: float) -> void:
	var k = world.keeper
	pos.y = world.forest.height_at(pos.x, pos.z)
	k.position = pos
	k.set_view(yaw, pitch)


func _light(at: Vector3, radius: float) -> void:
	## Light everything around a spot, as if the tool had been held there.
	var f = world.forest
	f.add_heat_area(Vector2(at.x, at.z), radius, 99999.0)
	f.tick(0.1)


func _close_popups() -> void:
	for c in world.hud.popups.get_children():
		world.hud.popups.remove_child(c)
		c.queue_free()
	world.keeper.input_enabled = true


func _run() -> void:
	gs = root.get_node("GameState")
	gs.wipe_save(false)
	gs.tutorial_step = 0
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	var hud = world.hud
	var keeper = world.keeper
	hud.set_touch_mode(false)
	hud.show_desktop_hint = false
	await _frames(12)
	await _shot("01_spawn")

	# Light the grass in front of the village and watch it spread.
	world.force_fire = true
	await _frames(40)
	await _shot("02_matchstick")
	world.force_fire = false
	_ff(5.0)
	await _frames(6)
	await _shot("03_fire_spreading")
	_ff(6.0)
	await _frames(4)
	await _shot("03b_fire_later")

	# Phone layout.
	hud.set_touch_mode(true)
	await _frames(4)
	await _shot("04_touch_overlay")
	hud.set_touch_mode(false)

	# A pine fire in the Pinewood with the Lighter, from up close.
	gs.grant_embers(1e6)
	gs.buy_tool(1)
	gs.tutorial_step = 9
	_place(Vector3(-8.0, 0, 26.0), 0.35, -0.7)
	_light(Vector3(-14.0, 0, 16.0), 4.0)
	_ff(7.0)
	await _frames(6)
	await _shot("05_pine_fire")
	_ff(10.0)
	await _frames(4)
	await _shot("05b_pine_fire_later")

	# The Tiki Torch and the Flamethrower in action.
	gs.buy_tool(2)
	_place(Vector3(10.0, 0, 30.0), -0.6, -0.62)
	world.force_fire = true
	await _frames(30)
	await _shot("06_tiki_torch")
	gs.buy_tool(3)
	_place(Vector3(14.0, 0, 18.0), -0.3, -0.55)
	await _frames(40)
	await _shot("06b_flamethrower")
	world.force_fire = false

	# The notebook: tools, upgrades, shop.
	gs.embers = 3800.0
	gs.tool_index = 1
	hud.open_notebook("tools")
	await _frames(6)
	await _shot("07_notebook_tools")
	hud.notebook.select("upgrades")
	await _frames(4)
	await _shot("07b_notebook_upgrades")
	hud.notebook.select("magic")
	await _frames(4)
	await _shot("07c_notebook_magic")
	hud.notebook.select("shop")
	await _frames(4)
	await _shot("07d_notebook_shop")
	hud.close_notebook()

	# The timed offer tag.
	_place(Vector3(0.0, 0, 53.0), 0.0, -0.6)
	gs.tool_index = 1
	gs.embers = 3500.0
	gs._income = [150.0, 150.0, 150.0, 150.0]
	hud.offers.current = "instant"
	hud.offers.time_left = 30.0
	hud._show_offer_tag()
	for _i in 20:
		gs._income = [150.0, 150.0, 150.0, 150.0]   # steady income: the offer stays worth taking
		gs.embers = 3500.0
		hud.offers.time_left = 30.0                 # (software rendering is slow: don't let it expire)
		await process_frame
	await _shot("08_offer_tag")
	hud.offers.current = ""
	hud.offer_tag.visible = false

	# Helpers and the meadow after the fire.
	gs.helper_counts[0] = 6
	gs.helper_counts[1] = 3
	_ff(25.0)
	_place(Vector3(-6.0, 0, 34.0), 0.2, -0.75)
	await _frames(40)
	await _shot("09_meadow_helpers")

	# Looking into the Cursed Grove at the Elder Tree.
	_place(Vector3(6.0, 0, 30.0), 0.1, -0.3)
	await _frames(8)
	await _shot("10_grove_view")
	# The grove on fire.
	gs.tool_index = 3
	_light(Vector3(-4.0, 0, 9.0), 5.0)
	_light(Vector3(5.0, 0, 8.0), 5.0)
	_ff(14.0)
	_place(Vector3(2.0, 0, 26.0), 0.05, -0.4)
	await _frames(8)
	await _shot("11_grove_fire")

	# A wide look over a big blaze in the Pinewood.
	_light(Vector3(-6.0, 0, 20.0), 7.0)
	_light(Vector3(4.0, 0, 21.0), 5.0)
	_ff(6.0)
	_place(Vector3(-1.0, 0, 33.0), 0.05, -0.48)
	await _frames(10)
	await _shot("13_hero_blaze")

	# The starter pack popup.
	hud.show_starter_offer()
	await _frames(6)
	await _shot("12_starter_popup")
	_close_popups()
	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	quit(0)
