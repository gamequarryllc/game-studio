class_name Fmt
extends RefCounted
## Number and time formatting for the UI.


static func num(v: float) -> String:
	## 950, 1.2K, 34K, 1.5M...
	var a := absf(v)
	var sign := "-" if v < 0.0 else ""
	if a < 1000.0:
		return sign + str(int(floor(a)))
	var units := ["K", "M", "B", "T", "Qa", "Qi"]
	var u := -1
	while a >= 1000.0 and u < units.size() - 1:
		a /= 1000.0
		u += 1
	var s := ("%.1f" % a) if a < 100.0 else str(int(a))
	if s.ends_with(".0"):
		s = s.substr(0, s.length() - 2)
	return sign + s + str(units[u])


static func flow(m3s: float) -> String:
	## Pump flow, shown in tonnes a minute (1 m³ of sea water is about a tonne).
	return "%s t/min" % num(m3s * 60.0)


static func depth(y: float) -> String:
	return "%.1f m" % maxf(0.0, -y)


static func duration(sec: float) -> String:
	var t := int(ceil(sec))
	if t >= 60:
		return "%d:%02d" % [t / 60, t % 60]
	return "%ds" % t
