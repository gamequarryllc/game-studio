class_name Pumps
extends Node3D
## The pump pads round the shore with whatever pump stands on each, the hose
## from each pump down the beach to the water's edge (it follows the water
## down), a swirl where it drinks, and the barge pumps out on the pools.

# Where each tier's suction hose couples on, in the pump's own frame (the
# model's front faces the water), before the machine scale.
const HOSE_FROM := [Vector3(0.0, 0.3, -1.0), Vector3(0.0, 0.25, -0.7), Vector3(0.15, 0.42, -1.6),
	Vector3(0.0, 0.3, -2.02), Vector3(0.0, 0.25, -2.04)]

var bay: Bay
var pads: Array = []             # {"pos", "yaw", "base", "pump", "tier", "hose", "swirl", "intake", "smoke"}
var barges: Array = []           # {"node", "pos", "body", "aground"}
var hose_mat: StandardMaterial3D
var swirl_mat: StandardMaterial3D
var swirl_mesh: Mesh
var _t := 0.0


func setup(b: Bay) -> void:
	bay = b
	hose_mat = StandardMaterial3D.new()
	hose_mat.albedo_color = Color("#3e3128")
	hose_mat.roughness = 0.55
	swirl_mat = StandardMaterial3D.new()
	swirl_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	swirl_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	swirl_mat.albedo_color = Color(0.95, 0.92, 0.83, 0.7)
	swirl_mat.albedo_texture = _swirl_texture()
	var q := PlaneMesh.new()
	q.size = Vector2(2.6, 2.6)
	swirl_mesh = q
	for i in bay.landmarks.pads.size():
		var pd: Dictionary = bay.landmarks.pads[i]
		var pos := Vector3(float(pd.x), bay.height_at(float(pd.x), float(pd.z)), float(pd.z))
		# Face the water: forward (-Z) towards the middle of the bay.
		var to_bay := (Vector3(-4.0, pos.y, -10.0) - pos).normalized()
		var yaw := atan2(-to_bay.x, -to_bay.z)
		var base := Models.instance("pad")
		base.position = pos
		base.rotation.y = yaw
		add_child(base)
		var hose := MeshInstance3D.new()
		hose.material_override = hose_mat
		hose.mesh = ImmediateMesh.new()
		add_child(hose)
		var sw := MeshInstance3D.new()
		sw.mesh = swirl_mesh
		sw.material_override = swirl_mat
		sw.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		sw.visible = false
		add_child(sw)
		pads.append({"pos": pos, "yaw": yaw, "base": base, "pump": null, "tier": -1,
			"hose": hose, "swirl": sw, "intake": Vector3.INF, "last_level": 99.0, "smoke": null})
	refresh()


func _smoke(tier: int) -> CPUParticles3D:
	## Exhaust smoke: soft grey puffs that rise, drift east on the breeze,
	## swell and fade. Thicker for the bigger engines.
	var ps := CPUParticles3D.new()
	ps.name = "Smoke"
	var q := QuadMesh.new()
	q.size = Vector2(0.9, 0.9)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.albedo_texture = ChartMarks.puff()
	m.vertex_color_use_as_albedo = true
	q.material = m
	ps.mesh = q
	ps.amount = 10 + 3 * tier
	ps.lifetime = 3.2
	ps.local_coords = false
	ps.direction = Vector3(0, 1, 0)
	ps.spread = 12.0
	ps.initial_velocity_min = 1.0
	ps.initial_velocity_max = 1.6
	ps.gravity = Vector3(0.55, 0.25, 0.1)
	ps.damping_min = 0.3
	ps.damping_max = 0.5
	ps.scale_amount_min = 0.7
	ps.scale_amount_max = 1.1
	var sc := Curve.new()
	sc.add_point(Vector2(0.0, 0.4))
	sc.add_point(Vector2(1.0, 2.6 + 0.3 * tier))
	ps.scale_amount_curve = sc
	var g := Gradient.new()
	g.set_color(0, Color(0.42, 0.42, 0.4, 0.75))
	g.set_color(1, Color(0.82, 0.8, 0.74, 0.0))
	g.add_point(0.2, Color(0.5, 0.5, 0.47, 0.6))
	ps.color_ramp = g
	ps.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return ps


func _swirl_texture() -> Texture2D:
	var s := 64
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	for y in s:
		for x in s:
			var dx := (x - s * 0.5 + 0.5) / (s * 0.5)
			var dy := (y - s * 0.5 + 0.5) / (s * 0.5)
			var r := sqrt(dx * dx + dy * dy)
			var a := atan2(dy, dx)
			var spiral := 0.5 + 0.5 * sin(a * 3.0 + r * 14.0)
			var alpha := smoothstep(1.0, 0.7, r) * smoothstep(0.1, 0.3, r) * smoothstep(0.55, 0.9, spiral)
			img.set_pixel(x, y, Color(1, 1, 1, alpha))
	return ImageTexture.create_from_image(img)


func refresh() -> void:
	## Swaps pump models to match each pad's tier.
	for i in pads.size():
		var p: Dictionary = pads[i]
		var tier := int(GameState.pads[i])
		if tier == int(p.tier):
			continue
		if p.pump != null:
			p.pump.queue_free()
			p.pump = null
		p.tier = tier
		if tier > 0:
			var n := Models.instance("pump_" + str(Balance.pump_def(tier).key))
			n.position = p.pos + Vector3(0, 0.35, 0)
			n.rotation.y = float(p.yaw)
			add_child(n)
			p.pump = n
			_livery(n)
			p.intake = Vector3.INF
			p.last_level = 99.0
		(p.hose as MeshInstance3D).visible = tier > 0


func _livery(n: Node) -> void:
	## Premium skins: polished brass, or the starter pack's signal-flag paint.
	if GameState.skin == "":
		return
	var col := Color("#c99a4a") if GameState.skin == "brass" else Color("#d9583c")
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.vertex_color_use_as_albedo = true
	m.metallic = 0.85 if GameState.skin == "brass" else 0.1
	m.roughness = 0.3 if GameState.skin == "brass" else 0.6
	_apply_override(n, m)


func _apply_override(n: Node, m: Material) -> void:
	if n is MeshInstance3D:
		(n as MeshInstance3D).material_override = m
	for c in n.get_children():
		_apply_override(c, m)


func reskin() -> void:
	for p in pads:
		p.tier = -1
	refresh()


func pad_world(i: int) -> Vector3:
	return pads[i].pos


func update(delta: float, now: float, main_running: bool) -> void:
	_t += delta
	var lvl := bay.main_level()
	for i in pads.size():
		var p: Dictionary = pads[i]
		var pump: Node3D = p.pump
		if pump == null:
			p.swirl.visible = false
			continue
		_animate(pump, int(p.tier), now, main_running)
		# Re-lay the hose when the water has dropped enough to move its end.
		if absf(lvl - float(p.last_level)) > 0.08 or p.intake == Vector3.INF:
			p.last_level = lvl
			var tgt := bay.nearest_water(p.pos, bay.main_id) if main_running else Vector3.INF
			p.intake = tgt
			_lay_hose(p)
		var sw: MeshInstance3D = p.swirl
		sw.visible = p.intake != Vector3.INF and main_running
		if sw.visible:
			sw.position = p.intake + Vector3(0, 0.04, 0)
			sw.rotation.y = -now * 3.0
	for b in barges:
		var n: Node3D = b.node
		if b.aground:
			n.position = Vector3(b.pos.x, bay.height_at(b.pos.x, b.pos.z) + 0.15, b.pos.z)
			n.rotation = Vector3(0.12, n.rotation.y, 0.08)
		else:
			var wl := bay.level_of(int(b.body))
			n.position = Vector3(b.pos.x, wl + sin(now * 1.4 + b.pos.x) * 0.05, b.pos.z)
			n.rotation = Vector3(sin(now * 1.1 + b.pos.z) * 0.03, n.rotation.y, sin(now * 0.9) * 0.03)
		var pump: Node3D = Models.find(n, "Lever")
		if pump != null and not b.aground:
			pump.rotation.x = sin(now * 3.4) * 0.45


func _animate(pump: Node3D, tier: int, now: float, running: bool) -> void:
	var sp := 1.0 if running else 0.0
	match tier:
		1:
			var bk := Models.find(pump, "Buckets")
			if bk != null:
				bk.position.y = absf(sin(now * 2.2)) * 0.18 * sp
				bk.rotation.z = sin(now * 2.2) * 0.25 * sp
		2:
			var lv := Models.find(pump, "Lever")
			if lv != null:
				lv.rotation.x = sin(now * 3.0) * 0.5 * sp
		3:
			pump.position.y = pump.position.y
			var fw := Models.find(pump, "Flywheel")
			if fw != null:
				fw.rotation.x += 0.2 * sp
		4:
			var vl := Models.find(pump, "Valve")
			if vl != null:
				vl.rotation.y = now * 0.6 * sp
		5:
			var rt := Models.find(pump, "Rotor")
			if rt != null:
				rt.rotation.y = now * 4.0 * sp


func _lay_hose(p: Dictionary) -> void:
	var im: ImmediateMesh = (p.hose as MeshInstance3D).mesh
	im.clear_surfaces()
	if p.intake == Vector3.INF:
		return
	var hf: Vector3 = HOSE_FROM[clampi(int(p.tier) - 1, 0, HOSE_FROM.size() - 1)] * Models.SCALE_MACHINE
	var start: Vector3 = p.pos + Vector3(0, 0.36 * Models.SCALE_PAD, 0) + hf.rotated(Vector3.UP, float(p.yaw))
	var end: Vector3 = p.intake
	var segs := clampi(int(start.distance_to(end) / 1.0), 4, 90)
	var pts: Array = []
	# laid by hand: a lazy S-curve sideways, not a ruled line
	var dir2 := Vector2(end.x - start.x, end.z - start.z)
	var lateral := Vector3(-dir2.y, 0, dir2.x).normalized()
	# the longer the run, the wider the loops it was dragged out in
	var span := start.distance_to(end)
	var wig := clampf(span * 0.05, 0.8, 3.0) * (0.8 + 0.25 * fmod(absf(float(p.pos.x)) * 1.7, 1.0))
	var ph := float(p.yaw) + float(p.pos.z) * 0.37
	var r := 0.15 + 0.035 * float(p.tier)
	for k in segs + 1:
		var u := float(k) / float(segs)
		var sway := sin(u * PI * 2.0 + ph) * 0.8 + sin(u * PI * 5.0 + ph * 1.7) * 0.25
		var q := start.lerp(end, u) + lateral * sway * wig * sin(u * PI)
		var g := bay.height_at(q.x, q.z)
		# lying on the sand all the way down, rising to the coupling, dipping into the water
		var y := g + r * 0.9
		var lift := 1.0 - smoothstep(0.0, 0.08, u)
		y = lerpf(y, start.y, lift)
		if g < end.y:
			y = maxf(g + r, end.y - 0.35)
		q.y = maxf(y, g + r * 0.8)
		pts.append(q)
	im.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	var sides := 6
	for k in pts.size() - 1:
		var a: Vector3 = pts[k]
		var b: Vector3 = pts[k + 1]
		var dir := (b - a).normalized()
		var side := dir.cross(Vector3.UP).normalized()
		if side.length() < 0.1:
			side = Vector3.RIGHT
		var up := side.cross(dir).normalized()
		for s in sides:
			var a0 := TAU * s / sides
			var a1 := TAU * (s + 1) / sides
			var o0 := (side * cos(a0) + up * sin(a0)) * r
			var o1 := (side * cos(a1) + up * sin(a1)) * r
			im.surface_set_normal(o0.normalized())
			im.surface_add_vertex(a + o0)
			im.surface_set_normal(o1.normalized())
			im.surface_add_vertex(a + o1)
			im.surface_set_normal(o1.normalized())
			im.surface_add_vertex(b + o1)
			im.surface_set_normal(o0.normalized())
			im.surface_add_vertex(a + o0)
			im.surface_set_normal(o1.normalized())
			im.surface_add_vertex(b + o1)
			im.surface_set_normal(o0.normalized())
			im.surface_add_vertex(b + o0)
	im.surface_end()


# --- Barges -------------------------------------------------------------------------------------
func sync_barges() -> void:
	## One barge node per barge owned, placed where GameState says.
	while barges.size() < GameState.barges.size():
		var n := Models.instance("barge")
		n.rotation.y = randf() * TAU
		n.scale = Vector3.ONE * Models.SCALE_BARGE
		add_child(n)
		barges.append({"node": n, "pos": Vector3.ZERO, "body": Bay.NO_BODY, "aground": true})
	while barges.size() > GameState.barges.size():
		barges.pop_back().node.queue_free()
	settle_barges()


func settle_barges() -> void:
	## Each barge floats on the water at its mooring, or slides down the
	## seabed with the water to the first water below; aground if none.
	for i in barges.size():
		var b: Dictionary = barges[i]
		var m: Array = GameState.barges[i]
		var spot := bay.float_spot(float(m[0]), float(m[1]))
		if spot.is_empty():
			b.aground = true
			b.body = Bay.NO_BODY
			b.pos = Vector3(float(m[0]), 0, float(m[1]))
		else:
			b.aground = false
			b.body = int(spot.body)
			var p: Vector3 = spot.pos
			b.pos = p
			GameState.barges[i] = [p.x, p.z]


func barge_flows() -> Dictionary:
	## body id -> m³/s from the barges floating on it.
	var out := {}
	for b in barges:
		if b.aground or not bay.bodies.has(int(b.body)):
			continue
		var id := int(b.body)
		out[id] = float(out.get(id, 0.0)) + GameState.barge_flow(bay.level_of(id))
	return out


func idle_barge() -> int:
	for i in barges.size():
		if barges[i].aground:
			return i
	return -1
