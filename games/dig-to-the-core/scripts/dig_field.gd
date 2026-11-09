class_name DigField
extends Node3D
## The planet under the field: a 16 x 16 m dig site, ten zones straight down.
##
## The rock is a grid of density values every RES metres (1 = solid rock,
## 0 = air; the surface is where it crosses 0.5). Digging lowers the density
## inside a ball, so holes are smooth and the surface creeps back as you dig.
## Every point also has a rock type and an ore type (0 = none).
##
## The grid is split into zones stacked on top of each other (ZN point rows,
## 24 m each). Only the zones near you (and near the bottom of your shaft,
## where the helpers dig) are in memory as live grids with meshes and
## collision: the zone below starts loading as you get near its floor, a bit
## at a time, and zones far above are packed into a save string and freed.
## A zone that was never dug is just regenerated from the world seed.
##
## Each zone is cut into 8 x 8 x 8 point chunks. A chunk is meshed with
## surface nets (one vertex per cell the surface passes through, one quad per
## grid edge it crosses) from a small copy of the grid around it, so chunks
## at zone seams read their neighbours' rows. Chunks that are all rock or all
## air have no mesh at all, which is most of them.
##
## Rows are counted upward from the bottom of the deepest zone (row 0) to
## the top of the field (rows - 1, just under the grass). Points outside the
## site in x/z are the shaft wall: solid below ground, air above.

signal dug(result: Dictionary)   # what a strike dug out: see dig()
signal find_exposed(find: int)
signal zone_ready(zone: int)

const RES := 0.5
const NX := 32                     # points across, in x and in z
const ZN := 48                     # point rows per zone (24 m)
const CH := 8                      # chunk size in points
const NCX := NX / CH
const CROWS := ZN / CH             # chunk rows per zone
const PLANE := NX * NX
const ZONE_POINTS := PLANE * ZN
const X0 := -7.75                  # world x (and z) of point 0: the site spans [-8, 8]
const HALF := 8.0
const FALLOFF := 0.6               # a strike does 100% at the centre, 40% at the edge
const REMESH_BUDGET_USEC := 5000   # per frame
const GEN_BUDGET_USEC := 3500      # per frame, generating a zone in the background
const CHUNK_MIN_INTERVAL := 0.08
const WALL := 255                  # rock type of the shaft wall (outside the site)
const GRASS := Color(0.48, 0.55, 0.25)   # olive (the shader paints clumps over it)

var nzones := 10
var rows := 0
var bottom_y := 0.0                # world y of row 0
var seed_value := 0
var zones: Array = []              # per zone: Zone, or null when it isn't in memory
var saves: Array = []              # per zone: "" = never dug, else its packed grid
var found: Array = []              # per find: already dug out (set by GameState)
var material: ShaderMaterial
var focus := Vector3.ZERO          # chunks nearest this get re-meshed first (the player)

var _hp := PackedFloat32Array()    # per rock type, filled per zone as needed
var _dirty := {}                   # Vector3i(cx, chunk row, cz) -> true
var _gen: Zone                     # the zone being generated in the background
var _gen_row := 0
var _want := {}                    # zone -> true: should be in memory
var _clock := 0.0
var _mat_colors: Array = []
var _bf := PackedFloat32Array()    # the block of grid a chunk is meshed from
var _line := PackedByteArray()     # per line of block points along x: 0 air, 1 rock, 2 both
var _row_zone: Array = []          # per block row: its Zone (or null)
var _row_l := PackedInt32Array()   # per block row: its row in that zone
var _row_v := PackedFloat32Array() # per block row: >= 0 when the whole row is one value
var _mat_glow := PackedFloat32Array()
var _ore_colors: Array = []
var _ore_glow := PackedFloat32Array()
var _cell := PackedInt32Array()
var _self_glow := 0.0              # set by _vertex_color: the rock's own glow (UV.x)
var _is_grass := false             # set by _vertex_color: this vertex is the field's grass (UV.y)
var _is_wall := false              # set by _vertex_color: this vertex is on the shaft wall
var _vert_ore := 0                 # set by _vertex_color: the ore at this vertex (for nuggets)
const B := CH + 2                  # block size: one point either side
const BC := CH + 1                 # cells per axis in a block


class Zone:
	## One zone's grid while it's in memory.
	var index := 0
	var f := PackedFloat32Array()  # density per point: i + NX * k + PLANE * row
	var m := PackedByteArray()     # rock type (Balance.MATERIALS)
	var o := PackedByteArray()     # ore (Balance.ORES), 0 = none
	var hp := PackedFloat32Array() # hp of each point's rock (cached from m)
	var worth := 1.0
	var y0 := 0.0                  # world y of this zone's bottom row
	var node: Node3D               # its meshes
	var body: StaticBody3D         # its collision (layer 2)
	var chunks := {}               # local chunk index -> {mesh, shape, t}
	var finds := {}                # point -> find, for finds still buried here
	var changed := false           # dug since its save string was made
	var dug_points := 0
	var landmark: Node3D           # this layer's set piece (freed with the zone)

	func dig(center: Vector3, r2: float, per: float, i0: int, i1: int, l0: int, l1: int, k0: int, k1: int,
			out: Dictionary) -> void:
		## Lowers the density of every point in the ball. Tallies what turned
		## to air into `out`: points, hp, ore points per ore, ore hp, finds.
		for l in range(l0, l1 + 1):
			var dy := y0 + l * RES - center.y
			for k in range(k0, k1 + 1):
				var dz := X0 + k * RES - center.z
				var dyz := dy * dy + dz * dz
				if dyz > r2:
					continue
				var base := NX * k + PLANE * l
				for i in range(i0, i1 + 1):
					var s := base + i
					var v := f[s]
					if v <= 0.0:
						continue
					var dx := X0 + i * RES - center.x
					var d2 := dx * dx + dyz
					if d2 > r2:
						continue
					var h := hp[s]
					var nv := maxf(v - per * (1.0 - FALLOFF * d2 / r2) / h, 0.0)
					f[s] = nv
					out.touched = true
					if v > 0.5 and nv <= 0.5:
						out.points += 1
						var ore := o[s]
						if ore > 0:
							out.ore_points += 1
							out.ore_hp += h
							out.ores[ore] = int(out.ores.get(ore, 0)) + 1
						else:
							out.hp += h
						if finds.has(s):
							out.finds.append(finds[s])
		if out.points > 0:
			changed = true
			dug_points += out.points

	func gen_row(l: int, m0: int, m1: int, hp0: float, hp1: float, noise_mat: FastNoiseLite,
			noise_ore: Array, thresholds: Array, ore_ids: PackedInt32Array) -> void:
		## Fills one row of fresh rock: the zone's main rock with pockets of
		## the other, and ore veins where the ore noise peaks.
		var y := y0 + l * RES
		var nore := ore_ids.size()
		for k in NX:
			var zw := X0 + k * RES
			for i in NX:
				var xw := X0 + i * RES
				var s := i + NX * k + PLANE * l
				var pocket := noise_mat.get_noise_3d(xw, y * 1.6, zw) > 0.22
				m[s] = m1 if pocket else m0
				hp[s] = hp1 if pocket else hp0
				f[s] = 1.0
				var ore := 0
				for n in nore:
					if (noise_ore[n] as FastNoiseLite).get_noise_3d(xw, y, zw) > float(thresholds[n]):
						ore = ore_ids[n]
						break
				o[s] = ore

	func carve_row(l: int, c: Vector3, rad: Vector3) -> void:
		## Hollows out one row of a round cave.
		var y := y0 + l * RES
		var ey := (y - c.y) / rad.y
		if absf(ey) > 1.4:
			return
		var thin := minf(rad.x, minf(rad.y, rad.z))
		for k in NX:
			var ez := (X0 + k * RES - c.z) / rad.z
			for i in NX:
				var ex := (X0 + i * RES - c.x) / rad.x
				var r := sqrt(ex * ex + ey * ey + ez * ez)
				var v := clampf(0.5 + (r - 1.0) * thin / (2.0 * RES), 0.0, 1.0)   # roughly metres from the wall
				var s := i + NX * k + PLANE * l
				if v < f[s]:
					f[s] = v

	func clear_find(fi: int) -> void:
		for s in finds.keys():
			if finds[s] == fi:
				finds.erase(s)


# =====================================================================================
# Setup
# =====================================================================================
func setup(p_seed: int) -> void:
	seed_value = p_seed
	nzones = Balance.zone_count()
	rows = nzones * ZN
	bottom_y = -nzones * Balance.ZONE_DEPTH + RES * 0.5
	zones.resize(nzones)
	zones.fill(null)
	if saves.size() != nzones:
		saves.resize(nzones)
		saves.fill("")
	if found.size() != Balance.FINDS.size():
		found.resize(Balance.FINDS.size())
		found.fill(false)
	_mat_colors.clear()
	for mt in Balance.MATERIALS:
		_mat_colors.append(mt.color)
	_bf.resize(B * B * B)
	_line.resize(B * B)
	_row_zone.resize(B)
	_row_l.resize(B)
	_row_v.resize(B)
	_mat_glow.resize(Balance.MATERIALS.size())
	for mi in Balance.MATERIALS.size():
		_mat_glow[mi] = float(Balance.MATERIALS[mi].get("glow", 0.0))
	_ore_colors = [Color.BLACK]
	_ore_glow.resize(Balance.ORES.size())
	for oi in range(1, Balance.ORES.size()):
		_ore_colors.append(Balance.ORES[oi].color)
		_ore_glow[oi] = float(Balance.ORES[oi].glow)
	_cell.resize(BC * BC * BC)
	material = make_rock_material()


func zone_of_y(y: float) -> int:
	return clampi(int(floor(-y / Balance.ZONE_DEPTH)), 0, nzones - 1)


func zone_top(z: int) -> float:
	return -z * Balance.ZONE_DEPTH


func zone_floor(z: int) -> float:
	return -(z + 1) * Balance.ZONE_DEPTH


func is_loaded(z: int) -> bool:
	return z >= 0 and z < nzones and zones[z] != null


func loaded_zones() -> Array:
	var out: Array = []
	for z in nzones:
		if zones[z] != null:
			out.append(z)
	return out


func depth_of_core() -> float:
	return nzones * Balance.ZONE_DEPTH


# =====================================================================================
# Streaming: which zones are in memory
# =====================================================================================
func want_zones(list: Dictionary) -> void:
	## The zones that should be in memory now (zone -> true). Missing ones are
	## generated in the background (nearest to the player first); the rest
	## are packed away.
	_want = list
	for z in nzones:
		if zones[z] != null and not _want.has(z):
			unload_zone(z)
	if _gen != null and not _want.has(_gen.index):
		_gen = null   # not needed any more


func window_for(y: float) -> Dictionary:
	## The zones to keep around someone at height y: theirs, the one above,
	## and the one below once they're near the floor (or always, below the top).
	var z := zone_of_y(y)
	var out := {z: true}
	if z > 0:
		out[z - 1] = true
	if z < nzones - 1:
		out[z + 1] = true
	return out


func ensure_loaded(z: int) -> void:
	## Load a zone right now (starting up, arriving by lift).
	if z < 0 or z >= nzones or zones[z] != null:
		return
	if _gen != null and _gen.index == z:
		while _gen != null and _gen.index == z:
			_generate_step(1 << 60)
		return
	var zone := _begin_zone(z)
	_gen = zone
	_gen_row = ZN - 1
	_generate_step(1 << 60)


func unload_zone(z: int) -> void:
	var zone: Zone = zones[z]
	if zone == null:
		return
	if zone.changed or saves[z] == "":
		saves[z] = _pack(zone) if zone.dug_points > 0 or saves[z] != "" else ""
		zone.changed = false
	zones[z] = null
	zone.node.queue_free()
	for key in _dirty.keys():
		if _zone_of_chunk_row((key as Vector3i).y) == z:
			_dirty.erase(key)
	# The zones next to it now see it as air (above) or rock (below).
	_dirty_zone_edge(z - 1, false)
	_dirty_zone_edge(z + 1, true)


func save_string(z: int) -> String:
	## This zone's dug grid for the save file ("" = untouched).
	var zone: Zone = zones[z]
	if zone != null and zone.changed:
		saves[z] = _pack(zone)
		zone.changed = false
	return saves[z]


func load_saves(list: Array) -> void:
	## Before any zone is loaded: what's been dug, per zone.
	for z in nzones:
		saves[z] = str(list[z]) if z < list.size() else ""


func _pack(zone: Zone) -> String:
	var packed := zone.f.to_byte_array().compress(FileAccess.COMPRESSION_DEFLATE)
	return "d1:%d:%s" % [ZONE_POINTS, Marshalls.raw_to_base64(packed)]


func _unpack(zone: Zone, data: String) -> bool:
	var parts := data.split(":", false, 2)
	if parts.size() != 3 or parts[0] != "d1" or int(parts[1]) != ZONE_POINTS:
		return false
	var raw := Marshalls.base64_to_raw(parts[2]).decompress(ZONE_POINTS * 4, FileAccess.COMPRESSION_DEFLATE)
	if raw.size() != ZONE_POINTS * 4:
		return false
	var loaded := raw.to_float32_array()
	var dug := 0
	for s in ZONE_POINTS:
		if loaded[s] > zone.f[s]:
			loaded[s] = zone.f[s]   # rock never grows back (and caves stay caves)
		elif zone.f[s] > 0.5 and loaded[s] <= 0.5:
			dug += 1
	zone.f = loaded
	zone.dug_points = dug
	return true


func _process(delta: float) -> void:
	_clock += delta
	# Background generation of a zone that's wanted.
	if _gen == null:
		var best := -1
		var best_d := INF
		for z in _want:
			if zones[z] == null:
				var d := absf((zone_top(z) + zone_floor(z)) * 0.5 - focus.y)
				if d < best_d:
					best_d = d
					best = z
		if best >= 0:
			_gen = _begin_zone(best)
			_gen_row = ZN - 1
	if _gen != null:
		_generate_step(Time.get_ticks_usec() + GEN_BUDGET_USEC)
	# Re-mesh dirty chunks, nearest first.
	if not _dirty.is_empty():
		var start := Time.get_ticks_usec()
		var keys := _dirty.keys()
		if keys.size() > 1:
			keys.sort_custom(func(a: Vector3i, b: Vector3i): return _chunk_center(a).distance_squared_to(focus) < _chunk_center(b).distance_squared_to(focus))
		for key in keys:
			var ch := _chunk_entry(key)
			if not ch.is_empty() and _clock - float(ch.t) < CHUNK_MIN_INTERVAL:
				continue
			_dirty.erase(key)
			_remesh(key)
			if Time.get_ticks_usec() - start > REMESH_BUDGET_USEC:
				break


func flush() -> void:
	## Finish everything now: every wanted zone and every dirty chunk (tests,
	## screenshots, loading, arriving by lift).
	while true:
		if _gen == null:
			for z in _want:
				if zones[z] == null:
					_gen = _begin_zone(z)
					_gen_row = ZN - 1
					break
		if _gen == null:
			break
		_generate_step(1 << 60)
	for key in _dirty.keys():
		_remesh(key)
	_dirty.clear()


func flush_near(p: Vector3, radius: float) -> void:
	## Re-mesh the dirty chunks around a spot right away (under the player's
	## feet, so the floor never goes missing for a frame).
	for key in _dirty.keys():
		if _chunk_center(key).distance_to(p) < radius + CH * RES:
			_dirty.erase(key)
			_remesh(key)


# =====================================================================================
# Generating a zone
# =====================================================================================
var _noise_mat: FastNoiseLite
var _noise_ore: Array = []
var _caves: Array = []


func _begin_zone(z: int) -> Zone:
	var zone := Zone.new()
	zone.index = z
	zone.worth = float(Balance.ZONES[z].worth)
	zone.y0 = bottom_y + float((nzones - 1 - z) * ZN) * RES
	zone.f.resize(ZONE_POINTS)
	zone.m.resize(ZONE_POINTS)
	zone.o.resize(ZONE_POINTS)
	zone.hp.resize(ZONE_POINTS)
	var zs := seed_value + 7919 * (z + 1)
	_noise_mat = FastNoiseLite.new()
	_noise_mat.seed = zs
	_noise_mat.frequency = 0.16
	_noise_mat.fractal_octaves = 2
	_noise_ore = []
	var ores: Array = Balance.ZONES[z].ores
	for n in ores.size():
		var nz := FastNoiseLite.new()
		nz.seed = zs + 101 * (n + 1)
		nz.frequency = 0.42
		nz.fractal_type = FastNoiseLite.FRACTAL_NONE
		_noise_ore.append(nz)
	# Caves: a few round hollows somewhere in the zone, away from its edges.
	_caves = []
	var rng := RandomNumberGenerator.new()
	rng.seed = zs + 5
	for c in int(Balance.ZONES[z].get("caves", 0)):
		var rad := Vector3(rng.randf_range(1.6, 3.2), rng.randf_range(1.2, 2.2), rng.randf_range(1.6, 3.2))
		var ctr := Vector3(rng.randf_range(-5.0, 5.0), rng.randf_range(zone_floor(z) + 4.0, zone_top(z) - 5.0), rng.randf_range(-5.0, 5.0))
		_caves.append([ctr, rad])
	if LANDMARKS.has(z):
		_caves.append(landmark_cave(z))
	return zone


func _generate_step(deadline: int) -> void:
	## Fills a few rows of the zone being generated, top down. Once it's done
	## the zone goes live.
	var zone := _gen
	var z := zone.index
	var mats: Array = Balance.ZONES[z].mats
	var ores: Array = Balance.ZONES[z].ores
	var m0: int = mats[0]
	var m1: int = mats[1]
	var hp0 := Balance.material_hp(m0, z)
	var hp1 := Balance.material_hp(m1, z)
	var thresholds: Array = []
	for o in ores:
		thresholds.append(0.7 - float(o[1]) * 2.2)
	var ore_ids := PackedInt32Array()
	for o in ores:
		ore_ids.append(int(o[0]))
	while _gen_row >= 0:
		var l := _gen_row
		_gen_row -= 1
		zone.gen_row(l, m0, m1, hp0, hp1, _noise_mat, _noise_ore, thresholds, ore_ids)
		for cv in _caves:
			zone.carve_row(l, cv[0], cv[1])
		if Time.get_ticks_usec() > deadline:
			return
	_finish_zone(zone)


func _finish_zone(zone: Zone) -> void:
	var z := zone.index
	_gen = null
	_protect_finds(zone)
	if saves[z] != "":
		if not _unpack(zone, saves[z]):
			push_warning("Zone %d: save didn't match, starting it fresh" % z)
			saves[z] = ""
	zone.node = Node3D.new()
	zone.node.name = "Zone%d" % z
	add_child(zone.node)
	zone.body = StaticBody3D.new()
	zone.body.collision_layer = 2
	zone.body.collision_mask = 0
	zone.node.add_child(zone.body)
	zones[z] = zone
	# Finds still buried here.
	for fi in Balance.finds_in(z):
		if not found[fi]:
			_watch_find(zone, fi)
	for cy in CROWS:
		for cz in NCX:
			for cx in NCX:
				_dirty[Vector3i(cx, (nzones - 1 - z) * CROWS + cy, cz)] = true
	_dirty_zone_edge(z - 1, false)
	_dirty_zone_edge(z + 1, true)
	_place_landmark(zone)
	zone_ready.emit(z)


# =====================================================================================
# Landmarks: one set piece per layer, in a cave of its own near the middle
# =====================================================================================
const LANDMARKS := {
	1: {"model": "old_timbers", "scale": 1.0, "light": Color(1.0, 0.7, 0.36), "energy": 0.9, "at": Vector3(0.2, 1.5, 0.0)},
	2: {"model": "mine_cart", "scale": 1.0, "light": Color(1.0, 0.74, 0.4), "energy": 0.8, "at": Vector3(0.3, 1.0, -0.5)},
	3: {"model": "ribcage", "scale": 0.6},
	4: {"model": "ribcage", "scale": 1.0},
	5: {"model": "crystal_big", "scale": 1.0, "light": Color(0.42, 0.85, 0.74), "energy": 1.4, "surface": "crystal"},
	6: {"model": "lava_pool", "scale": 1.1, "light": Color(1.0, 0.32, 0.1), "energy": 3.2, "surface": "lava"},
	7: {"model": "basalt", "scale": 1.0, "light": Color(1.0, 0.42, 0.14), "energy": 2.2, "surface": "lava"},
	8: {"model": "lava_pool", "scale": 1.0, "light": Color(1.0, 0.62, 0.22), "energy": 2.6, "surface": "lava"},
	9: {"model": "core_spires", "scale": 0.85, "light": Color(1.0, 0.84, 0.5), "energy": 1.5, "surface": "hot_crystal"},
}


static var _landmark_mats := {}


static func dress_landmark(n: Node, kind: String) -> void:
	## Gives a set piece's light-coloured surfaces (the crystal, the melt) a
	## material of their own: glowing lava, faceted crystal, white-hot spires.
	## Its dark parts (rock bases, crust stones) keep their baked look.
	if not _landmark_mats.has(kind):
		var m := ShaderMaterial.new()
		match kind:
			"lava":
				m.shader = load("res://shaders/lava.gdshader")
				m.set_shader_parameter("paint_tex", load("res://textures/rock_paint.png"))
			"crystal":
				m.shader = load("res://shaders/crystal.gdshader")
			"hot_crystal":
				m.shader = load("res://shaders/crystal.gdshader")
				m.set_shader_parameter("body", Vector3(0.95, 0.55, 0.15))
				m.set_shader_parameter("tip", Vector3(1.0, 0.95, 0.8))
				m.set_shader_parameter("inner", 0.9)
				m.set_shader_parameter("height", 2.2)
		_landmark_mats[kind] = m
	var mat: Material = _landmark_mats[kind]
	var stack: Array = [n]
	while not stack.is_empty():
		var c: Node = stack.pop_back()
		stack.append_array(c.get_children())
		if not c is MeshInstance3D:
			continue
		var mi := c as MeshInstance3D
		if mi.mesh == null:
			continue
		for si in mi.mesh.get_surface_count():
			var sm := mi.mesh.surface_get_material(si)
			var col := Color(0.5, 0.5, 0.5)
			if sm is BaseMaterial3D:
				col = (sm as BaseMaterial3D).albedo_color
			if col.get_luminance() > 0.42:
				mi.set_surface_override_material(si, mat)


func landmark_cave(z: int) -> Array:
	## [centre, radii] of the cave a layer's landmark sits in: about 3 m from
	## the middle of the site, so a shaft down the middle breaks into it.
	var a := float(z) * 2.39996 + 0.7
	var mid := (zone_top(z) + zone_floor(z)) * 0.5 + 1.5
	return [Vector3(cos(a) * 3.3, mid, sin(a) * 3.3), Vector3(2.5, 1.8, 2.5)]


func _place_landmark(zone: Zone) -> void:
	var z := zone.index
	if not LANDMARKS.has(z):
		return
	var d: Dictionary = LANDMARKS[z]
	var cave: Array = landmark_cave(z)
	var c: Vector3 = cave[0]
	var n := Models.instance(str(d.model))
	n.name = "Landmark"
	n.scale = Vector3.ONE * float(d.get("scale", 1.0))
	n.rotation.y = float(z) * 1.3
	zone.node.add_child(n)
	n.position = Vector3(c.x, floor_below(c, 6.0) - 0.05, c.z)
	if d.has("surface"):
		dress_landmark(n, str(d.surface))
	if d.has("light"):
		var l := OmniLight3D.new()
		l.light_color = d.light
		l.light_energy = float(d.energy)
		l.omni_range = 8.0
		l.omni_attenuation = 1.4
		l.position = (d.get("at", Vector3(0, 1.1, 0)) as Vector3) / n.scale
		l.layers = 1 | Player.VIEWMODEL_LAYER
		n.add_child(l)
	zone.landmark = n


func settle_landmarks() -> void:
	## A landmark whose floor was dug out from under it drops to the new floor.
	for zone in zones:
		if zone == null or zone.landmark == null:
			continue
		var n: Node3D = zone.landmark
		if not solid_at(n.position + Vector3(0, -0.25, 0)):
			n.position.y = floor_below(n.position, 12.0) - 0.05


func _protect_finds(zone: Zone) -> void:
	## Caves never hollow out a find: the rock right round one is kept, so it
	## can always be dug out (it shows as a lump if a cave runs past it).
	for fi in Balance.finds_in(zone.index):
		if found[fi]:
			continue
		var p := find_spot(fi)
		var q := (p - Vector3(X0, zone.y0, X0)) / RES
		var r := 1.3
		for l in range(maxi(0, floori(q.y - r)), mini(ZN - 1, ceili(q.y + r)) + 1):
			for k in range(maxi(0, floori(q.z - r)), mini(NX - 1, ceili(q.z + r)) + 1):
				for i in range(maxi(0, floori(q.x - r)), mini(NX - 1, ceili(q.x + r)) + 1):
					var dd := Vector3(i, l, k).distance_to(q)
					if dd <= r:
						var s := i + NX * k + PLANE * l
						zone.f[s] = maxf(zone.f[s], clampf(1.0 - (dd - 0.6) * 0.5, 0.0, 1.0))


func _dirty_zone_edge(z: int, top: bool) -> void:
	## Re-mesh the chunk row of zone z that touches the zone above (top) or below.
	if z < 0 or z >= nzones or zones[z] == null:
		return
	var cy := (nzones - 1 - z) * CROWS + (CROWS - 1 if top else 0)
	for cz in NCX:
		for cx in NCX:
			_dirty[Vector3i(cx, cy, cz)] = true


# =====================================================================================
# Finds
# =====================================================================================
func find_spot(fi: int) -> Vector3:
	## Where a find is buried: the same every game, near the middle of the
	## site (where shafts go), at a depth inside its zone.
	var d: Dictionary = Balance.FINDS[fi]
	var z := int(d.zone)
	if d.get("core", false):
		return Vector3(0.0, bottom_y + 1.0, 0.0)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value + 31 * (fi + 1)
	var a := rng.randf() * TAU
	var r := rng.randf_range(0.6, 3.0)
	var nth := Balance.finds_in(z).find(fi)
	var top := zone_top(z) - (4.0 if z == 0 else 3.0)
	var span := Balance.ZONE_DEPTH - 7.0
	var y := top - span * (0.25 + 0.5 * float(nth)) + rng.randf_range(-3.0, 3.0)
	return Vector3(cos(a) * r, y, sin(a) * r)


func _watch_find(zone: Zone, fi: int) -> void:
	var p := find_spot(fi)
	var q := (p - Vector3(X0, zone.y0, X0)) / RES
	var i := clampi(int(round(q.x)), 1, NX - 2)
	var l := clampi(int(round(q.y)), 1, ZN - 2)
	var k := clampi(int(round(q.z)), 1, NX - 2)
	var s := i + NX * k + PLANE * l
	for off in [0, 1, -1, NX, -NX, PLANE, -PLANE]:
		var t: int = s + off
		if zone.f[t] > 0.5:
			zone.finds[t] = fi


func mark_found(fi: int) -> void:
	found[fi] = true
	var z := int(Balance.FINDS[fi].zone)
	if zones[z] != null:
		(zones[z] as Zone).clear_find(fi)


# =====================================================================================
# Reading the grid
# =====================================================================================
func _value(i: int, g: int, k: int) -> float:
	if g >= rows:
		return 0.0
	if g < 0:
		return 1.0
	if i < 0 or k < 0 or i >= NX or k >= NX:
		return 1.0
	var zone: Zone = zones[nzones - 1 - g / ZN]
	if zone == null:
		return 1.0
	return zone.f[i + NX * k + PLANE * (g % ZN)]


func density_at(p: Vector3) -> float:
	## Trilinear density at a world point.
	var qx := (p.x - X0) / RES
	var qy := (p.y - bottom_y) / RES
	var qz := (p.z - X0) / RES
	var i := floori(qx)
	var g := floori(qy)
	var k := floori(qz)
	var tx := qx - i
	var ty := qy - g
	var tz := qz - k
	var c00 := lerpf(_value(i, g, k), _value(i + 1, g, k), tx)
	var c10 := lerpf(_value(i, g, k + 1), _value(i + 1, g, k + 1), tx)
	var c01 := lerpf(_value(i, g + 1, k), _value(i + 1, g + 1, k), tx)
	var c11 := lerpf(_value(i, g + 1, k + 1), _value(i + 1, g + 1, k + 1), tx)
	return lerpf(lerpf(c00, c10, tz), lerpf(c01, c11, tz), ty)


func solid_at(p: Vector3) -> bool:
	return density_at(p) > 0.5


func normal_at(p: Vector3) -> Vector3:
	var h := RES * 0.5
	var g := Vector3(
		density_at(p + Vector3(h, 0, 0)) - density_at(p - Vector3(h, 0, 0)),
		density_at(p + Vector3(0, h, 0)) - density_at(p - Vector3(0, h, 0)),
		density_at(p + Vector3(0, 0, h)) - density_at(p - Vector3(0, 0, h)))
	if g.length_squared() < 0.000001:
		return Vector3.UP
	return -g.normalized()


func raycast(from: Vector3, dir: Vector3, max_dist: float) -> Dictionary:
	## Marches along a ray through the grid (no physics needed, so it's right
	## even before a chunk has been re-meshed): {hit, pos, normal, dist}.
	var step := 0.09 if max_dist < 5.0 else 0.15
	var t := 0.0
	if density_at(from) > 0.5:
		return {"hit": true, "pos": from, "normal": -dir, "dist": 0.0}
	while t < max_dist:
		var nt := minf(t + step, max_dist)
		if density_at(from + dir * nt) > 0.5:
			var a := t
			var b := nt
			for _n in 5:
				var mid := (a + b) * 0.5
				if density_at(from + dir * mid) > 0.5:
					b = mid
				else:
					a = mid
			var p := from + dir * b
			return {"hit": true, "pos": p, "normal": normal_at(p), "dist": b}
		t = nt
	return {"hit": false}


func point_info(p: Vector3) -> Dictionary:
	## The rock at a spot: {zone, mat, ore, hp, wall, name}.
	var q := Vector3((p.x - X0) / RES, (p.y - bottom_y) / RES, (p.z - X0) / RES)
	var i := int(round(q.x))
	var g := clampi(int(round(q.y)), 0, rows - 1)
	var k := int(round(q.z))
	var z := nzones - 1 - g / ZN
	if i < 0 or k < 0 or i >= NX or k >= NX or p.y > 0.3:
		return {"zone": z, "mat": WALL, "ore": 0, "hp": INF, "wall": true, "name": Balance.WALL_NAME}
	var zone: Zone = zones[z]
	if zone == null:
		return {"zone": z, "mat": WALL, "ore": 0, "hp": INF, "wall": true, "name": Balance.WALL_NAME}
	# The nearest solid point around the spot (the hit sits right on the surface).
	var best := -1
	var best_v := 0.5
	var l0 := g % ZN
	for dl in [0, 1, -1]:
		var l: int = l0 + dl
		if l < 0 or l >= ZN:
			continue
		for dk in [0, 1, -1]:
			for di in [0, 1, -1]:
				var ii: int = clampi(i + di, 0, NX - 1)
				var kk: int = clampi(k + dk, 0, NX - 1)
				var s := ii + NX * kk + PLANE * l
				if zone.f[s] > best_v:
					best_v = zone.f[s]
					best = s
	if best < 0:
		best = clampi(i, 0, NX - 1) + NX * clampi(k, 0, NX - 1) + PLANE * l0
	var mt := int(zone.m[best])
	var ore := int(zone.o[best])
	var nm: String = Balance.MATERIALS[mt].name
	if ore > 0:
		nm = "%s in %s" % [Balance.ORES[ore].name, nm]
	return {"zone": z, "mat": mt, "ore": ore, "hp": zone.hp[best], "wall": false, "name": nm}


func floor_below(p: Vector3, max_drop: float = 30.0) -> float:
	## The first rock surface at or under p (for the lift stop and helpers).
	var y := p.y
	var stop := p.y - max_drop
	while y > stop:
		if density_at(Vector3(p.x, y, p.z)) > 0.5:
			var a := y
			var b := y + 0.25
			for _n in 6:
				var mid := (a + b) * 0.5
				if density_at(Vector3(p.x, mid, p.z)) > 0.5:
					a = mid
				else:
					b = mid
			return b
		y -= 0.25
	return stop


# =====================================================================================
# Digging
# =====================================================================================
func dig(center: Vector3, radius: float, damage: float) -> Dictionary:
	## One strike of a tool (or a mole, or a blast): every point in the ball
	## loses density, most at the centre. Returns what came out:
	## {points, volume, value, ore, ore_points, ore_value}. Money is left to
	## GameState (it knows the upgrades); this just says what the rock was worth.
	var out := {"points": 0, "hp": 0.0, "ore_points": 0, "ore_hp": 0.0, "ores": {}, "finds": [], "touched": false}
	if damage <= 0.0 or radius <= 0.0:
		return _result(out, center, 1.0)
	var inv := 1.0 / RES
	var i0 := maxi(0, ceili((center.x - radius - X0) * inv))
	var i1 := mini(NX - 1, floori((center.x + radius - X0) * inv))
	var k0 := maxi(0, ceili((center.z - radius - X0) * inv))
	var k1 := mini(NX - 1, floori((center.z + radius - X0) * inv))
	var g0 := maxi(0, ceili((center.y - radius - bottom_y) * inv))
	var g1 := mini(rows - 1, floori((center.y + radius - bottom_y) * inv))
	if i0 > i1 or k0 > k1 or g0 > g1:
		return _result(out, center, 1.0)
	var r2 := radius * radius
	var worth := 1.0
	var zg := g1 / ZN
	while zg >= g0 / ZN:
		var z := nzones - 1 - zg
		var zone: Zone = zones[z]
		if zone != null:
			var base := zg * ZN
			var l0 := maxi(g0 - base, 0)
			var l1 := mini(g1 - base, ZN - 1)
			var before: int = out.points
			zone.dig(center, r2, damage, i0, i1, l0, l1, k0, k1, out)
			if out.points > before:
				worth = zone.worth
		zg -= 1
	if out.touched:
		_touch(i0, i1, g0, g1, k0, k1)
	for fi in out.finds:
		if not found[fi]:
			mark_found(fi)
			find_exposed.emit(fi)
	var res := _result(out, center, worth)
	if res.points > 0:
		dug.emit(res)
	return res


func _result(out: Dictionary, center: Vector3, worth: float) -> Dictionary:
	var pv := RES * RES * RES
	var best_ore := 0
	var best_n := 0
	var ore_value := 0.0
	for ore in out.ores:
		var n: int = out.ores[ore]
		if n > best_n:
			best_n = n
			best_ore = ore
	if int(out.ore_points) > 0:
		# Each ore point pays its rock times the ore's multiplier.
		var avg_hp: float = float(out.ore_hp) / float(out.ore_points)
		for ore in out.ores:
			ore_value += float(out.ores[ore]) * avg_hp * float(Balance.ORES[ore].mult)
		ore_value *= pv * worth
	return {
		"points": out.points,
		"volume": float(out.points) * pv,
		"value": float(out.hp) * pv * worth,
		"ore": best_ore,
		"ore_points": out.ore_points,
		"ore_value": ore_value,
		"at": center,
	}


func _touch(i0: int, i1: int, g0: int, g1: int, k0: int, k1: int) -> void:
	var ca := clampi(floori((i0 - 1) / float(CH)), 0, NCX - 1)
	var cb := clampi(floori((i1 + 1) / float(CH)), 0, NCX - 1)
	var za := clampi(floori((k0 - 1) / float(CH)), 0, NCX - 1)
	var zb := clampi(floori((k1 + 1) / float(CH)), 0, NCX - 1)
	var ya := clampi(floori((g0 - 1) / float(CH)), 0, rows / CH - 1)
	var yb := clampi(floori((g1 + 1) / float(CH)), 0, rows / CH - 1)
	for cy in range(ya, yb + 1):
		if zones[_zone_of_chunk_row(cy)] == null:
			continue
		for cz in range(za, zb + 1):
			for cx in range(ca, cb + 1):
				_dirty[Vector3i(cx, cy, cz)] = true


func dug_volume() -> float:
	var n := 0
	for z in nzones:
		if zones[z] != null:
			n += (zones[z] as Zone).dug_points
	return n * RES * RES * RES


# =====================================================================================
# Decoration: pebbles, ore nuggets and each layer's own bits, scattered over
# every dug rock face (one MultiMesh per kind per chunk, rebuilt with it)
# =====================================================================================
const PEBBLE_EVERY := 7            # about one pebble cluster per this many surface vertices
const NUGGET_CHANCE := 55          # percent of ore vertices that show a nugget
# zone -> [model, one per this many vertices, where ("ceiling", "wall", "any"), colours]
const ZONE_DECOR := {
	0: ["root", 9, "ceiling", [Color(0.36, 0.25, 0.16), Color(0.3, 0.21, 0.14)]],
	2: ["crystal_small", 45, "any", [Color(0.9, 0.86, 0.78)]],
	3: ["shell", 20, "wall", [Color(0.86, 0.8, 0.69), Color(0.8, 0.72, 0.58)]],
	4: ["bone", 14, "any", [Color(0.88, 0.82, 0.7), Color(0.8, 0.73, 0.6)]],
	5: ["crystal_small", 8, "any", [Color(0.36, 0.72, 0.64), Color(0.9, 0.88, 0.8), Color(0.5, 0.42, 0.75)]],
	6: ["magma_vent", 16, "any", [Color(1, 1, 1)]],
	7: ["magma_vent", 22, "any", [Color(1, 1, 1)]],
	8: ["magma_vent", 28, "any", [Color(1, 0.92, 0.75)]],
	9: ["crystal_small", 10, "any", [Color(0.95, 0.72, 0.3), Color(0.95, 0.9, 0.78)]],
}
var decor_enabled := true
var decor_mats := {}               # "matte" / "glint" / "glow" -> ShaderMaterial (World updates their lamp range)
var _dv := PackedVector3Array()    # candidates gathered while meshing a chunk: position
var _dn := PackedVector3Array()    # ...normal
var _dc := PackedColorArray()      # ...the rock's colour there
var _do := PackedByteArray()       # ...its ore (0 = none)
static var _decor_meshes := {}


static func decor_mesh(model: String) -> Mesh:
	if not _decor_meshes.has(model):
		var n := Models.instance(model)
		var mesh: Mesh = null
		var stack: Array = [n]
		while not stack.is_empty() and mesh == null:
			var c: Node = stack.pop_back()
			if c is MeshInstance3D:
				mesh = (c as MeshInstance3D).mesh
			stack.append_array(c.get_children())
		n.free()
		_decor_meshes[model] = mesh
	return _decor_meshes[model]


func _decor_mat(kind: String) -> ShaderMaterial:
	if not decor_mats.has(kind):
		var m := ShaderMaterial.new()
		m.shader = load("res://shaders/decor.gdshader")
		m.set_shader_parameter("glint", 1.0 if kind == "glint" else 0.0)
		m.set_shader_parameter("glow", 0.6 if kind == "glow" else 0.0)
		decor_mats[kind] = m
	return decor_mats[kind]


func _build_decor(zone: Zone, z: int) -> Array:
	var out: Array = []
	var n := _dv.size()
	if n == 0 or not decor_enabled:
		return out
	var peb_x: Array = []
	var peb_c: Array = []
	var nug_x: Array = []
	var nug_c: Array = []
	var zd: Array = ZONE_DECOR.get(z, [])
	var zon_x: Array = []
	var zon_c: Array = []
	for i in n:
		var p := _dv[i]
		var nr := _dn[i]
		var h := _hash(int(round(p.x * 8.0)) * 73856093 ^ int(round(p.y * 8.0)) * 19349663 ^ int(round(p.z * 8.0)) * 83492791 ^ 0x5bd1e995)
		var ore := int(_do[i])
		var ang := float(h & 1023) / 1023.0 * TAU
		if ore > 0 and (h >> 10) % 100 < NUGGET_CHANCE:
			var s := 0.9 + 0.7 * float((h >> 17) & 255) / 255.0
			nug_x.append(_decor_xf(p, nr, ang, s, 0.02))
			nug_c.append((Balance.ORES[ore].color as Color).lerp(Color.WHITE, 0.08))
			continue
		if not zd.is_empty() and (h >> 12) % int(zd[1]) == 0:
			var ok := true
			match str(zd[2]):
				"ceiling":
					ok = nr.y < -0.35
				"wall":
					ok = absf(nr.y) < 0.65
			if ok:
				var s := 0.8 + 0.6 * float((h >> 18) & 255) / 255.0
				zon_x.append(_decor_xf(p, nr, ang, s, 0.015 if str(zd[0]) != "root" else 0.0))
				var cl: Array = zd[3]
				zon_c.append(cl[(h >> 5) % cl.size()])
				continue
		if (h >> 9) % PEBBLE_EVERY == 0:
			var s := 0.9 + 1.1 * float((h >> 19) & 255) / 255.0
			peb_x.append(_decor_xf(p, nr, ang, s, 0.035 * s))
			# A shade off the rock it sits in, mostly darker (they're damp and
			# half in shadow), now and then a pale one.
			var c := _dc[i]
			var k := 0.62 + 0.3 * float((h >> 3) & 63) / 63.0
			if (h >> 25) % 9 == 0:
				k = 1.05
			peb_c.append(Color(c.r * k, c.g * k, c.b * k).lerp(Color(0.45, 0.42, 0.38), 0.18))
	if not peb_x.is_empty():
		out.append(_multimesh(zone, "pebble", peb_x, peb_c, _decor_mat("matte")))
	if not nug_x.is_empty():
		out.append(_multimesh(zone, "nugget", nug_x, nug_c, _decor_mat("glint")))
	if not zon_x.is_empty():
		var model: String = zd[0]
		var m: Material = null
		if model == "crystal_small":
			m = _decor_mat("glint" if z != 9 else "glow")
		elif model != "magma_vent":
			m = _decor_mat("matte")
		out.append(_multimesh(zone, model, zon_x, zon_c, m))
	return out


static func _decor_xf(p: Vector3, nr: Vector3, ang: float, s: float, sink: float) -> Transform3D:
	## Stands a piece on the rock: its +Y out of the wall, turned about it,
	## pushed a little into the rock so it looks half buried.
	var t := nr.cross(Vector3.UP)
	if t.length_squared() < 0.01:
		t = nr.cross(Vector3.RIGHT)
	t = t.normalized().rotated(nr, ang)
	var b := t.cross(nr)
	return Transform3D(Basis(t * s, nr * s, b * s), p - nr * sink)


func _multimesh(zone: Zone, model: String, xfs: Array, cols: Array, m: Material) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = decor_mesh(model)
	mm.instance_count = xfs.size()
	for i in xfs.size():
		mm.set_instance_transform(i, xfs[i])
		mm.set_instance_color(i, cols[i])
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if m != null:
		mi.material_override = m
	zone.node.add_child(mi)
	return mi


# =====================================================================================
# Meshing
# =====================================================================================
func _zone_of_chunk_row(cy: int) -> int:
	return nzones - 1 - cy / CROWS


func _chunk_center(key: Vector3i) -> Vector3:
	return Vector3(X0 + (key.x * CH + CH * 0.5) * RES, bottom_y + (key.y * CH + CH * 0.5) * RES, X0 + (key.z * CH + CH * 0.5) * RES)


func _chunk_entry(key: Vector3i) -> Dictionary:
	var zone: Zone = zones[_zone_of_chunk_row(key.y)]
	if zone == null:
		return {}
	return zone.chunks.get(key.x + NCX * (key.z + NCX * (key.y % CROWS)), {})


func _remesh(key: Vector3i) -> void:
	var z := _zone_of_chunk_row(key.y)
	var zone: Zone = zones[z]
	if zone == null:
		return
	var local := key.x + NCX * (key.z + NCX * (key.y % CROWS))
	var mesh := _build_chunk(key, z)
	var ch: Dictionary = zone.chunks.get(local, {})
	if not ch.is_empty():
		for d in ch.get("decor", []):
			(d as Node).queue_free()
		ch.decor = []
	if mesh == null:
		if not ch.is_empty():
			(ch.mesh as MeshInstance3D).queue_free()
			(ch.shape as CollisionShape3D).queue_free()
			zone.chunks.erase(local)
		return
	if ch.is_empty():
		var mi := MeshInstance3D.new()
		mi.material_override = material
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		zone.node.add_child(mi)
		var cs := CollisionShape3D.new()
		zone.body.add_child(cs)
		ch = {"mesh": mi, "shape": cs, "t": 0.0}
		zone.chunks[local] = ch
	ch.t = _clock
	(ch.mesh as MeshInstance3D).mesh = mesh
	var shape := mesh.create_trimesh_shape()
	shape.backface_collision = true
	(ch.shape as CollisionShape3D).shape = shape
	ch.decor = _build_decor(zone, z)


func _fill_block(gx0: int, gy0: int, gz0: int, z: int) -> int:
	## Copies the densities around a chunk into _bf (index x + B*y + B*B*z),
	## and notes for each line of B points along x whether it's all air (0),
	## all rock (1) or both (2). Returns 1 if there's any surface in the
	## block at all, else 0.
	var any_in := false
	var any_out := false
	for by in B:
		var g := gy0 - 1 + by
		var zz := nzones - 1 - floori(g / float(ZN))
		var rv := -1.0                 # >= 0: the whole row is this (above/below the planet, unloaded zones)
		var zone: Zone = null
		if g >= rows:
			rv = 0.0
		elif g < 0:
			rv = 1.0
		else:
			zone = zones[zz]
			if zone == null:
				rv = 0.0 if zz < z else 1.0   # unloaded above: open; below: rock
		_row_zone[by] = zone
		_row_l[by] = g - (nzones - 1 - zz) * ZN
		_row_v[by] = rv
	var bi := 0
	for bz in B:
		var k := gz0 - 1 + bz
		var k_out := k < 0 or k >= NX
		for by in B:
			var li := by + B * bz
			var rv := _row_v[by]
			if rv >= 0.0 or k_out:
				var v := rv if rv >= 0.0 else 1.0
				for bx in B:
					_bf[bi] = v
					bi += 1
				_line[li] = 1 if v > 0.5 else 0
				if v > 0.5:
					any_in = true
				else:
					any_out = true
				continue
			var zone: Zone = _row_zone[by]
			var zf: PackedFloat32Array = zone.f
			var base := NX * k + PLANE * _row_l[by] + gx0 - 1
			var l_in := false
			var l_out := false
			for bx in B:
				var i := gx0 - 1 + bx
				var v := 1.0
				if i >= 0 and i < NX:
					v = zf[base + bx]
				_bf[bi] = v
				if v > 0.5:
					l_in = true
				else:
					l_out = true
				bi += 1
			_line[li] = 2 if (l_in and l_out) else (1 if l_in else 0)
			any_in = any_in or l_in
			any_out = any_out or l_out
	return 1 if (any_in and any_out) else 0


func _build_chunk(key: Vector3i, z: int) -> ArrayMesh:
	var gx0 := key.x * CH
	var gy0 := key.y * CH
	var gz0 := key.z * CH
	if _fill_block(gx0, gy0, gz0, z) == 0:
		return null
	var bf := _bf
	var line := _line
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	var uvs := PackedVector2Array()
	_cell.fill(-1)
	_dv.clear()
	_dn.clear()
	_dc.clear()
	_do.clear()
	var sy := B
	var sz := B * B
	# The finds still buried near here sparkle through the rock around them.
	var hints: Array = []
	for fi in Balance.finds_in(z):
		if not found[fi]:
			hints.append(find_spot(fi))
	# Vertices: one per cell the surface passes through. Block index = x + B*y + B*B*z.
	for cz in BC:
		for cy in BC:
			# Skip the whole run of cells along x if its four lines of corners
			# are all rock or all air.
			var la := line[cy + B * cz]
			var lb := line[cy + 1 + B * cz]
			var lc := line[cy + B * (cz + 1)]
			var ld := line[cy + 1 + B * (cz + 1)]
			if la != 2 and la == lb and la == lc and la == ld:
				continue
			var base := cy * sy + cz * sz
			var v000 := bf[base]
			var v010 := bf[base + sy]
			var v001 := bf[base + sz]
			var v011 := bf[base + sz + sy]
			for cx in BC:
				var s0 := base + cx
				var v100 := bf[s0 + 1]
				var v110 := bf[s0 + sy + 1]
				var v101 := bf[s0 + sz + 1]
				var v111 := bf[s0 + sz + sy + 1]
				var n_in := int(v000 > 0.5) + int(v100 > 0.5) + int(v010 > 0.5) + int(v110 > 0.5) \
					+ int(v001 > 0.5) + int(v101 > 0.5) + int(v011 > 0.5) + int(v111 > 0.5)
				if n_in != 0 and n_in != 8:
					var px := 0.0
					var py := 0.0
					var pz := 0.0
					var n := 0
					if (v000 > 0.5) != (v100 > 0.5):
						px += (0.5 - v000) / (v100 - v000); n += 1
					if (v010 > 0.5) != (v110 > 0.5):
						px += (0.5 - v010) / (v110 - v010); py += 1.0; n += 1
					if (v001 > 0.5) != (v101 > 0.5):
						px += (0.5 - v001) / (v101 - v001); pz += 1.0; n += 1
					if (v011 > 0.5) != (v111 > 0.5):
						px += (0.5 - v011) / (v111 - v011); py += 1.0; pz += 1.0; n += 1
					if (v000 > 0.5) != (v010 > 0.5):
						py += (0.5 - v000) / (v010 - v000); n += 1
					if (v100 > 0.5) != (v110 > 0.5):
						py += (0.5 - v100) / (v110 - v100); px += 1.0; n += 1
					if (v001 > 0.5) != (v011 > 0.5):
						py += (0.5 - v001) / (v011 - v001); pz += 1.0; n += 1
					if (v101 > 0.5) != (v111 > 0.5):
						py += (0.5 - v101) / (v111 - v101); px += 1.0; pz += 1.0; n += 1
					if (v000 > 0.5) != (v001 > 0.5):
						pz += (0.5 - v000) / (v001 - v000); n += 1
					if (v100 > 0.5) != (v101 > 0.5):
						pz += (0.5 - v100) / (v101 - v100); px += 1.0; n += 1
					if (v010 > 0.5) != (v011 > 0.5):
						pz += (0.5 - v010) / (v011 - v010); py += 1.0; n += 1
					if (v110 > 0.5) != (v111 > 0.5):
						pz += (0.5 - v110) / (v111 - v110); px += 1.0; py += 1.0; n += 1
					var inv_n := 1.0 / float(n)
					var wx := X0 + (float(gx0 - 1 + cx) + px * inv_n) * RES
					var wy := bottom_y + (float(gy0 - 1 + cy) + py * inv_n) * RES
					var wz := X0 + (float(gz0 - 1 + cz) + pz * inv_n) * RES
					var grad := Vector3((v100 + v110 + v101 + v111) - (v000 + v010 + v001 + v011),
						(v010 + v110 + v011 + v111) - (v000 + v100 + v001 + v101),
						(v001 + v101 + v011 + v111) - (v000 + v100 + v010 + v110))
					var nrm := -grad.normalized() if grad.length_squared() > 0.000001 else Vector3.UP
					var pos := Vector3(wx, wy, wz)
					if wy < -0.6:
						pos += _jitter(pos) * 0.11 * clampf(-wy - 0.6, 0.0, 1.0)
					_cell[cx + BC * (cy + BC * cz)] = verts.size()
					verts.append(pos)
					norms.append(nrm)
					cols.append(_vertex_color(cx, cy, cz, gx0, gz0, pos, nrm, hints, z))
					uvs.append(Vector2(_self_glow, 0.0))
				v000 = v100
				v010 = v110
				v001 = v101
				v011 = v111
	if verts.is_empty():
		return null
	# Quads: one per crossed edge whose start point this chunk owns (block 1..CH).
	var idx := PackedInt32Array()
	for bz in range(1, B - 1):
		for by in range(1, B - 1):
			var lh := line[by + B * bz]
			var lu := line[by + 1 + B * bz]
			var lf := line[by + B * (bz + 1)]
			var do_x := lh == 2
			var do_y := lh == 2 or lu == 2 or lh != lu
			var do_z := lh == 2 or lf == 2 or lh != lf
			if not (do_x or do_y or do_z):
				continue
			for bx in range(1, B - 1):
				var s := bx + sy * by + sz * bz
				var inside := bf[s] > 0.5
				# x edge: cells (bx, by-1..by, bz-1..bz)
				if do_x and inside != (bf[s + 1] > 0.5):
					var c0 := _cell[bx + BC * ((by - 1) + BC * (bz - 1))]
					var c1 := _cell[bx + BC * (by + BC * (bz - 1))]
					var c2 := _cell[bx + BC * (by + BC * bz)]
					var c3 := _cell[bx + BC * ((by - 1) + BC * bz)]
					if c0 >= 0 and c1 >= 0 and c2 >= 0 and c3 >= 0:
						if inside:
							idx.append_array([c0, c3, c2, c0, c2, c1])
						else:
							idx.append_array([c0, c1, c2, c0, c2, c3])
				# y edge: cells (bx-1..bx, by, bz-1..bz)
				if do_y and inside != (bf[s + sy] > 0.5):
					var c0 := _cell[(bx - 1) + BC * (by + BC * (bz - 1))]
					var c1 := _cell[bx + BC * (by + BC * (bz - 1))]
					var c2 := _cell[bx + BC * (by + BC * bz)]
					var c3 := _cell[(bx - 1) + BC * (by + BC * bz)]
					if c0 >= 0 and c1 >= 0 and c2 >= 0 and c3 >= 0:
						if inside:
							idx.append_array([c0, c1, c2, c0, c2, c3])
						else:
							idx.append_array([c0, c3, c2, c0, c2, c1])
				# z edge: cells (bx-1..bx, by-1..by, bz)
				if do_z and inside != (bf[s + sz] > 0.5):
					var c0 := _cell[(bx - 1) + BC * ((by - 1) + BC * bz)]
					var c1 := _cell[bx + BC * ((by - 1) + BC * bz)]
					var c2 := _cell[bx + BC * (by + BC * bz)]
					var c3 := _cell[(bx - 1) + BC * (by + BC * bz)]
					if c0 >= 0 and c1 >= 0 and c2 >= 0 and c3 >= 0:
						if inside:
							idx.append_array([c0, c3, c2, c0, c2, c1])
						else:
							idx.append_array([c0, c1, c2, c0, c2, c3])
	if idx.is_empty():
		return null
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


static func _hash(x: int) -> int:
	x = ((x >> 16) ^ x) * 0x45d9f3b
	x = ((x >> 16) ^ x) * 0x45d9f3b
	return ((x >> 16) ^ x) & 0x7fffffff


func _jitter(p: Vector3) -> Vector3:
	## A small, fixed nudge per vertex position, so the rock looks chipped
	## rather than smooth. Vertices on chunk seams get the same nudge twice.
	var h := _hash(int(round(p.x * 16.0)) * 73856093 ^ int(round(p.y * 16.0)) * 19349663 ^ int(round(p.z * 16.0)) * 83492791)
	return Vector3(float(h & 1023) / 511.5 - 1.0, float((h >> 10) & 1023) / 511.5 - 1.0, float((h >> 20) & 1023) / 511.5 - 1.0)


func _vertex_color(cx: int, cy: int, cz: int, gx0: int, gz0: int, p: Vector3, n: Vector3, hints: Array, z: int) -> Color:
	## RGB: the rock (or ore) colour of the solid corners of this cell.
	## A: how much it glints (ore, finds sparkling nearby). Also sets
	## _self_glow (magma, the core).
	var r := 0.0
	var g := 0.0
	var b := 0.0
	var w := 0.0
	var glow := 0.0
	var wall := false
	_self_glow = 0.0
	_is_grass = false
	_is_wall = false
	_vert_ore = 0
	var ore_w := 0.0
	for c in 8:
		var bx := cx + (c & 1)
		var by := cy + ((c >> 1) & 1)
		var bz := cz + ((c >> 2) & 1)
		var v := _bf[bx + B * by + B * B * bz]
		if v <= 0.5:
			continue
		var zone: Zone = _row_zone[by]
		var i := gx0 - 1 + bx
		var k := gz0 - 1 + bz
		var col: Color
		if zone == null or i < 0 or k < 0 or i >= NX or k >= NX:
			wall = true
			var main: int = Balance.ZONES[z].mats[0]
			col = (_mat_colors[main] as Color).darkened(0.45).lerp(Color(0.25, 0.25, 0.28), 0.35)
		else:
			var s := i + NX * k + PLANE * int(_row_l[by])
			var mt := int(zone.m[s])
			col = _mat_colors[mt]
			_self_glow = maxf(_self_glow, float(_mat_glow[mt]))
			var ore := int(zone.o[s])
			if ore > 0:
				# Veins tint the rock; the nuggets standing out of it carry the ore.
				col = col.lerp(_ore_colors[ore], 0.3)
				glow = maxf(glow, float(_ore_glow[ore]) * 0.6)
				if v > ore_w:
					ore_w = v
					_vert_ore = ore
		r += col.r * v
		g += col.g * v
		b += col.b * v
		w += v
	var c := Color(r / w, g / w, b / w) if w > 0.0 else Color(0.3, 0.25, 0.2)
	# Speckle: every spot of rock is a little lighter or darker.
	var h := _hash(int(round(p.x * 4.0)) * 92837111 ^ int(round(p.y * 4.0)) * 689287499 ^ int(round(p.z * 4.0)) * 283923481)
	var sp := 0.92 + 0.16 * float(h & 255) / 255.0
	c = Color(c.r * sp, c.g * sp, c.b * sp)
	if p.y > -0.45 and n.y > 0.45:
		c = GRASS * (0.9 + 0.2 * float((h >> 8) & 255) / 255.0)   # the field's grass on top
		wall = false
		_is_grass = true
	elif p.y > -1.2:
		c = c.darkened(0.15)   # turf and roots
	else:
		# Nooks and crannies are darker: how much rock is just in front of this spot.
		var occ := _block_density(float(cx) + 0.5 + n.x * 1.1, float(cy) + 0.5 + n.y * 1.1, float(cz) + 0.5 + n.z * 1.1)
		var ao := 1.0 - 0.6 * clampf(occ * 1.4, 0.0, 1.0)
		c = Color(c.r * ao, c.g * ao, c.b * ao)
	for hp in hints:
		var d := p.distance_to(hp)
		if d < 1.6:
			var t := 1.0 - d / 1.6
			c = c.lerp(Color(1.0, 0.82, 0.35), t * 0.55)
			glow = maxf(glow, 0.9 * t)
	if wall:
		glow = 0.0
		_self_glow = 0.0
		_is_wall = true
	return Color(c.r, c.g, c.b, clampf(glow / 1.5, 0.0, 1.0))


func _block_density(x: float, y: float, z: float) -> float:
	## Trilinear density inside the current block (block point units, clamped).
	x = clampf(x, 0.0, B - 1.001)
	y = clampf(y, 0.0, B - 1.001)
	z = clampf(z, 0.0, B - 1.001)
	var i := int(x)
	var j := int(y)
	var k := int(z)
	var tx := x - i
	var ty := y - j
	var tz := z - k
	var s := i + B * j + B * B * k
	var c00 := lerpf(_bf[s], _bf[s + 1], tx)
	var c10 := lerpf(_bf[s + B * B], _bf[s + B * B + 1], tx)
	var c01 := lerpf(_bf[s + B], _bf[s + B + 1], tx)
	var c11 := lerpf(_bf[s + B + B * B], _bf[s + B + B * B + 1], tx)
	return lerpf(lerpf(c00, c10, tz), lerpf(c01, c11, tz), ty)


static var _detail_cache := {}
static var _strata: ImageTexture


static func make_rock_material() -> ShaderMaterial:
	## The rock shader with its painted texture and strata bands (also used by
	## the field's grass and the lift shaft's walls).
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/rock.gdshader")
	m.set_shader_parameter("paint_tex", load("res://textures/rock_paint.png"))
	m.set_shader_parameter("strata_tex", strata_texture())
	return m


static func strata_texture() -> ImageTexture:
	## textures/strata.png, read as raw data so no import setting can squash
	## a 512 x 1 strip.
	if _strata == null:
		var img := Image.new()
		var f := FileAccess.open("res://textures/strata.png", FileAccess.READ)
		var ok := false
		if f != null:
			ok = img.load_png_from_buffer(f.get_buffer(f.get_length())) == OK
		if not ok:
			img = Image.create(8, 1, false, Image.FORMAT_RGB8)
			img.fill(Color(0.8, 0.8, 0.8))
		_strata = ImageTexture.create_from_image(img)
	return _strata


static func clear_caches() -> void:
	## Tests call this before quitting so no texture outlives the scene tree.
	_detail_cache.clear()
	_strata = null
	_decor_meshes.clear()
	_landmark_mats.clear()


static func detail_texture(seed_base: int) -> ImageTexture:
	## Grey noise for the rock shader: R = fine grain, G = big blotches,
	## B = flat strata (squashed along one axis). Tiles seamlessly.
	if _detail_cache.has(seed_base):
		return _detail_cache[seed_base]
	var n := 128
	var a := FastNoiseLite.new()
	a.seed = seed_base + 31
	a.frequency = 0.09
	a.fractal_octaves = 3
	var bb := FastNoiseLite.new()
	bb.seed = seed_base + 32
	bb.frequency = 0.025
	var c := FastNoiseLite.new()
	c.seed = seed_base + 33
	c.frequency = 0.04
	var da := a.get_seamless_image(n, n).get_data()
	var db := bb.get_seamless_image(n, n).get_data()
	var dc := c.get_seamless_image(n, n).get_data()
	var rgb := PackedByteArray()
	rgb.resize(n * n * 3)
	var o := 0
	for y in n:
		var row := y * n
		var srow := ((y * 6) % n) * n
		for x in n:
			rgb[o] = da[row + x]
			rgb[o + 1] = db[row + x]
			rgb[o + 2] = dc[srow + x]
			o += 3
	var img := Image.create_from_data(n, n, false, Image.FORMAT_RGB8, rgb)
	img.generate_mipmaps()
	var tex := ImageTexture.create_from_image(img)
	_detail_cache[seed_base] = tex
	return tex
