extends SceneTree
## Quick look at the 3D world while tuning art (a few views, few frames each):
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/look.gd -- /tmp/look [names...]
## Names: intro spawn fire pines oaks grove elder meadow village keeper (default: all).
## (Untyped on purpose: this compiles before the GameState autoload exists.)

var out_dir := "/tmp/forest-look"
var world
var gs


func _initialize() -> void:
	_run.call_deferred()


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("%s/%s.png" % [out_dir, name])
	print("saved ", name)


func _frames(n: int) -> void:
	for _i in n:
		await process_frame


func _ff(seconds: float) -> void:
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
	world.forest.add_heat_area(Vector2(at.x, at.z), radius, 99999.0)
	world.forest.tick(0.1)


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		out_dir = args[0]
	var want: Array = args.slice(1)
	DirAccess.make_dir_recursive_absolute(out_dir)
	gs = root.get_node("GameState")
	gs.wipe_save(false)
	gs.tutorial_step = 9
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	world.hud.set_touch_mode(false)
	world.hud.show_desktop_hint = false
	world.hud.visible = false
	await _frames(3)
	var all := want.is_empty()
	if all or want.has("intro"):
		world.keeper.set_view(0.0, world.INTRO_PITCH)
		await _frames(3)
		await _shot("intro")
	world.intro_t = -1.0
	if all or want.has("spawn"):
		_place(world.SPAWN, 0.0, world.SPAWN_PITCH)
		await _frames(3)
		await _shot("spawn")
	if all or want.has("keeper"):
		_place(Vector3(-2.0, 0, 50.0), PI * 0.85, -0.35)
		await _frames(3)
		await _shot("keeper")
	gs.grant_embers(1e6)
	gs.buy_tool(1)
	gs.buy_tool(2)
	gs.buy_tool(3)
	if all or want.has("fire"):
		_place(world.SPAWN, 0.0, world.SPAWN_PITCH)
		_light(Vector3(-4.0, 0, 41.0), 3.0)
		_light(Vector3(5.0, 0, 40.0), 2.0)
		_ff(2.5)
		await _frames(3)
		await _shot("fire")
	if all or want.has("pines"):
		_light(Vector3(-12.0, 0, 18.0), 4.0)
		_ff(3.5)
		_place(Vector3(-8.0, 0, 28.0), 0.4, -0.55)
		await _frames(3)
		await _shot("pines")
	if want.has("noshadow"):
		_place(Vector3(-8.0, 0, 28.0), 0.4, -0.55)
		world.moon.shadow_enabled = false
		await _frames(3)
		await _shot("pines_noshadow")
		world.moon.shadow_enabled = true
	if all or want.has("oaks"):
		_light(Vector3(10.0, 0, 14.0), 3.0)
		_ff(4.0)
		_place(Vector3(12.0, 0, 24.0), -0.2, -0.5)
		await _frames(3)
		await _shot("oaks")
	if all or want.has("grove"):
		_place(Vector3(4.0, 0, 22.0), 0.1, -0.3)
		await _frames(3)
		await _shot("grove")
	if all or want.has("meadow"):
		_ff(14.0)
		_place(Vector3(-6.0, 0, 30.0), 0.5, -0.45)
		await _frames(3)
		await _shot("meadow")
	if all or want.has("elder"):
		_light(Vector3(0.0, 0, 12.0), 6.0)
		_ff(30.0)
		_place(Vector3(0.5, 0, 14.0), 0.0, -0.1)
		await _frames(3)
		await _shot("elder")
	if all or want.has("village"):
		_place(Vector3(6.0, 0, 46.0), PI * 0.75, -0.3)
		await _frames(3)
		await _shot("village")
	if all or want.has("ending"):
		# every ring burnt, then the curse lifts and the camera sweeps up at dawn
		world.forest.dev_clear_outside(Balance.ZONES.size())
		_ff(1.0)
		_place(Vector3(0.5, 0, 16.0), 0.0, -0.4)
		world._on_won()
		for _i in 30:
			world._update_ending(0.2)
			_ff(0.2)
			await process_frame
		await _frames(3)
		await _shot("ending")
	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	quit(0)
