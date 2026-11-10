class_name Bay
extends RefCounted
## The bay's seabed and its water, as pure logic (no nodes, testable headless).
##
## The seabed and its pool merge tree come precomputed from
## art/bay/make_bay.py (data/bay.json). Water is a set of bodies; a body is a
## tree node plus a level. A node covers a range of levels [low, high): while
## a body's level stays in its node's range, the body is one connected sheet
## of water. When it drops below `low` the body splits into its children
## (each keeps the level it had), or, for a leaf, it's empty. So pools form
## exactly where the seabed has rims, and the game never flood-fills.
##
## The main body is the one holding the deepest point of the bay (the lost
## town's square); shore pumps always pump it. Every other body is a pool:
## it keeps its water until a barge pump works it.

const DATA_PATH := "res://data/bay.json"
const MAX_SLOTS := 32            # bodies the shaders can draw at once
const PUDDLE_AREA := 10          # smaller new bodies just soak away
const PUDDLE_DEPTH := 0.3
const NO_BODY := -1

# Deep water counts for more volume per metre: area x (1 + (depth / DEEP_SCALE)²).
# The deep rings are small, so without this they'd empty in seconds once a
# pump tier beat the seepage; with it every ring drains over minutes.
var deep_scale := Balance.DEEP_SCALE

var n := 128
var w := 129
var s := 1.0
var x0 := -64.0
var z0 := -64.0
var h := PackedFloat32Array()
var colors := PackedByteArray()
var outer := PackedByteArray()
var vert_node := PackedInt32Array()
var parent := PackedInt32Array()
var low := PackedFloat32Array()
var high := PackedFloat32Array()
var minv := PackedInt32Array()
var desc := PackedInt32Array()
var own_off := PackedInt32Array()
var own_len := PackedInt32Array()
var own_h := PackedFloat32Array()
var children: Array = []
var sink := 0
var node_has_sink := PackedByteArray()
var rings: Array = []
var pools: Array = []            # designed pools: name, x, z, v, node, spill, floor
var landmarks := {}
var props := {}
var far := {}

# Water: id -> {"node": int, "level": float, "slot": int}
var bodies := {}
var next_id := 1
var main_id := NO_BODY
var topo_version := 0            # bumps whenever bodies split, empty or appear
var vertex_body := PackedInt32Array()   # body id per vertex (NO_BODY if none)
var draw_slot := PackedByteArray()      # per vertex: slot of its body or a neighbour's (255 none)
var drained_at := PackedFloat32Array()  # per vertex: game time it was left dry by an emptied body
var _slots_used := {}            # slot -> body id
var _node_body := PackedInt32Array()


func _init() -> void:
	_load()
	reset_water()


static func _b64f(t: String) -> PackedFloat32Array:
	return Marshalls.base64_to_raw(t).to_float32_array()


static func _b64i(t: String) -> PackedInt32Array:
	return Marshalls.base64_to_raw(t).to_int32_array()


func _load() -> void:
	var res = load(DATA_PATH)
	var d: Dictionary = res.data
	n = int(d.n)
	w = n + 1
	s = float(d.s)
	x0 = float(d.x0)
	z0 = float(d.z0)
	sink = int(d.sink)
	h = _b64f(d.heights)
	colors = Marshalls.base64_to_raw(d.colors)
	outer = Marshalls.base64_to_raw(d.outer)
	vert_node = _b64i(d.vert_node)
	var t: Dictionary = d.tree
	parent = PackedInt32Array(t.parent)
	low = PackedFloat32Array(t.low)
	high = PackedFloat32Array(t.high)
	minv = PackedInt32Array(t.minv)
	desc = PackedInt32Array(t.desc)
	own_off = PackedInt32Array(t.own_off)
	own_len = PackedInt32Array(t.own_len)
	own_h = _b64f(d.own_heights)
	children = []
	for _k in parent.size():
		children.append(PackedInt32Array())
	for k in parent.size():
		if parent[k] >= 0:
			var c: PackedInt32Array = children[parent[k]]
			c.append(k)
			children[parent[k]] = c
	node_has_sink = PackedByteArray()
	node_has_sink.resize(parent.size())
	var k := vert_node[sink]
	while k >= 0:
		node_has_sink[k] = 1
		k = parent[k]
	rings = d.rings
	pools = d.pools
	landmarks = d.landmarks
	props = d.props
	far = d.get("far", {})
	drained_at = PackedFloat32Array()
	drained_at.resize(w * w)
	drained_at.fill(-1e6)


# --- Geometry ------------------------------------------------------------------------------
func vertex_xz(v: int) -> Vector2:
	return Vector2(x0 + float(v % w) * s, z0 + float(v / w) * s)


func vertex_pos(v: int) -> Vector3:
	var p := vertex_xz(v)
	return Vector3(p.x, h[v], p.y)


func vertex_of(x: float, z: float) -> int:
	var i := clampi(int(round((x - x0) / s)), 0, w - 1)
	var j := clampi(int(round((z - z0) / s)), 0, w - 1)
	return j * w + i


func in_bounds(x: float, z: float) -> bool:
	return x >= x0 and z >= z0 and x <= x0 + n * s and z <= z0 + n * s


func height_at(x: float, z: float) -> float:
	var fi := clampf((x - x0) / s, 0.0, float(n) - 0.001)
	var fj := clampf((z - z0) / s, 0.0, float(n) - 0.001)
	var i := int(fi)
	var j := int(fj)
	var u := fi - i
	var v := fj - j
	var a := h[j * w + i]
	var b := h[j * w + i + 1]
	var c := h[(j + 1) * w + i]
	var e := h[(j + 1) * w + i + 1]
	# Same split as the meshes (diagonal from (i, j) to (i+1, j+1)).
	if u >= v:
		return a + (b - a) * u + (e - b) * v
	return a + (e - c) * u + (c - a) * v


func normal_at(x: float, z: float) -> Vector3:
	var dx := height_at(x + 0.5, z) - height_at(x - 0.5, z)
	var dz := height_at(x, z + 0.5) - height_at(x, z - 0.5)
	return Vector3(-dx, 1.0, -dz).normalized()


# --- Water ---------------------------------------------------------------------------------
func reset_water() -> void:
	bodies = {}
	_slots_used = {}
	next_id = 1
	main_id = NO_BODY
	drained_at.fill(-1e6)
	# Every component of the bay below the old sea level starts full.
	for k in parent.size():
		if low[k] <= 0.0 and 0.0 < high[k]:
			var id := _add_body(k, 0.0)
			if node_has_sink[k] == 1:
				main_id = id
	_rebuild()


func _add_body(node: int, level: float) -> int:
	var id := next_id
	next_id += 1
	var slot := 0
	while _slots_used.has(slot) and slot < MAX_SLOTS - 1:
		slot += 1
	_slots_used[slot] = id
	bodies[id] = {"node": node, "level": level, "slot": slot}
	return id


func _remove_body(id: int) -> void:
	var b: Dictionary = bodies[id]
	if _slots_used.get(b.slot, -1) == id:
		_slots_used.erase(b.slot)
	bodies.erase(id)


func area(node: int, level: float) -> float:
	## Cells of water in this node at this level (one cell is s² m²).
	var off := own_off[node]
	var cnt := own_len[node]
	var lo := 0
	var hi := cnt
	while lo < hi:
		var mid := (lo + hi) >> 1
		if own_h[off + mid] < level:
			lo = mid + 1
		else:
			hi = mid
	return float(desc[node] + lo) * s * s


func volume_mult(level: float) -> float:
	var depth := maxf(0.0, -level)
	var d := depth / deep_scale if deep_scale > 0.0 else 0.0
	var town := 1.0 + (Balance.TOWN_MULT - 1.0) * clampf((depth - Balance.TOWN_FROM) / 0.8, 0.0, 1.0)
	return (1.0 + d * d) * town


func body_area(id: int) -> float:
	if not bodies.has(id):
		return 0.0
	return area(int(bodies[id].node), float(bodies[id].level))


func level_of(id: int) -> float:
	return float(bodies[id].level) if bodies.has(id) else -1e9


func main_level() -> float:
	## The level of the main body; once it's gone, the bottom of the bay.
	if bodies.has(main_id):
		return float(bodies[main_id].level)
	return h[sink]


func floor_of(id: int) -> float:
	## The deepest seabed under this body.
	return h[minv[int(bodies[id].node)]] if bodies.has(id) else 0.0


func max_depth(id: int) -> float:
	return level_of(id) - floor_of(id) if bodies.has(id) else 0.0


func deepest_vertex(id: int) -> int:
	return minv[int(bodies[id].node)] if bodies.has(id) else sink


func is_drained() -> bool:
	return not bodies.has(main_id)


func pool_ids() -> Array:
	var out: Array = []
	for id in bodies:
		if id != main_id:
			out.append(id)
	return out


func body_volume(id: int) -> float:
	## m³ of water in a body (sums over its cells; for stats, not every frame).
	if not bodies.has(id):
		return 0.0
	var node := int(bodies[id].node)
	var lvl := float(bodies[id].level)
	var vol := 0.0
	var stack := [node]
	while not stack.is_empty():
		var k: int = stack.pop_back()
		var off := own_off[k]
		for i in own_len[k]:
			var hv := own_h[off + i]
			if hv >= lvl:
				break
			vol += lvl - hv
		for c in children[k]:
			stack.append(c)
	return vol * s * s


func step(dt: float, flows: Dictionary, now: float = 0.0) -> Array:
	## Lowers each body by flow * dt / area. flows: body id -> m³/s.
	## Returns events: {"type": "split", "id", "into": [ids], "main": bool},
	## {"type": "emptied", "id", "node", "was_main": bool}.
	var events: Array = []
	for id in flows:
		if not bodies.has(id):
			continue
		var q: float = flows[id]
		if q <= 0.0:
			continue
		var b: Dictionary = bodies[id]
		var lvl := float(b.level)
		var a := maxf(area(int(b.node), lvl), 1.0) * volume_mult(lvl)
		b.level = lvl - q * dt / a
	_settle(events, now)
	return events


func lower_body(id: int, to_level: float, now: float = 0.0) -> Array:
	## Sets a body straight to a level (dev tools, tests). Returns events.
	var events: Array = []
	if bodies.has(id):
		bodies[id].level = minf(float(bodies[id].level), to_level)
	_settle(events, now)
	return events


func _settle(events: Array, now: float) -> void:
	var changed := false
	var again := true
	while again:
		again = false
		for id in bodies.keys():
			var b: Dictionary = bodies[id]
			var node := int(b.node)
			var lvl := float(b.level)
			if lvl >= low[node]:
				continue
			again = true
			changed = true
			var was_main: bool = id == main_id
			_remove_body(id)
			var kids: PackedInt32Array = children[node]
			if kids.is_empty():
				if was_main:
					main_id = NO_BODY
				events.append({"type": "emptied", "id": id, "node": node, "was_main": was_main})
				_mark_drained(node, lvl, now)
				continue
			var into: Array = []
			for c in kids:
				# Tiny dimples just soak away instead of becoming pools.
				var keep: bool = node_has_sink[c] == 1 or (area(c, lvl) >= PUDDLE_AREA and lvl - h[minv[c]] >= PUDDLE_DEPTH)
				if not keep:
					_mark_drained(c, lvl, now)
					continue
				var nid := _add_body(c, lvl)
				into.append(nid)
				if was_main and node_has_sink[c] == 1:
					main_id = nid
			if was_main and not bodies.has(main_id):
				main_id = NO_BODY
			events.append({"type": "split", "id": id, "into": into, "main": was_main})
			break
	if changed:
		_rebuild()


func _mark_drained(node: int, level: float, now: float) -> void:
	## The cells this node held are left wet; _rebuild stamps when, so they
	## dry over the next minute instead of all at once.
	_pending_drain.append([node, level, now])


var _pending_drain: Array = []


func _rebuild() -> void:
	## Which body every vertex belongs to, and what the shaders draw. Runs
	## on every split, so it touches each vertex as few times as it can.
	topo_version += 1
	var nn := parent.size()
	_node_body = PackedInt32Array()
	_node_body.resize(nn)
	_node_body.fill(NO_BODY)
	for id in bodies:
		_node_body[int(bodies[id].node)] = id
	# Parents come after their children, so walk down from the top.
	var act := PackedInt32Array()
	act.resize(nn)
	var act_slot := PackedInt32Array()
	act_slot.resize(nn)
	for k in range(nn - 1, -1, -1):
		var b := _node_body[k]
		if b == NO_BODY and parent[k] >= 0:
			b = act[parent[k]]
		act[k] = b
		act_slot[k] = int(bodies[b].slot) if b != NO_BODY else 255
	var any_drained := not _pending_drain.is_empty()
	var d_lvl := 0.0
	var d_t := 0.0
	for pd in _pending_drain:
		d_lvl = float(pd[1])
		d_t = float(pd[2])
	var total := w * w
	var old := vertex_body
	var had_old := not old.is_empty()
	vertex_body = PackedInt32Array()
	vertex_body.resize(total)
	draw_slot = PackedByteArray()
	draw_slot.resize(total)
	for v in total:
		var k := vert_node[v]
		if k < 0:
			vertex_body[v] = NO_BODY
			draw_slot[v] = 255
			continue
		var id := act[k]
		vertex_body[v] = id
		draw_slot[v] = act_slot[k]
		if id == NO_BODY and any_drained and had_old and old[v] != NO_BODY:
			# Left dry by an emptied body: it dries over time from here.
			drained_at[v] = d_t - maxf(0.0, h[v] - d_lvl) * 14.0
	_pending_drain.clear()
	# Dry cells beside a body (the shaders' shoreline halo) are drawn by the
	# shaders themselves: they look at the four neighbours' slots.


func slot_levels() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(MAX_SLOTS)
	out.fill(-1000.0)
	for id in bodies:
		out[int(bodies[id].slot)] = float(bodies[id].level)
	return out


# --- Queries ---------------------------------------------------------------------------------
func body_at(x: float, z: float) -> int:
	if not in_bounds(x, z):
		return NO_BODY
	return vertex_body[vertex_of(x, z)]


func water_level_at(x: float, z: float) -> float:
	## The surface of the water here, or -1e9 if none (dry or drained).
	var id := body_at(x, z)
	if id == NO_BODY:
		return -1e9
	return float(bodies[id].level)


func depth_at(x: float, z: float) -> float:
	## Water over the seabed here (negative when dry).
	return water_level_at(x, z) - height_at(x, z)


func is_wet(x: float, z: float) -> bool:
	return depth_at(x, z) > 0.0


func body_name(id: int) -> String:
	if id == main_id:
		return "The bay"
	for p in pools:
		var v := int(p.v)
		if vertex_body[v] == id:
			return str(p.name)
	# A pool the name isn't on: name it after the nearest designed pool.
	if bodies.has(id):
		var dv := vertex_xz(deepest_vertex(id))
		var best := 1e9
		var nm := "Rock pool"
		for p in pools:
			var d := dv.distance_to(Vector2(float(p.x), float(p.z)))
			if d < best and d < 9.0:
				best = d
				nm = str(p.name)
		return nm
	return "Pool"


func descend(v: int) -> int:
	## Steepest descent from a vertex to a local low point (where water gathers).
	var guard := 0
	while guard < 1600:
		guard += 1
		var i := v % w
		var best := v
		for nb in [v - 1, v + 1, v - w, v + w]:
			if nb < 0 or nb >= w * w:
				continue
			if (nb == v - 1 and i == 0) or (nb == v + 1 and i == w - 1):
				continue
			if outer[nb] == 0 and h[nb] < h[best]:
				best = nb
		if best == v:
			return v
		v = best
	return v


func float_spot(x: float, z: float) -> Dictionary:
	## Where a barge dropped here ends up: on the water it's on, or slid down
	## the seabed to the first water below. {"body", "v", "pos"} or {} if none.
	var v := vertex_of(x, z)
	var guard := 0
	while guard < 1600:
		guard += 1
		var id := vertex_body[v]
		# 15 cm of water floats a barge; a pool already pumped shallower than
		# that still takes one at its deepest point, so no pool is left for good.
		if id != NO_BODY and h[v] < float(bodies[id].level) - minf(0.15, max_depth(id) * 0.5):
			return {"body": id, "v": v, "pos": Vector3(vertex_xz(v).x, float(bodies[id].level), vertex_xz(v).y)}
		var nxt := v
		var i := v % w
		for nb in [v - 1, v + 1, v - w, v + w]:
			if nb < 0 or nb >= w * w:
				continue
			if (nb == v - 1 and i == 0) or (nb == v + 1 and i == w - 1):
				continue
			if outer[nb] == 0 and h[nb] < h[nxt]:
				nxt = nb
		if nxt == v:
			return {}
		v = nxt
	return {}


func intake_toward(from: Vector3, to: Vector3, id: int) -> Vector3:
	## Where a hose laid from `from` straight towards `to` first reaches the
	## water of body `id` (a little way in from the edge), or INF.
	if not bodies.has(id):
		return Vector3.INF
	var lvl := float(bodies[id].level)
	var d := Vector2(to.x - from.x, to.z - from.z)
	var L := d.length()
	if L < 0.01:
		return Vector3.INF
	var dir := d / L
	var t := 0.0
	var wet_run := 0.0
	while t < L:
		var x := from.x + dir.x * t
		var z := from.z + dir.y * t
		if in_bounds(x, z) and vertex_body[vertex_of(x, z)] == id and height_at(x, z) < lvl - 0.05:
			wet_run += s
			if wet_run >= 1.2:
				return Vector3(x, lvl, z)
		else:
			wet_run = 0.0
		t += s
	return Vector3.INF


func nearest_water(from: Vector3, id: int, reach: float = 110.0) -> Vector3:
	## The nearest water of body `id` to `from`, searched along 32 rays (fast
	## enough to re-lay every hose as the water drops). A little way in from
	## the edge, so a hose end sits in the water. INF if none.
	if not bodies.has(id):
		return Vector3.INF
	var lvl := float(bodies[id].level)
	var best := Vector3.INF
	var bd := 1e9
	for k in 32:
		var a := TAU * float(k) / 32.0
		var dir := Vector2(cos(a), sin(a))
		var t := 1.0
		var run := 0.0
		while t < reach and t < bd:
			var x := from.x + dir.x * t
			var z := from.z + dir.y * t
			if not in_bounds(x, z):
				break
			if vertex_body[vertex_of(x, z)] == id and height_at(x, z) < lvl - 0.05:
				run += 1.0
				if run >= 1.5:
					bd = t
					best = Vector3(x, lvl, z)
					break
			else:
				run = 0.0
			t += 1.0
	return best


func nearest_wet(from: Vector3, id: int, max_r: int = 70) -> Vector3:
	## The nearest point of a body's water to `from` (for hoses), by rings of cells.
	if not bodies.has(id):
		return Vector3.INF
	var lvl := float(bodies[id].level)
	var c := vertex_of(from.x, from.z)
	var ci := c % w
	var cj := c / w
	for r in range(0, max_r, 1):
		var best := Vector3.INF
		var bd := 1e9
		for dj in range(-r, r + 1):
			for di in [-r, r] if absi(dj) != r else range(-r, r + 1):
				var i: int = ci + di
				var j: int = cj + dj
				if i < 0 or j < 0 or i >= w or j >= w:
					continue
				var v := j * w + i
				if vertex_body[v] == id and h[v] < lvl - 0.05:
					var p := Vector3(x0 + i * s, lvl, z0 + j * s)
					var d := p.distance_squared_to(Vector3(from.x, lvl, from.z))
					if d < bd:
						bd = d
						best = p
		if best != Vector3.INF:
			return best
	return Vector3.INF


func ring_of_y(y: float) -> int:
	for i in rings.size():
		if y > float(rings[i].bottom):
			return i
	return rings.size() - 1


# --- Save --------------------------------------------------------------------------------------
func save_data() -> Dictionary:
	var list: Array = []
	for id in bodies:
		list.append([int(bodies[id].node), snappedf(float(bodies[id].level), 0.0001)])
	return {"bodies": list}


func load_data(d: Dictionary) -> void:
	if not d.has("bodies"):
		reset_water()
		return
	bodies = {}
	_slots_used = {}
	next_id = 1
	main_id = NO_BODY
	for e in d.bodies:
		var node := int(e[0])
		if node < 0 or node >= parent.size():
			continue
		var id := _add_body(node, float(e[1]))
		if node_has_sink[node] == 1:
			main_id = id
	_pending_drain.clear()
	vertex_body = PackedInt32Array()
	_rebuild()
	# Anything that's dry and not in a body loaded dry already.
	for v in w * w:
		if vertex_body[v] == NO_BODY:
			drained_at[v] = -1e6
