extends SceneTree
## Timing for the rock: zone generation, meshing, digging.
##   godot --headless -s res://tests/field_bench.gd


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var field = load("res://scripts/dig_field.gd").new()
	root.add_child(field)
	field.setup(Balance.WORLD_SEED)
	for z in [0, 1, 2, 5]:
		var t0 := Time.get_ticks_usec()
		field._want[z] = true
		field.ensure_loaded(z)
		var t1 := Time.get_ticks_usec()
		var keys: Array = field._dirty.keys()
		field.flush()
		var t2 := Time.get_ticks_usec()
		var zone = field.zones[z]
		var ore := 0
		var pocket := 0
		for s in zone.o.size():
			if zone.o[s] > 0:
				ore += 1
			if zone.m[s] == Balance.ZONES[z].mats[1]:
				pocket += 1
		print("zone %d: generate %.1f ms, mesh %d chunks %.1f ms, ore %.1f%%, pockets %.1f%%, chunks with mesh %d" % [z, (t1 - t0) / 1000.0, keys.size(), (t2 - t1) / 1000.0, 100.0 * ore / zone.o.size(), 100.0 * pocket / zone.o.size(), zone.chunks.size()])
	# Dig a shaft 20 m down in topsoil and time the strikes and re-meshes.
	var strikes := 0
	var dig_us := 0
	var mesh_us := 0
	var got := 0.0
	var p := Vector3(0.3, -0.1, 0.2)
	while p.y > -20.0:
		var t0 := Time.get_ticks_usec()
		var r: Dictionary = field.dig(p, 0.8, 1.5)
		var t1 := Time.get_ticks_usec()
		var n: int = field._dirty.size()
		field.flush()
		var t2 := Time.get_ticks_usec()
		dig_us += t1 - t0
		mesh_us += t2 - t1
		strikes += 1
		got += r.value + r.ore_value
		p.y -= 0.12
		p.x = sin(strikes * 0.3) * 0.5
	print("dig: %d strikes, %.2f ms per strike, re-mesh %.2f ms per strike; value %.0f, dug %.1f m3" % [strikes, dig_us / 1000.0 / strikes, mesh_us / 1000.0 / strikes, got, field.dug_volume()])
	var hit: Dictionary = field.raycast(Vector3(0, 2, 0), Vector3(0, -1, 0), 40.0)
	print("ray down the shaft: ", hit)
	var t0 := Time.get_ticks_usec()
	var s0: String = field.save_string(0)
	print("save zone 0: %d chars, %.1f ms" % [s0.length(), (Time.get_ticks_usec() - t0) / 1000.0])
	quit(0)
