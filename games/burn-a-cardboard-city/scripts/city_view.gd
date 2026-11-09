class_name CityView
extends Node3D
## Draws the CityGrid:
##  - structures: one MultiMesh per Blender model. Each instance's custom data
##    holds how charred it is, whether it's burning, and when and which way it
##    fell; the shaders animate the burn and the collapse on their own, so the
##    CPU only touches an instance when something happens to it;
##  - paper flames, tissue smoke and sparks: MultiMeshes rebuilt every fire tick from
##    what's burning (one big flame cluster per building rooted on its roof, licks on its
##    edges and out of its windows; a smoke column leaning with the fans; orange specks);
##  - debris: scraps of burning card on the floor, appended as they land;
##  - the floor: kinds of paper per cell (static) and scorch / embers / contact
##    shadow per cell (updated as things burn and fall);
##  - hand-painted scorch decals where things burned down;
##  - masking-tape road markings; the pallet deck under the castle; lifted lawn corners;
##  - splashes, bursts of sparks, a fire light.

const NEVER := 30000.0
const REBASE_AT := 300.0           # custom data is half floats in Compatibility: keep times small
const REBASE_BY := 240.0
const MAX_FLAMES := 1500
const MAX_SMOKE := 900
const MAX_SPARKS := 480
const MAX_DEBRIS := 1600
const YARD_LIFT := 0.16            # the castle stands on a pallet: its deck boards are this high
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
var _sparks: MultiMesh
var _spark_buf := PackedFloat32Array()
var spark_mat: ShaderMaterial
var _scorch: MultiMesh
var _scorch_n := 0
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
	_build_deck()
	_build_lawn_corners()
	_build_scorch()
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


func lift_at(x: float, z: float) -> float:
	## How high the floor is here: the castle's pallet deck, or the warehouse floor.
	var c := grid.cell_at(x, z)
	return YARD_LIFT if c >= 0 and grid.ground[c] == CityGrid.G_YARD else 0.0


func _build_deck() -> void:
	## The pallet the castle stands on: deck boards (with gaps you can see under) drawn with
	## the floor's material, so the baked shadows, the soot and the fire light fall on them.
	## The blocks under its edge are a Blender model (castle_pallet).
	var c0 := Balance.block_start(3)
	var sz := Balance.block_start(5) + Balance.BLOCK - c0
	var x0 := grid.origin.x + c0 * Balance.CELL
	var x1 := x0 + sz * Balance.CELL
	var z0 := grid.origin.y + c0 * Balance.CELL - 0.04
	var z1 := grid.origin.y + (c0 + sz) * Balance.CELL + 0.04
	var top := YARD_LIFT
	var bot := YARD_LIFT - 0.04
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var k0 := int(floor(x0 / 0.9)) - 1
	var k1 := int(ceil(x1 / 0.9)) + 1
	for k in range(k0, k1):
		var bx0 := maxf(x0, k * 0.9 + 0.035)
		var bx1 := minf(x1, k * 0.9 + 0.855)
		if bx1 - bx0 < 0.05:
			continue
		var quads := [
			[Vector3(bx0, top, z0), Vector3(bx1, top, z0), Vector3(bx1, top, z1), Vector3(bx0, top, z1), Vector3.UP],
			[Vector3(bx0, bot, z0), Vector3(bx0, top, z0), Vector3(bx0, top, z1), Vector3(bx0, bot, z1), Vector3.LEFT],
			[Vector3(bx1, top, z0), Vector3(bx1, bot, z0), Vector3(bx1, bot, z1), Vector3(bx1, top, z1), Vector3.RIGHT],
			[Vector3(bx0, bot, z1), Vector3(bx0, top, z1), Vector3(bx1, top, z1), Vector3(bx1, bot, z1), Vector3.BACK],
			[Vector3(bx1, bot, z0), Vector3(bx1, top, z0), Vector3(bx0, top, z0), Vector3(bx0, bot, z0), Vector3.FORWARD],
		]
		for q in quads:
			st.set_normal(q[4])
			for idx in [0, 1, 2, 0, 2, 3]:
				st.add_vertex(q[idx])
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = floor_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mi)


func _build_lawn_corners() -> void:
	## Construction paper doesn't lie flat: some corners of the lawn sheets have lifted.
	## Small curled triangles at the sheets' outside corners, drawn with the floor's
	## material so they're the same paper.
	var n := grid.n
	var r := RandomNumberGenerator.new()
	r.seed = Balance.WORLD_SEED + 31
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var count := 0
	for y in range(1, n - 1):
		for x in range(1, n - 1):
			if grid.ground[x + y * n] != CityGrid.G_LAWN:
				continue
			for d in [Vector2i(-1, -1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(1, 1)]:
				if grid.ground[x + d.x + y * n] == CityGrid.G_LAWN or grid.ground[x + (y + d.y) * n] == CityGrid.G_LAWN:
					continue
				if grid.sid[x + y * n] >= 0 or r.randf() > 0.5:
					continue
				# The corner point, and the two edges running back into the sheet from it.
				var corner := grid.origin + Vector2(x + (1 if d.x > 0 else 0), y + (1 if d.y > 0 else 0)) * Balance.CELL
				var ex := Vector2(-d.x, 0)
				var ez := Vector2(0, -d.y)
				var L := r.randf_range(0.22, 0.34)
				var lift := r.randf_range(0.025, 0.06)
				var g := 4
				var pts := {}
				for i in g + 1:
					for j in g + 1 - i:
						var u := float(i) / g
						var v := float(j) / g
						var p := corner + (ex * u + ez * v) * L
						var t := maxf(0.0, 1.0 - (u + v))
						pts[Vector2i(i, j)] = Vector3(p.x, 0.003 + lift * t * t, p.y)
				for i in g:
					for j in g - i:
						var tris := [[Vector2i(i, j), Vector2i(i + 1, j), Vector2i(i, j + 1)]]
						if i + j + 1 < g:
							tris.append([Vector2i(i + 1, j), Vector2i(i + 1, j + 1), Vector2i(i, j + 1)])
						for tri in tris:
							var a: Vector3 = pts[tri[0]]
							var b: Vector3 = pts[tri[1]]
							var c: Vector3 = pts[tri[2]]
							var nrm := (b - a).cross(c - a).normalized()
							if nrm.y < 0.0:
								var tmp := b
								b = c
								c = tmp
								nrm = -nrm
							st.set_normal(nrm)
							st.add_vertex(a)
							st.add_vertex(b)
							st.add_vertex(c)
				count += 1
	if count == 0:
		return
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = floor_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _build_scorch() -> void:
	## The hand-painted scorch decals burnt buildings leave on the floor (one per building,
	## two for a tower that fell: its footprint and the long mark along its fall).
	_scorch = MultiMesh.new()
	_scorch.transform_format = MultiMesh.TRANSFORM_3D
	_scorch.use_colors = true
	_scorch.use_custom_data = true
	var plane := PlaneMesh.new()
	plane.size = Vector2(1, 1)
	_scorch.mesh = plane
	_scorch.instance_count = grid.count * 2 + 8
	_scorch.visible_instance_count = 0
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/scorch_decal.gdshader")
	mat.set_shader_parameter("atlas", load("res://models/scorch.png"))
	mat.render_priority = -1
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = _scorch
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mmi.custom_aabb = AABB(Vector3(grid.origin.x - 8, -1, grid.origin.y - 8), Vector3(grid.n * Balance.CELL + 16, 3, grid.n * Balance.CELL + 16))
	add_child(mmi)


func _scorch_decal(at: Vector2, yaw: float, sx: float, sz: float, variant: int) -> void:
	if _scorch_n >= _scorch.instance_count:
		return
	var i := _scorch_n
	_scorch_n += 1
	var y := lift_at(at.x, at.y) + 0.007 + i * 0.000004
	_scorch.set_instance_transform(i, Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3(sx, 1.0, sz)), Vector3(at.x, y, at.y)))
	_scorch.set_instance_color(i, Color.WHITE)
	_scorch.set_instance_custom_data(i, Color(float(variant), 0, 0, 0))
	_scorch.visible_instance_count = _scorch_n


func _add_scorch(s: int) -> void:
	var k := grid.s_kind[s]
	var c: Vector2 = grid.s_center[s]
	var v := grid.s_vary[s]
	var foot := maxf(_he[s], _hez[s]) * 2.0
	var yaw := v * TAU * 3.0
	if grid.s_fall[s] == CityGrid.CRUMPLE:
		var small := k in [Balance.CAR, Balance.TREE, Balance.TRUCK]
		var size := foot / (0.42 if small else 0.62)
		var variant := (6 + int(v * 7.0) % 2) if small else int(v * 13.0) % 4
		var stretch := Vector2(_he[s], _hez[s]) / maxf(0.01, maxf(_he[s], _hez[s]))
		if small:
			stretch = Vector2.ONE
		_scorch_decal(c, yaw if small else float(grid.s_rot[s]) * PI * 0.5 + (v - 0.5) * 0.4,
			size * maxf(stretch.x, 0.7), size * maxf(stretch.y, 0.7), variant)
		return
	# A tower that fell: a mark where it stood, and a long one along the way it fell.
	var d: Vector2i = CityGrid.FALL_DIRS[grid.s_fall[s]]
	var r: Rect2i = grid.s_rect[s]
	var along := (r.size.x if d.x != 0 else r.size.y) * Balance.CELL
	var across := (r.size.y if d.x != 0 else r.size.x) * Balance.CELL
	_scorch_decal(c, yaw, foot / 0.62, foot / 0.62, int(v * 13.0) % 4)
	var start := c - Vector2(d) * along * 0.5
	var stop := c + Vector2(d) * (along * 0.5 + grid.s_height[s])
	var mid := (start + stop) * 0.5
	var fyaw := -atan2(float(d.y), float(d.x)) + (v - 0.5) * 0.1
	_scorch_decal(mid, fyaw, start.distance_to(stop) * 1.05, across * 2.1, 4 + int(v * 7.0) % 2)


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
		var sy := clampf(along * 0.3 / 0.5, 0.45, 1.25)
		var yaw: float = [0.0, PI, -PI * 0.5, PI * 0.5][f]
		var pivot := c + Vector2(d) * along * 0.5
		xf = Transform3D(Basis(Vector3.UP, yaw) * Basis.from_scale(Vector3(sx, sy, sz)), Vector3(pivot.x, 0.0, pivot.y))
	xf.origin.y = lift_at(xf.origin.x, xf.origin.z) if grid.s_zone[s] == 3 else 0.0
	mm.set_instance_transform(at, xf)
	mm.set_instance_color(at, Color.WHITE)
	mm.set_instance_custom_data(at, Color(landed, grid.s_vary[s], 0.0, 0.0))
	_add_scorch(s)


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


func raze(list: Array) -> void:
	## Lay the rubble of things razed at once (the ending's stragglers, out of shot).
	for s in list:
		_char[s] = 1.0
		_write(s, now - 60.0)
		_scorch_fall(s)
		_place_rubble(s, now - 999.0)
	_refresh_heights(Rect2i(0, 0, grid.n, grid.n))
	for i in grid.n * grid.n:
		_update_shadow(i)
	_burn_tex.update(_burn_img)


func _scorch_fall(s: int) -> void:
	# Only a faint soot here: the painted decal (_add_scorch) is the scorch mark itself.
	for c in grid.s_cells[s]:
		_set_burn(c, 0.4, -1.0)
	if grid.s_fall[s] != CityGrid.CRUMPLE:
		var strip := grid.fall_strip(s)
		for y in range(maxi(0, strip.position.y), mini(grid.n, strip.end.y)):
			for x in range(maxi(0, strip.position.x), mini(grid.n, strip.end.x)):
				_set_burn(x + y * grid.n, 0.3, -1.0)


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
		_set_burn(c, 0.5, 1.0)
		_glow.erase(c)
	for c in debris_out:
		_glow[c] = now
		_set_debris_burning(c, false)


func impact_point(s: int) -> Vector3:
	var c: Vector2 = grid.s_center[s]
	if grid.s_fall[s] != CityGrid.CRUMPLE:
		var d: Vector2i = CityGrid.FALL_DIRS[grid.s_fall[s]]
		c += Vector2(d) * grid.s_height[s] * 0.55
	return Vector3(c.x, 0.15 + lift_at(c.x, c.y), c.y)


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
	var s := _rng.randf_range(0.55, 0.95)
	_debris.set_instance_transform(at, Transform3D(Basis(Vector3.UP, _rng.randf() * TAU).scaled(Vector3(s, s, s)), Vector3(p.x, lift_at(p.x, p.y), p.y)))
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
	spark_mat = ShaderMaterial.new()
	spark_mat.shader = load("res://shaders/sparks.gdshader")
	_sparks = MultiMesh.new()
	_sparks.transform_format = MultiMesh.TRANSFORM_3D
	_sparks.use_custom_data = true
	_sparks.mesh = quad
	_sparks.instance_count = MAX_SPARKS
	_sparks.visible_instance_count = 0
	var kmi := MultiMeshInstance3D.new()
	kmi.multimesh = _sparks
	kmi.material_override = spark_mat
	kmi.custom_aabb = whole
	kmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(kmi)
	_buf.resize(MAX_FLAMES * 16)
	_smoke_buf.resize(MAX_SMOKE * 16)
	_spark_buf.resize(MAX_SPARKS * 16)
	for _i in 4:
		lights.append([Vector3(0, -100, 0), 0.0])
	_push_lights()


func set_wind(w: Vector2) -> void:
	flame_mat.set_shader_parameter("wind", w)
	smoke_mat.set_shader_parameter("wind", w)
	spark_mat.set_shader_parameter("wind", w)


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


static func _vseed(variant: int, r: float) -> float:
	## The flame shader picks its shape from the seed (floor(seed * 6)): pick one on purpose,
	## keeping the rest of the seed free so neighbours don't flicker in step.
	return (float(variant) + 0.06 + 0.88 * fmod(absf(r), 1.0)) / 6.0


static func _h(x: float) -> float:
	return fmod(absf(sin(x * 12.9898) * 43758.5453), 1.0)


func update_fire(cam: Vector3) -> void:
	## Rebuild the flames, smoke and sparks from what's burning (once per fire tick).
	## Each building gets ONE big flame cluster rooted on its roof where it's alight (two or
	## three along a long wall), a few licks on its roof edges and, once it's well alight,
	## out of the windows on the side facing you; a column of tissue smoke leaning with
	## the fans; sparks. Burning scraps on the floor get fewer, larger, low flames.
	var nf := 0
	var ns := 0
	var nk := 0
	var n := grid.n
	var cands: Array = []
	var cam2 := Vector2(cam.x, cam.z)
	for s in grid.burning:
		var k := grid.s_kind[s]
		var fire := grid.s_fire[s]
		var grow := 0.45 + 0.55 * fire
		var base := lift_at(grid.s_center[s].x, grid.s_center[s].y) if grid.s_zone[s] == 3 else 0.0
		var h := grid.s_height[s] * (0.6 + 0.4 * grid.s_integ[s])
		var order: PackedInt32Array = grid.s_order[s]
		var on := grid.flames_on(s)
		var frac := float(on) / float(maxi(1, order.size()))
		var sc: Vector2 = grid.s_center[s]
		var vary := grid.s_vary[s]
		var hx: float = _he[s]
		var hz: float = _hez[s]
		var foot := maxf(hx, hz) * 2.0
		var thin := minf(hx, hz) * 2.0
		var style := flame_style
		var mid := sc
		if on > 0:
			mid = sc.lerp(grid.cell_center(order[mini(on - 1, order.size() - 1) / 2]), 0.6)
		mid.x = clampf(mid.x, sc.x - hx * 0.6, sc.x + hx * 0.6)
		mid.y = clampf(mid.y, sc.y - hz * 0.6, sc.y + hz * 0.6)
		var small := k in [Balance.HOUSE, Balance.CAR, Balance.TREE, Balance.TRUCK]
		var size_k := 0.82 if small else 0.95
		# 1. The cluster: one big flame; a long wall gets two or three along its length.
		var clusters := 1 if foot < thin * 1.8 else (2 if foot < thin * 3.2 else 3)
		var main_w := clampf(minf(foot / clusters * 1.15, thin * 1.6) * (0.78 + 0.32 * frac), 0.45, 6.0) * grow * size_k
		var long_x := hx >= hz
		for ci in clusters:
			if nf >= MAX_FLAMES - 8:
				break
			var t := 0.0 if clusters == 1 else (float(ci) / float(clusters - 1) - 0.5) * 1.3
			var p := mid if clusters == 1 else sc + (Vector2(hx * t, 0.0) if long_x else Vector2(0.0, hz * t))
			var w := main_w * (1.0 if ci == 0 else 0.86)
			var sy := w * 1.62
			_put(_buf, nf, Vector3(p.x, base + h - sy * 0.11, p.y), w, sy, Color(_vseed(int(vary * 7.0 + ci) % 2, vary * 3.1 + ci * 0.37), fire, style, 1.0 if ci == 0 else 0.6))
			nf += 1
		# 2. Licks on the roof edges where it's alight.
		var licks := 1 + int(frac * 2.6)
		for li in licks:
			if nf >= MAX_FLAMES - 6:
				break
			var u := fmod(vary * 3.7 + li * 0.37, 1.0)
			var per := 2.0 * (hx + hz)
			var along := u * per
			var e := Vector2.ZERO
			if along < 2.0 * hx:
				e = Vector2(-hx + along, -hz)
			elif along < 2.0 * hx + 2.0 * hz:
				e = Vector2(hx, -hz + (along - 2.0 * hx))
			elif along < 4.0 * hx + 2.0 * hz:
				e = Vector2(hx - (along - 2.0 * hx - 2.0 * hz), hz)
			else:
				e = Vector2(-hx, hz - (along - 4.0 * hx - 2.0 * hz))
			var lw := main_w * (0.42 + 0.22 * _h(vary + li))
			var lsy := lw * 1.9
			var lp := sc + e * 0.96
			_put(_buf, nf, Vector3(lp.x, base + h - lsy * 0.12, lp.y), lw, lsy, Color(_vseed(2 + (li + int(vary * 5.0)) % 2, vary * 5.3 + li * 0.21), fire * 0.9, style, 0.0))
			nf += 1
		# 3. Once it's well alight, flames lick up the corners on the side facing the giant,
		#    low down where the burn front starts (rooted on the edge, never floating off a
		#    flat wall).
		if h > 1.3 and fire > 0.6 and grid.s_integ[s] < 0.75:
			var to_cam := cam2 - sc
			var sx := signf(to_cam.x) if absf(to_cam.x) > 0.01 else 1.0
			var sz := signf(to_cam.y) if absf(to_cam.y) > 0.01 else 1.0
			var corners := [Vector2(sx * hx, sz * hz), Vector2(-sx * hx, sz * hz) if absf(to_cam.y) * hx > absf(to_cam.x) * hz else Vector2(sx * hx, -sz * hz)]
			var n_c := 1 if fire < 0.75 else 2
			for wi in n_c:
				if nf >= MAX_FLAMES - 4:
					break
				var cp2: Vector2 = sc + (corners[wi] as Vector2) * 0.99
				var wy := h * (0.03 + 0.14 * _h(vary * 4.3 + wi * 0.77))
				var ww := main_w * (0.36 + 0.1 * _h(vary + wi * 2.0))
				var wsy := ww * 1.9
				_put(_buf, nf, Vector3(cp2.x, base + wy - wsy * 0.15, cp2.y), ww, wsy, Color(_vseed(2 + wi % 2, vary * 7.7 + wi * 0.29), fire * 0.85, style, 0.0))
				nf += 1
		# The smoke: a column of torn tissue from the cluster, leaning the way the fans blow.
		var puffs := 5 + 3 * int(foot > 1.2) + 4 * int(foot > 2.0) + 4 * int(foot > 3.5)
		var g := clampf((0.32 + 0.3 * foot) * (0.55 + 0.45 * fire), 0.28, 2.4)
		for pi in puffs:
			if ns >= MAX_SMOKE:
				break
			var off := Vector2(_h(vary * 3.1 + pi) - 0.5, _h(vary * 5.7 + pi) - 0.5) * foot * 0.25
			_put(_smoke_buf, ns, Vector3(mid.x + off.x, base + h + 0.1, mid.y + off.y), 1.0, 1.0,
				Color(fmod(vary * 0.71 + float(pi) / float(puffs), 1.0), g * (0.8 + 0.4 * _h(vary + pi * 3.0)), 0.45 + 0.45 * fire, 0.25 + 0.5 * vary))
			ns += 1
		var d2 := Vector3(sc.x, h, sc.y).distance_squared_to(cam)
		# Sparks for the fires near the giant.
		if d2 < 900.0:
			var sparks := clampi(3 + int(foot * 2.0), 3, 10)
			for si in sparks:
				if nk >= MAX_SPARKS:
					break
				_put(_spark_buf, nk, Vector3(mid.x, base + h * 0.92, mid.y), 1.0, 1.0,
					Color(fmod(vary * 1.37 + si * 0.137, 1.0), 0.55 + 0.45 * fire, foot * 0.45, 1.1 + foot * 0.9))
				nk += 1
			cands.append([Vector3(sc.x, base + h * 0.6 + 0.3, sc.y), (1.0 + foot * 0.8) * fire, d2])
	# Burning scraps on the floor: one low flame per 1.5 m patch, sized by how much is burning there.
	var patches := {}
	for dc in grid.debris:
		var c: int = dc
		var key: int = (c % n) / 3 + ((c / n) / 3) * 1000
		var e: Array = patches.get(key, [])
		if e.is_empty():
			patches[key] = [c, 1, grid.deb_fuel[c]]
		else:
			e[1] = int(e[1]) + 1
			e[2] = maxf(float(e[2]), grid.deb_fuel[c])
	var pk := 0
	for key in patches:
		if nf >= MAX_FLAMES:
			break
		var e: Array = patches[key]
		var c: int = e[0]
		var fuel := clampf(float(e[2]) / 3.0, 0.3, 1.0)
		if int(e[1]) < 2 and fuel < 0.6:
			continue
		var seed := _h(float(c) * 0.7548776)
		var cp := grid.cell_center(c) + Vector2(0.25, 0.25) + Vector2(seed - 0.5, _h(seed * 5.3) - 0.5) * 0.3
		var w := minf(1.4, (0.5 + 0.12 * float(e[1])) * fuel)
		var lift := lift_at(cp.x, cp.y)
		_put(_buf, nf, Vector3(cp.x, lift - w * 0.08, cp.y), w, w * 1.45, Color(_vseed(4 + (c % 2), seed), fuel * 0.75, flame_style, 0.0))
		nf += 1
		pk += 1
		if ns < MAX_SMOKE and pk % 3 == 0:
			_put(_smoke_buf, ns, Vector3(cp.x, lift + 0.25, cp.y), 1.0, 1.0, Color(seed, 0.35 + 0.2 * fuel, 0.8, 0.5))
			ns += 1
		if nk < MAX_SPARKS and pk % 4 == 1 and Vector2(cp.x, cp.y).distance_squared_to(cam2) < 400.0:
			_put(_spark_buf, nk, Vector3(cp.x, lift + 0.1, cp.y), 1.0, 1.0, Color(seed, 0.5 * fuel, 0.3, 0.8))
			nk += 1
	_flames.buffer = _buf
	_flames.visible_instance_count = nf
	_smoke.buffer = _smoke_buf
	_smoke.visible_instance_count = ns
	_sparks.buffer = _spark_buf
	_sparks.visible_instance_count = nk
	_pool_lights(cands)


func spark_count() -> int:
	return _sparks.visible_instance_count


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
		var p := Gfx.particles(40, 0.07, [Color(1, 0.7, 0.3, 1), Color(1, 0.45, 0.1, 0.95), Color(0.6, 0.15, 0.05, 0.0)], false, Gfx.speck())
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
