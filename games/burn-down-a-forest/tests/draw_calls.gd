extends SceneTree
## Draw calls, visible objects and triangles in a few typical views, with the real renderer:
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/draw_calls.gd
## (Untyped on purpose: this compiles before the GameState autoload exists.)
var world
func _frames(n):
	for _i in n:
		await process_frame
func _initialize():
	_run.call_deferred()
func _measure(label: String) -> void:
	await _frames(6)
	var dc = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var ob = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
	var pr = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	print("%-22s draw calls %4d  objects %4d  triangles %7d" % [label, dc, ob, pr])
func _run():
	var gs = root.get_node("GameState")
	gs.wipe_save(false)
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	world.hud.show_desktop_hint = false
	await _frames(10)
	print("multimeshes made: ", world.view.draw_lists, "  3D render scale: ", root.scaling_3d_scale, " mode ", root.scaling_3d_mode)
	await _measure("spawn")
	world.hud.visible = false
	await _measure("spawn, no HUD")
	world.hud.visible = true
	var k = world.keeper
	k.position = Vector3(-8, world.forest.height_at(-8, 26), 26); k.set_view(0.35, -0.6)
	await _measure("pinewood")
	k.position = Vector3(0, world.forest.height_at(0, 30), 30); k.set_view(0.0, -0.25)
	await _measure("over the forest")
	k.position = Vector3(2, world.forest.height_at(2, 14), 14); k.set_view(0.0, -0.2)
	await _measure("cursed grove")
	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	quit()
