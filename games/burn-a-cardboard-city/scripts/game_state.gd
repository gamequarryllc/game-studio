extends Node
## Autoload "GameState": coins, tools, upgrades, helpers, purchases, stats, finds,
## and saving. The city itself lives in a CityGrid (`city`); its state is saved
## through here as one character per structure.
##
## Game actions are plain calls so tests, the dev menu and a playthrough bot can
## drive them: buy("tool:candle"), buy("upgrade:dry"), buy("helper:windup"),
## and the world's ignite_at() / move_giant_to().

signal changed                       # anything changed; the HUD and the shop refresh
signal tool_bought(index: int)
signal won

const SAVE_FILE := "user://city_save.json"
var SAVE_PATH := SAVE_FILE           # tests running side by side each get their own (CITY_SAVE=name)
const SAVE_VERSION := 2
const AUTOSAVE_INTERVAL := 10.0
const INCOME_BUCKET := 5.0
const INCOME_BUCKETS := 48           # 4 minutes of history

# --- Saved -------------------------------------------------------------------------
var coins: float = 0.0
var lifetime_coins: float = 0.0
var tool_index: int = 0
var upgrade_levels: Dictionary = {}
var helper_counts: Array = []
var boost_until: float = 0.0          # unix time: 2x fire until then
var helper_rush_until: float = 0.0
var instant_ready_at: float = 0.0
var owns_remove_ads_2x := false
var owns_starter := false
var owns_golden := false
var golden_on := false                # the Golden lens is switched on
var party_on := false                 # the starter pack's party sparks
var starter_offered := false
var play_time: float = 0.0
var has_won := false
var collapses := 0
var best_chain := 0
var citizens_saved := 0
var finds: Dictionary = {}            # find key -> how many
var tutorial_step := 0
var giant_pos := Vector3.INF
var giant_yaw := 0.0
var giant_pitch := -0.6
var city_save := ""
var water_save := ""
var packs_bought := 0
var clock: float = 0.0                # seconds of play: boosts and cooldowns run on this
var finds_since_golden := 0
var out_of_fuel := false              # nothing left your tool can light (set by the world): clearance prices

# --- Runtime -----------------------------------------------------------------------
var city: CityGrid                    # set by the world
var giant: Node3D
var dev_income := 1.0                 # dev menu: income x10 / x100
var dev_gates_open := false           # dev menu: every district open
var dev_forced := false               # tests only: developer tools on without the playtest feature (never saved)
var _autosave_t := 0.0
var _income: Array = []
var _income_t := 0.0


func _ready() -> void:
	var tag := OS.get_environment("CITY_SAVE")
	if tag != "":
		SAVE_PATH = "user://city_save_%s.json" % tag.validate_filename()
	reset_state()
	load_game()


func reset_state(keep_purchases: bool = false) -> void:
	var keep := [owns_remove_ads_2x, owns_starter, owns_golden]
	coins = 0.0
	lifetime_coins = 0.0
	tool_index = 0
	upgrade_levels = {}
	for u in Balance.UPGRADES:
		upgrade_levels[u.key] = 0
	helper_counts = []
	for _h in Balance.HELPERS:
		helper_counts.append(0)
	boost_until = 0.0
	helper_rush_until = 0.0
	instant_ready_at = 0.0
	owns_remove_ads_2x = keep[0] if keep_purchases else false
	owns_starter = keep[1] if keep_purchases else false
	owns_golden = keep[2] if keep_purchases else false
	golden_on = golden_on and owns_golden
	party_on = party_on and owns_starter
	starter_offered = owns_starter
	play_time = 0.0
	has_won = false
	collapses = 0
	best_chain = 0
	citizens_saved = 0
	finds = {}
	tutorial_step = 0
	giant_pos = Vector3.INF
	giant_yaw = 0.0
	giant_pitch = -0.6
	city_save = ""
	water_save = ""
	packs_bought = 0
	clock = 0.0
	finds_since_golden = 0
	dev_gates_open = false
	_income = []


func now() -> float:
	## The game's clock: seconds of play. Boosts ("2x for 5 minutes") and cooldowns run
	## on it, so they last the play time they promise (and sped-up test runs stay honest).
	return clock


func _process(delta: float) -> void:
	var d := minf(delta, 1.0 * maxf(1.0, Engine.time_scale))
	clock += d
	if not has_won:
		play_time += d
	_income_t += d
	if _income.is_empty() or _income_t >= INCOME_BUCKET:
		_income_t = 0.0
		_income.append(0.0)
		if _income.size() > INCOME_BUCKETS:
			_income.pop_front()
	_autosave_t += delta
	if _autosave_t >= AUTOSAVE_INTERVAL:
		_autosave_t = 0.0
		save_game()
	_watch_web_hidden(d)


# =====================================================================================
# Numbers
# =====================================================================================
func upgrade_def(key: String) -> Dictionary:
	for u in Balance.UPGRADES:
		if u.key == key:
			return u
	return {}


func upgrade_mult(key: String) -> float:
	var u := upgrade_def(key)
	return 1.0 + float(u.get("per_level", 0.0)) * float(upgrade_levels.get(key, 0))


func is_boost_active() -> bool:
	return now() < boost_until


func boost_seconds_left() -> float:
	return maxf(0.0, boost_until - now())


func is_helper_rush_active() -> bool:
	return now() < helper_rush_until


func helper_rush_seconds_left() -> float:
	return maxf(0.0, helper_rush_until - now())


func global_mult() -> float:
	## The 2x boost and the permanent 2x stack.
	var m := 1.0
	if is_boost_active():
		m *= Balance.BOOST_MULT
	if owns_remove_ads_2x:
		m *= Balance.PERMANENT_MULT
	return m


func coin_mult() -> float:
	return upgrade_mult("coins") * global_mult() * dev_income


func tool_def(i: int = -1) -> Dictionary:
	return Balance.TOOLS[tool_index if i < 0 else i]


func tool_power(i: int = -1) -> float:
	var p := float(tool_def(i).power) * upgrade_mult("heat")
	if is_boost_active():
		p *= Balance.BOOST_MULT
	if golden_on:
		p *= Balance.GOLDEN_LENS_POWER
	return p


func tool_radius() -> float:
	return float(tool_def().radius)


func tool_range() -> float:
	return float(tool_def().range)


func spread_mult() -> float:
	return upgrade_mult("dry")


func burn_mult() -> float:
	## Cheap glue: buildings fall sooner.
	return maxf(0.4, 1.0 - 0.06 * float(upgrade_levels.get("glue", 0)))


func move_speed() -> float:
	return Balance.WALK_SPEED * upgrade_mult("boots")


func helper_power(i: int) -> float:
	## What one visible helper of type i burns with (past the visible cap they just burn hotter).
	var count := int(helper_counts[i])
	var shown := mini(count, Balance.MAX_VISIBLE_HELPERS)
	var p := float(Balance.HELPERS[i].power) * upgrade_mult("heat") * float(count) / float(maxi(1, shown))
	if is_helper_rush_active():
		p *= Balance.HELPER_RUSH_MULT
	if is_boost_active():
		p *= Balance.BOOST_MULT
	return p


func has_helpers() -> bool:
	for c in helper_counts:
		if int(c) > 0:
			return true
	return false


func income_per_minute() -> float:
	if _income.is_empty():
		return 0.0
	var total := 0.0
	for v in _income:
		total += float(v)
	var span := INCOME_BUCKET * float(_income.size() - 1) + maxf(_income_t, 1.0)
	return total / span * 60.0


func income_per_second_now() -> float:
	if _income.is_empty():
		return 0.0
	var n := mini(_income.size(), 3)
	var total := 0.0
	for k in n:
		total += float(_income[_income.size() - 1 - k])
	var span := INCOME_BUCKET * float(n - 1) + maxf(_income_t, 1.0)
	return total / span


func instant_amount() -> float:
	## Free coins: a few minutes of recent income, capped by what the next tool costs.
	var amount := maxf(Balance.INSTANT_MIN, income_per_minute() * Balance.INSTANT_MINUTES)
	var nt := next_tool_index()
	if nt >= 0:
		amount = minf(amount, maxf(Balance.INSTANT_MIN, tool_cost(nt) * 0.6))
	return floorf(amount)


func find_amount(golden: bool, worth: float = -1.0) -> float:
	## A find pays a little of your recent income, but never more than a few times what
	## the building it fell out of was worth.
	var cap := INF if worth < 0.0 else worth * coin_mult() * (6.0 if golden else 1.5)
	if golden:
		return floorf(maxf(Balance.GOLDEN_MIN, minf(income_per_minute() * Balance.GOLDEN_MINUTES, cap)))
	return floorf(maxf(Balance.FIND_MIN, minf(income_per_minute() * Balance.FIND_MINUTES, cap)))


# =====================================================================================
# Earning
# =====================================================================================
func earn(raw: float) -> float:
	if raw <= 0.0:
		return 0.0
	var v := raw * coin_mult()
	coins += v
	lifetime_coins += v
	_note_income(v)
	return v


func grant_coins(amount: float, counts_as_income: bool = false) -> void:
	coins += amount
	lifetime_coins += amount
	if counts_as_income:
		_note_income(amount)
	changed.emit()


func _note_income(v: float) -> void:
	if _income.is_empty():
		_income.append(0.0)
	_income[_income.size() - 1] = float(_income[_income.size() - 1]) + v


# =====================================================================================
# The shop
# =====================================================================================
func next_tool_index() -> int:
	return tool_index + 1 if tool_index + 1 < Balance.TOOLS.size() else -1


func tool_cost(i: int) -> float:
	## What a tool costs. If there's nothing left that your tool can light and you can't
	## afford the next one, it goes on clearance for what you've got (no dead ends).
	var cost := float(Balance.TOOLS[i].cost)
	if i == next_tool_index() and out_of_fuel and coins < cost and tool_gate_open(i):
		return floorf(maxf(coins, 0.0))
	return cost


func on_clearance(i: int) -> bool:
	return tool_cost(i) < float(Balance.TOOLS[i].cost)


func tool_gate_open(i: int) -> bool:
	## A tool goes on sale once enough of the district before it has come down.
	if i <= 0 or i >= Balance.TOOLS.size() or dev_gates_open or city == null:
		return true
	return city.zone_progress(i - 1) >= float(Balance.TOOL_GATE[i]) - 0.0001


func tool_gate_text(i: int) -> String:
	if i < 0 or tool_gate_open(i):
		return ""
	var z: String = str(Balance.ZONES[i - 1].name).to_lower()
	return "On sale once %d%% of %s is down (%d%% so far)" % [int(round(float(Balance.TOOL_GATE[i]) * 100.0)), z,
		int(floor(city.zone_progress(i - 1) * 100.0))]


func buy_tool(i: int) -> bool:
	if i != next_tool_index() or not tool_gate_open(i):
		return false
	var cost := tool_cost(i)
	if coins < cost:
		return false
	coins -= cost
	tool_index = i
	tool_bought.emit(i)
	changed.emit()
	return true


func upgrade_maxed(key: String) -> bool:
	return int(upgrade_levels[key]) >= int(upgrade_def(key).max)


func upgrade_cost(key: String) -> float:
	var u := upgrade_def(key)
	return floorf(float(u.base) * pow(float(u.growth), float(upgrade_levels[key])))


func buy_upgrade(key: String) -> bool:
	if not upgrade_levels.has(key) or upgrade_maxed(key):
		return false
	var cost := upgrade_cost(key)
	if coins < cost:
		return false
	coins -= cost
	upgrade_levels[key] = int(upgrade_levels[key]) + 1
	changed.emit()
	return true


func helper_cost(i: int) -> float:
	return floorf(float(Balance.HELPERS[i].base) * pow(Balance.HELPER_GROWTH, float(helper_counts[i])))


func buy_helper(i: int) -> bool:
	var cost := helper_cost(i)
	if coins < cost:
		return false
	coins -= cost
	helper_counts[i] = int(helper_counts[i]) + 1
	changed.emit()
	return true


func buy(item: String) -> bool:
	## Buy anything in the shop by id: "tool:candle", "upgrade:dry", "helper:windup".
	var parts := item.split(":")
	if parts.size() != 2:
		return false
	match parts[0]:
		"tool":
			for i in Balance.TOOLS.size():
				if Balance.TOOLS[i].key == parts[1]:
					return buy_tool(i)
		"upgrade":
			return buy_upgrade(parts[1])
		"helper":
			for i in Balance.HELPERS.size():
				if Balance.HELPERS[i].key == parts[1]:
					return buy_helper(i)
	return false


func start_boost() -> void:
	var base := maxf(now(), boost_until)
	boost_until = minf(base + Balance.BOOST_DURATION, now() + Balance.BOOST_MAX)
	changed.emit()


func boost_full() -> bool:
	return boost_seconds_left() > Balance.BOOST_MAX - Balance.BOOST_DURATION + 1.0


func instant_ready() -> bool:
	return now() >= instant_ready_at


func grant_ad_reward(kind: String) -> String:
	## A rewarded ad finished: hand out `kind` (Balance.AD_REWARDS) and say what you got.
	match kind:
		"instant":
			var amount := instant_amount()
			grant_coins(amount)
			instant_ready_at = now() + Balance.INSTANT_COOLDOWN
			save_game()
			return "+%s coins" % Fmt.num(amount)
		"boost":
			start_boost()
			save_game()
			return "Fire burns twice as hot for %s" % Fmt.duration(boost_seconds_left())
		"helper_rush":
			helper_rush_until = maxf(now(), helper_rush_until) + Balance.HELPER_RUSH_DURATION
			changed.emit()
			return "Helpers are working three times as hard"
	return ""


func coin_pack_amount(pack: int) -> float:
	var p: Dictionary = Balance.COIN_PACKS[pack]
	var nt := next_tool_index()
	var cost := float(Balance.TOOLS[nt].cost) if nt >= 0 else maxf(100.0, income_per_minute() * 10.0)
	return floorf(maxf(float(p.min), cost * float(p.share)))


func short_for_next_tool() -> bool:
	var nt := next_tool_index()
	return nt >= 0 and coins < tool_cost(nt) and tool_gate_open(nt)


func note_find(key: String) -> void:
	finds[key] = int(finds.get(key, 0)) + 1


func check_win() -> void:
	if has_won or city == null or city.keep_id < 0:
		return
	if city.s_state[city.keep_id] == CityGrid.RUBBLE:
		has_won = true
		save_game()
		won.emit()
		changed.emit()


# =====================================================================================
# Developer boosts (playtest builds only)
# =====================================================================================
func dev_enabled() -> bool:
	## Developer tools exist only in playtest builds (the `playtest` feature: the
	## web play links and the iOS playtest flavor). Never in a store build, an
	## editor run or a screenshot. Tests switch them on with dev_forced.
	return OS.has_feature("playtest") or dev_forced


func dev_unlock_everything() -> void:
	dev_gates_open = true
	tool_index = Balance.TOOLS.size() - 1
	for u in Balance.UPGRADES:
		upgrade_levels[u.key] = mini(int(u.max), 5)
	for i in helper_counts.size():
		helper_counts[i] = maxi(int(helper_counts[i]), 3)
	tool_bought.emit(tool_index)
	changed.emit()


# =====================================================================================
# Backgrounding
# =====================================================================================
var _web_t := 0.0
var _web_hidden := false


func _watch_web_hidden(d: float) -> void:
	## In a phone browser, switching apps hides the tab: save right away.
	if not OS.has_feature("web"):
		return
	_web_t -= d
	if _web_t > 0.0:
		return
	_web_t = 0.5
	var hidden: bool = JavaScriptBridge.eval("document.hidden", true) == true
	if hidden and not _web_hidden:
		save_game()
	_web_hidden = hidden


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_WM_CLOSE_REQUEST, \
				NOTIFICATION_WM_WINDOW_FOCUS_OUT:
			save_game()


# =====================================================================================
# Save / load
# =====================================================================================
func to_dict() -> Dictionary:
	if city != null:
		city_save = city.to_save_string()
		water_save = city.water_string()
	if giant != null and is_instance_valid(giant):
		giant_pos = giant.position
		giant_yaw = giant.yaw
		giant_pitch = giant.pitch
	return {
		"version": SAVE_VERSION,
		"coins": coins,
		"lifetime_coins": lifetime_coins,
		"tool_index": tool_index,
		"upgrade_levels": upgrade_levels,
		"helper_counts": helper_counts,
		"boost_until": boost_until,
		"helper_rush_until": helper_rush_until,
		"instant_ready_at": instant_ready_at,
		"owns_remove_ads_2x": owns_remove_ads_2x,
		"owns_starter": owns_starter,
		"owns_golden": owns_golden,
		"golden_on": golden_on,
		"party_on": party_on,
		"starter_offered": starter_offered,
		"play_time": play_time,
		"has_won": has_won,
		"collapses": collapses,
		"best_chain": best_chain,
		"citizens_saved": citizens_saved,
		"finds": finds,
		"tutorial_step": tutorial_step,
		"giant_pos": [giant_pos.x, giant_pos.y, giant_pos.z] if giant_pos.is_finite() else [],
		"giant_yaw": giant_yaw,
		"giant_pitch": giant_pitch,
		"city": city_save,
		"water": water_save,
		"packs_bought": packs_bought,
		"clock": clock,
		"finds_since_golden": finds_since_golden,
	}


func save_game() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_warning("Could not save: %s" % FileAccess.get_open_error())
		return
	f.store_string(JSON.stringify(to_dict()))


func load_game() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var data = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if typeof(data) != TYPE_DICTIONARY:
		push_warning("Save file unreadable, starting fresh.")
		return
	from_dict(data)


func from_dict(data: Dictionary) -> void:
	owns_remove_ads_2x = bool(data.get("owns_remove_ads_2x", false))
	owns_starter = bool(data.get("owns_starter", false))
	owns_golden = bool(data.get("owns_golden", false))
	golden_on = bool(data.get("golden_on", false)) and owns_golden
	party_on = bool(data.get("party_on", false)) and owns_starter
	if int(data.get("version", 0)) != SAVE_VERSION:
		return   # an older city: start fresh, keep purchases
	coins = float(data.get("coins", 0.0))
	lifetime_coins = float(data.get("lifetime_coins", 0.0))
	tool_index = clampi(int(data.get("tool_index", 0)), 0, Balance.TOOLS.size() - 1)
	var ul: Dictionary = data.get("upgrade_levels", {})
	for u in Balance.UPGRADES:
		upgrade_levels[u.key] = clampi(int(ul.get(u.key, 0)), 0, int(u.max))
	var hc: Array = data.get("helper_counts", [])
	for i in helper_counts.size():
		helper_counts[i] = int(hc[i]) if i < hc.size() else 0
	boost_until = float(data.get("boost_until", 0.0))
	helper_rush_until = float(data.get("helper_rush_until", 0.0))
	instant_ready_at = float(data.get("instant_ready_at", 0.0))
	starter_offered = bool(data.get("starter_offered", false))
	play_time = float(data.get("play_time", 0.0))
	has_won = bool(data.get("has_won", false))
	collapses = int(data.get("collapses", 0))
	best_chain = int(data.get("best_chain", 0))
	citizens_saved = int(data.get("citizens_saved", 0))
	var f: Dictionary = data.get("finds", {})
	finds = {}
	for k in f:
		finds[str(k)] = int(f[k])
	tutorial_step = int(data.get("tutorial_step", 0))
	var gp: Array = data.get("giant_pos", [])
	giant_pos = Vector3(float(gp[0]), float(gp[1]), float(gp[2])) if gp.size() == 3 else Vector3.INF
	giant_yaw = float(data.get("giant_yaw", 0.0))
	giant_pitch = float(data.get("giant_pitch", -0.6))
	city_save = str(data.get("city", ""))
	water_save = str(data.get("water", ""))
	packs_bought = int(data.get("packs_bought", 0))
	clock = float(data.get("clock", play_time))
	finds_since_golden = int(data.get("finds_since_golden", 0))


func wipe_save(keep_purchases: bool = true) -> void:
	## A fresh city (keeps purchases unless told otherwise). The world rebuilds itself.
	reset_state(keep_purchases)
	city = null
	giant = null
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(to_dict()))
	changed.emit()
