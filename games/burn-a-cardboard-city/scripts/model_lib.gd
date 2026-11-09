class_name ModelLib
extends RefCounted
## The Blender-made models (models/*.glb, built by art/blender/build_all.py), by name.
## Every model has a "card" surface (vertex colours: paint x baked AO, alpha = material)
## and a "decal" surface (marker ink from models/marker_sheet.png). City structures get
## the burning/collapsing shaders; props, helpers and tools get plain ones.

const FILES := ["houses", "offices", "skyscrapers", "castle", "vehicles", "helpers", "trees", "props", "tools"]

static var _meshes := {}
static var _city := {}
static var _props := {}
static var card_mat: ShaderMaterial
static var ink_mat: ShaderMaterial
static var prop_mat: ShaderMaterial
static var sheet: Texture2D


static func _load() -> void:
	if not _meshes.is_empty():
		return
	sheet = load("res://models/marker_sheet.png")
	card_mat = ShaderMaterial.new()
	card_mat.shader = load("res://shaders/cardboard.gdshader")
	ink_mat = ShaderMaterial.new()
	ink_mat.shader = load("res://shaders/marker.gdshader")
	ink_mat.set_shader_parameter("sheet", sheet)
	ink_mat.render_priority = 1
	prop_mat = ShaderMaterial.new()
	prop_mat.shader = load("res://shaders/prop.gdshader")
	var ink := StandardMaterial3D.new()
	ink.albedo_texture = sheet
	ink.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ink.cull_mode = BaseMaterial3D.CULL_BACK
	ink.roughness = 0.8
	ink.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_ink_std = ink
	for f in FILES:
		var ps := load("res://models/%s.glb" % f) as PackedScene
		if ps == null:
			push_warning("ModelLib: missing models/%s.glb" % f)
			continue
		var root := ps.instantiate()
		_collect(root)
		root.free()


static var _ink_std: StandardMaterial3D


static func _collect(node: Node) -> void:
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		_meshes[String(node.name)] = (node as MeshInstance3D).mesh
	for c in node.get_children():
		_collect(c)


static func has(name: String) -> bool:
	_load()
	return _meshes.has(name)


static func raw(name: String) -> Mesh:
	_load()
	return _meshes.get(name)


static func _with(name: String, card: Material, ink: Material) -> Mesh:
	var src: Mesh = raw(name)
	if src == null:
		push_warning("ModelLib: no model called %s" % name)
		return BoxMesh.new()
	var m := src.duplicate() as Mesh
	for i in m.get_surface_count():
		var mat := m.surface_get_material(i)
		var is_ink := mat != null and String(mat.resource_name).begins_with("decal")
		m.surface_set_material(i, ink if is_ink else card)
	return m


static func city_mesh(name: String) -> Mesh:
	## For MultiMeshes of structures: burns, chars and falls with its instance data.
	_load()
	if not _city.has(name):
		_city[name] = _with(name, card_mat, ink_mat)
	return _city[name]


static func prop_mesh(name: String, card: Material = null) -> Mesh:
	_load()
	if card != null:
		return _with(name, card, _ink_std)
	if not _props.has(name):
		_props[name] = _with(name, prop_mat, _ink_std)
	return _props[name]


static func prop_material() -> ShaderMaterial:
	## A fresh copy of the prop material (for one that needs its own tint or glow).
	_load()
	return prop_mat.duplicate() as ShaderMaterial


static func set_time(now: float) -> void:
	if card_mat != null:
		card_mat.set_shader_parameter("now", now)
		ink_mat.set_shader_parameter("now", now)


static func clear() -> void:
	_meshes.clear()
	_city.clear()
	_props.clear()
	card_mat = null
	ink_mat = null
	prop_mat = null
	_ink_std = null
	sheet = null
