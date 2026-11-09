shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_opaque, fog_disabled;
// Sparks off the fires: hard little orange specks (not soft blobs) rising from each
// burning building, wiggling, carried the way the fans blow, cooling to red and
// winking out. Each instance loops on its own; the CPU only says where the fires are.
// INSTANCE_CUSTOM r = seed, g = strength 0..1, b = how wide the fire is (m), a = how high they rise (m).

uniform vec2 wind = vec2(0.6, -0.4);

varying float v_t;
varying float v_seed;

float hash(float n) {
	return fract(sin(n * 91.345) * 43758.5453);
}

void vertex() {
	float seed = INSTANCE_CUSTOM.r;
	float speed = 0.45 + 0.5 * hash(seed * 7.1);
	float t = fract(TIME * speed + seed * 3.7);
	float cycle = floor(TIME * speed + seed * 3.7);
	v_t = t;
	v_seed = seed;
	vec3 o = MODEL_MATRIX[3].xyz;
	float a = hash(seed * 13.3 + cycle * 1.7) * 6.2832;
	float r = INSTANCE_CUSTOM.b * (0.15 + 0.5 * hash(seed * 5.9 + cycle));
	vec3 p = o + vec3(cos(a) * r, 0.0, sin(a) * r);
	float rise = INSTANCE_CUSTOM.a * (0.6 + 0.6 * hash(seed * 3.3 + cycle * 0.7));
	p.y += t * rise;
	p.xz += wind * (t * t) * rise * 0.9;
	p.x += sin(t * 9.0 + seed * 40.0) * 0.12 * t;
	p.z += cos(t * 7.0 + seed * 31.0) * 0.12 * t;
	float size = 0.035 * (0.6 + 0.8 * hash(seed * 17.0)) * (1.0 - t * 0.6) * step(t, 0.92) * INSTANCE_CUSTOM.g;
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	p += (right * VERTEX.x + up * VERTEX.y) * size * vec3(1.0);
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
}

void fragment() {
	vec2 q = UV * 2.0 - 1.0;
	float d = dot(q, q);
	if (d > 1.0) {
		discard;
	}
	vec3 hot = vec3(1.0, 0.72, 0.28);
	vec3 orange = vec3(1.0, 0.45, 0.1);
	vec3 red = vec3(0.75, 0.16, 0.05);
	vec3 col = v_t < 0.3 ? mix(hot, orange, v_t / 0.3) : mix(orange, red, (v_t - 0.3) / 0.7);
	ALBEDO = col * (1.6 - v_t * 0.9);
}
