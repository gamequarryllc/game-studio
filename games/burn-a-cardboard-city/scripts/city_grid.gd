class_name CityGrid
extends RefCounted
## The cardboard city as data, and the fire that brings it down.
##
## The floor is a grid of Balance.CELL cells (grid x -> world x, grid y -> world z,
## centred on the origin). Every building, car, paper tree and toy fire truck is a
## STRUCTURE covering a rectangle of cells. Fire lives on structures, not cells:
##  - heat builds up on a structure (tool, helpers, burning neighbours, debris)
##    and bleeds away at Balance.COOL per second; past its threshold it catches;
##  - a burning structure's fire grows over its `fill` time, pushes heat into its
##    precomputed neighbours (closer ones get more, downwind ones more again), and
##    eats its own integrity;
##  - at zero integrity it collapses: crumples where it stands, or (tall ones)
##    topples over in a direction, and when it hits the ground it dumps burning
##    cardboard (`spill` heat) on everything under it and scatters burning debris
##    on the empty floor. That's how fire crosses streets and how chains happen;
##  - loose debris burns for a few seconds and warms whatever it touches.
## Toy fire trucks squirt water at the nearest fire every few seconds until they
## burn themselves. Puddles make the buildings next to them damp.
##
## Everything runs at a fixed 10 Hz tick over sparse sets (hot, burning,
## falling, debris). The view and the game read events with take_*().

const STANDING := 0
const BURNING := 1
const FALLING := 2
const RUBBLE := 3
const CRUMPLE := 255

# What the floor is, per cell.
const G_STREET := 0
const G_LAWN := 1
const G_PAVE := 2
const G_PLAZA := 3
const G_YARD := 4
const G_PUDDLE := 5
const G_ROAD := 6       # a street inside a district (grey card with tape lines); G_STREET is bare warehouse floor

const DX := [1, -1, 0, 0, 1, 1, -1, -1]
const DY := [0, 0, 1, -1, 1, -1, 1, -1]
const FALL_DIRS := [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]

var n: int = Balance.GRID
var origin := Vector2.ZERO            # world x/z of the corner of cell (0, 0)
var ground := PackedByteArray()
var sid := PackedInt32Array()         # structure on each cell (-1: none)
var zone := PackedByteArray()
var damp := PackedByteArray()
var deb_fuel := PackedFloat32Array()  # seconds of burning debris left on a cell

# Structures (parallel arrays, index = structure id).
var count := 0
var s_kind := PackedByteArray()
var s_model := PackedStringArray()    # mesh name
var s_rect: Array[Rect2i] = []
var s_rot := PackedByteArray()        # 0: front faces +z (south), 1: +x, 2: -z, 3: -x
var s_height := PackedFloat32Array()
var s_zone := PackedByteArray()
var s_state := PackedByteArray()
var s_heat := PackedFloat32Array()
var s_thresh := PackedFloat32Array()
var s_fire := PackedFloat32Array()    # 0..1 how much of it is alight
var s_integ := PackedFloat32Array()   # 1 -> 0, it falls at 0
var s_vary := PackedFloat32Array()
var s_fall := PackedByteArray()       # 0..3 index into FALL_DIRS, or CRUMPLE
var s_fall_t := PackedFloat32Array()
var s_wet := PackedFloat32Array()
var s_caught := PackedFloat32Array()  # sim time it last caught
var s_center := PackedVector2Array()  # world x/z
var s_cells: Array = []               # PackedInt32Array per structure
var s_order: Array = []               # its cells in the order the fire takes them
var s_nb: Array = []                  # PackedInt32Array neighbours
var s_nw: Array = []                  # PackedFloat32Array heat weight for each
var s_ngap: Array = []                # PackedByteArray gap (empty cells) to each
var s_ndir: Array = []                # PackedVector2Array unit direction to each

var hot := {}
var burning := {}
var falling := {}
var debris := {}
var wet := {}
var trucks: Array = []
var truck_t := {}
var truck_water := {}                 # truck id -> squirts left in its tank

var wind := Vector2(0.6, -0.8).normalized()
var wind_strength := 0.5
var spread_mult := 1.0                # Dry cardboard (set by the game every frame)
var burn_mult := 1.0                  # Cheap glue: burn time x this
var sources := {}                     # id -> [Vector2 world xz, radius, heat per second]
var clock := 0.0
var ticks := 0

# Events, handed over by take_*() and then cleared.
var ignited: Array = []               # structure ids that just caught
var collapsed: Array = []             # structure ids that started to fall
var impacts: Array = []               # [id, raw bonus coins, chain length] as they hit the ground
var extinguished: Array = []
var sprays: Array = []                # [truck id, target id]
var debris_new: Array = []            # cells
var debris_out: Array = []
var spots: Array = []                 # [from Vector3, to Vector3] burning scraps on the wind
var pay_pending := 0.0
var pay_by := {}                      # id -> raw coins paid while burning, since last take

var chain := 0
var best_chain := 0
var _last_impact := -100.0
var total := 0
var fallen := 0
var zone_total: Array = [0, 0, 0, 0]
var zone_fallen: Array = [0, 0, 0, 0]
var keep_id := -1

var _acc := 0.0
var rng := RandomNumberGenerator.new()


func _init() -> void:
	origin = Vector2(-n * Balance.CELL * 0.5, -n * Balance.CELL * 0.5)


# =====================================================================================
# Building the city
# =====================================================================================
func generate(seed: int) -> void:
	rng.seed = seed
	var size := n * n
	ground.resize(size)
	sid.resize(size)
	zone.resize(size)
	damp.resize(size)
	deb_fuel.resize(size)
	ground.fill(G_STREET)
	sid.fill(-1)
	damp.fill(0)
	deb_fuel.fill(0.0)
	for y in n:
		for x in n:
			zone[x + y * n] = Balance.zone_for_cell(x, y)
	# Streets inside a district are grey card; the gaps between districts are bare floor.
	var axis_street := PackedInt32Array()
	axis_street.resize(n)
	for c in n:
		axis_street[c] = Balance.street_of(c)
	for y in n:
		for x in n:
			var sx := axis_street[x]
			var sy := axis_street[y]
			if sx < 0 and sy < 0:
				continue
			var gap: bool = Balance.GAP_STREETS.has(sx) or Balance.GAP_STREETS.has(sy)
			ground[x + y * n] = G_STREET if gap else G_ROAD
	for by in Balance.BLOCKS:
		for bx in Balance.BLOCKS:
			var x0 := Balance.block_start(bx)
			var y0 := Balance.block_start(by)
			var ring := maxi(absi(bx - 4), absi(by - 4))
			var z: int = [3, 3, 2, 1, 0][ring]
			var g: int = [G_LAWN, G_PAVE, G_PLAZA, G_YARD][z]
			for y in range(y0, y0 + Balance.BLOCK):
				for x in range(x0, x0 + Balance.BLOCK):
					ground[x + y * n] = g
			match z:
				0:
					_suburb_block(x0, y0)
				1:
					_downtown_block(x0, y0)
				2:
					if bx == 4 and by == 6:
						_approach_block(x0, y0)   # keep the view from the door to the castle open
					else:
						_sky_block(x0, y0)
	_castle()
	_cars_and_trucks()
	_puddles()
	_finish()


func _face_street(lx: int, ly: int, w: int, h: int) -> int:
	## Which way a building on a lot at (lx, ly) inside its block should face: the nearest street.
	var opts: Array = []
	if ly == 0:
		opts.append(2)
	if ly + h >= Balance.BLOCK:
		opts.append(0)
	if lx == 0:
		opts.append(3)
	if lx + w >= Balance.BLOCK:
		opts.append(1)
	if opts.is_empty():
		return rng.randi() % 4
	return opts[rng.randi() % opts.size()]


func add_structure(kind: int, rect: Rect2i, model: String, height: float, rot: int) -> int:
	var id := count
	count += 1
	s_kind.append(kind)
	s_model.append(model)
	s_rect.append(rect)
	s_rot.append(rot)
	s_height.append(height)
	var cz := Balance.zone_for_cell(rect.position.x + rect.size.x / 2, rect.position.y + rect.size.y / 2)
	s_zone.append(cz)
	s_state.append(STANDING)
	s_heat.append(0.0)
	s_thresh.append(0.0)
	s_fire.append(0.0)
	s_integ.append(1.0)
	s_vary.append(rng.randf())
	s_fall.append(CRUMPLE)
	s_fall_t.append(0.0)
	s_wet.append(0.0)
	s_caught.append(-100.0)
	var cells := PackedInt32Array()
	for y in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			var c := x + y * n
			sid[c] = id
			cells.append(c)
	s_cells.append(cells)
	s_order.append(cells)
	var wx := origin.x + (rect.position.x + rect.size.x * 0.5) * Balance.CELL
	var wz := origin.y + (rect.position.y + rect.size.y * 0.5) * Balance.CELL
	s_center.append(Vector2(wx, wz))
	return id


func _pick_model(kind: int) -> Array:
	var list: Array = Balance.MODELS[kind]
	return list[rng.randi() % list.size()]


func _suburb_block(x0: int, y0: int) -> void:
	for ly in [0, 3, 6]:
		for lx in [0, 3, 6]:
			var r := rng.randf()
			if r < 0.8:
				var m := _pick_model(Balance.HOUSE)
				add_structure(Balance.HOUSE, Rect2i(x0 + lx, y0 + ly, 2, 2), m[0], m[1], _face_street(lx, ly, 2, 2))
			elif r < 0.93:
				for k in rng.randi_range(1, 3):
					var tx: int = x0 + lx + rng.randi_range(0, 1)
					var ty: int = y0 + ly + rng.randi_range(0, 1)
					if sid[tx + ty * n] < 0:
						var m := _pick_model(Balance.TREE)
						add_structure(Balance.TREE, Rect2i(tx, ty, 1, 1), m[0], m[1], rng.randi() % 4)
	# Now and then a paper tree in a yard between houses: fire walks across them.
	for ly in Balance.BLOCK:
		for lx in Balance.BLOCK:
			if (lx == 2 or lx == 5 or ly == 2 or ly == 5) and rng.randf() < 0.05:
				var c := x0 + lx + (y0 + ly) * n
				if sid[c] < 0:
					var m := _pick_model(Balance.TREE)
					add_structure(Balance.TREE, Rect2i(x0 + lx, y0 + ly, 1, 1), m[0], m[1], rng.randi() % 4)


func _downtown_block(x0: int, y0: int) -> void:
	var cols: Array = [[0, 3], [4, 4]] if rng.randf() < 0.5 else [[0, 4], [5, 3]]
	var rows: Array = [[0, 3], [4, 4]] if rng.randf() < 0.5 else [[0, 4], [5, 3]]
	for rw in rows:
		for cl in cols:
			var lx: int = cl[0]
			var ly: int = rw[0]
			var w: int = cl[1]
			var h: int = rw[1]
			var r := rng.randf()
			if r < 0.07:
				# A little car park.
				for k in 2:
					var cx := x0 + lx + k * 2
					if k * 2 + 1 < w:
						var m := _pick_model(Balance.CAR)
						add_structure(Balance.CAR, Rect2i(cx, y0 + ly, 1, 2), m[0], m[1], 0 if rng.randf() < 0.5 else 2)
				continue
			if r < 0.11:
				var m := _pick_model(Balance.TREE)
				add_structure(Balance.TREE, Rect2i(x0 + lx + 1, y0 + ly + 1, 1, 1), m[0], m[1], 0)
				continue
			var rect := Rect2i(x0 + lx, y0 + ly, w, h)
			if w != h:
				var rot := _face_street(lx, ly, w, h)
				# The wide office is long along its own x: keep that along the lot's long side.
				if w > h:
					rot = 0 if rot == 1 or rot == 0 else 2
				else:
					rot = 1 if rot == 0 or rot == 1 else 3
				add_structure(Balance.OFFICE, rect, Balance.OFFICE_WIDE[0], Balance.OFFICE_WIDE[1], rot)
			else:
				var m := _pick_model(Balance.OFFICE)
				add_structure(Balance.OFFICE, rect, m[0], m[1], _face_street(lx, ly, w, h))


func _sky_block(x0: int, y0: int) -> void:
	var quads := [Vector2i(0, 0), Vector2i(4, 0), Vector2i(0, 4), Vector2i(4, 4)]
	var taken := [false, false, false, false]
	if rng.randf() < 0.25:
		# One long skyscraper down one side.
		var side := rng.randi() % 2
		var m: Array = Balance.SKY_WIDE
		add_structure(Balance.SKY, Rect2i(x0 + side * 4, y0, 4, 8), m[0], m[1], 0 if rng.randf() < 0.5 else 2)
		taken[side] = true
		taken[side + 2] = true
	var placed := 0
	for k in 4:
		if taken[k]:
			placed += 1
			continue
		var q: Vector2i = quads[k]
		if rng.randf() < 0.62 or (k == 3 and placed == 0):
			var m := _pick_model(Balance.SKY)
			add_structure(Balance.SKY, Rect2i(x0 + q.x, y0 + q.y, 4, 4), m[0], m[1], _face_street(q.x, q.y, 4, 4))
			placed += 1
		elif rng.randf() < 0.5:
			var m := _pick_model(Balance.TREE)
			add_structure(Balance.TREE, Rect2i(x0 + q.x + 1, y0 + q.y + 2, 1, 1), m[0], m[1], 0)


func _approach_block(x0: int, y0: int) -> void:
	## The block in front of the castle gate: a little square of paper trees, so the
	## castle stays in sight from the warehouse door.
	ground_fill(x0, y0, G_LAWN)
	for p in [Vector2i(1, 1), Vector2i(6, 1), Vector2i(1, 6), Vector2i(6, 6), Vector2i(3, 2), Vector2i(4, 5)]:
		var m := _pick_model(Balance.TREE)
		add_structure(Balance.TREE, Rect2i(x0 + p.x, y0 + p.y, 1, 1), m[0], m[1], rng.randi() % 4)


func ground_fill(x0: int, y0: int, g: int) -> void:
	for y in range(y0, y0 + Balance.BLOCK):
		for x in range(x0, x0 + Balance.BLOCK):
			ground[x + y * n] = g


func _castle() -> void:
	## The castle fills the three middle blocks and the streets between them.
	var c0 := Balance.block_start(3)                    # 46
	var sz := Balance.block_start(5) + Balance.BLOCK - c0   # 30
	for y in range(c0, c0 + sz):
		for x in range(c0, c0 + sz):
			ground[x + y * n] = G_YARD
	# A moat of puddles round the outside (and a drawbridge on the south side).
	for y in range(c0 - 2, c0 + sz + 2):
		for x in range(c0 - 2, c0 + sz + 2):
			var inside := x >= c0 and y >= c0 and x < c0 + sz and y < c0 + sz
			if inside:
				continue
			if y >= c0 + sz and x >= c0 + 12 and x < c0 + 20:
				continue
			ground[x + y * n] = G_PUDDLE
	var t := Balance.MODELS[Balance.TURRET][0]
	for p in [Vector2i(0, 0), Vector2i(26, 0), Vector2i(0, 26), Vector2i(26, 26)]:
		add_structure(Balance.TURRET, Rect2i(c0 + p.x, c0 + p.y, 4, 4), t[0], t[1], 0 if p.y > 0 else 2)
	var wl: Array = Balance.MODELS[Balance.WALL][0]
	var ws: Array = Balance.MODELS[Balance.WALL][1]
	# North wall (faces north), long-short-long.
	add_structure(Balance.WALL, Rect2i(c0 + 4, c0 + 1, 8, 2), wl[0], wl[1], 2)
	add_structure(Balance.WALL, Rect2i(c0 + 12, c0 + 1, 6, 2), ws[0], ws[1], 2)
	add_structure(Balance.WALL, Rect2i(c0 + 18, c0 + 1, 8, 2), wl[0], wl[1], 2)
	# South wall: a long wall, the gatehouse, a short wall (on purpose lopsided).
	add_structure(Balance.WALL, Rect2i(c0 + 4, c0 + 27, 8, 2), wl[0], wl[1], 0)
	var g: Array = Balance.MODELS[Balance.GATE][0]
	add_structure(Balance.GATE, Rect2i(c0 + 12, c0 + 26, 8, 3), g[0], g[1], 0)
	add_structure(Balance.WALL, Rect2i(c0 + 20, c0 + 27, 6, 2), ws[0], ws[1], 0)
	# West and east walls.
	for side in [[1, 3], [27, 1]]:
		var x: int = side[0]
		var rot: int = side[1]
		add_structure(Balance.WALL, Rect2i(c0 + x, c0 + 4, 2, 8), wl[0], wl[1], rot)
		add_structure(Balance.WALL, Rect2i(c0 + x, c0 + 12, 2, 6), ws[0], ws[1], rot)
		add_structure(Balance.WALL, Rect2i(c0 + x, c0 + 18, 2, 8), wl[0], wl[1], rot)
	var k: Array = Balance.MODELS[Balance.KEEP][0]
	keep_id = add_structure(Balance.KEEP, Rect2i(c0 + 10, c0 + 10, 10, 10), k[0], k[1], 0)


func _street_lines() -> Array:
	## [x0, y0, dx, dy, length, street]: the middle lane of every street segment between crossings.
	var out: Array = []
	for k in Balance.BLOCKS + 1:
		var lane := Balance.lane(k)
		for b in Balance.BLOCKS:
			var a := Balance.block_start(b)
			out.append([a, lane, 1, 0, Balance.BLOCK, k])
			out.append([lane, a, 0, 1, Balance.BLOCK, k])
	return out


func _cars_and_trucks() -> void:
	var lines := _street_lines()
	var truck_spots: Array = []
	for L in lines:
		var x0: int = L[0]
		var y0: int = L[1]
		var dx: int = L[2]
		var dy: int = L[3]
		var length: int = L[4]
		var mid := Balance.zone_for_cell(x0 + dx * length / 2, y0 + dy * length / 2)
		if mid >= 3 or Balance.GAP_STREETS.has(int(L[5])):
			continue   # no parking on the bare floor between districts
		var p := 0
		while p + 2 <= length:
			var cx := x0 + dx * p
			var cy := y0 + dy * p
			var free := true
			for q in 2:
				var c := (cx + dx * q) + (cy + dy * q) * n
				if sid[c] >= 0 or ground[c] == G_PUDDLE:
					free = false
			var chance: float = [0.16, 0.12, 0.06, 0.0][mid]
			if free and rng.randf() < chance:
				var m := _pick_model(Balance.CAR)
				var rect := Rect2i(cx, cy, 2, 1) if dx == 1 else Rect2i(cx, cy, 1, 2)
				var rot := (1 if rng.randf() < 0.5 else 3) if dx == 1 else (0 if rng.randf() < 0.5 else 2)
				add_structure(Balance.CAR, rect, m[0], m[1], rot)
				p += 4
			else:
				p += 1
		if mid <= 1:
			truck_spots.append(L)
	# Toy fire trucks: a few in the suburbs (not by the giant's starting street) and downtown.
	var want := {0: 7, 1: 5}
	var placed := {0: 0, 1: 0}
	for i in range(truck_spots.size() - 1, 0, -1):   # seeded shuffle (Array.shuffle uses the global RNG)
		var j := rng.randi_range(0, i)
		var tmp = truck_spots[i]
		truck_spots[i] = truck_spots[j]
		truck_spots[j] = tmp
	for L in truck_spots:
		var x0: int = L[0] + L[2] * 3
		var y0: int = L[1] + L[3] * 3
		var dx: int = L[2]
		var z := Balance.zone_for_cell(x0, y0)
		if not want.has(z) or int(placed[z]) >= int(want[z]):
			continue
		if y0 > n - 25:
			continue   # leave the first streets the giant sees to the fire
		var ok := true
		for q in range(-1, 4):
			var c := (x0 + dx * q) + (y0 + (1 - dx) * q) * n
			if c < 0 or c >= n * n or sid[c] >= 0:
				ok = false
		if not ok:
			continue
		var m: Array = Balance.MODELS[Balance.TRUCK][0]
		var rect := Rect2i(x0, y0, 3, 1) if dx == 1 else Rect2i(x0, y0, 1, 3)
		var rot := 1 if dx == 1 else 0
		var id := add_structure(Balance.TRUCK, rect, m[0], m[1], rot)
		trucks.append(id)
		truck_t[id] = rng.randf() * Balance.SPRAY_EVERY
		truck_water[id] = Balance.TRUCK_TANK
		placed[z] = int(placed[z]) + 1


func _puddles() -> void:
	## Puddles from a leaky roof, on streets and lawns: the buildings next to them are damp.
	var made := 0
	var tries := 0
	while made < 14 and tries < 400:
		tries += 1
		var cx := rng.randi_range(4, n - 5)
		var cy := rng.randi_range(4, n - 5)
		if Balance.zone_for_cell(cx, cy) >= 3:
			continue
		var r := rng.randf_range(0.9, 2.2)
		var ok := true
		var cells: Array = []
		for y in range(cy - 3, cy + 4):
			for x in range(cx - 3, cx + 4):
				var d := Vector2(x - cx, (y - cy) * 1.3).length()
				if d <= r:
					var c := x + y * n
					if sid[c] >= 0:
						continue
					cells.append(c)
		if cells.size() < 3:
			continue
		for c in cells:
			ground[c] = G_PUDDLE
		made += 1


func _finish() -> void:
	for y in n:
		for x in n:
			var i := x + y * n
			damp[i] = 0
			for oy in range(-2, 3):
				for ox in range(-2, 3):
					var xx := x + ox
					var yy := y + oy
					if xx >= 0 and yy >= 0 and xx < n and yy < n and ground[xx + yy * n] == G_PUDDLE:
						damp[i] = 1
	total = count
	zone_total = [0, 0, 0, 0]
	zone_fallen = [0, 0, 0, 0]
	for s in count:
		var def: Dictionary = Balance.KINDS[s_kind[s]]
		var t := float(def.ignite) * rng.randf_range(0.8, 1.25)
		if s_kind[s] == Balance.KEEP:
			t = float(def.ignite)
		var wet := false
		for c in s_cells[s]:
			if damp[c] == 1:
				wet = true
		if wet:
			var cap := float(Balance.TOOLS[Balance.TIER[s_kind[s]]].power) * 0.95
			t = minf(t * Balance.DAMP_MULT, maxf(t, cap))
		s_thresh[s] = t
		zone_total[s_zone[s]] += 1
	_build_neighbours()


func _build_neighbours() -> void:
	s_nb.clear()
	s_nw.clear()
	s_ngap.clear()
	s_ndir.clear()
	var reach := Balance.GAP_WEIGHT.size()
	for s in count:
		var r: Rect2i = s_rect[s]
		var found := {}
		for y in range(maxi(0, r.position.y - reach), mini(n, r.end.y + reach)):
			for x in range(maxi(0, r.position.x - reach), mini(n, r.end.x + reach)):
				var t := sid[x + y * n]
				if t < 0 or t == s or found.has(t):
					continue
				found[t] = true
		var nb := PackedInt32Array()
		var nw := PackedFloat32Array()
		var ng := PackedByteArray()
		var nd := PackedVector2Array()
		for t in found:
			var g := rect_gap(r, s_rect[t])
			if g >= reach:
				continue
			nb.append(t)
			nw.append(float(Balance.GAP_WEIGHT[g]))
			ng.append(g)
			var d: Vector2 = s_center[t] - s_center[s]
			nd.append(d.normalized() if d.length() > 0.01 else Vector2.ZERO)
		s_nb.append(nb)
		s_nw.append(nw)
		s_ngap.append(ng)
		s_ndir.append(nd)


static func rect_gap(a: Rect2i, b: Rect2i) -> int:
	## Empty cells between two footprints (0 = touching).
	var dx := maxi(0, maxi(b.position.x - a.end.x, a.position.x - b.end.x))
	var dy := maxi(0, maxi(b.position.y - a.end.y, a.position.y - b.end.y))
	return maxi(dx, dy)


# =====================================================================================
# Lookups
# =====================================================================================
func cell_at(wx: float, wz: float) -> int:
	var x := int(floor((wx - origin.x) / Balance.CELL))
	var y := int(floor((wz - origin.y) / Balance.CELL))
	if x < 0 or y < 0 or x >= n or y >= n:
		return -1
	return x + y * n


func cell_center(i: int) -> Vector2:
	return Vector2(origin.x + (i % n + 0.5) * Balance.CELL, origin.y + (i / n + 0.5) * Balance.CELL)


func structure_at(wx: float, wz: float) -> int:
	var c := cell_at(wx, wz)
	return sid[c] if c >= 0 else -1


func standing(s: int) -> bool:
	return s >= 0 and s_state[s] <= BURNING


func top_at(wx: float, wz: float) -> float:
	## How tall what stands on this spot is (0 for floor and rubble).
	var s := structure_at(wx, wz)
	if s < 0 or s_state[s] > BURNING:
		return 0.0
	return s_height[s]


func can_light(s: int, power: float) -> bool:
	return s >= 0 and s_state[s] == STANDING and power * 0.97 >= threshold(s) and not keep_shielded(s)


func keep_shielded(s: int) -> bool:
	## The keep won't catch while most of its walls and towers still stand round it.
	if s != keep_id:
		return false
	var others: int = int(zone_total[3]) - 1
	var down: int = int(zone_fallen[3])
	return others > 0 and float(down) / float(others) < Balance.KEEP_GATE


func threshold(s: int) -> float:
	return s_thresh[s] * (2.0 if s_wet[s] > 0.0 else 1.0)


func is_truck(s: int) -> bool:
	return s >= 0 and s_kind[s] == Balance.TRUCK


func truck_dry(s: int) -> bool:
	return is_truck(s) and int(truck_water.get(s, 0)) <= 0


func water_string() -> String:
	## Squirts left in each truck's tank, for the save.
	var parts: PackedStringArray = []
	for t in trucks:
		parts.append(str(int(truck_water.get(t, 0))))
	return ",".join(parts)


func load_water_string(text: String) -> void:
	var parts := text.split(",", false)
	for i in mini(parts.size(), trucks.size()):
		truck_water[trucks[i]] = clampi(int(parts[i]), 0, Balance.TRUCK_TANK)


func progress() -> float:
	return float(fallen) / maxf(1.0, float(total))


func zone_progress(z: int) -> float:
	return float(zone_fallen[z]) / maxf(1.0, float(zone_total[z]))


func flames_on(s: int) -> int:
	## How many of a burning structure's cells are alight right now.
	if s_state[s] != BURNING:
		return 0
	var cells: PackedInt32Array = s_order[s]
	return clampi(int(ceil(s_fire[s] * cells.size())), 1, cells.size())


func fall_strip(s: int) -> Rect2i:
	## The cells a toppling structure lands on.
	var r: Rect2i = s_rect[s]
	var L := int(ceil(s_height[s] / Balance.CELL * 0.9))
	match s_fall[s]:
		0:
			return Rect2i(r.end.x, r.position.y, L, r.size.y)
		1:
			return Rect2i(r.position.x - L, r.position.y, L, r.size.y)
		2:
			return Rect2i(r.position.x, r.end.y, r.size.x, L)
		3:
			return Rect2i(r.position.x, r.position.y - L, r.size.x, L)
	return Rect2i()


# =====================================================================================
# Heat sources and the fire
# =====================================================================================
func set_source(id: String, at: Vector2, radius: float, heat_per_sec: float) -> void:
	sources[id] = [at, radius, heat_per_sec]


func clear_source(id: String) -> void:
	sources.erase(id)


func add_heat_area(at: Vector2, radius: float, amount: float) -> void:
	## Heat every standing structure within `radius` of a world x/z point (each by
	## how close its nearest cell is; the cell under the point gets it all).
	var gx := (at.x - origin.x) / Balance.CELL
	var gy := (at.y - origin.y) / Balance.CELL
	var r := radius / Balance.CELL + 1.0
	var best := {}
	for y in range(maxi(0, int(floor(gy - r))), mini(n, int(ceil(gy + r)) + 1)):
		for x in range(maxi(0, int(floor(gx - r))), mini(n, int(ceil(gx + r)) + 1)):
			var s := sid[x + y * n]
			if s < 0 or s_state[s] != STANDING:
				continue
			var d := Vector2(x + 0.5 - gx, y + 0.5 - gy).length() * Balance.CELL
			var w := clampf(1.0 - maxf(0.0, d - Balance.CELL * 0.5) / maxf(radius, 0.1), 0.0, 1.0)
			if w > float(best.get(s, 0.0)):
				best[s] = w
	for s in best:
		s_heat[s] += amount * float(best[s])
		hot[s] = true


var _heat_point := Vector2.INF        # where the heat that's lighting things is coming from (this tick)


func ignite(s: int, at: Vector2 = Vector2.INF) -> void:
	if s < 0 or s_state[s] != STANDING:
		return
	s_state[s] = BURNING
	s_heat[s] = 0.0
	s_fire[s] = 0.0
	s_caught[s] = clock
	burning[s] = true
	hot.erase(s)
	# The fire takes its cells from wherever it caught.
	var from := at if at.is_finite() else (_heat_point if _heat_point.is_finite() else s_center[s])
	var cells: PackedInt32Array = s_cells[s]
	var arr := Array(cells)
	arr.sort_custom(func(a, b): return cell_center(a).distance_squared_to(from) < cell_center(b).distance_squared_to(from))
	s_order[s] = PackedInt32Array(arr)
	ignited.append(s)


func step(delta: float) -> void:
	_acc += minf(delta, 0.5)
	var guard := 0
	while _acc >= Balance.TICK and guard < 4:
		_acc -= Balance.TICK
		guard += 1
		tick(Balance.TICK)
	if guard >= 4:
		_acc = 0.0


func tick(dt: float) -> void:
	clock += dt
	ticks += 1
	for id in sources:
		var src: Array = sources[id]
		_heat_point = src[0]
		add_heat_area(src[0], src[1], float(src[2]) * dt)
	_heat_point = Vector2.INF
	for s in falling.keys():
		s_fall_t[s] -= dt
		if s_fall_t[s] <= 0.0:
			falling.erase(s)
			_impact(s)
	var base := Balance.SPREAD * spread_mult * dt
	for s in burning.keys():
		var def: Dictionary = Balance.KINDS[s_kind[s]]
		s_fire[s] = minf(1.0, s_fire[s] + dt / float(def.fill))
		var out := float(def.heat) * s_fire[s] * base
		var nb: PackedInt32Array = s_nb[s]
		var nw: PackedFloat32Array = s_nw[s]
		var nd: PackedVector2Array = s_ndir[s]
		for i in nb.size():
			var t := nb[i]
			if s_state[t] != STANDING:
				continue
			var wf := maxf(0.15, 1.0 + wind_strength * Balance.WIND_GAIN * nd[i].dot(wind))
			s_heat[t] += out * nw[i] * wf * rng.randf_range(0.7, 1.3)
			hot[t] = true
		var spot: float = def.spot
		if spot > 0.0 and rng.randf() < spot * spread_mult * spread_mult * (0.5 + wind_strength):
			_spot(s)
		var loss := dt * s_fire[s] / (float(def.burn) * burn_mult)
		loss = minf(loss, s_integ[s])
		s_integ[s] -= loss
		var paid := float(def.coins) * Balance.BURN_SHARE * loss
		pay_pending += paid
		pay_by[s] = float(pay_by.get(s, 0.0)) + paid
		if s_integ[s] <= 0.0:
			_collapse(s)
	for c in debris.keys():
		deb_fuel[c] -= dt
		var x: int = c % n
		var y: int = c / n
		for d in 8:
			var nx: int = x + DX[d]
			var ny: int = y + DY[d]
			if nx < 0 or ny < 0 or nx >= n or ny >= n:
				continue
			var t := sid[nx + ny * n]
			if t >= 0 and s_state[t] == STANDING:
				s_heat[t] += Balance.DEBRIS_HEAT * dt * (1.0 if d < 4 else 0.7) * spread_mult
				hot[t] = true
		if deb_fuel[c] <= 0.0:
			deb_fuel[c] = 0.0
			debris.erase(c)
			debris_out.append(c)
	var keep := 1.0 - Balance.COOL * dt
	for s in hot.keys():
		if s_state[s] != STANDING:
			hot.erase(s)
			continue
		if s_heat[s] >= threshold(s) and not keep_shielded(s):
			ignite(s)
		else:
			s_heat[s] *= keep
			if s_heat[s] < 0.05:
				s_heat[s] = 0.0
				hot.erase(s)
	for t in trucks:
		_truck(t, dt)
	for s in wet.keys():
		s_wet[s] -= dt
		if s_wet[s] <= 0.0:
			s_wet[s] = 0.0
			wet.erase(s)


func _collapse(s: int) -> void:
	burning.erase(s)
	s_state[s] = FALLING
	s_integ[s] = 0.0
	var def: Dictionary = Balance.KINDS[s_kind[s]]
	if bool(def.topple):
		s_fall[s] = _pick_fall(s)
		s_fall_t[s] = Balance.TOPPLE_TIME
	else:
		s_fall[s] = CRUMPLE
		s_fall_t[s] = Balance.CRUMPLE_TIME
	falling[s] = true
	collapsed.append(s)


func _pick_fall(s: int) -> int:
	## Towers fall where the wind pushes them and toward whatever's still standing
	## (the buildings around a fire are what's holding it up).
	var best := 0
	var best_score := -INF
	for d in 4:
		s_fall[s] = d
		var strip := fall_strip(s)
		var hits := 0
		var seen := {}
		for y in range(maxi(0, strip.position.y), mini(n, strip.end.y)):
			for x in range(maxi(0, strip.position.x), mini(n, strip.end.x)):
				var t := sid[x + y * n]
				if t >= 0 and t != s and not seen.has(t) and s_state[t] <= BURNING:
					seen[t] = true
					hits += 1 if s_state[t] == STANDING else 0
		var dir := Vector2(FALL_DIRS[d])
		var score := float(mini(hits, 3)) * 1.2 + dir.dot(wind) * wind_strength * 2.0 + rng.randf_range(0.0, 1.6)
		if score > best_score:
			best_score = score
			best = d
	return best


func _impact(s: int) -> void:
	s_state[s] = RUBBLE
	fallen += 1
	zone_fallen[s_zone[s]] += 1
	var def: Dictionary = Balance.KINDS[s_kind[s]]
	if clock - _last_impact <= Balance.CHAIN_WINDOW:
		chain += 1
	else:
		chain = 1
	_last_impact = clock
	best_chain = maxi(best_chain, chain)
	var mult := minf(Balance.CHAIN_MAX, 1.0 + Balance.CHAIN_STEP * float(chain - 1))
	var bonus := float(def.coins) * (1.0 - Balance.BURN_SHARE) * mult
	pay_pending += bonus
	impacts.append([s, bonus, chain])
	var spill := float(def.spill)
	if s_fall[s] == CRUMPLE:
		var nb: PackedInt32Array = s_nb[s]
		var ng: PackedByteArray = s_ngap[s]
		for i in nb.size():
			var t := nb[i]
			if ng[i] <= 1 and s_state[t] == STANDING:
				s_heat[t] += spill * (1.0 if ng[i] == 0 else 0.75)
				hot[t] = true
		var r: Rect2i = s_rect[s].grow(1)
		for y in range(maxi(0, r.position.y), mini(n, r.end.y)):
			for x in range(maxi(0, r.position.x), mini(n, r.end.x)):
				if s_rect[s].has_point(Vector2i(x, y)):
					continue
				if rng.randf() < 0.6:
					_drop_debris(x + y * n, 1.0)
	else:
		var strip := fall_strip(s)
		var seen := {}
		for y in range(maxi(0, strip.position.y), mini(n, strip.end.y)):
			for x in range(maxi(0, strip.position.x), mini(n, strip.end.x)):
				var c := x + y * n
				var t := sid[c]
				if t >= 0 and t != s:
					if not seen.has(t):
						seen[t] = true
						if s_state[t] == STANDING:
							s_heat[t] += spill
							hot[t] = true
				else:
					_drop_debris(c, 1.6)
		# The base crumbles onto what it was touching, too.
		var nb: PackedInt32Array = s_nb[s]
		var ng: PackedByteArray = s_ngap[s]
		for i in nb.size():
			var t := nb[i]
			if ng[i] == 0 and s_state[t] == STANDING and not seen.has(t):
				s_heat[t] += spill * 0.4
				hot[t] = true


func _drop_debris(c: int, fuel_mult: float) -> void:
	if c < 0 or c >= n * n or ground[c] == G_PUDDLE:
		return
	if sid[c] >= 0 and s_state[sid[c]] != RUBBLE:
		return
	var fresh := deb_fuel[c] <= 0.0
	deb_fuel[c] = maxf(deb_fuel[c], rng.randf_range(Balance.DEBRIS_FUEL.x, Balance.DEBRIS_FUEL.y) * fuel_mult)
	debris[c] = true
	if fresh:
		debris_new.append(c)


func _spot(s: int) -> void:
	## A burning scrap blows off a tall building and lands downwind.
	var dist := rng.randf_range(2.0, 5.0) * (0.8 + 0.4 * spread_mult)
	var dir := (wind + Vector2(rng.randf_range(-0.6, 0.6), rng.randf_range(-0.6, 0.6))).normalized()
	var to: Vector2 = s_center[s] + dir * dist
	var from3 := Vector3(s_center[s].x, s_height[s] * 0.8, s_center[s].y)
	spots.append([from3, Vector3(to.x, 0.0, to.y)])
	var t := structure_at(to.x, to.y)
	if t >= 0 and s_state[t] == STANDING:
		s_heat[t] += float(Balance.KINDS[s_kind[s]].ignite) * 1.1
		hot[t] = true
	elif t < 0:
		_drop_debris(cell_at(to.x, to.y), 0.6)


func _truck(t: int, dt: float) -> void:
	if s_state[t] != STANDING or int(truck_water.get(t, 0)) <= 0:
		return
	var left := float(truck_t.get(t, 0.0)) - dt
	if left > 0.0:
		truck_t[t] = left
		return
	truck_t[t] = Balance.SPRAY_EVERY
	var best := -1
	var best_d := Balance.SPRAY_RANGE
	for s in burning:
		var d: float = s_center[s].distance_to(s_center[t])
		if d < best_d and s_kind[s] != Balance.TRUCK:
			best_d = d
			best = s
	if best < 0:
		return
	s_fire[best] -= Balance.SPRAY_DOUSE
	s_heat[best] = 0.0
	truck_water[t] = int(truck_water.get(t, 0)) - 1
	sprays.append([t, best])
	if s_fire[best] <= 0.05:
		burning.erase(best)
		s_state[best] = STANDING
		s_fire[best] = 0.0
		s_wet[best] = Balance.WET_TIME
		wet[best] = true
		extinguished.append(best)


# =====================================================================================
# Events
# =====================================================================================
func take_pay() -> float:
	var p := pay_pending
	pay_pending = 0.0
	return p


func take(name: String) -> Array:
	var a: Array = get(name)
	set(name, [])
	return a


func take_pay_by() -> Dictionary:
	var d := pay_by
	pay_by = {}
	return d


# =====================================================================================
# Helpers looking for something to light
# =====================================================================================
func find_target(near: Vector2, radius: float, power: float, kinds: Array = [], tries: int = 40) -> int:
	## A structure near `near` that `power` can light, preferring close ones. -1 if none.
	var best := -1
	var best_d := INF
	for _t in tries:
		var p := near + Vector2(rng.randf_range(-radius, radius), rng.randf_range(-radius, radius))
		var s := structure_at(p.x, p.y)
		if s < 0 or not can_light(s, power) or s_kind[s] == Balance.TRUCK:
			continue
		if not kinds.is_empty() and not kinds.has(int(s_kind[s])):
			continue
		var d: float = s_center[s].distance_squared_to(near)
		if d < best_d:
			best_d = d
			best = s
	return best


# =====================================================================================
# Saving: one character per structure
# =====================================================================================
func to_save_string() -> String:
	var b := PackedByteArray()
	b.resize(count)
	for s in count:
		var ch := 48   # '0' standing
		match s_state[s]:
			BURNING, FALLING:
				ch = 49     # still coming down: it burns on after a reload and falls (and pays) then
			RUBBLE:
				ch = 114 if s_fall[s] == CRUMPLE else 52 + int(s_fall[s])   # 'r' or '4'..'7'
		b[s] = ch
	return b.get_string_from_ascii()


func load_save_string(text: String) -> void:
	if text.length() != count:
		return
	var b := text.to_ascii_buffer()
	for s in count:
		var ch := b[s]
		if ch == 49:
			ignite(s)
			s_fire[s] = 1.0
			s_integ[s] = 0.5
		elif ch == 114 or (ch >= 52 and ch <= 55):
			s_state[s] = RUBBLE
			s_fall[s] = CRUMPLE if ch == 114 else ch - 52
			s_integ[s] = 0.0
			fallen += 1
			zone_fallen[s_zone[s]] += 1
	ignited.clear()


func burn_zone(z: int) -> void:
	## Developer tool: everything in a district catches at once (not the keep).
	for s in count:
		if s_zone[s] == z and s_state[s] == STANDING and s != keep_id:
			ignite(s)
