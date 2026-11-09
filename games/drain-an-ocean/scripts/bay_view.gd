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
	kelp_mat.set_shader_parameter("grid_origin", Vector2(bay.x0, bay.z0))
	kelp_mat.set_shader_parameter("cell", bay.s)
	_build_terrain()
	_build_water()
	_build_frame()
	_build_sea()
	refresh(0.0, true)


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
				cols[v] = Color8(bay.colors[v * 3], bay.colors[v * 3 + 1], bay.colors[v * 3 + 2])
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


func _far_height(x: float, z: float) -> float:
	## The land and sea floor beyond the bay: the coast runs east-west along
	## the sea wall's line; hills rise behind the town.
	var coast := -58.0 + 6.0 * sin(x * 0.021) + 4.0 * sin(x * 0.047 + 1.3)
	if z < coast:
		return -7.0 - (coast - z) * 0.05
	var inland := z - coast
	return 2.0 + minf(inland * 0.05, 7.0) + 2.2 * sin(x * 0.033) * sin(z * 0.029 + 0.7)


func _build_frame() -> void:
	## Rings extruded outward from the grid's edge loop, blending from the
	## edge's own heights to the far land and sea.
	var w := bay.w
	var loop: Array = []          # edge vertices round the square, clockwise from above
	for i in w:
		loop.append(i)                         # north edge, west to east
	for j in range(1, w):
		loop.append(j * w + (w - 1))           # east edge, north to south
	for i in range(w - 2, -1, -1):
		loop.append((w - 1) * w + i)           # south edge, east to west
	for j in range(w - 2, 0, -1):
		loop.append(j * w)                     # west edge, south to north
	var cx := bay.x0 + bay.n * bay.s * 0.5
	var cz := bay.z0 + bay.n * bay.s * 0.5
	var half := bay.n * bay.s * 0.5
	var offsets := [0.0, 3.0, 8.0, 18.0, 36.0, 70.0, 140.0, 300.0]
	var verts := PackedVector3Array()
	var cols := PackedColorArray()
	var grass := Color("#7c8a5e")
	var sea_floor := Color("#5e6a5a")
	for r in offsets.size():
		var off: float = offsets[r]
		var t := smoothstep(0.0, 34.0, off)
		for v in loop:
			var p := bay.vertex_xz(v)
			var d := Vector2(p.x - cx, p.y - cz)
			# Outward direction: square-ish (corners go diagonally).
			var dir := Vector2(signf(d.x) if absf(d.x) >= half - 0.01 else 0.0, signf(d.y) if absf(d.y) >= half - 0.01 else 0.0)
			if dir == Vector2.ZERO:
				dir = d.normalized()
			var q := p + dir.normalized() * off * (1.41 if absf(dir.x) > 0 and absf(dir.y) > 0 else 1.0)
			var eh := bay.h[v]
			var y := lerpf(eh, _far_height(q.x, q.y), t)
			if r == 0:
				y = eh
			verts.append(Vector3(q.x, y, q.y))
			var ec := Color8(bay.colors[v * 3], bay.colors[v * 3 + 1], bay.colors[v * 3 + 2])
			var fc := grass if y > 0.6 else sea_floor
			cols.append(ec.lerp(fc, t))
	var n := loop.size()
	var idx := PackedInt32Array()
	for r in offsets.size() - 1:
		for k in n:
			var a := r * n + k
			var b := r * n + (k + 1) % n
			var c := (r + 1) * n + k
			var e := (r + 1) * n + (k + 1) % n
			idx.append_array([a, c, b, b, c, e])
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in verts.size():
		st.set_color(cols[i])
		st.set_uv(Vector2(-1.0, -1.0))
		st.add_vertex(verts[i])
	for i in idx:
		st.add_index(i)
	st.generate_normals()
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.name = "Land"
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.vertex_color_is_srgb = true
	mat.roughness = 0.95
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = mat
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
