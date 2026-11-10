class_name BayView
extends Node3D
## Draws the bay: the seabed mesh, every body of water in one mesh, the land
## around it (a frame extruded from the grid's edge, so there's no seam), and
## the open sea beyond the wall. The Bay's per-vertex body slots and drained
## times go to the GPU as two small textures, rebuilt only when the bodies
## change (a split or an emptied pool); levels go up as a uniform array
## every frame.

const TERRAIN_SHADER := preload("res://shaders/terrain.gdshader")
const WATER_SHADER := preload("res://shaders/water.gdshader")
const SEA_SHADER := preload("res://shaders/sea.gdshader")
const KELP_SHADER := preload("res://shaders/kelp.gdshader")

var bay: Bay
var terrain_mat: ShaderMaterial
var water_mat: ShaderMaterial
var sea_mat: ShaderMaterial
var kelp_mat: ShaderMaterial
var body_img: Image
var body_tex: ImageTexture
var drained_img: Image
var drained_tex: ImageTexture
var terrain: MeshInstance3D
var water: MeshInstance3D
var _topo := -1


func setup(b: Bay) -> void:
	bay = b
	body_img = Image.create_from_data(bay.w, bay.w, false, Image.FORMAT_R8, bay.draw_slot)
	body_tex = ImageTexture.create_from_image(body_img)
	drained_img = Image.create_from_data(bay.w, bay.w, false, Image.FORMAT_RF, bay.drained_at.to_byte_array())
	drained_tex = ImageTexture.create_from_image(drained_img)
	terrain_mat = ShaderMaterial.new()
	terrain_mat.shader = TERRAIN_SHADER
	water_mat = ShaderMaterial.new()
	water_mat.shader = WATER_SHADER
	water_mat.render_priority = 1
	sea_mat = ShaderMaterial.new()
	sea_mat.shader = SEA_SHADER
	kelp_mat = ShaderMaterial.new()
	kelp_mat.shader = KELP_SHADER
	for m in [terrain_mat, water_mat, kelp_mat]:
		m.set_shader_parameter("body_tex", body_tex)
		m.set_shader_parameter("grid_w", float(bay.w))
	terrain_mat.set_shader_parameter("drained_tex", drained_tex)
	terrain_mat.set_shader_parameter("under_tint", Color("#8cc7bd"))
	terrain_mat.set_shader_parameter("ink", Color("#1c2a33"))
	water_mat.set_shader_parameter("shallow_col", Color("#4fa89b"))
	water_mat.set_shader_parameter("deep_col", Color("#0f4c5c"))
	water_mat.set_shader_parameter("foam_col", Color("#f3ead3"))
	sea_mat.set_shader_parameter("near_col", Color("#11505d"))
	sea_mat.set_shader_parameter("far_col", Color("#3a7478"))
	var rdir: Array = bay.landmarks.get("ripple_dir", [0.86, -0.51])
	terrain_mat.set_shader_parameter("ripple_dir", Vector2(float(rdir[0]), float(rdir[1])))
	water_mat.set_shader_parameter("mid_col", Color("#2a7779"))
	water_mat.set_shader_parameter("abyss_col", Color("#0a3540"))
	kelp_mat.set_shader_parameter("grid_origin", Vector2(bay.x0, bay.z0))
	kelp_mat.set_shader_parameter("cell", bay.s)
	_build_terrain()
	_build_water()
	_build_frame()
	_build_sea()
	refresh(0.0, true)


func set_sun(dir_to_sun: Vector3, col: Color) -> void:
	for m in [water_mat, sea_mat]:
		m.set_shader_parameter("sun_dir", dir_to_sun)
		m.set_shader_parameter("sun_col", col)


func refresh(game_time: float, force: bool = false) -> void:
	if force or bay.topo_version != _topo:
		_topo = bay.topo_version
		body_img.set_data(bay.w, bay.w, false, Image.FORMAT_R8, bay.draw_slot)
		body_tex.update(body_img)
		drained_img.set_data(bay.w, bay.w, false, Image.FORMAT_RF, bay.drained_at.to_byte_array())
		drained_tex.update(drained_img)
	var lv := bay.slot_levels()
	for m in [terrain_mat, water_mat, kelp_mat]:
		m.set_shader_parameter("levels", lv)
		m.set_shader_parameter("game_time", game_time)
	sea_mat.set_shader_parameter("game_time", game_time)


func _grid_arrays(for_water: bool) -> Array:
	var w := bay.w
	var verts := PackedVector3Array()
	var uvs := PackedVector2Array()
	var uv2 := PackedVector2Array()
	var cols := PackedColorArray()
	var norms := PackedVector3Array()
	verts.resize(w * w)
	uvs.resize(w * w)
	if for_water:
		uv2.resize(w * w)
	else:
		cols.resize(w * w)
		norms.resize(w * w)
	for j in w:
		for i in w:
			var v := j * w + i
			var x := bay.x0 + i * bay.s
			var z := bay.z0 + j * bay.s
			verts[v] = Vector3(x, 0.0 if for_water else bay.h[v], z)
			uvs[v] = Vector2(float(i) / float(w - 1), float(j) / float(w - 1))
			if for_water:
				uv2[v] = Vector2(bay.h[v], 0.0)
			else:
				cols[v] = Color8(bay.colors[v * 4], bay.colors[v * 4 + 1], bay.colors[v * 4 + 2], bay.colors[v * 4 + 3])
				var hl := bay.h[j * w + maxi(i - 1, 0)]
				var hr := bay.h[j * w + mini(i + 1, w - 1)]
				var hu := bay.h[maxi(j - 1, 0) * w + i]
				var hd := bay.h[mini(j + 1, w - 1) * w + i]
				norms[v] = Vector3(hl - hr, 2.0 * bay.s, hu - hd).normalized()
	var idx := PackedInt32Array()
	idx.resize((w - 1) * (w - 1) * 6)
	var k := 0
	for j in w - 1:
		for i in w - 1:
			var a := j * w + i
			var b := a + 1
			var c := a + w
			var e := c + 1
			# Diagonal a-e, the same split Bay.height_at uses; clockwise from above.
			idx[k] = a; idx[k + 1] = b; idx[k + 2] = e
			idx[k + 3] = a; idx[k + 4] = e; idx[k + 5] = c
			k += 6
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = idx
	if for_water:
		arr[Mesh.ARRAY_TEX_UV2] = uv2
		var nn := PackedVector3Array()
		nn.resize(w * w)
		nn.fill(Vector3.UP)
		arr[Mesh.ARRAY_NORMAL] = nn
	else:
		arr[Mesh.ARRAY_COLOR] = cols
		arr[Mesh.ARRAY_NORMAL] = norms
	return arr


func _build_terrain() -> void:
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, _grid_arrays(false))
	terrain = MeshInstance3D.new()
	terrain.name = "Seabed"
	terrain.mesh = m
	terrain.material_override = terrain_mat
	add_child(terrain)


func _build_water() -> void:
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, _grid_arrays(true))
	m.custom_aabb = AABB(Vector3(bay.x0, -30.0, bay.z0), Vector3(bay.n * bay.s, 34.0, bay.n * bay.s))
	water = MeshInstance3D.new()
	water.name = "Water"
	water.mesh = m
	water.material_override = water_mat
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water)


func _build_frame() -> void:
	## The land round the bay: a coarse grid from the same height function as
	## the bay (art/bay/make_bay.py), tucked just under the bay mesh where they
	## overlap so there's never a seam. Hills, the headland's plateau, fields
	## and hedgerows behind the town, the river valley.
	var fd: Dictionary = bay.far
	if fd.is_empty():
		return
	var n := int(fd.n)
	var fw := n + 1
	var fs := float(fd.s)
	var fx0 := float(fd.x0)
	var fz0 := float(fd.z0)
	var hh: PackedFloat32Array = Marshalls.base64_to_raw(fd.heights).to_float32_array()
	var cc: PackedByteArray = Marshalls.base64_to_raw(fd.colors)
	var verts := PackedVector3Array()
	var cols := PackedColorArray()
	var norms := PackedVector3Array()
	verts.resize(fw * fw)
	cols.resize(fw * fw)
	norms.resize(fw * fw)
	for j in fw:
		for i in fw:
			var v := j * fw + i
			verts[v] = Vector3(fx0 + i * fs, hh[v], fz0 + j * fs)
			cols[v] = Color8(cc[v * 3], cc[v * 3 + 1], cc[v * 3 + 2])
			var hl := hh[j * fw + maxi(i - 1, 0)]
			var hr := hh[j * fw + mini(i + 1, fw - 1)]
			var hu := hh[maxi(j - 1, 0) * fw + i]
			var hd := hh[mini(j + 1, fw - 1) * fw + i]
			norms[v] = Vector3(hl - hr, 2.0 * fs, hu - hd).normalized()
	# Skip the cells well inside the bay grid (the bay mesh covers them).
	var bx0 := bay.x0 + fs
	var bz0 := bay.z0 + fs
	var bx1 := bay.x0 + bay.n * bay.s - fs
	var bz1 := bay.z0 + bay.n * bay.s - fs
	var idx := PackedInt32Array()
	for j in fw - 1:
		for i in fw - 1:
			var x0 := fx0 + i * fs
			var z0 := fz0 + j * fs
			if x0 >= bx0 and x0 + fs <= bx1 and z0 >= bz0 and z0 + fs <= bz1:
				continue
			var a := j * fw + i
			var b := a + 1
			var c := a + fw
			var e := c + 1
			idx.append_array([a, b, e, a, e, c])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_COLOR] = cols
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	var mi := MeshInstance3D.new()
	mi.name = "Land"
	mi.mesh = mesh
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/land.gdshader")
	mi.material_override = mat
	add_child(mi)
	_build_river()


func _build_river() -> void:
	## The river behind the weir: still water standing in its valley, out to
	## the edge of the land.
	var lm: Dictionary = bay.landmarks
	if not lm.has("river"):
		return
	var pts: Array = lm.river
	var lvl := float(lm.get("river_level", 0.75))
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var prev_l := Vector3.INF
	var prev_r := Vector3.INF
	var along := 0.0
	var prev_along := 0.0
	for k in pts.size():
		var p := Vector2(float(pts[k][0]), float(pts[k][1]))
		var q := Vector2(float(pts[mini(k + 1, pts.size() - 1)][0]), float(pts[mini(k + 1, pts.size() - 1)][1]))
		var o := Vector2(float(pts[maxi(k - 1, 0)][0]), float(pts[maxi(k - 1, 0)][1]))
		var dir := (q - o).normalized()
		var side := Vector2(-dir.y, dir.x)
		var half := 2.4 + 0.012 * p.distance_to(Vector2(float(pts[0][0]), float(pts[0][1])))
		var l := Vector3(p.x + side.x * half * 1.15, lvl, p.y + side.y * half * 1.15)
		var r := Vector3(p.x - side.x * half * 1.15, lvl, p.y - side.y * half * 1.15)
		if k > 0:
			along += p.distance_to(o if k == 1 else Vector2(float(pts[k - 1][0]), float(pts[k - 1][1])))
		if prev_l != Vector3.INF:
			var uv := {prev_l: Vector2(0, prev_along), prev_r: Vector2(1, prev_along), r: Vector2(1, along), l: Vector2(0, along)}
			for v in [prev_l, prev_r, r, prev_l, r, l]:
				st.set_normal(Vector3.UP)
				st.set_uv(uv[v])
				st.add_vertex(v)
		prev_l = l
		prev_r = r
		prev_along = along
	var mi := MeshInstance3D.new()
	mi.name = "River"
	mi.mesh = st.commit()
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/river.gdshader")
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _build_sea() -> void:
	## The open sea at full height, everywhere north of the sea wall's crest.
	var pm := PlaneMesh.new()
	pm.size = Vector2(1400.0, 700.0)
	pm.subdivide_width = 8
	pm.subdivide_depth = 4
	var mi := MeshInstance3D.new()
	mi.name = "OpenSea"
	mi.mesh = pm
	mi.material_override = sea_mat
	mi.position = Vector3(0.0, 0.0, -57.6 - 350.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func ray_hit(origin: Vector3, dir: Vector3, max_t: float = 600.0) -> Dictionary:
	## Where a ray from the camera first meets the seabed or the water.
	## {"pos", "water": bool, "body": id} or {}.
	var t := 0.0
	var step := 0.5
	var prev_above := true
	while t < max_t:
		var p := origin + dir * t
		if bay.in_bounds(p.x, p.z):
			var g := bay.height_at(p.x, p.z)
			var wl := bay.water_level_at(p.x, p.z)
			var top := maxf(g, wl)
			if p.y <= top:
				# refine
				var lo := t - step
				var hi := t
				for _i in 8:
					var mid := (lo + hi) * 0.5
					var q := origin + dir * mid
					if q.y <= maxf(bay.height_at(q.x, q.z), bay.water_level_at(q.x, q.z)):
						hi = mid
					else:
						lo = mid
				var hp := origin + dir * hi
				var wet := bay.water_level_at(hp.x, hp.z) > bay.height_at(hp.x, hp.z)
				return {"pos": hp, "water": wet, "body": bay.body_at(hp.x, hp.z) if wet else Bay.NO_BODY}
		elif p.y < 0.0 and t > 1.0:
			return {"pos": p, "water": false, "body": Bay.NO_BODY}
		t += step
	return {}
