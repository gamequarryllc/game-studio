extends SceneTree
## The chaos run (STUDIO.md, "Playtesting"): several game-minutes of random
## input on a bay that's partly drained. Touches and drags and pinches
## anywhere (through the real input path), keys, every visible button
## pressed at random (flags, callout stamps, the chandlery's tags and signs,
## the harbour office's ad notice and purchases, the aquarium's signs and its
## register, the fake ad screens, the dev log's time and income switches),
## and the app sent to the background and back. Then it checks the game is
## still sane: it can always get back to playing, there's never more than
## one panel or tag up, the camera that's live is the right one, and nothing
## printed as an error.
##
##   godot --headless --fixed-fps 20 -s res://tests/chaos.gd [-- minutes]
## Like the playthrough bot, it runs itself as a child and scans the output.

const ERROR_PATTERNS := ["SCRIPT ERROR", "ERROR:", "USER ERROR", "Parse Error", "Invalid call", "Invalid access"]
const IGNORE_PATTERNS := ["resources still in use at exit", "ObjectDB instances leaked", "ALSA lib", "Condition \"status < 0\"",
	"were leaked at exit", "PagedAllocator", "instance_notify_deleted", "Leaked instance"]
const KEYS := [KEY_W, KEY_A, KEY_S, KEY_D, KEY_E, KEY_Q, KEY_B, KEY_M, KEY_ESCAPE, KEY_EQUAL, KEY_MINUS, KEY_F9]

var minutes := 6.0
var gs
var mon
var world
var failures: Array = []
var rng := RandomNumberGenerator.new()
var _blocked_since := -1.0
var _counts := {}


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if not args.has("--child"):
		_run_as_parent(args)
		return
	for a in args:
		if a.is_valid_float():
			minutes = float(a)
	_run.call_deferred()


func _run_as_parent(args: Array) -> void:
	var child_args := ["--headless", "--fixed-fps", "20", "--path", ProjectSettings.globalize_path("res://"), "-s", "res://tests/chaos.gd", "--"]
	child_args.append_array(args)
	child_args.append("--child")
	var out: Array = []
	var code := OS.execute(OS.get_executable_path(), child_args, out, true)
	var text := "\n".join(out)
	print(text)
	var errors: Array = []
	for line in text.split("\n"):
		var ignore := false
		for ig in IGNORE_PATTERNS:
			if line.contains(ig):
				ignore = true
		if ignore:
			continue
		for pat in ERROR_PATTERNS:
			if line.contains(pat):
				errors.append(line.strip_edges())
				break
	if not errors.is_empty():
		print("CHAOS FAILED: %d error line(s):" % errors.size())
		for e in errors.slice(0, 20):
			print("  " + e)
		quit(1)
		return
	quit(code)


func fail(what: String) -> void:
	if not failures.has(what):
		failures.append(what)
		print("  FAIL  %s" % what)


func _run() -> void:
	gs = root.get_node("GameState")
	mon = root.get_node("Monetization")
	mon.provider.instant = false            # the fake ad screens too
	rng.seed = 77
	gs.SAVE_PATH = "user://ocean_save_chaos.json"
	gs.reset_state(false)
	gs.money = 60000.0
	gs.save_game()
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	for _i in 3:
		await process_frame
	world.skip_to_ring(2)
	Engine.time_scale = 3.0
	print("Chaos run: %.0f game-minutes of random input" % minutes)
	var end: float = gs.clock + minutes * 60.0
	var next_check: float = gs.clock + 2.0
	while gs.clock < end and failures.size() < 6:
		await process_frame
		_poke()
		if gs.clock >= next_check:
			next_check = gs.clock + 2.0
			_check()
	Engine.time_scale = 1.0
	# Afterwards it must still be playable: close whatever's up and tap a pad.
	await _recover()
	var hud = world.hud
	if hud.shop_open() or world.paused_world or not hud.staff.visible:
		fail("the game couldn't get back to the bay after the chaos (shop %s, dev log %s, aquarium %s, HUD %s, ad showing %s, ending %s)" % [hud.shop.visible,
			hud.dev != null and hud.dev.visible, world.paused_world, hud.staff.visible, mon.is_showing_ad(), hud.ending != null])
	var m0: float = gs.money
	gs.grant_money(1e7)
	var pi: int = gs.cheapest_pad()
	if pi >= 0 and not world.place_pump(pi):
		fail("couldn't buy a pump after the chaos")
	print("Pressed: %s" % str(_counts))
	gs.delete_save()
	print("CHAOS: %s" % ("PASSED" if failures.is_empty() else "FAILED (%d)" % failures.size()))
	quit(0 if failures.is_empty() else 1)


func _buttons() -> Array:
	var out: Array = []
	for b in root.find_children("*", "BaseButton", true, false):
		var bb := b as BaseButton
		if not bb.is_visible_in_tree() or bb.disabled:
			continue
		var id := str(bb.get_meta("id", ""))
		if id == "dev:reset" or id.begins_with("dev:x"):
			continue            # the dev log's reset and time switches would end the run
		out.append(bb)
	return out


func _poke() -> void:
	var vs: Vector2 = root.get_visible_rect().size
	var r := rng.randf()
	if r < 0.32:
		var p := Vector2(rng.randf() * vs.x, rng.randf() * vs.y)
		_touch(0, p, true)
		_touch(0, p + Vector2(rng.randf_range(-6, 6), rng.randf_range(-6, 6)), false)
		_count("tap")
	elif r < 0.42:
		var p := Vector2(rng.randf() * vs.x, rng.randf() * vs.y)
		_touch(0, p, true)
		for k in 4:
			_drag(0, p + Vector2(k * 30.0, k * 12.0))
		_touch(0, p + Vector2(120, 48), false)
		_count("drag")
	elif r < 0.46:
		var a := Vector2(vs.x * 0.4, vs.y * 0.5)
		var b := Vector2(vs.x * 0.6, vs.y * 0.5)
		_touch(0, a, true)
		_touch(1, b, true)
		_drag(0, a - Vector2(40, 0))
		_drag(1, b + Vector2(40, 0))
		_touch(1, b, false)
		_touch(0, a, false)
		_count("pinch")
	elif r < 0.56:
		var k: Key = KEYS[rng.randi() % KEYS.size()]
		_key(k)
		_count("key")
	elif r < 0.92:
		var bs := _buttons()
		if not bs.is_empty():
			var b: BaseButton = bs[rng.randi() % bs.size()]
			b.pressed.emit()
			_count(str(b.get_meta("id", b.get_class())))
	elif r < 0.95:
		world.hud.flag_shop.pressed.emit()
		_count("flag:shop")
	elif r < 0.97:
		world.hud.flag_aqua.pressed.emit()
		_count("flag:aquarium")
	else:
		gs._notification(NOTIFICATION_APPLICATION_FOCUS_OUT)
		root.propagate_notification(NOTIFICATION_APPLICATION_PAUSED)
		root.propagate_notification(NOTIFICATION_APPLICATION_RESUMED)
		_count("background")


func _count(k: String) -> void:
	_counts[k] = int(_counts.get(k, 0)) + 1


func _key(code: Key) -> void:
	for down in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = down
		root.push_input(ev)


func _touch(index: int, pos: Vector2, pressed: bool) -> void:
	var ev := InputEventScreenTouch.new()
	ev.index = index
	ev.position = pos
	ev.pressed = pressed
	root.push_input(ev, true)


func _drag(index: int, pos: Vector2) -> void:
	var ev := InputEventScreenDrag.new()
	ev.index = index
	ev.position = pos
	ev.relative = Vector2(10, 4)
	root.push_input(ev, true)


func _check() -> void:
	var hud = world.hud
	var panels := 0
	if hud.shop.visible:
		panels += 1
	if hud.dev != null and hud.dev.visible:
		panels += 1
	if world.aquarium.is_open:
		panels += 1
	if panels > 1:
		fail("two panels open at once (shop %s, dev %s, aquarium %s)" % [hud.shop.visible, hud.dev != null and hud.dev.visible, world.aquarium.is_open])
	if world.aquarium.is_open and not world.aquarium.camera.current:
		fail("the aquarium is open but its camera isn't live")
	if not world.aquarium.is_open and world.ending_shot == null and not world.rig.camera.current:
		fail("on the bay but the bay's camera isn't live")
	if hud.callout.visible and hud._tag_kind == "":
		fail("a tag is showing with nothing behind it")
	if (hud.shop.visible or world.aquarium.is_open) and hud.staff.visible:
		fail("the HUD shows through a panel")
	if mon.is_showing_ad():
		if _blocked_since < 0.0:
			_blocked_since = gs.clock
		elif gs.clock - _blocked_since > 40.0:
			fail("an ad screen has been up for 40 s")
	else:
		_blocked_since = -1.0
	if Engine.time_scale > 3.0:
		Engine.time_scale = 3.0         # the dev log's time switch: keep the run's length honest


func _recover() -> void:
	for _i in 200:
		await process_frame
		if mon.is_showing_ad():
			# a player taps "Close ad" once it lets them
			for b in mon.provider.find_children("*", "Button", true, false):
				if not (b as Button).disabled and (b as Button).text == "Close ad":
					(b as Button).pressed.emit()
			continue
		var hud = world.hud
		if hud.dev != null and hud.dev.visible:
			hud.dev.close()
		if hud.shop.visible:
			hud.close_shop()
		if world.aquarium.is_open:
			world.aquarium.close()
		if hud.ending != null:
			for b in hud.ending.find_children("*", "BaseButton", true, false):
				b.pressed.emit()
		if not hud.shop_open() and not world.paused_world and hud.staff.visible:
			return
