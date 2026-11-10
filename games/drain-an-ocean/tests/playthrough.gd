extends SceneTree
## The playthrough bot (STUDIO.md, "Playtesting"): plays a fresh save until
## the bay is dry, through the game's real systems, and fails loudly if
## anything's off.
##
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- keen
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- casual
##   godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- boosted   (CI: dev income x10, takes every ad)
##   ... -- keen ads        keen, and takes every offer it's shown (pacing with ads)
##
## How it plays: it looks round the bay the way a player does, panning the
## camera to whatever's worth tapping (a stranded animal, a glint on the
## sand, a wreck out of the water) and tapping it on screen through
## World._on_tap, the same path a finger takes. It taps pools to send or buy
## barges from the callout's own stamp, taps pump pads to upgrade them, and
## every so often runs up the Chandlery flag and buys from the pegboard's
## price stamps. The casual player looks less often, misses things, wanders
## off to the aquarium and stops to look round. The game runs at x4 speed
## (dev time scale) so a 30-minute run takes a minute or two.
##
## It fails (exit 1) if: the bay isn't dry in time; progress stalls (no
## lower water, purchase, rescue or find for 5 game-minutes); a creature,
## find or wreck load stays out of reach; a pool never gets pumped; an
## upgrade, helper, barge or pump tier can't be bought by the end; a save
## and reload (at every new ring) doesn't bring back the same game; a
## stubbed ad or purchase doesn't pay out; or anything prints an error.
## Run without "--child" it starts itself as a child process and scans the
## child's output for errors. A visual run adds "--shots DIR --every SECONDS
## --size WxH" (run under xvfb): a screenshot every so often and a contact sheet.
## (Untyped where it touches autoloads: this compiles before they exist.)

const PROFILES := {
	"keen": {"scan": 0.6, "miss": 0.0, "shop_every": 45.0, "upgrade_cap": 0.35, "limit": 90.0 * 60.0, "income": 1.0,
		"pause_every": 0.0, "pause_secs": 0.0, "aquarium_every": 300.0, "pad_taps": 0.5, "all_pools": true},
	"casual": {"scan": 4.0, "miss": 0.35, "shop_every": 300.0, "upgrade_cap": 0.0, "max_buys": 2, "limit": 170.0 * 60.0, "income": 1.0,
		"pause_every": 80.0, "pause_secs": 50.0, "aquarium_every": 150.0, "pad_taps": 0.3, "all_pools": false},
	"boosted": {"scan": 0.6, "miss": 0.0, "shop_every": 30.0, "upgrade_cap": 0.35, "limit": 45.0 * 60.0, "income": 10.0,
		"pause_every": 0.0, "pause_secs": 0.0, "aquarium_every": 240.0, "pad_taps": 0.5, "all_pools": true},
}
const TIME_SCALE := 4.0
const STALL_SECONDS := 300.0
const ERROR_PATTERNS := ["SCRIPT ERROR", "ERROR:", "USER ERROR", "Parse Error", "Invalid call", "Invalid access"]
const IGNORE_PATTERNS := ["resources still in use at exit", "ObjectDB instances leaked", "ALSA lib", "Condition \"status < 0\"",
	"were leaked at exit", "PagedAllocator", "instance_notify_deleted", "Leaked instance"]

var profile := "keen"
var p: Dictionary
var take_ads := false
var gs
var mon
var world
var hud
var bay
var failures: Array = []
var pacing: Array = []          # [game seconds, what]
var _start_ms := 0
var _next_scan := 0.0
var _next_shop := 30.0
var _next_aquarium := 200.0
var _next_pause := 60.0
var _pause_until := -1.0
var _last_progress := 0.0
var _lowest := 0.0
var _ring_seen := 0
var _tier_seen := 1
var _reloads := 0
var _pending: Array = []        # [what, check Callable, at game time]
var _ads_checked := {}
var _tap_tries := {}            # "c:3" -> taps that didn't take
var _won_at := -1.0
var _shots_dir := ""
var _shot_every := 0.0
var _next_shot := 0.0
var _shots: Array = []
var _capped := false
var _doubled := -1
var _next_status := 120.0
var _ring_income: Array = []
var _purchase_log := {}
var _rng := RandomNumberGenerator.new()
var _want_reload := false


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
	i = args.find("--limit")
	if i >= 0 and i + 1 < args.size():
		p.limit = float(args[i + 1]) * 60.0
		_capped = true
	_rng.seed = 2026
	_play.call_deferred()


# =====================================================================================
# Parent: run the bot as a child process and check its output for errors
# =====================================================================================
func _run_as_parent(args: Array) -> void:
	var child_args := ["--headless", "--fixed-fps", "20", "--path", ProjectSettings.globalize_path("res://"),
		"-s", "res://tests/playthrough.gd", "--"]
	if args.find("--shots") >= 0:
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
		print("  FAIL  %s (at %s)" % [what, _clock(gs.play_time if gs != null else 0.0)])


func note(what: String) -> void:
	pacing.append([gs.play_time, what])
	print("  %s  %s   (water %.1f m, cash %s, tickets %s/s, real %ds)" % [_clock(gs.play_time), what, -bay.main_level(), Fmt.num(gs.money),
		Fmt.num(gs.aquarium_income()), (Time.get_ticks_msec() - _start_ms) / 1000])


func _play() -> void:
	_start_ms = Time.get_ticks_msec()
	gs = root.get_node("GameState")
	mon = root.get_node("Monetization")
	mon.provider.instant = true
	gs.SAVE_PATH = "user://ocean_save_bot_%s.json" % profile
	gs.reset_state(false)
	gs.save_game()
	gs.income_mult = float(p.income)
	print("Playthrough: %s%s" % [profile, " (takes every ad)" if take_ads else ""])
	await _spawn_world()
	Engine.time_scale = TIME_SCALE
	_next_shop = float(p.shop_every)
	_next_aquarium = float(p.aquarium_every)
	_next_pause = float(p.pause_every) if float(p.pause_every) > 0.0 else 1e9
	var limit: float = p.limit
	while gs.play_time < limit and failures.size() <= 8:
		await process_frame
		await _step()
		if _want_reload:
			_want_reload = false
			await _reload_check()
		if gs.has_won and _won_at < 0.0:
			_won_at = gs.play_time
			note("THE BAY IS DRY")
			await _finish()
			break
	if _won_at < 0.0 and not _capped:
		fail("the bay wasn't dry after %s of play (water at %.1f m)" % [_clock(gs.play_time), -bay.main_level()])
	Engine.time_scale = 1.0
	_report()
	if _shots_dir != "":
		_contact_sheet()
	world.queue_free()
	await process_frame
	gs.income_mult = 1.0
	gs.delete_save()
	print("PLAYTHROUGH %s: %s" % [profile.to_upper(), "PASSED" if failures.is_empty() else "FAILED (%d)" % failures.size()])
	quit(0 if failures.is_empty() else 1)


func _spawn_world() -> void:
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	for _i in 3:
		await process_frame
	hud = world.hud
	bay = world.bay


# =====================================================================================
# Every frame
# =====================================================================================
func _step() -> void:
	var t: float = gs.play_time
	_run_pending()
	_watch(t)
	if _shots_dir != "" and t >= _next_shot:
		_next_shot = t + _shot_every
		await _save_shot()
	if t >= _next_status:
		_next_status = t + 120.0
		print("    [%s] water %.2f m, flow %s vs seep %s, cash %s, pads %s, pools %d, barges %d" % [_clock(t), -bay.main_level(),
			Fmt.flow(world.main_flow), Fmt.flow(world.seep_flow), Fmt.num(gs.money), str(gs.pads), bay.pool_ids().size(), gs.barges.size()])
	if world.ending_shot != null and world.ending_shot.running:
		return
	if mon.is_showing_ad():
		return
	if world.paused_world:
		# In the aquarium: look a while, check the takings, go back.
		if world.aquarium.is_open and t > _next_aquarium - float(p.aquarium_every) + 6.0:
			_expect(gs.aquarium_income() > 0.0 or gs.creatures_in_tank() == 0, "the aquarium shows its takings")
			var back = world.aquarium.root_ui.find_children("*", "BaseButton", true, false).filter(func(b): return str(b.get_meta("id", "")) == "back")
			if not back.is_empty():
				back[0].pressed.emit()
		return
	if hud.shop_open():
		hud.close_shop()
		return
	_handle_callout_offers()
	_take_offers()
	if t < _pause_until:
		return
	if t >= _next_pause:
		_pause_until = t + float(p.pause_secs) * _rng.randf_range(0.6, 1.4)
		_next_pause = t + float(p.pause_every) * _rng.randf_range(0.7, 1.3)
		rig_pan(_rng.randf_range(-40, 40), _rng.randf_range(-40, 40), 0.8)
		return
	if t >= _next_aquarium and gs.creatures_in_tank() > 0:
		_next_aquarium = t + float(p.aquarium_every)
		hud.flag_aqua.pressed.emit()
		return
	if t >= _next_shop or (profile != "casual" and gs.next_pump_cost() > 0.0 and gs.money >= gs.next_pump_cost() * 1.0 and t >= _next_shop - float(p.shop_every) * 0.6):
		_next_shop = t + float(p.shop_every)
		await _shop()
		return
	if t >= _next_scan:
		_next_scan = t + float(p.scan) * _rng.randf_range(0.7, 1.3)
		await _scan()


func rig_pan(x: float, z: float, zoom: float) -> void:
	world.rig.set_view(x, z + 6.0, zoom)


func _tap_world(at: Vector3) -> Dictionary:
	## Pans the camera so `at` is on screen, then taps it there like a finger.
	rig_pan(at.x, at.z, 0.42)
	await process_frame
	var cam: Camera3D = world.rig.camera
	if cam.is_position_behind(at):
		return {}
	var sp := cam.unproject_position(at)
	var pick: Dictionary = world.pick_at(sp)
	world._on_tap(sp)
	return pick


func _scan() -> void:
	## Look for what's worth tapping, nearest first, and tap it.
	var did := 0
	var max_taps := 6 if profile != "casual" else 2
	for i in world.creatures.stranded_list():
		if did >= max_taps:
			break
		if _rng.randf() < float(p.miss):
			continue
		var key := "c:%d" % i
		await _tap_world(world.creatures.screen_pos(i))
		if gs.is_rescued(i):
			_progress()
			_tap_tries.erase(key)
		else:
			_tap_tries[key] = int(_tap_tries.get(key, 0)) + 1
			if int(_tap_tries[key]) == 8:
				fail("tapping the stranded %s at %s never rescues it" % [Balance.SPECIES[int(world.creatures.spots[i].species)].name, world.creatures.spots[i].pos.snapped(Vector3.ONE * 0.1)])
		did += 1
	for f in world.finds.exposed_list():
		if did >= max_taps:
			break
		if _rng.randf() < float(p.miss):
			continue
		var key := "f:%d" % f
		await _tap_world(world.finds.spots[f].pos + Vector3(0, 0.3, 0))
		if gs.finds_found[f]:
			_progress()
			_tap_tries.erase(key)
			await _maybe_double(f)
		else:
			_tap_tries[key] = int(_tap_tries.get(key, 0)) + 1
			if int(_tap_tries[key]) == 8:
				fail("tapping the %s never picks it up" % Balance.FINDS[f].name)
		did += 1
	for w in world.finds.wrecks.size():
		if did >= max_taps:
			break
		if world.finds.wreck_ready(w):
			var before: int = int(gs.wreck_loads[w])
			await _tap_world(world.finds.wrecks[w].pos + Vector3(0, 2.0, 0))
			if int(gs.wreck_loads[w]) < before:
				_progress()
			else:
				var key := "w:%d" % w
				_tap_tries[key] = int(_tap_tries.get(key, 0)) + 1
				if int(_tap_tries[key]) == 10:
					fail("tapping %s never gives a salvage load" % world.finds.wrecks[w].name)
			did += 1
	hud.close_callout()
	await _tend_pools()
	if _rng.randf() < float(p.pad_taps) * (0.3 if profile == "casual" else 1.0):
		await _upgrade_by_pad()


func _maybe_double(f: int) -> void:
	if not take_ads or _doubled == f:
		return
	for _i in 2:
		await process_frame
	if hud.find_card_up() and hud._find_btn != null and is_instance_valid(hud._find_btn) and hud._find_btn.visible and not hud._find_btn.disabled:
		_doubled = f
		var l0: float = gs.lifetime_money
		var v: float = gs.find_value(f)
		hud._find_btn.pressed.emit()
		_later("doubling the %s paid it out again" % Balance.FINDS[f].name, func(): return gs.lifetime_money >= l0 + v * 0.99)


func _tend_pools() -> void:
	## A barge on every pool that matters: the ones with something in them
	## (and, for the keen player, every pool, so none is left holding water).
	for id in bay.pool_ids():
		if not bay.bodies.has(id):
			continue
		var has_life: bool = world._creatures_in_body(id) > 0
		if not has_life and not bool(p.all_pools):
			continue
		var on := false
		for b in world.pumps.barges:
			if not b.aground and int(b.body) == id:
				on = true
		if on:
			continue
		var idle: int = world.pumps.idle_barge()
		var can_buy: bool = gs.barges.size() < Balance.BARGE_COSTS.size() and gs.money >= gs.barge_cost()
		if idle < 0 and not can_buy:
			# every barge busy: move the one on the emptiest pool (or the main water) here
			continue
		var at: Vector3 = bay.vertex_pos(bay.deepest_vertex(id))
		at.y = bay.level_of(id)
		var pick: Dictionary = await _tap_world(at)
		await process_frame
		if hud.callout_open() and hud._callout_btn != null and not hud._callout_btn.disabled:
			var n0: int = gs.barges.size()
			hud._callout_btn.pressed.emit()
			await process_frame
			if gs.barges.size() > n0:
				_bought("barge %d" % gs.barges.size())
		hud.close_callout()
		return


func _upgrade_by_pad() -> void:
	## The other way to buy a pump: tap its pad on the beach, press the stamp.
	var pi: int = gs.cheapest_pad()
	if pi < 0 or gs.money < gs.pad_next_cost(pi):
		return
	var t0 := int(gs.pads[pi])
	var pick: Dictionary = await _tap_world(world.pumps.pads[pi].pos + Vector3(0, 1.0, 0))
	await process_frame
	if str(pick.get("kind", "")) != "pad" or int(pick.get("idx", -1)) != pi:
		# something else was nearer the finger (a creature on the beach): fine, once or twice
		var key := "p:%d" % pi
		_tap_tries[key] = int(_tap_tries.get(key, 0)) + 1
		if int(_tap_tries[key]) == 12:
			fail("pad %d can't be tapped: the tap keeps picking %s" % [pi + 1, str(pick.get("kind", "nothing"))])
		hud.close_callout()
		return
	if hud.callout_open() and hud._callout_btn != null and not hud._callout_btn.disabled:
		hud._callout_btn.pressed.emit()
		await process_frame
	hud.close_callout()
	if int(gs.pads[pi]) > t0:
		_bought("pad %d -> %s (from its pad)" % [pi + 1, Balance.pump_def(int(gs.pads[pi])).name])
	elif gs.money >= gs.pad_next_cost(pi):
		fail("tapping pad %d and its stamp didn't buy the %s" % [pi + 1, Balance.pump_def(t0 + 1).name])


func _shop() -> void:
	## Run up the Chandlery flag and buy from the pegboard.
	hud.flag_shop.pressed.emit()
	await process_frame
	await process_frame
	if not hud.shop.visible:
		fail("the Chandlery flag didn't open the chandlery")
		return
	var shop = hud.shop
	var guard := 0
	var max_buys: int = int(p.get("max_buys", 30))
	while guard < max_buys:
		guard += 1
		var spent := false
		var pi: int = gs.cheapest_pad()
		var pump_c: float = gs.pad_next_cost(pi) if pi >= 0 else 0.0
		var cheapest_other := INF
		for u in Balance.UPGRADES:
			var cu: float = gs.upgrade_cost(u.key)
			if cu > 0.0:
				cheapest_other = minf(cheapest_other, cu)
		var pump_first := profile != "casual" or pump_c <= cheapest_other
		if pi >= 0 and gs.money >= pump_c and pump_first:
			var t0 := int(gs.pads[pi])
			if shop.press("buy:pad:%d" % pi) or shop.press("buy:" + "pad:%d" % pi):
				pass
			await process_frame
			if int(gs.pads[pi]) > t0:
				_bought("pad %d -> %s" % [pi + 1, Balance.pump_def(int(gs.pads[pi])).name])
				spent = true
				continue
			fail("the pegboard's stamp for pad %d didn't buy it" % (pi + 1))
			break
		# the cheapest other good, if it doesn't eat too far into the next pump
		var best := ""
		var bc := INF
		for u in Balance.UPGRADES:
			var c: float = gs.upgrade_cost(u.key)
			if c > 0.0 and c < bc:
				bc = c
				best = "up:" + str(u.key)
		for hd in Balance.HELPERS:
			var c: float = gs.helper_cost(hd.key)
			if c > 0.0 and c * 1.4 < bc:
				bc = c * 1.4
				best = "helper:" + str(hd.key)
		if best != "":
			var cost: float = gs.cost_of(best)
			var reserve: float = pump_c * float(p.upgrade_cap) if pump_c > 0.0 else 0.0
			if gs.money - cost >= reserve and gs.money >= cost:
				var l0: float = gs.lifetime_money - gs.money
				var pressed := false
				for _k in 6:
					# a stamp drawn while you were short stays faded until the board redraws
					if shop.press("buy:" + best):
						pressed = true
						break
					await process_frame
				await process_frame
				if gs.lifetime_money - gs.money > l0 + 0.5:
					_bought(best)
					spent = true
					continue
				if pressed:
					fail("the pegboard's stamp for %s didn't buy it" % best)
				break
		if not spent:
			break
	if take_ads:
		await _shop_ads()
	shop.press("back")
	await process_frame
	if hud.shop_open():
		fail("the chandlery's way out didn't close it")
		hud.close_shop()


func _shop_ads() -> void:
	## The harbour office's ad notice: take the 2x when it's off.
	var shop = hud.shop
	if gs.is_boost_active():
		return
	shop.press("office")
	await process_frame
	var a0: int = gs.ads_watched
	if shop.press("ad:boost"):
		_later("the office's 2x stamp started the boost", func(): return gs.ads_watched > a0 and gs.is_boost_active())
	shop.press("board")
	await process_frame


func _handle_callout_offers() -> void:
	## The starter pack, offered once on a tag over the aquarium.
	if not hud.callout_open() or hud._tag == null:
		return
	var labels: Array = hud._tag.find_children("*", "Label", true, false)
	if labels.is_empty() or not str((labels[0] as Label).text).begins_with("Harbour starter"):
		return
	note("starter pack offered")
	if profile == "boosted" and hud._callout_btn != null:
		var l0: float = gs.lifetime_money
		hud._callout_btn.pressed.emit()
		_later("the starter pack paid out and painted the pumps", func(): return gs.owns_starter and gs.lifetime_money > l0 and gs.skin == "flags")
	hud.close_callout()


func _take_offers() -> void:
	if not take_ads:
		return
	if world.offers.current != "" and hud.offer_box.visible and not world.offers.watching:
		var kind: String = world.offers.current
		var before: int = gs.ads_watched
		hud.offer_btn.pressed.emit()
		match kind:
			"cash":
				var l0: float = gs.lifetime_money
				_later("the coins offer paid out", func(): return gs.ads_watched > before and gs.lifetime_money > l0)
			"boost":
				_later("the 2x offer started the boost", func(): return gs.ads_watched > before and gs.is_boost_active())
			"helper_rush":
				_later("the helper-rush offer started the rush", func(): return gs.ads_watched > before and gs.is_helper_rush_active())
			"tickets":
				_later("the double-tickets offer started", func(): return gs.ads_watched > before and gs.is_ticket_rush_active())
	if not gs.is_boost_active() and not hud.shop_open() and gs.boost_can_stack():
		var b0: int = gs.ads_watched
		hud.flag_boost.pressed.emit()
		_later("the 2x flag started the boost", func(): return gs.ads_watched > b0 and gs.is_boost_active())


func _later(what: String, check: Callable) -> void:
	_pending.append([what, check, gs.play_time + 1.0])


func _run_pending() -> void:
	for i in range(_pending.size() - 1, -1, -1):
		var c: Array = _pending[i]
		if gs.play_time >= float(c[2]):
			_expect((c[1] as Callable).call(), str(c[0]))
			_pending.remove_at(i)


func _expect(cond: bool, what: String) -> void:
	if cond:
		if not _ads_checked.has(what):
			print("  ok    %s" % what)
		_ads_checked[what] = true
	else:
		fail(what)


func _bought(what: String) -> void:
	_progress()
	_purchase_log[what] = gs.play_time
	if gs.best_tier() > _tier_seen:
		_tier_seen = gs.best_tier()
		note("first %s" % Balance.pump_def(_tier_seen).name)


func _progress() -> void:
	_last_progress = gs.play_time


func _watch(t: float) -> void:
	var lvl: float = bay.main_level()
	if lvl < _lowest - 0.25:
		_lowest = lvl
		_progress()
	if t - _last_progress > STALL_SECONDS and not gs.has_won:
		fail("progress stalled for %d s (water %.2f m, flow %s, seep %s, cash %s, pads %s)" % [int(t - _last_progress), -lvl,
			Fmt.flow(world.main_flow), Fmt.flow(world.seep_flow), Fmt.num(gs.money), str(gs.pads)])
		_last_progress = t
	var r: int = Balance.ring_of_level(lvl)
	while _ring_seen < r:
		_ring_seen += 1
		_ring_income.append([_ring_seen, gs.aquarium_income()])
		note("reached %s (tickets %s/s)" % [Balance.RINGS[_ring_seen].name, Fmt.num(gs.aquarium_income())])
		_want_reload = true
		if _ring_seen == Balance.RINGS.size() - 1 and profile != "boosted":
			# The aquarium earns while you're away: it mustn't buy the ending on its own.
			var top: Dictionary = Balance.pump_def(Balance.PUMPS.size())
			var mins: float = float(top.cost) / maxf(gs.aquarium_income() * 60.0, 0.001)
			note("idle check: the first %s costs %.1f minutes of aquarium takings" % [str(top.name).to_lower(), mins])
			if gs.best_tier() < Balance.PUMPS.size() and mins < 3.0:
				fail("idle aquarium takings trivialise the end: the top pump is only %.1f minutes of tickets at the lost town" % mins)


# =====================================================================================
# Save and reload: the same game must come back
# =====================================================================================
func _reload_check() -> void:
	## Save, drop the world, load, and compare with what's in the save file
	## (the world saves again as it closes, so the file is the truth).
	if gs.has_won or world.ending_shot != null:
		return
	for _i in 3:
		await process_frame
	hud.close_shop()
	gs.save_game()
	var ts := Engine.time_scale
	world.queue_free()
	await process_frame
	await process_frame
	var saved = JSON.parse_string(FileAccess.get_file_as_string(gs.SAVE_PATH))
	if typeof(saved) != TYPE_DICTIONARY:
		fail("the save file couldn't be read back at %.1f m" % -bay.main_level())
		await _spawn_world()
		return
	gs.reset_state()
	gs.load_game()
	gs.income_mult = float(p.income)
	world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	hud = world.hud
	bay = world.bay
	var bad: Array = []
	if absf(float(saved.money) - float(gs.money)) > 0.01:
		bad.append("money %s vs %s" % [saved.money, gs.money])
	for i in gs.pads.size():
		if int(saved.pads[i]) != int(gs.pads[i]):
			bad.append("pad %d" % i)
	for u in Balance.UPGRADES:
		if int(saved.upgrades.get(u.key, 0)) != int(gs.upgrade_levels[u.key]):
			bad.append("upgrade %s" % u.key)
	for hd in Balance.HELPERS:
		if int(saved.helpers.get(hd.key, 0)) != gs.helper_count(hd.key):
			bad.append("helper %s" % hd.key)
	if (saved.rescued as Dictionary).size() != gs.rescued.size():
		bad.append("rescued %d vs %d" % [(saved.rescued as Dictionary).size(), gs.rescued.size()])
	for f in Balance.FINDS.size():
		if bool(saved.finds[f]) != bool(gs.finds_found[f]):
			bad.append("find %d" % f)
	for w in 3:
		if int(saved.wreck_loads[w]) != int(gs.wreck_loads[w]):
			bad.append("wreck %d loads" % w)
	if (saved.barges as Array).size() != gs.barges.size():
		bad.append("barges")
	var want_bodies := {}
	for e in saved.bay.bodies:
		want_bodies[int(e[0])] = float(e[1])
	var got := {}
	for id in bay.bodies:
		got[int(bay.bodies[id].node)] = float(bay.bodies[id].level)
	if want_bodies.size() != got.size():
		bad.append("%d bodies of water vs %d" % [got.size(), want_bodies.size()])
	else:
		for k in want_bodies:
			if not got.has(k) or absf(float(got[k]) - float(want_bodies[k])) > 0.001:
				bad.append("water in node %d" % k)
	if absf(float(saved.play_time) - float(gs.play_time)) > 0.01:
		bad.append("play time")
	for _i in 3:
		await process_frame
	Engine.time_scale = ts
	_reloads += 1
	if bad.is_empty():
		print("  ok    save and reload at %.1f m brings back the same bay" % -bay.main_level())
	else:
		fail("save and reload at %.1f m changed: %s" % [-bay.main_level(), ", ".join(bad)])


# =====================================================================================
# After the bay is dry: the ending, then everything left to check
# =====================================================================================
func _finish() -> void:
	var guard := 0
	while hud.ending == null and guard < 20 * 40:
		guard += 1
		await process_frame
	if hud.ending == null:
		fail("the ending card never came in")
		return
	var text := ""
	for l in hud.ending.find_children("*", "Label", true, false):
		text += (l as Label).text + "\n"
	_expect(text.contains("creatures rescued") and text.contains("finds salvaged") and text.contains("m of water"), "the ending card shows the run's stats")
	_expect(not hud.staff.visible and hud._floats.is_empty(), "the ending has the screen to itself (no HUD, no floaters)")
	var btns: Array = hud.ending.find_children("*", "BaseButton", true, false)
	if not btns.is_empty():
		btns[0].pressed.emit()
	for _i in 4:
		await process_frame
	_expect(hud.staff.visible and world.rig.camera.current, "back to the bay after the ending")
	if gs.best_tier() < Balance.PUMPS.size() and profile != "casual":
		fail("the bay went dry before any %s was bought (the top tier never mattered)" % Balance.pump_def(Balance.PUMPS.size()).name)
	# What's left in the bay must be reachable: tap up the stragglers.
	Engine.time_scale = TIME_SCALE
	var t_end: float = gs.clock + 240.0
	while gs.clock < t_end:
		await process_frame
		var left: int = world.creatures.stranded_list().size() + world.finds.exposed_list().size()
		if bool(p.all_pools):
			left += bay.pool_ids().size()
		if left == 0:
			break
		if world.ending_shot != null and world.ending_shot.running:
			continue
		await _scan()
	var missing: Array = []
	for i in world.creatures.spots.size():
		if not gs.is_rescued(i):
			missing.append("%s at %s" % [Balance.SPECIES[int(world.creatures.spots[i].species)].name, world.creatures.spots[i].pos.snapped(Vector3.ONE * 0.1)])
	if not missing.is_empty() and profile != "casual":
		fail("creatures never rescued: %s" % ", ".join(missing.slice(0, 6)))
	var fmiss: Array = []
	for f in Balance.FINDS.size():
		if not gs.finds_found[f]:
			fmiss.append(Balance.FINDS[f].name)
	if not fmiss.is_empty() and profile != "casual":
		fail("finds never salvaged: %s" % ", ".join(fmiss))
	if not bay.pool_ids().is_empty() and bool(p.all_pools):
		var names: Array = []
		for id in bay.pool_ids():
			names.append("%s (%.2f m deep)" % [bay.body_name(id), bay.max_depth(id)])
		var bs: Array = []
		for b in world.pumps.barges:
			bs.append("aground" if b.aground else "%s %.2f m" % [bay.body_name(int(b.body)), bay.max_depth(int(b.body)) if bay.bodies.has(int(b.body)) else -1.0])
		fail("pools still holding water at the end: %s; barges: %s" % [", ".join(names), ", ".join(bs)])
	# The shop must still sell everything that's left.
	gs.grant_money(gs.money * 0.0 + 1e9)
	hud.open_shop("board")
	await process_frame
	await process_frame
	for i in gs.pads.size():
		while int(gs.pads[i]) < Balance.PUMPS.size():
			var t0 := int(gs.pads[i])
			if not hud.shop.press("buy:pad:%d" % i):
				fail("pad %d's %s can't be bought" % [i + 1, Balance.pump_def(t0 + 1).name])
				break
			await process_frame
	for u in Balance.UPGRADES:
		if int(gs.upgrade_levels[u.key]) == 0:
			if not hud.shop.press("buy:up:" + str(u.key)):
				fail("the %s upgrade can't be bought" % u.name)
			await process_frame
	for hd in Balance.HELPERS:
		if gs.helper_count(hd.key) == 0:
			if not hud.shop.press("buy:helper:" + str(hd.key)):
				fail("the %s can't be hired" % hd.name)
			await process_frame
	while gs.barges.size() < Balance.BARGE_COSTS.size():
		var n0: int = gs.barges.size()
		hud.shop.press("buy:barge")
		await process_frame
		if gs.barges.size() == n0:
			fail("barge %d can't be bought" % (n0 + 1))
			break
	if profile == "boosted":
		await _check_purchases()
	hud.close_shop()
	await process_frame
	if mon.is_showing_ad():
		fail("an ad screen is stuck open after the chandlery")


func _check_purchases() -> void:
	## Every stubbed purchase in the harbour office goes through and gives what it says.
	var shop = hud.shop
	shop.press("office")
	await process_frame
	for id in [mon.PRODUCT_CASH_SMALL, mon.PRODUCT_CASH_MEDIUM, mon.PRODUCT_CASH_LARGE]:
		var pk: String = mon.PRODUCTS[id].pack
		var amt: float = gs.cash_pack_amount(pk)
		var before: float = gs.money
		if shop.press("iap:" + id):
			for _i in 3:
				await process_frame
			_expect(gs.money >= before + amt * 0.99, "the %s cash pack paid %s" % [pk, Fmt.num(amt)])
		else:
			fail("the %s cash pack's stamp didn't work" % pk)
	if not gs.owns_brass:
		shop.press("iap:" + mon.PRODUCT_BRASS)
		for _i in 3:
			await process_frame
	_expect(gs.owns_brass and gs.skin == "brass", "the brass pumps were bought and fitted")
	if not gs.owns_remove_ads:
		shop.press("iap:" + mon.PRODUCT_REMOVE_ADS_2X)
		for _i in 3:
			await process_frame
	_expect(gs.owns_remove_ads and not mon.interstitial_allowed(), "no ads + permanent 2x bought: no more ad breaks")
	var owned := [gs.owns_remove_ads, gs.owns_brass, gs.owns_starter]
	shop.press("restore")
	for _i in 3:
		await process_frame
	_expect([gs.owns_remove_ads, gs.owns_brass, gs.owns_starter] == owned, "restore purchases keeps what's owned")
	_expect(gs.purchases_made >= 5, "every purchase was counted (%d)" % gs.purchases_made)


func _report() -> void:
	var real := (Time.get_ticks_msec() - _start_ms) / 1000.0
	print("")
	print("Pacing, %s%s (game time):" % [profile, " with ads" if take_ads else ""])
	for e in pacing:
		print("  %s  %s" % [_clock(float(e[0])), e[1]])
	var pads_bought := 0
	for k in _purchase_log:
		if str(k).begins_with("pad"):
			pads_bought += 1
	print("Pump purchases %d · upgrades %s · helpers %s · barges %d · rescued %d of %d · finds %d of %d · ads %d · purchases %d · interstitials %d · reloads %d" % [
		pads_bought, gs.upgrade_levels, gs.helper_counts, gs.barges.size(), gs.rescued.size(), world.creatures.spots.size(), gs.finds_count(),
		Balance.FINDS.size(), gs.ads_watched, gs.purchases_made, mon.interstitials_shown, _reloads])
	var ring_line := "Aquarium takings at each ring:"
	for r in _ring_income:
		ring_line += "  %s %s/s" % [Balance.RINGS[int(r[0])].name, Fmt.num(float(r[1]))]
	print(ring_line)
	if _capped:
		print("Real time %.0f s for %s of play (capped run: only the per-moment checks apply)" % [real, _clock(gs.play_time)])
		return
	if not take_ads and gs.play_time > 600.0:
		if mon.interstitials_shown < 1:
			fail("no interstitial ever showed at a break in %s of play" % _clock(gs.play_time))
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
	_shots.append([path, _clock(gs.play_time), -bay.main_level()])


func _contact_sheet() -> void:
	if _shots.is_empty():
		return
	var first := Image.load_from_file(_shots[0][0])
	var tw := 320
	var th := int(float(first.get_height()) / float(first.get_width()) * tw)
	var cols := 6
	var rows := int(ceil(_shots.size() / float(cols)))
	var sheet := Image.create(cols * tw, rows * th, false, Image.FORMAT_RGB8)
	sheet.fill(Color(0.06, 0.12, 0.14))
	for i in _shots.size():
		var im := Image.load_from_file(_shots[i][0])
		im.convert(Image.FORMAT_RGB8)
		im.resize(tw, th, Image.INTERPOLATE_BILINEAR)
		sheet.blit_rect(im, Rect2i(0, 0, tw, th), Vector2i((i % cols) * tw, (i / cols) * th))
	sheet.save_png("%s/contact_sheet.png" % _shots_dir)
	var lines: Array = []
	for s in _shots:
		lines.append("%s  %s  %.1f m" % [s[0].get_file(), s[1], s[2]])
	var f := FileAccess.open("%s/index.txt" % _shots_dir, FileAccess.WRITE)
	f.store_string("\n".join(lines))
	print("visual run: %d shots, contact sheet %s/contact_sheet.png" % [_shots.size(), _shots_dir])
