class_name ChartMarks
extends RefCounted
## Tap markers drawn as Admiralty chart symbols, lying flat on the seabed:
## a stranded animal gets a position circle (a dashed ink ring with four
## ticks), a find gets the obstruction cross (a plus with a dot in each
## quarter) in rust. Each sits on a soft paper halo so it reads on wet sand
## and on dry. Drawn once into small textures.

static var _circle: Texture2D
static var _cross: Texture2D
static var _puff: Texture2D

const INK := Color(0.11, 0.165, 0.2)
const RUST := Color(0.549, 0.267, 0.145)
const PAPER := Color(0.953, 0.918, 0.827)


static func _blend(img: Image, x: int, y: int, c: Color, a: float) -> void:
	if x < 0 or y < 0 or x >= img.get_width() or y >= img.get_height() or a <= 0.0:
		return
	var o := img.get_pixel(x, y)
	var na := a + o.a * (1.0 - a)
	if na <= 0.0001:
		return
	var rgb := (Color(c.r, c.g, c.b) * a + Color(o.r, o.g, o.b) * o.a * (1.0 - a)) / na
	img.set_pixel(x, y, Color(rgb.r, rgb.g, rgb.b, na))


static func position_circle() -> Texture2D:
	if _circle != null:
		return _circle
	var s := 160
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var c := s * 0.5
	for y in s:
		for x in s:
			var dx := (x + 0.5 - c) / c
			var dy := (y + 0.5 - c) / c
			var r := sqrt(dx * dx + dy * dy)
			var ang := atan2(dy, dx)
			# paper halo under the ring
			var halo := clampf(1.0 - absf(r - 0.7) / 0.2, 0.0, 1.0)
			_blend(img, x, y, PAPER, halo * halo * 0.55)
			# the dashed ring: 16 dashes
			var dash := fmod(ang / TAU * 16.0 + 16.0, 1.0)
			var ring := clampf(1.0 - absf(r - 0.7) / 0.035, 0.0, 1.0)
			if dash < 0.62:
				_blend(img, x, y, INK, ring * 0.95)
			# four ticks pointing outwards, N/E/S/W
			for k in 4:
				var ta := k * PI * 0.5
				var along := dx * cos(ta) + dy * sin(ta)
				var across := -dx * sin(ta) + dy * cos(ta)
				if along > 0.78 and along < 0.95 and absf(across) < 0.025:
					_blend(img, x, y, INK, 0.95)
			# a small centre dot
			if r < 0.045:
				_blend(img, x, y, INK, 0.9)
	_circle = ImageTexture.create_from_image(img)
	return _circle


static func find_cross() -> Texture2D:
	if _cross != null:
		return _cross
	var s := 128
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var c := s * 0.5
	for y in s:
		for x in s:
			var dx := (x + 0.5 - c) / c
			var dy := (y + 0.5 - c) / c
			var r := sqrt(dx * dx + dy * dy)
			var halo := clampf(1.0 - r / 0.62, 0.0, 1.0)
			_blend(img, x, y, PAPER, smoothstep(0.0, 0.5, halo) * 0.6)
			var arm := (absf(dx) < 0.045 and absf(dy) < 0.42) or (absf(dy) < 0.045 and absf(dx) < 0.42)
			if arm:
				_blend(img, x, y, RUST, 0.95)
			for q in [Vector2(0.2, 0.2), Vector2(-0.2, 0.2), Vector2(0.2, -0.2), Vector2(-0.2, -0.2)]:
				if Vector2(dx, dy).distance_to(q) < 0.06:
					_blend(img, x, y, RUST, 0.95)
	_cross = ImageTexture.create_from_image(img)
	return _cross


static func puff() -> Texture2D:
	## A soft smoke puff for the pumps' exhausts, a little lumpy.
	if _puff != null:
		return _puff
	var s := 64
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	var c := s * 0.5
	for y in s:
		for x in s:
			var dx := (x + 0.5 - c) / c
			var dy := (y + 0.5 - c) / c
			var r := sqrt(dx * dx + dy * dy)
			var lump := 0.12 * sin(atan2(dy, dx) * 5.0 + 1.3) + 0.06 * sin(atan2(dy, dx) * 9.0)
			var a := clampf(1.0 - r / (0.82 + lump), 0.0, 1.0)
			a = a * a * (3.0 - 2.0 * a)
			var shade := 1.0 - 0.25 * clampf(dy * 0.5 + 0.5, 0.0, 1.0)
			img.set_pixel(x, y, Color(shade, shade, shade * 0.98, a))
	_puff = ImageTexture.create_from_image(img)
	return _puff
