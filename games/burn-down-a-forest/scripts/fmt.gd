class_name Fmt
extends RefCounted
## Number formatting for big idle-game numbers.

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"]


static func num(x: float) -> String:
	if x < 0.0:
		return "-" + num(-x)
	if x < 10.0:
		var s := "%.1f" % x
		return s.trim_suffix(".0")
	if x < 1000.0:
		return str(int(floor(x)))
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


static func whole(x: float) -> String:
	## Whole numbers for the floating "+embers": "8", "640", "2.7K", "27K", "1.2M",
	## never "8.7" or "2.70K".
	if x < 0.0:
		return "-" + whole(-x)
	if x < 1000.0:
		return str(int(round(x)))
	var tier := 0
	var v := x
	while v >= 1000.0 and tier < SUFFIXES.size() - 1:
		v /= 1000.0
		tier += 1
	if v < 10.0:
		return ("%.1f" % (floor(v * 10.0) / 10.0)).trim_suffix(".0") + SUFFIXES[tier]
	return "%d%s" % [int(floor(v)), SUFFIXES[tier]]


static func spoken_duration(seconds: float) -> String:
	## How long, the way a person says it: "under a minute", "a minute",
	## "43 minutes", "an hour", "an hour and 5 minutes", "2 hours and 10 minutes".
	var m := int(round(seconds / 60.0))
	if seconds < 30.0:
		return "under a minute"
	if m < 60:
		return "a minute" if m <= 1 else "%d minutes" % m
	var h := m / 60
	var rest := m % 60
	var hours := "an hour" if h == 1 else "%d hours" % h
	if rest == 0:
		return hours
	return "%s and %s" % [hours, "a minute" if rest == 1 else "%d minutes" % rest]


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
