class_name ForestView
extends Node3D
## Draws the ForestGrid. Everything that repeats is a MultiMesh, split into
## chunks so the camera can skip what it can't see:
##  - plants: one MultiMesh per kind per size variant per chunk (models from
##    Blender, see Models). Each instance's custom data says when it caught fire
##    and when it crumbles away, so the shader animates the burn on its own and
##    the CPU only touches a plant when its state changes;
##  - flames and smoke: one MultiMesh each, rebuilt every fire tick from the
##    burning cells (hand-drawn flames, shaders/flame.gdshader);
##  - meadow flowers: one MultiMesh per species per (bigger) chunk, appended as
##    cells bloom, in drifts of one species that thin out toward the trails;
##  - the ground: one mesh, coloured per cell from a small texture;
##  - the village: single models from Blender, placed by hand.

const VCHUNK := 20                 # cells per side of a plant chunk (fewer, bigger chunks: fewer draw calls)
const FCHUNK := 32                 # cells per side of a flower chunk
const MAX_FLAMES := 1500
const MAX_SMOKE := 320
const PER_CELL := {Balance.GRASS: 2, Balance.BUSH: 1, Balance.PINE: 1, Balance.OAK: 1, Balance.GIANT: 1, Balance.ELDER: 1}
const NEVER := 1.0e6
# The GPU keeps MultiMesh custom data as half floats in the Compatibility
# renderer, so the times in it must stay small: every few minutes the clock
# steps back and every stored time with it (_rebase).
const REBASE_AT := 300.0
const REBASE_BY := 240.0

# Flames per kind: [width, height, height above the ground (share of the plant's
# height), how far out from the trunk] for each billboard. The first entry of
# the list for trees is the tall leading flame at the top of the cluster.
const FLAMES := {
	Balance.GRASS: [[1.0, 1.25, 0.0, 0.3]],
	Balance.BUSH: [[1.4, 1.9, 0.0, 0.25], [1.0, 1.3, 0.1, 0.45]],
	Balance.PINE: [[1.5, 4.2, 0.55, 0.15], [2.4, 3.0, 0.0, 0.5], [2.0, 2.6, 0.3, 0.6], [1.6, 2.0, 0.45, 0.7]],
	Balance.OAK: [[2.0, 4.8, 0.6, 0.2], [3.0, 3.4, 0.0, 0.6], [2.6, 3.0, 0.4, 1.1], [2.4, 2.6, 0.5, 1.2], [2.0, 2.2, 0.3, 1.0]],
	Balance.GIANT: [[2.8, 7.0, 0.55, 0.3], [4.2, 5.0, 0.0, 0.8], [3.6, 4.4, 0.35, 1.6], [3.2, 4.0, 0.5, 1.8], [3.0, 3.4, 0.25, 1.4], [2.6, 3.0, 0.6, 1.2]],
	Balance.ELDER: [[6.0, 15.0, 0.55, 0.5], [9.0, 11.0, 0.0, 2.0], [7.5, 9.5, 0.25, 3.5], [7.0, 8.5, 0.45, 5.0], [6.5, 8.0, 0.6, 6.0],
		[6.0, 7.0, 0.35, 6.5], [5.5, 6.5, 0.7, 4.0], [4.0, 10.0, 0.75, 7.0]],
}
const LIGHT := [0.35, 0.5, 0.75, 0.9, 1.0, 1.0]   # how much light a burning cell of each kind throws

# Palette for the ground (sRGB, converted when written): see NOTES.md, art bible.
const G_MOSS := Color("#2A2236")       # cursed ground under the trees
const G_GRASS := Color("#29323E")
const G_TRAIL := Color("#4A3E3A")
const G_VILLAGE := Color("#76604A")
const G_ASH := Color("#4B4650")
const G_CINDER := Color("#3B3640")
const G_STONE := Color("#5A5462")
const G_WATER := Color("#1E2C34")

var grid: ForestGrid
var now := 0.0                     # the clock the plant shader animates by
var plant_mat: ShaderMaterial
var flower_mat: ShaderMaterial
var flame_mat: ShaderMaterial
var smoke_mat: ShaderMaterial
var ground_mat: ShaderMaterial
var prop_mat: ShaderMaterial
var fire_light: OmniLight3D
var draw_lists := 0                # MultiMeshes made (for the performance notes)
var lit_materials: Array = []      # every material that takes the fire's light and the lantern's
var _fire_img: Image               # one pixel per cell: how much light the fire there throws (mipmapped: the blur)
var _fire_tex: ImageTexture

var _mm := {}                      # "kind:variant:chunk" -> MultiMesh
var _first := PackedInt32Array()   # cell -> its first instance in its chunk's MultiMesh (-1: none)
var _cell_mm: Array = []           # cell -> MultiMesh (or null)
var _size := PackedFloat32Array()  # cell -> how big its plant is (variant x landmark)
var _img: Image
var _tex: ImageTexture
var _meadow_img: Image             # 1 where the meadow has grown (the ground shader paints it, ragged-edged)
var _meadow_tex: ImageTexture
var _tex_dirty := false
var _tex_t := 0.0
var _glow := {}                    # ash cell -> time it stopped burning (its embers fade)
var _flames: MultiMesh
var _smoke: MultiMesh
var _flowers := {}                 # "species:chunk" -> MultiMesh
var _flower_count := {}
var _flower_keys: Array = []
var _bloomed := PackedByteArray()
var _rng := RandomNumberGenerator.new()
var _buf := PackedFloat32Array()
var _smoke_buf := PackedFloat32Array()
var _drift := FastNoiseLite.new()  # which flower grows where (drifts of one species)
var _dense := FastNoiseLite.new()  # how thick the flowers grow


func build(g: ForestGrid) -> void:
	grid = g
	_rng.seed = Balance.WORLD_SEED + 99
	_drift.seed = Balance.WORLD_SEED + 41
	_drift.frequency = 0.032
	_dense.seed = Balance.WORLD_SEED + 42
	_dense.frequency = 0.11
	_make_materials()
	_build_ground()
	_build_water()
	_build_plants()
	_build_stones()
	_build_edge_forest()
	_build_flowers()
	_build_fire()
	_build_cell_texture()
	_build_village()


# =====================================================================================
# Materials
# =====================================================================================
func _make_materials() -> void:
	plant_mat = ShaderMaterial.new()
	plant_mat.shader = load("res://shaders/plant.gdshader")
	flower_mat = ShaderMaterial.new()
	flower_mat.shader = plant_mat.shader
	flower_mat.set_shader_parameter("flower_mode", 1.0)
	flower_mat.set_shader_parameter("sway", 0.14)
	flower_mat.set_shader_parameter("ink_edge", 0.35)
	flower_mat.set_shader_parameter("see_through", 0.0)
	flame_mat = ShaderMaterial.new()
	flame_mat.shader = load("res://shaders/flame.gdshader")
	flame_mat.set_shader_parameter("flames", load("res://fx/flames.png"))
	smoke_mat = ShaderMaterial.new()
	smoke_mat.shader = load("res://shaders/smoke.gdshader")
	smoke_mat.set_shader_parameter("puffs", load("res://fx/puffs.png"))
	ground_mat = ShaderMaterial.new()
	ground_mat.shader = load("res://shaders/ground.gdshader")
	ground_mat.set_shader_parameter("forest_origin", grid.origin)
	ground_mat.set_shader_parameter("forest_size", grid.n * Balance.CELL)
	ground_mat.set_shader_parameter("cell_size", Balance.CELL)
	ground_mat.set_shader_parameter("sage_dark", Color("#485C33"))
	ground_mat.set_shader_parameter("sage", Color("#6E8A48"))
	ground_mat.set_shader_parameter("moss", Color("#3C4834"))
	ground_mat.set_shader_parameter("hill_color", Color("#2A2236"))
	ground_mat.set_shader_parameter("hill_top", Color("#3A3048"))
	ground_mat.set_shader_parameter("speck", Color("#2E1E14"))
	ground_mat.set_shader_parameter("ember", Color("#E8642C"))
	for m in [plant_mat, flower_mat]:
		m.set_shader_parameter("ink", Color("#2E1E14"))
		m.set_shader_parameter("char_color", Color("#1A1416"))
		m.set_shader_parameter("burn_color", Color("#E8642C"))
		m.set_shader_parameter("core_color", Color("#FFC15E"))
		m.set_shader_parameter("rim_color", Color("#A9C0F2"))
	prop_mat = ShaderMaterial.new()
	prop_mat.shader = load("res://shaders/prop.gdshader")
	prop_mat.set_shader_parameter("see_through", 1.0)
	prop_mat.set_shader_parameter("lantern_gain", 0.5)
	_fire_img = Image.create(grid.n, grid.n, true, Image.FORMAT_L8)
	_fire_img.fill(Color.BLACK)
	_fire_img.generate_mipmaps()
	_fire_tex = ImageTexture.create_from_image(_fire_img)
	for m in [plant_mat, flower_mat, ground_mat, prop_mat]:
		add_lit(m)


func add_lit(m: ShaderMaterial) -> void:
	## This material is lit by the fire and the lantern (the keeper, critters, helpers too).
	m.set_shader_parameter("fire_light", _fire_tex)
	m.set_shader_parameter("forest_origin", grid.origin)
	m.set_shader_parameter("forest_size", grid.n * Balance.CELL)
	lit_materials.append(m)


func set_lantern(at: Vector3, flicker: float) -> void:
	for m in lit_materials:
		(m as ShaderMaterial).set_shader_parameter("lantern_pos", at)
	ground_mat.set_shader_parameter("lantern_flicker", flicker)


func set_wind(w: Vector2) -> void:
	for m in [plant_mat, flower_mat, flame_mat, smoke_mat]:
		(m as ShaderMaterial).set_shader_parameter("wind", w)


# =====================================================================================
# Ground and water
# =====================================================================================
func _build_ground() -> void:
	var hn := grid.hn
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	verts.resize(hn * hn)
	normals.resize(hn * hn)
	var c0 := grid.origin - Vector2(ForestGrid.MARGIN, ForestGrid.MARGIN) * Balance.CELL
	for vy in hn:
		for vx in hn:
			verts[vx + vy * hn] = Vector3(c0.x + vx * Balance.CELL, grid.heights[vx + vy * hn], c0.y + vy * Balance.CELL)
	for vy in hn:
		for vx in hn:
			var l := grid.heights[maxi(vx - 1, 0) + vy * hn]
			var r := grid.heights[mini(vx + 1, hn - 1) + vy * hn]
			var d := grid.heights[vx + maxi(vy - 1, 0) * hn]
			var u := grid.heights[vx + mini(vy + 1, hn - 1) * hn]
			normals[vx + vy * hn] = Vector3(l - r, 2.0 * Balance.CELL, d - u).normalized()
	var idx := PackedInt32Array()
	for vy in hn - 1:
		for vx in hn - 1:
			var i := vx + vy * hn
			idx.append_array([i, i + 1, i + hn, i + 1, i + hn + 1, i + hn])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = normals
	arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = ground_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _build_water() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(grid.n * Balance.CELL + 4.0, grid.n * Balance.CELL + 4.0)
	var mi := MeshInstance3D.new()
	mi.mesh = plane
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/water.gdshader")
	mi.material_override = mat
	mi.position = Vector3(0, ForestGrid.WATER_LEVEL, 0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


# =====================================================================================
# Plants
# =====================================================================================
func _chunk_of(i: int) -> int:
	var nc := int(ceil(float(grid.n) / VCHUNK))
	return (i % grid.n) / VCHUNK + ((i / grid.n) / VCHUNK) * nc


func _variant(i: int) -> int:
	var k := grid.kind[i]
	if grid.size_mult[i] > 1.01:
		return Models.variant_count(k) - 1   # landmarks are the big old ones
	return Models.variant_of(k, grid.vary[i])


func _build_plants() -> void:
	var size := grid.n * grid.n
	_first.resize(size)
	_first.fill(-1)
	_cell_mm.resize(size)
	_size.resize(size)
	_size.fill(1.0)
	# Count first, then fill each chunk's MultiMesh.
	var counts := {}
	for i in size:
		var k := grid.kind[i]
		if Balance.flammable(k):
			var key := "%d:%d:%d" % [k, _variant(i), _chunk_of(i)]
			counts[key] = int(counts.get(key, 0)) + int(PER_CELL[k])
	for key in counts:
		var parts: PackedStringArray = key.split(":")
		var k := int(parts[0])
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true   # needed in Compatibility: without it vertex colours come out black
		mm.use_custom_data = true
		mm.mesh = Models.plant_mesh(k, int(parts[1]))
		mm.instance_count = int(counts[key])
		_mm[key] = mm
		var mmi := _add_mm(mm, plant_mat, k >= Balance.PINE)   # the trees cast moon shadows
		if k <= Balance.BUSH:
			mmi.visibility_range_end = 55.0
	var fill := {}
	for i in size:
		var k := grid.kind[i]
		if not Balance.flammable(k):
			continue
		var key := "%d:%d:%d" % [k, _variant(i), _chunk_of(i)]
		var mm: MultiMesh = _mm[key]
		var at := int(fill.get(key, 0))
		_first[i] = at
		_cell_mm[i] = mm
		var per := int(PER_CELL[k])
		fill[key] = at + per
		var c := grid.cell_center(i)
		var v := grid.vary[i]
		var big := grid.size_mult[i]
		_size[i] = Models.variant_height(k, v) * big
		for p in per:
			var jitter := Vector2(_rng.randf_range(-0.35, 0.35), _rng.randf_range(-0.35, 0.35)) * Balance.CELL
			if k == Balance.ELDER or k == Balance.GIANT or big > 1.01:
				jitter *= 0.2
			var pos := c + jitter
			var s := (0.9 + 0.2 * fmod(v * 3.7, 1.0)) * big
			if k == Balance.GRASS:
				s = _rng.randf_range(0.95, 1.5)
			var yaw := _rng.randf_range(0.0, TAU)
			if k == Balance.ELDER:
				yaw = 0.0   # the Elder Tree's face looks south, at the village
			var b := Basis(Vector3.UP, yaw).scaled(Vector3(s, s * _rng.randf_range(0.92, 1.1), s))
			var t := Transform3D(b, Vector3(pos.x, grid.height_at(pos.x, pos.y) - 0.05, pos.y))
			mm.set_instance_transform(at + p, t)
			mm.set_instance_color(at + p, Color.WHITE)
			mm.set_instance_custom_data(at + p, Color(-1.0, _rng.randf(), NEVER, standing_flag(k)))


static func standing_flag(k: int) -> float:
	## Custom data `a` for a plant that isn't burning: under 0.75 marks the low
	## ones (grass, bushes) that the see-through window must leave alone.
	return 0.5 if k <= Balance.BUSH else 1.0


func _set_plant(i: int, burn_start: float, duration: float, vanish: float) -> void:
	var mm: MultiMesh = _cell_mm[i]
	if mm == null:
		return
	for p in int(PER_CELL[grid.kind[i]]):
		var at := _first[i] + p
		var c := mm.get_instance_custom_data(at)
		mm.set_instance_custom_data(at, Color(burn_start, c.g, vanish, duration))


func _build_stones() -> void:
	var cells: Array = []
	for i in grid.kind.size():
		if grid.kind[i] == Balance.STONE:
			cells.append(i)
	if cells.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = Models.boulder_mesh()
	mm.instance_count = cells.size()
	for n in cells.size():
		var c := grid.cell_center(cells[n])
		var s := _rng.randf_range(0.8, 1.5)
		var b := Basis(Vector3.UP, _rng.randf_range(0, TAU)).scaled(Vector3(s, s * _rng.randf_range(0.7, 1.1), s))
		mm.set_instance_transform(n, Transform3D(b, Vector3(c.x, grid.height_at(c.x, c.y) - 0.15, c.y)))
		mm.set_instance_color(n, Color.WHITE)
		mm.set_instance_custom_data(n, Color(-1.0, _rng.randf(), NEVER, 1.0))
	_add_mm(mm, plant_mat)


func _build_edge_forest() -> void:
	## Dark cursed woods on the hills all round: cheap silhouettes, out of reach,
	## in clumps with gaps rather than an even carpet.
	var half := grid.n * Balance.CELL * 0.5
	var r := RandomNumberGenerator.new()
	r.seed = Balance.WORLD_SEED + 5
	var clump := FastNoiseLite.new()
	clump.seed = Balance.WORLD_SEED + 6
	clump.frequency = 0.05
	var spots: Array = []
	for _k in 1500:
		var p := Vector2(r.randf_range(-half - 30.0, half + 30.0), r.randf_range(-half - 30.0, half + 30.0))
		if maxf(absf(p.x), absf(p.y)) < half + 2.5:
			continue
		if clump.get_noise_2d(p.x, p.y) < -0.25:
			continue
		spots.append(p)
	for oak in [false, true]:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = Models.far_tree(oak)
		var mine: Array = []
		for k in spots.size():
			if (k % 3 == 0) == oak:
				mine.append(spots[k])
		mm.instance_count = mine.size()
		for k in mine.size():
			var p: Vector2 = mine[k]
			var s := r.randf_range(1.2, 2.2)
			var b := Basis(Vector3.UP, r.randf_range(0, TAU)).scaled(Vector3(s, s * r.randf_range(0.9, 1.25), s))
			mm.set_instance_transform(k, Transform3D(b, Vector3(p.x, grid.height_at(p.x, p.y) - 0.1, p.y)))
			mm.set_instance_color(k, Color.WHITE)
			mm.set_instance_custom_data(k, Color(-1.0, r.randf(), NEVER, 1.0))
		_add_mm(mm, plant_mat)


func _add_mm(mm: MultiMesh, mat: Material, shadows: bool = false) -> MultiMeshInstance3D:
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	draw_lists += 1
	return mmi


# =====================================================================================
# Meadow flowers
# =====================================================================================
func _build_flowers() -> void:
	_bloomed.resize(grid.n * grid.n)
	_bloomed.fill(0)


func _flower_mm(species: int, ch: int) -> MultiMesh:
	var key := "%d:%d" % [species, ch]
	if _flowers.has(key):
		return _flowers[key]
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = Models.flower_mesh(species)
	mm.instance_count = 128
	mm.visible_instance_count = 0
	var mmi := _add_mm(mm, flower_mat)
	mmi.visibility_range_end = 62.0
	var nc := int(ceil(float(grid.n) / FCHUNK))
	var cx := (ch % nc) * FCHUNK * Balance.CELL + grid.origin.x
	var cz := (ch / nc) * FCHUNK * Balance.CELL + grid.origin.y
	mmi.custom_aabb = AABB(Vector3(cx - 2.0, -3.0, cz - 2.0), Vector3(FCHUNK * Balance.CELL + 4.0, 10.0, FCHUNK * Balance.CELL + 4.0))
	_flowers[key] = mm
	_flower_count[key] = 0
	_flower_keys.append(key)
	return mm


func _grow(mm: MultiMesh, need: int) -> void:
	## Make room for more flowers (changing instance_count clears the data, so keep it).
	if need <= mm.instance_count:
		return
	var old_count := mm.instance_count
	var keep := mm.buffer
	var stride := 20                          # transform 12 + colour 4 + custom 4
	var visible := mm.visible_instance_count
	var count := maxi(need, old_count * 2)
	mm.instance_count = count
	if keep.size() == old_count * stride:     # (the headless test renderer can't read buffers back)
		var buf := PackedFloat32Array()
		buf.resize(count * stride)
		for k in keep.size():
			buf[k] = keep[k]
		mm.buffer = buf
	mm.visible_instance_count = visible


func _edge_factor(i: int) -> float:
	## Flowers thin out toward trails, rocks and water: 1 in a patch's middle, ~0.3 at its rim.
	var x := i % grid.n
	var y := i / grid.n
	var open := 0
	for oy in range(-2, 3):
		for ox in range(-2, 3):
			var xx := x + ox
			var yy := y + oy
			if xx < 0 or yy < 0 or xx >= grid.n or yy >= grid.n:
				continue
			if not Balance.flammable(grid.kind[xx + yy * grid.n]):
				open += 1
	return clampf(1.0 - open / 9.0, 0.25, 1.0)


func _bloom(i: int, instant: bool) -> void:
	_bloomed[i] = 1
	var c := grid.cell_center(i)
	var nc := int(ceil(float(grid.n) / FCHUNK))
	var ch := (i % grid.n) / FCHUNK + ((i / grid.n) / FCHUNK) * nc
	# A drift of one species here, its neighbour species at the drift's edge,
	# sage tufts everywhere; thick in the middle of a patch, thin at its rim.
	var d := (_drift.get_noise_2d(c.x, c.y) + 1.0) * 0.5
	var main := clampi(int(d * 4.0), 0, 3)
	var dense := clampf((_dense.get_noise_2d(c.x, c.y) + 1.0) * 0.5, 0.0, 1.0)
	var edge := _edge_factor(i)
	# drifts: thick in their cores, grass with hardly a flower between them
	var flowers := int(round(pow(dense, 1.7) * 6.0 * edge))
	var tufts := 1 + int(_rng.randf() < (0.8 if flowers < 2 else 0.35))
	var items: Array = []
	for _f in flowers:
		var sp := main
		if _rng.randf() < 0.08:
			sp = clampi(main + (1 if _rng.randf() < 0.5 else -1), 0, 3)
		items.append(sp)
	for _t in tufts:
		items.append(4)
	# a little cluster: flowers bunch round one spot in the cell
	var hub := c + Vector2(_rng.randf_range(-0.4, 0.4), _rng.randf_range(-0.4, 0.4))
	for sp in items:
		var mm := _flower_mm(sp, ch)
		var key := "%d:%d" % [sp, ch]
		var at: int = _flower_count[key]
		_grow(mm, at + 1)
		var spread := 0.75 if sp == 4 else 0.45
		var p := hub + Vector2(_rng.randf_range(-spread, spread), _rng.randf_range(-spread, spread))
		var s := _rng.randf_range(0.95, 1.5) * (1.35 if sp == 4 else 1.15)
		var b := Basis(Vector3.UP, _rng.randf_range(0, TAU)).scaled(Vector3(s, s * _rng.randf_range(0.85, 1.15), s))
		b = Basis(Vector3(_rng.randf_range(-1, 1), 0, _rng.randf_range(-1, 1)).normalized(), _rng.randf_range(0.0, 0.18)) * b
		mm.set_instance_transform(at, Transform3D(b, Vector3(p.x, grid.height_at(p.x, p.y) - 0.02, p.y)))
		var born := now - 5.0 if instant else now + _rng.randf_range(0.0, 0.8)
		mm.set_instance_color(at, Color.WHITE)
		mm.set_instance_custom_data(at, Color(born, _rng.randf(), 0.0, 1.0))
		_flower_count[key] = at + 1
		mm.visible_instance_count = at + 1


# =====================================================================================
# Fire and smoke
# =====================================================================================
func _build_fire() -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	_flames = MultiMesh.new()
	_flames.transform_format = MultiMesh.TRANSFORM_3D
	_flames.use_custom_data = true
	_flames.mesh = quad
	_flames.instance_count = MAX_FLAMES
	_flames.visible_instance_count = 0
	var whole := AABB(Vector3(grid.origin.x - 10.0, -5.0, grid.origin.y - 10.0),
		Vector3(grid.n * Balance.CELL + 20.0, 60.0, grid.n * Balance.CELL + 20.0))
	_add_mm(_flames, flame_mat).custom_aabb = whole
	_smoke = MultiMesh.new()
	_smoke.transform_format = MultiMesh.TRANSFORM_3D
	_smoke.use_custom_data = true
	_smoke.mesh = quad
	_smoke.instance_count = MAX_SMOKE
	_smoke.visible_instance_count = 0
	_add_mm(_smoke, smoke_mat).custom_aabb = whole
	_buf.resize(MAX_FLAMES * 16)
	_smoke_buf.resize(MAX_SMOKE * 16)
	fire_light = OmniLight3D.new()
	fire_light.light_color = Color("#FF9A4A")
	fire_light.omni_range = 18.0
	fire_light.omni_attenuation = 1.2
	fire_light.light_energy = 0.0
	fire_light.shadow_enabled = false
	# Each omni light costs extra drawing passes in the Compatibility renderer:
	# phones skip it (the painted fire light, _fire_img, does the job there).
	fire_light.visible = not DisplayServer.is_touchscreen_available()
	add_child(fire_light)


func _put(buf: PackedFloat32Array, n: int, pos: Vector3, sx: float, sy: float, custom: Color) -> void:
	var o := n * 16
	buf[o] = sx
	buf[o + 1] = 0.0
	buf[o + 2] = 0.0
	buf[o + 3] = pos.x
	buf[o + 4] = 0.0
	buf[o + 5] = sy
	buf[o + 6] = 0.0
	buf[o + 7] = pos.y
	buf[o + 8] = 0.0
	buf[o + 9] = 0.0
	buf[o + 10] = sx
	buf[o + 11] = pos.z
	buf[o + 12] = custom.r
	buf[o + 13] = custom.g
	buf[o + 14] = custom.b
	buf[o + 15] = custom.a


func _style() -> float:
	return 1.0 if GameState.phoenix_on else 0.0


func update_fire(camera_pos: Vector3) -> void:
	## Rebuild the flame, spark and smoke billboards and the fire's light from the
	## burning cells (once per tick). Each burning plant gets a cluster of flames
	## of different sizes round it, one tall leading flame on top, sparks, smoke;
	## grass fires get a leading flame every few cells so a burning patch has a
	## crest, not a row of candles.
	var nf := 0
	var ns := 0
	var light_sum := Vector3.ZERO
	var light_w := 0.0
	var near2 := 30.0 * 30.0
	var style := _style()
	_fire_img.fill(Color.BLACK)
	for c in grid.burning:
		var k := grid.kind[c]
		var size := grid.flame_size(c)
		var v := grid.vary[c]
		var big := _size[c] if _size.size() > c else 1.0
		var cp := grid.cell_center(c)
		var ground := grid.height_at(cp.x, cp.y)
		var grow := sqrt(size)
		var tall := float(Balance.PLANTS[k].height) * big
		var list: Array = FLAMES[k]
		var h := fmod(v * 91.7 + float(c) * 0.618, 1.0)          # this cell's own dice
		var lead_grass := k == Balance.GRASS and h < 0.28
		for fi in list.size():
			if nf >= MAX_FLAMES:
				break
			var f: Array = list[fi]
			var r := fmod(h * 7.3 + fi * 0.389, 1.0)
			var ang := (h + fi * 0.27) * TAU
			var out := float(f[3]) * (0.6 + 0.6 * r) * (big if k >= Balance.PINE else 1.0)
			var at := Vector3(cp.x + cos(ang) * out, ground + float(f[2]) * tall, cp.y + sin(ang) * out)
			var lead := (fi == 0 and k >= Balance.PINE) or lead_grass
			var w := float(f[0]) * grow * (0.75 + 0.5 * r)
			var hh := float(f[1]) * grow * (0.7 + 0.6 * fmod(r * 3.1, 1.0))
			if lead_grass:
				hh *= 1.9
				w *= 1.1
			if k >= Balance.PINE:
				w *= 0.85 + 0.15 * big
				hh *= big
			_put(_buf, nf, at, w, hh, Color(fmod(h * 13.7 + fi * 0.137, 1.0), size, style, 1.0 if lead else 0.0))
			nf += 1
		# sparks spitting up out of the bigger fires
		var sparks := 0 if k == Balance.GRASS and h > 0.3 else (1 if k <= Balance.BUSH else 3)
		for si in sparks:
			if nf >= MAX_FLAMES:
				break
			var sr := fmod(h * 5.1 + si * 0.43, 1.0)
			var at := Vector3(cp.x + (sr - 0.5) * 1.2, ground + tall * (0.3 + 0.5 * sr), cp.y + (fmod(sr * 7.7, 1.0) - 0.5) * 1.2)
			_put(_buf, nf, at, 0.22 + 0.12 * sr, 1.0 + tall * 0.25, Color(sr, size, style, 2.0))
			nf += 1
		if ns < MAX_SMOKE and (k >= Balance.PINE or (c % 4) == 0):
			var puff := 1.3 + 0.55 * float(k)
			_put(_smoke_buf, ns, Vector3(cp.x, ground + tall * 0.9 + 1.0, cp.y), 1.0, 1.0,
				Color(v, puff, 0.3 + 0.5 * v, 0.5 + v))
			ns += 1
		_fire_img.set_pixel(c % grid.n, c / grid.n, Color(LIGHT[k] * (0.4 + 0.6 * size), 0, 0))
		var base := Vector3(cp.x, ground, cp.y)
		var d2 := base.distance_squared_to(camera_pos)
		if d2 < near2:
			var wgt := (1.0 + float(k)) * size
			light_sum += base * wgt
			light_w += wgt
	_flames.buffer = _buf
	_flames.visible_instance_count = nf
	_smoke.buffer = _smoke_buf
	_smoke.visible_instance_count = ns
	_fire_img.generate_mipmaps()
	_fire_tex.update(_fire_img)
	if light_w > 0.0:
		var target := light_sum / light_w + Vector3(0, 3.0, 0)
		fire_light.position = fire_light.position.lerp(target, 0.35) if fire_light.light_energy > 0.05 else target
		fire_light.light_energy = lerpf(fire_light.light_energy, clampf(light_w * 0.05, 0.3, 1.8), 0.3)
		fire_light.omni_range = clampf(10.0 + light_w * 0.2, 10.0, 18.0)
	else:
		fire_light.light_energy = lerpf(fire_light.light_energy, 0.0, 0.3)


# =====================================================================================
# The ground colour texture
# =====================================================================================
func _build_cell_texture() -> void:
	_img = Image.create(grid.n, grid.n, false, Image.FORMAT_RGBA8)
	_meadow_img = Image.create(grid.n, grid.n, false, Image.FORMAT_L8)
	for i in grid.kind.size():
		_img.set_pixel(i % grid.n, i / grid.n, _ground_color(i))
		_set_meadow(i)
	_tex = ImageTexture.create_from_image(_img)
	_meadow_tex = ImageTexture.create_from_image(_meadow_img)
	ground_mat.set_shader_parameter("cells", _tex)
	ground_mat.set_shader_parameter("meadow", _meadow_tex)


func _set_meadow(i: int) -> void:
	var m := grid.state[i] == ForestGrid.MEADOW
	if grid.lifted and grid.kind[i] == Balance.BARE and i / grid.n < grid.n - 11:
		m = true                     # the curse is lifted: the old trails green over as well
	_meadow_img.set_pixel(i % grid.n, i / grid.n, Color(1, 1, 1) if m else Color(0, 0, 0))


func green_trails() -> void:
	for i in grid.kind.size():
		if grid.kind[i] == Balance.BARE:
			_set_meadow(i)
	_tex_dirty = true


func _lin(c: Color, v: float, k: float = 0.08) -> Color:
	## A palette colour, varied a little per cell, in linear space for the shader.
	var o := c.lightened(k * (v - 0.5) * 2.0) if v > 0.5 else c.darkened(k * (0.5 - v) * 2.0)
	o = o.srgb_to_linear()
	o.a = 0.0
	return o


func _ground_color(i: int) -> Color:
	var v := grid.vary[i]
	match grid.state[i]:
		ForestGrid.BURNING:
			return Color(0.03, 0.02, 0.02, 1.0)
		ForestGrid.ASH:
			return _lin(G_ASH, v)
		ForestGrid.MEADOW:
			return _lin(G_CINDER, v, 0.1)   # under the ragged edge of the meadow (painted by the shader)
	match grid.kind[i]:
		Balance.GRASS:
			return _lin(G_GRASS, v)
		Balance.BUSH, Balance.PINE:
			return _lin(G_MOSS, v)
		Balance.OAK, Balance.GIANT, Balance.ELDER:
			return _lin(G_MOSS.darkened(0.1), v)
		Balance.STONE:
			return _lin(G_STONE, v)
		Balance.WATER:
			return _lin(G_WATER, v)
		Balance.BARE:
			var y := i / grid.n
			if (grid.zone[i] == 0 and y >= grid.n - 10) or (y >= ForestGrid.PATH_END and absf(float(i % grid.n) - grid.path_x(y) - 0.5) < 1.6):
				return _lin(G_VILLAGE, v, 0.1)
			return _lin(G_TRAIL, v)
	return _lin(G_MOSS, v)


# =====================================================================================
# The village (swallowed by the curse) at the south edge, placed by hand
# =====================================================================================
func _place(mesh: Mesh, x: float, z: float, yaw: float, s: float = 1.0, sink: float = 0.05) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = prop_mat
	mi.position = Vector3(x, grid.height_at(x, z) - sink, z)
	mi.rotation.y = yaw
	mi.scale = Vector3.ONE * s
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mi)
	return mi


func _facing(from: Vector2, to: Vector2) -> float:
	var d := to - from
	return atan2(d.x, d.y)


const LODGE := Vector2(-11.0, 49.6)
const HOUSES := [["lodge", Vector2(-11.0, 49.6), 1.15, 2.9], ["cottage_small", Vector2(9.4, 48.6), 1.0, 1.9],
	["cottage_mid", Vector2(15.4, 55.2), 1.0, 2.4], ["woodshed", Vector2(-16.2, 56.4), 1.0, 1.6]]
const LODGE_CHIMNEY := Vector3(1.32, 8.6, -1.87)   # in the lodge model's own space (art/blender/village.py)
const WELL := Vector2(-4.6, 50.6)

var _stones: Array = []            # [Vector2 position, radius] laid so far


func _build_village() -> void:
	## Laid out by hand and lopsided on purpose: the old keeper's round lodge is
	## the landmark on the left (its chimney smokes), a small leaning hut sits
	## near on the right, a bigger cottage further back, a woodshed behind the
	## lodge. Flagstones are laid round the well and at the lodge's door, and
	## stepping stones lead off along the worn path, thinning out into the woods.
	var square := Vector2(0.0, 50.0)
	for h in HOUSES:
		var pos: Vector2 = h[1]
		var face := _facing(pos, square)
		if h[0] == "woodshed":
			face = _facing(pos, Vector2(-8.0, 56.0))
		var mi := _place(Models.prop(h[0]), pos.x, pos.y, face + (0.35 if h[0] == "lodge" else 0.1), h[2], 0.1)
		if h[0] == "lodge":
			_chimney_smoke(mi.transform * LODGE_CHIMNEY)
	_place(Models.prop("well"), WELL.x, WELL.y, 0.4)
	_place(Models.prop("woodpile"), -7.4, 53.6, 1.2)
	_place(Models.prop("fence"), -5.6, 46.0, 0.3)
	_place(Models.prop("fence"), 13.8, 45.8, -0.35)
	_place(Models.prop("fence"), 17.4, 50.8, 1.3)
	var gate := grid.cell_center(int(floor(grid.path_x(66))) + 66 * grid.n)
	for lp in [Vector2(3.6, 49.4), Vector2(gate.x - 2.4, 45.0), Vector2(gate.x + 2.6, 41.4), Vector2(-7.6, 47.2)]:
		_place(Models.prop("lantern_post"), lp.x, lp.y, _rng.randf_range(0, TAU))
	_place(Models.prop("signpost"), 7.2, 46.4, PI * 0.95)
	_place(Models.prop("ground_roots"), -1.8, 46.6, PI + 0.2, 1.0, 0.12)
	_place(Models.prop("ground_roots"), 13.0, 51.6, PI - 0.9, 0.85, 0.12)
	_place(Models.prop("root_arch"), gate.x + 0.75, gate.y, 0.0, 1.1, 0.25)
	_lay_stones(gate)
	# The villagers' gardens never went cursed: flowers by the walls and fences.
	for y in range(grid.n - 10, grid.n):
		for x in grid.n:
			var i := x + y * grid.n
			if grid.kind[i] != Balance.BARE:
				continue
			var p := grid.cell_center(i)
			var near_house := false
			for h in HOUSES:
				var d := p.distance_to(h[1])
				if d > float(h[3]) + 0.4 and d < float(h[3]) + 2.2:
					near_house = true
			if _on_stone(p, 0.3):
				continue
			if near_house or (absf(p.x) > 7.0 and _rng.randf() < 0.1):
				_bloom(i, true)


func _chimney_smoke(at: Vector3) -> void:
	## A thin plume from the lodge's chimney: someone kept the fire in.
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = quad
	mm.instance_count = 7
	for k in 7:
		mm.set_instance_transform(k, Transform3D(Basis(), at))
		mm.set_instance_custom_data(k, Color(k / 7.0, 0.9 + 0.1 * (k % 3), 0.05, 0.25))
	var mmi := _add_mm(mm, smoke_mat)
	mmi.custom_aabb = AABB(Vector3(-6, -1, -6), Vector3(12, 14, 12))


func _on_stone(p: Vector2, gap: float) -> bool:
	for st in _stones:
		if p.distance_to(st[0]) < float(st[1]) + gap:
			return true
	return false


func _stone_ok(p: Vector2, r: float) -> bool:
	var i := grid.cell_at(p.x, p.y)
	if i < 0 or grid.kind[i] == Balance.WATER or (grid.kind[i] != Balance.BARE and p.y < 50.5):
		return false
	for h in HOUSES:
		if p.distance_to(h[1]) < float(h[3]) + r + 0.2:
			return false
	if p.distance_to(WELL) < 1.25 + r:
		return false
	for st in _stones:
		if p.distance_to(st[0]) < (float(st[1]) + r) * 0.9 + 0.03:
			return false
	return true


func _lay_stones(gate: Vector2) -> void:
	var r := RandomNumberGenerator.new()
	r.seed = Balance.WORLD_SEED + 77
	# 1. the lodge's doorstep: three big slabs
	var door_dir := (Vector2(0.0, 50.0) - LODGE).normalized().rotated(0.35)
	for k in 3:
		var p := LODGE + door_dir * (3.6 + k * 0.95) + door_dir.orthogonal() * r.randf_range(-0.25, 0.25)
		_try_stone(p, r.randf_range(0.6, 0.72), r)
	# 2. paving round the well, big stones in the middle, ragged at the rim
	var hub := Vector2(-2.2, 53.6)
	for _k in 2600:
		var a := r.randf() * TAU
		var d := sqrt(r.randf()) * 6.4
		var p := hub + Vector2(cos(a), sin(a) * 0.85) * d
		if r.randf() > 1.0 - smoothstep(3.2, 6.4, d) * 0.92:
			continue
		_try_stone(p, lerpf(0.78, 0.42, d / 6.4) * r.randf_range(0.8, 1.2), r)
	# 3. stepping stones along the worn path, thinning out into the woods
	var y := float(grid.n) - 5.5
	while y > float(ForestGrid.PATH_END):
		var cx := grid.origin.x + (grid.path_x(y) + 1.0) * Balance.CELL
		var cz := grid.origin.y + y * Balance.CELL
		var into_woods := clampf((float(grid.n) - 8.0 - y) / 14.0, 0.0, 1.0)
		if r.randf() > into_woods * 0.75:
			_try_stone(Vector2(cx + r.randf_range(-0.4, 0.4), cz), r.randf_range(0.4, 0.55), r)
		y -= 0.75
	# one MultiMesh per stone shape
	var by_shape := {}
	for st in _stones:
		var k: int = st[2]
		if not by_shape.has(k):
			by_shape[k] = []
		by_shape[k].append(st)
	for k in by_shape:
		var list: Array = by_shape[k]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = Models.prop("flagstone_%d" % k)
		mm.instance_count = list.size()
		for n in list.size():
			var st: Array = list[n]
			var p: Vector2 = st[0]
			var s := float(st[1]) / 0.5
			var b := Basis(Vector3.UP, float(st[3])) * Basis.from_scale(Vector3(s * r.randf_range(0.95, 1.15), 0.8 + 0.4 * s, s * r.randf_range(0.85, 1.05)))
			b = Basis(Vector3(r.randf_range(-1, 1), 0, r.randf_range(-1, 1)).normalized(), r.randf_range(0.0, 0.05)) * b   # laid by hand: none quite level
			mm.set_instance_transform(n, Transform3D(b, Vector3(p.x, grid.height_at(p.x, p.y) - 0.04, p.y)))
			mm.set_instance_color(n, Color.WHITE)
			mm.set_instance_custom_data(n, Color(-1.0, r.randf(), NEVER, 0.5))
		_add_mm(mm, plant_mat)


func _try_stone(p: Vector2, rad: float, r: RandomNumberGenerator) -> void:
	if _stone_ok(p, rad):
		_stones.append([p, rad, r.randi() % 6, r.randf() * TAU])


# =====================================================================================
# Per frame
# =====================================================================================
func apply_changes(changed: Array) -> void:
	## Cells changed state this tick: update their plants, ground and flowers.
	var seen := {}
	for c in changed:
		if seen.has(c):
			continue
		seen[c] = true
		match grid.state[c]:
			ForestGrid.BURNING:
				var started := now - (grid.fuel0[c] - grid.fuel[c])
				_set_plant(c, started, grid.fuel0[c], NEVER)
				_glow.erase(c)
			ForestGrid.ASH:
				if grid.withered.has(c):
					_set_plant(c, -1.0, 1.0, now + grid.ash_t[c] * 0.8)   # the curse lifted: it fades, unburnt
				else:
					var k := grid.kind[c]
					var vanish := now + 0.4 if k <= Balance.BUSH else now + maxf(0.5, grid.ash_t[c] - 0.6)
					_set_plant(c, now - grid.fuel0[c], grid.fuel0[c], vanish)
					_glow[c] = now
			ForestGrid.MEADOW:
				_set_plant(c, now - 100.0, 1.0, now - 10.0)
				if _bloomed[c] == 0:
					_bloom(c, false)
				_glow.erase(c)
		_img.set_pixel(c % grid.n, c / grid.n, _ground_color(c))
		_set_meadow(c)
		_tex_dirty = true


func _rebase(by: float) -> void:
	now -= by
	for i in grid.state.size():
		if grid.state[i] == ForestGrid.INTACT:
			continue
		var mm: MultiMesh = _cell_mm[i]
		if mm == null:
			continue
		for p in int(PER_CELL[grid.kind[i]]):
			var at := _first[i] + p
			var c := mm.get_instance_custom_data(at)
			var vanish := c.b if c.b > NEVER * 0.5 or is_inf(c.b) else maxf(c.b - by, -20000.0)
			mm.set_instance_custom_data(at, Color(maxf(c.r - by, -20000.0), c.g, vanish, c.a))
	for key in _flower_keys:
		var mm: MultiMesh = _flowers[key]
		for k in int(_flower_count[key]):
			var c := mm.get_instance_custom_data(k)
			mm.set_instance_custom_data(k, Color(maxf(c.r - by, -20000.0), c.g, c.b, c.a))
	for c in _glow.keys():
		_glow[c] = float(_glow[c]) - by


func show_loaded_state() -> void:
	## After loading a save: put every plant in its saved state at once.
	for i in grid.state.size():
		match grid.state[i]:
			ForestGrid.BURNING:
				_set_plant(i, now - (grid.fuel0[i] - grid.fuel[i]), grid.fuel0[i], NEVER)
			ForestGrid.ASH:
				_set_plant(i, now - 100.0, 1.0, now + grid.ash_t[i])
			ForestGrid.MEADOW:
				_set_plant(i, now - 100.0, 1.0, now - 10.0)
				_bloom(i, true)
		_img.set_pixel(i % grid.n, i / grid.n, _ground_color(i))
		_set_meadow(i)
	_tex.update(_img)
	_meadow_tex.update(_meadow_img)


func set_camera(cam: Vector3, focus: Vector3) -> void:
	plant_mat.set_shader_parameter("cam_pos", cam)
	plant_mat.set_shader_parameter("focus_pos", focus)
	flower_mat.set_shader_parameter("cam_pos", cam)
	prop_mat.set_shader_parameter("focus_pos", focus)
	flame_mat.set_shader_parameter("focus_pos", focus)


func advance(delta: float) -> void:
	now += delta
	if now > REBASE_AT:
		_rebase(REBASE_BY)
	plant_mat.set_shader_parameter("now", now)
	flower_mat.set_shader_parameter("now", now)
	_tex_t += delta
	if _tex_t >= 0.2:
		_tex_t = 0.0
		# Fresh ash glows with embers for a few seconds.
		for c in _glow.keys():
			var age: float = now - float(_glow[c])
			var a := clampf(1.0 - age / 6.0, 0.0, 1.0)
			var col := _img.get_pixel(c % grid.n, c / grid.n)
			col.a = a
			_img.set_pixel(c % grid.n, c / grid.n, col)
			_tex_dirty = true
			if a <= 0.0:
				_glow.erase(c)
		if _tex_dirty:
			_tex_dirty = false
			_tex.update(_img)
			_meadow_tex.update(_meadow_img)
