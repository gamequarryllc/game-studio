extends SceneTree
## CPU cost of the fire during a big blaze: godot --headless -s res://tests/perf_bench.gd
## Prints the average time of a fire tick, the flame rebuild and a whole frame's
## world update while a large part of the forest burns. The web build runs
## GDScript slower than this (roughly 2-4x on a phone), so keep it well under budget.
## (Untyped on purpose: compiles before the autoloads exist.)

func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var gs = root.get_node("GameState")
	gs.wipe_save(false)
	var t0 := Time.get_ticks_usec()
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await process_frame
	print("startup (forest + view): %.0f ms" % ((Time.get_ticks_usec() - t0) / 1000.0))
	var f = world.forest
	f.spread_mult = 1.6
	for p in [Vector2(-20, 30), Vector2(10, 25), Vector2(-5, 10), Vector2(25, -10), Vector2(-30, -20)]:
		f.add_heat_area(p, 6.0, 99999.0)
	var ticks := 0
	var tick_us := 0
	var fire_us := 0
	var change_us := 0
	var peak := 0
	for _i in 600:
		var a := Time.get_ticks_usec()
		f.tick(0.1)
		var b := Time.get_ticks_usec()
		world.view.apply_changes(f.take_changed())
		f.take_ignited()
		f.take_spots()
		var c := Time.get_ticks_usec()
		world.view.update_fire(world.keeper.camera.global_position)
		var d := Time.get_ticks_usec()
		world.view.advance(0.1)
		tick_us += b - a
		change_us += c - b
		fire_us += d - c
		ticks += 1
		peak = maxi(peak, f.burning.size())
		if f.burning.size() == 0:
			break
	print("ticks %d, peak burning cells %d, burned %d" % [ticks, peak, f.burned])
	print("avg fire tick %.2f ms, apply changes %.2f ms, flame rebuild %.2f ms (10 per second each)" % [
		tick_us / 1000.0 / ticks, change_us / 1000.0 / ticks, fire_us / 1000.0 / ticks])
	world.queue_free()
	await process_frame
	root.get_node("Sound").stop_all()
	quit(0)
