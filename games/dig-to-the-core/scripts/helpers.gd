class_name HelperCrew
extends Node3D
## Moles (and Robo-Moles) that dig on their own around the lift stop at the
## bottom of your shaft, so the shaft keeps getting deeper (and pays) while
## you're up at the shack. Each one pops out of the rock, scratches away for
## a few seconds, dives back in and comes up somewhere nearby. Past
## MAX_VISIBLE_HELPERS of a kind, more helpers just make them dig harder.

const STRIKE_EVERY := 0.6
const SITE_RADIUS := 3.2
const SIZE := 1.25

var field: DigField
var player: Player
var _crew: Array = []        # {node, type, state, t, spot, claws, dust}
var _rng := RandomNumberGenerator.new()
var _mats := {}


func _ready() -> void:
	_rng.seed = Balance.WORLD_SEED + 99


func site() -> Vector3:
	if GameState.lift_stop.is_finite():
		return GameState.lift_stop
	return Vector3(0.0, 0.0, 0.0)


func _process(delta: float) -> void:
	_sync_count()
	var s := site()
	var zone_ok := field != null and field.is_loaded(field.zone_of_y(s.y - 0.5))
	for m in _crew:
		_update_mole(m, delta, s, zone_ok)


func _sync_count() -> void:
	for type in Balance.HELPERS.size():
		var want := mini(int(GameState.helper_counts[type]), Balance.MAX_VISIBLE_HELPERS)
		var have := 0
		for m in _crew:
			if m.type == type:
				have += 1
		while have < want:
			_crew.append(_spawn(type))
			have += 1


func _visible_count(type: int) -> int:
	return mini(int(GameState.helper_counts[type]), Balance.MAX_VISIBLE_HELPERS)


func _spawn(type: int) -> Dictionary:
	var node := _model(type)
	node.visible = false
	add_child(node)
	var dust := CPUParticles3D.new()
	dust.amount = 10
	dust.lifetime = 0.7
	dust.emitting = false
	dust.local_coords = false
	dust.direction = Vector3(0, 1, 0)
	dust.spread = 60.0
	dust.initial_velocity_min = 1.0
	dust.initial_velocity_max = 2.2
	dust.gravity = Vector3(0, -9.0, 0)
	var box := BoxMesh.new()
	box.size = Vector3(0.05, 0.05, 0.05)
	var bm := StandardMaterial3D.new()
	bm.vertex_color_use_as_albedo = true
	box.material = bm
	dust.mesh = box
	dust.color = Color(0.45, 0.32, 0.2)
	node.add_child(dust)
	dust.position = Vector3(0, 0.1, -0.3)
	return {"node": node, "type": type, "state": "hidden", "t": _rng.randf_range(0.2, 2.0), "spot": Vector3.ZERO,
		"dust": dust, "strike": 0.0}


func _update_mole(m: Dictionary, delta: float, s: Vector3, zone_ok: bool) -> void:
	var node: Node3D = m.node
	m.t = float(m.t) - delta
	match str(m.state):
		"hidden":
			node.visible = false
			if float(m.t) <= 0.0 and zone_ok:
				var spot := _pick_spot(s)
				if spot.is_finite():
					m.spot = spot
					m.state = "up"
					m.t = 0.35
					node.visible = true
					node.position = spot
					node.rotation = Vector3(0, _rng.randf() * TAU, 0)
					node.scale = Vector3.ONE * 0.01 * SIZE
				else:
					m.t = 1.0
		"up":
			var k := 1.0 - clampf(float(m.t) / 0.35, 0.0, 1.0)
			node.scale = Vector3.ONE * maxf(0.01, k) * SIZE
			if float(m.t) <= 0.0:
				m.state = "dig"
				m.t = _rng.randf_range(3.0, 6.0)
				(m.dust as CPUParticles3D).emitting = true
		"dig":
			# Bob and scratch; strike the rock in front every so often.
			var tt := Time.get_ticks_msec() * 0.001
			node.scale = Vector3.ONE * SIZE
			node.position = (m.spot as Vector3) + Vector3(0, absf(sin(tt * 9.0 + float(m.type))) * 0.04, 0)
			var claws: Node3D = Models.find(node, "Claws")
			if claws != null:
				claws.rotation.x = sin(tt * 18.0) * 0.5
			m.strike = float(m.strike) + delta
			if m.strike >= STRIKE_EVERY and zone_ok:
				m.strike = 0.0
				var power := GameState.helper_power(int(m.type)) / float(maxi(1, _visible_count(int(m.type))))
				var at: Vector3 = (m.spot as Vector3) + Vector3(0, -0.2, 0)
				field.dig(at, 0.55, power * STRIKE_EVERY)
				# Follow the floor down as it goes.
				var fl := field.floor_below((m.spot as Vector3) + Vector3(0, 0.3, 0), 3.0)
				if fl > (m.spot as Vector3).y - 2.9:
					m.spot = Vector3((m.spot as Vector3).x, fl, (m.spot as Vector3).z)
				if player != null and player.position.distance_to(node.position) < 9.0:
					Sound.play_at("mole_dig", node.position, -14.0, 1.0 + 0.1 * float(m.type), 0.15, 0.25)
			if float(m.t) <= 0.0 or not zone_ok:
				m.state = "down"
				m.t = 0.3
				(m.dust as CPUParticles3D).emitting = false
		"down":
			var k := clampf(float(m.t) / 0.3, 0.0, 1.0)
			node.scale = Vector3.ONE * maxf(0.01, k) * SIZE
			if float(m.t) <= 0.0:
				m.state = "hidden"
				m.t = _rng.randf_range(0.4, 1.4)
				node.visible = false


func _pick_spot(s: Vector3) -> Vector3:
	for _try in 8:
		var a := _rng.randf() * TAU
		var r := _rng.randf_range(0.6, SITE_RADIUS)
		var x := clampf(s.x + cos(a) * r, -DigField.HALF + 0.6, DigField.HALF - 0.6)
		var z := clampf(s.z + sin(a) * r, -DigField.HALF + 0.6, DigField.HALF - 0.6)
		var top := s.y + 1.4
		if field.solid_at(Vector3(x, top, z)):
			continue
		var fl := field.floor_below(Vector3(x, top, z), 5.0)
		if fl < s.y - 4.0 or fl > s.y + 2.4:
			continue
		if player != null and Vector2(player.position.x - x, player.position.z - z).length() < 0.9 and absf(player.position.y - fl) < 1.5:
			continue   # not under your feet
		return Vector3(x, fl, z)
	return Vector3.INF


func _model(type: int) -> Node3D:
	## The Blender models (art/blender/world_models.py), with a little lamp
	## glow from the hard hat.
	var n := Node3D.new()
	var m := Models.instance("robomole" if type == 1 else "mole")
	n.add_child(m)
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.85, 0.55)
	light.light_energy = 0.5
	light.omni_range = 2.2
	light.position = Vector3(0, 0.4, -0.45)
	n.add_child(light)
	return n
