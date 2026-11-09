class_name Models
extends RefCounted
## Every 3D model in the game, built from code as faceted low-poly meshes with
## vertex colours. For the plants, vertex alpha says what a part is (see
## shaders/plant.gdshader): 1 = leaves (tinted per tree), 0.5 = cursed glow, 0 = bark.

const LEAF := 1.0
const GLOW := 0.5
const BARK := 0.0
const BARK_COLOR := Color(0.24, 0.16, 0.16)

static var _cache := {}


static func clear_cache() -> void:
	_cache.clear()


# --- Building blocks ---------------------------------------------------------------
static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, ca: Color, cb: Color, cc: Color) -> void:
	st.set_color(ca)
	st.add_vertex(a)
	st.set_color(cb)
	st.add_vertex(b)
	st.set_color(cc)
	st.add_vertex(c)


static func cone(st: SurfaceTool, base: Vector3, radius: float, height: float, segs: int, col: Color,
		flag: float, rot: float = 0.0, dark: float = 0.55) -> void:
	## An upright cone (a layer of a pine). Darker underneath and at the rim.
	var top := base + Vector3(0, height, 0)
	var rim := Color(col.r * dark, col.g * dark, col.b * dark, flag)
	var tip := Color(col.r, col.g, col.b, flag)
	for s in segs:
		var a0 := rot + TAU * s / segs
		var a1 := rot + TAU * (s + 1) / segs
		var p0 := base + Vector3(cos(a0) * radius, 0, sin(a0) * radius)
		var p1 := base + Vector3(cos(a1) * radius, 0, sin(a1) * radius)
		_tri(st, top, p1, p0, tip, rim, rim)
		var under := Color(rim.r * 0.6, rim.g * 0.6, rim.b * 0.6, flag)
		_tri(st, base + Vector3(0, height * 0.12, 0), p0, p1, under, under, under)


static func prism(st: SurfaceTool, base: Vector3, r0: float, r1: float, height: float, segs: int, col: Color,
		flag: float, lean: Vector3 = Vector3.ZERO) -> void:
	## A trunk: a tapered n-sided column, optionally leaning.
	var top := base + Vector3(0, height, 0) + lean
	var dark := Color(col.r * 0.7, col.g * 0.7, col.b * 0.7, flag)
	var lit := Color(col.r, col.g, col.b, flag)
	for s in segs:
		var a0 := TAU * s / segs
		var a1 := TAU * (s + 1) / segs
		var b0 := base + Vector3(cos(a0) * r0, 0, sin(a0) * r0)
		var b1 := base + Vector3(cos(a1) * r0, 0, sin(a1) * r0)
		var t0 := top + Vector3(cos(a0) * r1, 0, sin(a0) * r1)
		var t1 := top + Vector3(cos(a1) * r1, 0, sin(a1) * r1)
		_tri(st, b0, t1, b1, dark, lit, dark)
		_tri(st, b0, t0, t1, dark, lit, lit)
		_tri(st, top, t1, t0, lit, lit, lit)


static func blob(st: SurfaceTool, center: Vector3, radius: Vector3, col: Color, flag: float,
		rng: RandomNumberGenerator, lat: int = 4, lon: int = 6, rough: float = 0.12) -> void:
	## A lumpy faceted ball (canopies, bushes, rocks). Darker underneath.
	var pts := []
	for i in lat + 1:
		var row := []
		var v := PI * i / lat
		for j in lon:
			var u := TAU * j / lon + (0.5 if i % 2 == 1 else 0.0) * TAU / lon
			var d := Vector3(sin(v) * cos(u), cos(v), sin(v) * sin(u))
			var k := 1.0 + (rng.randf_range(-rough, rough) if i > 0 and i < lat else 0.0)
			row.append(center + d * radius * k)
		pts.append(row)
	for i in lat:
		for j in lon:
			var a: Vector3 = pts[i][j]
			var b: Vector3 = pts[i][(j + 1) % lon]
			var c: Vector3 = pts[i + 1][j]
			var d: Vector3 = pts[i + 1][(j + 1) % lon]
			var ca := _shade(col, a.y - center.y, radius.y, flag)
			var cb := _shade(col, b.y - center.y, radius.y, flag)
			var cc := _shade(col, c.y - center.y, radius.y, flag)
			var cd := _shade(col, d.y - center.y, radius.y, flag)
			if i > 0:
				_tri(st, a, b, c, ca, cb, cc)
			if i < lat - 1:
				_tri(st, b, d, c, cb, cd, cc)


static func _shade(col: Color, dy: float, r: float, flag: float) -> Color:
	var k := 0.55 + 0.45 * clampf(dy / maxf(r, 0.01) * 0.5 + 0.5, 0.0, 1.0)
	return Color(col.r * k, col.g * k, col.b * k, flag)


static func box(st: SurfaceTool, center: Vector3, size: Vector3, col: Color, flag: float = 0.0) -> void:
	var h := size * 0.5
	var c := [
		center + Vector3(-h.x, -h.y, -h.z), center + Vector3(h.x, -h.y, -h.z),
		center + Vector3(h.x, h.y, -h.z), center + Vector3(-h.x, h.y, -h.z),
		center + Vector3(-h.x, -h.y, h.z), center + Vector3(h.x, -h.y, h.z),
		center + Vector3(h.x, h.y, h.z), center + Vector3(-h.x, h.y, h.z),
	]
	var faces := [[0, 3, 2, 1, 0.8], [4, 5, 6, 7, 0.9], [0, 4, 7, 3, 0.75], [1, 2, 6, 5, 0.85], [3, 7, 6, 2, 1.0], [0, 1, 5, 4, 0.5]]
	for f in faces:
		var k: float = f[4]
		var cc := Color(col.r * k, col.g * k, col.b * k, flag)
		_tri(st, c[f[0]], c[f[1]], c[f[2]], cc, cc, cc)
		_tri(st, c[f[0]], c[f[2]], c[f[3]], cc, cc, cc)


static func _begin() -> SurfaceTool:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_smooth_group(-1)   # flat normals: faceted low-poly, and double-sided leaves stay lit
	return st


static func _end(st: SurfaceTool) -> ArrayMesh:
	st.generate_normals()
	return st.commit()


# --- The forest ----------------------------------------------------------------------
static func plant_mesh(kind: int) -> ArrayMesh:
	if _cache.has(kind):
		return _cache[kind]
	var m: ArrayMesh
	match kind:
		Balance.GRASS:
			m = _grass()
		Balance.BUSH:
			m = _bush()
		Balance.PINE:
			m = _pine()
		Balance.OAK:
			m = _oak()
		Balance.GIANT:
			m = _giant()
		Balance.ELDER:
			m = _elder()
	_cache[kind] = m
	return m


static func _grass() -> ArrayMesh:
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	for b in 7:
		var a := TAU * b / 7.0 + rng.randf_range(-0.3, 0.3)
		var out := Vector3(cos(a), 0, sin(a))
		var side := Vector3(-out.z, 0, out.x) * 0.06
		var root := out * rng.randf_range(0.05, 0.3)
		var tip := root + out * 0.25 + Vector3(0, rng.randf_range(0.35, 0.6), 0)
		var dark := Color(0.5, 0.5, 0.5, LEAF)
		var lit := Color(1.0, 1.0, 1.0, LEAF)
		_tri(st, root - side, root + side, tip, dark, dark, lit)
		_tri(st, root + side, root - side, tip, dark, dark, lit)
	return _end(st)


static func _bush() -> ArrayMesh:
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = 12
	blob(st, Vector3(0, 0.42, 0), Vector3(0.62, 0.5, 0.62), Color(0.9, 0.9, 0.9), LEAF, rng, 4, 6, 0.15)
	blob(st, Vector3(0.35, 0.6, 0.2), Vector3(0.4, 0.38, 0.4), Color(1, 1, 1), LEAF, rng, 3, 5, 0.12)
	blob(st, Vector3(0.18, 0.62, -0.25), Vector3(0.09, 0.09, 0.09), Color(1, 1, 1), GLOW, rng, 2, 4, 0.0)
	return _end(st)


static func _pine() -> ArrayMesh:
	var st := _begin()
	prism(st, Vector3.ZERO, 0.2, 0.12, 1.4, 5, BARK_COLOR, BARK)
	cone(st, Vector3(0, 0.75, 0), 1.08, 1.9, 7, Color(0.85, 0.85, 0.85), LEAF, 0.0)
	cone(st, Vector3(0, 1.75, 0), 0.84, 1.65, 7, Color(0.95, 0.95, 0.95), LEAF, 0.4)
	cone(st, Vector3(0, 2.75, 0), 0.56, 1.6, 6, Color(1.08, 1.08, 1.08), LEAF, 0.8)
	return _end(st)


static func _oak() -> ArrayMesh:
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = 14
	prism(st, Vector3.ZERO, 0.3, 0.2, 2.2, 6, BARK_COLOR, BARK, Vector3(0.1, 0, 0.05))
	prism(st, Vector3(0.05, 1.5, 0), 0.12, 0.06, 1.0, 4, BARK_COLOR, BARK, Vector3(0.6, 0.2, 0.1))
	blob(st, Vector3(0.0, 3.1, 0.0), Vector3(1.35, 1.15, 1.3), Color(0.9, 0.9, 0.9), LEAF, rng, 4, 7, 0.14)
	blob(st, Vector3(0.8, 2.7, 0.45), Vector3(0.85, 0.78, 0.85), Color(1, 1, 1), LEAF, rng, 4, 6, 0.12)
	blob(st, Vector3(-0.7, 2.8, -0.35), Vector3(0.8, 0.72, 0.8), Color(0.95, 0.95, 0.95), LEAF, rng, 4, 6, 0.12)
	for k in 3:
		var a := TAU * k / 3.0 + 0.4
		blob(st, Vector3(cos(a) * 1.25, 2.6 + k * 0.25, sin(a) * 1.25), Vector3(0.11, 0.11, 0.11), Color(1, 1, 1), GLOW, rng, 2, 4, 0.0)
	return _end(st)


static func _giant() -> ArrayMesh:
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = 15
	var bark := Color(0.22, 0.13, 0.2)
	prism(st, Vector3.ZERO, 0.75, 0.42, 4.2, 7, bark, BARK, Vector3(-0.2, 0, 0.15))
	# Roots spread out like fingers.
	for k in 5:
		var a := TAU * k / 5.0
		prism(st, Vector3(cos(a) * 0.4, 0, sin(a) * 0.4), 0.22, 0.04, 0.5, 4, bark, BARK, Vector3(cos(a) * 1.0, -0.35, sin(a) * 1.0))
	# Twisty branches up into the canopy.
	prism(st, Vector3(0, 3.0, 0), 0.25, 0.1, 2.2, 5, bark, BARK, Vector3(1.4, 0.4, 0.4))
	prism(st, Vector3(0, 3.3, 0), 0.22, 0.1, 2.0, 5, bark, BARK, Vector3(-1.3, 0.5, -0.6))
	blob(st, Vector3(-0.1, 6.0, 0.1), Vector3(2.7, 1.9, 2.6), Color(0.85, 0.85, 0.85), LEAF, rng, 5, 8, 0.15)
	blob(st, Vector3(1.8, 5.4, 0.8), Vector3(1.6, 1.3, 1.6), Color(0.95, 0.95, 0.95), LEAF, rng, 4, 7, 0.14)
	blob(st, Vector3(-1.7, 5.6, -0.9), Vector3(1.5, 1.3, 1.5), Color(0.92, 0.92, 0.92), LEAF, rng, 4, 7, 0.14)
	blob(st, Vector3(0.3, 7.4, -0.4), Vector3(1.5, 1.2, 1.5), Color(1.05, 1.05, 1.05), LEAF, rng, 4, 6, 0.12)
	# Glowing cursed lanterns hang in it, and a pair of sleepy eyes in the bark.
	for k in 6:
		var a := TAU * k / 6.0 + 0.2
		var r := 2.3 + 0.3 * (k % 2)
		blob(st, Vector3(cos(a) * r, 4.6 + 0.5 * (k % 3), sin(a) * r), Vector3(0.16, 0.2, 0.16), Color(1, 1, 1), GLOW, rng, 2, 4, 0.0)
	blob(st, Vector3(-0.26, 2.6, 0.62), Vector3(0.12, 0.07, 0.05), Color(1, 1, 1), GLOW, rng, 2, 4, 0.0)
	blob(st, Vector3(0.18, 2.62, 0.66), Vector3(0.12, 0.07, 0.05), Color(1, 1, 1), GLOW, rng, 2, 4, 0.0)
	return _end(st)


static func _elder() -> ArrayMesh:
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = 16
	var bark := Color(0.2, 0.11, 0.2)
	prism(st, Vector3.ZERO, 2.4, 1.3, 10.0, 9, bark, BARK, Vector3(0.4, 0, -0.3))
	for k in 7:
		var a := TAU * k / 7.0 + 0.3
		prism(st, Vector3(cos(a) * 1.6, 0, sin(a) * 1.6), 0.7, 0.1, 1.2, 5, bark, BARK, Vector3(cos(a) * 3.2, -0.9, sin(a) * 3.2))
	for k in 5:
		var a := TAU * k / 5.0 + 0.9
		prism(st, Vector3(0, 7.5 + k * 0.6, 0), 0.6, 0.2, 4.5, 6, bark, BARK, Vector3(cos(a) * 4.0, 1.5, sin(a) * 4.0))
	blob(st, Vector3(0.4, 15.0, -0.3), Vector3(7.0, 4.6, 6.8), Color(0.8, 0.8, 0.8), LEAF, rng, 6, 10, 0.14)
	for k in 6:
		var a := TAU * k / 6.0
		blob(st, Vector3(cos(a) * 5.0, 13.0 + (k % 2) * 2.0, sin(a) * 5.0), Vector3(3.2, 2.6, 3.2), Color(0.95, 0.95, 0.95), LEAF, rng, 4, 7, 0.14)
	blob(st, Vector3(0.0, 19.0, 0.0), Vector3(3.6, 2.4, 3.6), Color(1.05, 1.05, 1.05), LEAF, rng, 4, 7, 0.12)
	# The cursed heart glows in a hollow of the trunk, under two big sleepy eyes.
	blob(st, Vector3(0.2, 4.2, 2.1), Vector3(0.75, 1.05, 0.5), Color(1, 1, 1), GLOW, rng, 3, 6, 0.05)
	blob(st, Vector3(-0.7, 7.2, 1.9), Vector3(0.42, 0.22, 0.2), Color(1, 1, 1), GLOW, rng, 2, 5, 0.0)
	blob(st, Vector3(0.9, 7.3, 1.85), Vector3(0.42, 0.22, 0.2), Color(1, 1, 1), GLOW, rng, 2, 5, 0.0)
	for k in 14:
		var a := TAU * k / 14.0
		var r := 5.5 + 1.5 * (k % 2)
		blob(st, Vector3(cos(a) * r, 11.5 + 1.2 * (k % 3), sin(a) * r), Vector3(0.3, 0.38, 0.3), Color(1, 1, 1), GLOW, rng, 2, 4, 0.0)
	return _end(st)


static func flower_mesh() -> ArrayMesh:
	if _cache.has("flower"):
		return _cache["flower"]
	var st := _begin()
	var stem := Color(0.25, 0.55, 0.2, BARK)
	var leaf := Color(0.35, 0.7, 0.25, BARK)
	prism(st, Vector3.ZERO, 0.025, 0.02, 0.32, 3, stem, BARK)
	_tri(st, Vector3(0, 0.08, 0), Vector3(0.16, 0.16, 0.04), Vector3(0.02, 0.14, 0), leaf, leaf, leaf)
	_tri(st, Vector3(0, 0.08, 0), Vector3(0.02, 0.14, 0), Vector3(0.16, 0.16, 0.04), leaf, leaf, leaf)
	var c := Vector3(0, 0.33, 0)
	for p in 5:
		var a0 := TAU * p / 5.0
		var a1 := a0 + 1.0
		var am := a0 + 0.5
		var petal := Color(1, 1, 1, LEAF)
		var edge := Color(0.85, 0.85, 0.85, LEAF)
		var tip := c + Vector3(cos(am) * 0.21, 0.07, sin(am) * 0.21)
		var l := c + Vector3(cos(a0) * 0.12, 0.04, sin(a0) * 0.12)
		var r := c + Vector3(cos(a1) * 0.12, 0.04, sin(a1) * 0.12)
		_tri(st, c, r, tip, petal, edge, edge)
		_tri(st, c, tip, l, petal, edge, edge)
		_tri(st, c, tip, r, petal, edge, edge)
		_tri(st, c, l, tip, petal, edge, edge)
	var rng := RandomNumberGenerator.new()
	blob(st, c + Vector3(0, 0.03, 0), Vector3(0.045, 0.03, 0.045), Color(1.0, 0.8, 0.25, BARK), BARK, rng, 2, 5, 0.0)
	var m := _end(st)
	_cache["flower"] = m
	return m


static func boulder_mesh() -> ArrayMesh:
	if _cache.has("boulder"):
		return _cache["boulder"]
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = 21
	blob(st, Vector3(0, 0.25, 0), Vector3(0.75, 0.6, 0.65), Color(0.46, 0.44, 0.5), BARK, rng, 3, 6, 0.22)
	blob(st, Vector3(0.55, 0.12, 0.35), Vector3(0.4, 0.32, 0.38), Color(0.4, 0.38, 0.44), BARK, rng, 3, 5, 0.2)
	var moss := Color(0.3, 0.22, 0.42)
	blob(st, Vector3(-0.1, 0.72, 0.0), Vector3(0.5, 0.12, 0.42), moss, BARK, rng, 2, 6, 0.1)
	var m := _end(st)
	_cache["boulder"] = m
	return m


static func cottage_mesh(seed: int) -> ArrayMesh:
	## A little village house, wrapped in the curse's violet vines.
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var walls: Color = [Color(0.93, 0.84, 0.7), Color(0.85, 0.8, 0.88), Color(0.95, 0.78, 0.6)][seed % 3]
	var roof: Color = [Color(0.62, 0.22, 0.2), Color(0.3, 0.35, 0.6), Color(0.45, 0.3, 0.22)][seed % 3]
	box(st, Vector3(0, 1.2, 0), Vector3(3.6, 2.4, 3.0), walls)
	# Roof: two slopes and the gable ends.
	var w := 2.1
	var d := 1.75
	var top := 3.9
	var e := 2.3
	var rc := roof
	var rd := Color(roof.r * 0.7, roof.g * 0.7, roof.b * 0.7)
	_tri(st, Vector3(-w, e, d), Vector3(w, e, d), Vector3(w, top, 0), rc, rc, rc)
	_tri(st, Vector3(-w, e, d), Vector3(w, top, 0), Vector3(-w, top, 0), rc, rc, rc)
	_tri(st, Vector3(w, e, -d), Vector3(-w, e, -d), Vector3(-w, top, 0), rd, rd, rd)
	_tri(st, Vector3(w, e, -d), Vector3(-w, top, 0), Vector3(w, top, 0), rd, rd, rd)
	var gc := Color(walls.r * 0.85, walls.g * 0.85, walls.b * 0.85)
	_tri(st, Vector3(-1.8, 2.4, 1.5), Vector3(-1.8, top - 0.1, 0), Vector3(-1.8, 2.4, -1.5), gc, gc, gc)
	_tri(st, Vector3(1.8, 2.4, -1.5), Vector3(1.8, top - 0.1, 0), Vector3(1.8, 2.4, 1.5), gc, gc, gc)
	box(st, Vector3(0, 0.75, 1.52), Vector3(0.8, 1.5, 0.08), Color(0.4, 0.25, 0.16))
	box(st, Vector3(-1.1, 1.4, 1.52), Vector3(0.6, 0.6, 0.06), Color(1.0, 0.75, 0.35), GLOW)
	box(st, Vector3(1.1, 1.4, 1.52), Vector3(0.6, 0.6, 0.06), Color(1.0, 0.75, 0.35), GLOW)
	box(st, Vector3(1.0, 3.8, -0.6), Vector3(0.4, 1.2, 0.4), Color(0.5, 0.42, 0.4))
	# Vines.
	var vine := Color(0.34, 0.2, 0.52)
	for k in 10:
		var a := rng.randf_range(0, TAU)
		var p := Vector3(cos(a) * 1.9, rng.randf_range(0.3, 3.2), sin(a) * 1.6)
		blob(st, p, Vector3(0.45, 0.3, 0.45), vine, LEAF, rng, 2, 5, 0.2)
	return _end(st)


static func keeper_part(name: String) -> ArrayMesh:
	## Pieces of the fire-keeper (the player): see Keeper._build_model().
	if _cache.has("k_" + name):
		return _cache["k_" + name]
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = 31
	var robe := Color(0.2, 0.17, 0.2)
	var trim := Color(1.0, 0.5, 0.15)
	match name:
		"body":
			prism(st, Vector3(0, 0.12, 0), 0.36, 0.2, 0.72, 8, robe, BARK)
			prism(st, Vector3(0, 0.1, 0), 0.38, 0.37, 0.08, 8, trim, BARK)
			prism(st, Vector3(0, 0.55, 0), 0.27, 0.26, 0.07, 8, trim, BARK)
			blob(st, Vector3(0, 0.62, -0.26), Vector3(0.16, 0.2, 0.1), Color(0.35, 0.24, 0.2), BARK, rng, 3, 6, 0.05)
		"head":
			blob(st, Vector3(0, 0.0, 0), Vector3(0.24, 0.23, 0.23), Color(1.0, 0.8, 0.66), BARK, rng, 4, 8, 0.0)
			blob(st, Vector3(-0.085, 0.02, 0.2), Vector3(0.035, 0.05, 0.03), Color(0.08, 0.06, 0.08), BARK, rng, 2, 5, 0.0)
			blob(st, Vector3(0.085, 0.02, 0.2), Vector3(0.035, 0.05, 0.03), Color(0.08, 0.06, 0.08), BARK, rng, 2, 5, 0.0)
			blob(st, Vector3(-0.15, -0.06, 0.16), Vector3(0.05, 0.03, 0.02), Color(1.0, 0.55, 0.5), BARK, rng, 2, 5, 0.0)
			blob(st, Vector3(0.15, -0.06, 0.16), Vector3(0.05, 0.03, 0.02), Color(1.0, 0.55, 0.5), BARK, rng, 2, 5, 0.0)
		"hood":
			# A pointy hood that flops over at the tip.
			prism(st, Vector3(0, -0.05, -0.02), 0.29, 0.2, 0.22, 8, robe, BARK)
			prism(st, Vector3(0, 0.17, -0.02), 0.2, 0.03, 0.42, 7, robe, BARK, Vector3(0, -0.04, -0.22))
			prism(st, Vector3(0, -0.04, -0.02), 0.3, 0.29, 0.05, 8, trim, BARK)
		"hand":
			blob(st, Vector3.ZERO, Vector3(0.08, 0.08, 0.08), Color(1.0, 0.8, 0.66), BARK, rng, 2, 5, 0.0)
		"foot":
			blob(st, Vector3(0, 0.05, 0.03), Vector3(0.1, 0.07, 0.14), Color(0.32, 0.2, 0.14), BARK, rng, 2, 5, 0.0)
		"lantern":
			box(st, Vector3(0, 0, 0), Vector3(0.16, 0.2, 0.16), Color(1.0, 0.7, 0.3), GLOW)
			box(st, Vector3(0, 0.12, 0), Vector3(0.2, 0.04, 0.2), Color(0.25, 0.2, 0.2))
	var m := _end(st)
	_cache["k_" + name] = m
	return m


static func tool_mesh(i: int, sparkler: bool) -> ArrayMesh:
	## What the keeper holds. The flame end points along +Z, the grip at the origin.
	var key := "tool_%d_%s" % [i, sparkler]
	if _cache.has(key):
		return _cache[key]
	var st := _begin()
	var rng := RandomNumberGenerator.new()
	rng.seed = 41 + i
	match i:
		0:
			var stick := Color(0.95, 0.85, 0.6)
			if sparkler:
				for k in 4:
					var c: Color = [Color(1, 0.35, 0.5), Color(1, 0.85, 0.3), Color(0.4, 0.85, 1), Color(0.6, 1, 0.5)][k]
					box(st, Vector3(0, 0, 0.06 + k * 0.1), Vector3(0.04, 0.04, 0.1), c)
			else:
				box(st, Vector3(0, 0, 0.2), Vector3(0.035, 0.035, 0.42), stick)
			blob(st, Vector3(0, 0, 0.43), Vector3(0.045, 0.045, 0.06), Color(0.85, 0.12, 0.1) if not sparkler else Color(1, 1, 1), BARK, rng, 2, 5, 0.0)
		1:
			box(st, Vector3(0, 0, 0.05), Vector3(0.1, 0.06, 0.2), Color(0.85, 0.2, 0.2))
			box(st, Vector3(0, 0, 0.18), Vector3(0.1, 0.06, 0.06), Color(0.75, 0.75, 0.78))
		2:
			prism(st, Vector3.ZERO, 0.035, 0.035, 0.0, 5, Color(0.7, 0.55, 0.3), BARK)
			box(st, Vector3(0, 0, 0.35), Vector3(0.06, 0.06, 1.0), Color(0.72, 0.56, 0.32))
			blob(st, Vector3(0, 0, 0.88), Vector3(0.12, 0.12, 0.14), Color(0.55, 0.38, 0.2), BARK, rng, 3, 6, 0.1)
		3:
			box(st, Vector3(0, 0, 0.18), Vector3(0.14, 0.16, 0.42), Color(0.35, 0.36, 0.4))
			box(st, Vector3(0, -0.06, 0.48), Vector3(0.07, 0.07, 0.36), Color(0.55, 0.56, 0.6))
			box(st, Vector3(0, 0.12, 0.1), Vector3(0.18, 0.12, 0.2), Color(0.9, 0.35, 0.15))
		4:
			# A dragon-head glove puppet. It breathes for you.
			blob(st, Vector3(0, 0, 0.15), Vector3(0.16, 0.14, 0.24), Color(0.5, 0.22, 0.65), BARK, rng, 3, 6, 0.05)
			blob(st, Vector3(-0.08, 0.1, 0.25), Vector3(0.04, 0.04, 0.04), Color(1, 0.9, 0.3), GLOW, rng, 2, 4, 0.0)
			blob(st, Vector3(0.08, 0.1, 0.25), Vector3(0.04, 0.04, 0.04), Color(1, 0.9, 0.3), GLOW, rng, 2, 4, 0.0)
			cone(st, Vector3(-0.08, 0.1, 0.05), 0.04, 0.14, 4, Color(1, 0.9, 0.7), BARK)
			cone(st, Vector3(0.08, 0.1, 0.05), 0.04, 0.14, 4, Color(1, 0.9, 0.7), BARK)
		_:
			box(st, Vector3(0, 0, 0.4), Vector3(0.05, 0.05, 1.0), Color(0.3, 0.25, 0.45))
			blob(st, Vector3(0, 0, 0.95), Vector3(0.12, 0.12, 0.12), Color(0.6, 0.85, 1.0), GLOW, rng, 2, 5, 0.0)
	var m := _end(st)
	_cache[key] = m
	return m


static func tool_tip(i: int) -> Vector3:
	## Where the flame comes out, in the tool's own space.
	match i:
		0:
			return Vector3(0, 0, 0.46)
		1:
			return Vector3(0, 0.05, 0.18)
		2:
			return Vector3(0, 0.08, 0.92)
		3:
			return Vector3(0, -0.06, 0.68)
		4:
			return Vector3(0, 0.0, 0.38)
	return Vector3(0, 0, 1.0)
