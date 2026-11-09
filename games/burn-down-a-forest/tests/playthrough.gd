extends SceneTree
## Plays a fresh save to the ending through the game's real systems, and fails
## loudly on anything a player would trip over:
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- keen
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- casual
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- boosted   (CI: dev income x10)
##   add "ads" to take every timed offer tag (pacing with ads)
## Runs side by side: give each its own save and log, e.g.
##   godot ... --log-file /tmp/k.log -s res://tests/playthrough.gd -- keen save=k log=/tmp/k.log
## The visual run (under xvfb with a real renderer, drawing only the frames it saves):
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 --fixed-fps 20 \
##     -s res://tests/playthrough.gd -- boosted shots=/tmp/visual size=844x390 every=12
##
## The bot walks the keeper (move input), turns the camera (yaw and pitch, like
## a drag or the mouse) until the crosshair sits on something its tool can
## light, holds the burn button, and shops by opening the notebook and pressing
## the entries' price tags. It closes stub ads with their "Close ad" button.
## Like a person, it takes a moment to turn and settle the crosshair on each new
## target before it burns (keen 1 s, casual 2.2 s), and a casual player idles.
## It prints a pacing table (tools bought, rings burned, the ending) and fails if:
##   the ending isn't reached in time; progress stalls; a tool, upgrade, helper
##   or find (a golden critter) is never reached; the keeper leaves the world
##   or ends up under the ground; a save and reload mid-run (several times)
##   doesn't restore the same state; a stubbed ad or purchase flow breaks; or
##   anything is logged as an error.
## (Untyped where it touches the game: this compiles before the autoloads exist.)

const DT := 0.05                   # with --fixed-fps 20 every frame is 50 ms of game time
const PROFILES := {
	"keen": {"react": 1.0, "shop_every": 6.0, "idle": 0.0, "upgrade_share": 0.45, "max_helpers": 8, "limit": 75.0 * 60.0, "income": 1.0, "ads": false, "stall": 150.0},
	"casual": {"react": 2.2, "shop_every": 25.0, "idle": 0.38, "upgrade_share": 0.25, "max_helpers": 5, "limit": 120.0 * 60.0, "income": 1.0, "ads": false, "stall": 300.0},
	"boosted": {"react": 0.5, "shop_every": 4.0, "idle": 0.0, "upgrade_share": 0.5, "max_helpers": 10, "limit": 40.0 * 60.0, "income": 10.0, "ads": true, "stall": 150.0},
}
const RELOAD_AT := [0.2, 0.45, 0.7]

var gs
var mon
var world
var profile := "keen"
var P: Dictionary
var t := 0.0                       # game seconds since the start
var failures: Array = []
var events: Array = []             # [time, text]
var bought_tools := {}
var bought_upgrades := {}
var hired := {}
var ring_done := {}
var reloads_done := 0
var _progress_reloads := 0
var _goldens_prior := 0
var _was_stuck := false
var _reloaded_after := {}
const RELOAD_AFTER := ["Flamethrower", "Meteor shower"]
var flows := {}                    # ad/purchase flows exercised -> true
var _target := -1
var _target_t := 0.0
var _walk_t := 0.0        # when the walk to the current target began
var _tried := {}
var _next_shop := 3.0
var _idle_until := 0.0
var _next_idle := 20.0
var _last_burned := 0
var _last_progress_t := 0.0
var _start_real := 0
var _log_start := 0
var shots_dir := ""
var shot_size := Vector2i(1280, 720)
var shot_every := 12.0
var _next_shot := 2.0
var _shot_n := 0


func _initialize() -> void:
	_run.call_deferred()


func _fail(why: String) -> void:
	if not failures.has(why):
		failures.append(why)
		print("  FAIL  t=%s  %s" % [_clock(t), why])


func _event(text: String) -> void:
	var f = world.forest if world != null else null
	var rings := ""
	if f != null:
		var bits: Array = []
		for z in Balance.ZONES.size():
			bits.append("%d" % int(f.zone_progress(z) * 100.0))
		rings = "  [earned %s, rings %s%%]" % [Fmt.num(gs.lifetime_embers), "/".join(bits)]
	events.append([t, text + rings])
	print("  t=%s  %s%s" % [_clock(t), text, rings])


static func _clock(s: float) -> String:
	return "%d:%02d" % [int(s) / 60, int(s) % 60]


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	for a in args:
		if PROFILES.has(a):
			profile = a
	P = (PROFILES[profile] as Dictionary).duplicate()
	if args.has("ads"):
		P.ads = true
	for a in args:
		if a.begins_with("shots="):
			shots_dir = a.substr(6)
		elif a.begins_with("size="):
			var wh: PackedStringArray = a.substr(5).split("x")
			shot_size = Vector2i(int(wh[0]), int(wh[1]))
		elif a.begins_with("every="):
			shot_every = float(a.substr(6))
	if shots_dir != "":
		DirAccess.make_dir_recursive_absolute(shots_dir)
		DisplayServer.window_set_size(shot_size)
		root.size = shot_size
		RenderingServer.render_loop_enabled = false
	_start_real = Time.get_ticks_msec()
	_log_start = _log_size()
	gs = root.get_node("GameState")
	mon = root.get_node("Monetization")
	gs.wipe_save(false)
	gs.dev_income = float(P.income)
	await _make_world()
	for a in args:
		if a.begins_with("from="):
			gs.dev_skip_to_ring(int(a.substr(5)))      # testing a later ring (not a real run)
			gs.grant_embers(2000.0)
		if a.begins_with("embers="):
			gs.grant_embers(float(a.substr(7)))         # debugging a late purchase
		if a.begins_with("at="):                        # start somewhere else: at=x,z
			var xz := a.substr(3).split(",")
			var k = world.keeper
			k.position = Vector3(float(xz[0]), world.forest.height_at(float(xz[0]), float(xz[1])), float(xz[1]))
	print("PLAYTHROUGH %s (ads: %s, income x%d)" % [profile, P.ads, int(P.income)])
	_event("start")
	while t < float(P.limit) and not gs.has_won:
		await process_frame
		t += DT
		_play_frame()
		if shots_dir != "" and t >= _next_shot:
			_next_shot = t + shot_every
			await _visual_shot()
		if not failures.is_empty() and failures.size() > 6:
			break
		# save and reload at set shares of the forest, and once each right after
		# the flamethrower and the meteor shower (with big fires going)
		var reload_mark: float = RELOAD_AT[_progress_reloads] if _progress_reloads < RELOAD_AT.size() else 2.0
		if world.forest.progress() >= reload_mark and not _busy():
			_progress_reloads += 1
			await _reload_check()
		var tool_name := str(gs.tool_def().name)
		if RELOAD_AFTER.has(tool_name) and not _reloaded_after.has(tool_name) and not _busy() \
				and t - float(bought_tools.get(gs.tool_index, t)) > 5.0:
			_reloaded_after[tool_name] = true
			await _reload_check()
	world.force_fire = false
	world.force_move = Vector2.ZERO
	if gs.has_won:
		_event("the Elder Tree burns: the ending (%d%% of the forest burned)" % int(world.forest.progress() * 100.0))
		await _check_ending()
	else:
		_fail("never reached the ending in %s of play (%d%% burned)" % [_clock(float(P.limit)), int(world.forest.progress() * 100.0)])
	_check_reached()
	if P.ads:
		_exercise_purchases()
		await _wait(2.0)
		_check_flows()
	_check_log()
	_report()
	gs.dev_income = 1.0
	gs.wipe_save(false)
	world.queue_free()
	await process_frame
	root.get_node("Sound").stop_all()
	await process_frame
	quit(0 if failures.is_empty() else 1)


func _visual_shot() -> void:
	## Draw this one frame and keep it (every 4th with the notebook open, mid-shop).
	_shot_n += 1
	var nb_open: bool = _shot_n % 4 == 0 and not _busy()
	if nb_open:
		world.hud.open_notebook(["tools", "upgrades", "helpers", "magic", "shop", "settings"][(_shot_n / 4) % 6])
	RenderingServer.render_loop_enabled = true
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("%s/%03d_%s.png" % [shots_dir, _shot_n, _clock(t).replace(":", "m")])
	RenderingServer.render_loop_enabled = false
	t += DT * 2.0
	if nb_open:
		world.hud.close_notebook()


func _make_world() -> void:
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	world.critters._rng.seed = 20261109        # the same critters every run
	world.hud.set_touch_mode(shots_dir != "" and shot_size.x < 1100)
	world.hud.show_desktop_hint = false
	await process_frame
	world.intro_t = -1.0


func _busy() -> bool:
	return world.hud.is_blocking() or mon.is_showing_ad()


# =====================================================================================
# One frame of play
# =====================================================================================
var _dbg_t := 0.0


func _debug() -> void:
	var k = world.keeper
	var f = world.forest
	var tp = f.cell_pos(_target) if _target >= 0 else Vector3.ZERO
	print("    dbg t=%s pos=%s target=%d (kind %d, state %d) tp=%s aim=%s cell=%d in=%s fire=%s input=%s block=%s ad=%s burning=%d embers=%s" % [
		_clock(t), k.position.snapped(Vector3.ONE * 0.1), _target, f.kind[_target] if _target >= 0 else -1, f.state[_target] if _target >= 0 else -1,
		tp.snapped(Vector3.ONE * 0.1), (k.aim.point as Vector3).snapped(Vector3.ONE * 0.1), k.aim.cell, k.aim.in_range, world.force_fire,
		k.input_enabled, world.hud.is_blocking(), mon.is_showing_ad(), f.burning.size(), Fmt.num(gs.embers)])


func _play_frame() -> void:
	var k = world.keeper
	var f = world.forest
	if OS.get_cmdline_user_args().has("debug") and t - _dbg_t > 10.0:
		_dbg_t = t
		_debug()
	_check_world_bounds()
	_track_progress()
	if gs.stuck and not _was_stuck:
		_event("safety net: the %s offered for %s embers" % [str(Balance.TOOLS[gs.next_tool_index()].name).to_lower(), Fmt.num(gs.embers)])
	_was_stuck = gs.stuck
	_close_stub_ads()
	if world.hud.popups.get_child_count() > 0:
		_answer_popup()
		return
	if world.hud.ending_active:
		return
	if mon.is_showing_ad():
		world.force_fire = false
		return
	if P.ads:
		_take_offers()
	if t >= _next_shop:
		_next_shop = t + float(P.shop_every)
		_shop()
		return
	# a casual player stops now and then to look around
	if float(P.idle) > 0.0:
		if t >= _next_idle:
			_idle_until = t + 20.0 * float(P.idle) / (1.0 - float(P.idle))
			_next_idle = _idle_until + 20.0
		if t < _idle_until:
			world.force_move = Vector2.ZERO
			world.force_fire = false
			return
	_steer()


func _steer() -> void:
	var k = world.keeper
	var f = world.forest
	var heat: float = gs.tool_heat()
	# give up on a target after 9 s of trying from within reach, or 40 s of walking
	var given_up := t - _target_t > 9.0 or t - _walk_t > 40.0
	if _target < 0 or not f.can_light(_target, heat) or given_up:
		if _target >= 0 and f.state[_target] == 0 and given_up:
			_tried[_target] = t
		_target = _pick_target(heat)
		_target_t = t
		_walk_t = t
		if _target < 0:
			world.force_move = Vector2.ZERO
			world.force_fire = false
			return
	var tp: Vector3 = f.cell_pos(_target)
	var flat := Vector2(tp.x - k.position.x, tp.z - k.position.z)
	var reach: float = gs.tool_range() * 0.8
	var yaw := atan2(-flat.x, -flat.y)
	if flat.length() > reach:
		# turn toward it and walk
		k.cam_yaw = lerp_angle(k.cam_yaw, yaw, 0.35)
		world.force_move = Vector2(0, 1)
		world.force_fire = false
		_target_t = t          # the 9 s of trying start on arrival
		return
	_aim_at(tp)
	if t - _target_t < float(P.react):
		world.force_fire = false       # still turning and settling the crosshair
		world.force_move = Vector2.ZERO
		return
	# Something in the way (the crosshair stops on the first tree in line)? Step
	# closer while aiming, the way a player would; back off if right on top of it.
	var ap: Vector3 = k.aim.point
	var off := Vector2(ap.x - tp.x, ap.z - tp.z).length()
	if off > maxf(1.2, gs.tool_radius()) and flat.length() > 2.0:
		world.force_move = Vector2(0, 0.8)
	elif flat.length() < 1.6:
		world.force_move = Vector2(0, -0.6)
	else:
		world.force_move = Vector2.ZERO
	world.force_fire = true


func _aim_at(tp: Vector3) -> void:
	## Turn the camera until the crosshair lands on the target: the yaw from the
	## camera's pivot (it looks over the keeper's shoulder), then the best pitch.
	var k = world.keeper
	var yaw: float = k.cam_yaw
	for _i in 2:
		var pivot: Vector3 = k.position + Vector3(cos(yaw), 0, -sin(yaw)) * 0.95
		yaw = atan2(-(tp.x - pivot.x), -(tp.z - pivot.z))
	var best_p: float = k.cam_pitch
	var best_d := INF
	var p := -1.2
	while p <= -0.15:
		k.set_view(yaw, p)
		k.update_aim()
		var ap: Vector3 = k.aim.point
		var d := Vector2(ap.x - tp.x, ap.z - tp.z).length()
		if d < best_d:
			best_d = d
			best_p = p
		p += 0.07
	k.set_view(yaw, best_p)
	k.update_aim()


func _pick_target(heat: float) -> int:
	## Something the tool can light: the best payout close by, else the nearest anywhere.
	var f = world.forest
	var k = world.keeper
	var best := -1
	var best_s := -INF
	# Once the forest is nearly gone and the tool in hand can light the Elder Tree,
	# that's where a player goes: the last few strays can wait.
	var e: int = f.elder_cell
	if f.progress() >= 0.85 and f.can_light(e, heat) and not (_tried.has(e) and t - float(_tried[e]) < 20.0):
		return e
	var c: int = f.cell_at(k.position.x, k.position.z)
	if c >= 0:
		var cx: int = c % f.n
		var cy: int = c / f.n
		for oy in range(-9, 10):
			for ox in range(-9, 10):
				var x: int = cx + ox
				var y: int = cy + oy
				if x < 0 or y < 0 or x >= f.n or y >= f.n:
					continue
				var i: int = x + y * f.n
				if _tried.has(i) and t - float(_tried[i]) < 60.0:
					continue
				if not f.can_light(i, heat):
					continue
				var s := float(f.kind[i]) * 2.0 - Vector2(ox, oy).length() * 0.35
				if s > best_s:
					best_s = s
					best = i
	if best >= 0:
		return best
	var best_d := INF
	var kp := Vector2(k.position.x, k.position.z)
	for i in f.state.size():
		if f.state[i] != 0 or (_tried.has(i) and t - float(_tried[i]) < 60.0):
			continue
		if not f.can_light(i, heat):
			continue
		var d := kp.distance_squared_to(f.cell_center(i)) - float(f.kind[i]) * 30.0
		if d < best_d:
			best_d = d
			best = i
	return best


# =====================================================================================
# Shopping, through the notebook's own tags
# =====================================================================================
func _shop() -> void:
	var hud = world.hud
	world.force_fire = false
	world.force_move = Vector2.ZERO
	var nt: int = gs.next_tool_index()
	# (the price on the tag: the safety net can drop it to what you have)
	var want_tool: bool = nt >= 0 and gs.embers >= gs.tool_cost(nt)
	hud.open_notebook("tools")
	var nb = hud.notebook
	if nb == null:
		_fail("the notebook didn't open")
		return
	if want_tool:
		var name := str(Balance.TOOLS[nt].name)
		var before: int = gs.tool_index
		if not nb.press(name) or gs.tool_index != before + 1:
			_fail("couldn't buy the %s from its tag with %s embers" % [name, Fmt.num(gs.embers)])
		else:
			bought_tools[nt] = t
			_event("bought the %s" % name.to_lower())
	# Upgrades and helpers with what's left. Close to the next tool, a keen
	# player saves up for it instead.
	var spend: float = gs.embers * float(P.upgrade_share)
	nt = gs.next_tool_index()
	if nt >= 0 and gs.embers >= float(Balance.TOOLS[nt].cost) * 0.35:
		spend = 0.0
	var order := ["value", "heat", "wind", "wide", "boots"]
	if nt >= 0 and _blocked_by_heat():
		order = ["heat", "value", "wind", "wide", "boots"]
		spend = gs.embers * 0.9
	nb.select("upgrades")
	for _round in 3:
		for key in order:
			var cost: float = gs.upgrade_cost(key)
			if gs.upgrade_maxed(key) or cost > spend:
				continue
			var u: Dictionary = gs.upgrade_def(key)
			var lv: int = gs.upgrade_levels[key]
			if nb.press(str(u.name)):
				spend -= cost
				if int(gs.upgrade_levels[key]) != lv + 1:
					_fail("pressing the %s tag didn't raise it" % u.name)
				if not bought_upgrades.has(key):
					bought_upgrades[key] = t
	nb.select("helpers")
	for i in Balance.HELPERS.size():
		var cost: float = gs.helper_cost(i)
		# the first of a new kind of helper tempts anyone, even someone saving up
		var budget: float = maxf(spend, gs.embers * 0.5) if int(gs.helper_counts[i]) == 0 else spend
		if int(gs.helper_counts[i]) >= int(P.max_helpers) or cost > budget:
			continue
		if nb.press(str(Balance.HELPERS[i].name)):
			spend -= cost
			if not hired.has(i):
				hired[i] = t
				_event("hired: %s" % str(Balance.HELPERS[i].name).to_lower())
	if P.ads:
		_notebook_ads(nb)
	hud.close_notebook()


func _goldens() -> int:
	return _goldens_prior + int(world.critters.goldens)


func _blocked_by_heat() -> bool:
	## Nothing left the tool can light (a big fire might still be going): heat upgrades next.
	return _pick_target(gs.tool_heat()) < 0 and world.forest.burning.size() < 5


func _notebook_ads(nb) -> void:
	nb.select("magic")
	if not gs.is_boost_active():
		if nb.press("2x fire for 5 minutes"):
			flows["boost from the notebook"] = false
	elif gs.has_helpers() and not gs.is_helper_rush_active():
		if nb.press("Helpers work 3x for 3 minutes"):
			flows["helper rush"] = false
	elif gs.instant_ready():
		if nb.press("Free embers"):
			flows["free embers"] = false


func _take_offers() -> void:
	var hud = world.hud
	# A boosted run is over before the first offer (2.5 min) or the starter parcel
	# (10 min) would turn up: bring their timers forward so CI tries both flows.
	if profile == "boosted":
		if t > 20.0 and not flows.has("offer tag: instant") and not flows.has("offer tag: boost") and not flows.has("offer tag: helper_rush"):
			hud.offers._wait = minf(hud.offers._wait, 0.0)
		if t > 35.0 and not gs.starter_offered:
			gs.play_time = maxf(gs.play_time, Balance.STARTER_AFTER)
	if hud.offers.current != "" and not hud.offers.watching and not mon.is_watching() and not hud.is_blocking():
		flows["offer tag: " + hud.offers.current] = false
		hud.take_offer()
	if hud.find_tag.visible and not mon.is_watching() and not hud.is_blocking():
		flows["double a golden find"] = false
		hud.take_find()


func _close_stub_ads() -> void:
	## Press the stub ad's "Close ad" once its countdown is done, like a player.
	var layer = mon.provider.get("_layer")
	if layer == null:
		return
	for n in layer.find_children("*", "Button", true, false):
		var b: Button = n
		if b.text == "Close ad" and not b.disabled:
			b.pressed.emit()
			for key in flows:
				flows[key] = true


func _answer_popup() -> void:
	## The starter parcel: keen and casual say "not now", the boosted bot opens it.
	var hud = world.hud
	var dim: Control = hud.popups.get_child(0)
	for n in dim.find_children("*", "Button", true, false):
		var b: Button = n
		var buy := b.text.begins_with("Open it")
		if (P.ads and buy) or (not P.ads and b.text == "not now"):
			if buy:
				flows["starter parcel purchase"] = false
			b.pressed.emit()
			_event("starter parcel offered: %s" % ("bought it" if buy else "not now"))
			return


# =====================================================================================
# Checks
# =====================================================================================
func _check_world_bounds() -> void:
	var k = world.keeper
	var f = world.forest
	var b: Rect2 = k.bounds
	if not b.grow(0.5).has_point(Vector2(k.position.x, k.position.z)):
		_fail("the keeper left the world at %s" % k.position)
	var g: float = maxf(f.height_at(k.position.x, k.position.z), -0.6)
	if k.position.y < g - 0.6:
		_fail("the keeper is under the ground at %s" % k.position)
	if not k.position.is_finite():
		_fail("the keeper's position went bad")


func _track_progress() -> void:
	var f = world.forest
	if f.burned > _last_burned:
		_last_burned = f.burned
		_last_progress_t = t
	elif t - _last_progress_t > float(P.stall):
		var k = world.keeper
		_fail("progress stalled: nothing burned for %ds (%d%% burned, %s, %s embers; keeper at %.0f,%.0f, target %d kind %d zone %d)" % [
			int(t - _last_progress_t), int(f.progress() * 100.0), str(gs.tool_def().name), Fmt.num(gs.embers),
			k.position.x, k.position.z, _target, f.kind[_target] if _target >= 0 else -1, f.zone[_target] if _target >= 0 else -1])
		_last_progress_t = t
	for z in Balance.ZONES.size():
		if not ring_done.has(z) and f.zone_progress(z) >= 0.9:
			ring_done[z] = t
			var note := ""
			if z >= 1 and not bought_tools.has(z) and gs.tool_index < z:
				note = "  (JACKPOT: burned before its tool, the %s, was bought)" % str(Balance.TOOLS[z].name).to_lower()
			_event("ring burned: %s%s" % [str(Balance.ZONES[z].name).to_lower(), note])


func _snapshot() -> Dictionary:
	var k = world.keeper
	return {"embers": gs.embers, "tool": gs.tool_index, "upgrades": (gs.upgrade_levels as Dictionary).duplicate(),
		"helpers": (gs.helper_counts as Array).duplicate(), "forest": world.forest.to_save_string(),
		"pos": k.position, "boost": gs.boost_until, "won": gs.has_won, "play": gs.play_time}


func _reload_check() -> void:
	## Save, throw the world away, load it back: everything must come back the same.
	reloads_done += 1
	world.force_fire = false
	world.force_move = Vector2.ZERO
	await process_frame            # let go of the stick first, as a player pausing would
	t += DT
	world.process_mode = Node.PROCESS_MODE_DISABLED     # the app goes to the background: nothing ticks
	gs.save_game()
	var before := _snapshot()
	_goldens_prior += int(world.critters.goldens)     # the count lives in the world being thrown away
	world.queue_free()
	await process_frame
	gs.reset_state()
	gs.load_game()
	await _make_world()
	var after := _snapshot()
	var bad: Array = []
	if absf(float(before.embers) - float(after.embers)) > maxf(0.01, float(before.embers) * 1e-6):
		bad.append("embers %s -> %s" % [before.embers, after.embers])
	for key in ["tool", "upgrades", "helpers", "won"]:
		if str(before[key]) != str(after[key]):
			bad.append("%s %s -> %s" % [key, before[key], after[key]])
	if before.forest != after.forest:
		var diff := 0
		for i in (before.forest as String).length():
			if before.forest[i] != after.forest[i]:
				diff += 1
		bad.append("forest cells differ: %d" % diff)
	if (before.pos as Vector3).distance_to(after.pos) > 0.05:
		bad.append("keeper %s -> %s" % [before.pos, after.pos])
	if absf(float(before.boost) - float(after.boost)) > 0.01:
		bad.append("boost")
	if bad.is_empty():
		_event("saved and reloaded at %d%%: everything came back" % int(world.forest.progress() * 100.0))
	else:
		_fail("save/reload mismatch at %d%%: %s" % [int(world.forest.progress() * 100.0), ", ".join(bad)])
	_target = -1


func _check_ending() -> void:
	var hud = world.hud
	if not hud.ending_active or hud.root.visible:
		_fail("the ending didn't hide the HUD")
	await _wait(10.0)
	if not hud.ending_letter_shown():
		_fail("the ending letter never showed")
	hud.close_ending()
	await process_frame
	if not world.keeper.input_enabled or hud.is_blocking():
		_fail("couldn't walk the meadow after the ending")


func _check_reached() -> void:
	for i in Balance.TOOLS.size():
		if i > 0 and not bought_tools.has(i) and gs.tool_index < i:
			_fail("never reached the %s" % str(Balance.TOOLS[i].name).to_lower())
	for u in Balance.UPGRADES:
		if not bought_upgrades.has(u.key):
			_fail("never bought %s" % u.name)
	for i in Balance.HELPERS.size():
		if not hired.has(i):
			_fail("never hired a %s" % str(Balance.HELPERS[i].name).to_lower())
	if _goldens() == 0:
		_fail("never found a golden critter")


func _exercise_purchases() -> void:
	## Every purchase flow once (stubbed): Remove Ads, the phoenix flame, an ember pack, restore.
	mon.buy(mon.PRODUCT_EMBERS_S)
	flows["ember pack"] = false
	mon.buy(mon.PRODUCT_PHOENIX)
	flows["phoenix flame"] = false
	mon.buy(mon.PRODUCT_REMOVE_ADS_2X)
	flows["remove ads"] = false
	mon.restore()


func _check_flows() -> void:
	if gs.owns_phoenix:
		flows["phoenix flame"] = true
	if gs.owns_remove_ads_2x:
		flows["remove ads"] = true
	if int(gs.packs_bought) > 0 or (mon.provider.get("counts") as Dictionary).get("purchases", 0) >= 3:
		flows["ember pack"] = true
	if gs.owns_starter:
		flows["starter parcel purchase"] = true
	for key in flows:
		if not flows[key]:
			_fail("the %s flow didn't finish" % key)
	if mon.is_showing_ad() or world.hud.is_blocking():
		_fail("an ad or popup was left open")
	print("  flows exercised: %s" % ", ".join(flows.keys()))


func _wait(seconds: float) -> void:
	var n := int(seconds / DT)
	for _i in n:
		await process_frame
		t += DT
		_close_stub_ads()


func _log_path() -> String:
	## This run's log. Godot keeps engine options like --log-file to itself, so a
	## run with its own log passes the same path again after `--` as log=<path>.
	for a in OS.get_cmdline_user_args():
		if a.begins_with("log="):
			return a.substr(4)
	return "user://logs/godot.log"


func _log_size() -> int:
	var path := _log_path()
	if not FileAccess.file_exists(path):
		return 0
	var fa := FileAccess.open(path, FileAccess.READ)
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
	## Anything logged as an error during the run fails it.
	var path := _log_path()
	if not FileAccess.file_exists(path):
		print("  (no log file to check)")
		return
	var text := _log_tail(path)
	var n := 0
	var lines := text.split("\n")
	for k in lines.size():
		var line := lines[k]
		# The "at:" line under an error says where it came from: a machine with no
		# sound card logs one from the audio driver, which isn't the game's fault.
		var at := lines[k + 1] if k + 1 < lines.size() else ""
		if (line.begins_with("ERROR") or line.begins_with("SCRIPT ERROR") or line.begins_with("USER ERROR")) \
				and not line.contains("ALSA") and not line.contains("audio") \
				and not at.contains("audio_driver") and not at.contains("alsa"):
			n += 1
			if n <= 5:
				_fail("logged: %s" % line.substr(0, 200))
	if n > 5:
		_fail("%d more errors logged" % (n - 5))


func _report() -> void:
	var real := (Time.get_ticks_msec() - _start_real) / 1000.0
	print("")
	print("PACING (%s%s): %s of play, %ds real" % [profile, ", ads" if P.ads else "", _clock(t), int(real)])
	print("  time    event")
	for e in events:
		print("  %6s  %s" % [_clock(float(e[0])), e[1]])
	print("  tools: %s" % ", ".join(bought_tools.keys().map(func(i): return "%s %s" % [str(Balance.TOOLS[i].name).to_lower(), _clock(bought_tools[i])])))
	print("  upgrades: %s" % ", ".join(Balance.UPGRADES.map(func(u): return "%s %d" % [str(u.key), int(gs.upgrade_levels[u.key])])))
	print("  helpers: %s, golden critters %d, critters saved %d, reloads %d" % [str(gs.helper_counts), _goldens(), int(gs.critters_saved), reloads_done])
	print("PLAYTHROUGH %s %s" % [profile, "PASSED" if failures.is_empty() else "FAILED: " + "; ".join(failures)])
