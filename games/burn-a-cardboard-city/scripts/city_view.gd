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
var fire_light: OmniLight3D

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
	_build_floor()
	_build_structures()
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
	plane.size = Vector2(84, 84)
	plane.subdivide_width = 8
	plane.subdivide_depth = 8
	var mi := MeshInstance3D.new()
	mi.mesh = plane
	mi.material_override = floor_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	for i in n * n:
		_update_shadow(i)
	_burn_tex.update(_burn_img)


func _update_shadow(c: int) -> void:
	## The soft contact shadow standing buildings throw on the floor round them
	## (heavier on the side away from the skylights).
	var n := grid.n
	var x := c % n
	var y := c / n
	var sh := 0.0
	for oy in range(-2, 3):
		for ox in range(-2, 3):
			if ox == 0 and oy == 0:
				continue
			var xx := x + ox
			var yy := y + oy
			if xx < 0 or yy < 0 or xx >= n or yy >= n:
				continue
			var s := grid.sid[xx + yy * n]
			if s < 0 or grid.s_state[s] > CityGrid.BURNING:
				continue
			var d := Vector2(ox, oy).length()
			var tall := clampf(grid.s_height[s] / 1.6, 0.35, 1.0)
			var side := 1.0 + 0.6 * clampf(Vector2(-ox, -oy).normalized().dot(Vector2(0.55, 0.83)), 0.0, 1.0)
			sh += tall * side * (0.42 if d < 1.5 else 0.12)
	var col := _burn_img.get_pixel(x, y)
	col.b = clampf(sh, 0.0, 0.85)
	_burn_img.set_pixel(x, y, col)
	_burn_dirty = true


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
		var r: Rect2i = grid.s_rect[s].grow(3)
		if grid.s_fall[s] != CityGrid.CRUMPLE:
			r = r.merge(grid.fall_strip(s).grow(2))
		for y in range(maxi(0, r.position.y), mini(grid.n, r.end.y)):
			for x in range(maxi(0, r.position.x), mini(grid.n, r.end.x)):
				_update_shadow(x + y * grid.n)
		burst(impact_point(s), grid.s_kind[s])
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
	_debris.set_instance_custom_data(at, Color(0.55, _rng.randf(), NEVER, 8.0))
	_debris.visible_instance_count = _debris_n


func _set_debris_burning(c: int, on: bool) -> void:
	if not _debris_at.has(c):
		return
	var at: int = _debris_at[c]
	var cd := _debris.get_instance_custom_data(at)
	_debris.set_instance_custom_data(at, Color(0.55 if on else 0.95, cd.g, NEVER, 8.0 if on else 0.0))


# =====================================================================================
# Masking-tape road markings
# =====================================================================================
func _build_tape() -> void:
	var strips: Array = []
	var period := Balance.BLOCK + Balance.STREET
	var c := Balance.CELL
	for by in Balance.BLOCKS:
		for bx in Balance.BLOCKS:
			var ring := maxi(absi(bx - 4), absi(by - 4))
			if ring <= 1:
				continue
			var x0 := grid.origin.x + (Balance.STREET + bx * period) * c
			var z0 := grid.origin.y + (Balance.STREET + by * period) * c
			var L := Balance.BLOCK * c
			var inset := -0.05
			strips.append([Vector3(x0 + L * 0.5, 0, z0 + inset), L + 0.1, 0.0])
			strips.append([Vector3(x0 + L * 0.5, 0, z0 + L - inset), L + 0.1, 0.0])
			strips.append([Vector3(x0 + inset, 0, z0 + L * 0.5), L + 0.1, PI * 0.5])
			strips.append([Vector3(x0 + L - inset, 0, z0 + L * 0.5), L + 0.1, PI * 0.5])
	# Dashed middle lines.
	for k in Balance.BLOCKS + 1:
		var lane := grid.origin.x + (k * period + 1.5) * c
		var t := grid.origin.y + 1.6
		while t < -grid.origin.y - 1.6:
			for horiz in [true, false]:
				var p := Vector3(t, 0, lane) if horiz else Vector3(lane, 0, t)
				var cell := grid.cell_at(p.x, p.z)
				if cell < 0 or grid.ground[cell] != CityGrid.G_STREET:
					continue
				if Balance.zone_for_cell(cell % grid.n, cell / grid.n) >= 3:
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
	smoke_mat = ShaderMaterial.new()
	smoke_mat.shader = load("res://shaders/smoke.gdshader")
	smoke_mat.set_shader_parameter("puff", Gfx.soft_dot())
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
	fire_light = OmniLight3D.new()
	fire_light.light_color = Color(1.0, 0.55, 0.22)
	fire_light.omni_range = 9.0
	fire_light.omni_attenuation = 1.3
	fire_light.light_energy = 0.0
	fire_light.shadow_enabled = false
	# Each omni light costs extra passes in Compatibility: phones go without.
	fire_light.visible = not DisplayServer.is_touchscreen_available()
	add_child(fire_light)


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
	## Rebuild the flames and smoke from what's burning (once per fire tick).
	var nf := 0
	var ns := 0
	var lsum := Vector3.ZERO
	var lw := 0.0
	var n := grid.n
	for s in grid.burning:
		var k := grid.s_kind[s]
		var fs: Vector2 = FLAME[k]
		var fire := grid.s_fire[s]
		var grow := 0.55 + 0.45 * fire
		var h := grid.s_height[s] * (0.55 + 0.4 * grid.s_integ[s])
		var r: Rect2i = grid.s_rect[s]
		var order: PackedInt32Array = grid.s_order[s]
		var on := grid.flames_on(s)
		var tall := h > 1.2
		for i in on:
			if nf >= MAX_FLAMES - 2:
				break
			var c := order[i]
			var cx := c % n
			var cy := c / n
			var seed := fmod(float(c) * 0.6180339, 1.0)
			var cp := grid.cell_center(c) + Vector2(seed - 0.5, fmod(seed * 7.3, 1.0) - 0.5) * 0.2
			var top := h * (0.82 + 0.18 * seed)
			_put(_buf, nf, Vector3(cp.x, top - fs.y * 0.18, cp.y), fs.x * grow, fs.y * grow * (0.8 + 0.4 * seed),
				Color(seed, fire, flame_style, 0.0))
			nf += 1
			if tall and (cx == r.position.x or cy == r.position.y or cx == r.end.x - 1 or cy == r.end.y - 1):
				# Fire climbing the outside walls.
				var out := Vector2(cx + 0.5, cy + 0.5) - Vector2(r.position) - Vector2(r.size) * 0.5
				out = out.normalized() * 0.32
				var hy := h * (0.25 + 0.5 * fmod(seed * 3.7, 1.0))
				_put(_buf, nf, Vector3(cp.x + out.x, hy, cp.y + out.y), fs.x * grow * 0.8, fs.y * grow * 0.9,
					Color(fmod(seed * 5.1, 1.0), fire * 0.8, flame_style, 0.0))
				nf += 1
		if ns < MAX_SMOKE:
			var sc: Vector2 = grid.s_center[s]
			_put(_smoke_buf, ns, Vector3(sc.x, h + 0.2, sc.y), 1.0, 1.0,
				Color(grid.s_vary[s], 0.5 + 0.35 * fs.x * fire, 0.6, 0.4 + grid.s_vary[s]))
			ns += 1
		var d2 := Vector3(grid.s_center[s].x, h, grid.s_center[s].y).distance_squared_to(cam)
		if d2 < 400.0:
			var w := (1.0 + fs.x) * fire
			lsum += Vector3(grid.s_center[s].x, h * 0.7 + 0.4, grid.s_center[s].y) * w
			lw += w
	for c in grid.debris:
		if nf >= MAX_FLAMES:
			break
		var fuel := clampf(grid.deb_fuel[c] / 3.0, 0.25, 1.0)
		var seed := fmod(float(c) * 0.7548776, 1.0)
		var cp := grid.cell_center(c) + Vector2(seed - 0.5, fmod(seed * 5.3, 1.0) - 0.5) * 0.25
		_put(_buf, nf, Vector3(cp.x, 0.0, cp.y), 0.42 * fuel, 0.55 * fuel * (0.8 + 0.4 * seed), Color(seed, fuel * 0.7, flame_style, 0.0))
		nf += 1
		if ns < MAX_SMOKE and (c % 5) == 0:
			_put(_smoke_buf, ns, Vector3(cp.x, 0.3, cp.y), 1.0, 1.0, Color(seed, 0.4, 0.9, 0.5))
			ns += 1
	_flames.buffer = _buf
	_flames.visible_instance_count = nf
	_smoke.buffer = _smoke_buf
	_smoke.visible_instance_count = ns
	if lw > 0.0:
		var target := lsum / lw
		fire_light.position = fire_light.position.lerp(target, 0.35) if fire_light.light_energy > 0.05 else target
		fire_light.light_energy = lerpf(fire_light.light_energy, clampf(lw * 0.25, 0.4, 2.6), 0.3)
	else:
		fire_light.light_energy = lerpf(fire_light.light_energy, 0.0, 0.3)


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


func advance(delta: float) -> void:
	now += delta
	if now > REBASE_AT:
		_rebase(REBASE_BY)
	ModelLib.set_time(now)
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
