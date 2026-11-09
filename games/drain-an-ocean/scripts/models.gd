class_name Models
extends RefCounted
## The Blender-made models (art/blender/*.py -> models/*.glb). instance(name)
## gives a fresh copy. Their materials are flat palette colours multiplied by
## a baked vertex colour (ambient occlusion and painted wear), so vertex
## colours are switched on for every material here.

static var _scenes := {}
static var _fixed := {}
static var _flat := {}
static var tint := ""                # "", "brass": premium pump livery


static func exists(name: String) -> bool:
	return ResourceLoader.exists("res://models/%s.glb" % name)


static func instance(name: String) -> Node3D:
	if not _scenes.has(name):
		_scenes[name] = load("res://models/%s.glb" % name) if exists(name) else null
	var scene: PackedScene = _scenes[name]
	if scene == null:
		return _stand_in(name)
	var n := scene.instantiate() as Node3D
	_fix(n)
	return n


static func _stand_in(name: String) -> Node3D:
	# Only while a model hasn't been built yet: a small marker box.
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.6, 0.6, 0.6)
	mi.mesh = bm
	mi.material_override = flat(Color("#e0603f"))
	mi.name = "StandIn_" + name
	var root := Node3D.new()
	root.add_child(mi)
	return root


static func _fix(n: Node) -> void:
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		var mesh := mi.mesh
		if mesh != null:
			for s in mesh.get_surface_count():
				var m := mesh.surface_get_material(s)
				if m is StandardMaterial3D:
					var key := m.get_instance_id()
					if not _fixed.has(key):
						var sm := m as StandardMaterial3D
						sm.vertex_color_use_as_albedo = true
						if sm.emission_enabled:
							sm.emission_energy_multiplier = maxf(sm.emission_energy_multiplier, 1.5)
						_fixed[key] = true
	for c in n.get_children():
		_fix(c)


static func flat(c: Color, rough: float = 0.85, metal: float = 0.0, emit: float = 0.0) -> StandardMaterial3D:
	## A plain palette material for small bits built in code (hoses, ropes).
	var key := "%s/%s/%s/%s" % [c, rough, metal, emit]
	if not _flat.has(key):
		var m := StandardMaterial3D.new()
		m.albedo_color = c
		m.roughness = rough
		m.metallic = metal
		if emit > 0.0:
			m.emission_enabled = true
			m.emission = c
			m.emission_energy_multiplier = emit
		_flat[key] = m
	return _flat[key]


static func find(n: Node, name: String) -> Node3D:
	## A named part (a pump's "Lever", a wheel, a pelican's "Wings").
	if n.name == name:
		return n as Node3D
	for c in n.get_children():
		var r := find(c, name)
		if r != null:
			return r
	return null


static func first_mesh(n: Node) -> Mesh:
	if n is MeshInstance3D:
		return (n as MeshInstance3D).mesh
	for c in n.get_children():
		var m := first_mesh(c)
		if m != null:
			return m
	return null


static func clear_caches() -> void:
	_scenes.clear()
	_fixed.clear()
	_flat.clear()
