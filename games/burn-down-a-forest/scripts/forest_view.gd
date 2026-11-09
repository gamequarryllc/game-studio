class_name ForestView
extends Node3D
## Draws the ForestGrid. Everything that repeats is a MultiMesh, split into
## chunks so the camera can skip what it can't see:
##  - plants: one MultiMesh per kind per chunk. Each instance's custom data says
##    when it caught fire and when it crumbles away, so the shader animates the
##    burn on its own and the CPU only touches a plant when its state changes;
##  - flames and smoke: one MultiMesh each, rebuilt every fire tick from the
##    burning cells (camera-facing quads drawn by shaders/flame.gdshader);
##  - meadow flowers: per chunk, appended as cells bloom;
##  - the ground: one mesh, coloured per cell from a small texture.

const VCHUNK := 16                 # cells per side of a drawing chunk
const MAX_FLAMES := 900
const MAX_SMOKE := 320
const FLOWERS_PER_CELL := 3
const PER_CELL := {Balance.GRASS: 2, Balance.BUSH: 1, Balance.PINE: 1, Balance.OAK: 1, Balance.GIANT: 1, Balance.ELDER: 1}
const NEVER := 1.0e6
# The GPU keeps MultiMesh custom data as half floats in the Compatibility
# renderer, so the times in it must stay small: every few minutes the clock
# steps back and every stored time with it (_rebase).
const REBASE_AT := 300.0
const REBASE_BY := 240.0

# Flames per kind: [width, height, height above the ground] for each billboard.
const FLAMES := {
	Balance.GRASS: [[1.0, 1.15, 0.0]],
	Balance.BUSH: [[1.5, 1.9, 0.0]],
	Balance.PINE: [[2.3, 4.2, 0.1], [1.6, 3.0, 2.4]],
	Balance.OAK: [[3.3, 4.8, 0.2], [2.6, 3.4, 2.8]],
	Balance.GIANT: [[4.6, 7.0, 0.3], [3.8, 5.5, 3.8], [3.2, 4.2, 6.6]],
	Balance.ELDER: [[10.0, 14.0, 0.0], [8.0, 11.0, 6.0], [7.0, 9.0, 12.0], [6.0, 7.0, 16.0]],
}

var grid: ForestGrid
var now := 0.0                     # the clock the plant shader animates by
var plant_mat: ShaderMaterial
var flower_mat: ShaderMaterial
var flame_mat: ShaderMaterial
var smoke_mat: ShaderMaterial
var ground_mat: ShaderMaterial
var static_mat: StandardMaterial3D
var fire_light: OmniLight3D

var _mm := {}                      # "kind:chunk" -> MultiMesh
var _first := PackedInt32Array()   # cell -> its first instance in its chunk's MultiMesh (-1: none)
var _cell_mm: Array = []           # cell -> MultiMesh (or null)
var _img: Image
var _tex: ImageTexture
var _tex_dirty := false
var _tex_t := 0.0
var _glow := {}                    # ash cell -> time it stopped burning (its embers fade)
var _flames: MultiMesh
var _smoke: MultiMesh
var _flowers: Array = []           # chunk -> MultiMesh
var _flower_count: Array = []
var _bloomed := PackedByteArray()
var _rng := RandomNumberGenerator.new()
var _buf := PackedFloat32Array()
var _smoke_buf := PackedFloat32Array()


func build(g: ForestGrid) -> void:
	grid = g
	_rng.seed = Balance.WORLD_SEED + 99
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
	flower_mat.set_shader_parameter("sway", 0.12)
	flame_mat = ShaderMaterial.new()
	flame_mat.shader = load("res://shaders/flame.gdshader")
	smoke_mat = ShaderMaterial.new()
	smoke_mat.shader = load("res://shaders/smoke.gdshader")
	smoke_mat.set_shader_parameter("puff", UiTheme.soft_dot())
	ground_mat = ShaderMaterial.new()
	ground_mat.shader = load("res://shaders/ground.gdshader")
	ground_mat.set_shader_parameter("forest_origin", grid.origin)
	ground_mat.set_shader_parameter("forest_size", grid.n * Balance.CELL)
	static_mat = StandardMaterial3D.new()
	static_mat.vertex_color_use_as_albedo = true
	static_mat.roughness = 0.95


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


func _hue(i: int) -> float:
	var v := grid.vary[i]
	match grid.kind[i]:
		Balance.GRASS:
			return 0.6 + 0.4 * v
		Balance.BUSH:
			return 0.25 + 0.7 * v
		Balance.PINE:
			return 0.3 + 0.65 * v
		Balance.OAK:
			return 0.05 + 0.45 * v
		Balance.GIANT:
			return 0.0 + 0.3 * v
	return 0.12


func _build_plants() -> void:
	var size := grid.n * grid.n
	_first.resize(size)
	_first.fill(-1)
	_cell_mm.resize(size)
	# Count first, then fill each chunk's MultiMesh.
	var counts := {}
	for i in size:
		var k := grid.kind[i]
		if Balance.flammable(k):
			var key := "%d:%d" % [k, _chunk_of(i)]
			counts[key] = int(counts.get(key, 0)) + int(PER_CELL[k])
	for key in counts:
		var k := int(key.split(":")[0])
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true   # needed in Compatibility: without it vertex colours come out black
		mm.use_custom_data = true
		mm.mesh = Models.plant_mesh(k)
		mm.instance_count = int(counts[key])
		_mm[key] = mm
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = plant_mat
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if k <= Balance.BUSH:
			mmi.visibility_range_end = 55.0
		add_child(mmi)
	var fill := {}
	for i in size:
		var k := grid.kind[i]
		if not Balance.flammable(k):
			continue
		var key := "%d:%d" % [k, _chunk_of(i)]
		var mm: MultiMesh = _mm[key]
		var at := int(fill.get(key, 0))
		_first[i] = at
		_cell_mm[i] = mm
		var per := int(PER_CELL[k])
		fill[key] = at + per
		var c := grid.cell_center(i)
		var v := grid.vary[i]
		for p in per:
			var jitter := Vector2(_rng.randf_range(-0.35, 0.35), _rng.randf_range(-0.35, 0.35)) * Balance.CELL
			if k == Balance.ELDER or k == Balance.GIANT:
				jitter *= 0.3
			var pos := c + jitter
			var s := 0.78 + 0.32 * v
			if k == Balance.GRASS:
				s = _rng.randf_range(1.0, 1.6)
			var b := Basis(Vector3.UP, _rng.randf_range(0.0, TAU)).scaled(Vector3(s, s * _rng.randf_range(0.9, 1.15), s))
			var t := Transform3D(b, Vector3(pos.x, grid.height_at(pos.x, pos.y) - 0.05, pos.y))
			mm.set_instance_transform(at + p, t)
			mm.set_instance_color(at + p, Color.WHITE)
			mm.set_instance_custom_data(at + p, Color(-1.0, _hue(i), NEVER, 1.0))


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
		var s := _rng.randf_range(0.9, 1.6)
		var b := Basis(Vector3.UP, _rng.randf_range(0, TAU)).scaled(Vector3(s, s * _rng.randf_range(0.7, 1.1), s))
		mm.set_instance_transform(n, Transform3D(b, Vector3(c.x, grid.height_at(c.x, c.y) - 0.15, c.y)))
		mm.set_instance_color(n, Color.WHITE)
		mm.set_instance_custom_data(n, Color(-1.0, 0.0, NEVER, 1.0))
	_add_mm(mm, plant_mat)


func _build_edge_forest() -> void:
	## Dark cursed woods on the hills all round: scenery, out of reach.
	var spots: Array = []
	var half := grid.n * Balance.CELL * 0.5
	var r := RandomNumberGenerator.new()
	r.seed = Balance.WORLD_SEED + 5
	for _k in 1400:
		var p := Vector2(r.randf_range(-half - 28.0, half + 28.0), r.randf_range(-half - 28.0, half + 28.0))
		if maxf(absf(p.x), absf(p.y)) < half + 2.5:
			continue
		spots.append(p)
	for kind in [Balance.PINE, Balance.OAK]:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = Models.plant_mesh(kind)
		var mine: Array = []
		for k in spots.size():
			if (k % 3 == 0) == (kind == Balance.OAK):
				mine.append(spots[k])
		mm.instance_count = mine.size()
		for k in mine.size():
			var p: Vector2 = mine[k]
			var s := r.randf_range(1.1, 1.9)
			var b := Basis(Vector3.UP, r.randf_range(0, TAU)).scaled(Vector3(s, s, s))
			mm.set_instance_transform(k, Transform3D(b, Vector3(p.x, grid.height_at(p.x, p.y) - 0.1, p.y)))
			mm.set_instance_color(k, Color.WHITE)
			mm.set_instance_custom_data(k, Color(-1.0, r.randf_range(0.0, 0.6), NEVER, 1.0))
		_add_mm(mm, plant_mat)


func _add_mm(mm: MultiMesh, mat: Material) -> MultiMeshInstance3D:
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	return mmi


# =====================================================================================
# Meadow flowers
# =====================================================================================
func _build_flowers() -> void:
	_bloomed.resize(grid.n * grid.n)
	_bloomed.fill(0)
	var nc := int(ceil(float(grid.n) / VCHUNK))
	for ch in nc * nc:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = Models.flower_mesh()
		mm.instance_count = VCHUNK * VCHUNK * FLOWERS_PER_CELL
		mm.visible_instance_count = 0
		var mmi := _add_mm(mm, flower_mat)
		mmi.visibility_range_end = 60.0
		var cx := (ch % nc) * VCHUNK * Balance.CELL + grid.origin.x
		var cz := (ch / nc) * VCHUNK * Balance.CELL + grid.origin.y
		mmi.custom_aabb = AABB(Vector3(cx - 2.0, -3.0, cz - 2.0) - mmi.position,
			Vector3(VCHUNK * Balance.CELL + 4.0, 10.0, VCHUNK * Balance.CELL + 4.0))
		_flowers.append(mm)
		_flower_count.append(0)


func _bloom(i: int, instant: bool) -> void:
	_bloomed[i] = 1
	var ch := _chunk_of(i)
	var mm: MultiMesh = _flowers[ch]
	var c := grid.cell_center(i)
	for _f in FLOWERS_PER_CELL:
		var at: int = _flower_count[ch]
		if at >= mm.instance_count:
			return
		var p := c + Vector2(_rng.randf_range(-0.7, 0.7), _rng.randf_range(-0.7, 0.7))
		var s := _rng.randf_range(0.9, 1.7)
		var b := Basis(Vector3.UP, _rng.randf_range(0, TAU)).scaled(Vector3(s, s, s))
		mm.set_instance_transform(at, Transform3D(b, Vector3(p.x, grid.height_at(p.x, p.y) - 0.02, p.y)))
		var born := now - 5.0 if instant else now + _rng.randf_range(0.0, 0.8)
		mm.set_instance_color(at, Color.WHITE)
		mm.set_instance_custom_data(at, Color(born, _rng.randf(), 0.0, 1.0))
		_flower_count[ch] = at + 1
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
	fire_light.light_color = Color(1.0, 0.55, 0.2)
	fire_light.omni_range = 18.0
	fire_light.omni_attenuation = 1.2
	fire_light.light_energy = 0.0
	fire_light.shadow_enabled = false
	# Each omni light costs extra drawing passes in the Compatibility renderer:
	# phones skip it (the flames glow on their own).
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


func update_fire(camera_pos: Vector3) -> void:
	## Rebuild the flame and smoke billboards from the burning cells (once per tick).
	var nf := 0
	var ns := 0
	var light_sum := Vector3.ZERO
	var light_w := 0.0
	var near2 := 30.0 * 30.0
	for c in grid.burning:
		var k := grid.kind[c]
		var size := grid.flame_size(c)
		var v := grid.vary[c]
		var cp := grid.cell_center(c)
		var base := Vector3(cp.x + (v - 0.5) * 0.5, grid.height_at(cp.x, cp.y), cp.y + (fmod(v * 7.3, 1.0) - 0.5) * 0.5)
		var grow := sqrt(size)
		for f in FLAMES[k]:
			if nf >= MAX_FLAMES:
				break
			_put(_buf, nf, base + Vector3(0, float(f[2]) * (0.6 + 0.4 * grow), 0), float(f[0]) * grow, float(f[1]) * grow,
				Color(fmod(v * 13.7 + nf * 0.137, 1.0), size, 0.0, 0.0))
			nf += 1
		if ns < MAX_SMOKE and (k >= Balance.PINE or (c % 4) == 0):
			var puff := 1.2 + 0.5 * float(k)
			_put(_smoke_buf, ns, base + Vector3(0, float(FLAMES[k][0][1]) * 0.7, 0), 1.0, 1.0,
				Color(v, puff, 0.25 + 0.4 * v, 0.5 + v))
			ns += 1
		var d2 := base.distance_squared_to(camera_pos)
		if d2 < near2:
			var w := (1.0 + float(k)) * size
			light_sum += base * w
			light_w += w
	_flames.buffer = _buf
	_flames.visible_instance_count = nf
	_smoke.buffer = _smoke_buf
	_smoke.visible_instance_count = ns
	if light_w > 0.0:
		var target := light_sum / light_w + Vector3(0, 3.0, 0)
		fire_light.position = fire_light.position.lerp(target, 0.35) if fire_light.light_energy > 0.05 else target
		fire_light.light_energy = lerpf(fire_light.light_energy, clampf(light_w * 0.08, 0.4, 3.2), 0.3)
		fire_light.omni_range = clampf(10.0 + light_w * 0.2, 10.0, 18.0)
	else:
		fire_light.light_energy = lerpf(fire_light.light_energy, 0.0, 0.3)


# =====================================================================================
# The ground colour texture
# =====================================================================================
func _build_cell_texture() -> void:
	_img = Image.create(grid.n, grid.n, false, Image.FORMAT_RGBA8)
	for i in grid.kind.size():
		_img.set_pixel(i % grid.n, i / grid.n, _ground_color(i))
	_tex = ImageTexture.create_from_image(_img)
	ground_mat.set_shader_parameter("cells", _tex)


func _ground_color(i: int) -> Color:
	var v := grid.vary[i]
	match grid.state[i]:
		ForestGrid.BURNING:
			return Color(0.11, 0.07, 0.06, 1.0)
		ForestGrid.ASH:
			return Color(0.27 + 0.04 * v, 0.25 + 0.03 * v, 0.24, 0.0)
		ForestGrid.MEADOW:
			return Color(0.3 + 0.08 * v, 0.56 + 0.1 * v, 0.22 + 0.04 * v, 0.0)
	match grid.kind[i]:
		Balance.GRASS:
			return Color(0.12, 0.2 + 0.04 * v, 0.24, 0.0)
		Balance.BUSH:
			return Color(0.15, 0.15, 0.24, 0.0)
		Balance.PINE:
			return Color(0.13, 0.13, 0.22, 0.0)
		Balance.OAK:
			return Color(0.17, 0.12, 0.23, 0.0)
		Balance.GIANT, Balance.ELDER:
			return Color(0.2, 0.11, 0.26, 0.0)
		Balance.STONE:
			return Color(0.36, 0.35, 0.4, 0.0)
		Balance.WATER:
			return Color(0.1, 0.17, 0.2, 0.0)
		Balance.BARE:
			if grid.zone[i] == 0 and i / grid.n >= grid.n - 6:
				return Color(0.42, 0.34, 0.26, 0.0)
			return Color(0.3 + 0.04 * v, 0.23 + 0.03 * v, 0.2, 0.0)
	return Color(0.2, 0.15, 0.2, 0.0)


# =====================================================================================
# The village (swallowed by the curse) at the south edge
# =====================================================================================
func _build_village() -> void:
	var z := grid.origin.y + (grid.n - 3) * Balance.CELL
	var xs := [-13.5, -7.5, 7.5, 13.5]
	for k in xs.size():
		var mi := MeshInstance3D.new()
		mi.mesh = Models.cottage_mesh(k)
		mi.material_override = static_mat
		var x: float = xs[k]
		mi.position = Vector3(x, grid.height_at(x, z) - 0.05, z + (0.6 if k % 2 == 0 else -0.4))
		mi.rotation.y = PI + (0.15 if x < 0 else -0.15)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)


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
	for ch in _flowers.size():
		var mm: MultiMesh = _flowers[ch]
		for k in int(_flower_count[ch]):
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
	_tex.update(_img)


func set_camera(cam: Vector3, focus: Vector3) -> void:
	plant_mat.set_shader_parameter("cam_pos", cam)
	plant_mat.set_shader_parameter("focus_pos", focus)


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
