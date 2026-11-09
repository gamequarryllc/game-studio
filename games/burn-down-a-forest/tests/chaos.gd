extends SceneTree
## The chaos run: several game-minutes of random input, the way a toddler (or
## a cat) would play. Every control, every notebook chapter and entry, offers,
## finds, ads watched or closed early, purchases, popups, switching between
## touch and mouse, time scale changes, going to the background and back.
##   godot --headless --fixed-fps 20 -s res://tests/chaos.gd -- [minutes] [seed]
## Fails on: a script error logged, a softlock (after the chaos, the game can't
## be got back to plain play), or a broken UI state.
## (Untyped where it touches the game: this compiles before the autoloads exist.)

const DT := 0.05

var gs
var mon
var world
var rng := RandomNumberGenerator.new()
var failures: Array = []
var actions := {}
var _log_start := 0


func _initialize() -> void:
	_run.call_deferred()


func _fail(why: String) -> void:
	if not failures.has(why):
		failures.append(why)
		print("  FAIL  ", why)


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var minutes := float(args[0]) if args.size() > 0 else 6.0
	rng.seed = int(args[1]) if args.size() > 1 else 4242
	gs = root.get_node("GameState")
	mon = root.get_node("Monetization")
	_log_start = _log_size()
	gs.wipe_save(false)
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await process_frame
	gs.grant_embers(5000.0)
	var t := 0.0
	var next := 0.0
	while t < minutes * 60.0:
		await process_frame
		t += DT
		if t >= next:
			next = t + rng.randf_range(0.1, 1.2)
			_random_action()
		_sanity()
	print("  actions: %s" % str(actions))
	await _calm_down()
	_check_log()
	print("CHAOS %s" % ("PASSED" if failures.is_empty() else "FAILED: " + "; ".join(failures)))
	Engine.time_scale = 1.0
	gs.wipe_save(false)
	world.queue_free()
	await process_frame
	root.get_node("Sound").stop_all()
	await process_frame
	quit(0 if failures.is_empty() else 1)


func _random_action() -> void:
	var hud = world.hud
	var k = world.keeper
	var a := rng.randi() % 20
	actions[a] = int(actions.get(a, 0)) + 1
	match a:
		0, 1:
			world.force_move = Vector2(rng.randf_range(-1, 1), rng.randf_range(-1, 1))
		2:
			world.force_move = Vector2.ZERO
		3, 4:
			k.add_look(Vector2(rng.randf_range(-1.5, 1.5), rng.randf_range(-0.6, 0.6)))
		5:
			world.force_fire = not world.force_fire
		6:
			k.jump()
		7:
			hud.toggle_notebook()
		8:
			if hud.notebook != null:
				hud.notebook.select(["tools", "upgrades", "helpers", "magic", "shop", "settings"][rng.randi() % 6])
		9, 10:
			if hud.notebook != null and not hud.notebook._cards.is_empty():
				var c: Dictionary = hud.notebook._cards[rng.randi() % hud.notebook._cards.size()]
				var title: String = (c.title as Label).text
				# (the wipe/reset entries reload the scene: the chaos run leaves those alone)
				if not title in ["Start over", "Reset the save", "Skip to a ring", "Time"]:
					var b: Button = c.button
					if not b.disabled:
						b.pressed.emit()
		11:
			hud.take_offer()
			if hud.offers.current == "" and rng.randf() < 0.3:
				hud.offers.current = ["instant", "boost", "helper_rush"][rng.randi() % 3]
				hud.offers.time_left = 30.0
				hud._show_offer_tag()
		12:
			if rng.randf() < 0.5:
				hud.show_golden(rng.randf_range(50.0, 500.0))
			hud.take_find()
		13:
			_press_ad_button(rng.randf() < 0.5)
		14:
			hud.set_touch_mode(not hud.touch_mode)
		15:
			Engine.time_scale = [1.0, 1.0, 5.0, 10.0, 50.0][rng.randi() % 5]
		16:
			gs._notification(Node.NOTIFICATION_APPLICATION_PAUSED)
			gs._notification(Node.NOTIFICATION_APPLICATION_RESUMED)
		17:
			if hud.popups.get_child_count() == 0 and not hud.is_blocking() and rng.randf() < 0.3:
				hud.show_starter_offer()
			else:
				_press_popup()
		18:
			mon.buy([mon.PRODUCT_EMBERS_S, mon.PRODUCT_PHOENIX, mon.PRODUCT_STARTER, mon.PRODUCT_EMBERS_M][rng.randi() % 4])
		19:
			hud.watch_ad(["instant", "boost", "helper_rush"][rng.randi() % 3])


func _press_ad_button(early: bool) -> void:
	var layer = mon.provider.get("_layer")
	if layer == null:
		return
	for n in layer.find_children("*", "Button", true, false):
		var b: Button = n
		if b.disabled:
			continue
		if (early and b.text.begins_with("Close early")) or (not early and b.text == "Close ad"):
			b.pressed.emit()
			return


func _press_popup() -> void:
	var hud = world.hud
	if hud.popups.get_child_count() == 0:
		return
	var buttons: Array = hud.popups.get_child(0).find_children("*", "Button", true, false)
	if not buttons.is_empty():
		(buttons[rng.randi() % buttons.size()] as Button).pressed.emit()


func _sanity() -> void:
	var hud = world.hud
	var k = world.keeper
	if not k.position.is_finite():
		_fail("the keeper's position went bad")
	if hud.notebook != null and k.input_enabled:
		_fail("the keeper can move with the notebook open")
	if hud.notebook == null and hud.popups.get_child_count() == 0 and not mon.is_watching() and not hud.ending_active and not k.input_enabled:
		_fail("the keeper is frozen with nothing on screen")
	if hud.touch.visible and (hud.notebook != null or not hud.touch_mode):
		_fail("the touch controls show over the notebook or on a computer")
	if gs.embers < -0.01 or is_nan(gs.embers):
		_fail("embers went bad: %s" % gs.embers)


func _calm_down() -> void:
	## Get back to plain play the way a player would: close what's open.
	Engine.time_scale = 1.0
	world.force_fire = false
	world.force_move = Vector2.ZERO
	var hud = world.hud
	for _i in 200:
		_press_ad_button(false)
		_press_ad_button(true)
		if hud.popups.get_child_count() > 0:
			var buttons: Array = hud.popups.get_child(0).find_children("*", "Button", true, false)
			for b in buttons:
				if (b as Button).text == "not now":
					(b as Button).pressed.emit()
		if hud.notebook != null:
			hud.close_notebook()
		await process_frame
		if not hud.is_blocking() and not mon.is_showing_ad():
			break
	await process_frame
	if hud.is_blocking() or mon.is_showing_ad():
		_fail("softlock: couldn't get back to plain play (notebook %s, popups %d, ad %s)" % [
			hud.notebook != null, hud.popups.get_child_count(), mon.is_showing_ad()])
	if not world.keeper.input_enabled:
		_fail("softlock: the keeper stays frozen after the chaos")
	var ticks: int = world.forest.ticks
	for _i in 10:
		await process_frame
	if world.forest.ticks == ticks:
		_fail("the fire stopped ticking")


func _log_path() -> String:
	## This run's log. Godot keeps engine options like --log-file to itself, so a
	## run with its own log passes the same path again after `--` as log=<path>.
	for a in OS.get_cmdline_user_args():
		if a.begins_with("log="):
			return a.substr(4)
	return "user://logs/godot.log"


func _log_size() -> int:
	var fa := FileAccess.open(_log_path(), FileAccess.READ)
	return fa.get_length() if fa != null else 0


func _log_tail(path: String) -> String:
	## Only what this run logged (the file may hold earlier runs too).
	var fa := FileAccess.open(path, FileAccess.READ)
	if fa == null:
		return ""
	var start := _log_start if fa.get_length() >= _log_start else 0
	fa.seek(start)
	return fa.get_buffer(fa.get_length() - start).get_string_from_utf8()


func _check_log() -> void:
	var path := _log_path()
	if not FileAccess.file_exists(path):
		return
	var n := 0
	var lines := _log_tail(path).split("\n")
	for k in lines.size():
		var line := lines[k]
		var at := lines[k + 1] if k + 1 < lines.size() else ""   # where it came from
		if (line.begins_with("ERROR") or line.begins_with("SCRIPT ERROR")) and not line.contains("ALSA") \
				and not line.contains("audio") and not at.contains("audio_driver") and not at.contains("alsa"):
			n += 1
			if n <= 5:
				_fail("logged: %s" % line.substr(0, 200))
