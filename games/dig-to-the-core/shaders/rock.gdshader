shader_type spatial;
// The rock of the dig site (and the field's grass). Colour comes from the mesh
// (DigField._vertex_color): RGB = rock colour (ore veins tint it, nooks are
// darker), A = how much ore glints there. UV.x = how much the rock glows by
// itself (magma, the core), UV.y = 1 on grass.
//
// Every layer has its own hand-painted texture (textures/rock_layers.png, a
// texture array, one slice per layer: art/textures/make_layers.py) and its
// own way of using it (DigField.STYLE -> the per-layer uniforms below): how
// strong its strata are and how thick its beds, the colour of its second rock
// (in the beds and where the texture paints it), whether its lines are dark
// joints, glinting veins or glowing cracks. The texture is projected three
// ways and mixed at two scales so it doesn't repeat. The layer is worked out
// from the height (24 m each); the line between two layers wanders.
//
// Lighting: the headlamp (a soft spot) does the warm pool; a cool bounce,
// worked out here from the distance to the lamp, fills the walls beside and
// behind you so the pool never ends in a hard circle; the zone's dark fog
// (World._update_env) takes it to black. Note: the Compatibility renderer
// lights colours as they are, so colours here match the vertex colours.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D paint_tex : filter_linear_mipmap, repeat_enable;      // grass and packed earth up top
uniform sampler2DArray layer_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D strata_tex : filter_linear, repeat_enable;
uniform vec3 lamp_pos = vec3(0.0, 0.0, 0.0);
uniform float lamp_range = 11.0;
uniform vec3 hit_pos = vec3(0.0, 1000.0, 0.0);
uniform float hit_amount = 0.0;
uniform float hit_radius = 0.8;
uniform vec3 hit_color = vec3(1.0, 0.55, 0.2);
uniform float facet = 0.45;
uniform vec3 grass_dark = vec3(0.32, 0.38, 0.17);
uniform vec3 grass_light = vec3(0.56, 0.62, 0.3);
uniform vec3 bounce_color = vec3(0.3, 0.38, 0.5);
uniform float bounce = 0.0;          // 0 on the surface, about 1 underground (World)
uniform float zone_depth = 24.0;

// Per layer (DigField.STYLE):
uniform vec3 band_tint[10];          // the second rock in the beds, as a multiplier on the first
uniform vec3 fleck_tint[10];         // the second rock where the texture paints it (G)
uniform vec4 look[10];               // x strata strength, y beds per metre (x1 = the strip's own), z texture scale, w painted contrast
uniform vec4 lines[10];              // x how dark the lines (B) are, y how much they glow, z how much G shows, w how much they glint
uniform vec4 glow_color[10];         // rgb the glow in the lines, a a glow over the whole face (molten layers)

varying vec3 wpos;
varying vec3 wnrm;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

vec4 tri_layer(vec3 p, vec3 w, float s, float layer) {
	return texture(layer_tex, vec3(p.zy * s, layer)) * w.x
		+ texture(layer_tex, vec3(p.xz * s, layer)) * w.y
		+ texture(layer_tex, vec3(p.xy * s, layer)) * w.z;
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

	vec3 w = pow(abs(wnrm), vec3(4.0));
	w = w / (w.x + w.y + w.z);

	// Which layer: 24 m each, the boundary wanders.
	float yb = wpos.y + 0.7 * sin(wpos.x * 0.61 + wpos.z * 0.37) + 0.35 * sin(wpos.z * 1.3 - wpos.x * 0.4);
	int li = clamp(int(floor(-yb / zone_depth)), 0, 9);
	float L = float(li);
	vec4 lk = look[li];
	vec4 ln = lines[li];

	vec4 a = tri_layer(wpos, w, lk.z, L);
	// A second, bigger and rotated projection breaks the repeat.
	vec3 rp = vec3(wpos.x * 0.8 - wpos.z * 0.6, wpos.y, wpos.x * 0.6 + wpos.z * 0.8) + vec3(3.1, 1.7, 5.3);
	vec4 b = tri_layer(rp, w, lk.z * 0.37, L);
	float paint = mix(a.r, b.r, 0.32);
	float second = max(a.g, b.g * 0.75);
	float line = max(a.b, b.b * 0.65);
	float grit = a.a;

	float glint = COLOR.a;
	vec3 base = COLOR.rgb;

	// Up on the field: the grass, and packed bare earth on the paths and the
	// dig site's edge (from the old painted texture's grass channel).
	float topside = smoothstep(-1.2, -0.4, wpos.y);
	float under = 1.0 - topside;
	float clump = 0.5;
	float is_grass = 0.0;
	if (topside > 0.0) {
		clump = texture(paint_tex, wpos.xz * 0.23).a * 0.6 + texture(paint_tex, wpos.xz * 0.071 + vec2(0.3, 0.6)).a * 0.4;
		is_grass = step(0.5 + (clump - 0.5) * 0.8, UV.y);
	}

	// Strata: beds that wander a little, at the layer's own thickness. Each
	// is lighter or darker than the last, a little warmer or cooler, and is
	// either the layer's first rock or its second; a thin seam where two meet.
	float sy = (wpos.y + 0.35 * sin(wpos.x * 0.37 + wpos.z * 0.21) + 0.22 * sin(wpos.z * 0.53 - wpos.x * 0.11)) * lk.y;
	vec3 st = texture(strata_tex, vec2(sy / 64.0, 0.5)).rgb;
	float bandv = mix(1.0, st.r * 1.25, lk.x * 1.3);
	vec3 warmth = mix(vec3(0.95, 0.98, 1.03), vec3(1.04, 1.0, 0.94), fract(st.r * 7.31));
	float in_b = clamp(st.g * (0.6 + 0.4 * lk.x), 0.0, 1.0);
	vec3 tint = mix(vec3(1.0), band_tint[li], in_b);
	tint = mix(tint, tint * fleck_tint[li], clamp(second * ln.z, 0.0, 1.0));

	float shade = (1.0 + lk.w * (paint - 0.6)) * bandv * (0.94 + 0.12 * grit);
	shade *= 1.0 - ln.x * line;
	shade *= 1.0 - 0.22 * st.b * lk.x * step(0.55, grit);
	vec3 rock = base * tint * shade * warmth;

	// Packed earth on the field: barely any stone showing.
	vec3 earth = base * (0.86 + 0.3 * (paint - 0.6)) * (0.93 + 0.14 * grit);
	rock = mix(rock, earth, topside);

	vec3 grass = mix(grass_dark, grass_light, clump) * (base / vec3(0.48, 0.55, 0.25));
	ALBEDO = mix(rock, grass, is_grass);
	// The headlamp lights a pool metres away, so rock right at the lens
	// would blow out to flat colour: hold it down up close.
	ALBEDO *= mix(mix(0.5, 1.0, smoothstep(0.3, 1.9, length(VERTEX))), 1.0, topside);

	ROUGHNESS = mix(0.93, 0.35, max(glint, line * ln.w));
	METALLIC = glint * 0.4;
	SPECULAR = mix(0.22, 0.65, max(glint, line * ln.w));

	// The cool bounce: walls near you, beside and behind the beam, catch a
	// little cool light. Falls off well before the lamp's reach.
	float dl = distance(wpos, lamp_pos);
	float bf = clamp(1.0 - dl / (lamp_range * 0.62), 0.0, 1.0);
	bf *= bf;
	float face = 0.45 + 0.55 * clamp(dot(wnrm, normalize(lamp_pos - wpos)), 0.0, 1.0);
	vec3 emit = ALBEDO * bounce_color * (bounce * bf * face * under);

	// Ore sparkles: tiny cells that flash as you move, near your headlamp.
	float lamp = clamp(1.0 - dl / (lamp_range * 0.9), 0.0, 1.0);
	vec3 cell = floor(wpos * 11.0);
	float h = hash13(cell);
	vec3 vdir = normalize((INV_VIEW_MATRIX * vec4(VERTEX, 0.0)).xyz);
	float tw = sin(h * 60.0 + dot(vdir, vec3(9.0, 13.0, 7.0)) * 3.0);
	float sparkle = step(0.8, h) * smoothstep(0.55, 1.0, tw);
	emit += base * glint * (0.12 + 1.6 * sparkle) * lamp;
	// Veins that glint (the Crystal Caves): their own colour, flashing.
	emit += glow_color[li].rgb * line * ln.w * (0.08 + 0.9 * sparkle + 0.25 * lamp) * under;
	// Rock that glows by itself (magma, molten metal): only in its cracks and
	// seams, the crust between stays dark; the molten layers glow all over a
	// little too.
	float self_glow = UV.x;
	float hot = line * line * (0.6 + 0.4 * line);
	emit += glow_color[li].rgb * self_glow * (ln.y * hot * 2.6 + glow_color[li].a * (0.4 + 0.6 * paint));
	// Where the tool is working: a small hot spot, faded out right at the lens
	// so it can never fill the screen.
	float hd = distance(wpos, hit_pos) / max(hit_radius, 0.05);
	float near_fade = smoothstep(0.35, 1.3, length(VERTEX));
	emit += hit_color * hit_amount * clamp(1.0 - hd, 0.0, 1.0) * (0.5 + 0.8 * grit) * near_fade;
	EMISSION = emit;
}
