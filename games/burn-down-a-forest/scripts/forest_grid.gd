class_name ForestGrid
extends RefCounted
## The cursed forest as data, and the fire that spreads through it.
##
## One cell per Balance.CELL metres, Balance.GRID cells a side, centred on the
## origin (world x -> grid x, world z -> grid y). Each cell holds one kind of
## plant (Balance.PLANTS) or stone, water or bare ground.
##
## The fire runs at a fixed tick (Balance.TICK) over sparse sets only: the cells
## that are burning, the intact cells that have picked up some heat, and the ash
## waiting to bloom. A burning cell pushes heat into its 8 neighbours, weighted
## by the wind; a cell catches when its heat passes its ignite threshold (each
## cell is a little drier or damper than the next, and cells by the water are
## much damper), so fire sweeps through dense forest in chain reactions and
## dies out at rivers, rocks and thin patches. Heat sources (the player's tool,
## the helpers) are registered with set_source() and applied every tick.
##
## Also holds the ground's height field (the forest floor rolls gently, the
## river is carved in, and hills rise all round the edge).

const INTACT := 0
const BURNING := 1
const ASH := 2
const MEADOW := 3
const MARGIN := 20                 # cells of hills beyond the forest on every side
const CHUNK := 8                   # cells per side of a payout region (floating numbers)
const DX := [1, -1, 0, 0, 1, 1, -1, -1]
const DY := [0, 0, 1, -1, 1, -1, 1, -1]
const WATER_LEVEL := -0.35
const PATH_END := 57                # the path runs from the village up to this row

var n: int = Balance.GRID
var origin := Vector2.ZERO          # world x/z of the corner of cell (0, 0)
var kind := PackedByteArray()
var state := PackedByteArray()
var zone := PackedByteArray()       # index into Balance.ZONES (0 = the outer thicket)
var heat := PackedFloat32Array()
var thresh := PackedFloat32Array()  # heat it takes to light this cell
var fuel := PackedFloat32Array()    # seconds of burning left
var fuel0 := PackedFloat32Array()
var pay_rate := PackedFloat32Array()
var ash_t := PackedFloat32Array()
var damp := PackedByteArray()
var vary := PackedFloat32Array()    # 0..1 per cell, for looks (size, colour)
var size_mult := PackedFloat32Array()  # 1 for most plants; more for the hand-placed landmark trees
var heights := PackedFloat32Array() # the ground at cell corners, MARGIN cells past the edge
var hn: int = 0                     # corners per side of `heights`

var hot := {}                       # intact cells holding some heat
var burning := {}
var ashing := {}

var wind := Vector2(0.8, -0.6).normalized()
var wind_strength := 0.55
var spread_mult := 1.0              # Dry Winds (set by the game every frame)
var sources := {}                   # id -> [Vector2 world xz, radius, heat per second]

# Handed to the view and the game each frame (take_*), then cleared.
var changed: Array = []             # cells whose state changed
var ignited: Array = []             # cells that just caught fire
var spots: Array = []               # [from cell, to cell] embers thrown downwind
var pay_pending := 0.0              # raw embers earned (before upgrades and boosts)
var pay_chunks := {}                # chunk -> [embers, sum x * embers, sum y * embers]

var total_flammable := 0
var burned := 0                     # cells that are ash or meadow
var zone_total: Array = []
var zone_burned: Array = []
var elder_cell := -1
var ticks := 0
var withered := {}                   # cells the lifted curse took (they fade, they don't burn)
var lifted := false                  # the Elder Tree is gone and the curse with it

var _acc := 0.0
var _w := PackedFloat32Array()
var rng := RandomNumberGenerator.new()


func _init() -> void:
	origin = Vector2(-n * Balance.CELL * 0.5, -n * Balance.CELL * 0.5)
	_w.resize(8)


# =====================================================================================
# Building the forest
# =====================================================================================
func generate(seed: int) -> void:
	rng.seed = seed
	var size := n * n
	# (Packed arrays are values: resize each one itself, not through a loop.)
	kind.resize(size)
	state.resize(size)
	zone.resize(size)
	damp.resize(size)
	heat.resize(size)
	thresh.resize(size)
	fuel.resize(size)
	fuel0.resize(size)
	pay_rate.resize(size)
	ash_t.resize(size)
	vary.resize(size)
	size_mult.resize(size)
	size_mult.fill(1.0)
	kind.fill(0)
	state.fill(INTACT)
	heat.fill(0.0)
	var wobble := FastNoiseLite.new()
	wobble.seed = seed
	wobble.frequency = 0.07
	var rocks := FastNoiseLite.new()
	rocks.seed = seed + 7
	rocks.frequency = 0.11
	var c := n / 2
	var center := Vector2(c, c)
	elder_cell = c + c * n
	for y in n:
		for x in n:
			var i := x + y * n
			var d := Vector2(x, y).distance_to(center)
			var dd := d + wobble.get_noise_2d(x, y) * 3.2
			var z := 0
			for zi in range(Balance.ZONES.size() - 1, -1, -1):
				if dd < float(Balance.ZONES[zi].outer):
					z = zi
					break
			zone[i] = z
			kind[i] = _pick(Balance.ZONES[z].mix)
			vary[i] = rng.randf()
			if z <= 1 and rocks.get_noise_2d(x, y) > 0.5 and d > 6.0:
				kind[i] = Balance.STONE
	_cut_trails(seed)
	# The Elder Tree at the heart, ringed by giants.
	for y in range(c - 1, c + 2):
		for x in range(c - 1, c + 2):
			kind[x + y * n] = Balance.GIANT
	kind[elder_cell] = Balance.ELDER
	# A river across the north, and a pond to the south-east.
	for x in n:
		var ry := 13.0 + 6.5 * sin(x * 0.11) + x * 0.17
		for y in n:
			if absf(y - ry) <= 1.05:
				kind[x + y * n] = Balance.WATER
	for y in n:
		for x in n:
			if Vector2(x, y).distance_to(Vector2(62, 56)) < 3.4:
				kind[x + y * n] = Balance.WATER
	# The swallowed village at the south edge: a square, yards either side for
	# the cottages, and a patch of grass in front of it to light first.
	for y in range(n - 16, n):
		for x in n:
			var i := x + y * n
			var dx := absf(x - c)
			if y >= n - 6 and dx < 11.0:
				kind[i] = Balance.BARE
			elif y >= n - 10 and dx >= 5.5 and dx < 13.0:
				kind[i] = Balance.BARE
			elif y >= n - 15 and dx < 13.0 and kind[i] != Balance.WATER:
				kind[i] = Balance.GRASS if rng.randf() < 0.72 else Balance.BUSH
	# A path winds from the square into the forest, toward the Elder Tree.
	for y in range(PATH_END, n - 5):
		var px := path_x(y)
		for x in range(int(floor(px)), int(floor(px)) + 2):
			var i := x + y * n
			if x >= 0 and x < n and kind[i] != Balance.WATER:
				kind[i] = Balance.BARE
	_place_landmarks()
	# Damp cells by the water are harder to light.
	for y in n:
		for x in n:
			var i := x + y * n
			damp[i] = 0
			for oy in range(-2, 3):
				for ox in range(-2, 3):
					var xx := x + ox
					var yy := y + oy
					if xx >= 0 and yy >= 0 and xx < n and yy < n and kind[xx + yy * n] == Balance.WATER:
						damp[i] = 1
	zone_total = []
	zone_burned = []
	for _z in Balance.ZONES.size():
		zone_total.append(0)
		zone_burned.append(0)
	total_flammable = 0
	for i in size:
		var k := kind[i]
		if Balance.flammable(k):
			var p: Dictionary = Balance.PLANTS[k]
			var t := float(p.ignite) * rng.randf_range(0.75, 1.3)
			if k == Balance.ELDER:
				t = float(p.ignite)
			if damp[i] == 1:
				t *= Balance.DAMP_MULT
			thresh[i] = t
			total_flammable += 1
			zone_total[zone[i]] += 1
		else:
			thresh[i] = INF
	burned = 0
	hot.clear()
	burning.clear()
	ashing.clear()
	_build_heights(seed)


func path_x(y: float) -> float:
	## The path's centre column at grid row y (the village is at the bottom rows).
	var t := float(n - 7) - y
	return 45.0 - t * 0.12 + 2.2 * sin(t * 0.25)


func _place_landmarks() -> void:
	## Hand-placed trees that give the forest its sightlines: two big crooked
	## pines either side of where the path leaves the thicket, an old watcher oak
	## where it ends, a lone giant pine on the hill west of the village, a great
	## oak by the pond. They burn like the rest, just bigger.
	var gate_y := 67
	var gx := int(floor(path_x(gate_y)))
	for l in [[gx - 3, gate_y, Balance.PINE, 1.5], [gx + 4, gate_y + 1, Balance.PINE, 1.4],
			[int(floor(path_x(PATH_END))) + 1, PATH_END - 2, Balance.OAK, 1.55], [27, 63, Balance.PINE, 1.75],
			[57, 52, Balance.OAK, 1.5], [52, 64, Balance.PINE, 1.45]]:
		var x: int = l[0]
		var y: int = l[1]
		# room around it, so its big crown doesn't sit in its neighbours'
		for oy in range(-1, 2):
			for ox in range(-1, 2):
				var j := (x + ox) + (y + oy) * n
				if kind[j] != Balance.WATER and kind[j] != Balance.BARE and (ox != 0 or oy != 0):
					kind[j] = Balance.GRASS
		var i := x + y * n
		kind[i] = l[2]
		vary[i] = 0.95
		size_mult[i] = l[3]


func _cut_trails(seed: int) -> void:
	## Dirt trails split the outer rings into patches (the edges of a jittered
	## Voronoi pattern). Fire can't walk across a trail, only jump it (spotting),
	## so one match burns one patch, not the whole forest. A few gaps let some
	## fires run on into the next patch.
	var gaps := FastNoiseLite.new()
	gaps.seed = seed + 11
	gaps.frequency = 0.09
	var r := RandomNumberGenerator.new()
	r.seed = seed + 5
	var cells := int(ceil(n / Balance.PATCH)) + 1
	var pts := []
	for cy in cells:
		for cx in cells:
			pts.append(Vector2((cx + r.randf_range(0.15, 0.85)) * Balance.PATCH, (cy + r.randf_range(0.15, 0.85)) * Balance.PATCH))
	for y in n:
		for x in n:
			var i := x + y * n
			if Vector2(x, y).distance_to(Vector2(n / 2, n / 2)) < 2.5:
				continue          # (trails split every ring, the grove too; only the Elder's own clearing is whole)
			var p := Vector2(x + 0.5, y + 0.5)
			var lx := int(p.x / Balance.PATCH)
			var ly := int(p.y / Balance.PATCH)
			var d1 := INF
			var d2 := INF
			for oy in range(-1, 2):
				for ox in range(-1, 2):
					var gx := lx + ox
					var gy := ly + oy
					if gx < 0 or gy < 0 or gx >= cells or gy >= cells:
						continue
					var d := p.distance_to(pts[gx + gy * cells])
					if d < d1:
						d2 = d1
						d1 = d
					elif d < d2:
						d2 = d
			if d2 - d1 < 1.0 and gaps.get_noise_2d(x, y) < 0.45:
				kind[i] = Balance.BARE


func _pick(mix: Dictionary) -> int:
	var r := rng.randf()
	var acc := 0.0
	for k in mix:
		acc += float(mix[k])
		if r < acc:
			return int(k)
	return Balance.GRASS


func _build_heights(seed: int) -> void:
	var hills := FastNoiseLite.new()
	hills.seed = seed + 3
	hills.frequency = 0.022
	var detail := FastNoiseLite.new()
	detail.seed = seed + 4
	detail.frequency = 0.09
	hn = n + 2 * MARGIN + 1
	heights.resize(hn * hn)
	var half := n * Balance.CELL * 0.5
	for vy in hn:
		for vx in hn:
			var wx := origin.x + (vx - MARGIN) * Balance.CELL
			var wz := origin.y + (vy - MARGIN) * Balance.CELL
			var h := hills.get_noise_2d(wx, wz) * 1.5 + detail.get_noise_2d(wx, wz) * 0.25 + 0.4
			var edge := maxf(absf(wx), absf(wz)) - half + 3.0
			if edge > 0.0:
				h += pow(edge / 6.0, 1.45) * 2.4 + absf(hills.get_noise_2d(wx * 2.0, wz * 2.0)) * edge * 0.25
			# The cells touching this corner: water carves the riverbed, the village is flat.
			var cx := vx - MARGIN
			var cy := vy - MARGIN
			var wet := 0
			var bare := 0
			for oy in [-1, 0]:
				for ox in [-1, 0]:
					var k := _kind_at(cx + ox, cy + oy)
					if k == Balance.WATER:
						wet += 1
					elif k == Balance.BARE:
						bare += 1
			if wet > 0:
				h = -0.95 if wet >= 2 else minf(h, -0.2)
			elif bare > 0:
				h = lerpf(h, 0.35, 0.8)
			heights[vx + vy * hn] = h


func _kind_at(x: int, y: int) -> int:
	if x < 0 or y < 0 or x >= n or y >= n:
		return -1
	return kind[x + y * n]


# =====================================================================================
# Lookups
# =====================================================================================
func height_at(wx: float, wz: float) -> float:
	## The ground under a world position (bilinear, matches the terrain mesh).
	var fx := clampf((wx - origin.x) / Balance.CELL + MARGIN, 0.0, hn - 1.001)
	var fz := clampf((wz - origin.y) / Balance.CELL + MARGIN, 0.0, hn - 1.001)
	var x0 := int(fx)
	var z0 := int(fz)
	var tx := fx - x0
	var tz := fz - z0
	var i := x0 + z0 * hn
	var a := lerpf(heights[i], heights[i + 1], tx)
	var b := lerpf(heights[i + hn], heights[i + hn + 1], tx)
	return lerpf(a, b, tz)


func cell_at(wx: float, wz: float) -> int:
	var x := int(floor((wx - origin.x) / Balance.CELL))
	var y := int(floor((wz - origin.y) / Balance.CELL))
	if x < 0 or y < 0 or x >= n or y >= n:
		return -1
	return x + y * n


func cell_center(i: int) -> Vector2:
	return Vector2(origin.x + (i % n + 0.5) * Balance.CELL, origin.y + (i / n + 0.5) * Balance.CELL)


func cell_pos(i: int) -> Vector3:
	var c := cell_center(i)
	return Vector3(c.x, height_at(c.x, c.y), c.y)


func is_flammable(i: int) -> bool:
	return i >= 0 and state[i] == INTACT and kind[i] <= Balance.ELDER


func can_light(i: int, tool_heat: float) -> bool:
	## Would steady heat of `tool_heat` per second set this cell alight?
	return is_flammable(i) and tool_heat / Balance.COOL * 0.97 >= thresh[i]


func plant_height(i: int) -> float:
	## How tall what's growing here is, for aiming at it.
	if i < 0 or state[i] != INTACT or kind[i] > Balance.ELDER:
		return 0.0
	return float(Balance.PLANTS[kind[i]].height) * Models.variant_height(kind[i], vary[i]) * size_mult[i] * (0.92 + 0.16 * fmod(vary[i] * 3.7, 1.0))


func zone_at(wx: float, wz: float) -> int:
	var i := cell_at(wx, wz)
	return zone[i] if i >= 0 else 0


func progress() -> float:
	return float(burned) / maxf(1.0, float(total_flammable))


func zone_progress(z: int) -> float:
	return float(zone_burned[z]) / maxf(1.0, float(zone_total[z]))


func burning_count() -> int:
	return burning.size()


func elder_state() -> int:
	return state[elder_cell]


# =====================================================================================
# Heat sources and the fire itself
# =====================================================================================
func set_source(id: String, at: Vector2, radius: float, power: float) -> void:
	sources[id] = [at, radius, power]


func clear_source(id: String) -> void:
	sources.erase(id)


func ignite(i: int) -> void:
	if not is_flammable(i):
		return
	var k := kind[i]
	var p: Dictionary = Balance.PLANTS[k]
	state[i] = BURNING
	heat[i] = 0.0
	var f := float(p.burn) * (1.0 if k == Balance.ELDER else rng.randf_range(0.85, 1.15))
	fuel0[i] = f
	fuel[i] = f
	pay_rate[i] = float(p.embers) / f
	burning[i] = true
	hot.erase(i)
	changed.append(i)
	ignited.append(i)


func add_heat_area(at: Vector2, radius: float, amount: float) -> void:
	## Heat everything that can burn within `radius` of a world x/z point. The
	## cell under the point always gets the full amount.
	var gx := (at.x - origin.x) / Balance.CELL
	var gy := (at.y - origin.y) / Balance.CELL
	var r := (radius + Balance.CELL * 0.5) / Balance.CELL + 1.0
	var x0 := maxi(0, int(floor(gx - r)))
	var x1 := mini(n - 1, int(ceil(gx + r)))
	var y0 := maxi(0, int(floor(gy - r)))
	var y1 := mini(n - 1, int(ceil(gy + r)))
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			var i := x + y * n
			if state[i] != INTACT or kind[i] > Balance.ELDER:
				continue
			var d := Vector2(x + 0.5 - gx, y + 0.5 - gy).length() * Balance.CELL
			var w := clampf(1.0 - maxf(0.0, d - Balance.CELL * 0.5) / maxf(radius, 0.1), 0.0, 1.0)
			if w <= 0.0:
				continue
			heat[i] += amount * w
			hot[i] = true


func step(delta: float) -> void:
	## Run as many fixed ticks as `delta` covers (a few at most).
	var scale := maxf(1.0, Engine.time_scale)
	_acc += minf(delta, 0.5 * scale)
	var guard := 0
	while _acc >= Balance.TICK and guard < int(4 * scale):
		_acc -= Balance.TICK
		guard += 1
		tick(Balance.TICK)
	if guard >= int(4 * scale):
		_acc = 0.0


func tick(dt: float) -> void:
	ticks += 1
	_update_weights()
	for id in sources:
		var s: Array = sources[id]
		add_heat_area(s[0], s[1], float(s[2]) * dt)
	# Burning cells push heat to their neighbours and pay out.
	var out_base := Balance.SPREAD * spread_mult * dt
	for c in burning.keys():
		var k := kind[c]
		var f := fuel[c] / fuel0[c]
		var out := float(Balance.PLANTS[k].heat) * out_base * _intensity(f)
		var x: int = c % n
		var y: int = c / n
		for d in 8:
			var nx: int = x + DX[d]
			var ny: int = y + DY[d]
			if nx < 0 or ny < 0 or nx >= n or ny >= n:
				continue
			var nc := nx + ny * n
			if state[nc] != INTACT or kind[nc] > Balance.ELDER:
				continue
			var kn := kind[nc]
			var tier := 1.0
			if kn > k and kn >= Balance.PINE:
				# a fire only barely warms a tougher kind of tree: that's the next tool's job
				tier = Balance.TIER_UP if kn == k + 1 else Balance.TIER_UP2
			heat[nc] += out * _w[d] * tier * rng.randf_range(0.55, 1.45)
			hot[nc] = true
		var spot: float = Balance.PLANTS[k].spot
		if spot > 0.0 and rng.randf() < spot * spread_mult * spread_mult * (0.6 + wind_strength):
			_spot(c, x, y, k)
		_pay(c, x, y, pay_rate[c] * minf(dt, fuel[c]))
		fuel[c] -= dt
		if fuel[c] <= 0.0:
			burning.erase(c)
			state[c] = ASH
			ash_t[c] = rng.randf_range(Balance.ASH_TIME.x, Balance.ASH_TIME.y) * (2.0 if k >= Balance.GIANT else 1.0)
			ashing[c] = true
			burned += 1
			zone_burned[zone[c]] += 1
			changed.append(c)
	# Heated cells catch or cool off.
	var keep := 1.0 - Balance.COOL * dt
	for c in hot.keys():
		if state[c] != INTACT:
			hot.erase(c)
			continue
		if heat[c] >= thresh[c]:
			ignite(c)
		else:
			heat[c] *= keep
			if heat[c] < 0.02:
				heat[c] = 0.0
				hot.erase(c)
	# Ash blooms into meadow.
	for c in ashing.keys():
		ash_t[c] -= dt
		if ash_t[c] <= 0.0:
			ashing.erase(c)
			state[c] = MEADOW
			changed.append(c)


func _spot(c: int, x: int, y: int, k: int) -> void:
	## A burning cell throws a glowing ember a few cells downwind.
	var dist := rng.randf_range(2.0, 4.5) * (0.8 + 0.4 * spread_mult)
	var dir := (wind + Vector2(rng.randf_range(-0.6, 0.6), rng.randf_range(-0.6, 0.6))).normalized()
	var tx := x + int(round(dir.x * dist))
	var ty := y + int(round(dir.y * dist))
	if tx < 0 or ty < 0 or tx >= n or ty >= n:
		return
	var t := tx + ty * n
	spots.append([c, t])
	if state[t] != INTACT or kind[t] > Balance.ELDER:
		return
	heat[t] += float(Balance.PLANTS[k].ignite) * 1.3
	hot[t] = true


static func _intensity(fuel_left: float) -> float:
	## A fire starts small, roars, then dies down (fuel_left 1 -> 0).
	var age := 1.0 - fuel_left
	return clampf(0.3 + age * 3.0, 0.3, 1.0) * clampf(fuel_left * 3.5 + 0.15, 0.15, 1.0)


func flame_size(c: int) -> float:
	## 0..1 how big the flames on a burning cell are right now (for the view).
	if state[c] != BURNING:
		return 0.0
	return _intensity(fuel[c] / fuel0[c])


func _update_weights() -> void:
	for d in 8:
		var dir := Vector2(DX[d], DY[d])
		var base := 1.0 if d < 4 else Balance.DIAGONAL
		_w[d] = base * maxf(0.15, 1.0 + wind_strength * 1.3 * dir.normalized().dot(wind))


func _pay(c: int, x: int, y: int, amount: float) -> void:
	pay_pending += amount
	var ch := (x / CHUNK) + (y / CHUNK) * 1000
	var a: Array = pay_chunks.get(ch, [0.0, 0.0, 0.0])
	a[0] += amount
	a[1] += (x + 0.5) * amount
	a[2] += (y + 0.5) * amount
	pay_chunks[ch] = a


func take_pay() -> float:
	var p := pay_pending
	pay_pending = 0.0
	return p


func take_pay_spots() -> Array:
	## [[world position, raw embers], ...] for each patch that paid since last time.
	var out: Array = []
	for ch in pay_chunks:
		var a: Array = pay_chunks[ch]
		if a[0] <= 0.0:
			continue
		var gx: float = a[1] / a[0]
		var gy: float = a[2] / a[0]
		var wx := origin.x + gx * Balance.CELL
		var wz := origin.y + gy * Balance.CELL
		out.append([Vector3(wx, height_at(wx, wz), wz), a[0]])
	pay_chunks.clear()
	return out


func take_changed() -> Array:
	var c := changed
	changed = []
	return c


func take_spots() -> Array:
	var s := spots
	spots = []
	return s


func take_ignited() -> Array:
	var c := ignited
	ignited = []
	return c


# =====================================================================================
# Helpers looking for something to light
# =====================================================================================
func find_target(near: Vector2, radius: float, tool_heat: float, tries: int = 40) -> int:
	## A random cell near `near` that heat of `tool_heat` can light, preferring
	## ones close to `near`. -1 if none turned up.
	var best := -1
	var best_d := INF
	for _t in tries:
		var p := near + Vector2(rng.randf_range(-radius, radius), rng.randf_range(-radius, radius))
		var i := cell_at(p.x, p.y)
		if i < 0 or not can_light(i, tool_heat):
			continue
		var d := cell_center(i).distance_squared_to(near)
		if d < best_d:
			best_d = d
			best = i
	return best


# =====================================================================================
# Saving
# =====================================================================================
func to_save_string() -> String:
	## One character per cell: 0 intact, 1 burning, 2 ash, 3 meadow.
	var b := PackedByteArray()
	b.resize(state.size())
	for i in state.size():
		b[i] = 48 + state[i]
	return b.get_string_from_ascii()


func load_save_string(s: String) -> void:
	if s.length() != state.size():
		return
	lifted = s[elder_cell] == "2" or s[elder_cell] == "3"
	var b := s.to_ascii_buffer()
	for i in b.size():
		var v := b[i] - 48
		if v <= INTACT or v > MEADOW or not Balance.flammable(kind[i]):
			continue
		match v:
			BURNING:
				ignite(i)
				fuel[i] = fuel0[i] * 0.5
			ASH:
				state[i] = ASH
				ash_t[i] = rng.randf_range(1.0, Balance.ASH_TIME.y)
				ashing[i] = true
				burned += 1
				zone_burned[zone[i]] += 1
			MEADOW:
				state[i] = MEADOW
				burned += 1
				zone_burned[zone[i]] += 1
	changed.clear()
	ignited.clear()


func any_lightable(tool_heat: float, at_least: int = 1) -> bool:
	## Are there at least `at_least` cells left that heat of `tool_heat` can light?
	var need := tool_heat / Balance.COOL * 0.97
	var n := 0
	for i in state.size():
		if state[i] == INTACT and kind[i] <= Balance.ELDER and thresh[i] <= need:
			n += 1
			if n >= at_least:
				return true
	return false


func lift_curse() -> void:
	## The Elder Tree is gone: what's left of the cursed forest withers away in a
	## wave out from the heart, and the meadow follows it.
	lifted = true
	var c := Vector2(n / 2, n / 2)
	for i in state.size():
		if state[i] == INTACT and Balance.flammable(kind[i]):
			state[i] = ASH
			ash_t[i] = 0.8 + Vector2(i % n, i / n).distance_to(c) * 0.085
			ashing[i] = true
			withered[i] = true
			changed.append(i)
	hot.clear()


func dev_clear_outside(z: int) -> void:
	## Developer tool: every ring outside ring z is meadow at once.
	for i in state.size():
		if zone[i] >= z or not Balance.flammable(kind[i]) or kind[i] == Balance.ELDER or state[i] == MEADOW:
			continue
		if state[i] == INTACT or state[i] == BURNING:
			burned += 1
			zone_burned[zone[i]] += 1
		burning.erase(i)
		ashing.erase(i)
		hot.erase(i)
		state[i] = MEADOW
		changed.append(i)


func burn_everything_in_zone(z: int) -> void:
	## Developer tool: everything in this ring catches at once.
	for i in state.size():
		if zone[i] == z and is_flammable(i) and kind[i] != Balance.ELDER:
			ignite(i)
