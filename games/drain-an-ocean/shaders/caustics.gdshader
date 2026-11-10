shader_type spatial;
render_mode blend_add, unshaded, cull_back, depth_draw_never;
// Aquarium caustics: drawn as an overlay over the tank's own materials.
// Bright wandering ribbons of light (the edges of slowly moving cells, two
// layers drifting different ways), strongest on what faces up and fading
// with depth below the surface. No straight-line net.

uniform float game_time = 0.0;
uniform float surface_y = 6.0;
uniform vec3 tint : source_color = vec3(0.85, 1.0, 0.92);
uniform float strength = 0.32;

varying vec3 v_world;
varying vec3 v_normal;

vec2 hash2(vec2 p) {
	p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
	return fract(sin(p) * 43758.5453);
}

float ribbons(vec2 p, float t) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float d1 = 8.0;
	float d2 = 8.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 o = hash2(i + g);
			o = 0.5 + 0.42 * sin(t + 6.2831 * o);
			float d = length(g + o - f);
			if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
		}
	}
	return 1.0 - smoothstep(0.0, 0.11, d2 - d1);
}

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec2 p = v_world.xz * 0.55 + vec2(v_world.y * 0.15, 0.0);
	float t = game_time;
	float c = ribbons(p + vec2(t * 0.05, t * 0.03), t * 0.6) * 0.7 + ribbons(p * 1.7 - vec2(t * 0.04, -t * 0.05), t * 0.8 + 2.0) * 0.45;
	float up = smoothstep(-0.1, 0.8, v_normal.y);
	float depth = clamp((surface_y - v_world.y) / surface_y, 0.0, 1.0);
	float k = c * up * mix(1.0, 0.45, depth) * strength;
	ALBEDO = tint * k;
}
