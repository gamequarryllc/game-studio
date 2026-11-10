shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;
// The seabed and the shore. Colour comes from the painted vertex colours
// (art/bay/make_bay.py; alpha is the sand mask); water levels come from the
// Bay: every vertex looks up which body of water it belongs to (body_tex) and
// that body's level, and a dry vertex beside a body takes the highest
// neighbour's level, so the shoreline meets the water exactly.
//
// Painted detail, all with a direction: ripple marks on the sand, every
// crest running the same way (the old flood current), steep on their lee
// side so the low sun catches them; salt-white tide lines where the water
// stood each metre on the way down, stronger at the old ring depths; wet
// sand dark and glossy by the water, drying back as it leaves. The deep
// bay stays cooler and darker so the eye falls down into it.

uniform sampler2D body_tex : filter_nearest;
uniform sampler2D drained_tex : filter_nearest;
uniform float levels[32];
uniform float grid_w = 257.0;
uniform float game_time = 0.0;
uniform vec3 under_tint : source_color = vec3(0.55, 0.78, 0.74);
uniform vec3 deep_tint : source_color = vec3(0.42, 0.55, 0.62);
uniform vec3 ink : source_color = vec3(0.11, 0.165, 0.2);
uniform vec3 salt : source_color = vec3(0.95, 0.93, 0.86);
uniform vec2 ripple_dir = vec2(0.86, -0.51);
uniform float ripple_len = 0.5;

varying float v_water;
varying float v_has;
varying float v_age;
varying vec3 v_world;

vec3 to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

int slot_at(ivec2 c) {
	ivec2 q = clamp(c, ivec2(0), ivec2(int(grid_w) - 1));
	return int(round(texelFetch(body_tex, q, 0).r * 255.0));
}

void vertex() {
	ivec2 c = ivec2(round(UV * (grid_w - 1.0)));
	int slot = slot_at(c);
	float lvl = -1000.0;
	bool has = false;
	if (slot < 32) {
		lvl = levels[slot];
		has = true;
	} else {
		int s1 = slot_at(c + ivec2(1, 0));
		int s2 = slot_at(c + ivec2(-1, 0));
		int s3 = slot_at(c + ivec2(0, 1));
		int s4 = slot_at(c + ivec2(0, -1));
		if (s1 < 32) { lvl = max(lvl, levels[s1]); has = true; }
		if (s2 < 32) { lvl = max(lvl, levels[s2]); has = true; }
		if (s3 < 32) { lvl = max(lvl, levels[s3]); has = true; }
		if (s4 < 32) { lvl = max(lvl, levels[s4]); has = true; }
	}
	v_has = has ? 1.0 : 0.0;
	v_water = has ? lvl : VERTEX.y - 3.0;
	v_age = game_time - texelFetch(drained_tex, c, 0).r;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 col = to_linear(COLOR.rgb);
	float sandm = COLOR.a;
	vec2 p = v_world.xz;
	float y = v_world.y;
	float depth = v_water - y;              // > 0 under water
	float above = -depth;
	float dist = length(VERTEX);
	// --- Ripple marks: one direction everywhere, gently sinuous, asymmetric.
	vec2 rd = normalize(ripple_dir);
	float warp = (vnoise(p * 0.11) - 0.5) * 7.0 + (vnoise(p * 0.37 + 3.1) - 0.5) * 1.6;
	float ph = dot(p, rd) / ripple_len + warp;
	float fw = fwidth(ph);
	float fade = (1.0 - smoothstep(0.07, 0.22, fw)) * sandm;
	float r = fract(ph);
	// gentle stoss rising over most of the wavelength, a short steep lee
	float prof = smoothstep(0.0, 0.78, r) * (1.0 - smoothstep(0.78, 1.0, r));
	float dprof = r < 0.78 ? 1.0 : -2.2;
	float patch = smoothstep(0.25, 0.65, vnoise(p * 0.045 + 7.0));
	float ramp = fade * mix(0.45, 1.0, patch) * (1.0 - smoothstep(-0.2, 1.2, y));   // only below the old high water
	col *= 1.0 + (prof - 0.5) * 0.07 * ramp;
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	nw.xz -= rd * dprof * 0.07 * ramp;
	// --- Wet and dry.
	float damp_level = (1.0 - smoothstep(0.0, 1.6, above)) * v_has;
	float damp_age = 1.0 - smoothstep(0.0, 45.0, v_age);
	float damp = clamp(max(damp_level, damp_age), 0.0, 1.0);
	float rough = 0.93;
	float spec = 0.22;
	if (depth > 0.0) {
		// Under water: cooler and darker with depth (the water draws its own colour on top).
		float uw = smoothstep(0.0, 6.0, depth);
		col *= mix(under_tint, under_tint * 0.4, uw);
		col *= 0.62;
		rough = 0.8;
	} else {
		col *= mix(1.0, 0.55, damp);
		rough = mix(0.94, 0.3, damp);
		spec = mix(0.2, 0.6, damp);
		// A fringe of wrack and foam scum just above the water's edge.
		float n1 = vnoise(p * 1.7);
		float wrack = (1.0 - smoothstep(0.03, 0.09, abs(above - 0.14 - 0.06 * n1))) * v_has * smoothstep(0.35, 0.6, vnoise(p * 0.8 + 2.0));
		col = mix(col, col * vec3(0.5, 0.46, 0.38), wrack * 0.55);
		// Tide lines on the drained seabed: a thin salt line where the water
		// stood each metre (bolder at the ring depths), a damp stain under it.
		if (y < -0.4 && y > -24.0) {
			float yy = y + (vnoise(p * 0.21) - 0.5) * 0.16;
			float fy = fwidth(yy) + 0.004;
			float m = fract(-yy);                  // 0 right at a whole metre, rising downwards
			float line = 1.0 - smoothstep(0.0, max(fy * 1.4, 0.025), m);
			float stain = (1.0 - smoothstep(0.0, 0.22, m)) * 0.5;
			float ring = 0.0;
			for (int k = 0; k < 5; k++) {
				float b = k == 0 ? -3.0 : (k == 1 ? -7.0 : (k == 2 ? -11.0 : (k == 3 ? -15.0 : -20.0)));
				ring = max(ring, 1.0 - smoothstep(0.0, max(fy * 1.6, 0.04), abs(yy - b)));
			}
			float broken = smoothstep(0.3, 0.55, vnoise(p * 0.5 + 11.0));
			float aged = smoothstep(20.0, 90.0, v_age);
			col = mix(col, col * 0.86, stain * broken * aged * 0.6);
			col = mix(col, to_linear(salt), max(line * 0.22 * broken, ring * 0.38 * mix(0.6, 1.0, broken)) * aged);
		}
	}
	// --- The deep bay stays cool and in shadow (dry or not).
	float deep = smoothstep(-3.0, -23.0, y);
	col *= mix(vec3(1.0), deep_tint, deep * 0.55);
	// Value over saturation.
	col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, 0.82);
	ALBEDO = col;
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(nw), 0.0)).xyz);
	ROUGHNESS = rough;
	SPECULAR = spec;
}
