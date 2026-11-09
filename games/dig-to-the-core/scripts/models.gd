class_name Models
extends RefCounted
## The Blender-made models (art/blender/*.py -> models/*.glb).
## instance("shack") gives a fresh copy. Their materials are flat palette
## colours, multiplied by a baked vertex colour (ambient occlusion and edge
## wear), so vertex colours are switched on here for every material.

static var _scenes := {}
static var _fixed := {}


static func instance(name: String) -> Node3D:
	if not _scenes.has(name):
		_scenes[name] = load("res://models/%s.glb" % name)
	var scene: PackedScene = _scenes[name]
	var n := scene.instantiate() as Node3D
	_fix(n)
	return n


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


static func find(n: Node, name: String) -> Node3D:
	## A named part (a drill's "Bit", a mole's "Claws", the lift's "Sheave").
	if n.name == name:
		return n as Node3D
	for c in n.get_children():
		var r := find(c, name)
		if r != null:
			return r
	return null
