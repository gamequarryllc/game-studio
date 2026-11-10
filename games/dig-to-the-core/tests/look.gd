extends SceneTree
## Quick look renders for art iteration (a handful of views, fast):
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/look.gd -- /tmp/look [names...]
## Names: surface, shaft, clay, fossil, graveyard, crystal, lava, mantle, core, drill, moles, ride.
## (Untyped on purpose: this compiles before the autoloads exist.)

var out_dir := "/tmp/look"
var only: Array = []


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		out_dir = args[0]
	for i in range(1, args.size()):
		only.append(args[i])
	DirAccess.make_dir_recursive_absolute(out_dir)
	_run.call_deferred()


func _want(n: String) -> bool:
	return only.is_empty() or only.has(n)


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("%s/%s.png" % [out_dir, name])
	print("saved ", name)


func _frames(n: int) -> void:
	for _i in n:
		await process_frame


func _chamber(world, y: float, tool: int) -> void:
	var gs = root.get_node("GameState")
	var field = world.field
	gs.tool_index = tool
	world.skip_to_zone(field.zone_of_y(y))
	var want: Dictionary = field.window_for(y)
	field.want_zones(want)
	for z in want:
		field.ensure_loaded(z)
	var yy: float = y + 6.0
	while yy > y:
		field.dig(Vector3(0, yy, 0), 1.4, 1e12)
		yy -= 0.3
	for k in 7:
		var a: float = k * 0.9
		field.dig(Vector3(cos(a) * 2.3, y + 1.1, sin(a) * 2.3), 1.5, 1e12)
	field.flush()
	var fl: float = field.floor_below(Vector3(0, y + 1.2, 0), 6.0)
	world.move_player(Vector3(0, fl + 0.05, 0), 0.6, -0.15)
	gs.note_depth(-fl)


func _landmark_view(world, z: int, tool: int) -> void:
	## Stand in a layer's landmark cave, a couple of metres off, looking at it
	## (the same framing as tests/screenshots.gd).
	var gs = root.get_node("GameState")
	var field = world.field
	gs.tool_index = tool
	world.skip_to_zone(z)
	var cave: Array = field.landmark_cave(z)
	var c: Vector3 = cave[0]
	var away: Vector3 = Vector3(c.x, 0, c.z).normalized()
	var stand: Vector3 = c - away * 1.9
	var p := Vector3(0, c.y, 0)
	while p.distance_to(stand) > 0.3:
		field.dig(p, 1.3, 1e12)
		p = p.move_toward(stand, 0.4)
	field.dig(stand, 1.6, 1e12)
	field.flush()
	var fl: float = field.floor_below(stand + Vector3(0, 1.0, 0), 4.0)
	world.move_player(Vector3(stand.x, fl + 0.05, stand.z), 0.0, -0.15)
	gs.note_depth(-fl)
	var lm := Vector3(c.x, field.floor_below(c, 6.0) + (1.25 if z == 1 else 0.5), c.z)
	world.player.look_at_point(lm)


func _run() -> void:
	var gs = root.get_node("GameState")
	root.get_node("Monetization").provider.instant = true
	gs.reset_state(false)
	gs.save_game()
	gs.tutorial_step = 4
	var world = load("res://scenes/world.tscn").instantiate()
	root.add_child(world)
	var player = world.player
	var field = world.field
	if OS.get_environment("LOOK_NODECOR") != "":
		field.decor_enabled = false
	if OS.get_environment("LOOK_FACET") != "":
		field.material.set_shader_parameter("facet", float(OS.get_environment("LOOK_FACET")))
	await _frames(10)
	if _want("surface"):
		await _frames(4)
		await _shot("surface")
	if _want("shaft"):
		gs.tool_index = 1
		var y := 0.0
		while y > -12.0:
			field.dig(Vector3(0.0, y, 0.0), 1.4, 1e12)
			y -= 0.25
		field.flush()
		world.move_player(Vector3(0.0, field.floor_below(Vector3(0, -10, 0), 6.0) + 0.05, 0.0), -0.6, -0.3)
		await _frames(15)
		world.force_dig = true
		await _frames(30)
		await _shot("shaft")
		world.force_dig = false
	# Each layer's landmark as tests/screenshots.gd frames it: "lm1" .. "lm9".
	for z in range(1, 10):
		if _want("lm%d" % z):
			await _landmark_view(world, z, [0, 2, 2, 3, 3, 4, 5, 5, 6, 6][z])
			await _frames(4)
			if OS.get_environment("LOOK_NOLIGHTS") != "":
				for l in world.find_children("*", "Light3D", true, false):
					if not (l is DirectionalLight3D):
						l.visible = false
			if OS.get_environment("LOOK_LIST") != "":
				var lmk = field.zones[z].landmark
				var cpos: Vector3 = lmk.global_position
				print("landmark at ", cpos, " player ", player.global_position)
				for g in world.find_children("*", "GeometryInstance3D", true, false):
					var gi := g as GeometryInstance3D
					if not gi.is_visible_in_tree():
						continue
					var ab: AABB = gi.global_transform * gi.get_aabb()
					if ab.grow(0.3).has_point(cpos + Vector3(0, 1.0, 0)) or (ab.get_center().distance_to(cpos) < 2.5 and ab.size.length() < 6.0):
						print("  ", gi.get_class(), " ", gi.get_path(), " size ", ab.size, " layers ", gi.layers, " mat ", gi.material_override)
			if OS.get_environment("LOOK_NOROCK") != "":
				for zone in field.zones:
					if zone != null:
						for ch in zone.chunks.values():
							(ch.mesh as MeshInstance3D).visible = false
			if OS.get_environment("LOOK_NOLAMP") != "":
				field.material.set_shader_parameter("lamp_on", 0.0)
			await _frames(16)
			await _shot("lm%d" % z)
	var specs := [["clay", -34.0, 2], ["fossil", -82.0, 3], ["graveyard", -106.0, 3], ["crystal", -130.0, 5],
		["lava", -154.0, 5], ["mantle", -178.0, 6], ["core", -226.0, 6]]
	for spec in specs:
		if not _want(spec[0]):
			continue
		await _chamber(world, spec[1], spec[2])
		await _frames(20)
		await _shot(spec[0])
	if _want("drill"):
		await _chamber(world, -82.0, 3)
		player.set_view(0.6, -0.1)
		await _frames(10)
		world.force_dig = true
		await _frames(90)
		await _shot("drill")
		world.force_dig = false
	if _want("vmdebug"):
		await _chamber(world, -34.0, 3)
		await _frames(10)
		await _shot("vm_own_camera")
		player.camera.cull_mask = 0xFFFFF
		player.vm_camera.cull_mask = 0
		await _frames(5)
		await _shot("vm_main_camera")
		player.camera.cull_mask = 0xFFFFF & ~(1 << 10)
		player.vm_camera.cull_mask = 1 << 10
	if _want("moles"):
		await _chamber(world, -34.0, 2)
		gs.grant_money(1e6)
		for _i in 3:
			gs.buy_helper(0)
		gs.buy_helper(1)
		gs.lift_stop = player.position + Vector3(1.4, 0, 0.4)
		world._place_lift_stop()
		player.look_at_point(gs.lift_stop + Vector3(0, 0.2, 0))
		await _frames(150)
		await _shot("moles")
	if _want("dig"):
		gs.tool_index = 0
		world.move_player(Vector3(0.5, 0.05, 8.0), 0.3, -0.9)
		await _frames(5)
		world.force_dig = true
		await _frames(150)
		world.force_dig = false
		await _frames(10)
		await _shot("dig")
	if _want("ending"):
		world.skip_to_zone(9)
		await _frames(20)
		gs.has_won = false
		world._ended_shown = false
		gs.discover(load("res://scripts/balance.gd").core_find())
		await _frames(400)
		var heart = world.field.zones[9].landmark if world.field.zones[9] != null else null
		print("heart ", heart.global_position if heart != null else "none", " cam ", world._end_cam.global_position if world._end_cam != null else "none")
		for e in world.hud.popups.get_children():
			print("popup ", e, " vis ", e.visible, " rect ", e.get_global_rect())
			for c in e.get_children():
				print("   child ", c, " rect ", c.get_global_rect(), " mod ", c.modulate, " vis ", c.visible)
		await _shot("ending")
	if _want("ride"):
		await _chamber(world, -60.0, 2)
		gs.lift_stop = player.position
		world.ride_lift(false)
		await _frames(30)
		await _shot("ride")
		await _frames(120)
	gs.reset_state(false)
	gs.save_game()
	quit(0)
