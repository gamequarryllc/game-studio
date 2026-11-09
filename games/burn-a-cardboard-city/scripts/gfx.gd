class_name Gfx
extends RefCounted
## Small shared drawing helpers: a soft round texture for puffs and sparks, and a
## configured CPUParticles3D (world-space, billboarded quads) for effects.

static var _dot: Texture2D
static var _chip: Texture2D


static func soft_dot() -> Texture2D:
	## A soft round blob. Built from an Image with mipmaps (gradient textures can
	## render particles black on WebGL).
	if _dot == null:
		var n := 64
		var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
		for y in n:
			for x in n:
				var d := Vector2(x + 0.5 - n * 0.5, y + 0.5 - n * 0.5).length() / (n * 0.5)
				var a := clampf(1.0 - d, 0.0, 1.0)
				img.set_pixel(x, y, Color(1, 1, 1, a * a * (3.0 - 2.0 * a)))
		img.generate_mipmaps()
		_dot = ImageTexture.create_from_image(img)
	return _dot


static func chip() -> Texture2D:
	## A torn little scrap of card, for confetti-ish bits and ash.
	if _chip == null:
		var n := 32
		var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
		var pts := PackedVector2Array([Vector2(4, 6), Vector2(27, 3), Vector2(29, 22), Vector2(17, 29), Vector2(3, 24)])
		for y in n:
			for x in n:
				var inside := Geometry2D.is_point_in_polygon(Vector2(x + 0.5, y + 0.5), pts)
				img.set_pixel(x, y, Color(1, 1, 1, 1.0 if inside else 0.0))
		img.generate_mipmaps()
		_chip = ImageTexture.create_from_image(img)
	return _chip


static func particles(amount: int, size: float, colors: Array, additive: bool = true, tex: Texture2D = null) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = amount
	p.emitting = false
	p.local_coords = false
	var quad := QuadMesh.new()
	quad.size = Vector2(size, size)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.billboard_keep_scale = true
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if additive:
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.vertex_color_use_as_albedo = true
	mat.albedo_texture = tex if tex != null else soft_dot()
	quad.material = mat
	p.mesh = quad
	if not colors.is_empty():
		ramp(p, colors)
	return p


static func ramp(p: CPUParticles3D, colors: Array) -> void:
	var g := Gradient.new()
	var offs := PackedFloat32Array()
	var cols := PackedColorArray()
	for k in colors.size():
		offs.append(float(k) / float(maxi(1, colors.size() - 1)))
		cols.append(colors[k])
	g.offsets = offs
	g.colors = cols
	p.color_ramp = g


static func curve(a: float, b: float) -> Curve:
	var c := Curve.new()
	c.add_point(Vector2(0, a))
	c.add_point(Vector2(1, b))
	return c


static func clear() -> void:
	_dot = null
	_chip = null
