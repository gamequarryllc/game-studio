extends SceneTree
## Rough pacing estimate (not the playthrough bot): a greedy player who taps
## every stranded creature, find and wreck load the moment it's available,
## puts a barge on any pool holding creatures, and buys the cheapest pump,
## then upgrades and helpers, whenever affordable. Game time is stepped
## directly (no rendering), so a whole run takes seconds.
##   godot --headless -s res://tests/pacing.gd [-- ads]
## "ads" also takes the 2x boost whenever it's off.

const DT := 0.5


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var gs = root.get_node("GameState")
	root.get_node("Monetization").provider.instant = true
	var ads := "ads" in OS.get_cmdline_user_args()
	gs.SAVE_PATH = "user://ocean_save_pacing.json"
	gs.reset_state(false)
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	gs.set_process(false)
	var bay = world.bay
	var t := 0.0
	var ring := 0
	var tier := 1
	var log_lines: Array = []
	while t < 120.0 * 60.0 and not bay.is_drained():
		t += DT
		gs._autosave_t = -1e9
		gs._process(DT)
		world.game_time += DT
		world._pump(DT)
		if ads and not gs.is_boost_active():
			gs.grant_ad_reward("boost")
		for i in world.creatures.stranded_list():
			world.rescue_creature(i)
		for f in world.finds.exposed_list():
			world.salvage_find(f)
		for w in world.finds.wrecks.size():
			world.finds._wreck_cool[w] = maxf(0.0, world.finds._wreck_cool[w] - DT)
			if world.finds.wreck_ready(w):
				world.salvage_wreck(w)
		# Barges onto pools with creatures in them.
		for id in bay.pool_ids():
			if world._creatures_in_body(id) == 0:
				continue
			var has := false
			for b in world.pumps.barges:
				if not b.aground and int(b.body) == id:
					has = true
			if not has:
				var dv = bay.vertex_pos(bay.deepest_vertex(id))
				if world.pumps.idle_barge() >= 0 or gs.money >= gs.barge_cost() * 1.2:
					world.send_barge(dv.x, dv.z)
		# Shopping: pumps first, then the cheapest upgrade or helper.
		var spent := true
		var guard := 0
		while spent and guard < 20:
			guard += 1
			spent = false
			var p: int = gs.cheapest_pad()
			if p >= 0 and gs.money >= gs.pad_next_cost(p):
				world.place_pump(p)
				spent = true
				continue
			var best := ""
			var bc := INF
			for u in Balance.UPGRADES:
				var c: float = gs.upgrade_cost(u.key)
				if c > 0.0 and c < bc:
					bc = c
					best = "up:" + str(u.key)
			for hd in Balance.HELPERS:
				var c: float = gs.helper_cost(hd.key)
				if c > 0.0 and c * 1.5 < bc:
					bc = c * 1.5
					best = "helper:" + str(hd.key)
			if best != "" and gs.money >= gs.cost_of(best) and gs.money - gs.cost_of(best) > gs.next_pump_cost() * 0.5:
				world.buy(best)
				spent = true
		if OS.get_environment("PACE_TRACE") != "" and t > 390.0 and t < 430.0 and int(t * 2) % 4 == 0:
			log_lines.append("    t=%.1f lvl=%.2f pumps=%.0f seep=%.0f money=%.0f pads=%s up=%s barges=%d area=%.0f" % [t, bay.main_level(), world.main_flow, world.seep_flow, gs.money, str(gs.pads), str(gs.upgrade_levels), gs.barges.size(), bay.body_area(bay.main_id)])
		var r := Balance.ring_of_level(bay.main_level())
		if r > ring:
			ring = r
			log_lines.append("%s  reached %s" % [Fmt.duration(t), Balance.RINGS[r].name])
		if gs.best_tier() > tier:
			tier = gs.best_tier()
			log_lines.append("%s  first %s" % [Fmt.duration(t), Balance.pump_def(tier).name])
		if int(t) % 300 == 0 and absf(t - roundf(t)) < 0.01:
			log_lines.append("%s  level %.1f m, pumps %s, seep %s, %s coins, +%s/min, %d rescued, tiers %s" % [Fmt.duration(t), -bay.main_level(), Fmt.flow(world.main_flow), Fmt.flow(world.seep_flow), Fmt.num(gs.money), Fmt.num(gs.income_per_minute()), gs.rescued.size(), str(gs.pads)])
	log_lines.append("%s  %s" % [Fmt.duration(t), "the bay is dry" if bay.is_drained() else "NOT drained"])
	print("Pacing (greedy player%s):" % (", every 2x ad" if ads else ""))
	for l in log_lines:
		print("  ", l)
	gs.delete_save()
	quit()
