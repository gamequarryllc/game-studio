class_name Critters
extends Node3D
## Forest critters bolt out of trees as they catch, hop away from the fire,
## and pop out of sight with a little drawn heart: always unharmed. Now and then
## a golden one turns up and drops a pouch of embers. Models: rabbit, fox and
## hedgehog from models/creatures.glb.

signal golden_found(amount: float, at: Vector3)
signal saved(kind: String)

const KINDS := ["rabbit", "fox", "hedgehog"]
const MAX_ACTIVE := 10
const RUN_TIME := 3.2

var grid: ForestGrid
var goldens := 0                   # golden critters found (the playthrough bot checks finds are reachable)
var _active: Array = []            # {node, dir, t, golden, kind}
var _pops: Array = []              # {node, t}
var _rng := RandomNumberGenerator.new()
var _mat: ShaderMaterial
var _gold_mat: ShaderMaterial


func _ready() -> void:
	_rng.randomize()
	_mat = ShaderMaterial.new()
	_mat.shader = load("res://shaders/prop.gdshader")
	_mat.set_shader_parameter("rim", 0.5)
	_gold_mat = ShaderMaterial.new()
	_gold_mat.shader = _mat.shader
	_gold_mat.set_shader_parameter("tint", Color("#F2C14E"))
	_gold_mat.set_shader_parameter("emit_all", 0.45)
	_gold_mat.set_shader_parameter("rim", 0.9)
	_gold_mat.set_shader_parameter("rim_color", Color("#FFE2A0"))


func on_ignited(cells: Array) -> void:
	for c in cells:
		if grid.kind[c] < Balance.PINE or grid.kind[c] == Balance.ELDER:
			continue
		if _active.size() >= MAX_ACTIVE or _rng.randf() > Balance.CRITTER_CHANCE:
			continue
		spawn(grid.cell_pos(c), _rng.randf() < Balance.GOLDEN_CHANCE)


func spawn(at: Vector3, golden: bool) -> void:
	var kind: String = KINDS[_rng.randi() % KINDS.size()]
	var node := MeshInstance3D.new()
	node.mesh = Models.creature(kind)
	node.material_override = _gold_mat if golden else _mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.scale = Vector3.ONE * (1.6 if kind == "hedgehog" else 1.4)
	node.position = at
	add_child(node)
	var away := -grid.wind + Vector2(_rng.randf_range(-0.9, 0.9), _rng.randf_range(-0.9, 0.9))
	away = away.normalized()
	node.rotation.y = atan2(away.x, away.y)
	_active.append({"node": node, "dir": away, "t": 0.0, "golden": golden, "kind": kind})


func _process(delta: float) -> void:
	var d := minf(delta, 0.05 * maxf(1.0, Engine.time_scale))
	for k in range(_active.size() - 1, -1, -1):
		var c: Dictionary = _active[k]
		var node: Node3D = c.node
		c.t = float(c.t) + d
		var dir: Vector2 = c.dir
		var hedgehog := str(c.kind) == "hedgehog"
		var speed := 3.2 if hedgehog else 5.2
		var p := node.position + Vector3(dir.x, 0, dir.y) * speed * d
		# rabbits and foxes bound (squash on landing), hedgehogs trundle
		var ph := float(c.t) * (16.0 if hedgehog else 10.0)
		var hop := 0.0 if hedgehog else absf(sin(ph)) * 0.4
		p.y = maxf(grid.height_at(p.x, p.z), ForestGrid.WATER_LEVEL) + hop
		node.position = p
		var base := 1.6 if hedgehog else 1.4
		var squash := 1.0 - 0.18 * (1.0 - absf(sin(ph))) if not hedgehog else 1.0 + 0.04 * sin(ph)
		node.scale = Vector3(base * (2.0 - squash), base * squash, base)
		node.rotation.x = 0.0 if hedgehog else -cos(ph) * 0.18
		if float(c.t) >= RUN_TIME:
			_pop(node.position, bool(c.golden))
			if bool(c.golden):
				goldens += 1
				var amount := GameState.golden_amount()
				golden_found.emit(amount, node.position)
			GameState.critters_saved += 1
			saved.emit(str(c.kind))
			node.queue_free()
			_active.remove_at(k)
	for k in range(_pops.size() - 1, -1, -1):
		var pop: Dictionary = _pops[k]
		pop.t = float(pop.t) + d
		var n: Sprite3D = pop.node
		var t := float(pop.t) / 1.2
		n.position.y += d * 1.1
		var s := 0.006 * (1.0 + 0.4 * sin(minf(t * 4.0, 1.0) * PI))   # a little bounce as it appears
		n.pixel_size = s
		n.modulate.a = clampf(1.0 - t * t, 0.0, 1.0)
		if float(pop.t) > 1.2:
			n.queue_free()
			_pops.remove_at(k)


func _pop(at: Vector3, golden: bool) -> void:
	var s := Sprite3D.new()
	s.texture = UiTheme.icon("hare" if golden else "heart")
	s.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	s.pixel_size = 0.006
	s.no_depth_test = true
	s.shaded = false
	s.position = at + Vector3(0, 0.8, 0)
	add_child(s)
	_pops.append({"node": s, "t": 0.0})
