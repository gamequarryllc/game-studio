class_name Fmt
extends RefCounted
## Number formatting for big idle-game numbers.

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"]


static func num(x: float) -> String:
	## Coins, prices and counts: whole below a thousand (nobody holds 3.2 coins).
	if x < 0.0:
		return "-" + num(-x)
	if x < 1000.0:
		return str(int(floor(x + 0.0001)))
	var tier := 0
	var v := x
	while v >= 1000.0 and tier < SUFFIXES.size() - 1:
		v /= 1000.0
		tier += 1
	if v >= 100.0:
		return "%d%s" % [int(floor(v)), SUFFIXES[tier]]
	if v >= 10.0:
		return "%.1f%s" % [floor(v * 10.0) / 10.0, SUFFIXES[tier]]
	return "%.2f%s" % [floor(v * 100.0) / 100.0, SUFFIXES[tier]]


static func rate(x: float) -> String:
	## A per-second rate: one decimal while it's small ("0.7 a second"), then like num().
	if x >= 0.0 and x < 10.0:
		return ("%.1f" % x).trim_suffix(".0")
	return num(x)


static func gain(x: float) -> String:
	## A payout popping off a building: rounded to the nearest coin, never "+0".
	if x < 1000.0:
		return str(maxi(1, int(round(x))))
	return num(x)


static func spell_time(seconds: float) -> String:
	## Time in words for the ending note: "under a minute", "23 minutes", "1 hour 5 minutes".
	var m := int(seconds) / 60
	if m < 1:
		return "under a minute"
	if m < 60:
		return "%d %s" % [m, "minute" if m == 1 else "minutes"]
	var h := m / 60
	m = m % 60
	var out := "%d %s" % [h, "hour" if h == 1 else "hours"]
	if m > 0:
		out += " %d %s" % [m, "minute" if m == 1 else "minutes"]
	return out


static func duration(seconds: float) -> String:
	var s := int(seconds)
	var h := s / 3600
	var m := (s % 3600) / 60
	var sec := s % 60
	if h > 0:
		return "%dh %02dm" % [h, m]
	if m > 0:
		return "%dm %02ds" % [m, sec]
	return "%ds" % sec
