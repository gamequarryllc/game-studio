extends Node
## Autoload "GameState": embers, tools, upgrades, helpers, purchases, and saving.
## The forest itself lives in a ForestGrid (`forest`); its cells are saved through here.

signal changed                       # anything changed; the HUD and notebook refresh
signal tool_bought(index: int)
signal won

const SAVE_PATH := "user://forest_save.json"
const SAVE_VERSION := 1
const AUTOSAVE_INTERVAL := 10.0
const INCOME_BUCKET := 5.0
const INCOME_BUCKETS := 48           # 4 minutes of history

# --- Saved -------------------------------------------------------------------------
var embers: float = 0.0
var lifetime_embers: float = 0.0
var tool_index: int = 0
var upgrade_levels: Dictionary = {}
var helper_counts: Array = []
var boost_until: float = 0.0          # unix time; 2x fire until then
var helper_rush_until: float = 0.0
var instant_ready_at: float = 0.0     # "free embers" from the notebook is ready again then
var owns_remove_ads_2x := false       # purchases
var owns_starter := false
var owns_phoenix := false
var phoenix_on := false               # the cosmetic flame is switched on
var sparkler_on := false              # the starter pack's cosmetic matchstick
var starter_offered := false
var play_time: float = 0.0
var has_won := false
var cells_burned := 0
var critters_saved := 0
var tutorial_step := 0
var keeper_pos := Vector3.INF
var keeper_yaw := 0.0
var cam_pitch := -0.5
var forest_save := ""
var packs_bought := 0

# --- Runtime -----------------------------------------------------------------------
var forest: ForestGrid                # set by the world
var keeper: Node3D
var debug_speed := 1.0                # developer menu: everything burns faster
var _autosave_t := 0.0
var _income: Array = []
var _income_t := 0.0


func _ready() -> void:
	reset_state()
	load_game()


func reset_state(keep_purchases: bool = false) -> void:
	var keep := [owns_remove_ads_2x, owns_starter, owns_phoenix]
	embers = 0.0
	lifetime_embers = 0.0
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
	owns_phoenix = keep[2] if keep_purchases else false
	phoenix_on = phoenix_on and owns_phoenix
	sparkler_on = sparkler_on and owns_starter
	starter_offered = owns_starter
	play_time = 0.0
	has_won = false
	cells_burned = 0
	critters_saved = 0
	tutorial_step = 0
	keeper_pos = Vector3.INF
	keeper_yaw = 0.0
	cam_pitch = -0.6
	forest_save = ""
	packs_bought = 0
	_income = []


func now() -> float:
	return Time.get_unix_time_from_system()


func _process(delta: float) -> void:
	var d := minf(delta, 1.0)
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


func ember_mult() -> float:
	return upgrade_mult("value") * global_mult()


func tool_def(i: int = -1) -> Dictionary:
	return Balance.TOOLS[tool_index if i < 0 else i]


func tool_heat(i: int = -1) -> float:
	var h := float(tool_def(i).heat) * upgrade_mult("heat") * debug_speed
	if is_boost_active():
		h *= Balance.BOOST_MULT
	if phoenix_on:
		h *= Balance.PHOENIX_HEAT
	return h


func tool_radius() -> float:
	return float(tool_def().radius) * upgrade_mult("wide")


func tool_range() -> float:
	return float(tool_def().range)


func spread_mult() -> float:
	return upgrade_mult("wind")


func move_speed() -> float:
	return Balance.WALK_SPEED * upgrade_mult("boots")


func helper_heat(i: int) -> float:
	## Heat per second from all helpers of type i together.
	var h := float(Balance.HELPERS[i].heat) * float(helper_counts[i]) * upgrade_mult("heat") * debug_speed
	if is_helper_rush_active():
		h *= Balance.HELPER_RUSH_MULT
	if is_boost_active():
		h *= Balance.BOOST_MULT
	return h


func helper_each_heat(i: int) -> float:
	## Heat of one visible helper (beyond MAX_VISIBLE_HELPERS they just burn hotter).
	var shown := mini(int(helper_counts[i]), Balance.MAX_VISIBLE_HELPERS)
	return helper_heat(i) / float(maxi(1, shown))


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
	## Over the last ~10 seconds, for the HUD.
	if _income.is_empty():
		return 0.0
	var n := mini(_income.size(), 3)
	var total := 0.0
	for k in n:
		total += float(_income[_income.size() - 1 - k])
	var span := INCOME_BUCKET * float(n - 1) + maxf(_income_t, 1.0)
	return total / span


func instant_amount() -> float:
	## "Free embers": a few minutes of recent income, capped by what the next tool costs.
	var amount := maxf(Balance.INSTANT_MIN, income_per_minute() * Balance.INSTANT_MINUTES)
	var nt := next_tool_index()
	if nt >= 0:
		amount = minf(amount, maxf(Balance.INSTANT_MIN, float(Balance.TOOLS[nt].cost) * 0.6))
	return floorf(amount)


# =====================================================================================
# Earning
# =====================================================================================
func earn(raw: float) -> float:
	## Raw embers from the fire; returns what you actually got.
	if raw <= 0.0:
		return 0.0
	var v := raw * ember_mult()
	embers += v
	lifetime_embers += v
	_note_income(v)
	return v


func grant_embers(amount: float, counts_as_income: bool = false) -> void:
	embers += amount
	lifetime_embers += amount
	if counts_as_income:
		_note_income(amount)
	changed.emit()


func _note_income(v: float) -> void:
	if _income.is_empty():
		_income.append(0.0)
	_income[_income.size() - 1] = float(_income[_income.size() - 1]) + v


# =====================================================================================
# The notebook (shop)
# =====================================================================================
func next_tool_index() -> int:
	return tool_index + 1 if tool_index + 1 < Balance.TOOLS.size() else -1


func buy_tool(i: int) -> bool:
	if i != next_tool_index():
		return false
	var cost := float(Balance.TOOLS[i].cost)
	if embers < cost:
		return false
	embers -= cost
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
	if upgrade_maxed(key):
		return false
	var cost := upgrade_cost(key)
	if embers < cost:
		return false
	embers -= cost
	upgrade_levels[key] = int(upgrade_levels[key]) + 1
	changed.emit()
	return true


func helper_cost(i: int) -> float:
	return floorf(float(Balance.HELPERS[i].base) * pow(Balance.HELPER_GROWTH, float(helper_counts[i])))


func buy_helper(i: int) -> bool:
	var cost := helper_cost(i)
	if embers < cost:
		return false
	embers -= cost
	helper_counts[i] = int(helper_counts[i]) + 1
	changed.emit()
	return true


func start_boost() -> void:
	## A rewarded ad: 2x fire for 5 min, stacking to 15.
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
			grant_embers(amount)
			instant_ready_at = now() + Balance.INSTANT_COOLDOWN
			save_game()
			return "%s %s embers, on the house" % ["[img=22x22]res://ui/icons/coal.svg[/img]", Fmt.num(amount)]
		"boost":
			start_boost()
			save_game()
			return "2x fire for the next %s" % Fmt.duration(boost_seconds_left())
		"helper_rush":
			helper_rush_until = maxf(now(), helper_rush_until) + Balance.HELPER_RUSH_DURATION
			changed.emit()
			return "Your helpers are working three times as hard"
	return ""


func ember_pack_amount(pack: int) -> float:
	var p: Dictionary = Balance.EMBER_PACKS[pack]
	var nt := next_tool_index()
	var cost := float(Balance.TOOLS[nt].cost) if nt >= 0 else income_per_minute() * 10.0
	return floorf(maxf(float(p.min), cost * float(p.share)))


func short_for_next_tool() -> bool:
	var nt := next_tool_index()
	return nt >= 0 and embers < float(Balance.TOOLS[nt].cost)


func on_cells_burned(count: int) -> void:
	cells_burned += count


func check_win() -> void:
	if has_won or forest == null:
		return
	if forest.state[forest.elder_cell] >= ForestGrid.ASH:
		has_won = true
		save_game()
		won.emit()
		changed.emit()


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
	if forest != null:
		forest_save = forest.to_save_string()
	if keeper != null and is_instance_valid(keeper):
		keeper_pos = keeper.position
		keeper_yaw = keeper.cam_yaw
		cam_pitch = keeper.cam_pitch
	return {
		"version": SAVE_VERSION,
		"embers": embers,
		"lifetime_embers": lifetime_embers,
		"tool_index": tool_index,
		"upgrade_levels": upgrade_levels,
		"helper_counts": helper_counts,
		"boost_until": boost_until,
		"helper_rush_until": helper_rush_until,
		"instant_ready_at": instant_ready_at,
		"owns_remove_ads_2x": owns_remove_ads_2x,
		"owns_starter": owns_starter,
		"owns_phoenix": owns_phoenix,
		"phoenix_on": phoenix_on,
		"sparkler_on": sparkler_on,
		"starter_offered": starter_offered,
		"play_time": play_time,
		"has_won": has_won,
		"cells_burned": cells_burned,
		"critters_saved": critters_saved,
		"tutorial_step": tutorial_step,
		"keeper_pos": [keeper_pos.x, keeper_pos.y, keeper_pos.z] if keeper_pos.is_finite() else [],
		"keeper_yaw": keeper_yaw,
		"cam_pitch": cam_pitch,
		"forest": forest_save,
		"packs_bought": packs_bought,
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
	owns_phoenix = bool(data.get("owns_phoenix", false))
	phoenix_on = bool(data.get("phoenix_on", false)) and owns_phoenix
	sparkler_on = bool(data.get("sparkler_on", false)) and owns_starter
	if int(data.get("version", 0)) != SAVE_VERSION:
		return   # an older forest: start fresh, keep purchases
	embers = float(data.get("embers", 0.0))
	lifetime_embers = float(data.get("lifetime_embers", 0.0))
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
	cells_burned = int(data.get("cells_burned", 0))
	critters_saved = int(data.get("critters_saved", 0))
	tutorial_step = int(data.get("tutorial_step", 0))
	var kp: Array = data.get("keeper_pos", [])
	keeper_pos = Vector3(float(kp[0]), float(kp[1]), float(kp[2])) if kp.size() == 3 else Vector3.INF
	keeper_yaw = float(data.get("keeper_yaw", 0.0))
	cam_pitch = float(data.get("cam_pitch", -0.5))
	forest_save = str(data.get("forest", ""))
	packs_bought = int(data.get("packs_bought", 0))


func wipe_save(keep_purchases: bool = true) -> void:
	## Start a fresh forest (keeps purchases unless told otherwise). The world rebuilds itself.
	reset_state(keep_purchases)
	forest = null
	keeper = null
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(to_dict()))
	changed.emit()
