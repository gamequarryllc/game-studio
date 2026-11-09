class_name Props
extends Node3D
## The bay's scenery, all hand-placed in art/bay/make_bay.py: kelp stands
## (one MultiMesh, swaying under water and slumping when the water leaves),
## coral heads, rocks in threes, the three wrecks, the lost town, the pier and
## the aquarium on the town shore, the lighthouse on the east headland and the
## town's houses.

var bay: Bay
var view: BayView
var wrecks: Array = []           # {"node", "name", "pos", "kind"}
var aquarium_pos := Vector3.ZERO
var pier_head := Vector3.ZERO
var town_nodes: Array = []
var clock_tower: Node3D


func setup(b: Bay, v: BayView) -> void:
	bay = b
	view = v
	var lm: Dictionary = bay.landmarks
	_kelp()
	_scatter("coral", ["coral_brain", "coral_branch", "coral_fan"], 5)
	_scatter("rocks", ["rock_round", "rock_flat"], 5)
	for wd in lm.wrecks:
		var n := Models.instance("wreck_" + str(wd.kind))
		var p := Vector3(float(wd.x), bay.height_at(float(wd.x), float(wd.z)) - 0.25, float(wd.z))
		n.position = p
		n.rotation.y = deg_to_rad(float(wd.yaw))
		n.name = "Wreck_" + str(wd.kind)
		add_child(n)
		wrecks.append({"node": n, "name": str(wd.name), "pos": p, "kind": str(wd.kind)})
	for td in lm.town:
		var n := Models.instance("town_" + str(td.kind))
		n.position = Vector3(float(td.x), bay.height_at(float(td.x), float(td.z)) - 0.1, float(td.z))
		n.rotation.y = deg_to_rad(float(td.yaw))
		add_child(n)
		town_nodes.append(n)
		if str(td.kind) == "clocktower":
			clock_tower = n
	var pd: Dictionary = lm.pier
	var pier := Models.instance("pier")
	pier.position = Vector3(float(pd.x0), float(pd.deck) - 2.1, float(pd.z0))
	pier.rotation.y = 0.0
	add_child(pier)
	pier_head = Vector3(float(pd.x1), float(pd.deck), float(pd.z1))
	var ad: Dictionary = lm.aquarium
	var aq := Models.instance("aquarium")
	aquarium_pos = Vector3(float(ad.x), bay.height_at(float(ad.x), float(ad.z)), float(ad.z))
	aq.position = aquarium_pos
	aq.rotation.y = deg_to_rad(float(ad.yaw))
	aq.name = "Aquarium"
	add_child(aq)
	var ld: Dictionary = lm.lighthouse
	var lh := Models.instance("lighthouse")
	lh.position = Vector3(float(ld.x), bay.height_at(float(ld.x), float(ld.z)) - 0.2, float(ld.z))
	add_child(lh)
	for hd in lm.houses:
		var hn := Models.instance("house_%d" % int(hd.kind))
		hn.position = Vector3(float(hd.x), bay.height_at(float(hd.x), float(hd.z)) - 0.15, float(hd.z))
		hn.rotation.y = deg_to_rad(float(hd.yaw) + 180.0)
		add_child(hn)


func _kelp() -> void:
	var list: Array = bay.props.kelp
	var mesh := Models.first_mesh(Models.instance("kelp"))
	if mesh == null:
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true          # Compatibility renderer: without colours, vertex colours go black
	mm.mesh = mesh
	mm.instance_count = list.size()
	for i in list.size():
		var k: Array = list[i]
		var sc := float(k[4])
		var basis := Basis(Vector3.UP, deg_to_rad(float(k[3]))).scaled(Vector3(sc, sc * randf_range(0.9, 1.15), sc))
		mm.set_instance_transform(i, Transform3D(basis, Vector3(float(k[0]), float(k[1]) - 0.05, float(k[2]))))
		mm.set_instance_color(i, Color.WHITE)
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "Kelp"
	mmi.multimesh = mm
	mmi.material_override = view.kelp_mat
	mmi.custom_aabb = AABB(Vector3(-64, -30, -64), Vector3(128, 40, 128))
	add_child(mmi)


func _scatter(key: String, models: Array, idx_col: int) -> void:
	## Coral or rocks: one MultiMesh per model kind.
	var list: Array = bay.props.get(key, [])
	var by_kind := {}
	for e in list:
		var kind: int = clampi(int(e[idx_col]), 0, models.size() - 1)
		if not by_kind.has(kind):
			by_kind[kind] = []
		by_kind[kind].append(e)
	for kind in by_kind:
		var src := Models.instance(models[kind])
		var mesh := Models.first_mesh(src)
		if mesh == null:
			continue
		var items: Array = by_kind[kind]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = mesh
		mm.instance_count = items.size()
		for i in items.size():
			var e: Array = items[i]
			var sc := float(e[4])
			var x := float(e[0])
			var z := float(e[2])
			var up := bay.normal_at(x, z).lerp(Vector3.UP, 0.5).normalized()
			var basis := Basis(Vector3.UP, deg_to_rad(float(e[3])))
			var tilt := Quaternion(Vector3.UP, up)
			basis = Basis(tilt) * basis
			mm.set_instance_transform(i, Transform3D(basis.scaled(Vector3(sc, sc, sc)), Vector3(x, bay.height_at(x, z) - 0.12 * sc, z)))
			mm.set_instance_color(i, Color.WHITE)
		var mmi := MultiMeshInstance3D.new()
		mmi.name = "%s_%d" % [key, kind]
		mmi.multimesh = mm
		add_child(mmi)
		src.free()
