extends SceneTree
## Fire tuning bench: godot --headless -s res://tests/fire_bench.gd
## Builds the city, counts what's in it, then lights single buildings in each
## district and reports how far each fire runs (and how long it takes).


func _initialize() -> void:
	var t0 := Time.get_ticks_msec()
	var g := CityGrid.new()
	g.generate(Balance.WORLD_SEED)
	print("city built in %d ms: %d structures" % [Time.get_ticks_msec() - t0, g.count])
	var per := {}
	for s in g.count:
		var k: String = Balance.KINDS[g.s_kind[s]].name
		per[k] = int(per.get(k, 0)) + 1
	print("  ", per)
	var coins := 0.0
	for s in g.count:
		coins += float(Balance.KINDS[g.s_kind[s]].coins)
	print("  base coins in the whole city: %d" % int(coins))
	for z in 3:
		for trial in 3:
			var g2 := CityGrid.new()
			g2.generate(Balance.WORLD_SEED)
			var picks: Array = []
			for s in g2.count:
				if g2.s_zone[s] == z and g2.s_kind[s] in [Balance.HOUSE, Balance.OFFICE, Balance.SKY]:
					picks.append(s)
			var s0: int = picks[(trial * 37 + 11) % picks.size()]
			g2.wind_strength = 0.6
			g2.ignite(s0)
			var t1 := Time.get_ticks_msec()
			var paid := 0.0
			var secs := 0.0
			for k in 900:
				g2.tick(0.1)
				secs += 0.1
				paid += g2.take_pay()
				if g2.burning.is_empty() and g2.falling.is_empty() and g2.debris.is_empty():
					break
			print("  zone %d trial %d: %d fell, best chain %d, %.0f coins, %.0f s (%d ms)" % [z, trial, g2.fallen, g2.best_chain, paid, secs, Time.get_ticks_msec() - t1])
	quit(0)
