class_name Models
extends RefCounted
## Every 3D model in the game comes from Blender: the scripts in art/blender/
## build them and export models/*.glb (see NOTES.md, "Art bible"). This loads
## those files once and hands out their meshes by name.
##
## Vertex colours carry the baked detail (AO, gradients, highlights) in linear
## colour; vertex alpha says what a part is (shaders/plant.gdshader):
##   1 = foliage, 0.5 = glow (mint curse knots, lit windows, lanterns), 0 = the rest.

const LEAF := 1.0
const GLOW := 0.5
const BARK := 0.0

# Size variants per kind (small, medium, large). The view picks one per cell from
# the cell's `vary` value, and ForestGrid.plant_height() uses VARIANT_HEIGHT.
const VARIANTS := {
	Balance.GRASS: ["grass"],
	Balance.BUSH: ["bush"],
	Balance.PINE: ["pine_s", "pine_m", "pine_l"],
	Balance.OAK: ["oak_s", "oak_m", "oak_l"],
	Balance.GIANT: ["giant_a", "giant_b"],
	Balance.ELDER: ["elder"],
}
const VARIANT_HEIGHT := {
	Balance.PINE: [0.78, 1.0, 1.3],
	Balance.OAK: [0.8, 1.0, 1.24],
	Balance.GIANT: [1.0, 1.1],
}
const FLOWERS := ["poppy", "oxeye_daisy", "buttercup", "harebell", "sage_tuft"]

static var _cache := {}
static var _files := {}


static func clear_cache() -> void:
	_cache.clear()
	_files.clear()


static func mesh(file: String, name: String) -> Mesh:
	## A mesh from models/<file>.glb by its Blender object name.
	var key := file + "/" + name
	if _cache.has(key):
		return _cache[key]
	if not _files.has(file):
		var found := {}
		var scene: PackedScene = load("res://models/%s.glb" % file)
		if scene != null:
			var inst := scene.instantiate()
			_collect(inst, found)
			inst.free()
		_files[file] = found
	var m: Mesh = _files[file].get(name)
	if m == null:
		push_warning("Model not found: %s/%s" % [file, name])
		m = BoxMesh.new()
	_cache[key] = m
	return m


static func _collect(n: Node, out: Dictionary) -> void:
	if n is MeshInstance3D and (n as MeshInstance3D).mesh != null:
		out[str(n.name)] = (n as MeshInstance3D).mesh
	for c in n.get_children():
		_collect(c, out)


# --- The forest ----------------------------------------------------------------------
static func variant_count(kind: int) -> int:
	return (VARIANTS[kind] as Array).size() if VARIANTS.has(kind) else 1


static func variant_of(kind: int, vary: float) -> int:
	## Which size a cell grows: mostly medium, some small, a few big old ones.
	match kind:
		Balance.PINE, Balance.OAK:
			return 0 if vary < 0.3 else (1 if vary < 0.78 else 2)
		Balance.GIANT:
			return 0 if vary < 0.55 else 1
	return 0


static func variant_height(kind: int, vary: float) -> float:
	if not VARIANT_HEIGHT.has(kind):
		return 1.0
	return float(VARIANT_HEIGHT[kind][variant_of(kind, vary)])


static func plant_mesh(kind: int, variant: int = 0) -> Mesh:
	var names: Array = VARIANTS[kind]
	return mesh("forest", names[clampi(variant, 0, names.size() - 1)])


static func flower_mesh(species: int) -> Mesh:
	return mesh("meadow", FLOWERS[species])


static func boulder_mesh() -> Mesh:
	return mesh("forest", "boulder")


static func far_tree(oak: bool) -> Mesh:
	return mesh("forest", "far_oak" if oak else "far_pine")


static func prop(name: String) -> Mesh:
	return mesh("village", name)


# --- The fire-keeper, tools, helpers, critters ----------------------------------------
static func keeper_part(name: String) -> Mesh:
	## body, head, hood, hand, foot, lantern (see Keeper._build_model()).
	return mesh("keeper", "k_" + name)


static func tool_mesh(i: int, sparkler: bool) -> Mesh:
	## What the keeper holds. The flame end points along +Z, the grip at the origin.
	if i == 0 and sparkler:
		return mesh("tools", "tool_0s")
	return mesh("tools", "tool_%d" % clampi(i, 0, 5))


static func tool_tip(i: int) -> Vector3:
	## Where the flame comes out, in the tool's own space.
	match i:
		0:
			return Vector3(0, 0, 0.47)
		1:
			return Vector3(-0.015, 0.0, 0.19)
		2:
			return Vector3(0, 0, 0.97)
		3:
			return Vector3(0, -0.06, 0.74)
		4:
			return Vector3(0, 0.0, 0.4)
	return Vector3(0, 0, 1.0)


static func creature(name: String) -> Mesh:
	## sprite, salamander, salamander_leg, rabbit, fox, hedgehog
	return mesh("creatures", name)
