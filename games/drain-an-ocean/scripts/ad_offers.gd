class_name AdOffers
extends RefCounted
## When a timed rewarded-ad offer (a signal flag run up the halyard) appears,
## and which one. Gentle on purpose (numbers in Balance.OFFER_*): nothing in
## the first few minutes; one at a time; it goes away by itself; the clock
## only runs while you're on the bay (not in a panel or the aquarium); every
## offer you let pass makes the next one wait longer, taking one resets the
## wait; only offers worth having right now; never one whose ad isn't loaded.

var current := ""            # the reward on offer (a Balance.AD_REWARDS key), "" = none
var time_left := 0.0
var watching := false
var _wait := Balance.OFFER_FIRST_AFTER
var _gap := Balance.OFFER_GAP
var _last := ""
var rng := RandomNumberGenerator.new()


func _init() -> void:
	rng.randomize()


func update(delta: float, playing: bool) -> int:
	## Every frame. 1 when an offer appears, -1 when one goes unused, else 0.
	if current != "":
		if watching:
			return 0
		if playing:
			time_left -= delta
		if time_left <= 0.0 or not eligible(current):
			_pass()
			return -1
		return 0
	if not playing:
		return 0
	_wait -= delta
	if _wait > 0.0:
		return 0
	var k := pick()
	if k == "":
		_wait = 20.0
		return 0
	current = k
	time_left = Balance.OFFER_LIFETIME
	_last = k
	return 1


func taken() -> void:
	current = ""
	watching = false
	_gap = Balance.OFFER_GAP
	_wait = _gap


func _pass() -> void:
	current = ""
	watching = false
	_gap = minf(_gap * Balance.OFFER_GAP_GROWTH, Balance.OFFER_GAP_MAX)
	_wait = _gap


static func eligible(kind: String) -> bool:
	if kind == "" or not Balance.AD_REWARDS.has(kind):
		return false
	if GameState.has_won and kind != "tickets":
		return false
	if not Monetization.is_rewarded_ready(str(Balance.AD_REWARDS[kind].placement)):
		return false
	match kind:
		"cash":
			return GameState.instant_cash_amount() >= maxf(Balance.CASH_MIN, GameState.income_per_minute())
		"boost":
			return GameState.boost_can_stack() and not GameState.is_boost_active() and not GameState.bay.is_drained()
		"helper_rush":
			return GameState.has_helpers() and not GameState.is_helper_rush_active()
		"tickets":
			return GameState.aquarium_income() * 60.0 >= 40.0 and not GameState.is_ticket_rush_active()
	return false


func pick() -> String:
	## Cash when it would buy the next pump right now (the one worth taking);
	## otherwise any worthwhile one, not the same as last time.
	if eligible("cash") and unlocks_pump() != "":
		return "cash"
	var options: Array = []
	for k in Balance.AD_REWARDS:
		if eligible(k) and k != _last:
			options.append(k)
	if options.is_empty() and eligible(_last):
		options.append(_last)
	if options.is_empty():
		return ""
	return options[rng.randi() % options.size()]


static func unlocks_pump() -> String:
	## The next pump tier's name if the free cash would buy it, else "".
	var cost := GameState.next_tier_cost()
	if cost <= 0.0:
		return ""
	if GameState.money < cost and GameState.money + GameState.instant_cash_amount() >= cost:
		return GameState.next_tier_name()
	return ""


static func headline(kind: String) -> String:
	## The flag's line: names exactly what the ad buys.
	match kind:
		"cash":
			var line := "Free: +%s coins" % Fmt.num(GameState.instant_cash_amount())
			var p := unlocks_pump()
			if p != "":
				line += ", enough for the %s" % p.to_lower()
			return line
		"boost":
			return "Free: 2x pumping for 5 minutes"
		"helper_rush":
			return "Free: your helpers work 3x for 3 minutes"
		"tickets":
			return "Free: double ticket sales for 10 minutes"
	return ""
