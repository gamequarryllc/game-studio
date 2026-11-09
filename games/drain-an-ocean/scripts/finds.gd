class_name Finds
extends Node3D
## The named finds (one each, lying on the seabed in their ring, half buried)
## and the wrecks' salvage loads. A find can be picked up once the water over
## it is shallower than Balance.FIND_SHOW_DEPTH; a glint turns over it so it
## reads at a distance. Wrecks give a load per tap (with a short cooldown)
## once they're out of the water.

const SEED := 777

var bay: Bay
var spots: Array = []            # per find: {"pos": Vector3, "node"}
var wrecks: Array = []           # from Props: {"node", "name", "pos", "kind"}
var _glints := {}
var _wreck_cool: Array = [0.0, 0.0, 0.0]
var _lifting: Array = []
var glint_mesh: QuadMesh
var glint_mat: StandardMaterial3D


func setup(b: Bay, wreck_list: Array) -> void:
	bay = b
	wrecks = wreck_list
	glint_mesh = QuadMesh.new()
	glint_mesh.size = Vector2(1.1, 1.1)
	glint_mat = StandardMaterial3D.new()
	glint_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glint_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glint_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	glint_mat.albedo_texture = _glint_texture()
	glint_mat.albedo_color = Color(1, 0.95, 0.8, 0.95)
	_layout()
	for f in spots.size():
		var def: Dictionary = Balance.FINDS[f]
		var n := Models.instance(str(def.model))
		n.position = spots[f].pos + Vector3(0, -0.12, 0)
		n.rotation = Vector3(deg_to_rad(randf_range(-14, 14)), randf() * TAU, deg_to_rad(randf_range(-10, 10)))
		n.name = "Find_" + str(def.key)
		add_child(n)
		spots[f].node = n
		n.visible = not GameState.finds_found[f]


func _layout() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = SEED
	spots = []
	var taken: Array = []
	for f in Balance.FINDS.size():
		var ring := int(Balance.FINDS[f].ring)
		var pos := Vector3.INF
		if ring == 5:
			# The weathervane lies by the clock tower.
			for td in bay.landmarks.town:
				if str(td.kind) == "clocktower":
					pos = Vector3(float(td.x) + 3.5, 0, float(td.z) + 2.0)
		else:
			var top := float(Balance.RINGS[ring].top) - 0.5
			var bot := float(Balance.RINGS[ring].bottom) + 0.4
			var zmin := -50.0
			if f == 0:
				# The first find: on the shallowest sandbar by the town, out
				# of the water within the first minute.
				top = -0.16
				bot = -0.42
				zmin = 12.0
			var tries := 0
			while tries < 4000:
				tries += 1
				var x := rng.randf_range(-55.0, 55.0)
				var z := rng.randf_range(zmin, 44.0)
				var y := bay.height_at(x, z)
				if y > top or y < bot:
					continue
				var ok := true
				for t in taken:
					if Vector2(x, z).distance_to(t) < 12.0:
						ok = false
				for p in bay.pools:
					if Vector2(x, z).distance_to(Vector2(float(p.x), float(p.z))) < 6.0:
						ok = false
				for wd in bay.landmarks.wrecks:
					if Vector2(x, z).distance_to(Vector2(float(wd.x), float(wd.z))) < 10.0:
						ok = false
				if ok:
					pos = Vector3(x, 0, z)
					break
		if pos == Vector3.INF:
			pos = Vector3(0, 0, 0)
		pos.y = bay.height_at(pos.x, pos.z)
		taken.append(Vector2(pos.x, pos.z))
		spots.append({"pos": pos, "node": null})


func _glint_texture() -> Texture2D:
	var img := Image.create(48, 48, false, Image.FORMAT_RGBA8)
	for y in 48:
		for x in 48:
			var dx := (x - 23.5) / 23.5
			var dy := (y - 23.5) / 23.5
			var star := maxf(0.0, 1.0 - absf(dx) * 9.0 - absf(dy) * 1.1) + maxf(0.0, 1.0 - absf(dy) * 9.0 - absf(dx) * 1.1)
			var core := maxf(0.0, 1.0 - sqrt(dx * dx + dy * dy) * 2.6)
			var a := clampf(star * 0.9 + core, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)


func is_exposed(f: int) -> bool:
	if GameState.finds_found[f]:
		return false
	var p: Vector3 = spots[f].pos
	return bay.water_level_at(p.x, p.z) - bay.height_at(p.x, p.z) < Balance.FIND_SHOW_DEPTH


func exposed_list() -> Array:
	var out: Array = []
	for f in spots.size():
		if is_exposed(f):
			out.append(f)
	return out


func wreck_revealed(w: int) -> bool:
	var p: Vector3 = wrecks[w].pos
	return bay.water_level_at(p.x, p.z) - bay.height_at(p.x, p.z) < 0.5


func wreck_ready(w: int) -> bool:
	return wreck_revealed(w) and int(GameState.wreck_loads[w]) > 0 and _wreck_cool[w] <= 0.0


func wreck_tapped(w: int) -> void:
	_wreck_cool[w] = Balance.WRECK_TAP_COOLDOWN
	_lift_crate(wrecks[w].pos + Vector3(0, 1.5, 0))


func pick_up(f: int, to: Vector3) -> void:
	var n: Node3D = spots[f].node
	if n == null:
		return
	if _glints.has(f):
		_glints[f].queue_free()
		_glints.erase(f)
	_lifting.append({"node": n, "from": n.global_position, "to": to, "t": 0.0, "dur": 1.2, "free": false})


func _lift_crate(at: Vector3) -> void:
	var n := Models.instance("crate")
	n.position = at
	add_child(n)
	_lifting.append({"node": n, "from": at, "to": at + Vector3(0, 5, 0), "t": 0.0, "dur": 0.9, "free": true})


func update(delta: float, now: float) -> void:
	for w in _wreck_cool.size():
		_wreck_cool[w] = maxf(0.0, _wreck_cool[w] - delta)
	for f in spots.size():
		var exposed := is_exposed(f)
		if exposed and not _glints.has(f):
			var g := MeshInstance3D.new()
			g.mesh = glint_mesh
			g.material_override = glint_mat
			g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(g)
			_glints[f] = g
		elif not exposed and _glints.has(f):
			_glints[f].queue_free()
			_glints.erase(f)
		if _glints.has(f):
			var gl: MeshInstance3D = _glints[f]
			var pulse := 0.5 + 0.5 * sin(now * 3.0 + f)
			gl.position = spots[f].pos + Vector3(0, 0.9 + 0.1 * pulse, 0)
			gl.scale = Vector3.ONE * (0.6 + 0.5 * pulse)
			gl.rotation.z = now * 0.8
	for k in range(_lifting.size() - 1, -1, -1):
		var l: Dictionary = _lifting[k]
		l.t = float(l.t) + delta
		var u := clampf(float(l.t) / float(l.dur), 0.0, 1.0)
		var e := 1.0 - pow(1.0 - u, 3.0)
		var n: Node3D = l.node
		if is_instance_valid(n):
			var p := (l.from as Vector3).lerp(l.to, e)
			p.y += sin(u * PI) * 3.0
			n.global_position = p
			n.rotation.y += delta * 4.0
			n.scale = Vector3.ONE * lerpf(1.0, 0.4, u)
		if u >= 1.0:
			if is_instance_valid(n):
				if l.free:
					n.queue_free()
				else:
					n.visible = false
			_lifting.remove_at(k)
