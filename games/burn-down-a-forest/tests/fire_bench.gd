extends SceneTree
## Tuning bench for the fire: godot --headless -s res://tests/fire_bench.gd
## Prints what the forest holds, then lights single cells in each ring and
## reports how far each fire got, with no Dry Winds and with them maxed.

func _initialize() -> void:
	var g := ForestGrid.new()
	g.generate(Balance.WORLD_SEED)
	var counts := {}
	var embers := []
	for _z in Balance.ZONES.size():
		embers.append(0.0)
	for i in g.kind.size():
		counts[g.kind[i]] = counts.get(g.kind[i], 0) + 1
		if Balance.flammable(g.kind[i]):
			embers[g.zone[i]] += float(Balance.PLANTS[g.kind[i]].embers)
	print("kinds: ", counts)
	for z in Balance.ZONES.size():
		print("zone %d %s: %d cells, %.0f embers" % [z, Balance.ZONES[z].name, g.zone_total[z], embers[z]])
	for mult in [1.0, 1.3, 1.6]:
		for z in Balance.ZONES.size():
			var main: int = [Balance.GRASS, Balance.PINE, Balance.OAK, Balance.GIANT][z]
			var results := []
			var pays := []
			var times := []
			for trial in 6:
				var f := ForestGrid.new()
				f.generate(Balance.WORLD_SEED)
				f.rng.seed = 1000 + trial
				f.spread_mult = mult
				var r := RandomNumberGenerator.new()
				r.seed = 77 + trial * 13 + z
				var start := -1
				for _k in 4000:
					var i := r.randi() % f.kind.size()
					if f.zone[i] == z and f.kind[i] == main and f.damp[i] == 0:
						start = i
						break
				f.ignite(start)
				var t := 0.0
				var paid := 0.0
				while f.burning.size() > 0 and t < 600.0:
					f.tick(Balance.TICK)
					if f.ticks % 50 == 0:
						f.take_spots()
						f.take_changed()
						f.take_ignited()
					paid += f.take_pay()
					t += Balance.TICK
				f.take_changed()
				f.take_spots()
				results.append(f.burned)
				pays.append(int(paid))
				times.append(int(t))
			print("spread x%.2f zone %d: cells burned %s  embers %s  seconds %s" % [mult, z, results, pays, times])
	quit(0)
