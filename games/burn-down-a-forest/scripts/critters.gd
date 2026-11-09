class_name Critters
extends Node3D
## Forest critters bolt out of trees as they catch, hop away from the fire,
## and pop out of sight with a little heart: always unharmed. Now and then a
## golden one turns up and drops a pouch of embers.

signal golden_found(amount: float, at: Vector3)
signal saved(icon: String)

const ICONS := ["🐇", "🦊", "🦌", "🦉", "🐿", "🦔", "🐸"]
const MAX_ACTIVE := 10
const RUN_TIME := 3.2

var grid: ForestGrid
var _active: Array = []            # {node, dir, t, golden, base}
var _pops: Array = []              # {node, t}
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func on_ignited(cells: Array) -> void:
	for c in cells:
		if grid.kind[c] < Balance.PINE or grid.kind[c] == Balance.ELDER:
			continue
		if _active.size() >= MAX_ACTIVE or _rng.randf() > Balance.CRITTER_CHANCE:
			continue
		spawn(grid.cell_pos(c), _rng.randf() < Balance.GOLDEN_CHANCE)


func spawn(at: Vector3, golden: bool) -> void:
	var l := Label3D.new()
	l.text = ICONS[_rng.randi() % ICONS.size()]
	l.font = UiTheme.bold()
	l.font_size = 96
	l.pixel_size = 0.0085
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.outline_size = 0
	l.modulate = Color(1.3, 1.1, 0.4) if golden else Color.WHITE
	l.position = at + Vector3(0, 0.45, 0)
	add_child(l)
	var away := -grid.wind + Vector2(_rng.randf_range(-0.9, 0.9), _rng.randf_range(-0.9, 0.9))
	if golden:
		var sparkle := Label3D.new()
		sparkle.text = "✨"
		sparkle.font = UiTheme.bold()
		sparkle.font_size = 64
		sparkle.pixel_size = 0.008
		sparkle.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		sparkle.position = Vector3(0.35, 0.4, 0)
		l.add_child(sparkle)
	_active.append({"node": l, "dir": away.normalized(), "t": 0.0, "golden": golden, "icon": l.text})


func _process(delta: float) -> void:
	var d := minf(delta, 0.05)
	for k in range(_active.size() - 1, -1, -1):
		var c: Dictionary = _active[k]
		var node: Label3D = c.node
		c.t = float(c.t) + d
		var dir: Vector2 = c.dir
		var p := node.position + Vector3(dir.x, 0, dir.y) * 4.8 * d
		var hop := absf(sin(float(c.t) * 11.0)) * 0.35
		p.y = maxf(grid.height_at(p.x, p.z), ForestGrid.WATER_LEVEL) + 0.45 + hop
		node.position = p
		if float(c.t) >= RUN_TIME:
			_pop(node.position, bool(c.golden))
			if bool(c.golden):
				var amount := maxf(80.0, GameState.income_per_minute() * Balance.GOLDEN_MINUTES)
				golden_found.emit(amount, node.position)
			GameState.critters_saved += 1
			saved.emit(str(c.icon))
			node.queue_free()
			_active.remove_at(k)
	for k in range(_pops.size() - 1, -1, -1):
		var pop: Dictionary = _pops[k]
		pop.t = float(pop.t) + d
		var n: Label3D = pop.node
		n.position.y += d * 1.2
		n.modulate.a = clampf(1.0 - float(pop.t) / 1.2, 0.0, 1.0)
		if float(pop.t) > 1.2:
			n.queue_free()
			_pops.remove_at(k)


func _pop(at: Vector3, golden: bool) -> void:
	var l := Label3D.new()
	l.text = "💛" if golden else "💖"
	l.font = UiTheme.bold()
	l.font_size = 72
	l.pixel_size = 0.008
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = at + Vector3(0, 0.3, 0)
	add_child(l)
	_pops.append({"node": l, "t": 0.0})
