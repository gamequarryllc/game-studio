extends SceneTree
## A bot digs straight down and shops, and prints when it bought each tool
## and reached each zone (simulated time, a few seconds of real time):
##   godot --headless -s res://tests/pacing.gd             # a keen player
##   godot --headless -s res://tests/pacing.gd -- casual   # a slower one
##   godot --headless -s res://tests/pacing.gd -- ads      # keen, and takes every 2x boost
## It aims in a circle around its feet (a shaft about 1.6 m wide), drops to
## the floor as it digs, and pays a few seconds for every trip up the lift.
## (Untyped on purpose: this compiles before the autoloads exist.)

const DT := 0.05
const LIMIT := 60.0 * 60.0


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var casual := args.has("casual")
	var ads := args.has("ads")
	var gs = root.get_node("GameState")
	root.get_node("Monetization").provider.instant = true
	gs.wipe_save()
	var world = load("res://scenes/world.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	var field = world.field
	var player = world.player
	player.set_physics_process(false)
	world.hud.visible = false
	var t := 0.0
	var yaw := 0.0
	var zone_seen := 0
	var next_shop := 30.0
	var efficiency := 0.6 if casual else 0.85   # share of the time actually digging
	player.position = Vector3(0.2, 0.0, 0.3)
	print("t=  0:00  start (keen=%s, ads=%s)" % [not casual, ads])
	while t < LIMIT:
		t += DT
		gs.play_time = t
		# Dig: aim in a slow circle around the feet.
		var digging: bool = fmod(t, 10.0) < 10.0 * efficiency
		yaw += DT * 2.6
		player.set_view(yaw, -1.32)
		player.digging = digging
		player._update_tool(DT)
		var fl: float = field.floor_below(player.position + Vector3(0, 1.0, 0), 6.0)
		if fl < player.position.y - 0.02:
			player.position.y = fl
		if fl > player.position.y + 0.3:
			player.position.y = fl
		var d: float = -player.position.y
		gs.note_depth(d)
		var z: int = field.zone_of_y(player.position.y)
		if z > zone_seen:
			zone_seen = z
			print("t=%s  reached %s (%.0f m)  money %s" % [_clock(t), Balance.ZONES[z].name, d, Fmt.num(gs.money)])
			if z >= 6:
				break
		if field.zone_of_y(player.position.y - 8.0) != z or not field.is_loaded(z):
			field.want_zones(field.window_for(player.position.y))
			field.ensure_loaded(field.zone_of_y(player.position.y - 8.0))
			field.ensure_loaded(z)
			field._dirty.clear()
		# Boost from ads: keep it running.
		if ads and not gs.is_boost_active():
			gs.start_boost()
			gs.ads_watched += 1
		# Shopping: a trip up the lift when the next tool is affordable, or now and then.
		var ni: int = gs.next_tool_index()
		var can_tool: bool = ni >= 0 and gs.money >= float(Balance.TOOLS[ni].cost)
		if can_tool or t >= next_shop:
			next_shop = t + (45.0 if not casual else 90.0)
			var trip := 8.0 if not casual else 16.0
			t += trip
			if can_tool:
				gs.buy_tool(ni)
				print("t=%s  bought %s at %.0f m" % [_clock(t), Balance.TOOLS[ni].name, d])
			var bought := true
			while bought:
				bought = false
				var budget: float = gs.money
				var nt: float = gs.next_tool_cost()
				var cap: float = nt * 0.35 if nt > 0.0 else INF
				for key in ["power", "size", "ore", "lamp"]:
					if not gs.upgrade_maxed(key) and gs.upgrade_cost(key) <= minf(budget, cap) and gs.buy_upgrade(key):
						bought = true
				if gs.helper_cost(0) <= minf(gs.money, cap * 0.6) and gs.buy_helper(0):
					bought = true
		# Helpers dig at the bottom too (approximated: their power on this zone's rock).
		if gs.has_helpers():
			var hp: float = Balance.material_hp(Balance.ZONES[z].mats[0], z)
			var vol: float = gs.total_helper_power() * DT / hp * 0.06
			gs.grant_money(vol * hp * float(Balance.ZONES[z].worth), true)
	print("t=%s  end: depth %.0f m, %s, money %s, upgrades %s, moles %d" % [_clock(t), gs.deepest, gs.tool_def().name, Fmt.num(gs.money), gs.upgrade_levels, gs.helper_counts[0]])
	gs.wipe_save()
	quit(0)


func _clock(t: float) -> String:
	return "%2d:%02d" % [int(t) / 60, int(t) % 60]
