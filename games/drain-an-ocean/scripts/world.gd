class_name World
extends Node3D
## The bay and everything on it. Each frame: add up the pumps' flow into each
## body of water, lower the water (GameState.bay), react to what that does
## (pools cutting off, pools running dry, rings surfacing, the end), move the
## creatures, finds, pumps and helpers, and answer taps.
##
## Game actions a bot or test can call: place_pump(pad), send_barge(x, z),
## rescue_creature(i), salvage_find(f), salvage_wreck(w), buy(id),
## watch_ad(kind), open_shop(tab), open_aquarium(), skip_to_ring(r),
## dev_reset(), step_water(seconds).

const SUN_COLOR := Color("#ffc890")

var bay: Bay
var view: BayView
var props: Props
var creatures: Creatures
var finds: Finds
var pumps: Pumps
var helpers: Helpers
var rig: CameraRig
var hud: Hud
var aquarium: Aquarium
var sun: DirectionalLight3D
var env: WorldEnvironment
var offers := AdOffers.new()
var main_flow := 0.0             # m³/s the pumps move out of the main body right now
var seep_flow := 0.0             # m³/s seeping back in at this depth
var flows := {}                  # body id -> m³/s
var soundings := {}              # body id -> Label3D
var game_time := 0.0
var paused_world := false        # in the aquarium
var _hint_t := 0.0
var _gull_t := 6.0
var _pool_announced := {}
var _ended := false
var _starter_shown := false
var _soak := 0.0


func _ready() -> void:
	bay = GameState.bay
	_environment()
	view = BayView.new()
	view.name = "BayView"
	add_child(view)
	view.setup(bay)
	props = Props.new()
	props.name = "Props"
	add_child(props)
	props.setup(bay, view)
	creatures = Creatures.new()
	creatures.name = "Creatures"
	add_child(creatures)
	creatures.setup(bay)
	creatures.aquarium_target = props.aquarium_pos + Vector3(0, 4, 0)
	finds = Finds.new()
	finds.name = "Finds"
	add_child(finds)
	finds.setup(bay, props.wrecks)
	pumps = Pumps.new()
	pumps.name = "Pumps"
	add_child(pumps)
	pumps.setup(bay)
	pumps.sync_barges()
	helpers = Helpers.new()
	helpers.name = "Helpers"
	add_child(helpers)
	helpers.setup(self, props.aquarium_pos)
	rig = CameraRig.new()
	rig.name = "CameraRig"
	add_child(rig)
	rig.set_view(float(GameState.cam.x), float(GameState.cam.z), float(GameState.cam.zoom))
	rig.tapped.connect(_on_tap)
	hud = Hud.new()
	add_child(hud)
	hud.setup(self)
	hud.shop_requested.connect(open_shop)
	hud.aquarium_requested.connect(open_aquarium)
	hud.boost_requested.connect(func(): watch_ad("boost"))
	hud.offer_taken.connect(_take_offer)
	hud.double_find_requested.connect(_double_find)
	hud.ending_closed.connect(func(): pass)
	aquarium = Aquarium.new()
	aquarium.name = "Aquarium"
	add_child(aquarium)
	aquarium.closed.connect(_on_aquarium_closed)
	GameState.ring_surfaced.connect(_on_ring)
	Monetization.purchases_changed.connect(func(): pumps.reskin())
	_sync_soundings()
	Sound.loop("sea", "amb_sea", true, -8.0, 1.0, "Ambience")
	_ended = GameState.has_won
	get_tree().root.size_changed.connect(_on_resize)


func _environment() -> void:
	env = WorldEnvironment.new()
	var e := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color("#2f6f7c")
	sm.sky_horizon_color = Color("#e8c49a")
	sm.sky_curve = 0.12
	sm.ground_horizon_color = Color("#9fb3a2")
	sm.ground_bottom_color = Color("#0f4c5c")
	sm.sun_angle_max = 18.0
	sm.sun_curve = 0.08
	sky.sky_material = sm
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_energy = 0.55
	e.ambient_light_sky_contribution = 0.85
	e.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_exposure = 1.0
	e.tonemap_white = 5.0
	e.fog_enabled = true
	e.fog_light_color = Color("#e3c79f")
	e.fog_light_energy = 0.9
	e.fog_density = 0.00045
	e.fog_aerial_perspective = 0.12
	e.fog_sky_affect = 0.35
	e.adjustment_enabled = true
	e.adjustment_saturation = 1.05
	e.adjustment_contrast = 1.06
	env.environment = e
	add_child(env)
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.light_color = SUN_COLOR
	sun.light_energy = 1.55
	sun.shadow_enabled = true
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.2
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 260.0
	sun.light_cull_mask = 1
	var to_sun := Vector3(-0.86, 0.0, -0.52).normalized()
	var el := deg_to_rad(21.0)
	to_sun = Vector3(to_sun.x * cos(el), sin(el), to_sun.z * cos(el))
	sun.transform = Transform3D(Basis.looking_at(-to_sun, Vector3.UP), Vector3.ZERO)
	add_child(sun)
	# A cool fill from the opposite side, no shadows: the teal sky bouncing.
	var fill := DirectionalLight3D.new()
	fill.light_color = Color("#7fb3b8")
	fill.light_energy = 0.28
	fill.light_cull_mask = 1
	fill.transform = Transform3D(Basis.looking_at(Vector3(-0.7, -0.55, 0.45), Vector3.UP), Vector3.ZERO)
	add_child(fill)


func _on_resize() -> void:
	pass


# --- Loop ----------------------------------------------------------------------------------------
func _process(delta: float) -> void:
	var dt := minf(delta, 0.25 * maxf(1.0, Engine.time_scale))
	game_time += dt
	if not paused_world:
		_pump(dt)
	view.refresh(game_time)
	var running := not bay.is_drained() and main_flow > 0.0
	pumps.update(dt, game_time, running)
	creatures.update(dt, game_time)
	finds.update(dt, game_time)
	helpers.update(dt, game_time)
	_update_soundings()
	_update_offer(dt)
	_update_hints(dt)
	_update_sound(dt)
	GameState.cam = {"x": rig.target.x, "z": rig.target.y, "zoom": rig.zoom}
	rig.target_y = lerpf(rig.target_y, clampf(bay.main_level() * 0.45, -9.0, 0.0), dt * 0.5)
	if not _starter_shown and not GameState.starter_offered and GameState.play_time > Balance.STARTER_OFFER_AFTER and not _busy():
		_offer_starter()


func step_water(seconds: float, dt: float = 0.25) -> void:
	## Runs the pumps for a while without rendering (tests and bots).
	var t := 0.0
	while t < seconds:
		var s := minf(dt, seconds - t)
		_pump(s)
		t += s


func compute_flows() -> Dictionary:
	flows = {}
	main_flow = 0.0
	seep_flow = 0.0
	if bay.bodies.has(bay.main_id):
		main_flow = GameState.shore_flow()
	var bf := pumps.barge_flows()
	for id in bf:
		if id == bay.main_id:
			main_flow += float(bf[id])
		else:
			flows[id] = float(bf[id])
	if bay.bodies.has(bay.main_id):
		seep_flow = GameState.seepage(bay.main_level())
		flows[bay.main_id] = maxf(0.0, main_flow - seep_flow)
	return flows


func is_stalled() -> bool:
	## The sea seeps back about as fast as the pumps can move it.
	return bay.bodies.has(bay.main_id) and main_flow > 0.0 and main_flow - seep_flow < main_flow * 0.04


func _pump(dt: float) -> void:
	compute_flows()
	var events: Array = bay.step(dt, flows, game_time)
	for e in events:
		_on_water_event(e)
	if not events.is_empty():
		pumps.settle_barges()
		_sync_soundings()
	GameState.note_level(bay.main_level())


func _on_water_event(e: Dictionary) -> void:
	match str(e.type):
		"split":
			for id in e.into:
				if id == bay.main_id or _pool_announced.has(id):
					continue
				_pool_announced[id] = true
				var nm := bay.body_name(id)
				var n := _creatures_in_body(id)
				var line := "%s is cut off from the bay." % nm
				if n == 1:
					line += " Something's in there."
				elif n > 1:
					line += " %d creatures in there." % n
				hud.toast(line, 4.0)
				Sound.play("pool_cut", -4.0)
		"emptied":
			if e.was_main:
				_on_bay_drained()
			else:
				Sound.play("pool_dry", -6.0)


func _creatures_in_body(id: int) -> int:
	var n := 0
	for i in creatures.spots.size():
		if GameState.is_rescued(i):
			continue
		var p: Vector3 = creatures.spots[i].pos
		if bay.body_at(p.x, p.z) == id:
			n += 1
	return n


func _on_ring(r: int) -> void:
	if r <= 0:
		return
	hud.ring_banner(r)
	Sound.play("bell", -3.0)


func _on_bay_drained() -> void:
	if _ended:
		return
	_ended = true
	GameState.win()
	Sound.play("bell", 0.0)
	Sound.play("victory", -2.0)
	# Frame the town square, then the card.
	var sq := bay.vertex_pos(bay.sink)
	var from := Vector3(rig.target.x, rig.zoom, rig.target.y)
	var tw := create_tween()
	tw.tween_method(func(u: float):
		var e := u * u * (3.0 - 2.0 * u)
		rig.set_view(lerpf(from.x, sq.x, e), lerpf(from.z, sq.z + 6.0, e), lerpf(from.y, 0.3, e)), 0.0, 1.0, 2.5)
	var gs = GameState
	var lines := [
		"%d m of water pumped out, in %s." % [int(-bay.h[bay.sink]), Fmt.duration(gs.won_time)],
		"%d creatures rescued, %d of %d species." % [gs.rescued.size(), gs.species_seen(), Balance.SPECIES.size()],
		"%d of %d finds salvaged." % [gs.finds_count(), Balance.FINDS.size()],
		"The clock tower still keeps time.",
	]
	hud.show_ending(lines)


# --- Taps ------------------------------------------------------------------------------------------
func _unhandled_input(event: InputEvent) -> void:
	if paused_world or hud.shop_open() or Monetization.is_showing_ad():
		return
	if rig.handle_input(event):
		get_viewport().set_input_as_handled()
		return
	if event is InputEventKey and event.pressed and not event.echo:
		match (event as InputEventKey).keycode:
			KEY_E:
				open_shop()
			KEY_Q:
				open_aquarium()
			KEY_B:
				if offers.current != "":
					_take_offer(offers.current)
			KEY_M:
				Sound.set_muted(not Sound.muted)
			KEY_ESCAPE:
				hud.close_callout()


func _busy() -> bool:
	return paused_world or hud.shop_open() or Monetization.is_showing_ad() or hud.ending != null


func _on_tap(sp: Vector2) -> void:
	if _busy():
		return
	var pick := pick_at(sp)
	if pick.is_empty():
		hud.close_callout()
		return
	act_on(pick)


func pick_at(sp: Vector2) -> Dictionary:
	## What's under a tap: the nearest tappable thing on screen within reach,
	## else the water or seabed under the finger.
	var cam := rig.camera
	# Lambdas capture locals by value, so the best pick lives in a dictionary.
	var st := {"best": {}, "d": 64.0 * _ui_scale()}
	var consider := func(kind: String, idx: int, at: Vector3, bias: float):
		if cam.is_position_behind(at):
			return
		var d := cam.unproject_position(at).distance_to(sp) - bias
		if d < float(st.d):
			st.d = d
			st.best = {"kind": kind, "idx": idx, "at": at}
	for i in creatures.spots.size():
		if creatures.is_stranded(i):
			consider.call("creature", i, creatures.screen_pos(i), 14.0)
	for f in finds.spots.size():
		if finds.is_exposed(f):
			consider.call("find", f, finds.spots[f].pos + Vector3(0, 0.3, 0), 12.0)
	for w in finds.wrecks.size():
		if finds.wreck_revealed(w):
			consider.call("wreck", w, finds.wrecks[w].pos + Vector3(0, 2.0, 0), -6.0)
	for i in pumps.pads.size():
		consider.call("pad", i, pumps.pads[i].pos + Vector3(0, 1.0, 0), 4.0)
	for i in pumps.barges.size():
		consider.call("barge", i, (pumps.barges[i].node as Node3D).global_position + Vector3(0, 0.6, 0), 4.0)
	consider.call("aquarium", 0, props.aquarium_pos + Vector3(0, 3.0, 0), -4.0)
	if not (st.best as Dictionary).is_empty():
		return st.best
	var o := cam.project_ray_origin(sp)
	var dir := cam.project_ray_normal(sp)
	var hit := view.ray_hit(o, dir)
	if hit.is_empty():
		return {}
	if hit.water and int(hit.body) != Bay.NO_BODY:
		return {"kind": "water", "idx": int(hit.body), "at": hit.pos}
	return {"kind": "ground", "idx": -1, "at": hit.pos}


func _ui_scale() -> float:
	var vs := get_viewport().get_visible_rect().size
	return clampf(vs.y / 720.0, 0.6, 2.0)


func act_on(p: Dictionary) -> void:
	var at: Vector3 = p.at
	match str(p.kind):
		"creature":
			rescue_creature(int(p.idx))
		"find":
			salvage_find(int(p.idx))
		"wreck":
			var w := int(p.idx)
			var wd: Dictionary = finds.wrecks[w]
			if finds.wreck_ready(w):
				salvage_wreck(w)
			else:
				var left := int(GameState.wreck_loads[w])
				hud.show_callout(at, str(wd.name), ["Salvaged out." if left <= 0 else "%d loads left in her." % left])
		"pad":
			_pad_callout(int(p.idx))
		"barge":
			var b: Dictionary = pumps.barges[int(p.idx)]
			var lines := ["Aground. Tap any pool to send her there."] if b.aground else ["Pumping %s, %s." % [bay.body_name(int(b.body)).to_lower() if int(b.body) != bay.main_id else "the bay", Fmt.flow(GameState.barge_flow(bay.level_of(int(b.body))))]]
			hud.show_callout(at, "Barge pump %d" % (int(p.idx) + 1), lines)
		"aquarium":
			open_aquarium()
		"water":
			_water_callout(int(p.idx), at)
		"ground":
			hud.close_callout()


func _pad_callout(i: int) -> void:
	var gs = GameState
	var t := int(gs.pads[i])
	var c: float = gs.pad_next_cost(i)
	var at: Vector3 = pumps.pads[i].pos + Vector3(0, 1.4, 0)
	var pad_name: String = ShopPanel.PAD_NAMES[i]
	if c <= 0.0:
		hud.show_callout(at, Balance.pump_def(t).name, ["Pad %d, %s." % [i + 1, pad_name], "Moving %s." % Fmt.flow(gs.pump_flow(t, bay.main_level()))])
		return
	var nd: Dictionary = Balance.pump_def(t + 1)
	var lines: Array = []
	if t == 0:
		lines.append("An empty pad: %s." % pad_name)
	else:
		lines.append("%s, moving %s." % [str(Balance.pump_def(t).name), Fmt.flow(gs.pump_flow(t, bay.main_level()))])
	lines.append("%s: %s." % [str(nd.name), Fmt.flow(gs.pump_flow(t + 1, bay.main_level()))])
	var verb := "Set up" if t == 0 else "Upgrade"
	hud.show_callout(at, str(nd.name), lines, "%s  %s" % [verb, Fmt.num(c)], "" if gs.money >= c else "short by %s" % Fmt.num(c - gs.money), gs.money >= c, func():
		if place_pump(i):
			_pad_callout(i))


func _water_callout(id: int, at: Vector3) -> void:
	var gs = GameState
	var nm := bay.body_name(id)
	var on := 0
	for b in pumps.barges:
		if not b.aground and int(b.body) == id:
			on += 1
	var lines: Array = []
	if id == bay.main_id:
		lines.append("The main water. Shore pumps work it.")
	else:
		lines.append("%.1f m deep. Keeps its water until a barge pumps it." % bay.max_depth(id))
		var n := _creatures_in_body(id)
		if n > 0:
			lines.append("%d creature%s in here." % [n, "s" if n > 1 else ""])
	if on > 0:
		lines.append("%d barge%s on it now." % [on, "s" if on > 1 else ""])
	var idle := pumps.idle_barge()
	if idle >= 0:
		hud.show_callout(at, nm, lines, "Send a barge", "", true, func():
			send_barge(at.x, at.z)
			hud.close_callout())
	elif gs.barges.size() < Balance.BARGE_COSTS.size():
		var c: float = gs.barge_cost()
		hud.show_callout(at, nm, lines, "New barge  %s" % Fmt.num(c), "" if gs.money >= c else "short by %s" % Fmt.num(c - gs.money), gs.money >= c, func():
			if send_barge(at.x, at.z):
				hud.close_callout())
	else:
		lines.append("Every barge is working. Tap one that's aground and send it on.")
		var nb := _nearest_barge(at)
		if nb >= 0:
			hud.show_callout(at, nm, lines, "Move the nearest here", "", true, func():
				move_barge(nb, at.x, at.z)
				hud.close_callout())
		else:
			hud.show_callout(at, nm, lines)


func _nearest_barge(at: Vector3) -> int:
	var best := -1
	var bd := 1e9
	for i in pumps.barges.size():
		var d := (pumps.barges[i].pos as Vector3).distance_to(at)
		if d < bd:
			bd = d
			best = i
	return best


# --- Actions -----------------------------------------------------------------------------------------
func buy(id: String) -> bool:
	if not GameState.buy(id):
		return false
	on_shop_bought()
	return true


func on_shop_bought() -> void:
	pumps.refresh()
	pumps.sync_barges()
	helpers.sync()
	_sync_soundings()


func place_pump(pad: int) -> bool:
	## Puts the next pump tier on a pad (buys it).
	var ok := buy("pad:%d" % pad)
	if ok:
		Sound.play("build", -2.0)
		hud.float_text(pumps.pads[pad].pos + Vector3(0, 2, 0), str(Balance.pump_def(int(GameState.pads[pad])).name), UiTheme.PAPER)
		_hint_done("pad")
		if int(GameState.pads[pad]) >= 2:
			_hint_done("tier")
	else:
		Sound.play("cant_afford", -6.0)
	return ok


func send_barge(x: float, z: float) -> bool:
	## Sends an idle barge to (x, z), or buys a new one there.
	var idle := pumps.idle_barge()
	if idle >= 0:
		return move_barge(idle, x, z)
	if not GameState.buy("barge", Vector2(x, z)):
		Sound.play("cant_afford", -6.0)
		return false
	pumps.sync_barges()
	Sound.play("build", -2.0)
	_hint_done("barge")
	return true


func move_barge(i: int, x: float, z: float) -> bool:
	if i < 0 or i >= GameState.barges.size():
		return false
	GameState.barges[i] = [x, z]
	pumps.settle_barges()
	Sound.play("splash", -4.0)
	_hint_done("barge")
	return true


func rescue_creature(i: int, by_helper: bool = false) -> float:
	if i < 0 or i >= creatures.spots.size() or not creatures.is_stranded(i):
		return 0.0
	var sp: Dictionary = creatures.spots[i]
	var at := creatures.screen_pos(i)
	var v: float = GameState.rescue(i, int(sp.species))
	var release: bool = Balance.SPECIES[int(sp.species)].get("release", false)
	creatures.fly_away(i, creatures.aquarium_target, release)
	hud.float_text(at + Vector3(0, 1, 0), "+%s" % Fmt.num(v), UiTheme.PAPER)
	Sound.play("rescue", -3.0 if not by_helper else -9.0, 1.0, 0.08)
	if not by_helper:
		_hint_done("rescue")
		var def: Dictionary = Balance.SPECIES[int(sp.species)]
		if GameState.species_counts[int(sp.species)] == 1:
			hud.toast("%s, into the aquarium. New species." % str(def.name) if not release else "The whale calf is going home, over the wall.", 3.0)
	return v


func salvage_find(f: int, by_helper: bool = false) -> float:
	if f < 0 or f >= finds.spots.size() or not finds.is_exposed(f):
		return 0.0
	var v: float = GameState.salvage_find(f)
	finds.pick_up(f, props.aquarium_pos + Vector3(0, 4, 0))
	hud.float_text(finds.spots[f].pos + Vector3(0, 1.4, 0), "+%s" % Fmt.num(v), UiTheme.SAND, true)
	hud.show_find(f, v)
	Sound.play("find", -2.0)
	if not by_helper:
		_hint_done("find")
	return v


func salvage_wreck(w: int, by_helper: bool = false) -> float:
	if w < 0 or w >= finds.wrecks.size() or not finds.wreck_ready(w):
		return 0.0
	var v: float = GameState.salvage_wreck(w)
	finds.wreck_tapped(w)
	hud.float_text(finds.wrecks[w].pos + Vector3(0, 3.0, 0), "+%s" % Fmt.num(v), UiTheme.SAND, true)
	Sound.play("salvage", -3.0 if not by_helper else -9.0, 1.0, 0.1)
	return v


func watch_ad(kind: String) -> void:
	if kind == "boost" and not GameState.boost_can_stack():
		hud.toast("2x pumping is already stacked to 15 minutes.")
		return
	Monetization.watch_for_reward(kind, func(ok: bool, text: String):
		if ok and is_instance_valid(hud):
			hud.toast(text)
			Sound.play("reward", -2.0))


func _take_offer(kind: String) -> void:
	if kind == "":
		return
	offers.watching = true
	hud.hide_offer()
	Monetization.watch_for_reward(kind, func(ok: bool, text: String):
		offers.taken()
		if ok and is_instance_valid(hud):
			hud.toast(text)
			Sound.play("reward", -2.0))


func _double_find(f: int) -> void:
	hud.hide_find()
	Monetization.show_rewarded(Monetization.PLACEMENT_DOUBLE_FIND, func(ok: bool):
		if ok:
			GameState.ads_watched += 1
			var v: float = GameState.find_value(f)
			GameState.grant_money(v)
			if is_instance_valid(hud):
				hud.toast("Doubled: +%s" % Fmt.num(v))
			Sound.play("reward", -2.0))


func open_shop(tab: String = "") -> void:
	if _busy():
		return
	hud.open_shop(tab)
	_hint_done("shop")


func on_panel_closed() -> void:
	Monetization.maybe_show_interstitial(Monetization.PLACEMENT_INTERSTITIAL)


func open_aquarium() -> void:
	if _busy():
		return
	paused_world = false
	hud.close_callout()
	hud.set_hud_visible(false)
	hud.set_hint("")
	rig.enabled = false
	aquarium.open()
	paused_world = true
	_hint_done("aquarium")


func _on_aquarium_closed() -> void:
	paused_world = false
	rig.enabled = true
	rig.camera.current = true
	hud.set_hud_visible(true)
	on_panel_closed()


func focus_body(id: int) -> void:
	if not bay.bodies.has(id):
		return
	var p := bay.vertex_pos(bay.deepest_vertex(id))
	rig.set_view(p.x, p.z + 6.0, minf(rig.zoom, 0.4))


func skip_to_ring(r: int) -> void:
	## Dev: drops the main water to the top of ring r (pools form on the way).
	var to := float(Balance.RINGS[clampi(r, 0, Balance.RINGS.size() - 1)].top) - 0.2
	var guard := 0
	while bay.bodies.has(bay.main_id) and bay.main_level() > to and guard < 2000:
		guard += 1
		var ev: Array = bay.lower_body(bay.main_id, maxf(to, bay.main_level() - 0.25), game_time)
		for e in ev:
			_on_water_event(e)
	pumps.settle_barges()
	_sync_soundings()
	GameState.note_level(bay.main_level())


func dev_reset() -> void:
	GameState.reset_state(true)
	GameState.save_game()
	get_tree().reload_current_scene()


# --- Soundings, hints, offers, sound ---------------------------------------------------------------
func _sync_soundings() -> void:
	## A chart sounding (depth in italic) floats over each pool's deepest point.
	for id in soundings.keys():
		if not bay.bodies.has(id) or id == bay.main_id:
			soundings[id].queue_free()
			soundings.erase(id)
	for id in bay.pool_ids():
		if soundings.has(id):
			continue
		var l := Label3D.new()
		l.font = UiTheme.italic()
		l.font_size = 64
		l.outline_size = 10
		l.modulate = UiTheme.INK
		l.outline_modulate = Color(UiTheme.PAPER, 0.85)
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.fixed_size = true
		l.pixel_size = 0.00055
		l.no_depth_test = false
		add_child(l)
		soundings[id] = l


func _update_soundings() -> void:
	for id in soundings:
		var l: Label3D = soundings[id]
		var v := bay.deepest_vertex(id)
		var p := bay.vertex_pos(v)
		var d := bay.max_depth(id)
		l.position = Vector3(p.x, bay.level_of(id) + 0.6, p.z)
		var whole := int(floor(d))
		var tenth := int(round((d - whole) * 10.0))
		if tenth >= 10:
			whole += 1
			tenth = 0
		l.text = "%d%s" % [whole, ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"][tenth]]
		l.visible = d > 0.15 and not paused_world


func _hint_done(key: String) -> void:
	if not GameState.hints_done.has(key):
		GameState.hints_done[key] = true


func _hint_text() -> String:
	var gs = GameState
	var touch := rig.last_input_touch
	var hd: Dictionary = gs.hints_done
	if not hd.has("look"):
		return "Your bucket brigade is bailing out the bay. %s" % ("Drag to look round, pinch to zoom." if touch else "Drag to look round, scroll to zoom.")
	if not hd.has("rescue") and not creatures.stranded_list().is_empty():
		return "Something's stranded in the shallows. %s it to rescue it." % ("Tap" if touch else "Click")
	if not hd.has("find") and not finds.exposed_list().is_empty():
		return "Something glinting on the sand. %s it to pick it up." % ("Tap" if touch else "Click")
	if not hd.has("pad") and gs.money >= gs.pad_next_cost(1) and gs.pads.count(0) > 0:
		return "%s an empty pump pad on the beach and set up another bucket brigade." % ("Tap" if touch else "Click")
	if not hd.has("barge") and bay.pool_ids().size() > 0:
		return "A pool's cut off and keeps its water. %s it to send a barge pump out." % ("Tap" if touch else "Click")
	if not hd.has("tier") and gs.money >= gs.next_tier_cost() * 0.8 and gs.best_tier() < 2:
		return "A hand pump moves four times the water. %s a pad with a brigade on it." % ("Tap" if touch else "Click")
	if not hd.has("aquarium") and gs.creatures_in_tank() >= 3:
		return "Your rescues are in the aquarium on the pier, selling tickets. %s the Aquarium flag." % ("Tap" if touch else "Click")
	if is_stalled() and not paused_world:
		return "The sea's seeping back through the seabed as fast as you pump. It takes bigger pumps to go deeper."
	if not hd.has("shop") and gs.lifetime_money > 600.0:
		return "The Chandlery flag has upgrades, helpers and barges."
	return ""


func _update_hints(dt: float) -> void:
	_hint_t += dt
	if not GameState.hints_done.has("look"):
		if _hint_t > 14.0 or rig._press_moved:
			_hint_done("look")
	if Engine.get_process_frames() % 10 == 0:
		var t := _hint_text() if not paused_world and hud.ending == null else ""
		if t != hud.notice_label.text or (t != "" and not hud.notice.visible and hud.staff.visible):
			hud.set_hint(t)


func _update_offer(dt: float) -> void:
	var playing := not _busy() and not hud.shop_open()
	var r := offers.update(dt, playing)
	if r == 1:
		hud.show_offer(offers.current)
		Sound.play("whistle", -4.0)
	elif r == -1:
		hud.hide_offer()
	if offers.current != "" and not offers.watching:
		hud.update_offer(offers.time_left / Balance.OFFER_LIFETIME)


func _offer_starter() -> void:
	_starter_shown = true
	GameState.starter_offered = true
	var st := Monetization.PRODUCT_STARTER
	hud.show_callout(props.aquarium_pos + Vector3(0, 4, 0), "Harbour starter pack",
		["A strongbox of %s coins and the signal-flag livery for your pumps. Offered once." % Fmt.num(GameState.starter_cash())],
		Monetization.price(st), "", true, func():
			Monetization.buy(st)
			hud.close_callout())


func _update_sound(dt: float) -> void:
	var t := GameState.best_tier()
	var running := main_flow > 0.0 and not bay.is_drained() and not paused_world
	Sound.loop("pump", "pump_%d" % maxi(t, 1), running, -11.0 + 1.5 * GameState.pads.count(t), 1.0)
	_gull_t -= dt
	if _gull_t <= 0.0:
		_gull_t = randf_range(7.0, 16.0)
		if not paused_world:
			Sound.play("gull", -14.0, 1.0, 0.15)
