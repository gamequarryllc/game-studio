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
