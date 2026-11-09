class_name AdOffers
extends RefCounted
## When a timed rewarded-ad offer tag shows up on the HUD, and which one.
##
## Gentle on purpose (numbers in Balance.OFFER_*): nothing in the first few
## minutes; one at a time; it goes away by itself after OFFER_LIFETIME; the
## clock only runs while you're actually playing (not in the shop); every
## offer you let pass makes the next one wait longer, and taking one resets the
## wait. Only offers worth having right now, and never one whose ad isn't loaded.

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
	## Call every frame. 1 = an offer appeared, -1 = one went away unused, 0 = nothing.
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
	if GameState.has_won:
		return false
	if not Monetization.is_rewarded_ready(str(Balance.AD_REWARDS[kind].placement)):
		return false
	match kind:
		"instant":
			return GameState.instant_amount() >= maxf(Balance.INSTANT_MIN, GameState.income_per_minute())
		"boost":
			return not GameState.is_boost_active()
		"helper_rush":
			return GameState.has_helpers() and not GameState.is_helper_rush_active()
	return false


func pick() -> String:
	## Free coins when they'd buy the next tool right now (the offer worth taking);
	## otherwise any worthwhile one, not the same as last time.
	if eligible("instant") and unlocks_tool() != "":
		return "instant"
	var options: Array = []
	for k in Balance.AD_REWARDS:
		if eligible(k) and k != _last:
			options.append(k)
	if options.is_empty() and eligible(_last):
		options.append(_last)
	if options.is_empty():
		return ""
	return options[rng.randi() % options.size()]


static func unlocks_tool() -> String:
	## The next tool's name if the free coins would buy it, else "".
	var i := GameState.next_tool_index()
	if i < 0:
		return ""
	var cost := float(Balance.TOOLS[i].cost)
	if GameState.coins < cost and GameState.coins + GameState.instant_amount() >= cost:
		return str(Balance.TOOLS[i].name)
	return ""


static func headline(kind: String) -> String:
	## The tag's line, naming what it buys: "Free: +[coin]3.2K, enough for the blowtorch".
	## [coin] is drawn as the coin icon by the HUD.
	match kind:
		"instant":
			var line := "Free: +[coin]%s" % Fmt.num(GameState.instant_amount())
			var tool := unlocks_tool()
			if tool != "":
				line += ", enough for the %s" % tool.to_lower()
			return line
		"boost":
			return "Free: 2x fire for 5 minutes"
		"helper_rush":
			return "Free: helpers work 3x for 3 minutes"
	return ""
