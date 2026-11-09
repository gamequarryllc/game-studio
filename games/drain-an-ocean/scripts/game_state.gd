extends Node
## Autoload "GameState": money, pumps, upgrades, helpers, what's been rescued
## and salvaged, purchases, and saving. The water itself is the Bay (pure
## logic), owned here so tests can drive it without the world.

signal changed                       # anything changed; the UI refreshes
signal creature_rescued(spot: int, species: int, bounty: float)
signal salvaged(kind: String, index: int, value: float)
signal ring_surfaced(ring: int)
signal won

# Tests and bots can each use their own save: OCEAN_SAVE=<name> in the
# environment (playtest builds and the editor only).
var SAVE_PATH := "user://ocean_save.json"
const SAVE_VERSION := 1
const AUTOSAVE_INTERVAL := 10.0
const INCOME_BUCKET := 15.0
const INCOME_BUCKETS := 16

# --- Saved -------------------------------------------------------------------------------------
var money := 0.0
var lifetime_money := 0.0
var pads: Array = []                 # pump tier per pad (0 = empty)
var barges: Array = []               # [x, z] per barge you own: where it's moored
var upgrade_levels := {}
var helper_counts := {}
var rescued := {}                    # creature spot index (as String) -> true
var species_counts: Array = []       # rescued per species
var finds_found: Array = []          # per find
var wreck_loads: Array = []          # loads left per wreck
var ring_reached := 0                # deepest ring the main water has dropped into
var ring_bonus_paid := 0             # rings drained and paid for
var clock := 0.0                     # game seconds (boosts run on this)
var play_time := 0.0
var boost_until := 0.0
var helper_rush_until := 0.0
var ticket_rush_until := 0.0
var owns_remove_ads := false
var owns_brass := false              # premium cosmetic: polished brass pumps (+10%)
var owns_starter := false            # starter pack: cash + the signal-flag livery
var skin := ""                       # "", "brass" or "flags"
var starter_offered := false
var has_won := false
var won_time := 0.0
var whale_home := false
var tutorial_step := 0
var hints_done := {}
var ads_watched := 0
var purchases_made := 0
var cam := {"x": 6.0, "z": 14.0, "zoom": 1.0}
var bay_save := {}

# --- Runtime only ----------------------------------------------------------------------------------
var bay: Bay
var income_mult := 1.0               # dev: income x10 / x100 (playtest builds)
var _autosave_t := 0.0
var _income: Array = []
var _income_t := 0.0
var _aquarium_carry := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var slot := OS.get_environment("OCEAN_SAVE")
	if slot != "" and slot.is_valid_identifier() and (OS.has_feature("playtest") or OS.has_feature("editor") or not OS.has_feature("template")):
		SAVE_PATH = "user://ocean_save_%s.json" % slot
	bay = Bay.new()
	reset_state()
	load_game()


static func is_playtest() -> bool:
	return OS.has_feature("playtest") or OS.has_feature("editor") or not OS.has_feature("template")


func reset_state(keep_purchases: bool = false) -> void:
	var keep := [owns_remove_ads, owns_brass, owns_starter, skin]
	money = Balance.START_MONEY
	lifetime_money = 0.0
	pads = []
	for i in Balance.PAD_COUNT:
		pads.append(0)
	pads[0] = 1                      # a bucket brigade is already bailing
	barges = []
	upgrade_levels = {}
	for u in Balance.UPGRADES:
		upgrade_levels[u.key] = 0
	helper_counts = {}
	for hd in Balance.HELPERS:
		helper_counts[hd.key] = 0
	rescued = {}
	species_counts = []
	for _s in Balance.SPECIES:
		species_counts.append(0)
	finds_found = []
	for _f in Balance.FINDS:
		finds_found.append(false)
	wreck_loads = []
	for _w in 3:
		wreck_loads.append(Balance.WRECK_LOADS)
	ring_reached = 0
	ring_bonus_paid = 0
	clock = 0.0
	play_time = 0.0
	boost_until = 0.0
	helper_rush_until = 0.0
	ticket_rush_until = 0.0
	owns_remove_ads = keep[0] if keep_purchases else false
	owns_brass = keep[1] if keep_purchases else false
	owns_starter = keep[2] if keep_purchases else false
	skin = keep[3] if keep_purchases else ""
	starter_offered = owns_starter
	has_won = false
	won_time = 0.0
	whale_home = false
	tutorial_step = 0
	hints_done = {}
	ads_watched = 0
	purchases_made = 0
	cam = {"x": 6.0, "z": 14.0, "zoom": 1.0}
	bay_save = {}
	_income = []
	_aquarium_carry = 0.0
	if bay != null:
		bay.reset_water()


func now() -> float:
	return clock


func _process(delta: float) -> void:
	var dt := minf(delta, 0.25 * maxf(1.0, Engine.time_scale))
	if get_tree().paused:
		return
	clock += dt
	if not has_won:
		play_time += dt
	_income_t += dt
	if _income.is_empty() or _income_t >= INCOME_BUCKET:
		_income_t = 0.0
		_income.append(0.0)
		if _income.size() > INCOME_BUCKETS:
			_income.pop_front()
	# The aquarium earns all the time, in whole coins.
	_aquarium_carry += aquarium_income() * dt
	if _aquarium_carry >= 1.0:
		var whole := floorf(_aquarium_carry)
		_aquarium_carry -= whole
		_earn(whole)
	_autosave_t += delta
	if _autosave_t >= AUTOSAVE_INTERVAL:
		_autosave_t = 0.0
		save_game()


func _notification(what: int) -> void:
	# Save when the app goes to the background or closes (phones kill
	# background apps without warning).
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT \
			or what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		save_game()


# --- Multipliers -----------------------------------------------------------------------------------
func upgrade_def(key: String) -> Dictionary:
	for u in Balance.UPGRADES:
		if u.key == key:
			return u
	return {}


func upgrade_mult(key: String) -> float:
	return 1.0 + float(upgrade_def(key).per_level) * float(upgrade_levels.get(key, 0))


func speed_mult() -> float:
	## Everything that makes pumping faster for a while or for good.
	var m := 1.0
	if is_boost_active():
		m *= Balance.BOOST_MULT
	if owns_remove_ads:
		m *= Balance.PERMANENT_MULT
	if skin == "brass":
		m *= Balance.BRASS_BONUS
	return m


func head_factor(level: float) -> float:
	return 1.0 / (1.0 + maxf(0.0, -level) * Balance.HEAD_LOSS / upgrade_mult("pipe"))


func pump_flow(tier: int, level: float) -> float:
	if tier <= 0:
		return 0.0
	return float(Balance.pump_def(tier).flow) * upgrade_mult("power") * head_factor(level) * speed_mult()


func best_tier() -> int:
	var b := 0
	for t in pads:
		b = maxi(b, int(t))
	return b


func barge_flow(level: float) -> float:
	var tier_m := 1.0 + Balance.BARGE_FLOW_PER_TIER * float(maxi(best_tier() - 1, 0))
	return Balance.BARGE_FLOW * tier_m * upgrade_mult("power") * head_factor(level) * speed_mult()


func shore_flow() -> float:
	## m³/s from every shore pump into the main body right now.
	var lvl := bay.main_level()
	var q := 0.0
	for t in pads:
		q += pump_flow(int(t), lvl)
	return q


func seepage(level: float) -> float:
	## m³/s of sea seeping back into the main body at this level.
	return Balance.SEEP_K * pow(maxf(0.0, -level), Balance.SEEP_EXP)


func salvage_mult() -> float:
	return upgrade_mult("salvage") * income_mult


func rescue_mult() -> float:
	return upgrade_mult("rescue") * income_mult


func rescue_time() -> float:
	return Balance.RESCUE_TIME / upgrade_mult("rescue")


func aquarium_appeal() -> float:
	var a := 0.0
	for i in Balance.SPECIES.size():
		a += float(Balance.SPECIES[i].appeal) * float(species_counts[i])
	return a


func aquarium_income() -> float:
	## Coins per second from ticket sales.
	var m := Balance.TICKET_MULT * income_mult
	if is_ticket_rush_active():
		m *= Balance.TICKET_RUSH_MULT
	return aquarium_appeal() * m


func creatures_in_tank() -> int:
	var c := 0
	for i in species_counts.size():
		if not Balance.SPECIES[i].get("release", false):
			c += int(species_counts[i])
	return c


func helper_count(key: String) -> int:
	return int(helper_counts.get(key, 0))


func helper_trip(key: String) -> float:
	for hd in Balance.HELPERS:
		if hd.key == key:
			var t := float(hd.trip)
			if key == "pelican":
				t /= upgrade_mult("rescue")
			if is_helper_rush_active():
				t /= Balance.HELPER_RUSH_MULT
			if owns_remove_ads:
				t /= Balance.PERMANENT_MULT
			return t
	return 10.0


func has_helpers() -> bool:
	for k in helper_counts:
		if int(helper_counts[k]) > 0:
			return true
	return false


# --- Timers --------------------------------------------------------------------------------------
func is_boost_active() -> bool:
	return now() < boost_until


func boost_seconds_left() -> float:
	return maxf(0.0, boost_until - now())


func boost_can_stack() -> bool:
	return boost_seconds_left() + Balance.BOOST_SECONDS <= Balance.BOOST_MAX_SECONDS + 1.0


func is_helper_rush_active() -> bool:
	return now() < helper_rush_until


func helper_rush_seconds_left() -> float:
	return maxf(0.0, helper_rush_until - now())


func is_ticket_rush_active() -> bool:
	return now() < ticket_rush_until


func ticket_rush_seconds_left() -> float:
	return maxf(0.0, ticket_rush_until - now())


func income_per_minute() -> float:
	if _income.is_empty():
		return aquarium_income() * 60.0
	var total := 0.0
	for v in _income:
		total += float(v)
	var span := INCOME_BUCKET * float(_income.size() - 1) + maxf(_income_t, 1.0)
	return maxf(total / span * 60.0, aquarium_income() * 60.0)


# --- Earning ---------------------------------------------------------------------------------------
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


func is_rescued(spot: int) -> bool:
	return rescued.has(str(spot))


func rescue(spot: int, species: int) -> float:
	## A stranded creature is safe. Pays its bounty; it joins the aquarium
	## (the whale calf goes home over the sea wall instead).
	if is_rescued(spot):
		return 0.0
	rescued[str(spot)] = true
	species_counts[species] = int(species_counts[species]) + 1
	var sp: Dictionary = Balance.SPECIES[species]
	if sp.get("release", false):
		whale_home = true
	var v := float(sp.bounty) * rescue_mult()
	_earn(v)
	creature_rescued.emit(spot, species, v)
	return v


func find_value(f: int) -> float:
	return float(Balance.FINDS[f].value) * salvage_mult()


func salvage_find(f: int) -> float:
	if finds_found[f]:
		return 0.0
	finds_found[f] = true
	var v := find_value(f)
	_earn(v)
	salvaged.emit("find", f, v)
	return v


func wreck_load_value(_wreck: int) -> float:
	return float(Balance.WRECK_LOAD_VALUE[3]) * salvage_mult()


func salvage_wreck(wreck: int) -> float:
	if int(wreck_loads[wreck]) <= 0:
		return 0.0
	wreck_loads[wreck] = int(wreck_loads[wreck]) - 1
	var v := wreck_load_value(wreck)
	_earn(v)
	salvaged.emit("wreck", wreck, v)
	return v


func finds_count() -> int:
	var c := 0
	for f in finds_found:
		if f:
			c += 1
	return c


func species_seen() -> int:
	var c := 0
	for n in species_counts:
		if int(n) > 0:
			c += 1
	return c


func note_level(level: float) -> void:
	## The main water is at `level`: new rings surface, drained rings pay.
	var r := Balance.ring_of_level(level)
	if r > ring_reached:
		ring_reached = r
		ring_surfaced.emit(r)
	while ring_bonus_paid < Balance.RINGS.size() - 1 and level <= float(Balance.RINGS[ring_bonus_paid].bottom):
		var bonus := float(Balance.RINGS[ring_bonus_paid].bonus) * income_mult
		ring_bonus_paid += 1
		if bonus > 0.0:
			_earn(bonus, false)


func win() -> void:
	if has_won:
		return
	has_won = true
	won_time = play_time
	save_game()
	won.emit()


# --- Shop ------------------------------------------------------------------------------------------
func pad_next_cost(pad: int) -> float:
	## The price of the next pump tier on this pad (0 if it's at the top).
	var t := int(pads[pad])
	if t >= Balance.PUMPS.size():
		return 0.0
	var nt := t + 1
	var others := 0
	for i in pads.size():
		if i != pad and int(pads[i]) >= nt:
			others += 1
	return float(Balance.PUMPS[nt - 1].cost) * pow(Balance.PAD_COST_GROWTH, others)


func cheapest_pad() -> int:
	var best := -1
	var bc := INF
	for i in pads.size():
		var c := pad_next_cost(i)
		if c > 0.0 and c < bc:
			bc = c
			best = i
	return best


func next_pump_cost() -> float:
	var p := cheapest_pad()
	return pad_next_cost(p) if p >= 0 else 0.0


func next_tier_cost() -> float:
	## What the first pump of the next tier you haven't got costs.
	var bt := best_tier()
	if bt >= Balance.PUMPS.size():
		return 0.0
	var best := INF
	for i in pads.size():
		if int(pads[i]) == bt:
			best = minf(best, pad_next_cost(i))
	return best if best < INF else float(Balance.PUMPS[bt].cost)


func next_tier_name() -> String:
	var bt := best_tier()
	return str(Balance.PUMPS[bt].name) if bt < Balance.PUMPS.size() else ""


func barge_cost() -> float:
	var n := barges.size()
	return float(Balance.BARGE_COSTS[n]) if n < Balance.BARGE_COSTS.size() else 0.0


func upgrade_cost(key: String) -> float:
	var u := upgrade_def(key)
	var lvl := int(upgrade_levels.get(key, 0))
	if lvl >= int(u.max):
		return 0.0
	return float(u.cost) * pow(float(u.growth), lvl)


func helper_def(key: String) -> Dictionary:
	for hd in Balance.HELPERS:
		if hd.key == key:
			return hd
	return {}


func helper_cost(key: String) -> float:
	var hd := helper_def(key)
	var c := helper_count(key)
	if c >= int(hd.max):
		return 0.0
	return float(hd.cost) * pow(float(hd.growth), c)


func cost_of(id: String) -> float:
	## Shop ids: "pad:2", "barge", "up:power", "helper:pelican". 0 = can't buy.
	if id.begins_with("pad:"):
		return pad_next_cost(int(id.substr(4)))
	if id == "barge":
		return barge_cost()
	if id.begins_with("up:"):
		return upgrade_cost(id.substr(3))
	if id.begins_with("helper:"):
		return helper_cost(id.substr(7))
	return 0.0


func can_afford(id: String) -> bool:
	var c := cost_of(id)
	return c > 0.0 and money >= c


func buy(id: String, at: Vector2 = Vector2.INF) -> bool:
	## Buys one thing by id. A new barge is moored at `at` (or by the pier).
	var c := cost_of(id)
	if c <= 0.0 or money < c:
		return false
	money -= c
	if id.begins_with("pad:"):
		var p := int(id.substr(4))
		pads[p] = int(pads[p]) + 1
	elif id == "barge":
		var spot := at if at != Vector2.INF else Vector2(12.0, 30.0)
		barges.append([spot.x, spot.y])
	elif id.begins_with("up:"):
		var k := id.substr(3)
		upgrade_levels[k] = int(upgrade_levels.get(k, 0)) + 1
	elif id.begins_with("helper:"):
		var k := id.substr(7)
		helper_counts[k] = helper_count(k) + 1
	changed.emit()
	save_game()
	return true


func unlock_everything() -> void:
	for i in pads.size():
		pads[i] = Balance.PUMPS.size()
	for u in Balance.UPGRADES:
		upgrade_levels[u.key] = int(u.max)
	for hd in Balance.HELPERS:
		helper_counts[hd.key] = int(hd.max)
	while barges.size() < Balance.BARGE_COSTS.size():
		barges.append([12.0, 30.0])
	changed.emit()


# --- Ads and purchases -----------------------------------------------------------------------------
func instant_cash_amount() -> float:
	var v := maxf(income_per_minute() * Balance.CASH_MINUTES, Balance.CASH_MIN)
	var nxt := next_pump_cost()
	if nxt > 0.0:
		v = minf(v, nxt * Balance.CASH_MAX_OF_NEXT)
	return maxf(roundf(v), Balance.CASH_MIN)


func starter_cash() -> float:
	return maxf(income_per_minute() * Balance.STARTER_CASH_MINUTES, Balance.STARTER_CASH_MIN)


func cash_pack_amount(size: String) -> float:
	return maxf(income_per_minute() * float(Balance.CASH_PACK_MINUTES[size]), float(Balance.CASH_PACK_MIN[size]))


func grant_ad_reward(kind: String) -> String:
	## A rewarded ad was watched to the end. Returns what you got, for a toast.
	ads_watched += 1
	var text := ""
	match kind:
		"boost":
			boost_until = maxf(boost_until, now()) + Balance.BOOST_SECONDS
			boost_until = minf(boost_until, now() + Balance.BOOST_MAX_SECONDS)
			text = "2x pumping for %s" % Fmt.duration(boost_seconds_left())
		"cash":
			var v := instant_cash_amount()
			grant_money(v)
			text = "+%s" % Fmt.num(v)
		"helper_rush":
			helper_rush_until = maxf(helper_rush_until, now()) + Balance.HELPER_RUSH_SECONDS
			text = "Helpers at 3x for 3 minutes"
		"tickets":
			ticket_rush_until = maxf(ticket_rush_until, now()) + Balance.TICKET_RUSH_SECONDS
			text = "Double ticket sales for 10 minutes"
	changed.emit()
	save_game()
	return text


# --- Save / load -----------------------------------------------------------------------------------
func save_game() -> void:
	if bay != null:
		bay_save = bay.save_data()
	var d := {
		"version": SAVE_VERSION,
		"money": money, "lifetime_money": lifetime_money, "pads": pads, "barges": barges,
		"upgrades": upgrade_levels, "helpers": helper_counts, "rescued": rescued,
		"species": species_counts, "finds": finds_found, "wreck_loads": wreck_loads,
		"ring_reached": ring_reached, "ring_bonus_paid": ring_bonus_paid,
		"clock": clock, "play_time": play_time, "boost_until": boost_until,
		"helper_rush_until": helper_rush_until, "ticket_rush_until": ticket_rush_until,
		"owns_remove_ads": owns_remove_ads, "owns_brass": owns_brass, "owns_starter": owns_starter,
		"skin": skin, "starter_offered": starter_offered, "has_won": has_won, "won_time": won_time,
		"whale_home": whale_home, "tutorial_step": tutorial_step, "hints_done": hints_done,
		"ads_watched": ads_watched, "purchases_made": purchases_made, "cam": cam, "bay": bay_save,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		return
	f.store_string(JSON.stringify(d))


func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return false
	var d = JSON.parse_string(f.get_as_text())
	if typeof(d) != TYPE_DICTIONARY:
		return false
	money = float(d.get("money", money))
	lifetime_money = float(d.get("lifetime_money", 0.0))
	var p: Array = d.get("pads", pads)
	for i in mini(p.size(), pads.size()):
		pads[i] = clampi(int(p[i]), 0, Balance.PUMPS.size())
	barges = []
	for b in d.get("barges", []):
		barges.append([float(b[0]), float(b[1])])
	var ups: Dictionary = d.get("upgrades", {})
	for k in ups:
		if upgrade_levels.has(k):
			upgrade_levels[k] = int(ups[k])
	var hs: Dictionary = d.get("helpers", {})
	for k in hs:
		if helper_counts.has(k):
			helper_counts[k] = int(hs[k])
	rescued = d.get("rescued", {})
	var sc: Array = d.get("species", [])
	for i in mini(sc.size(), species_counts.size()):
		species_counts[i] = int(sc[i])
	var ff: Array = d.get("finds", [])
	for i in mini(ff.size(), finds_found.size()):
		finds_found[i] = bool(ff[i])
	var wl: Array = d.get("wreck_loads", [])
	for i in mini(wl.size(), wreck_loads.size()):
		wreck_loads[i] = int(wl[i])
	ring_reached = int(d.get("ring_reached", 0))
	ring_bonus_paid = int(d.get("ring_bonus_paid", 0))
	clock = float(d.get("clock", 0.0))
	play_time = float(d.get("play_time", 0.0))
	boost_until = float(d.get("boost_until", 0.0))
	helper_rush_until = float(d.get("helper_rush_until", 0.0))
	ticket_rush_until = float(d.get("ticket_rush_until", 0.0))
	owns_remove_ads = bool(d.get("owns_remove_ads", false))
	owns_brass = bool(d.get("owns_brass", false))
	owns_starter = bool(d.get("owns_starter", false))
	skin = str(d.get("skin", ""))
	starter_offered = bool(d.get("starter_offered", false))
	has_won = bool(d.get("has_won", false))
	won_time = float(d.get("won_time", 0.0))
	whale_home = bool(d.get("whale_home", false))
	tutorial_step = int(d.get("tutorial_step", 0))
	hints_done = d.get("hints_done", {})
	ads_watched = int(d.get("ads_watched", 0))
	purchases_made = int(d.get("purchases_made", 0))
	var c: Dictionary = d.get("cam", {})
	if c.has("x"):
		cam = {"x": float(c.x), "z": float(c.z), "zoom": float(c.get("zoom", 1.0))}
	bay_save = d.get("bay", {})
	if bay != null:
		bay.load_data(bay_save)
	return true


func delete_save() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))
