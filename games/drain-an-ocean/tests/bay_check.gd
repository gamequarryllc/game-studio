extends SceneTree

func _initialize() -> void:
	var t0 := Time.get_ticks_msec()
	var bay = load("res://scripts/bay.gd").new()
	print("loaded in ", Time.get_ticks_msec() - t0, " ms; bodies ", bay.bodies.size(), " main ", bay.main_id, " level ", bay.main_level())
	var t1 := Time.get_ticks_msec()
	var steps := 0
	var pools_seen := 0
	while not bay.is_drained() and steps < 20000:
		steps += 1
		var ev = bay.step(0.5, {bay.main_id: 60.0}, steps * 0.5)
		for e in ev:
			if e.type == "split":
				for id in e.into:
					if id != bay.main_id:
						pools_seen += 1
						print("  pool %-14s at main level %.2f, depth %.2f, area %d" % [bay.body_name(id), bay.main_level(), bay.max_depth(id), bay.body_area(id)])
			elif e.type == "emptied" and e.was_main:
				print("  main emptied")
	print("drained after ", steps, " steps, ", Time.get_ticks_msec() - t1, " ms; pools ", pools_seen, " bodies left ", bay.bodies.size())
	var pid = bay.pool_ids()[0]
	var before = bay.level_of(pid)
	var n := 0
	while bay.bodies.has(pid) and n < 1000:
		n += 1
		bay.step(0.5, {pid: 2.0}, 0.0)
	print("pool drained by a pump in ", n, " steps (was ", before, ")")
	var sd = bay.save_data()
	var bay2 = load("res://scripts/bay.gd").new()
	bay2.load_data(sd)
	print("save round trip bodies ", bay.bodies.size(), " -> ", bay2.bodies.size())
	quit()
