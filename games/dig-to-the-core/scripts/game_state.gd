extends Node
## Autoload "GameState": money, tools, upgrades, helpers, finds, how deep
## you've been, purchases, and saving. The rock itself lives in the DigField;
## its zones are saved through here.

signal changed                                  # anything changed; the UI refreshes
signal found_item(find: int, value: float)
signal won

# Tests and bots can run side by side, each on its own save: DIG_SAVE=<name>
# in the environment picks user://dig_save_<name>.json (playtest builds only).
var SAVE_PATH := "user://dig_save.json"
const SAVE_VERSION := 1
const AUTOSAVE_INTERVAL := 10.0
const INCOME_BUCKET := 15.0
const INCOME_BUCKETS := 16             # 4 minutes of history

# --- Saved -----------------------------------------------------------------------------
var money := 0.0
var lifetime_money := 0.0
var tool_index := 0
var upgrade_levels := {}               # key -> level
var helper_counts: Array = []          # per helper type
var found: Array = []                  # per find: dug out yet?
var deepest := 0.0                     # metres: the deepest you've stood
var lift_stop := Vector3.INF           # the lift's bottom stop: the lamp post (INF = none yet)
var lift_spot := Vector3.INF           # where the lift sets you down, next to the post
var dug_volume := 0.0                  # m³ dug, all zones
var ore_points := 0                    # bits of ore dug
var clock := 0.0                       # game seconds played (boosts run on this, so they only tick while you play)
var boost_until := 0.0                 # rewarded ad: 2x digging until then (on `clock`)
var helper_rush_until := 0.0
var owns_remove_ads := false           # IAP: no ads + permanent 2x
var owns_golden := false               # IAP: golden tools (cosmetic, +10%)
var owns_starter := false              # IAP: starter pack (cash + crystal tools)
var skin := ""                         # "", "golden" or "crystal"
var starter_offered := false
var play_time := 0.0
var has_won := false
var won_time := 0.0
var player_pos := Vector3.INF          # INF = start at the spawn point
var player_yaw := 0.0
var player_pitch := -0.2
var zone_saves: Array = []             # DigField packed zones ("" = untouched)
var tutorial_step := 0                 # first-run hints (World._update_coach)
var ads_watched := 0                   # playtest stats (dev menu)
var purchases_made := 0

# --- Runtime only ---------------------------------------------------------------------------
var field: DigField
var player: Node3D
var debug_speed := 1.0                 # dev: digging speed multiplier
var income_mult := 1.0                 # dev: income x10 / x100 (playtest builds)
var _autosave_t := 0.0
var _income: Array = []
var _income_t := 0.0


func _ready() -> void:
	var slot := OS.get_environment("DIG_SAVE")
	if slot != "" and slot.is_valid_identifier() and (OS.has_feature("playtest") or OS.has_feature("editor") or not OS.has_feature("template")):
		SAVE_PATH = "user://dig_save_%s.json" % slot
	reset_state()
	load_game()


func reset_state(keep_purchases: bool = false) -> void:
	var keep := [owns_remove_ads, owns_golden, owns_starter, skin]
	money = 0.0
	lifetime_money = 0.0
	tool_index = 0
	upgrade_levels = {}
	for u in Balance.UPGRADES:
		upgrade_levels[u.key] = 0
	helper_counts = []
	for _h in Balance.HELPERS:
		helper_counts.append(0)
	found = []
	for _f in Balance.FINDS:
		found.append(false)
	deepest = 0.0
	lift_stop = Vector3.INF
	lift_spot = Vector3.INF
	dug_volume = 0.0
	ore_points = 0
	clock = 0.0
	boost_until = 0.0
	helper_rush_until = 0.0
	owns_remove_ads = keep[0] if keep_purchases else false
	owns_golden = keep[1] if keep_purchases else false
	owns_starter = keep[2] if keep_purchases else false
	skin = keep[3] if keep_purchases else ""
	starter_offered = owns_starter
	play_time = 0.0
	has_won = false
	won_time = 0.0
	player_pos = Vector3.INF
	player_yaw = 0.0
	player_pitch = -0.2
	zone_saves = []
	tutorial_step = 0
	ads_watched = 0
	purchases_made = 0
	_income = []


func now() -> float:
	## The game clock: boosts count down while you play, at the game's speed
	## (the dev time scale and the playthrough bot speed them up too).
	return clock


func _process(delta: float) -> void:
	# Long hitches (loading, a background tab) don't count as play.
	var dt := minf(delta, 0.25 * maxf(1.0, Engine.time_scale))
	clock += dt
	if not has_won:
		play_time += dt
	_income_t += dt
	if _income.is_empty() or _income_t >= INCOME_BUCKET:
		_income_t = 0.0
		_income.append(0.0)
		if _income.size() > INCOME_BUCKETS:
			_income.pop_front()
	_autosave_t += delta
	if _autosave_t >= AUTOSAVE_INTERVAL:
		_autosave_t = 0.0
		save_game()


# --- Numbers derived from what you own ---------------------------------------------------------
func upgrade_def(key: String) -> Dictionary:
	for u in Balance.UPGRADES:
		if u.key == key:
			return u
	return {}


func upgrade_mult(key: String) -> float:
	var u := upgrade_def(key)
	return 1.0 + float(u.per_level) * float(upgrade_levels.get(key, 0))


func speed_mult() -> float:
	## Everything that makes digging faster for a while or for good.
	var m := 1.0
	if is_boost_active():
		m *= Balance.BOOST_MULT
	if owns_remove_ads:
		m *= Balance.PERMANENT_MULT
	return m * debug_speed


func tool_def() -> Dictionary:
	return Balance.TOOLS[tool_index]


func tool_damage() -> float:
	## Per strike. The boost makes you strike faster instead (see tool_rate).
	var d := float(tool_def().damage) * upgrade_mult("power")
	if skin == "golden":
		d *= Balance.GOLDEN_BONUS
	return d


func tool_rate() -> float:
	return float(tool_def().rate) * speed_mult()


func tool_radius() -> float:
	return float(tool_def().radius) * upgrade_mult("size")


func tool_reach() -> float:
	return float(tool_def().reach) * (1.0 + 0.5 * (upgrade_mult("size") - 1.0))


func lamp_range() -> float:
	return Balance.HEADLAMP_RANGE * upgrade_mult("lamp")


func ore_mult() -> float:
	return upgrade_mult("ore")


func dps() -> float:
	return tool_damage() * tool_rate()


func helper_each(i: int) -> float:
	var m := Balance.HELPER_RUSH_MULT if is_helper_rush_active() else 1.0
	return float(Balance.HELPERS[i].power) * speed_mult() * m


func helper_power(i: int) -> float:
	return helper_each(i) * float(helper_counts[i])


func total_helper_power() -> float:
	var p := 0.0
	for i in Balance.HELPERS.size():
		p += helper_power(i)
	return p


func has_helpers() -> bool:
	for c in helper_counts:
		if int(c) > 0:
			return true
	return false


func is_boost_active() -> bool:
	return now() < boost_until


func boost_seconds_left() -> float:
	return maxf(0.0, boost_until - now())


func is_helper_rush_active() -> bool:
	return now() < helper_rush_until


func helper_rush_seconds_left() -> float:
	return maxf(0.0, helper_rush_until - now())


func income_per_minute() -> float:
	if _income.is_empty():
		return 0.0
	var total := 0.0
	for v in _income:
		total += float(v)
	var span := INCOME_BUCKET * float(_income.size() - 1) + maxf(_income_t, 1.0)
	return total / span * 60.0


func depth_now() -> float:
	return maxf(0.0, -player.position.y) if player != null else 0.0


func zone_now() -> int:
	return clampi(int(floor(depth_now() / Balance.ZONE_DEPTH)), 0, Balance.zone_count() - 1)


func deepest_zone() -> int:
	return clampi(int(floor(deepest / Balance.ZONE_DEPTH)), 0, Balance.zone_count() - 1)


# --- Earning -----------------------------------------------------------------------------------
func on_dug(r: Dictionary) -> float:
	## The DigField says what a strike dug out; this pays for it.
	var v := (float(r.value) + float(r.ore_value) * ore_mult()) * income_mult
	dug_volume += float(r.volume)
	ore_points += int(r.ore_points)
	_earn(v)
	return v


func _earn(v: float, counts_as_income: bool = true) -> void:
	money += v
	lifetime_money += v
	if counts_as_income:
		if _income.is_empty():
			_income.append(0.0)
		_income[_income.size() - 1] = float(_income[_income.size() - 1]) + v
	changed.emit()


func grant_money(amount: float, counts_as_income: bool = false) -> void:
	_earn(amount, counts_as_income)


func find_value(f: int) -> float:
	return float(Balance.FINDS[f].value) * ore_mult()


func discover(f: int) -> float:
	## A find came out of the rock. Returns what it paid.
	if found[f]:
		return 0.0
	found[f] = true
	var v := find_value(f)
	_earn(v)
	found_item.emit(f, v)
	if Balance.FINDS[f].get("core", false) and not has_won:
		has_won = true
		won_time = play_time
		save_game()
		won.emit()
	return v


func finds_count() -> int:
	var n := 0
	for f in found:
		if f:
			n += 1
	return n


func note_depth(d: float) -> bool:
	## The player is standing at depth d. True when that's a new record.
	if d > deepest + 0.05:
		deepest = d
		return true
	return false


# --- Shop ----------------------------------------------------------------------------------------
func next_tool_index() -> int:
	return tool_index + 1 if tool_index + 1 < Balance.TOOLS.size() else -1


func next_tool_cost() -> float:
	var i := next_tool_index()
	return float(Balance.TOOLS[i].cost) if i >= 0 else 0.0


func buy_tool(i: int) -> bool:
	if i != next_tool_index():
		return false
	var cost: float = Balance.TOOLS[i].cost
	if money < cost:
		return false
	money -= cost
	tool_index = i
	changed.emit()
	return true


func upgrade_maxed(key: String) -> bool:
	return int(upgrade_levels[key]) >= int(upgrade_def(key).max)


func upgrade_cost(key: String) -> float:
	var u := upgrade_def(key)
	return float(u.base) * pow(float(u.growth), float(upgrade_levels[key]))


func buy_upgrade(key: String) -> bool:
	if upgrade_maxed(key):
		return false
	var cost := upgrade_cost(key)
	if money < cost:
		return false
	money -= cost
	upgrade_levels[key] = int(upgrade_levels[key]) + 1
	changed.emit()
	return true


func helper_cost(i: int) -> float:
	return float(Balance.HELPERS[i].base) * pow(Balance.HELPER_GROWTH, float(helper_counts[i]))


func buy_helper(i: int) -> bool:
	var cost := helper_cost(i)
	if money < cost:
		return false
	money -= cost
	helper_counts[i] = int(helper_counts[i]) + 1
	changed.emit()
	return true


func buy(id: String) -> bool:
	## Buy anything by id, the way the shop does: a tool's icon name ("pickaxe"),
	## an upgrade key ("power"), or a helper key ("mole"). For bots and tests.
	for i in Balance.TOOLS.size():
		if str(Balance.TOOLS[i].icon) == id or str(Balance.TOOLS[i].name).to_lower() == id:
			return buy_tool(i)
	for u in Balance.UPGRADES:
		if u.key == id:
			return buy_upgrade(id)
	for i in Balance.HELPERS.size():
		if Balance.HELPERS[i].key == id:
			return buy_helper(i)
	push_warning("buy: no item called '%s'" % id)
	return false


func unlock_everything() -> void:
	## Dev: every tool, every upgrade maxed, and plenty of cash.
	tool_index = Balance.TOOLS.size() - 1
	for u in Balance.UPGRADES:
		upgrade_levels[u.key] = int(u.max)
	money += 1e9
	changed.emit()


# --- Ads and purchases -------------------------------------------------------------------------------
func start_boost() -> void:
	## A rewarded ad: 2x digging for 5 min, stacking to 15.
	var base := maxf(now(), boost_until)
	boost_until = minf(base + Balance.BOOST_DURATION, now() + Balance.BOOST_STACK_MAX)
	changed.emit()


func boost_can_stack() -> bool:
	return boost_seconds_left() < Balance.BOOST_STACK_MAX - 30.0


func instant_cash_amount() -> float:
	## A few minutes of your recent income, capped so it never buys a whole tool.
	var a := maxf(Balance.CASH_MIN, income_per_minute() * Balance.CASH_MINUTES)
	var next := next_tool_cost()
	if next > 0.0:
		a = minf(a, maxf(Balance.CASH_MIN, next * Balance.CASH_MAX_FRACTION_OF_NEXT))
	return a


func cash_pack_amount(size: String) -> float:
	var p: Dictionary = Balance.CASH_PACKS[size]
	var next := next_tool_cost()
	if next <= 0.0:
		next = maxf(income_per_minute() * 20.0, 1e6)
	return maxf(float(p.min), next * float(p.fraction))


func starter_cash() -> float:
	return maxf(Balance.STARTER_PACK_CASH, next_tool_cost() * 0.5)


func grant_ad_reward(kind: String) -> String:
	## A rewarded ad finished: hand out `kind` (Balance.AD_REWARDS) and
	## return the toast that says what you got.
	ads_watched += 1
	match kind:
		"cash":
			var a := instant_cash_amount()
			grant_money(a)
			save_game()
			return "+%s cash" % Fmt.num(a)
		"boost":
			start_boost()
			return "Digging twice as fast for %s" % Fmt.duration(boost_seconds_left())
		"helper_rush":
			helper_rush_until = maxf(now(), helper_rush_until) + Balance.HELPER_RUSH_DURATION
			changed.emit()
			return "Your crew digs three times as hard for 3 minutes"
	return ""


func double_find(f: int) -> float:
	## "Double this find": pay its value again.
	ads_watched += 1
	var v := find_value(f)
	grant_money(v)
	save_game()
	return v


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_WM_CLOSE_REQUEST:
			save_game()


# --- Save / load -----------------------------------------------------------------------------------
func to_dict() -> Dictionary:
	if field != null:
		zone_saves.resize(field.nzones)
		for z in field.nzones:
			zone_saves[z] = field.save_string(z)
	if player != null and player.is_inside_tree():
		player_pos = player.position
		player_yaw = player.yaw
		player_pitch = player.pitch
	return {
		"version": SAVE_VERSION,
		"money": money,
		"lifetime_money": lifetime_money,
		"tool_index": tool_index,
		"upgrade_levels": upgrade_levels,
		"helper_counts": helper_counts,
		"found": found,
		"deepest": deepest,
		"lift_stop": [lift_stop.x, lift_stop.y, lift_stop.z] if lift_stop.is_finite() else [],
		"lift_spot": [lift_spot.x, lift_spot.y, lift_spot.z] if lift_spot.is_finite() else [],
		"dug_volume": dug_volume,
		"ore_points": ore_points,
		"clock": clock,
		"boost_until": boost_until,
		"helper_rush_until": helper_rush_until,
		"owns_remove_ads": owns_remove_ads,
		"owns_golden": owns_golden,
		"owns_starter": owns_starter,
		"skin": skin,
		"starter_offered": starter_offered,
		"play_time": play_time,
		"has_won": has_won,
		"won_time": won_time,
		"player_pos": [player_pos.x, player_pos.y, player_pos.z] if player_pos.is_finite() else [],
		"player_yaw": player_yaw,
		"player_pitch": player_pitch,
		"zones": zone_saves,
		"tutorial_step": tutorial_step,
		"ads_watched": ads_watched,
		"purchases_made": purchases_made,
	}


func save_game() -> void:
	var fa := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if fa == null:
		push_warning("Could not save: %s" % FileAccess.get_open_error())
		return
	fa.store_string(JSON.stringify(to_dict()))


static func _vec(a) -> Vector3:
	if typeof(a) == TYPE_ARRAY and (a as Array).size() == 3:
		return Vector3(float(a[0]), float(a[1]), float(a[2]))
	return Vector3.INF


func load_game() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var data = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if typeof(data) != TYPE_DICTIONARY:
		push_warning("Save file unreadable, starting fresh.")
		return
	owns_remove_ads = bool(data.get("owns_remove_ads", false))
	owns_golden = bool(data.get("owns_golden", false))
	owns_starter = bool(data.get("owns_starter", false))
	skin = str(data.get("skin", ""))
	if (skin == "golden" and not owns_golden) or (skin == "crystal" and not owns_starter):
		skin = ""
	if int(data.get("version", 0)) != SAVE_VERSION:
		return   # an older world: start fresh, keep purchases
	money = float(data.get("money", 0.0))
	lifetime_money = float(data.get("lifetime_money", 0.0))
	tool_index = clampi(int(data.get("tool_index", 0)), 0, Balance.TOOLS.size() - 1)
	var ul: Dictionary = data.get("upgrade_levels", {})
	for u in Balance.UPGRADES:
		upgrade_levels[u.key] = clampi(int(ul.get(u.key, 0)), 0, int(u.max))
	var hc: Array = data.get("helper_counts", [])
	for i in helper_counts.size():
		helper_counts[i] = int(hc[i]) if i < hc.size() else 0
	var fd: Array = data.get("found", [])
	for i in found.size():
		found[i] = bool(fd[i]) if i < fd.size() else false
	deepest = float(data.get("deepest", 0.0))
	lift_stop = _vec(data.get("lift_stop", []))
	lift_spot = _vec(data.get("lift_spot", []))
	if lift_stop.is_finite() and not lift_spot.is_finite():
		lift_spot = lift_stop
	dug_volume = float(data.get("dug_volume", 0.0))
	ore_points = int(data.get("ore_points", 0))
	clock = float(data.get("clock", 0.0))
	boost_until = float(data.get("boost_until", 0.0))
	helper_rush_until = float(data.get("helper_rush_until", 0.0))
	# Saves from before the game clock stored wall-clock times: drop those boosts.
	if boost_until > clock + Balance.BOOST_STACK_MAX + 1.0:
		boost_until = 0.0
	if helper_rush_until > clock + Balance.HELPER_RUSH_DURATION * 5.0 + 1.0:
		helper_rush_until = 0.0
	starter_offered = bool(data.get("starter_offered", false))
	play_time = float(data.get("play_time", 0.0))
	has_won = bool(data.get("has_won", false))
	won_time = float(data.get("won_time", 0.0))
	player_pos = _vec(data.get("player_pos", []))
	player_yaw = float(data.get("player_yaw", 0.0))
	player_pitch = float(data.get("player_pitch", -0.2))
	zone_saves = data.get("zones", [])
	tutorial_step = int(data.get("tutorial_step", 0))
	ads_watched = int(data.get("ads_watched", 0))
	purchases_made = int(data.get("purchases_made", 0))


func wipe_save() -> void:
	## Start a fresh dig (keeps purchases). The world rebuilds itself.
	reset_state(true)
	field = null
	player = null
	var fa := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if fa != null:
		fa.store_string(JSON.stringify(to_dict()))
	changed.emit()
