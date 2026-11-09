class_name HelperSwarm
extends Node3D
## Helpers that go and set things alight on their own:
##  Wind-up cars: tin toy cars with a sparkler taped to the back. They drive the
##    streets (a path along the street grid), pull up beside a house they can
##    light, and hold the sparkler to it until it catches.
##  Paper planes: a lit fuse on the tail. They glide over the blocks, circle the
##    roof of an office box and hold their fuse to it.
## Each picks something near the giant. Past MAX_VISIBLE_HELPERS of a kind, the
## ones you see just burn hotter.

var grid: CityGrid
var giant: Node3D
var _walkers: Array = []
var _rng := RandomNumberGenerator.new()
var _next_id := 0
var _nodes := {}                     # Vector2i street crossing -> world position
var _links := {}                     # Vector2i -> Array of Vector2i


func _ready() -> void:
	_rng.seed = Balance.WORLD_SEED + 31
	_build_streets()


func _line_pos(k: int) -> float:
	return grid.origin.x + (Balance.lane(k) + 0.5) * Balance.CELL


func _build_streets() -> void:
	## The street grid as a graph of crossings; the castle's inner streets are gone.
	var lines := Balance.BLOCKS + 1
	for j in lines:
		for i in lines:
			var key := Vector2i(i, j)
			if i >= 4 and i <= 5 and j >= 4 and j <= 5:
				continue
			_nodes[key] = Vector3(_line_pos(i), 0.0, _line_pos(j))
	for key in _nodes:
		var out: Array = []
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var o: Vector2i = key + d
			if not _nodes.has(o):
				continue
			# A street segment through the castle yard doesn't exist.
			var mid := (_nodes[key] as Vector3 + _nodes[o] as Vector3) * 0.5
			var c := grid.cell_at(mid.x, mid.z)
			if c >= 0 and grid.ground[c] == CityGrid.G_YARD:
				continue
			out.append(o)
		_links[key] = out


func _nearest_node(p: Vector3) -> Vector2i:
	var best := Vector2i.ZERO
	var bd := INF
	for key in _nodes:
		var d := (_nodes[key] as Vector3).distance_squared_to(p)
		if d < bd:
			bd = d
			best = key
	return best


func _path(from: Vector2i, to: Vector2i) -> Array:
	## Breadth-first along the streets: crossings from `from` to `to`.
	var prev := {from: from}
	var q: Array = [from]
	while not q.is_empty():
		var k: Vector2i = q.pop_front()
		if k == to:
			break
		for o in _links.get(k, []):
			if not prev.has(o):
				prev[o] = k
				q.append(o)
	if not prev.has(to):
		return []
	var out: Array = []
	var k: Vector2i = to
	while k != from:
		out.push_front(k)
		k = prev[k]
	return out


func _kerb_point(s: int) -> Vector3:
	## Where a car pulls up to reach a structure: on the nearest street middle line.
	var c: Vector2 = grid.s_center[s]
	var best := Vector3.INF
	var bd := INF
	for k in Balance.BLOCKS + 1:
		var lp := _line_pos(k)
		for p in [Vector3(c.x, 0, lp), Vector3(lp, 0, c.y)]:
			var d := Vector2(p.x, p.z).distance_to(c)
			if d < bd:
				bd = d
				best = p
	return best


# =====================================================================================
# Per frame
# =====================================================================================
func _process(delta: float) -> void:
	if grid == null:
		return
	var d := minf(delta, 0.05 * maxf(1.0, Engine.time_scale))
	_sync()
	for w in _walkers:
		if int(w.type) == 0:
			_drive(w, d)
		else:
			_fly(w, d)


func _sync() -> void:
	for type in Balance.HELPERS.size():
		var want := mini(int(GameState.helper_counts[type]), Balance.MAX_VISIBLE_HELPERS)
		var have := 0
		for w in _walkers:
			if int(w.type) == type:
				have += 1
		while have < want:
			_spawn(type)
			have += 1


func _spawn(type: int) -> void:
	var node := Node3D.new()
	add_child(node)
	var body := MeshInstance3D.new()
	body.mesh = ModelLib.prop_mesh("windup_car" if type == 0 else "paper_plane")
	node.add_child(body)
	var spark := Gfx.particles(24, 0.05, [Color(1, 1, 0.85, 1), Color(1, 0.75, 0.3, 1), Color(1, 0.4, 0.1, 0)])
	spark.lifetime = 0.35
	spark.spread = 180.0
	spark.initial_velocity_min = 0.6
	spark.initial_velocity_max = 1.6
	spark.gravity = Vector3(0, -3.0, 0)
	add_child(spark)
	spark.emitting = true
	var start: Vector3 = giant.global_position if giant != null else Vector3.ZERO
	var at := _nodes[_nearest_node(start)] as Vector3 if type == 0 else start + Vector3(0, 3.0, 0)
	_next_id += 1
	_walkers.append({"node": node, "spark": spark, "type": type, "pos": at, "target": -1, "path": [], "goal": at,
		"t": 0.0, "id": "helper%d" % _next_id, "phase": _rng.randf() * TAU, "cool": _rng.randf() * 0.5, "dir": Vector3.FORWARD})
	node.position = at


func _pick(w: Dictionary, power: float, kinds: Array) -> int:
	var near := Vector2(giant.global_position.x, giant.global_position.z) if giant != null else Vector2.ZERO
	var t := grid.find_target(near, 14.0, power, kinds, 30)
	if t < 0:
		var p: Vector3 = w.pos
		t = grid.find_target(Vector2(p.x, p.z), 24.0, power, kinds, 30)
	return t


func _drive(w: Dictionary, d: float) -> void:
	var power := GameState.helper_power(0)
	var target: int = w.target
	w.cool = float(w.cool) - d
	if target >= 0 and not grid.can_light(target, power):
		target = -1
		w.target = -1
	if target < 0 and float(w.cool) <= 0.0:
		target = _pick(w, power, [Balance.HOUSE, Balance.CAR, Balance.TREE])
		w.target = target
		w.t = 0.0
		if target < 0:
			w.cool = 1.5
		else:
			var goal := _kerb_point(target)
			w.goal = goal
			var a := _nearest_node(w.pos)
			var b := _nearest_node(goal)
			var path := _path(a, b)
			var pts: Array = [_nodes[a]]
			for k in path:
				pts.append(_nodes[k])
			pts.append(goal)
			w.path = pts
	var pos: Vector3 = w.pos
	var path: Array = w.path
	var speed := float(Balance.HELPERS[0].speed) * (1.6 if GameState.is_helper_rush_active() else 1.0)
	var moving := false
	if not path.is_empty():
		var next: Vector3 = path[0]
		var to := next - pos
		to.y = 0.0
		if to.length() < 0.05:
			path.pop_front()
		else:
			var step := minf(to.length(), speed * d)
			pos += to.normalized() * step
			w.dir = to.normalized()
			moving = true
	w.pos = pos
	var node: Node3D = w.node
	node.position = pos + Vector3(0, absf(sin(Time.get_ticks_msec() * 0.03 + float(w.phase))) * 0.012 if moving else 0.0, 0)
	var dir: Vector3 = w.dir
	node.rotation.y = lerp_angle(node.rotation.y, atan2(dir.x, dir.z), 1.0 - exp(-d * 12.0))
	var tip := node.global_transform * Vector3(0, 0.33, -0.28)
	var spark: CPUParticles3D = w.spark
	spark.global_position = tip
	if target >= 0 and path.is_empty():
		var c: Vector2 = grid.s_center[target]
		var aim := c + (Vector2(pos.x, pos.z) - c).normalized() * 0.4
		grid.set_source(w.id, aim, 0.7, power * Balance.COOL)
		spark.amount = 24
		spark.direction = (Vector3(c.x, 0.4, c.y) - tip).normalized()
		spark.spread = 20.0
		spark.initial_velocity_max = 2.4
		w.t = float(w.t) + d
		if float(w.t) > 6.0:
			w.target = -1
			w.cool = 0.5
	else:
		grid.clear_source(w.id)
		spark.spread = 180.0
		spark.initial_velocity_max = 1.6


func _fly(w: Dictionary, d: float) -> void:
	var power := GameState.helper_power(1)
	var target: int = w.target
	w.cool = float(w.cool) - d
	if target >= 0 and not grid.can_light(target, power):
		target = -1
		w.target = -1
	if target < 0 and float(w.cool) <= 0.0:
		target = _pick(w, power, [Balance.OFFICE, Balance.HOUSE, Balance.TRUCK])
		w.target = target
		w.t = 0.0
		if target < 0:
			w.cool = 1.5
	var pos: Vector3 = w.pos
	var ph := float(w.phase) + Time.get_ticks_msec() * 0.0012
	var goal: Vector3
	if target >= 0:
		var c: Vector2 = grid.s_center[target]
		goal = Vector3(c.x + cos(ph) * 0.9, grid.s_height[target] + 0.5, c.y + sin(ph) * 0.9)
	else:
		var g: Vector3 = giant.global_position if giant != null else Vector3.ZERO
		goal = g + Vector3(cos(ph * 0.7) * 4.0, 3.2 + sin(ph) * 0.4, sin(ph * 0.7) * 4.0)
	var speed := float(Balance.HELPERS[1].speed) * (1.6 if GameState.is_helper_rush_active() else 1.0)
	var to := goal - pos
	var vel := to.limit_length(speed)
	pos += vel * d
	w.pos = pos
	var node: Node3D = w.node
	node.position = pos
	if vel.length() > 0.05:
		var dir := vel.normalized()
		node.rotation.y = lerp_angle(node.rotation.y, atan2(dir.x, dir.z), 1.0 - exp(-d * 6.0))
		node.rotation.z = lerpf(node.rotation.z, clampf(-to.x * 0.1, -0.5, 0.5), 1.0 - exp(-d * 3.0))
	var tail := node.global_transform * Vector3(0, 0.03, -0.22)
	(w.spark as CPUParticles3D).global_position = tail
	if target >= 0 and Vector2(to.x, to.z).length() < 1.6:
		var c: Vector2 = grid.s_center[target]
		grid.set_source(w.id, c, 0.8, power * Balance.COOL)
		w.t = float(w.t) + d
		if float(w.t) > 7.0:
			w.target = -1
			w.cool = 0.5
	else:
		grid.clear_source(w.id)


func count() -> int:
	return _walkers.size()


func clear() -> void:
	for w in _walkers:
		grid.clear_source(w.id)
		(w.node as Node3D).queue_free()
		(w.spark as Node3D).queue_free()
	_walkers.clear()
