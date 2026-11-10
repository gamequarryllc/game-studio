shader_type spatial;
// The rock of the dig site (and the field's grass). Colour comes from each
// layer's hand-painted texture (textures/rock_walls.png, a texture array from
// art/textures/make_rock.py): slices 0-9 are the layers as seen on a wall
// (flat beds, bedding lines, hard-edged stones with a lit top and a contact
// shadow), slices 10-19 the same rock on a floor or a roof. One main colour
// per layer; the mesh's vertex colour (DigField._vertex_color) only darkens
// the nooks, shifts the second rock a little and tints ore veins. COLOR.a =
// how much ore glints there. UV.x = how much the rock glows by itself (magma,
// the core), UV.y = 1 on grass.
//
// Walls: the tile repeats every 1 / tex metres; each row of tiles slides
// sideways by its own amount (the tile's top and bottom edge is a straight
// bedding line, so the seam hides in it) to break up the repeat. The folded
// Mantle doesn't slide. Projections are blended over a narrow band only, so
// no ghost of a second copy shows through.
//
// Lighting: the headlamp is worked out here (headlamp.gdshaderinc); other
// lights (lava, landmarks, the sun up top) light ALBEDO as usual. The layer's
// dark fog (World._update_env) takes what's left to black.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

#include "res://shaders/headlamp.gdshaderinc"

uniform sampler2D paint_tex : filter_linear_mipmap, repeat_enable;      // grass and packed earth up top
uniform sampler2DArray wall_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform vec3 hit_pos = vec3(0.0, 1000.0, 0.0);
uniform float hit_amount = 0.0;
uniform float hit_radius = 0.8;
uniform vec3 hit_color = vec3(1.0, 0.55, 0.2);
uniform float facet = 0.3;
uniform vec3 grass_dark = vec3(0.32, 0.38, 0.17);
uniform vec3 grass_light = vec3(0.56, 0.62, 0.3);
uniform float zone_depth = 24.0;

// Per layer (DigField.STYLE):
uniform vec3 base_ref[10];           // the layer's main rock colour in the mesh (vertex colour / this = shading)
uniform vec4 look[10];               // x texture scale (tiles per metre), y rows slide (1/0), z how much vertex hue shows, w A glints
uniform vec4 glow_color[10];         // rgb the glow in A's lines, a a glow over the whole face (molten layers)
uniform float glow_amt[10];          // how hot A's lines glow

varying vec3 wpos;
varying vec3 wnrm;

float hash11(float n) {
	return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

vec4 wall_sample(vec2 uv, float layer, float slide) {
	// uv.y runs down the wall (texture rows go down); each row slides sideways.
	vec2 dx = dFdx(uv);
	vec2 dy = dFdy(uv);
	float row = floor(uv.y);
	vec2 u2 = uv;
	u2.x += slide * hash11(row + layer * 17.0) * 7.0;
	return textureGrad(wall_tex, vec3(u2, layer), dx, dy);
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	// Facets: a little of the flat face normal mixed in.
	vec3 fn = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	if (dot(fn, VERTEX) > 0.0) {
		fn = -fn;
	}
	NORMAL = normalize(mix(NORMAL, fn, facet));
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);

	// Which layer: 24 m each, the boundary wanders.
	float yb = wpos.y + 0.7 * sin(wpos.x * 0.61 + wpos.z * 0.37) + 0.35 * sin(wpos.z * 1.3 - wpos.x * 0.4);
	int li = clamp(int(floor(-yb / zone_depth)), 0, 9);
	float L = float(li);
	vec4 lk = look[li];

	// Narrow projection blends: a wall is a wall, a floor a floor.
	vec3 w = pow(abs(wnrm), vec3(8.0));
	w /= (w.x + w.y + w.z);
	float s = lk.x;
	vec4 tx = wall_sample(vec2(wpos.z, -wpos.y) * s, L, lk.y);
	vec4 tz = wall_sample(vec2(wpos.x, -wpos.y) * s, L, lk.y);
	vec4 ty = texture(wall_tex, vec3(wpos.xz * s * 0.9, L + 10.0));
	vec4 t = tx * w.x + tz * w.z + ty * w.y;

	float glint = COLOR.a;
	vec3 base = COLOR.rgb;
	// The vertex colour against the layer's own main rock: its brightness is
	// the nooks' shade (and the second rock a little lighter or darker), its
	// hue only a touch (ore veins).
	vec3 ref = max(base_ref[li], vec3(0.02));
	vec3 m = base / ref;
	float ml = clamp(dot(m, vec3(0.3, 0.5, 0.2)), 0.25, 1.25);
	vec3 hue = m / max(dot(m, vec3(0.3, 0.5, 0.2)), 0.05);
	vec3 rock = t.rgb * ml * mix(vec3(1.0), clamp(hue, vec3(0.5), vec3(1.8)), lk.z);

	// Up on the field: the grass, and packed bare earth on the paths and the
	// dig site's edge.
	float topside = smoothstep(-1.2, -0.4, wpos.y);
	float under = 1.0 - topside;
	float clump = 0.5;
	float is_grass = 0.0;
	if (topside > 0.0) {
		vec4 pt = texture(paint_tex, wpos.xz * 0.43);
		clump = texture(paint_tex, wpos.xz * 0.23).a * 0.6 + texture(paint_tex, wpos.xz * 0.071 + vec2(0.3, 0.6)).a * 0.4;
		is_grass = step(0.5 + (clump - 0.5) * 0.8, UV.y);
		vec3 earth = base * (0.86 + 0.3 * (pt.r - 0.6));
		// The walls of a hole in the field: the topsoil's own painted wall
		// (beds, roots, stones) under a ragged band of matted turf, its grass
		// fringe at the lip and a dark shadow line under it. Bare earth only
		// on the flat (paths, the floor of a shallow scrape).
		float flatness = smoothstep(0.5, 0.8, wnrm.y);
		float turf_line = -0.2 + 0.035 * sin(wpos.x * 7.3 + wpos.z * 4.1) + 0.02 * sin(wpos.z * 13.0 - wpos.x * 5.0);
		vec3 wallc = rock * 1.7;
		if (wpos.y > turf_line) {
			wallc = mix(vec3(0.07, 0.055, 0.03), vec3(0.11, 0.12, 0.05), smoothstep(turf_line, 0.0, wpos.y));
			wallc = mix(wallc, grass_dark * 0.75, step(-0.035, wpos.y));
		} else if (wpos.y > turf_line - 0.03) {
			wallc *= 0.45;
		}
		rock = mix(rock, mix(wallc, earth, flatness), topside);
	}
	vec3 grass = mix(grass_dark, grass_light, clump) * (base / vec3(0.48, 0.55, 0.25));
	ALBEDO = mix(rock, grass, is_grass);

	float line = t.a;
	ROUGHNESS = mix(0.93, 0.3, max(glint, line * lk.w));
	METALLIC = glint * 0.3;
	SPECULAR = mix(0.2, 0.7, max(glint, line * lk.w));

	// The headlamp.
	vec3 hl = headlamp_terms(wpos, nw, INV_VIEW_MATRIX);
	vec3 emit = headlamp_light(ALBEDO, hl) * under;

	// Ore glints: tiny cells that flash as you move, only inside the beam.
	float inbeam = clamp(hl.y * 2.0, 0.0, 1.0) * lamp_on;
	vec3 cell = floor(wpos * 11.0);
	float h = hash13(cell);
	vec3 vdir = normalize((INV_VIEW_MATRIX * vec4(VERTEX, 0.0)).xyz);
	float tw = sin(h * 60.0 + dot(vdir, vec3(9.0, 13.0, 7.0)) * 3.0);
	float sparkle = step(0.78, h) * smoothstep(0.5, 1.0, tw);
	emit += base * glint * (0.1 + 2.4 * sparkle) * inbeam * under;
	// Veins that glint (the Crystal Caves): their own colour, flashing in the beam.
	emit += glow_color[li].rgb * line * lk.w * (0.015 + 0.3 * inbeam + 1.2 * sparkle * inbeam) * under;
	// Rock that glows by itself (lava, molten metal): in its painted cracks and
	// seams, hotter in the glowing rock; the molten layers glow all over a little.
	float self_glow = UV.x;
	emit += glow_color[li].rgb * (glow_amt[li] * line * (0.45 + 0.55 * clamp(self_glow * 2.0, 0.0, 1.0)) * 2.2
		+ glow_color[li].a * self_glow) * under;
	// Where the tool is working: a small hot spot, faded out right at the lens.
	float hd = distance(wpos, hit_pos) / max(hit_radius, 0.05);
	float near_fade = smoothstep(0.35, 1.3, length(VERTEX));
	emit += hit_color * hit_amount * clamp(1.0 - hd, 0.0, 1.0) * 0.8 * near_fade;
	EMISSION = emit;
}
