extends SceneTree
## The playthrough bot (STUDIO.md, "Playtesting"): plays a fresh save to the
## core through the game's real systems, and fails loudly if anything's off.
##
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- keen
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- casual
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- boosted     (CI: dev income x10)
##   ... -- keen ads          keen, and takes every offer it's shown (pacing with ads)
##
## How it plays: walks in from the spawn, holds Dig while aiming down in a slow
## circle (so it digs a shaft and drops down it), hunts the buried finds the
## gauge marks, and when it can afford something rides the lift up, walks the
## path round to the shack, presses E, buys from the shop's own buttons, walks
## back to the cage and rides down. Keys go in as real input events; walking
## goes through World.bot_move (the same path as the keys and the stick).
##
## It fails (exit 1) if: the core isn't reached in time; progress stalls (no
## new depth, purchase or find for 4 game-minutes); a tool, upgrade, helper or
## find can't be had; the player leaves the world or is stuck in rock; a save
## and reload (at every new layer) doesn't bring back the same game; a stubbed
## ad or purchase doesn't pay out; or anything is printed as an error.
##
## The error check: run without "--child", this script starts itself again as
## a child process, prints its output and scans it for errors.
## A visual run adds "--shots DIR --every SECONDS" (run it with a renderer, under
## xvfb, with --child): a screenshot every so often and a contact sheet at the end.
## (Untyped where it touches autoloads: this compiles before they exist.)

const PROFILES := {
	"keen": {"dig_share": 1.0, "turn": 1.8, "shop_every": 75.0, "shop_secs": 5.0, "upgrade_cap": 0.35, "hunt": 1.0,
		"limit": 95.0 * 60.0, "income": 1.0, "pause_every": 0.0, "pause_secs": 0.0, "walk": 1.0},
	"casual": {"dig_share": 0.6, "turn": 1.3, "shop_every": 140.0, "shop_secs": 12.0, "upgrade_cap": 0.4, "hunt": 0.6,
		"limit": 170.0 * 60.0, "income": 1.0, "pause_every": 28.0, "pause_secs": 11.0, "walk": 0.75},
	"boosted": {"dig_share": 1.0, "turn": 1.8, "shop_every": 60.0, "shop_secs": 3.0, "upgrade_cap": 0.35, "hunt": 1.0,
		"limit": 45.0 * 60.0, "income": 10.0, "pause_every": 0.0, "pause_secs": 0.0, "walk": 1.0},
}
const COLUMN := Vector3(0.6, 0.0, 0.7)       # where it digs its shaft (finds are buried near the middle)
const STALL_SECONDS := 240.0
const ERROR_PATTERNS := ["SCRIPT ERROR", "ERROR:", "USER ERROR", "Parse Error", "Invalid call", "Invalid access"]
const IGNORE_PATTERNS := ["resources still in use at exit", "ObjectDB instances leaked", "ALSA lib", "Condition \"status < 0\""]

var profile := "keen"
var p: Dictionary
var take_ads := false
var gs
var mon
var world
var player
var field
var hud
var failures: Array = []
var pacing: Array = []          # [game seconds, what]
var state := "to_site"
var route: Array = []
var _yaw := 0.0
var _last_progress := 0.0
var _deepest_seen := 0.0
var _zone_done := 0
var _next_shop := 60.0
var _pause_until := -1.0
var _next_pause := 30.0
var _hunt := -1
var _hunt_start := 0.0
var _gave_up: Array = []
var _walk_check := Vector3.INF
var _walk_check_t := 0.0
var _walk_stuck := 0.0
var _stuck_count := 0
var _check_t := 0.0
var _shop_t := 0.0
var _shop_visits := 0
var _bonus_tested := false
var _shots_dir := ""
var _shot_every := 0.0
var _next_shot := 0.0
var _shots: Array = []
var _start_ms := 0
var _reloads := 0
var _ads_checked := {}
var _won_at := -1.0
var _next_status := 60.0
var _purchases_checked := false
var _capped := false
var _no_aim_t := 0.0
var _hunt_reported := -1


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if not args.has("--child"):
		_run_as_parent(args)
		return
	for a in args:
		if PROFILES.has(a):
			profile = a
	take_ads = args.has("ads") or profile == "boosted"
	var i := args.find("--shots")
	if i >= 0 and i + 1 < args.size():
		_shots_dir = args[i + 1]
		DirAccess.make_dir_recursive_absolute(_shots_dir)
	i = args.find("--every")
	if i >= 0 and i + 1 < args.size():
		_shot_every = float(args[i + 1])
	p = PROFILES[profile].duplicate()
	# A capped stretch of play (the visual run renders a few minutes at each size).
	i = args.find("--limit")
	if i >= 0 and i + 1 < args.size():
		p.limit = float(args[i + 1]) * 60.0
		_capped = true
	_play.call_deferred()


# =====================================================================================
# Parent: run the bot as a child process and check its output for errors
# =====================================================================================
func _run_as_parent(args: Array) -> void:
	var child_args := ["--headless", "--fixed-fps", "20", "--path", ProjectSettings.globalize_path("res://"),
		"-s", "res://tests/playthrough.gd", "--"]
	var shots := args.find("--shots")
	if shots >= 0:
		# The visual run: a real renderer (run the parent under xvfb), at the size asked for.
		var res := "1280x720"
		var ri := args.find("--size")
		if ri >= 0 and ri + 1 < args.size():
			res = str(args[ri + 1])
		child_args = ["--rendering-driver", "opengl3", "--resolution", res, "--fixed-fps", "10", "--path",
			ProjectSettings.globalize_path("res://"), "-s", "res://tests/playthrough.gd", "--"]
	child_args.append_array(args)
	child_args.append("--child")
	var out: Array = []
	var t0 := Time.get_ticks_msec()
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
	print("playthrough child exited %d after %.1f s real time" % [code, (Time.get_ticks_msec() - t0) / 1000.0])
	if not errors.is_empty():
		print("PLAYTHROUGH FAILED: %d error line(s) in the output:" % errors.size())
		for e in errors.slice(0, 20):
			print("  " + e)
		quit(1)
		return
	quit(code)


# =====================================================================================
# The run
# =====================================================================================
func fail(what: String) -> void:
	if not failures.has(what):
		failures.append(what)
		print("  FAIL  %s (at %s)" % [what, _clock(gs.clock if gs != null else 0.0)])


func note(what: String) -> void:
	pacing.append([gs.play_time, what])
	print("  %s  %s   (depth %d m, cash %s, real %ds)" % [_clock(gs.play_time), what, int(gs.deepest), Fmt.num(gs.money), (Time.get_ticks_msec() - _start_ms) / 1000])


func _play() -> void:
	_start_ms = Time.get_ticks_msec()
	gs = root.get_node("GameState")
	mon = root.get_node("Monetization")
	mon.provider.instant = true
	# A truly fresh game: wipe_save() keeps purchases (as a player's restart
	# should), so clear those too, or an earlier run's 2x would skew the pacing.
	gs.reset_state(false)
	gs.save_game()
	gs.income_mult = float(p.income)
	print("Playthrough: %s%s" % [profile, " (takes every ad)" if take_ads else ""])
	await _spawn_world()
	_route_to_site()
	_next_shop = float(p.shop_every)
	_next_pause = float(p.pause_every) if float(p.pause_every) > 0.0 else 1e9
	var limit: float = p.limit
	while gs.clock < limit:
		await process_frame
		_step()
		if failures.size() > 8:
			break
		if state == "done":
			break
		if state == "reload":
			await _reload_check()
			state = "dig"
		if state == "finish":
			await _finish()
			state = "done"
	if _won_at < 0.0 and not _capped:
		fail("didn't reach the core in %s of play (deepest %.0f m)" % [_clock(gs.play_time), gs.deepest])
	_report()
	if _shots_dir != "":
		_contact_sheet()
	world.queue_free()
	await process_frame
	gs.income_mult = 1.0
	gs.reset_state(false)
	gs.save_game()
	load("res://scripts/dig_field.gd").clear_caches()
	load("res://scripts/models.gd").clear_caches()
	await process_frame
	print("PLAYTHROUGH %s: %s" % [profile.to_upper(), "PASSED" if failures.is_empty() else "FAILED (%d)" % failures.size()])
	quit(0 if failures.is_empty() else 1)


func _spawn_world() -> void:
	world = load("res://scenes/world.tscn").instantiate()
	root.add_child(world)
	for _i in 4:
		await process_frame
	player = world.player
	field = world.field
	hud = world.hud
	_yaw = player.yaw
	if OS.get_cmdline_user_args().has("--touch"):
		hud.set_touch_mode(true)   # the visual run on phone sizes: the phone HUD


# =====================================================================================
# Every frame
# =====================================================================================
func _step() -> void:
	# State timers run on the game clock (play_time stops when the core is out).
	var t: float = gs.clock
	world.bot_move = Vector2.ZERO
	world.force_dig = false
	_watch_world(t)
	_run_pending()
	_handle_popups()
	_take_offers()
	if t >= _next_status:
		_next_status = t + 60.0
		var tg: Dictionary = player.target
		print("    [%s] %s at %s, deepest %.1f, hunt %d, aim %s %.1f m, on floor %s" % [_clock(t), state, player.position.snapped(Vector3.ONE * 0.1),
			gs.deepest, _hunt, tg.get("hit", false), float(tg.get("dist", 0.0)), player.on_floor])
	if _shots_dir != "" and t >= _next_shot:
		_next_shot = t + _shot_every
		_save_shot()
	if gs.has_won and _won_at < 0.0:
		_won_at = t
		note("THE CORE")
		state = "ending"
	match state:
		"to_site":
			if _follow():
				state = "dig"
		"dig":
			_dig(t)
		"to_lift_stop":
			if world.is_riding():
				state = "ride_up"
			elif _walk_to(gs.lift_stop, _stop_tol()) or world.near() == "lift_stop":
				if world.near() == "lift_stop":
					_key(KEY_E)
					state = "ride_up"
		"ride_up":
			if not world.is_riding() and player.position.y > -1.0:
				_route_to_shack()
				state = "to_shack"
		"to_shack":
			if _follow() or world.near() == "shop":
				if world.near() == "shop":
					_key(KEY_E)
					state = "shopping"
					_shop_t = t
		"shopping":
			if hud.shop == null:
				return
			if t - _shop_t > float(p.shop_secs):
				_buy_things()
				_shop_visits += 1
				_next_shop = t + float(p.shop_every)
				hud.shop.close_shop()
				state = "after_shop"
		"after_shop":
			if not hud.is_blocking():
				_route_to_cage()
				state = "to_cage"
		"to_cage":
			if _follow():
				if gs.lift_stop.is_finite() and -gs.lift_stop.y >= Balance.LIFT_MIN_DEPTH:
					if world.near() == "lift_top":
						_key(KEY_E)
						state = "ride_down"
					else:
						_walk_to(world.surface.LIFT_POS, 0.3)
				else:
					_route_to_site()
					state = "to_site"
		"ride_down":
			if not world.is_riding() and player.position.y < -1.0:
				state = "dig"
		"ending":
			if hud.popups.get_child_count() == 0 and t - _won_at > 4.0:
				state = "finish"


func _stop_tol() -> float:
	## How close to walk to the lift stop: close enough to drop down to it
	## when it has fallen into a pit below you.
	return 0.9 if absf(gs.lift_stop.y - player.position.y) < 1.5 else 0.12


func _boxed_in() -> bool:
	## Stuck means the body can't move at all: not up, not any way sideways.
	## (Resting against a steep pit wall overlaps the probe but isn't stuck.)
	var xf: Transform3D = player.global_transform
	for m in [Vector3(0, 0.3, 0), Vector3(0.25, 0.05, 0), Vector3(-0.25, 0.05, 0), Vector3(0, 0.05, 0.25), Vector3(0, 0.05, -0.25)]:
		if not player.test_move(xf, m):
			return false
	return true


func _diag() -> String:
	## What's under and around the player, for a stall or stuck report.
	var pp: Vector3 = player.position
	var down: Dictionary = field.raycast(player.eye_pos(), Vector3.DOWN, 30.0)
	var q := PhysicsRayQueryParameters3D.create(pp + Vector3(0, 0.5, 0), pp + Vector3(0, -2.0, 0))
	q.exclude = [player.get_rid()]
	var hit: Dictionary = player.get_world_3d().direct_space_state.intersect_ray(q)
	var under := "nothing"
	if not hit.is_empty():
		under = "%s at %.2f" % [str(hit.collider.get_path()) if hit.collider != null else "?", float(hit.position.y)]
	var loaded: Array = []
	for z in field.nzones:
		if field.is_loaded(z):
			loaded.append(z)
	return "[pos %s floor %s, lift stop %s, lift spot %s, field ray down %s %.1f m, physics under: %s, zones loaded %s, density below %.2f]" % [
		pp.snapped(Vector3.ONE * 0.01), player.on_floor, gs.lift_stop.snapped(Vector3.ONE * 0.01) if gs.lift_stop.is_finite() else "none",
		gs.lift_spot.snapped(Vector3.ONE * 0.01) if gs.lift_spot.is_finite() else "none", down.get("hit", false), float(down.get("dist", 0.0)),
		under, loaded, field.density_at(pp + Vector3(0, -0.2, 0))]


func _watch_world(t: float) -> void:
	# Progress: depth records, purchases and finds all count.
	if gs.deepest > _deepest_seen + 0.5:
		_deepest_seen = gs.deepest
		_last_progress = t
	if t - _last_progress > STALL_SECONDS and _won_at < 0.0:
		fail("progress stalled for %d s (state %s, depth %.1f m, tool %s) %s" % [int(t - _last_progress), state, gs.deepest, gs.tool_def().name, _diag()])
		_last_progress = t
	var z: int = int(floor(gs.deepest / Balance.ZONE_DEPTH))
	while _zone_done < mini(z, Balance.zone_count()):
		note("finished %s" % Balance.ZONES[_zone_done].name)
		_zone_done += 1
		if state == "dig" and _zone_done < Balance.zone_count():
			state = "reload"
	# Out of the world, or stuck in rock (checked twice a second).
	_check_t += 0.05
	if _check_t >= 0.5:
		_check_t = 0.0
		var pp: Vector3 = player.position
		if absf(pp.x) > 39.0 or absf(pp.z) > 39.0 or pp.y > 30.0 or pp.y < field.bottom_y - 1.5:
			fail("the player left the world at %s" % pp)
		if not world.is_riding() and player.collides(pp + Vector3(0, 0.08, 0)) and _boxed_in():
			_stuck_count += 1
			if _stuck_count >= 6:
				var dens := []
				for h in [0.25, 0.85, 1.45]:
					dens.append("%.2f" % field.density_at(pp + Vector3(0, h + 0.08, 0)))
				fail("the player is stuck in the rock at %s (densities %s, state %s, on floor %s)" % [pp, ", ".join(dens), state, player.on_floor])
				_stuck_count = 0
		else:
			_stuck_count = 0


# =====================================================================================
# Digging
# =====================================================================================
func _dig(t: float) -> void:
	if _want_shop(t):
		state = "to_lift_stop"
		return
	# A casual player stops to look around now and then.
	if t >= _next_pause:
		_pause_until = t + float(p.pause_secs) * randf_range(0.6, 1.4)
		_next_pause = t + float(p.pause_every) * randf_range(0.7, 1.3)
	if t < _pause_until:
		_yaw += 0.02
		player.set_view(_yaw, -0.2)
		return
	if fmod(t, 10.0) > 10.0 * float(p.dig_share):
		return
	# A find buried nearby? Go for it (the gauge shows where).
	if _hunt < 0:
		_hunt = _pick_find()
		_hunt_start = t
	if _hunt >= 0:
		if gs.found[_hunt]:
			_last_progress = t
			_hunt = -1
		elif t - _hunt_start > (120.0 if float(p.hunt) >= 1.0 else 60.0):
			if float(p.hunt) >= 1.0:
				fail("couldn't dig out the %s at %s" % [Balance.FINDS[_hunt].name, field.find_spot(_hunt)])
			_gave_up.append(_hunt)
			_hunt = -1
		else:
			_dig_towards(field.find_spot(_hunt))
			return
	# The shaft: aim at the floor in a slow circle round the column (from
	# wherever you stand, so a side tunnel leads back to it), and walk over
	# when it's more than a couple of metres off.
	_yaw += 0.05 * float(p.turn)
	var off := Vector2(player.position.x - COLUMN.x, player.position.z - COLUMN.z)
	# A tight circle: wide enough to keep the shaft round, tight enough that
	# it never leaves a pillar in the middle to stand on.
	var rr := 0.18 + 0.32 * absf(sin(_yaw * 1.7))   # sweeps the whole disc: no pillar, no hole narrower than you
	var aim := Vector3(COLUMN.x + cos(_yaw) * rr, player.position.y - 0.35, COLUMN.z + sin(_yaw) * rr)
	if off.length() > 2.0:
		_walk_to(Vector3(COLUMN.x, player.position.y, COLUMN.z), 0.5)
		aim = Vector3(COLUMN.x, player.position.y - 0.2, COLUMN.z)
	player.look_at_point(aim)
	world.force_dig = true
	# Nothing in reach (standing on the lip of a pit the crew dug out under
	# the shaft)? Step in, the way a player would.
	if not bool(player.target.get("hit", false)):
		_no_aim_t += 0.05
		if _no_aim_t > 1.0:
			# Nothing in reach: dig the rim at your feet (you may be standing
			# across a hole narrower than you), and step forward.
			player.look_at_point(player.position + Vector3(cos(_yaw * 3.0) * 0.45, -0.15, sin(_yaw * 3.0) * 0.45))
			world.bot_move = Vector2(0, float(p.walk))
	else:
		_no_aim_t = 0.0


func _dig_towards(spot: Vector3) -> void:
	## Goes for a buried find the way a player would: in reach along the line
	## to it? Dig at it. If not, walk towards it (dropping into holes, hopping
	## ledges, digging whatever blocks the way), and once right above it, dig
	## straight down.
	var to: Vector3 = (spot - player.eye_pos()).normalized()
	var flat := Vector2(spot.x - player.position.x, spot.z - player.position.z)
	world.force_dig = true
	if bool(field.raycast(player.eye_pos(), to, gs.tool_reach()).get("hit", false)):
		player.look_at_point(spot)
		_no_aim_t = 0.0
		return
	_no_aim_t += 0.05
	if flat.length() > 0.35:
		_walk_to(spot, 0.3)
		# Look a little down the way you're walking, so a wall in the way gets dug.
		player.set_view(player.yaw, -0.35)
	else:
		player.look_at_point(Vector3(spot.x, player.position.y - 1.0, spot.z))
	if spot.y > player.position.y + 1.4 and player.on_floor:
		_key(KEY_SPACE)
	if _no_aim_t > 3.0 and _hunt_reported != _hunt:
		_hunt_reported = _hunt
		print("    hunt %d: out of reach for 3 s, heading over; ray to the find %s %s" % [_hunt,
			field.raycast(player.eye_pos(), to, 6.0), _diag()])


func _pick_find() -> int:
	var best := -1
	var best_d := 1e9
	var y: float = player.position.y
	for f in Balance.FINDS.size():
		if gs.found[f] or _gave_up.has(f) or Balance.FINDS[f].get("core", false):
			continue
		var s: Vector3 = field.find_spot(f)
		if s.y < y - 3.5 or s.y > y + 2.5:
			continue
		if player.eye_pos().distance_to(s) > gs.tool_reach() + 1.0:
			continue
		var d: float = Vector2(s.x - player.position.x, s.z - player.position.z).length()
		if float(p.hunt) < 1.0 and d > 2.2:
			continue
		if d < best_d:
			best_d = d
			best = f
	return best


# =====================================================================================
# Shopping
# =====================================================================================
func _want_shop(t: float) -> bool:
	if not gs.lift_stop.is_finite():
		return false
	var ni: int = gs.next_tool_index()
	if ni >= 0 and gs.money >= float(Balance.TOOLS[ni].cost):
		return true
	if t >= _next_shop and _cheapest_upgrade() <= minf(gs.money, _cap()):
		return true
	return false


func _cap() -> float:
	var nt: float = gs.next_tool_cost()
	return nt * float(p.upgrade_cap) if nt > 0.0 else INF


func _cheapest_upgrade() -> float:
	var c := INF
	for u in Balance.UPGRADES:
		if not gs.upgrade_maxed(u.key):
			c = minf(c, gs.upgrade_cost(u.key))
	return c


func _press(id: String) -> bool:
	## Presses an item's buy button in the open shop, the way a click would.
	var b = hud.shop.button_for(id) if hud.shop != null else null
	if b == null or b.disabled or not b.is_visible_in_tree():
		return false
	var before: float = gs.money
	b.pressed.emit()
	if gs.money < before:
		_last_progress = gs.clock
	return true


func _tab(t: String) -> void:
	hud.shop._tab_buttons[t].pressed.emit()


func _buy_things() -> void:
	var shop = hud.shop
	_tab("tools")
	var ni: int = gs.next_tool_index()
	if ni >= 0 and gs.money >= float(Balance.TOOLS[ni].cost):
		var name: String = Balance.TOOLS[ni].name
		if _press(str(Balance.TOOLS[ni].icon)):
			note("bought the %s" % name)
		else:
			fail("the %s was affordable but its button didn't buy it" % name)
	if take_ads and not _bonus_tested and _shop_visits >= 2:
		_test_bonus_ads()
	_tab("upgrades")
	var guard := 0
	var bought := true
	while bought and guard < 60:
		guard += 1
		bought = false
		var keys: Array = ["power", "size", "ore", "lamp"]
		keys.sort_custom(func(a, b): return gs.upgrade_cost(a) < gs.upgrade_cost(b))
		for k in keys:
			if not gs.upgrade_maxed(k) and gs.upgrade_cost(k) <= minf(gs.money, _cap()) and _press(k):
				bought = true
				if int(gs.upgrade_levels[k]) == 1:
					note("first %s upgrade" % gs.upgrade_def(k).name)
				break
	_tab("crew")
	for i in Balance.HELPERS.size():
		var key: String = Balance.HELPERS[i].key
		var share := 0.25 if i == 0 else 0.35
		var n := 0
		while n < 12 and gs.helper_cost(i) <= minf(gs.money, _cap() * share) and _press(key):
			n += 1
			if int(gs.helper_counts[i]) == 1:
				note("first %s" % Balance.HELPERS[i].name)
	_tab("tools")


func _test_bonus_ads() -> void:
	## The shop's free-for-an-ad tickets, one per visit (a ticket is greyed out
	## while an ad is playing): each must pay out. The stub pays at the end of
	## the frame, so the checks run a moment later.
	_tab("bonus")
	var kinds := ["cash", "boost", "helper_rush"]
	var k: String = kinds[_bonus_step % kinds.size()]
	_bonus_step += 1
	if _bonus_step >= kinds.size():
		_bonus_tested = true
	match k:
		"cash":
			var l0: float = gs.lifetime_money
			var amt: float = gs.instant_cash_amount()
			if _press("ad_cash"):
				_later("the shop's free-cash ad paid out", func(): return gs.lifetime_money >= l0 + amt * 0.99)
			else:
				fail("the shop's free-cash ad ticket didn't work")
		"boost":
			var b0: float = gs.boost_seconds_left()
			if gs.boost_can_stack() and not mon.is_watching():
				if _press("ad_boost"):
					_later("the shop's 2x boost ad added to the boost", func(): return gs.boost_seconds_left() > b0 + 100.0)
				else:
					fail("the shop's boost ad ticket didn't work")
		"helper_rush":
			if gs.has_helpers():
				if _press("ad_helper_rush"):
					_later("the shop's crew rush ad started the rush", func(): return gs.is_helper_rush_active())
				else:
					fail("the shop's crew rush ticket didn't work")
			else:
				_bonus_step -= 1
				_bonus_tested = false


var _bonus_step := 0


var _pending_checks: Array = []


func _later(what: String, check: Callable) -> void:
	_pending_checks.append([what, check, gs.clock + 0.3])


func _run_pending() -> void:
	for i in range(_pending_checks.size() - 1, -1, -1):
		var c: Array = _pending_checks[i]
		if gs.clock >= float(c[2]):
			_expect((c[1] as Callable).call(), str(c[0]))
			_pending_checks.remove_at(i)


func _expect(cond: bool, what: String) -> void:
	if cond:
		_ads_checked[what] = true
		print("  ok    %s" % what)
	else:
		fail(what)


# =====================================================================================
# Ads: the timed offer tag and "double this find"
# =====================================================================================
func _take_offers() -> void:
	if not take_ads:
		return
	if hud.offers.current != "" and hud._offer_tag.visible and not mon.is_watching() and not hud.offers.watching:
		var kind: String = hud.offers.current
		var before: int = gs.ads_watched
		var m0: float = gs.money
		_key(KEY_B)
		match kind:
			"cash":
				var l0: float = gs.lifetime_money
				_later("the instant-cash offer tag paid out", func(): return gs.ads_watched > before and gs.lifetime_money > l0)
			"boost":
				_later("the 2x offer tag started the boost", func(): return gs.ads_watched > before and gs.is_boost_active())
			"helper_rush":
				_later("the crew-rush offer tag started the rush", func(): return gs.ads_watched > before and gs.is_helper_rush_active())
	if hud.find_card_up() and hud._find_double != null and is_instance_valid(hud._find_double) \
			and hud._find_double.visible and not hud._find_double.disabled and _doubled != hud._find_index:
		var f: int = hud._find_index
		_doubled = f
		var m0: float = gs.money
		var v: float = gs.find_value(f)
		hud._find_double.pressed.emit()
		_later("doubling the %s paid it out again" % Balance.FINDS[f].name, func(): return gs.money >= m0 + v * 0.99)


var _doubled := -1


func _handle_popups() -> void:
	## The starter pack offer and the ending: answer them like a player.
	if hud.shop != null or hud.popups.get_child_count() == 0:
		return
	var pop: Node = hud.popups.get_child(hud.popups.get_child_count() - 1)
	var labels: Array = pop.find_children("*", "Label", true, false)
	var buttons: Array = pop.find_children("*", "Button", true, false)
	if buttons.is_empty():
		return
	var title := ""
	if not labels.is_empty():
		title = (labels[0] as Label).text
	if title.begins_with("Starter"):
		if profile == "boosted":
			var m0: float = gs.money
			(buttons[0] as Button).pressed.emit()
			_later("the starter pack paid out and unlocked the crystal tools", func(): return gs.owns_starter and gs.money > m0 and gs.skin == "crystal")
		else:
			(buttons[buttons.size() - 1] as Button).pressed.emit()
		note("starter pack offered")
	elif title.begins_with("You reached"):
		var body := ""
		for l in labels:
			body += (l as Label).text + "\n"
		_expect(body.contains("Time") and body.contains("Finds"), "the ending shows the run's stats")
		_expect(hud.ending and not hud.gauge.visible and not player.vm_layer.visible, "the ending hides the HUD and the tool")
		(buttons[0] as Button).pressed.emit()


# =====================================================================================
# Walking (along waypoints, on the real physics)
# =====================================================================================
func _route_to_site() -> void:
	route = [Vector3(1.8, 0, 12.5), Vector3(0.5, 0, 9.2), Vector3(0.5, 0, 6.5), COLUMN]
	var spot: Vector3 = gs.lift_spot if gs.lift_spot.is_finite() else COLUMN
	route[route.size() - 1] = Vector3(spot.x, 0, spot.z)
	_walk_check = Vector3.INF


func _route_to_shack() -> void:
	var s = world.surface
	route = [Vector3(8.2, 0, 0.0), Vector3(9.4, 0, 9.0), Vector3(0.2, 0, 9.7), Vector3(-9.4, 0, 9.4), Vector3(-10.6, 0, 1.2), s.SHACK_DOOR]
	_walk_check = Vector3.INF


func _route_to_cage() -> void:
	var s = world.surface
	route = [Vector3(-10.6, 0, 1.2), Vector3(-9.4, 0, 9.4), Vector3(0.2, 0, 9.7), Vector3(9.4, 0, 9.0), Vector3(8.2, 0, 0.0),
		s.LIFT_EXIT, s.LIFT_POS]
	_walk_check = Vector3.INF


func _follow() -> bool:
	if route.is_empty():
		return true
	var tol := 0.6 if route.size() > 1 else 0.35
	if _walk_to(route[0], tol):
		route.pop_front()
	return route.is_empty()


func _walk_to(target: Vector3, tol: float) -> bool:
	var d := Vector2(target.x - player.position.x, target.z - player.position.z)
	if d.length() < tol:
		return true
	var yaw := atan2(-d.x, -d.y)
	player.set_view(yaw, -0.1)
	world.bot_move = Vector2(0, float(p.walk) if d.length() > 1.0 else 0.5)
	# Stuck walking? Hop, then side-step; give up loudly after a while.
	var t: float = gs.clock
	if not _walk_check.is_finite() or player.position.distance_to(_walk_check) > 0.4:
		_walk_check = player.position
		_walk_check_t = t
	elif t - _walk_check_t > 3.0:
		_key(KEY_SPACE)
		world.bot_move = Vector2(0.8 if fmod(t, 4.0) < 2.0 else -0.8, 0.6)
		if t - _walk_check_t > 25.0:
			fail("stuck walking to %s from %s (state %s)" % [target, player.position, state])
			_walk_check_t = t
			player.teleport(target + Vector3(0, 0.3, 0), yaw)
	return false


func _key(code: Key) -> void:
	var ev := InputEventKey.new()
	ev.physical_keycode = code
	ev.keycode = code
	ev.pressed = true
	root.push_input(ev)
	var up := InputEventKey.new()
	up.physical_keycode = code
	up.keycode = code
	up.pressed = false
	root.push_input(up)


# =====================================================================================
# Save and reload: the same game must come back
# =====================================================================================
func _snapshot() -> Dictionary:
	var packs: Array = []
	for z in field.nzones:
		packs.append(field.save_string(z))
	return {"money": gs.money, "tool": gs.tool_index, "upgrades": gs.upgrade_levels.duplicate(), "helpers": gs.helper_counts.duplicate(),
		"found": gs.found.duplicate(), "deepest": gs.deepest, "stop": gs.lift_stop, "spot": gs.lift_spot,
		"pos": player.position, "packs": packs, "clock": gs.clock, "boost": gs.boost_seconds_left(), "time": gs.play_time}


func _reload_check() -> void:
	## Save, quit to nothing, load, and compare what comes back with what's in
	## the save file (the world saves once more as it closes, so the file is
	## the truth, not a snapshot taken a frame earlier).
	for _i in 30:
		await process_frame
		if player.on_floor and not world.is_riding() and not hud.is_blocking():
			break
	world.force_dig = false
	world.bot_move = Vector2.ZERO
	gs.save_game()
	world.queue_free()
	await process_frame
	await process_frame
	var saved = JSON.parse_string(FileAccess.get_file_as_string(gs.SAVE_PATH))
	if typeof(saved) != TYPE_DICTIONARY:
		fail("the save file couldn't be read back at %d m" % int(gs.deepest))
		await _spawn_world()
		return
	gs.reset_state()
	gs.load_game()
	gs.income_mult = float(p.income)
	# Compare before a single frame runs (the crew would carry on digging).
	world = load("res://scenes/world.tscn").instantiate()
	root.add_child(world)
	player = world.player
	field = world.field
	hud = world.hud
	if OS.get_cmdline_user_args().has("--touch"):
		hud.set_touch_mode(true)
	var b := _snapshot()
	var bad: Array = []
	if absf(float(saved.money) - float(b.money)) > 0.01:
		bad.append("money %s vs %s" % [saved.money, b.money])
	if int(saved.tool_index) != int(b.tool):
		bad.append("tool")
	for u in Balance.UPGRADES:
		if int(saved.upgrade_levels.get(u.key, 0)) != int(b.upgrades[u.key]):
			bad.append("upgrade %s" % u.key)
	for i in Balance.HELPERS.size():
		if int(saved.helper_counts[i]) != int(b.helpers[i]):
			bad.append("crew %d" % i)
	for f in Balance.FINDS.size():
		if bool(saved.found[f]) != bool(b.found[f]):
			bad.append("find %d" % f)
	if absf(float(saved.deepest) - float(b.deepest)) > 0.001:
		bad.append("deepest %.2f vs %.2f" % [saved.deepest, b.deepest])
	var stop := Vector3(saved.lift_stop[0], saved.lift_stop[1], saved.lift_stop[2]) if (saved.lift_stop as Array).size() == 3 else Vector3.INF
	if stop.is_finite() != (b.stop as Vector3).is_finite() or (stop.is_finite() and stop.distance_to(b.stop) > 0.001):
		bad.append("lift stop %s vs %s" % [stop, b.stop])
	var pos := Vector3(saved.player_pos[0], saved.player_pos[1], saved.player_pos[2])
	if pos.distance_to(b.pos) > 0.6:
		bad.append("player at %s, saved at %s" % [b.pos, pos])
	if absf((float(saved.boost_until) - float(saved.clock)) - float(b.boost)) > 0.5 and float(saved.boost_until) > float(saved.clock):
		bad.append("boost")
	for z in field.nzones:
		if str(saved.zones[z]) != str(b.packs[z]):
			bad.append("zone %d's rock" % z)
	for _i in 4:
		await process_frame
	_yaw = player.yaw
	if player.collides(player.position + Vector3(0, 0.08, 0)):
		bad.append("reloaded inside the rock at %s" % player.position)
	_reloads += 1
	if bad.is_empty():
		print("  ok    save and reload at %d m brings back the same game" % int(gs.deepest))
	else:
		fail("save and reload at %d m changed: %s" % [int(gs.deepest), ", ".join(bad)])


# =====================================================================================
# After the core: everything left to check, then the report
# =====================================================================================
func _finish() -> void:
	# One last trip to the shack: every upgrade and both helpers must be buyable.
	print("  the core is out; a last trip up to check the shop")
	state = "to_lift_stop"
	var guard := 0
	while state != "shopping" and guard < 20 * 120:
		guard += 1
		await process_frame
		world.bot_move = Vector2.ZERO
		_run_pending()
		_handle_popups()
		match state:
			"to_lift_stop":
				if world.is_riding():
					state = "ride_up"
				elif _walk_to(gs.lift_stop, _stop_tol()) or world.near() == "lift_stop":
					if world.near() == "lift_stop":
						_key(KEY_E)
						state = "ride_up"
			"ride_up":
				if not world.is_riding() and player.position.y > -1.0:
					_route_to_shack()
					state = "to_shack"
			"to_shack":
				if _follow() or world.near() == "shop":
					if world.near() == "shop":
						_key(KEY_E)
						state = "shopping"
	if hud.shop == null:
		fail("couldn't get back to the shop after the core")
		return
	_tab("upgrades")
	for u in Balance.UPGRADES:
		if int(gs.upgrade_levels[u.key]) == 0 and not _press(u.key):
			fail("the %s upgrade was never bought and can't be (%s for %s)" % [u.name, Fmt.num(gs.upgrade_cost(u.key)), Fmt.num(gs.money)])
	_tab("crew")
	for i in Balance.HELPERS.size():
		if int(gs.helper_counts[i]) == 0 and not _press(str(Balance.HELPERS[i].key)):
			fail("the %s was never hired and can't be" % Balance.HELPERS[i].name)
	if gs.tool_index != Balance.TOOLS.size() - 1:
		fail("not every tool was bought (has the %s)" % gs.tool_def().name)
	if profile == "boosted":
		await _check_purchases()
	hud.shop.close_shop()
	for _i in 6:
		await process_frame
	if hud.is_blocking() and hud.shop == null and hud.popups.get_child_count() == 0:
		fail("an ad screen got stuck open after closing the shop")


func _check_purchases() -> void:
	## Every stubbed purchase: it goes through and gives what it says.
	_tab("bonus")
	var m0: float = gs.money
	for id in [mon.PRODUCT_CASH_SMALL, mon.PRODUCT_CASH_MEDIUM, mon.PRODUCT_CASH_LARGE]:
		var pk: String = mon.PRODUCTS[id].pack
		var amt: float = gs.cash_pack_amount(pk)
		var before: float = gs.money
		if _press(id):
			for _i in 3:
				await process_frame
			_expect(gs.money >= before + amt * 0.99, "the %s cash pack paid %s" % [pk, Fmt.num(amt)])
		else:
			fail("the %s cash pack's button didn't work" % pk)
		_tab("bonus")
	if not gs.owns_golden:
		if _press(mon.PRODUCT_GOLDEN):
			for _i in 3:
				await process_frame
	_expect(gs.owns_golden and gs.skin == "golden", "golden tools bought and worn")
	_tab("bonus")
	if not gs.owns_starter:
		var l0: float = gs.lifetime_money
		if _press(mon.PRODUCT_STARTER):
			for _i in 3:
				await process_frame
		_expect(gs.owns_starter and gs.lifetime_money > l0, "the starter pack bought from the shop paid out")
	_tab("bonus")
	if not gs.owns_remove_ads:
		if _press(mon.PRODUCT_REMOVE_ADS_2X):
			for _i in 3:
				await process_frame
		_expect(gs.owns_remove_ads and absf(gs.speed_mult() / gs.debug_speed - 2.0 * (2.0 if gs.is_boost_active() else 1.0)) < 0.01 and not mon.interstitial_allowed(),
			"remove ads + 2x bought: digging doubled, no more ad breaks")
	_tab("bonus")
	var owned := [gs.owns_remove_ads, gs.owns_golden, gs.owns_starter]
	_press("restore")
	for _i in 3:
		await process_frame
	_expect([gs.owns_remove_ads, gs.owns_golden, gs.owns_starter] == owned, "restore purchases keeps what's owned")
	_expect(gs.purchases_made >= 6, "every purchase was counted (%d)" % gs.purchases_made)


func _report() -> void:
	var real := (Time.get_ticks_msec() - _start_ms) / 1000.0
	print("")
	print("Pacing, %s%s (game time):" % [profile, " with ads" if take_ads else ""])
	for e in pacing:
		print("  %s  %s" % [_clock(float(e[0])), e[1]])
	print("Finds %d of %d · tool %s · upgrades %s · crew %s · ads %d · purchases %d · interstitials %d · reloads %d" % [
		gs.finds_count(), Balance.FINDS.size(), gs.tool_def().name, gs.upgrade_levels, gs.helper_counts, gs.ads_watched,
		gs.purchases_made, mon.interstitials_shown, _reloads])
	if _capped:
		print("Real time %.0f s for %s of play (capped run: only the per-moment checks apply)" % [real, _clock(gs.play_time)])
		return
	if not take_ads:
		# Without rewarded ads in the way, the light interstitials must have shown (and closed).
		if mon.interstitials_shown < 1:
			fail("no interstitial ever showed at a break in %s of play" % _clock(gs.play_time))
		elif mon.is_showing_ad():
			fail("an interstitial is still open")
	if float(p.hunt) >= 1.0 and gs.finds_count() < Balance.FINDS.size():
		var missing: Array = []
		for f in Balance.FINDS.size():
			if not gs.found[f]:
				missing.append(Balance.FINDS[f].name)
		fail("finds never dug out: %s" % ", ".join(missing))
	print("Real time %.0f s for %s of play" % [real, _clock(gs.play_time)])


func _clock(t: float) -> String:
	return "%2d:%02d" % [int(t) / 60, int(t) % 60]


# =====================================================================================
# The visual run
# =====================================================================================
func _save_shot() -> void:
	await RenderingServer.frame_post_draw
	var img: Image = root.get_texture().get_image()
	if img == null or img.is_empty():
		return
	var path := "%s/shot_%03d.png" % [_shots_dir, _shots.size()]
	img.save_png(path)
	_shots.append([path, _clock(gs.play_time), state, int(gs.deepest)])


func _contact_sheet() -> void:
	if _shots.is_empty():
		return
	var first := Image.load_from_file(_shots[0][0])
	var tw := 320
	var th := int(float(first.get_height()) / float(first.get_width()) * tw)
	var cols := 6
	var rows := int(ceil(_shots.size() / float(cols)))
	var sheet := Image.create(cols * tw, rows * th, false, Image.FORMAT_RGB8)
	sheet.fill(Color(0.08, 0.06, 0.05))
	for i in _shots.size():
		var im := Image.load_from_file(_shots[i][0])
		im.convert(Image.FORMAT_RGB8)
		im.resize(tw, th, Image.INTERPOLATE_BILINEAR)
		sheet.blit_rect(im, Rect2i(0, 0, tw, th), Vector2i((i % cols) * tw, (i / cols) * th))
	sheet.save_png("%s/contact_sheet.png" % _shots_dir)
	var lines: Array = []
	for s in _shots:
		lines.append("%s  %s  %s  %d m" % [s[0].get_file(), s[1], s[2], s[3]])
	var f := FileAccess.open("%s/index.txt" % _shots_dir, FileAccess.WRITE)
	f.store_string("\n".join(lines))
	print("visual run: %d shots, contact sheet %s/contact_sheet.png" % [_shots.size(), _shots_dir])
