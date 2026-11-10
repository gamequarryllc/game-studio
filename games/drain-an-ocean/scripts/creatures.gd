class_name Creatures
extends Node3D
## Everything that lives in the bay. Spots are laid out once, from a fixed
## seed, so a save's "rescued" list always means the same animals: three in
## every designed pool (of that pool's ring), a few in the open water of each
## ring, and the whale calf in the lost town's square, where the last water
## gathers. Under water they swim slow circles; when the water over them is
## shallower than Balance.STRAND_DEPTH they're stranded: they flop, a ring
## pulses round them and a tap (or a pelican) rescues them.

const SEED := 4242

var bay: Bay
var spots: Array = []            # {"species", "pos": Vector3 (seabed), "pool": name, "node", "ring", "phase"}
var _markers := {}               # spot -> ring marker node
var _flying: Array = []          # rescue arcs in flight
var clear_view: Array = []       # [eye, target, radius]: the ending's camera; creatures in its way aren't drawn
var aquarium_target := Vector3(21.0, 3.0, 55.0)
var ring_mesh: Mesh
var ring_mat: StandardMaterial3D


func setup(b: Bay) -> void:
	bay = b
	_layout()
	# The tap marker: a chart's position circle (a dashed ink ring with four
	# ticks on a paper halo), lying flat on the sand round a stranded animal.
	var qm := QuadMesh.new()
	qm.size = Vector2(2.6, 2.6)
	qm.orientation = PlaneMesh.FACE_Y
	ring_mesh = qm
	ring_mat = StandardMaterial3D.new()
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_mat.albedo_texture = ChartMarks.position_circle()
	ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	for i in spots.size():
		var sp: Dictionary = spots[i]
		var def: Dictionary = Balance.SPECIES[int(sp.species)]
		var n := Models.instance(str(def.model))
		n.name = "Creature_%d" % i
		var sc := Models.SCALE_CREATURE if str(def.key) != "whale" else Models.SCALE_WHALE
		sp.scale = sc
		n.scale = Vector3.ONE * sc
		add_child(n)
		sp.node = n
		n.visible = not GameState.is_rescued(i)


func _layout() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = SEED
	spots = []
	var per_ring_count := {}
	# Pools.
	for p in bay.pools:
		var ring := Balance.ring_of_level(float(p.spill))
		var sp_list := Balance.species_in_ring(ring)
		if sp_list.is_empty():
			continue
		var node := int(p.node)
		var cand: Array = []
		for v in bay.w * bay.w:
			if bay.vert_node[v] == node and bay.h[v] < float(p.spill) - 0.5:
				cand.append(v)
		if cand.is_empty():
			cand.append(bay.minv[node])
		for k in Balance.CREATURES_PER_POOL:
			var c := int(per_ring_count.get(ring, 0))
			per_ring_count[ring] = c + 1
			var v: int = cand[rng.randi() % cand.size()]
			_add(sp_list[c % sp_list.size()], bay.vertex_pos(v) + Vector3(rng.randf_range(-0.3, 0.3), 0, rng.randf_range(-0.3, 0.3)), str(p.name), ring, rng)
	# Open water in each ring.
	for ring in Balance.RINGS.size() - 1:
		var sp_list := Balance.species_in_ring(ring)
		var top := float(Balance.RINGS[ring].top) - 0.6
		var bot := float(Balance.RINGS[ring].bottom) + 0.3
		var zmin := -50.0
		if ring == 0:
			# The first strandings: on the sandbars in front of the town.
			top = -0.5
			bot = -0.95
			zmin = 14.0
		var placed := 0
		var tries := 0
		while placed < Balance.OPEN_CREATURES_PER_RING and tries < 3000:
			tries += 1
			var x := rng.randf_range(-55.0, 55.0)
			var z := rng.randf_range(zmin, 45.0)
			var y := bay.height_at(x, z)
			if y > top or y < bot:
				continue
			if _near_pool(x, z, 7.0):
				continue
			var c := int(per_ring_count.get(ring, 0))
			per_ring_count[ring] = c + 1
			_add(sp_list[c % sp_list.size()], Vector3(x, y, z), "", ring, rng)
			placed += 1
	# The whale calf, where the last water gathers.
	var wi := Balance.species_index("whale")
	var sv := bay.vertex_pos(bay.sink)
	_add(wi, sv + Vector3(1.5, 0.0, 2.0), "The town square", 5, rng)


func _near_pool(x: float, z: float, r: float) -> bool:
	for p in bay.pools:
		if Vector2(x, z).distance_to(Vector2(float(p.x), float(p.z))) < r:
			return true
	return false


func _add(species: int, pos: Vector3, pool: String, ring: int, rng: RandomNumberGenerator) -> void:
	pos.y = bay.height_at(pos.x, pos.z)
	spots.append({"species": species, "pos": pos, "pool": pool, "ring": ring, "phase": rng.randf() * TAU,
		"yaw": rng.randf() * TAU, "node": null})


func depth(i: int) -> float:
	var p: Vector3 = spots[i].pos
	return bay.water_level_at(p.x, p.z) - bay.height_at(p.x, p.z)


func is_stranded(i: int) -> bool:
	return not GameState.is_rescued(i) and depth(i) < Balance.STRAND_DEPTH


func stranded_list() -> Array:
	var out: Array = []
	for i in spots.size():
		if is_stranded(i):
			out.append(i)
	return out


func screen_pos(i: int) -> Vector3:
	var n: Node3D = spots[i].node
	return n.global_position if n != null else spots[i].pos


func fly_away(i: int, to: Vector3, release: bool = false) -> void:
	## The rescue: the creature arcs over to the aquarium (or over the sea
	## wall, for the whale calf) and is gone.
	var n: Node3D = spots[i].node
	if n == null:
		return
	if _markers.has(i):
		_markers[i].queue_free()
		_markers.erase(i)
	var from := n.global_position
	if release:
		to = Vector3(from.x, 0.0, -75.0)
	_flying.append({"node": n, "from": from, "to": to, "t": 0.0, "dur": 1.3 if not release else 3.0, "h": 6.0 if not release else 14.0,
		"scale": float(spots[i].get("scale", 1.0))})


func update(delta: float, now: float) -> void:
	for i in spots.size():
		var sp: Dictionary = spots[i]
		var n: Node3D = sp.node
		if n == null or GameState.is_rescued(i):
			if _markers.has(i):
				_markers[i].queue_free()
				_markers.erase(i)
			continue
		var base: Vector3 = sp.pos
		var lvl := bay.water_level_at(base.x, base.z)
		var d := lvl - base.y
		var ph: float = sp.phase
		var key := str(Balance.SPECIES[int(sp.species)].key)
		var ground_dweller := key in ["hermit_crab", "starfish", "urchin", "lobster", "flounder"]
		if d >= Balance.STRAND_DEPTH:
			# Swimming (or pottering on the bottom) under the water.
			n.visible = true
			if ground_dweller:
				var off := Vector3(cos(now * 0.2 + ph), 0, sin(now * 0.2 + ph)) * 0.6
				n.position = base + off
				n.position.y = bay.height_at(n.position.x, n.position.z) + 0.05
				n.rotation = Vector3(0, PI - (now * 0.2 + ph), 0)
			else:
				var r := 2.4 if key != "whale" else 3.0
				var a := now * 0.35 + ph
				var c := base + Vector3(cos(a), 0, sin(a)) * r
				var sy := maxf(bay.height_at(c.x, c.z) + 0.35, lvl - minf(0.6 + d * 0.25, 1.4))
				n.position = Vector3(c.x, sy + sin(now * 1.3 + ph) * 0.06, c.z)
				n.rotation = Vector3(0, PI - a, sin(now * 3.0 + ph) * 0.08)
			if _markers.has(i):
				_markers[i].queue_free()
				_markers.erase(i)
		else:
			# Stranded: flopping in what's left of the water.
			n.visible = true
			var g := bay.height_at(base.x, base.z)
			var flop := absf(sin(now * 5.0 + ph))
			n.position = Vector3(base.x, g + 0.08 + (0.18 * flop if not ground_dweller else 0.02), base.z)
			n.rotation = Vector3(0, float(sp.yaw), (sin(now * 5.0 + ph) * 0.9 if not ground_dweller else sin(now * 3.0) * 0.15) + (PI * 0.45 if key in ["kelp_bass", "clownfish", "pufferfish", "anglerfish", "lanternfish", "coelacanth", "moray"] else 0.0))
			if not _markers.has(i):
				var m := MeshInstance3D.new()
				m.mesh = ring_mesh
				m.material_override = ring_mat
				m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				add_child(m)
				_markers[i] = m
			var mk: MeshInstance3D = _markers[i]
			var pulse := fmod(now * 0.9 + ph, 1.0)
			var big := 1.0 if key != "whale" else 3.2
			mk.position = Vector3(base.x, maxf(g, lvl) + 0.08, base.z)
			var breathe := 0.5 + 0.5 * sin(now * 3.2 + ph)
			mk.scale = Vector3.ONE * big * (0.94 + 0.1 * breathe)
			mk.rotation.y = now * 0.25 + ph
			mk.visible = clear_view.is_empty()
		if not clear_view.is_empty() and _in_the_way(n.global_position):
			n.visible = false
	# Rescue arcs.
	for k in range(_flying.size() - 1, -1, -1):
		var f: Dictionary = _flying[k]
		f.t = float(f.t) + delta
		var u := clampf(float(f.t) / float(f.dur), 0.0, 1.0)
		var e := u * u * (3.0 - 2.0 * u)
		var p := (f.from as Vector3).lerp(f.to, e)
		p.y += sin(u * PI) * float(f.h)
		var n: Node3D = f.node
		if is_instance_valid(n):
			n.global_position = p
			n.rotation.x += delta * 6.0
			n.scale = Vector3.ONE * lerpf(1.0, 0.3, e)
			# a pelican's catch on its way to the aquarium passes the ending's camera
			n.visible = clear_view.is_empty() or not _in_the_way(p)
		if u >= 1.0:
			if is_instance_valid(n):
				n.visible = false
				n.scale = Vector3.ONE
			_flying.remove_at(k)


func _in_the_way(p: Vector3) -> bool:
	## Near the ending camera's sightline to the tower (or right under its lens).
	var eye: Vector3 = clear_view[0]
	var tgt: Vector3 = clear_view[1]
	var seg := tgt - eye
	var u := clampf((p - eye).dot(seg) / maxf(seg.length_squared(), 0.001), 0.0, 0.85)
	var d := p.distance_to(eye + seg * u)
	return d < float(clear_view[2]) + 6.0 * u or p.distance_to(eye) < 14.0
