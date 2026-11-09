extends SceneTree
## One screenshot of one view, for quick looks while working on the art:
##   xvfb-run -a -s "-screen 0 1280x720x24" godot --rendering-driver opengl3 -s res://tests/quick_shot.gd -- out.png [x z yaw pitch tool fire_s touch hold WxH]

var gs


func _initialize() -> void:
	create_timer(150.0).timeout.connect(func():
		print("QUICK SHOT TIMED OUT")
		quit(2))
	_run.call_deferred()


func _run() -> void:
	var a := OS.get_cmdline_user_args()
	var out := a[0] if a.size() > 0 else "/tmp/quick.png"
	if a.size() > 9 and "x" in a[9]:
		var wh: PackedStringArray = a[9].split("x")
		DisplayServer.window_set_size(Vector2i(int(wh[0]), int(wh[1])))
		root.size = Vector2i(int(wh[0]), int(wh[1]))
	gs = root.get_node("GameState")
	gs.wipe_save(false)
	gs.tutorial_step = 9
	gs.dev_gates_open = true
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.hud.set_touch_mode(a.size() > 7 and a[7] == "1")
	world.hud.show_desktop_hint = false
	if a.size() > 4:
		gs.tool_index = int(a[5]) if a.size() > 5 else 0
		world.move_giant_to(Vector3(float(a[1]), 0, float(a[2])))
		world.giant.set_view(float(a[3]), float(a[4]))
	if a.size() > 6 and float(a[6]) > 0.0:
		# Light what the crosshair is on and let it burn for a while.
		for _i in 3:
			await process_frame
		var p: Vector3 = world.giant.aim.point
		world.ignite_at(p, 99999.0)
		for _i in int(float(a[6]) / 0.1):
			world.city.tick(0.1)
			world.view.advance(0.1)
			world._after_tick()
	world.force_fire = a.size() > 8 and a[8] == "1"
	for _i in (40 if world.force_fire else 12):
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(out)
	print("saved ", out)
	gs.wipe_save(false)
	world.queue_free()
	await process_frame
	quit(0)
