extends SceneTree
## The playthrough bot: plays a fresh save to the end (the keep falling) through the
## game's real systems: it walks the giant with the stick (A* round anything too tall
## to step over), aims with the camera, holds the fire button, and shops by pressing
## the buttons in the box. It reports when each tool was bought and each district came
## down (pacing), and fails if:
##  - the ending isn't reached, or progress stalls for too long;
##  - a tool, upgrade, helper or find is never reachable;
##  - the giant leaves the warehouse or gets stuck in geometry;
##  - a save and reload at several points mid-run doesn't restore the same state;
##  - an ad or purchase flow (stubbed) breaks anywhere it appears;
##  - anything is printed as an error (the run happens in a child process whose output
##    this one reads).
##
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- keen|casual|boosted [ads]
##
## keen: plays well and never idles; casual: slower, picks the nearest thing, watches
## its fires burn, wanders off, shops now and then; boosted: keen with the dev x10
## income (CI runs it). Add "ads" to take every rewarded ad on offer (pacing with ads).
##
## Two more modes share the same harness:
##   chaos   several game-minutes of random input: every button and key, panels opened
##           and closed, random purchases, ads started and abandoned, the app sent to
##           the background and back, the window resized. Then it checks the game still
##           answers (no softlock, no stuck panel).
##   visual  (under xvfb, not headless) the boosted playthrough with the screen drawn
##           only for a screenshot every few game-seconds, at phone and tablet sizes:
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 --fixed-fps 20 \
##       -s res://tests/playthrough.gd -- boosted visual /tmp/city-visual
## (Untyped where it holds scripts that use the autoloads: this compiles before them.)

const FPS := 20.0
const BENIGN := ["resources still in use at exit", "ObjectDB instances leaked", "at: cleanup", "at: clear (",
	"Condition \"status < 0\""]

var profile := "keen"
var with_ads := false
var child := false
var visual := false
var vis_dir := "/tmp/city-visual"
var _vis_t := 0.0
var _vis_n := 0
const VIS_EVERY := 12.0
const VIS_SIZES := [Vector2i(844, 390), Vector2i(932, 430), Vector2i(1024, 768)]
var gs
var mon
var world
var city: CityGrid
var giant
var hud
var rng := RandomNumberGenerator.new()
var fails: Array = []
var notes: Array = []
var events: Array = []          # [what, game seconds]
var _seen := {}
var _t0 := 0
var _state := "pick"
var _target := -1
var _path: Array = []
var _state_t := 0.0
var _stuck_t := 0.0
var _stuck_total := 0.0
var _last_pos := Vector3.ZERO
var _last_progress_t := 0.0
var _last_fallen := 0
var _shop_t := 0.0
var _idle_t := 0.0
var _think_t := 0.0
var _reloads_done := 0
var _offer_seen_t := 0.0
var _offers_seen := 0
var _interstitials := 0
var _rewarded := 0
var _starter_handled := false
var _astar := AStarGrid2D.new()
var _bad_targets := {}
var _done := false
var _no_target_t := 0.0
var _no_controls_t := 0.0
var _burn_tries := 0
var _path_fails := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	for a in args:
		match a:
			"keen", "casual", "boosted", "chaos", "castle":
				profile = a
			"ads":
				with_ads = true
			"visual":
				visual = true
			"--child":
				child = true
			_:
				if a.begins_with("/"):
					vis_dir = a
	if not child:
		_run_parent.call_deferred()
		return
	_run.call_deferred()


# =====================================================================================
# The parent: runs the bot in a child process and reads everything it prints
# =====================================================================================
func _run_parent() -> void:
	var t0 := Time.get_ticks_msec()
	var cmd := ["--headless", "--fixed-fps", "20", "--path", ProjectSettings.globalize_path("res://"),
		"-s", "res://tests/playthrough.gd", "--", profile]
	if visual:
		cmd[0] = "--rendering-driver"
		cmd.insert(1, "opengl3")
		cmd.append("visual")
		cmd.append(vis_dir)
	if with_ads:
		cmd.append("ads")
	cmd.append("--child")
	var out := []
	if OS.get_environment("CITY_SAVE") == "":
		OS.set_environment("CITY_SAVE", "bot_" + profile + ("_ads" if with_ads else "") + ("_vis" if visual else ""))
	var code := OS.execute(OS.get_executable_path(), cmd, out, true)
	var text: String = out[0] if out.size() > 0 else ""
	print(text)
	var errors: Array = []
	for line in text.split("\n"):
		var l := line.strip_edges()
		if not (l.begins_with("ERROR") or l.contains("SCRIPT ERROR") or l.begins_with("USER ERROR")):
			continue
		var benign := false
		for b in BENIGN:
			if l.contains(b):
				benign = true
		if not benign:
			errors.append(l)
	if not errors.is_empty():
		print("PLAYTHROUGH FAIL: %d error line(s) were printed:" % errors.size())
		for e in errors.slice(0, 12):
			print("    " + e)
	var ok: bool = code == 0 and errors.is_empty()
	print("PLAYTHROUGH (%s%s) %s, %.1f s real time" % [profile, " + ads" if with_ads else "", "PASSED" if ok else "FAILED",
		(Time.get_ticks_msec() - t0) / 1000.0])
	quit(0 if ok else 1)


# =====================================================================================
# The child: plays
# =====================================================================================
func fail(what: String) -> void:
	if not fails.has(what):
		fails.append(what)
		print("  FAIL  %s  (at %s)" % [what, _clock()])


func note(what: String) -> void:
	notes.append(what)
	print("  ..    %s  (at %s)" % [what, _clock()])


func event(what: String) -> void:
	if _seen.has(what):
		return
	_seen[what] = true
	events.append([what, gs.play_time])
	print("  >>    %-34s %s" % [what, _clock()])


func _clock() -> String:
	return Fmt.duration(gs.play_time) if gs != null else "?"


func _frames(n: int) -> void:
	for _i in n:
		await process_frame


func _spawn_world() -> void:
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await _frames(3)
	city = world.city
	giant = world.giant
	hud = world.hud
	world._rng.seed = 4242 + _reloads_done
	hud.set_touch_mode(false)
	hud.show_desktop_hint = false


func _run() -> void:
	_t0 = Time.get_ticks_msec()
	gs = root.get_node("GameState")
	mon = root.get_node("Monetization")
	seed(1234)
	rng.seed = 99 if profile != "casual" else 7
	gs.wipe_save(false)
	gs.dev_income = 10.0 if profile == "boosted" else 1.0
	if visual:
		DirAccess.make_dir_recursive_absolute(vis_dir)
		RenderingServer.render_loop_enabled = false
	await _spawn_world()
	print("PLAYTHROUGH %s%s: %d structures, keep at the middle" % [profile, " + ads" if with_ads else "", city.count])
	if profile == "castle":
		# Debugging the endgame: everything else has burned, rockets in hand.
		world.skip_to_district(3)
		gs.dev_gates_open = true
		_reloads_done = 9
		await _frames(2)
	if profile == "chaos":
		await _chaos()
		await _finish_chaos()
		return
	var cap := 5400.0 if profile != "casual" else 9000.0
	while not _done:
		await process_frame
		if gs.play_time > cap:
			fail("the ending wasn't reached in %s of play" % Fmt.duration(cap))
			break
		if Time.get_ticks_msec() - _t0 > 1500000:
			fail("the run took more than 25 minutes of real time")
			break
		_watch()
		if _done:
			break
		await _handle_popups()
		if hud.is_blocking() or not giant.input_enabled:
			world.force_fire = false
			world.bot_move = Vector2.ZERO
			if not hud.is_blocking() and not mon.is_showing_ad():
				_no_controls_t += 1.0 / FPS
				if _no_controls_t > 15.0:
					fail("the giant's controls stayed off with nothing on screen (a softlock)")
					_no_controls_t = 0.0
			continue
		_no_controls_t = 0.0
		await _maybe_reload()
		_think_t -= 1.0 / FPS
		_drive()
		if visual:
			await _maybe_snap()
	await _after_ending()
	if visual:
		await _maybe_snap(true)
	_report()


# --- What's going on -----------------------------------------------------------------
var _status_t := 0.0


func _watch() -> void:
	_status_t += 1.0 / FPS
	if _status_t > 45.0:
		_status_t = 0.0
		print("  ..    status: %s %.1fs, target %d, %s, %d%% down, %s coins, blocking %s, shopping %s, controls %s, watching ad %s  (at %s)" % [_state, _state_t, _target,
			str(gs.tool_def().name).to_lower(), int(city.progress() * 100.0), Fmt.num(gs.coins), hud.is_blocking(), _shopping,
			giant.input_enabled, mon.is_watching(), _clock()])
	var p: Vector3 = giant.global_position
	var lim: float = 40.5
	if absf(p.x) > lim or absf(p.z) > lim or p.y < -0.01 or not p.is_finite():
		fail("the giant left the warehouse (%s)" % p)
	if city.fallen > _last_fallen:
		_last_fallen = city.fallen
		_last_progress_t = gs.play_time
	if gs.play_time - _last_progress_t > 60.0 and _verbose_t <= -100.0:
		_verbose_t = 12.0
	if gs.play_time - _last_progress_t > 180.0:
		fail("progress stalled for 3 minutes (%d%% down, %s in hand, %s coins)" % [int(city.progress() * 100.0),
			gs.tool_def().name, Fmt.num(gs.coins)])
		_last_progress_t = gs.play_time
	for z in 4:
		var zp: float = city.zone_progress(z)
		if zp >= 0.9:
			event("%s 90%% down" % str(Balance.ZONES[z].short).to_lower())
	for i in range(1, Balance.TOOLS.size()):
		if gs.tool_gate_open(i):
			event("%s on sale" % str(Balance.TOOLS[i].name).to_lower())
	if gs.has_won:
		event("the keep falls")
		_done = true


func _handle_popups() -> void:
	# Fake ads: wait out the countdown, then press "Close ad" like a player.
	var layer = mon.provider.get("_layer")
	if layer != null and is_instance_valid(layer):
		for b in _buttons(layer):
			if not b.disabled and b.text == "Close ad":
				b.pressed.emit()
				return
		return
	# The starter pack: once, after ten minutes. Players who don't pay say "not now".
	if not hud._last_popup.is_empty() and hud._last_popup.has("nope") and is_instance_valid(hud._last_popup.root) \
			and hud._last_popup.root.is_inside_tree():
		if not _starter_handled:
			_starter_handled = true
			event("starter pack offered")
			await _frames(int(FPS * 2.0))
			var box = hud._last_popup.box
			if box.open < 0.95:
				fail("the matchbox drawer didn't slide open")
			hud._last_popup.nope.pressed.emit()
			await _frames(2)
			if hud.is_blocking() or not giant.input_enabled:
				fail("\"not now\" on the starter pack didn't hand the game back")
		return
	# The timed offer tag: let it go by (or take it, with ads on).
	if hud.offers.current != "" and hud.offer_tag.visible:
		if _offer_seen_t <= 0.0:
			_offers_seen += 1
			var line: String = load("res://scripts/ad_offers.gd").headline(hud.offers.current)
			if line == "" or not line.begins_with("Free"):
				fail("an offer tag had no headline (%s)" % hud.offers.current)
		_offer_seen_t += 1.0 / FPS
		if with_ads and not mon.is_watching():
			hud.take_offer()
			_rewarded += 1
		elif _offer_seen_t > Balance.OFFER_LIFETIME + 8.0:
			fail("an offer tag outstayed its %d seconds" % int(Balance.OFFER_LIFETIME))
	else:
		_offer_seen_t = 0.0
	if with_ads and hud.find_tag.visible and not mon.is_watching():
		hud.take_find()
		_rewarded += 1


func _buttons(n: Node) -> Array:
	var out: Array = []
	if n is Button:
		out.append(n)
	for c in n.get_children():
		out += _buttons(c)
	return out


# --- Saving and loading mid-run ------------------------------------------------------
func _maybe_reload() -> void:
	var marks := [0.12, 0.35, 0.62, 0.85]
	if _reloads_done >= marks.size() or city.progress() < float(marks[_reloads_done]):
		return
	world.force_fire = false
	world.bot_move = Vector2.ZERO
	var snap := _snapshot()
	gs.save_game()
	world.queue_free()
	await _frames(2)
	_reloads_done += 1
	gs.reset_state()
	gs.dev_income = 10.0 if profile == "boosted" else 1.0
	gs.load_game()
	await _spawn_world()
	var now := _snapshot()
	var bad: Array = []
	for k in snap:
		var a = snap[k]
		var b = now[k]
		var same: bool = (absf(float(a) - float(b)) < 0.01 * maxf(1.0, absf(float(a)))) if (a is float or a is int) else str(a) == str(b)
		if not same:
			bad.append(k)
	if bad.is_empty():
		note("saved and reloaded at %d%% down: everything came back" % int(city.progress() * 100.0))
	else:
		fail("save/reload at %d%% down lost: %s" % [int(city.progress() * 100.0), ", ".join(bad)])
	_state = "pick"
	_path.clear()


func _snapshot() -> Dictionary:
	return {
		"coins": gs.coins, "tool": gs.tool_index, "upgrades": JSON.stringify(gs.upgrade_levels),
		"helpers": JSON.stringify(gs.helper_counts), "finds": JSON.stringify(gs.finds), "city": city.to_save_string(),
		"fallen": city.fallen, "play_time": gs.play_time, "giant_x": giant.position.x, "giant_z": giant.position.z,
		"collapses": gs.collapses, "best_chain": gs.best_chain, "clock": gs.clock, "water": city.water_string(),
	}


# --- Playing -------------------------------------------------------------------------
var _verbose_t := -200.0
var _last_state := ""


func _drive() -> void:
	if _verbose_t > 0.0:
		_verbose_t -= 1.0 / FPS
		if _state != _last_state:
			print("        state %s -> %s (t %.2f, target %d %s, giant %s, path %d)" % [_last_state, _state, _state_t, _target,
				str(city.s_state[_target]) if _target >= 0 else "-", str(giant.position), _path.size()])
	_last_state = _state
	_state_t += 1.0 / FPS
	_shop_t -= 1.0 / FPS
	if _shop_t <= 0.0:
		_shop_t = 6.0 if profile != "casual" else rng.randf_range(40.0, 80.0)
		if _shop_wanted():
			world.force_fire = false
			world.bot_move = Vector2.ZERO
			_go_shopping.call_deferred()
			return
	match _state:
		"pick":
			world.force_fire = false
			world.bot_move = Vector2.ZERO
			if _think_t > 0.0:
				return
			_think_t = 0.5
			if profile == "casual" and _idle_t <= 0.0 and rng.randf() < 0.06:
				_idle_t = rng.randf_range(6.0, 16.0)
				_state = "idle"
				_state_t = 0.0
				return
			_target = _choose_target()
			if _target < 0:
				_no_target_t += 0.5
				if _no_target_t > 20.0:
					_no_target_t = 0.0
					note("nothing to light with the %s (%d standing, %s coins)" % [str(gs.tool_def().name).to_lower(),
						city.count - city.fallen - city.burning.size(), Fmt.num(gs.coins)])
				return
			_no_target_t = 0.0
			var here2 := Vector2(giant.position.x, giant.position.z)
			var spots := _stand_spots(_target)
			var spot: Vector3 = spots[0] if not spots.is_empty() else giant.position
			_path = []
			_rebuild_nav()
			for sp in spots:
				spot = sp
				if here2.distance_to(Vector2(sp.x, sp.z)) < 0.6:
					break
				_path = _path_to(here2, Vector2(sp.x, sp.z))
				if not _path.is_empty():
					break
			if _path.is_empty() and here2.distance_to(Vector2(spot.x, spot.z)) > 0.6:
				_bad_targets[_target] = gs.play_time
				_path_fails += 1
				if _path_fails % 10 == 1:
					note("no way to a %s from %s to %s (blocked there: %s, here: %s)" % [str(Balance.KINDS[city.s_kind[_target]].name).to_lower(),
						str(giant.position), str(spot), giant.is_blocked(Vector2(spot.x, spot.z), 0.0), giant.is_blocked(Vector2(giant.position.x, giant.position.z), 0.0)])
				return
			_state = "walk"
			_state_t = 0.0
			_stuck_t = 0.0
			_last_pos = giant.position
		"walk":
			_walk()
		"aim":
			_aim_and_burn()
		"watch":
			world.force_fire = false
			world.bot_move = Vector2.ZERO
			var wait := 1.4 if profile != "casual" else 8.0
			if _state_t > wait or not city.burning.has(_target):
				_state = "pick"
		"idle":
			world.force_fire = false
			world.bot_move = Vector2.ZERO
			giant.add_look(Vector2(0.01, 0.0))
			_idle_t -= 1.0 / FPS
			if _idle_t <= 0.0:
				_state = "pick"
				_idle_t = rng.randf_range(40.0, 120.0)


func _work_zone() -> int:
	## Where the bot burns: the district its tool is for (that's what opens the next
	## tool), or anything left that it can light.
	return mini(gs.tool_index, 3)


func _choose_target() -> int:
	var power: float = gs.tool_power()
	var here := Vector2(giant.position.x, giant.position.z)
	var zone := _work_zone()
	var best := -1
	var best_score := -INF
	var rockets: bool = gs.tool_index >= 3
	for s in city.count:
		if city.s_state[s] != CityGrid.STANDING:
			continue
		if _bad_targets.has(s) and gs.play_time - float(_bad_targets[s]) < 40.0:
			continue
		if not city.can_light(s, power):
			continue
		if rockets and city.s_kind[s] < Balance.WALL and city.s_kind[s] != Balance.SKY:
			continue
		var d := here.distance_to(city.s_center[s])
		var score := -d * (0.12 if profile != "casual" else 1.0)
		if city.s_zone[s] == zone:
			score += 30.0
		if city.s_kind[s] == Balance.TRUCK:
			score += 4.0   # put the fire trucks out of action first
		if profile != "casual":
			var nb: PackedInt32Array = city.s_nb[s]
			var ng: PackedByteArray = city.s_ngap[s]
			var cluster := 0
			var near_fire := false
			for i in nb.size():
				var t := nb[i]
				if ng[i] <= 1 and city.s_state[t] == CityGrid.STANDING:
					cluster += 1
				if city.s_state[t] == CityGrid.BURNING:
					near_fire = true
			score += cluster * 1.6 + city.s_height[s] * 0.6
			if near_fire:
				score -= 25.0   # it'll catch anyway: light somewhere new
		else:
			score += rng.randf_range(0.0, 6.0)
		if rockets and city.s_kind[s] == Balance.KEEP:
			score += 8.0
		if score > best_score:
			best_score = score
			best = s
	return best


func _stand_spots(s: int) -> Array:
	## Places to stand within reach of a target, best first: on the side nearest the
	## giant, clear of anything tall; with rockets, back outside the castle's moat.
	var c: Vector2 = city.s_center[s]
	var here := Vector2(giant.position.x, giant.position.z)
	var r: Rect2i = city.s_rect[s]
	var half := maxf(r.size.x, r.size.y) * Balance.CELL * 0.5
	var rockets: bool = gs.tool_index >= 3
	var reach: float = minf(gs.tool_range() * 0.75, half + (3.2 if not rockets else 9.0))
	var dir := (here - c).normalized() if here.distance_to(c) > 0.1 else Vector2(0, 1)
	var out: Array = []
	for k in 24:
		var a := (k / 2) * 0.27 * (1.0 if k % 2 == 0 else -1.0)
		var d := dir.rotated(a)
		for dd in [reach, reach - 1.0, reach + 1.5, reach - 2.0, reach + 3.0]:
			var q: Vector2 = c + d * maxf(dd, half + (5.0 if rockets else 0.8))
			if rockets and maxf(absf(q.x), absf(q.y)) < 9.4:
				continue   # inside the castle's walls: you can't get there
			if not giant.is_blocked(q, 0.0):
				out.append(Vector3(q.x, 0, q.y))
				break
		if out.size() >= 6:
			break
	return out


func _stand_spot(s: int) -> Vector3:
	var l := _stand_spots(s)
	return l[0] if not l.is_empty() else world.free_spot_near(Vector3(city.s_center[s].x, 0, city.s_center[s].y + 3.0))


# --- Walking -------------------------------------------------------------------------
const NAV := 0.5
var _nav_n := 0
var _nav_origin := Vector2.ZERO


func _passable(q: Vector2) -> bool:
	return not giant.is_blocked(q, 0.0)


func _rebuild_nav() -> void:
	## The floor as a grid: solid wherever the giant's legs would hit something too tall.
	var half: float = 39.0
	_nav_n = int(half * 2.0 / NAV)
	_nav_origin = Vector2(-half, -half)
	_astar.region = Rect2i(0, 0, _nav_n, _nav_n)
	_astar.cell_size = Vector2(NAV, NAV)
	_astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_astar.update()
	for y in _nav_n:
		for x in _nav_n:
			var q := _nav_origin + Vector2(x + 0.5, y + 0.5) * NAV
			if giant.is_blocked(q, 0.0):
				_astar.set_point_solid(Vector2i(x, y), true)


func _path_to(from: Vector2, to: Vector2) -> Array:
	var a := _to_nav(from)
	var b := _to_nav(to)
	_astar.set_point_solid(a, false)
	if _astar.is_point_solid(b):
		return []
	var ids := _astar.get_id_path(a, b)
	var out: Array = []
	for i in range(1, ids.size()):
		out.append(_nav_origin + (Vector2(ids[i]) + Vector2(0.5, 0.5)) * NAV)
	if not out.is_empty():
		out[out.size() - 1] = to
	return out


func _find_path(from: Vector2, to: Vector2) -> Array:
	_rebuild_nav()
	return _path_to(from, to)


func _to_nav(p: Vector2) -> Vector2i:
	var v := ((p - _nav_origin) / NAV).floor()
	return Vector2i(clampi(int(v.x), 0, _nav_n - 1), clampi(int(v.y), 0, _nav_n - 1))


func _walk() -> void:
	world.force_fire = false
	var here := Vector2(giant.position.x, giant.position.z)
	while not _path.is_empty() and here.distance_to(_path[0]) < 0.4:
		_path.pop_front()
	if _path.is_empty():
		world.bot_move = Vector2.ZERO
		_state = "aim"
		_state_t = 0.0
		return
	var to: Vector2 = _path[0]
	var d := to - here
	# Turn toward where it's going (like a thumb on the look side), then push forward.
	var want_yaw := atan2(-d.x, -d.y)
	var yaw: float = lerp_angle(giant.yaw, want_yaw, 0.35)
	giant.set_view(yaw, -0.35)
	var ahead := absf(angle_difference(giant.yaw, want_yaw)) < 0.9
	world.bot_move = Vector2(0, 1.0 if ahead else 0.25)
	if giant.position.distance_to(_last_pos) > 0.15:
		_last_pos = giant.position
		_stuck_t = 0.0
	else:
		_stuck_t += 1.0 / FPS
		if _stuck_t > 1.5:
			giant.jump()
		if _stuck_t > 4.0:
			_stuck_total += _stuck_t
			_stuck_t = 0.0
			_bad_targets[_target] = gs.play_time
			_state = "pick"
			note("got blocked walking to a %s; picked something else" % str(Balance.KINDS[city.s_kind[_target]].name).to_lower())
			if _stuck_total > 40.0:
				fail("the giant keeps getting stuck in the city's geometry")
	if _state_t > 40.0:
		_state = "pick"
		_bad_targets[_target] = gs.play_time


func _aim_and_burn() -> void:
	world.bot_move = Vector2.ZERO
	var s := _target
	if s < 0 or city.s_state[s] != CityGrid.STANDING:
		world.force_fire = false
		_state = "watch" if s >= 0 and city.s_state[s] == CityGrid.BURNING else "pick"
		_state_t = 0.0
		return
	var c: Vector2 = city.s_center[s]
	var h: float = city.s_height[s]
	var aim_y := clampf(h * 0.5, 0.1, 3.0)
	# A person turns to look, takes a moment to line the crosshair up, then presses.
	var y0: float = giant.yaw
	var p0: float = giant.pitch
	giant.aim_at(Vector3(c.x, aim_y, c.y))
	if gs.tool_index < 3 and (giant.aim.sid != s or not giant.aim.in_range):
		giant.aim_at(Vector3(c.x, h * 0.85, c.y))
	var settle := 0.6 if profile != "casual" else 1.3
	if _state_t < settle:
		var k := clampf(_state_t / settle, 0.0, 1.0)
		var yaw_t: float = giant.yaw
		var pitch_t: float = giant.pitch
		giant.set_view(lerp_angle(y0, yaw_t, 0.25 + 0.75 * k), lerpf(p0, pitch_t, 0.25 + 0.75 * k))
		world.force_fire = false
		return
	world.force_fire = true
	var limit := 9.0 if gs.tool_index < 3 else 14.0
	if _state_t > limit:
		world.force_fire = false
		_bad_targets[s] = gs.play_time
		_state = "pick"
		_burn_tries += 1
		if _burn_tries % 5 == 1:
			note("couldn't light a %s (aim on %d, in range %s, heat %.0f of %.0f, %s)" % [str(Balance.KINDS[city.s_kind[s]].name).to_lower(),
				giant.aim.sid, giant.aim.in_range, city.s_heat[s], city.threshold(s), str(giant.global_position)])


# --- Shopping (through the box's own buttons) ------------------------------------------
var _shopping := false


func _shop_wanted() -> bool:
	var nt: int = gs.next_tool_index()
	if nt >= 0 and gs.tool_gate_open(nt) and gs.coins >= gs.tool_cost(nt):
		return true
	var reserve := 0.0
	if nt >= 0 and gs.tool_gate_open(nt):
		reserve = gs.tool_cost(nt) * (0.6 if profile != "casual" else 0.3)
	var spare: float = gs.coins - reserve
	for u in Balance.UPGRADES:
		if not gs.upgrade_maxed(u.key) and gs.upgrade_cost(u.key) < spare * 0.5:
			return true
	for i in Balance.HELPERS.size():
		if gs.tool_index >= i + 1 and gs.helper_cost(i) < spare * 0.5:
			return true
	return false


func _go_shopping() -> void:
	if _shopping or hud.is_blocking():
		return
	_shopping = true
	var nt: int = gs.next_tool_index()
	if nt >= 0 and gs.tool_gate_open(nt) and gs.coins >= gs.tool_cost(nt):
		if await _press_in_shop("tools", "Next: the %s" % str(Balance.TOOLS[nt].name).to_lower()):
			event("%s bought" % str(Balance.TOOLS[nt].name).to_lower())
		else:
			fail("couldn't buy the %s from the box with the coins for it" % str(Balance.TOOLS[nt].name).to_lower())
	var reserve := 0.0
	nt = gs.next_tool_index()
	if nt >= 0 and gs.tool_gate_open(nt):
		reserve = gs.tool_cost(nt) * (0.6 if profile != "casual" else 0.3)
	var order: Array = Balance.UPGRADES.duplicate()
	if profile == "casual":
		order.shuffle()
	for u in order:
		var lv := int(gs.upgrade_levels[u.key])
		if not gs.upgrade_maxed(u.key) and gs.upgrade_cost(u.key) < (gs.coins - reserve) * 0.5:
			if await _press_in_shop("upgrades", str(u.name)):
				if lv == 0:
					event("%s, first level" % str(u.name).to_lower())
	for i in Balance.HELPERS.size():
		if gs.tool_index >= i + 1 and gs.helper_cost(i) < (gs.coins - reserve) * 0.5:
			var n := int(gs.helper_counts[i])
			if await _press_in_shop("helpers", str(Balance.HELPERS[i].name)) and n == 0:
				event("first %s" % str(Balance.HELPERS[i].name).to_lower())
	if hud.shop != null:
		_close_shop()
	_shopping = false


func _press_in_shop(tab: String, title: String) -> bool:
	# Shopping runs alongside the main loop, which may shut the box meanwhile (the ending,
	# the money-flow checks): give up quietly if it's gone.
	if hud.shop == null:
		hud.open_shop(tab)
		await _frames(3)
		if hud.shop == null:
			return false
	if hud.shop.tab != tab:
		hud.shop.select(tab)
		await _frames(2)
		if hud.shop == null:
			return false
	hud.shop.refresh()
	for card in hud.shop._list.get_children():
		var labels := _labels(card)
		if labels.is_empty() or not (labels[0] as Label).text.begins_with(title):
			continue
		for b in _buttons(card):
			if b.visible and not b.disabled:
				var before: float = gs.coins
				b.pressed.emit()
				await _frames(1)
				return gs.coins < before
	return false


func _labels(n: Node) -> Array:
	var out: Array = []
	if n is Label:
		out.append(n)
	for c in n.get_children():
		out += _labels(c)
	return out


func _close_shop() -> void:
	for b in _buttons(hud.shop):
		if b.text == "Close":
			b.pressed.emit()
			return
	hud.close_shop()


# --- Visual run: a screenshot every few game-seconds at phone and tablet sizes ----------
func _maybe_snap(force: bool = false) -> void:
	_vis_t += 1.0 / FPS
	if _vis_t < VIS_EVERY and not force:
		return
	_vis_t = 0.0
	var sz: Vector2i = VIS_SIZES[_vis_n % VIS_SIZES.size()]
	get_root().get_window().size = sz
	hud.set_touch_mode(true)
	RenderingServer.render_loop_enabled = true
	await _frames(3)
	await RenderingServer.frame_post_draw
	var img := root.get_texture().get_image()
	img.save_png("%s/%03d_%dx%d_%s.png" % [vis_dir, _vis_n, sz.x, sz.y, Fmt.duration(gs.play_time).replace(" ", "")])
	RenderingServer.render_loop_enabled = false
	_vis_n += 1


# --- Chaos: random input, then make sure it still answers --------------------------------
func _chaos() -> void:
	var minutes := 6.0
	var keys := [KEY_E, KEY_TAB, KEY_B, KEY_G, KEY_M, KEY_SPACE, KEY_ESCAPE, KEY_F1, KEY_W, KEY_A, KEY_S, KEY_D]
	gs.dev_income = 50.0
	gs.dev_forced = true    # chaos presses the developer tools too, as in a playtest build
	var end: float = gs.play_time + minutes * 60.0
	var last_print := 0.0
	while gs.play_time < end:
		await process_frame
		await _handle_popups_chaos()
		var r := rng.randf()
		if r < 0.08:
			var ev := InputEventKey.new()
			ev.physical_keycode = keys[rng.randi() % keys.size()]
			ev.keycode = ev.physical_keycode
			ev.pressed = true
			root.push_input(ev)
			var up := ev.duplicate()
			up.pressed = false
			root.push_input(up)
		elif r < 0.2:
			var t := InputEventScreenTouch.new()
			t.index = rng.randi() % 4
			t.position = Vector2(rng.randf() * 1280.0, rng.randf() * 720.0)
			t.pressed = rng.randf() < 0.6
			root.push_input(t)
		elif r < 0.3:
			var dr := InputEventScreenDrag.new()
			dr.index = rng.randi() % 4
			dr.position = Vector2(rng.randf() * 1280.0, rng.randf() * 720.0)
			dr.relative = Vector2(rng.randf_range(-40, 40), rng.randf_range(-40, 40))
			root.push_input(dr)
		elif r < 0.34:
			# Press a random button somewhere on screen (shop cards, tabs, tags, close).
			var bs := _buttons(hud.root).filter(func(b): return b.is_visible_in_tree() and not b.disabled)
			if not bs.is_empty():
				var b: Button = bs[rng.randi() % bs.size()]
				if b.text != "Reset":
					b.pressed.emit()
		elif r < 0.36:
			if hud.shop == null:
				hud.open_shop(["tools", "upgrades", "helpers", "extras", "finds", "settings", "dev"][rng.randi() % 7])
			else:
				hud.close_shop()
		elif r < 0.37:
			for n in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_APPLICATION_PAUSED]:
				gs.propagate_notification(n)
				hud.touch.propagate_notification(n)
			await _frames(rng.randi_range(1, 20))
			for n in [NOTIFICATION_APPLICATION_RESUMED, NOTIFICATION_APPLICATION_FOCUS_IN]:
				gs.propagate_notification(n)
		elif r < 0.375:
			get_root().get_window().size = VIS_SIZES[rng.randi() % VIS_SIZES.size()]
		elif r < 0.39:
			world.force_fire = rng.randf() < 0.5
			world.bot_move = Vector2(rng.randf_range(-1, 1), rng.randf_range(-1, 1))
		elif r < 0.395:
			hud.watch_ad(["boost", "instant", "helper_rush"][rng.randi() % 3])
		elif r < 0.397:
			hud.show_find("ticket", true, 100.0)
		elif r < 0.398 and Engine.time_scale == 1.0:
			hud.show_starter_offer()
		if gs.play_time - last_print > 60.0:
			last_print = gs.play_time
			note("chaos: %s in, %d%% down, %s, %d popups" % [Fmt.duration(gs.play_time), int(city.progress() * 100.0),
				"box open" if hud.shop != null else "box shut", hud.popups.get_child_count()])
		_watch_chaos()


func _watch_chaos() -> void:
	var p: Vector3 = giant.global_position
	if absf(p.x) > 40.5 or absf(p.z) > 40.5 or not p.is_finite():
		fail("chaos: the giant left the warehouse (%s)" % p)
	if Engine.time_scale != 1.0:
		Engine.time_scale = 1.0   # the dev menu's time scale isn't part of the test


func _handle_popups_chaos() -> void:
	var layer = mon.provider.get("_layer")
	if layer != null and is_instance_valid(layer) and rng.randf() < 0.05:
		for b in _buttons(layer):
			if not b.disabled and rng.randf() < 0.7:
				b.pressed.emit()
				return


func _finish_chaos() -> void:
	# Close everything a player could close, then check it all still answers.
	world.force_fire = false
	world.bot_move = Vector2.ZERO
	for _i in int(FPS * 6.0):
		await process_frame
		var layer = mon.provider.get("_layer")
		if layer != null and is_instance_valid(layer):
			for b in _buttons(layer):
				if not b.disabled:
					b.pressed.emit()
	if hud.shop != null:
		_close_shop()
	await _frames(2)
	for c in hud.popups.get_children():
		for b in _buttons(c):
			if b.text in ["not now", "Walk around the ashes"]:
				b.pressed.emit()
				break
	await _frames(3)
	if hud.popups.get_child_count() > 0:
		fail("chaos: a popup was left that no button closes")
	if mon.is_showing_ad():
		fail("chaos: an ad screen was left stuck open")
	if hud.is_blocking() or not giant.input_enabled:
		fail("chaos: the giant didn't get its controls back")
	var before: Vector3 = giant.position
	world.bot_move = Vector2(0, 1)
	await _frames(int(FPS))
	world.bot_move = Vector2.ZERO
	if giant.position.distance_to(before) < 0.3:
		giant.set_view(giant.yaw + PI, -0.3)
		world.bot_move = Vector2(0, 1)
		await _frames(int(FPS))
		world.bot_move = Vector2.ZERO
		if giant.position.distance_to(before) < 0.3:
			fail("chaos: the giant can't walk any more")
	hud.set_touch_mode(true)
	await _frames(1)
	if not hud.touch.visible:
		fail("chaos: the phone controls didn't come back")
	gs.save_game()
	print("")
	print("CHAOS: %s of random input, %d%% of the city down, stub counts %s" % [Fmt.duration(gs.play_time), int(city.progress() * 100.0),
		str(mon.provider.get("counts"))])
	print("PLAYTHROUGH RESULT: %s" % ("ok" if fails.is_empty() else "%d problem(s)" % fails.size()))
	for f in fails:
		print("    - " + f)
	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	quit(0 if fails.is_empty() else 1)


# --- After the ending ----------------------------------------------------------------
func _after_ending() -> void:
	world.force_fire = false
	world.bot_move = Vector2.ZERO
	if not gs.has_won:
		return
	# The camera cranes over the ashes first; the note is pinned up after a few seconds.
	for _i in int(FPS * 12.0):
		await process_frame
		if not hud._last_popup.is_empty() and hud._last_popup.has("note") and (hud._last_popup.note as Control).modulate.a > 0.95:
			break
	if not giant.cinematic or giant.hand_visible:
		fail("the ending kept the hand up or didn't move the camera")
	if city.standing_count() > 0:
		fail("%d buildings still standing at the ending" % city.standing_count())
	var p: Dictionary = hud._last_popup
	if p.is_empty() or not p.has("button"):
		fail("the ending's delivery note didn't appear")
	else:
		if p.note.modulate.a < 0.9:
			fail("the delivery note never faded in")
		if hud.coin_tag.is_visible_in_tree() or hud.shop_button.is_visible_in_tree():
			fail("the HUD was still up over the ending")
		p.button.pressed.emit()
		await _frames(2)
		if hud.is_blocking() or not giant.input_enabled:
			fail("\"Walk around the ashes\" didn't hand the game back")
	# Every rewarded ad and purchase, from where it appears, through the stub.
	await _check_money_flows()


func _wait_ad() -> void:
	for _i in int(FPS * 8.0):
		await process_frame
		var layer = mon.provider.get("_layer")
		if layer != null and is_instance_valid(layer):
			for b in _buttons(layer):
				if not b.disabled and b.text == "Close ad":
					b.pressed.emit()
					await _frames(2)
					return
	fail("a fake ad never offered its close button")


func _check_money_flows() -> void:
	gs.instant_ready_at = 0.0
	gs.boost_until = 0.0
	if not gs.has_helpers():
		gs.helper_counts[0] = 1
	# Rewarded: the three in the box's Extras tab.
	for pair in [["2x fire for 5 minutes", "boost"], ["Helpers 3x for 3 minutes", "rush"], ["Free coins", "instant"]]:
		var coins_before: float = gs.coins
		hud.open_shop("extras")
		await _frames(3)
		var pressed := false
		for card in hud.shop._list.get_children():
			var labels := _labels(card)
			if labels.size() > 0 and (labels[0] as Label).text.begins_with(pair[0]):
				for b in _buttons(card):
					if b.visible and not b.disabled:
						b.pressed.emit()
						pressed = true
						break
		if not pressed:
			fail("couldn't start the \"%s\" ad from the box" % pair[0])
			_close_shop()
			continue
		await _wait_ad()
		match pair[1]:
			"boost":
				if not gs.is_boost_active():
					fail("the 2x fire ad didn't start the boost")
			"rush":
				if not gs.is_helper_rush_active():
					fail("the helper rush ad didn't start the rush")
			"instant":
				if gs.coins <= coins_before:
					fail("the free coins ad paid nothing")
		if hud.shop != null:
			_close_shop()
		await _frames(2)
	# Double a golden ticket.
	hud.show_find("ticket", true, 500.0)
	await _frames(2)
	var c0: float = gs.coins
	hud.take_find()
	await _wait_ad()
	if gs.coins < c0 + 499.0:
		fail("doubling a golden ticket paid nothing")
	# The interstitial after closing the box (not with Remove Ads, never in the first minutes).
	mon._last_interstitial = 0.0
	var real_play: float = gs.play_time
	if real_play < Balance.INTERSTITIAL_FIRST_AFTER:
		if mon.maybe_show_interstitial(mon.PLACEMENT_INTERSTITIAL):
			fail("an interstitial showed in the first five minutes")
			await _wait_ad()
		gs.play_time = Balance.INTERSTITIAL_FIRST_AFTER + 60.0
	var shown: bool = mon.maybe_show_interstitial(mon.PLACEMENT_INTERSTITIAL)
	if not shown:
		fail("the interstitial didn't show at a natural break")
	else:
		await _wait_ad()
	gs.play_time = real_play
	# Purchases: everything in the Extras tab.
	for title in ["A sock of coins", "A jar of coins", "A shoebox of coins", "No ads, and 2x for good", "The golden lens", "A box of matches"]:
		var before: float = gs.coins
		hud.open_shop("extras")
		await _frames(3)
		var ok := false
		for card in hud.shop._list.get_children():
			var labels := _labels(card)
			if labels.size() > 0 and (labels[0] as Label).text.begins_with(title):
				for b in _buttons(card):
					if b.visible and not b.disabled:
						b.pressed.emit()
						ok = true
						break
		if hud.shop != null:
			_close_shop()
		for _i in int(FPS * 1.5):
			await process_frame
		if not ok:
			if not (title == "A box of matches" and gs.owns_starter):
				fail("couldn't buy \"%s\" (stub)" % title)
			continue
		if title.ends_with("coins") and gs.coins <= before:
			fail("\"%s\" paid no coins" % title)
	if not gs.owns_remove_ads_2x or not gs.owns_golden or not gs.owns_starter:
		fail("a purchase didn't stick (remove ads %s, golden %s, starter %s)" % [gs.owns_remove_ads_2x, gs.owns_golden, gs.owns_starter])
	if mon.maybe_show_interstitial(mon.PLACEMENT_INTERSTITIAL):
		fail("an interstitial showed after Remove Ads")
		await _wait_ad()
	mon.restore()
	note("rewarded ads, the interstitial and every purchase worked (stub)")


# --- The report ----------------------------------------------------------------------
func _report() -> void:
	if not gs.has_won:
		fail("the keep never fell")
	for i in Balance.TOOLS.size():
		if gs.tool_index < i:
			fail("the %s was never bought" % str(Balance.TOOLS[i].name).to_lower())
	for u in Balance.UPGRADES:
		if int(gs.upgrade_levels[u.key]) == 0 and not _seen.has("%s, first level" % str(u.name).to_lower()):
			fail("%s was never affordable along the way" % str(u.name).to_lower())
	for i in Balance.HELPERS.size():
		if not _seen.has("first %s" % str(Balance.HELPERS[i].name).to_lower()):
			fail("no %s was ever bought" % str(Balance.HELPERS[i].name).to_lower())
	var all_finds: Array = Balance.FINDS.map(func(f): return str(f.key))
	all_finds.append("ticket")
	for k in all_finds:
		if int(gs.finds.get(k, 0)) == 0:
			fail("never found: %s" % k)
	if _reloads_done < 3:
		fail("only %d mid-run save/reload checks happened" % _reloads_done)
	var real := (Time.get_ticks_msec() - _t0) / 1000.0
	print("")
	print("PACING (%s%s)" % [profile, " + ads" if with_ads else ""])
	print("  %-36s %s" % ["what", "game time"])
	for e in events:
		print("  %-36s %s" % [e[0], Fmt.duration(float(e[1]))])
	print("  ---")
	print("  buildings brought down %d of %d, longest chain %d, finds %d, citizens %d" % [city.fallen, city.count, gs.best_chain,
		_count(gs.finds), gs.citizens_saved])
	print("  offer tags seen %d, rewarded ads %d, stub counts %s" % [_offers_seen, _rewarded, str(mon.provider.get("counts"))])
	print("  upgrades %s, helpers %s, coins earned %s" % [JSON.stringify(gs.upgrade_levels), str(gs.helper_counts), Fmt.num(gs.lifetime_coins)])
	print("  real time %.1f s" % real)
	if fails.is_empty():
		print("PLAYTHROUGH RESULT: ok, the keep fell at %s" % Fmt.duration(_end_time()))
	else:
		print("PLAYTHROUGH RESULT: %d problem(s)" % fails.size())
		for f in fails:
			print("    - " + f)
	gs.wipe_save(false)
	world.queue_free()
	await _frames(2)
	root.get_node("Sound").stop_all()
	await _frames(2)
	quit(0 if fails.is_empty() else 1)


func _end_time() -> float:
	for e in events:
		if e[0] == "the keep falls":
			return float(e[1])
	return gs.play_time


func _count(d: Dictionary) -> int:
	var n := 0
	for k in d:
		n += int(d[k])
	return n
