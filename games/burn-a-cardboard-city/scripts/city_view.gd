class_name CityView
extends Node3D
## Draws the CityGrid:
##  - structures: one MultiMesh per Blender model. Each instance's custom data
##    holds how charred it is, whether it's burning, and when and which way it
##    fell; the shaders animate the burn and the collapse on their own, so the
##    CPU only touches an instance when something happens to it;
##  - paper flames and smoke: MultiMeshes rebuilt every fire tick from what's burning;
##  - debris: scraps of burning card on the floor, appended as they land;
##  - the floor: kinds of paper per cell (static) and scorch / embers / contact
##    shadow per cell (updated as things burn and fall);
##  - masking-tape road markings; splashes, bursts of sparks, a fire light.

const NEVER := 30000.0
const REBASE_AT := 300.0           # custom data is half floats in Compatibility: keep times small
const REBASE_BY := 240.0
const MAX_FLAMES := 1500
const MAX_SMOKE := 260
const MAX_DEBRIS := 1600
const FLAME := {
	Balance.HOUSE: Vector2(0.55, 0.85), Balance.CAR: Vector2(0.5, 0.7), Balance.TREE: Vector2(0.5, 0.75),
	Balance.OFFICE: Vector2(0.75, 1.15), Balance.SKY: Vector2(1.0, 1.5), Balance.WALL: Vector2(1.0, 1.6),
	Balance.TURRET: Vector2(1.2, 1.9), Balance.GATE: Vector2(1.1, 1.7), Balance.KEEP: Vector2(1.5, 2.4),
	Balance.TRUCK: Vector2(0.5, 0.75),
}

var grid: CityGrid
var now := 0.0
var flame_style := 0.0             # 0 fire, 1 golden (Golden lens), 2 party (starter pack sparks)
var flame_mat: ShaderMaterial
var smoke_mat: ShaderMaterial
var floor_mat: ShaderMaterial
var shadow_dir := Vector2(0.62, 0.78)   # the way shadows fall across the floor (grid x, grid y), set by World
var shadow_slope := 0.58                # tan of the key light's height above the floor
var lights: Array = []                  # the pooled fire lights: [Vector3 position, float brightness]
var _hgt := PackedFloat32Array()        # height of what stands on each cell (0: nothing, or burned)
var _rub_mm := {}                       # rubble model -> MultiMesh
var _rub_used := {}
var _rub_aabb := {}
var _rub_done := {}                     # structure -> [rubble model, instance] once its rubble is down
var _pending: Array = []                # [structure, view time to swap in its rubble]

var _mm := {}                      # model name -> MultiMesh
var _smm: Array = []               # structure -> its MultiMesh
var _slot := PackedInt32Array()    # structure -> its instance in that MultiMesh
var _he := PackedFloat32Array()    # structure -> half its footprint along x (m)
var _hez := PackedFloat32Array()   # ...and along z
var _char := PackedFloat32Array()
var _flames: MultiMesh
var _smoke: MultiMesh
var _debris: MultiMesh
var _debris_at := {}               # cell -> instance
var _debris_n := 0
var _kinds_img: Image
var _burn_img: Image
var _burn_tex: ImageTexture
var _burn_dirty := false
var _glow := {}                    # cell -> time its embers started fading
var _char_t := 0.0
var _buf := PackedFloat32Array()
var _smoke_buf := PackedFloat32Array()
var _bursts: Array = []
var _burst_i := 0
var _splashes: Array = []
var _splash_i := 0
var _rng := RandomNumberGenerator.new()


func build(g: CityGrid) -> void:
	grid = g
	_rng.seed = Balance.WORLD_SEED + 7
	ModelLib.set_time(now)
	_build_structures()
	_build_rubble()
	_build_floor()
	_build_tape()
	_build_fire()
	_build_debris()
	_build_effects()


# =====================================================================================
# The floor
# =====================================================================================
func _build_floor() -> void:
	var n := grid.n
	_kinds_img = Image.create(n, n, false, Image.FORMAT_R8)
	_burn_img = Image.create(n, n, false, Image.FORMAT_RGBA8)
	for i in n * n:
		_kinds_img.set_pixel(i % n, i / n, Color8(int(grid.ground[i]) * 40, 0, 0))
		_burn_img.set_pixel(i % n, i / n, Color(0, 0, 0, 1))
	floor_mat = ShaderMaterial.new()
	floor_mat.shader = load("res://shaders/floor.gdshader")
	floor_mat.set_shader_parameter("kinds", ImageTexture.create_from_image(_kinds_img))
	_burn_tex = ImageTexture.create_from_image(_burn_img)
	floor_mat.set_shader_parameter("burn", _burn_tex)
	floor_mat.set_shader_parameter("city_origin", grid.origin)
	floor_mat.set_shader_parameter("city_size", n * Balance.CELL)
	var plane := PlaneMesh.new()
	plane.size = Vector2(Warehouse.HALF * 2.0 + 2.0, Warehouse.HALF * 2.0 + 2.0)
	plane.subdivide_width = 8
	plane.subdivide_depth = 8
	var mi := MeshInstance3D.new()
	mi.mesh = plane
	mi.material_override = floor_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	_hgt.resize(n * n)
	_refresh_heights(Rect2i(0, 0, n, n))
	for i in n * n:
		_update_shadow(i)
	_burn_tex.update(_burn_img)


func _update_shadow(c: int) -> void:
	## The shadow standing buildings throw across the floor, baked per cell: a soft
	## contact shadow round each one, and a long shadow along the key light (which is
	## all a phone gets; computers also have the real one).
	var n := grid.n
	var x := c % n
	var y := c / n
	var sh := 0.0
	for oy in range(-1, 2):
		for ox in range(-1, 2):
			var xx := x + ox
			var yy := y + oy
			if xx >= 0 and yy >= 0 and xx < n and yy < n and (ox != 0 or oy != 0) and _hgt[xx + yy * n] > 0.0:
				sh = maxf(sh, 0.3 * clampf(_hgt[xx + yy * n] / 1.0, 0.4, 1.0))
	var step := Balance.CELL * shadow_slope
	for k in range(1, 28):
		var xx := int(round(x - shadow_dir.x * k))
		var yy := int(round(y - shadow_dir.y * k))
		if xx < 0 or yy < 0 or xx >= n or yy >= n:
			break
		var h := _hgt[xx + yy * n]
		if h > k * step:
			sh = maxf(sh, 0.8 - 0.45 * (k * step / h))
			if sh > 0.7:
				break
	var col := _burn_img.get_pixel(x, y)
	col.b = clampf(sh, 0.0, 0.85)
	_burn_img.set_pixel(x, y, col)
	_burn_dirty = true


func _refresh_heights(r: Rect2i) -> void:
	for yy in range(maxi(0, r.position.y), mini(grid.n, r.end.y)):
		for xx in range(maxi(0, r.position.x), mini(grid.n, r.end.x)):
			var s := grid.sid[xx + yy * grid.n]
			_hgt[xx + yy * grid.n] = grid.s_height[s] if s >= 0 and grid.s_state[s] <= CityGrid.BURNING else 0.0


func _reshadow_around(r: Rect2i) -> void:
	## After something falls: its shadow goes (and the cells downwind of the light change).
	_refresh_heights(r)
	var reach := 28
	var rr := r.grow(2)
	rr = rr.merge(Rect2i(rr.position + Vector2i(int(shadow_dir.x * reach), int(shadow_dir.y * reach)), rr.size))
	for yy in range(maxi(0, rr.position.y), mini(grid.n, rr.end.y)):
		for xx in range(maxi(0, rr.position.x), mini(grid.n, rr.end.x)):
			_update_shadow(xx + yy * grid.n)


func _set_burn(c: int, scorch: float, glow: float) -> void:
	var col := _burn_img.get_pixel(c % grid.n, c / grid.n)
	col.r = maxf(col.r, scorch)
	if glow >= 0.0:
		col.g = glow
	_burn_img.set_pixel(c % grid.n, c / grid.n, col)
	_burn_dirty = true


# =====================================================================================
# Structures
# =====================================================================================
func _build_structures() -> void:
	var counts := {}
	for s in grid.count:
		var m: String = grid.s_model[s]
		counts[m] = int(counts.get(m, 0)) + 1
	for m in counts:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true   # Compatibility multiplies vertex colours by instance colour: without it they're black
		mm.use_custom_data = true
		mm.mesh = ModelLib.city_mesh(m)
		mm.instance_count = int(counts[m])
		_mm[m] = mm
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		add_child(mmi)
	_slot.resize(grid.count)
	_he.resize(grid.count)
	_hez.resize(grid.count)
	_char.resize(grid.count)
	_smm.resize(grid.count)
	var fill := {}
	for s in grid.count:
		var m: String = grid.s_model[s]
		var mm: MultiMesh = _mm[m]
		var at := int(fill.get(m, 0))
		fill[m] = at + 1
		_slot[s] = at
		_smm[s] = mm
		var r: Rect2i = grid.s_rect[s]
		_he[s] = r.size.x * Balance.CELL * 0.5
		_hez[s] = r.size.y * Balance.CELL * 0.5
		_char[s] = 0.0
		var k := grid.s_kind[s]
		var wob := 0.035 if k in [Balance.HOUSE, Balance.CAR, Balance.TREE, Balance.TRUCK] else (0.012 if k == Balance.OFFICE else 0.0)
		var yaw := grid.s_rot[s] * PI * 0.5 + _rng.randf_range(-wob, wob)
		var sc := _rng.randf_range(0.96, 1.04) if k in [Balance.HOUSE, Balance.TREE] else 1.0
		var c: Vector2 = grid.s_center[s] + Vector2(_rng.randf_range(-1, 1), _rng.randf_range(-1, 1)) * wob * 0.6
		mm.set_instance_transform(at, Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3(sc, sc, sc)), Vector3(c.x, 0.0, c.y)))
		mm.set_instance_color(at, Color.WHITE)
		_write(s)


func _rubble_for(s: int) -> String:
	var k := grid.s_kind[s]
	if k == Balance.SKY and grid.s_model[s] == "sky_tube":
		return "fall_sky_1"
	var list: Array = Balance.RUBBLE.get(k, ["rub_small_0"])
	return list[int(grid.s_vary[s] * 997.0) % list.size()]


func _build_rubble() -> void:
	## One MultiMesh per burnt-out model, filled in as things come down.
	var want := {}
	for s in grid.count:
		var r := _rubble_for(s)
		want[r] = int(want.get(r, 0)) + 1
	var whole := AABB(Vector3(grid.origin.x - 8, -1, grid.origin.y - 8), Vector3(grid.n * Balance.CELL + 16, 6, grid.n * Balance.CELL + 16))
	for r in want:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = ModelLib.rubble_mesh(r)
		mm.instance_count = int(want[r])
		mm.visible_instance_count = 0
		_rub_mm[r] = mm
		_rub_used[r] = 0
		_rub_aabb[r] = mm.mesh.get_aabb()
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.custom_aabb = whole
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		add_child(mmi)


func _place_rubble(s: int, landed: float) -> void:
	if _rub_done.has(s):
		return
	_rub_done[s] = []
	# The standing model goes; what's left of it takes its place.
	var smm: MultiMesh = _smm[s]
	var t0 := smm.get_instance_transform(_slot[s])
	smm.set_instance_transform(_slot[s], Transform3D(Basis().scaled(Vector3(0.0001, 0.0001, 0.0001)), t0.origin - Vector3(0, 50, 0)))
	var name := _rubble_for(s)
	var mm: MultiMesh = _rub_mm[name]
	var at: int = _rub_used[name]
	if at >= mm.instance_count:
		return
	_rub_used[name] = at + 1
	mm.visible_instance_count = at + 1
	_rub_done[s] = [name, at]
	var box: AABB = _rub_aabb[name]
	var r: Rect2i = grid.s_rect[s]
	var c: Vector2 = grid.s_center[s]
	var xf: Transform3D
	var f := grid.s_fall[s]
	if f == CityGrid.CRUMPLE:
		var odd := grid.s_rot[s] % 2 == 1
		var wx := r.size.x * Balance.CELL
		var wz := r.size.y * Balance.CELL
		var lx := wz if odd else wx
		var lz := wx if odd else wz
		var sx := lx / maxf(box.size.x, 0.1) * 1.0
		var sz := lz / maxf(box.size.z, 0.1) * 1.0
		var sy := clampf(sqrt(sx * sz), 0.6, 1.4)
		var yaw := grid.s_rot[s] * PI * 0.5 + (grid.s_vary[s] - 0.5) * 0.3
		if grid.s_kind[s] in [Balance.HOUSE, Balance.CAR, Balance.TREE, Balance.TRUCK]:
			yaw = grid.s_vary[s] * TAU
			sx = minf(sx, sz)
			sz = sx
		xf = Transform3D(Basis(Vector3.UP, yaw) * Basis.from_scale(Vector3(sx, sy, sz)), Vector3(c.x, 0.0, c.y))
	else:
		var d: Vector2i = CityGrid.FALL_DIRS[f]
		var along := (r.size.x if d.x != 0 else r.size.y) * Balance.CELL
		var across := (r.size.y if d.x != 0 else r.size.x) * Balance.CELL
		var key := name.substr(0, name.rfind("_")) if name.begins_with("fall_") and name != "fall_turret" else name
		var size: Vector2 = Balance.FALL_SIZE.get(key, Vector2(2.2, 1.3))
		var sx := grid.s_height[s] / size.x
		var sz := across / size.y
		var sy := clampf(along * 0.3 / maxf(box.size.y, 0.1), 0.45, 1.25)
		var yaw: float = [0.0, PI, -PI * 0.5, PI * 0.5][f]
		var pivot := c + Vector2(d) * along * 0.5
		xf = Transform3D(Basis(Vector3.UP, yaw) * Basis.from_scale(Vector3(sx, sy, sz)), Vector3(pivot.x, 0.0, pivot.y))
	mm.set_instance_transform(at, xf)
	mm.set_instance_color(at, Color.WHITE)
	mm.set_instance_custom_data(at, Color(landed, grid.s_vary[s], 0.0, 0.0))


func rubble_transform(s: int) -> Transform3D:
	## Where a fallen structure's rubble lies (tests).
	var e: Array = _rub_done.get(s, [])
	if e.is_empty():
		return Transform3D(Basis(), Vector3.INF)
	return (_rub_mm[e[0]] as MultiMesh).get_instance_transform(int(e[1]))


func rubble_aabb(s: int) -> AABB:
	var e: Array = _rub_done.get(s, [])
	return AABB() if e.is_empty() else rubble_transform(s) * (_rub_aabb[e[0]] as AABB)


func rubble_count() -> int:
	var t := 0
	for k in _rub_used:
		t += int(_rub_used[k])
	return t


func _code(s: int) -> float:
	var code := 0.0
	var f := grid.s_fall[s]
	if f != CityGrid.CRUMPLE:
		code += float(f) + 4.0
		var he: float = _he[s] if f < 2 else _hez[s]
		code += 16.0 * round(he * 10.0)
	if grid.s_state[s] == CityGrid.BURNING:
		code += 8.0
	return code


func _write(s: int, fall_start: float = -1.0) -> void:
	var mm: MultiMesh = _smm[s]
	var at := _slot[s]
	var old := mm.get_instance_custom_data(at)
	var b := old.b if fall_start < 0.0 else fall_start
	if grid.s_state[s] <= CityGrid.BURNING and fall_start < 0.0:
		b = NEVER
	mm.set_instance_custom_data(at, Color(_char[s], grid.s_vary[s], b, _code(s)))


func show_loaded_state() -> void:
	## After loading a save: put everything in its saved state at once.
	for s in grid.count:
		match grid.s_state[s]:
			CityGrid.BURNING:
				_char[s] = 0.5
				_write(s)
			CityGrid.RUBBLE:
				_char[s] = 1.0
				_write(s, now - 60.0)
				_scorch_fall(s)
				_place_rubble(s, now - 999.0)
	_refresh_heights(Rect2i(0, 0, grid.n, grid.n))
	for i in grid.n * grid.n:
		_update_shadow(i)
	_burn_tex.update(_burn_img)


func _scorch_fall(s: int) -> void:
	for c in grid.s_cells[s]:
		_set_burn(c, 0.9, -1.0)
	if grid.s_fall[s] != CityGrid.CRUMPLE:
		var strip := grid.fall_strip(s)
		for y in range(maxi(0, strip.position.y), mini(grid.n, strip.end.y)):
			for x in range(maxi(0, strip.position.x), mini(grid.n, strip.end.x)):
				_set_burn(x + y * grid.n, 0.75, -1.0)


func apply_events(ignited: Array, collapsed: Array, impacts: Array, extinguished: Array, debris_new: Array, debris_out: Array) -> void:
	for s in ignited:
		_char[s] = maxf(_char[s], 0.06)
		_write(s)
	for s in extinguished:
		_write(s)
	for s in collapsed:
		_write(s, now)
	for e in impacts:
		var s: int = e[0]
		_char[s] = 1.0
		_write(s)
		_scorch_fall(s)
		_reshadow_around(grid.s_rect[s])
		burst(impact_point(s), grid.s_kind[s])
		_pending.append([s, now + (0.3 if grid.s_fall[s] != CityGrid.CRUMPLE else 0.04)])
	for c in debris_new:
		_add_debris(c)
		_set_burn(c, 0.55, 1.0)
		_glow.erase(c)
	for c in debris_out:
		_glow[c] = now
		_set_debris_burning(c, false)


func impact_point(s: int) -> Vector3:
	var c: Vector2 = grid.s_center[s]
	if grid.s_fall[s] != CityGrid.CRUMPLE:
		var d: Vector2i = CityGrid.FALL_DIRS[grid.s_fall[s]]
		c += Vector2(d) * grid.s_height[s] * 0.55
	return Vector3(c.x, 0.15, c.y)


func _update_chars() -> void:
	for s in grid.burning:
		var target := clampf(0.08 + (1.0 - grid.s_integ[s]) * 0.85 + grid.s_fire[s] * 0.07, 0.0, 0.96)
		if target > _char[s] + 0.02:
			_char[s] = target
			_write(s)


# =====================================================================================
# Debris on the floor
# =====================================================================================
func _build_debris() -> void:
	_debris = MultiMesh.new()
	_debris.transform_format = MultiMesh.TRANSFORM_3D
	_debris.use_colors = true
	_debris.use_custom_data = true
	_debris.mesh = _scrap_mesh()
	_debris.instance_count = MAX_DEBRIS
	_debris.visible_instance_count = 0
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = _debris
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mmi.custom_aabb = AABB(Vector3(grid.origin.x, -1, grid.origin.y), Vector3(grid.n * Balance.CELL, 3, grid.n * Balance.CELL))
	add_child(mmi)


func _scrap_mesh() -> ArrayMesh:
	## A few crumpled, torn pieces of board lying in a heap (it reuses the city's cardboard shader).
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var r := RandomNumberGenerator.new()
	r.seed = 77
	var kraft := Color(0.58, 0.36, 0.17, 1.0)
	for piece in 4:
		var c := Vector3(r.randf_range(-0.14, 0.14), 0.0, r.randf_range(-0.14, 0.14))
		var size := r.randf_range(0.08, 0.15)
		var a0 := r.randf() * TAU
		var pts: Array = []
		for k in 5:
			var a := a0 + TAU * k / 5.0 + r.randf_range(-0.3, 0.3)
			pts.append(c + Vector3(cos(a), 0, sin(a)) * size * r.randf_range(0.6, 1.2) + Vector3(0, r.randf_range(0.01, 0.07), 0))
		var top := c + Vector3(0, r.randf_range(0.04, 0.1), 0)
		for k in 5:
			var p0: Vector3 = pts[k]
			var p1: Vector3 = pts[(k + 1) % 5]
			var shade := 0.8 + 0.2 * r.randf()
			st.set_color(Color(kraft.r * shade, kraft.g * shade, kraft.b * shade, 1.0))
			st.add_vertex(top)
			st.add_vertex(p1)
			st.add_vertex(p0)
	st.generate_normals()
	var m := st.commit()
	m.surface_set_material(0, ModelLib.card_mat)
	return m


func _add_debris(c: int) -> void:
	if _debris_at.has(c):
		_set_debris_burning(c, true)
		return
	if _debris_n >= MAX_DEBRIS:
		return
	var at := _debris_n
	_debris_n += 1
	_debris_at[c] = at
	var p := grid.cell_center(c) + Vector2(_rng.randf_range(-0.12, 0.12), _rng.randf_range(-0.12, 0.12))
	var s := _rng.randf_range(0.9, 1.5)
	_debris.set_instance_transform(at, Transform3D(Basis(Vector3.UP, _rng.randf() * TAU).scaled(Vector3(s, s, s)), Vector3(p.x, 0.0, p.y)))
	_debris.set_instance_color(at, Color.WHITE)
	_debris.set_instance_custom_data(at, Color(0.92, _rng.randf(), NEVER, 8.0))
	_debris.visible_instance_count = _debris_n


func _set_debris_burning(c: int, on: bool) -> void:
	if not _debris_at.has(c):
		return
	var at: int = _debris_at[c]
	var cd := _debris.get_instance_custom_data(at)
	_debris.set_instance_custom_data(at, Color(0.92 if on else 1.0, cd.g, NEVER, 8.0 if on else 0.0))


# =====================================================================================
# Masking-tape road markings
# =====================================================================================
func _build_tape() -> void:
	var strips: Array = []
	var c := Balance.CELL
	for by in Balance.BLOCKS:
		for bx in Balance.BLOCKS:
			var ring := maxi(absi(bx - 4), absi(by - 4))
			if ring <= 1:
				continue
			var x0 := grid.origin.x + Balance.block_start(bx) * c
			var z0 := grid.origin.y + Balance.block_start(by) * c
			var L := Balance.BLOCK * c
			var inset := -0.05
			strips.append([Vector3(x0 + L * 0.5, 0, z0 + inset), L + 0.1, 0.0])
			strips.append([Vector3(x0 + L * 0.5, 0, z0 + L - inset), L + 0.1, 0.0])
			strips.append([Vector3(x0 + inset, 0, z0 + L * 0.5), L + 0.1, PI * 0.5])
			strips.append([Vector3(x0 + L - inset, 0, z0 + L * 0.5), L + 0.1, PI * 0.5])
	# Dashed middle lines, only on the grey card roads (not the bare floor between districts).
	for k in Balance.BLOCKS + 1:
		var lane := grid.origin.x + (Balance.lane(k) + 0.5) * c
		var t := grid.origin.y + 1.6
		while t < -grid.origin.y - 1.6:
			for horiz in [true, false]:
				var p := Vector3(t, 0, lane) if horiz else Vector3(lane, 0, t)
				var cell := grid.cell_at(p.x, p.z)
				if cell < 0 or grid.ground[cell] != CityGrid.G_ROAD or grid.sid[cell] >= 0:
					continue
				strips.append([p, 0.42, 0.0 if horiz else PI * 0.5])
			t += 0.75
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var plane := PlaneMesh.new()
	plane.size = Vector2(1, 1)
	mm.mesh = plane
	mm.instance_count = strips.size()
	for i in strips.size():
		var s: Array = strips[i]
		var len: float = s[1]
		var yaw: float = float(s[2]) + _rng.randf_range(-0.012, 0.012)
		var b := Basis(Vector3.UP, yaw).scaled(Vector3(len, 1.0, 0.075))
		var p: Vector3 = s[0]
		mm.set_instance_transform(i, Transform3D(b, p + Vector3(_rng.randf_range(-0.02, 0.02), 0.004 + i * 0.0000002, _rng.randf_range(-0.02, 0.02))))
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/tape.gdshader")
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)


# =====================================================================================
# Fire and smoke
# =====================================================================================
func _build_fire() -> void:
	flame_mat = ShaderMaterial.new()
	flame_mat.shader = load("res://shaders/paper_flame.gdshader")
	flame_mat.set_shader_parameter("flames", load("res://models/flames.png"))
	smoke_mat = ShaderMaterial.new()
	smoke_mat.shader = load("res://shaders/smoke.gdshader")
	smoke_mat.set_shader_parameter("tissue", load("res://models/smoke.png"))
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	var whole := AABB(Vector3(grid.origin.x - 5, -2, grid.origin.y - 5), Vector3(grid.n * Balance.CELL + 10, 30, grid.n * Balance.CELL + 10))
	_flames = MultiMesh.new()
	_flames.transform_format = MultiMesh.TRANSFORM_3D
	_flames.use_custom_data = true
	_flames.mesh = quad
	_flames.instance_count = MAX_FLAMES
	_flames.visible_instance_count = 0
	var fm := MultiMeshInstance3D.new()
	fm.multimesh = _flames
	fm.material_override = flame_mat
	fm.custom_aabb = whole
	fm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(fm)
	_smoke = MultiMesh.new()
	_smoke.transform_format = MultiMesh.TRANSFORM_3D
	_smoke.use_custom_data = true
	_smoke.mesh = quad
	_smoke.instance_count = MAX_SMOKE
	_smoke.visible_instance_count = 0
	var sm := MultiMeshInstance3D.new()
	sm.multimesh = _smoke
	sm.material_override = smoke_mat
	sm.custom_aabb = whole
	sm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(sm)
	_buf.resize(MAX_FLAMES * 16)
	_smoke_buf.resize(MAX_SMOKE * 16)
	for _i in 4:
		lights.append([Vector3(0, -100, 0), 0.0])
	_push_lights()


func set_wind(w: Vector2) -> void:
	flame_mat.set_shader_parameter("wind", w)
	smoke_mat.set_shader_parameter("wind", w)


func _put(buf: PackedFloat32Array, i: int, pos: Vector3, sx: float, sy: float, custom: Color) -> void:
	var o := i * 16
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


func update_fire(cam: Vector3) -> void:
	## Rebuild the flames and smoke from what's burning (once per fire tick): one tall
	## flame per building leaning with the wind, smaller ones over the cells that are
	## alight, some climbing the walls of tall ones; a few pieces of tissue smoke each.
	var nf := 0
	var ns := 0
	var n := grid.n
	var cands: Array = []
	for s in grid.burning:
		var k := grid.s_kind[s]
		var fs: Vector2 = FLAME[k]
		var fire := grid.s_fire[s]
		var grow := 0.5 + 0.5 * fire
		var h := grid.s_height[s] * (0.6 + 0.4 * grid.s_integ[s])
		var r: Rect2i = grid.s_rect[s]
		var order: PackedInt32Array = grid.s_order[s]
		var on := grid.flames_on(s)
		var sc: Vector2 = grid.s_center[s]
		var vary := grid.s_vary[s]
		# The lead flame: tall, in the middle of what's alight, leaning hardest.
		if nf < MAX_FLAMES - 2:
			var lead_c := sc.lerp(grid.cell_center(order[mini(on - 1, order.size() - 1) / 2]), 0.5)
			var tall_f := fs.y * (1.15 + 0.45 * fire) * grow
			_put(_buf, nf, Vector3(lead_c.x, h - tall_f * 0.15, lead_c.y), fs.x * 1.1 * grow, tall_f,
				Color(fmod(vary * 7.31, 1.0), fire, flame_style, 1.0))
			nf += 1
		var tall := h > 1.2
		var step := 2 if order.size() <= 8 else 3
		var i := 0
		while i < on:
			if nf >= MAX_FLAMES - 2:
				break
			var c := order[i]
			var cx := c % n
			var cy := c / n
			var seed := fmod(float(c) * 0.6180339, 1.0)
			var cp := grid.cell_center(c) + Vector2(seed - 0.5, fmod(seed * 7.3, 1.0) - 0.5) * 0.25
			var top := h * (0.84 + 0.16 * seed)
			var size := 0.4 + 0.45 * fmod(seed * 3.3, 1.0)
			_put(_buf, nf, Vector3(cp.x, top - fs.y * 0.15, cp.y), fs.x * grow * size, fs.y * grow * size * (0.8 + 0.5 * seed),
				Color(seed, fire, flame_style, 0.0))
			nf += 1
			if tall and (cx == r.position.x or cy == r.position.y or cx == r.end.x - 1 or cy == r.end.y - 1) and seed > 0.35:
				var out := Vector2(cx + 0.5, cy + 0.5) - Vector2(r.position) - Vector2(r.size) * 0.5
				out = out.normalized() * 0.3
				var hy := h * (0.2 + 0.55 * fmod(seed * 3.7, 1.0))
				_put(_buf, nf, Vector3(cp.x + out.x, hy, cp.y + out.y), fs.x * grow * 0.7, fs.y * grow * 0.85,
					Color(fmod(seed * 5.1, 1.0), fire * 0.8, flame_style, 0.0))
				nf += 1
			i += step
		var puffs := 1 + int(fs.x > 0.9) + int(fs.x > 1.3)
		for p in puffs:
			if ns >= MAX_SMOKE:
				break
			var off := Vector2(fmod(vary * (3.1 + p), 1.0) - 0.5, fmod(vary * (5.7 + p), 1.0) - 0.5) * Vector2(r.size) * Balance.CELL * 0.6
			_put(_smoke_buf, ns, Vector3(sc.x + off.x, h + 0.15, sc.y + off.y), 1.0, 1.0,
				Color(fmod(vary + p * 0.37, 1.0), 0.55 + 0.4 * fs.x * fire, 0.65, 0.4 + vary))
			ns += 1
		var d2 := Vector3(sc.x, h, sc.y).distance_squared_to(cam)
		if d2 < 900.0:
			cands.append([Vector3(sc.x, h * 0.6 + 0.3, sc.y), (1.0 + fs.x) * fire, d2])
	for c in grid.debris:
		if nf >= MAX_FLAMES:
			break
		var fuel := clampf(grid.deb_fuel[c] / 3.0, 0.25, 1.0)
		var seed := fmod(float(c) * 0.7548776, 1.0)
		var cp := grid.cell_center(c) + Vector2(seed - 0.5, fmod(seed * 5.3, 1.0) - 0.5) * 0.25
		_put(_buf, nf, Vector3(cp.x, 0.0, cp.y), 0.36 * fuel, 0.5 * fuel * (0.8 + 0.4 * seed), Color(seed, fuel * 0.7, flame_style, 0.0))
		nf += 1
		if ns < MAX_SMOKE and (c % 7) == 0:
			_put(_smoke_buf, ns, Vector3(cp.x, 0.25, cp.y), 1.0, 1.0, Color(seed, 0.4, 0.9, 0.5))
			ns += 1
	_flames.buffer = _buf
	_flames.visible_instance_count = nf
	_smoke.buffer = _smoke_buf
	_smoke.visible_instance_count = ns
	_pool_lights(cands)


func _pool_lights(cands: Array) -> void:
	## The four warm lights the fires cast: the biggest fire near the giant takes the
	## first, everything within 5 m of it pools into it, and so on.
	cands.sort_custom(func(a, b): return float(a[1]) / (1.0 + float(a[2]) * 0.004) > float(b[1]) / (1.0 + float(b[2]) * 0.004))
	var used := {}
	var want: Array = []
	for i in cands.size():
		if used.has(i) or want.size() >= 4:
			continue
		var p: Vector3 = cands[i][0]
		var wsum := float(cands[i][1])
		var psum: Vector3 = p * wsum
		for j in range(i + 1, cands.size()):
			if not used.has(j) and (cands[j][0] as Vector3).distance_to(p) < 5.0:
				used[j] = true
				wsum += float(cands[j][1])
				psum += (cands[j][0] as Vector3) * float(cands[j][1])
		want.append([psum / maxf(wsum, 0.001), clampf(0.35 + wsum * 0.18, 0.0, 2.4)])
	for k in 4:
		var l: Array = lights[k]
		if k < want.size():
			var target: Vector3 = want[k][0]
			l[0] = target if float(l[1]) < 0.05 else (l[0] as Vector3).lerp(target, 0.3)
			l[1] = lerpf(float(l[1]), float(want[k][1]), 0.3)
		else:
			l[1] = lerpf(float(l[1]), 0.0, 0.3)
	_push_lights()


func _push_lights() -> void:
	for k in 4:
		var l: Array = lights[k]
		var p: Vector3 = l[0]
		RenderingServer.global_shader_parameter_set("fire_l%d" % k, Vector4(p.x, p.y, p.z, float(l[1])))


func fire_glow() -> float:
	## How much fire light there is round the giant (the world darkens the haze with it).
	var t := 0.0
	for l in lights:
		t += float(l[1])
	return t


func flame_count() -> int:
	return _flames.visible_instance_count


# =====================================================================================
# Bursts of sparks (impacts) and splashes (fire trucks)
# =====================================================================================
func _build_effects() -> void:
	for _i in 8:
		var p := Gfx.particles(40, 0.12, [Color(1, 0.95, 0.6, 1), Color(1, 0.5, 0.1, 0.9), Color(0.4, 0.12, 0.05, 0.0)])
		p.one_shot = true
		p.explosiveness = 0.95
		p.lifetime = 0.9
		p.direction = Vector3.UP
		p.spread = 70.0
		p.gravity = Vector3(0, -6.0, 0)
		p.initial_velocity_min = 2.0
		p.initial_velocity_max = 5.5
		p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
		p.emission_sphere_radius = 0.4
		p.scale_amount_curve = Gfx.curve(1.0, 0.3)
		add_child(p)
		var dust := Gfx.particles(18, 0.7, [Color(0.6, 0.55, 0.5, 0.0), Color(0.5, 0.46, 0.42, 0.45), Color(0.4, 0.38, 0.36, 0.0)], false)
		dust.one_shot = true
		dust.explosiveness = 0.9
		dust.lifetime = 1.4
		dust.direction = Vector3.UP
		dust.spread = 85.0
		dust.gravity = Vector3(0, 0.4, 0)
		dust.initial_velocity_min = 0.8
		dust.initial_velocity_max = 2.2
		dust.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
		dust.emission_sphere_radius = 0.5
		dust.scale_amount_curve = Gfx.curve(0.6, 1.8)
		add_child(dust)
		_bursts.append([p, dust])
	for _i in 4:
		var w := Gfx.particles(36, 0.07, [Color(0.75, 0.9, 1.0, 0.95), Color(0.55, 0.78, 0.98, 0.7), Color(0.5, 0.7, 0.95, 0.0)], false)
		w.lifetime = 0.7
		w.gravity = Vector3(0, -9.0, 0)
		w.spread = 6.0
		w.one_shot = true
		w.explosiveness = 0.0
		add_child(w)
		_splashes.append(w)


func burst(at: Vector3, kind: int) -> void:
	var pair: Array = _bursts[_burst_i]
	_burst_i = (_burst_i + 1) % _bursts.size()
	var big := clampf(float(FLAME[kind].x) * 1.4, 0.6, 2.2)
	for p in pair:
		var cp := p as CPUParticles3D
		cp.global_position = at
		cp.emission_sphere_radius = 0.3 * big
		cp.initial_velocity_max = 4.0 * big
		cp.restart()
		cp.emitting = true


func splash(from: Vector3, to: Vector3) -> void:
	var w: CPUParticles3D = _splashes[_splash_i]
	_splash_i = (_splash_i + 1) % _splashes.size()
	var t := 0.6
	var g := Vector3(0, -9.0, 0)
	var v := (to - from - 0.5 * g * t * t) / t
	w.global_position = from
	w.direction = v.normalized()
	w.initial_velocity_min = v.length() * 0.92
	w.initial_velocity_max = v.length() * 1.05
	w.restart()
	w.emitting = true


# =====================================================================================
# Per frame
# =====================================================================================
func _rebase(by: float) -> void:
	now -= by
	for s in grid.count:
		if grid.s_state[s] < CityGrid.FALLING:
			continue
		var mm: MultiMesh = _smm[s]
		var cd := mm.get_instance_custom_data(_slot[s])
		mm.set_instance_custom_data(_slot[s], Color(cd.r, cd.g, maxf(cd.b - by, -20000.0), cd.a))
	for c in _glow.keys():
		_glow[c] = float(_glow[c]) - by
	for name in _rub_mm:
		var mm: MultiMesh = _rub_mm[name]
		for i in int(_rub_used[name]):
			var cd := mm.get_instance_custom_data(i)
			mm.set_instance_custom_data(i, Color(maxf(cd.r - by, -20000.0), cd.g, cd.b, cd.a))
	for e in _pending:
		e[1] = float(e[1]) - by


func advance(delta: float) -> void:
	now += delta
	if now > REBASE_AT:
		_rebase(REBASE_BY)
	ModelLib.set_time(now)
	if not _pending.is_empty():
		var keep: Array = []
		for e in _pending:
			if now >= float(e[1]):
				_place_rubble(int(e[0]), now)
			else:
				keep.append(e)
		_pending = keep
	_char_t += delta
	if _char_t >= 0.25:
		_char_t = 0.0
		_update_chars()
		for c in _glow.keys():
			var a := clampf(1.0 - (now - float(_glow[c])) / 5.0, 0.0, 1.0)
			var col := _burn_img.get_pixel(c % grid.n, c / grid.n)
			col.g = a
			_burn_img.set_pixel(c % grid.n, c / grid.n, col)
			_burn_dirty = true
			if a <= 0.0:
				_glow.erase(c)
		if _burn_dirty:
			_burn_dirty = false
			_burn_tex.update(_burn_img)
