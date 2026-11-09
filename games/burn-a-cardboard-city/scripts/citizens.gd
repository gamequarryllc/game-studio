class_name Citizens
extends Node3D
## The city's paper people: flat cut-out figures that hop out of a building when
## it catches and skip off to safety, then fold themselves up and are gone. And
## finds: things that were in the boxes (a rubber duck, a lost sock, a toy robot,
## now and then a golden ticket) that pop out of the rubble when a building falls.

signal found(key: String, golden: bool, amount: float, at: Vector3)
signal saved

const HOP_TIME := 0.32
const RUN_TIME := 3.4

var grid: CityGrid
var _active: Array = []              # {node, dir, t}
var _finds: Array = []               # {node, t, v}
var _pool: Array = []
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func on_ignited(list: Array) -> void:
	for s in list:
		var n := int(Balance.KINDS[grid.s_kind[s]].citizens)
		for k in n:
			if _active.size() >= Balance.MAX_CITIZENS or _rng.randf() > 0.7:
				continue
			var c: Vector2 = grid.s_center[s]
			var r: Rect2i = grid.s_rect[s]
			var off := Vector2(_rng.randf_range(-1, 1), _rng.randf_range(-1, 1)).normalized()
			var edge := Vector2(r.size) * Balance.CELL * 0.5 + Vector2(0.15, 0.15)
			spawn(Vector3(c.x + off.x * edge.x, 0.0, c.y + off.y * edge.y), off)


func spawn(at: Vector3, away: Vector2) -> void:
	var sp: Sprite3D
	if _pool.is_empty():
		sp = Sprite3D.new()
		sp.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
		sp.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
		sp.shaded = true
		sp.double_sided = true
		sp.offset = Vector2(0, 64)
		add_child(sp)
	else:
		sp = _pool.pop_back()
	sp.texture = Craft.icon3d("citizen_%d" % (_rng.randi() % 6))
	sp.pixel_size = _rng.randf_range(0.0026, 0.0032)
	sp.position = at
	sp.scale = Vector3.ONE
	sp.visible = true
	var dir := (away + Vector2(_rng.randf_range(-0.5, 0.5), _rng.randf_range(-0.5, 0.5))).normalized()
	_active.append({"node": sp, "dir": dir, "t": 0.0, "speed": _rng.randf_range(1.0, 1.5)})


func maybe_find(s: int, at: Vector3) -> void:
	var chance := float(Balance.KINDS[grid.s_kind[s]].find)
	if _rng.randf() >= chance:
		return
	var golden := _rng.randf() < Balance.GOLDEN_SHARE or grid.s_kind[s] == Balance.KEEP
	var key := "ticket" if golden else str(Balance.FINDS[_rng.randi() % Balance.FINDS.size()].key)
	var amount := GameState.find_amount(golden)
	var sp := Sprite3D.new()
	sp.texture = Craft.icon3d(key)
	sp.pixel_size = 0.004 if golden else 0.0034
	sp.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sp.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sp.no_depth_test = true
	sp.render_priority = 4
	sp.position = at + Vector3(0, 0.3, 0)
	add_child(sp)
	var spark := Gfx.particles(30, 0.08, [Color(1, 1, 0.9, 1), Color(1, 0.85, 0.35, 0.9), Color(1, 0.6, 0.2, 0)])
	spark.lifetime = 0.7
	spark.spread = 180.0
	spark.initial_velocity_min = 0.5
	spark.initial_velocity_max = 1.4
	spark.gravity = Vector3(0, -1.0, 0)
	sp.add_child(spark)
	spark.emitting = true
	_finds.append({"node": sp, "t": 0.0, "from": at + Vector3(0, 0.3, 0), "side": Vector3(_rng.randf_range(-0.6, 0.6), 0, _rng.randf_range(-0.6, 0.6))})
	found.emit(key, golden, amount, at)


func _process(delta: float) -> void:
	var d := minf(delta, 0.05 * maxf(1.0, Engine.time_scale))
	for k in range(_active.size() - 1, -1, -1):
		var c: Dictionary = _active[k]
		var sp: Sprite3D = c.node
		c.t = float(c.t) + d
		var t := float(c.t)
		var dir: Vector2 = c.dir
		var hop := fmod(t, HOP_TIME) / HOP_TIME
		var p := sp.position + Vector3(dir.x, 0, dir.y) * float(c.speed) * d
		p.y = sin(hop * PI) * 0.16
		sp.position = p
		# Squash on landing, stretch in the air (paper is springy).
		var sq := 1.0 - 0.18 * maxf(0.0, 1.0 - hop * 6.0)
		sp.scale = Vector3(1.0 / sq, sq, 1.0)
		if t > RUN_TIME:
			# Folds itself flat and slips away.
			var f := clampf((t - RUN_TIME) / 0.35, 0.0, 1.0)
			sp.scale = Vector3(1.0 - f, 1.0 - f * 0.3, 1.0)
			if f >= 1.0:
				sp.visible = false
				_pool.append(sp)
				_active.remove_at(k)
				GameState.citizens_saved += 1
				saved.emit()
		elif hop < d / HOP_TIME * 1.5:
			Sound.play_at("hop", sp.position, -16.0, 1.0, 0.25, 0.08)
	for k in range(_finds.size() - 1, -1, -1):
		var f: Dictionary = _finds[k]
		f.t = float(f.t) + d
		var t := float(f.t)
		var sp: Sprite3D = f.node
		var from: Vector3 = f.from
		var side: Vector3 = f.side
		var u := minf(1.0, t / 0.7)
		sp.position = from + side * u + Vector3(0, sin(u * PI * 0.5) * 1.4 + maxf(0.0, t - 0.7) * 0.8, 0)
		var pop := 1.0 + 0.35 * sin(minf(1.0, t / 0.25) * PI)
		sp.scale = Vector3.ONE * pop
		sp.modulate.a = 1.0 - clampf((t - 1.6) / 0.5, 0.0, 1.0)
		if t > 2.1:
			sp.queue_free()
			_finds.remove_at(k)


func active_count() -> int:
	return _active.size()
