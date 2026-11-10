shader_type spatial;
render_mode blend_mix, cull_back, depth_draw_opaque, diffuse_lambert, specular_schlick_ggx;
// Every body of water in the bay, in one mesh. Each vertex takes the level of
// the body it belongs to (body_tex + levels, the same lookup as the seabed;
// a dry vertex beside a body takes its level), so the water's edge meets the
// sand exactly at the shoreline.
//
// The look: clear over the sand at the very edge, shoal green over the
// shallows, deepening to teal and then a dark blue-green over the deeps;
// foam that breaks up into lace along the edge with the odd streak lying
// off it (never one even white line); a gentle crossing chop in the normal;
// and sun glitter, sparse points that twinkle, warmer and thicker towards
// the sun's side of the bay.

uniform sampler2D body_tex : filter_nearest;
uniform float levels[32];
uniform float grid_w = 257.0;
uniform float game_time = 0.0;
uniform vec3 shallow_col : source_color = vec3(0.31, 0.66, 0.61);
uniform vec3 mid_col : source_color = vec3(0.16, 0.47, 0.49);
uniform vec3 deep_col : source_color = vec3(0.06, 0.3, 0.36);
uniform vec3 abyss_col : source_color = vec3(0.035, 0.19, 0.24);
uniform vec3 foam_col : source_color = vec3(0.95, 0.92, 0.83);
uniform vec3 sun_dir = vec3(-0.85, 0.3, 0.42);
uniform vec3 sun_col : source_color = vec3(1.0, 0.85, 0.62);

varying float v_depth;
varying vec3 v_world;

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
	float h = UV2.x;
	float y = h - 2.0;
	if (slot < 32) {
		y = levels[slot];
	} else {
		float best = -1000.0;
		int s1 = slot_at(c + ivec2(1, 0));
		int s2 = slot_at(c + ivec2(-1, 0));
		int s3 = slot_at(c + ivec2(0, 1));
		int s4 = slot_at(c + ivec2(0, -1));
		if (s1 < 32) { best = max(best, levels[s1]); }
		if (s2 < 32) { best = max(best, levels[s2]); }
		if (s3 < 32) { best = max(best, levels[s3]); }
		if (s4 < 32) { best = max(best, levels[s4]); }
		if (best > -999.0) { y = best; }
	}
	float d = y - h;
	float sw = sin(VERTEX.x * 0.31 + game_time * 1.1) * sin(VERTEX.z * 0.27 - game_time * 0.83) * 0.03 * clamp(d * 0.4, 0.0, 1.0);
	VERTEX.y = y + sw;
	v_depth = d;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float d = v_depth;
	if (d <= 0.0) {
		discard;
	}
	vec2 p = v_world.xz;
	float t = game_time;
	float dist = length(VERTEX);
	float near = 1.0 - smoothstep(30.0, 140.0, dist);
	// --- Colour by depth.
	vec3 col = mix(shallow_col, mid_col, smoothstep(0.3, 2.2, d));
	col = mix(col, deep_col, smoothstep(2.0, 6.5, d));
	col = mix(col, abyss_col, smoothstep(6.0, 16.0, d));
	float alpha = mix(0.22, 0.96, smoothstep(0.0, 3.2, d));
	// --- Foam: lace along the edge, broken into patches, and the odd streak lying off it.
	float n1 = vnoise(p * 0.9 + vec2(t * 0.11, -t * 0.07));
	float n2 = vnoise(p * 2.6 - vec2(t * 0.19, t * 0.13));
	float n3 = vnoise(p * 0.16 + 4.0);
	float width = 0.1 + 0.22 * n3;
	float edge = 1.0 - smoothstep(width * 0.3, width, d);
	float lace = smoothstep(0.38, 0.62, n1 * 0.65 + n2 * 0.55);
	float breath = 0.32 + 0.12 * sin(t * 0.7 + n3 * 6.0);
	float streak = (1.0 - smoothstep(0.0, 0.045, abs(d - breath))) * step(d, 0.8) * smoothstep(0.55, 0.75, n2 * 0.6 + n3 * 0.5);
	float foam = max(edge * lace, streak * 0.8) * mix(0.55, 1.0, near);
	col = mix(col, foam_col, foam * 0.92);
	alpha = max(alpha, foam * 0.9);
	// --- A gentle crossing chop in the normal.
	float e = 0.5;
	vec2 w1 = vec2(0.8, 0.6);
	vec2 w2 = vec2(-0.45, 0.9);
	float hx = cos(dot(p, w1) * 1.3 + t * 1.4) * w1.x * 0.5 + cos(dot(p, w2) * 1.9 - t * 1.1) * w2.x * 0.35;
	float hz = cos(dot(p, w1) * 1.3 + t * 1.4) * w1.y * 0.5 + cos(dot(p, w2) * 1.9 - t * 1.1) * w2.y * 0.35;
	hx += (vnoise(p * 1.1 + t * 0.4) - 0.5) * 0.5 * near;
	hz += (vnoise(p * 1.1 - t * 0.37 + 7.0) - 0.5) * 0.5 * near;
	vec3 nw = normalize(vec3(-hx * 0.12, 1.0, -hz * 0.12));
	NORMAL = normalize((VIEW_MATRIX * vec4(nw, 0.0)).xyz);
	// --- Sun glitter: sparse twinkling points, thicker on the sun's side.
	vec3 V = normalize((INV_VIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz - v_world);
	vec3 R = reflect(-V, nw);
	float lobe = smoothstep(-0.35, 0.75, dot(R, normalize(sun_dir)));
	vec2 cellp = p * 2.2;
	vec2 ci = floor(cellp);
	float slot_t = floor(t * 3.0 + hash(ci) * 7.0);
	float pick = hash(ci + slot_t * 0.137);
	vec2 cf = fract(cellp) - 0.5;
	float pt = 1.0 - smoothstep(0.0, 0.16, length(cf));
	float glint = step(0.93 - 0.1 * lobe, pick) * pt * lobe * smoothstep(0.6, 2.0, d) * (1.0 - foam);
	glint *= 1.0 - smoothstep(60.0, 200.0, dist) * 0.6;
	ALBEDO = col;
	ALPHA = alpha;
	EMISSION = sun_col * glint * 1.6;
	ROUGHNESS = mix(0.06, 0.85, foam);
	SPECULAR = 0.5;
}
