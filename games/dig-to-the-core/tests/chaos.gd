extends SceneTree
## The chaos run (STUDIO.md, "Playtesting"): several game-minutes of random
## input. Keys, clicks, touches anywhere, every visible button pressed at
## random (shop tabs, purchases, ad tickets, the fake ad screens, the dev
## tools, reset included), the shop opened and closed, touch mode on and off,
## and the app sent to the background and back. Then it checks the game is
## still sane: no softlock (it can always get back to playing), no black
## screen left over, no UI in an impossible state, the player in the world,
## and nothing printed as an error.
##
##   godot --headless --fixed-fps 20 -s res://tests/chaos.gd [-- minutes]
## Like the playthrough bot, it runs itself as a child and scans the output.
## (Untyped where it touches autoloads: this compiles before they exist.)

const ERROR_PATTERNS := ["SCRIPT ERROR", "ERROR:", "USER ERROR", "Parse Error", "Invalid call", "Invalid access"]
const IGNORE_PATTERNS := ["resources still in use at exit", "ObjectDB instances leaked", "ALSA lib", "Condition \"status < 0\""]
const KEYS := [KEY_W, KEY_A, KEY_S, KEY_D, KEY_SPACE, KEY_E, KEY_B, KEY_M, KEY_ESCAPE, KEY_UP, KEY_LEFT]

var minutes := 6.0
var gs
var mon
var failures: Array = []
var rng := RandomNumberGenerator.new()
var _blocked_since := -1.0
var _black_since := -1.0
var _held: Array = []
var _counts := {}
var _resets := 0


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
	var child_args := ["--headless", "--fixed-fps", "20", "--path", ProjectSettings.globalize_path("res://"),
		"-s", "res://tests/chaos.gd", "--"]
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
		print("  FAIL  %s (at %.0f s)" % [what, gs.clock])


func _world():
	return current_scene


func _run() -> void:
	rng.seed = 20261109
	gs = root.get_node("GameState")
	mon = root.get_node("Monetization")
	mon.provider.instant = false      # the real fake-ad screens, with their countdown and buttons
	gs.reset_state(false)
	gs.save_game()
	var w = load("res://scenes/world.tscn").instantiate()
	root.add_child(w)
	current_scene = w                 # so the dev menu's reset can reload it like the real game
	for _i in 5:
		await process_frame
	gs.grant_money(5000.0)
	var end_t: float = minutes * 60.0
	var frames := 0
	var last_report := 0.0
	print("Chaos run: %.0f game-minutes of random input" % minutes)
	while gs.clock < end_t:
		await process_frame
		frames += 1
		var world = _world()
		if world == null or not is_instance_valid(world) or not world.is_inside_tree() or world.get("hud") == null:
			continue      # mid-reload (the dev reset)
		_poke(world)
		if frames % 10 == 0:
			_check(world)
		if gs.clock - last_report > 60.0:
			last_report = gs.clock
			print("  %3.0f s  depth %.0f m  tool %s  cash %s  shop %s  touch %s" % [gs.clock, gs.deepest, gs.tool_def().name,
				Fmt.num(gs.money), world.hud.shop != null, world.hud.touch_mode])
		if failures.size() > 6:
			break
	# Afterwards it must be possible to get back to plain digging.
	var world = _world()
	await _recover(world)
	world = _world()
	if world.hud.is_blocking():
		fail("can't get back to playing: something is still blocking (%s)" % _blocker(world))
	for k in _held:
		_key(k, false)
	print("Pressed: %s" % str(_counts))
	print("Dev resets survived: %d" % _resets)
	Engine.time_scale = 1.0
	gs.income_mult = 1.0
	gs.debug_speed = 1.0
	world.queue_free()
	await process_frame
	gs.reset_state(false)
	gs.save_game()
	load("res://scripts/dig_field.gd").clear_caches()
	load("res://scripts/models.gd").clear_caches()
	await process_frame
	print("CHAOS %s" % ("PASSED" if failures.is_empty() else "FAILED (%d)" % failures.size()))
	quit(0 if failures.is_empty() else 1)


# =====================================================================================
# Random input
# =====================================================================================
func _poke(world) -> void:
	var hud = world.hud
	var r := rng.randf()
	if r < 0.05:
		# A key: tapped, or held for a while.
		var k: Key = KEYS[rng.randi() % KEYS.size()]
		if k in [KEY_W, KEY_A, KEY_S, KEY_D, KEY_UP, KEY_LEFT] and rng.randf() < 0.6:
			if _held.has(k):
				_key(k, false)
				_held.erase(k)
			else:
				_key(k, true)
				_held.append(k)
		else:
			_key(k, true)
			_key(k, false)
		_count("key")
	elif r < 0.10:
		# A touch somewhere (taps buttons, the stick, DIG, the view), sometimes dragged.
		var vs: Vector2 = world.get_viewport().get_visible_rect().size
		var pos := Vector2(rng.randf() * vs.x, rng.randf() * vs.y)
		var idx := rng.randi() % 3
		_touch(idx, pos, true)
		if rng.randf() < 0.5:
			_drag(idx, pos + Vector2(rng.randf_range(-80, 80), rng.randf_range(-80, 80)))
		if rng.randf() < 0.7:
			_touch(idx, pos, false)
		_count("touch")
	elif r < 0.13:
		# A mouse click and a nudge of the view.
		var mb := InputEventMouseButton.new()
		mb.button_index = MOUSE_BUTTON_LEFT
		mb.pressed = rng.randf() < 0.6
		mb.position = Vector2(rng.randf() * 1280.0, rng.randf() * 720.0)
		root.push_input(mb)
		var mm := InputEventMouseMotion.new()
		mm.relative = Vector2(rng.randf_range(-40, 40), rng.randf_range(-30, 30))
		root.push_input(mm)
		world.player.add_look(mm.relative * 0.0025)
		_count("mouse")
	elif r < 0.2:
		# Any visible, enabled button anywhere (HUD, shop, popups, the fake ad screen).
		var buttons := _buttons()
		if not buttons.is_empty():
			var b: Button = buttons[rng.randi() % buttons.size()]
			if _allowed(b):
				b.pressed.emit()
				_count("button")
	elif r < 0.215:
		if hud.shop == null and not hud.is_blocking():
			hud.open_shop(["tools", "upgrades", "crew", "finds", "bonus"][rng.randi() % 5])
		elif hud.shop != null:
			hud.close_shop()
		_count("shop")
	elif r < 0.22:
		hud.set_touch_mode(not hud.touch_mode)
		_count("touch mode")
	elif r < 0.224:
		# To the background and back.
		for n in [Node.NOTIFICATION_APPLICATION_FOCUS_OUT, Node.NOTIFICATION_APPLICATION_PAUSED]:
			root.propagate_notification(n)
		for n in [Node.NOTIFICATION_APPLICATION_RESUMED, Node.NOTIFICATION_APPLICATION_FOCUS_IN]:
			root.propagate_notification(n)
		_count("background")
	elif r < 0.23:
		world.force_dig = not world.force_dig
		_count("dig")
	elif r < 0.232 and gs.money < 1e5:
		gs.grant_money(gs.next_tool_cost() * 0.5 + 500.0)


func _allowed(b: Button) -> bool:
	## Every button is fair game; time scale is capped at 10x so a minute of
	## chaos stays a minute of chaos.
	if b.text.begins_with("time 50"):
		return false
	if b.text == "reset save":
		_resets += 1
	return true


func _buttons() -> Array:
	var out: Array = []
	for b in root.find_children("*", "Button", true, false):
		var bb := b as Button
		if bb.is_visible_in_tree() and not bb.disabled:
			out.append(bb)
	return out


func _count(k: String) -> void:
	_counts[k] = int(_counts.get(k, 0)) + 1


func _key(code: Key, down: bool) -> void:
	var ev := InputEventKey.new()
	ev.physical_keycode = code
	ev.keycode = code
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
	ev.relative = Vector2(rng.randf_range(-20, 20), rng.randf_range(-20, 20))
	root.push_input(ev, true)


# =====================================================================================
# Sanity
# =====================================================================================
func _check(world) -> void:
	var hud = world.hud
	var player = world.player
	var t: float = gs.clock
	if Engine.time_scale > 10.0:
		Engine.time_scale = 10.0
	# Blocked for a long time: try to get out the way a player would; fail if we can't.
	if hud.is_blocking():
		if _blocked_since < 0.0:
			_blocked_since = t
		elif t - _blocked_since > 25.0:
			await _recover(world)
			if is_instance_valid(world) and world.is_inside_tree() and world.hud.is_blocking():
				fail("softlock: blocked for good (%s)" % _blocker(world))
			_blocked_since = -1.0
	else:
		_blocked_since = -1.0
	# A black screen left over from the lift's fade.
	if hud.fade.color.a > 0.9 and not world.is_riding():
		if _black_since < 0.0:
			_black_since = t
		elif t - _black_since > 2.0:
			fail("the screen stayed black with no lift ride")
	else:
		_black_since = -1.0
	# The ride always ends.
	if world.is_riding() and float(world._ride.get("t", 0.0)) > 12.0:
		fail("a lift ride never ended")
	# UI states that should never happen.
	if hud._find_card.visible and hud._find_index < 0:
		fail("a find card is showing for no find")
	if hud.shop != null and not is_instance_valid(hud.shop):
		fail("the shop reference points at a freed panel")
	if hud.touch.visible and (not hud.touch_mode or hud.is_blocking() or hud.riding):
		fail("touch controls showing over a menu or the ride")
	if hud.shop != null and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		fail("the mouse is captured while the shop is open")
	var pp: Vector3 = player.position
	if absf(pp.x) > 39.0 or absf(pp.z) > 39.0 or pp.y > 30.0 or pp.y < world.field.bottom_y - 1.5:
		fail("the player left the world at %s" % pp)
	if gs.money < 0.0 or is_nan(gs.money):
		fail("money went bad: %s" % gs.money)


func _blocker(world) -> String:
	var hud = world.hud
	return "shop %s, popups %d, watching %s, ad open %s" % [hud.shop != null, hud.popups.get_child_count(),
		mon.is_watching(), mon.is_showing_ad()]


func _recover(world) -> void:
	## Get back to playing: close the shop, answer popups, sit through ads.
	for _i in 400:
		world = _world()
		if world == null or not is_instance_valid(world) or not world.is_inside_tree():
			await process_frame
			continue
		var hud = world.hud
		if not hud.is_blocking():
			return
		if hud.shop != null:
			hud.close_shop()
		elif hud.popups.get_child_count() > 0:
			var bs: Array = hud.popups.get_child(hud.popups.get_child_count() - 1).find_children("*", "Button", true, false)
			if not bs.is_empty():
				(bs[bs.size() - 1] as Button).pressed.emit()
		else:
			# A fake ad screen: wait out its countdown, then press "Close ad".
			for b in _buttons():
				if (b as Button).text == "Close ad":
					(b as Button).pressed.emit()
		await process_frame
