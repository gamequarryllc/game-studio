shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
// Soft grey puffs rising off the fires, looping on their own. Smoke from burning
// cardboard is pale and woolly, darker low down. INSTANCE_CUSTOM r = seed,
// g = size, b = how dark (0 pale, 1 sooty), a = rise speed.

uniform vec2 wind = vec2(0.6, -0.4);
uniform sampler2D puff : filter_linear_mipmap;
uniform vec3 pale : source_color = vec3(0.78, 0.78, 0.8);
uniform vec3 soot : source_color = vec3(0.24, 0.23, 0.24);

varying float v_t;
varying float v_dark;
varying float v_near;

void vertex() {
	float seed = INSTANCE_CUSTOM.r;
	float t = fract(TIME * (0.1 + 0.1 * INSTANCE_CUSTOM.a) + seed);
	v_t = t;
	v_dark = INSTANCE_CUSTOM.b;
	vec3 o = MODEL_MATRIX[3].xyz;
	float size = INSTANCE_CUSTOM.g * (0.45 + 1.7 * t);
	o.y += t * (2.5 + 3.0 * INSTANCE_CUSTOM.g);
	o.xz += wind * t * t * 3.0 + vec2(sin(seed * 40.0 + t * 3.0), cos(seed * 31.0 + t * 2.0)) * t * 0.5;
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	vec3 p = o + (right * VERTEX.x + up * VERTEX.y) * size;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
	v_near = smoothstep(1.0, 3.5, distance(o, INV_VIEW_MATRIX[3].xyz));
}

void fragment() {
	float a = texture(puff, UV).a;
	ALBEDO = mix(soot, pale, clamp(v_t * 1.4 - v_dark * 0.6, 0.0, 1.0));
	ALPHA = a * smoothstep(0.0, 0.15, v_t) * (1.0 - v_t) * 0.5 * v_near;
}
