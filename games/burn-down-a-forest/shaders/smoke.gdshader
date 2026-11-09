shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
// Puffs of cursed smoke rising off the fire, looping on their own in the
// shader. INSTANCE_CUSTOM r = seed, g = size, b = how dark (0 = violet wisp of
// the curse lifting, 1 = sooty), a = rise speed.

uniform vec2 wind = vec2(0.6, -0.4);
uniform sampler2D puff : filter_linear_mipmap;
uniform vec3 wisp : source_color = vec3(0.42, 0.36, 0.5);
uniform vec3 soot : source_color = vec3(0.17, 0.13, 0.19);

varying float v_t;
varying float v_dark;
varying float v_near;

void vertex() {
	float seed = INSTANCE_CUSTOM.r;
	float t = fract(TIME * (0.12 + 0.12 * INSTANCE_CUSTOM.a) + seed);
	v_t = t;
	v_dark = INSTANCE_CUSTOM.b;
	vec3 o = MODEL_MATRIX[3].xyz;
	float size = INSTANCE_CUSTOM.g * (0.5 + 1.6 * t);
	o.y += t * (5.0 + 4.0 * INSTANCE_CUSTOM.g);
	o.xz += wind * t * t * 4.0 + vec2(sin(seed * 40.0 + t * 3.0), cos(seed * 31.0 + t * 2.0)) * t * 0.8;
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	vec3 p = o + (right * VERTEX.x + up * VERTEX.y) * size;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
	v_near = smoothstep(2.0, 6.0, distance(o, INV_VIEW_MATRIX[3].xyz));
}

void fragment() {
	float a = texture(puff, UV).a;
	vec3 col = mix(wisp, soot, v_dark);
	ALBEDO = col;
	ALPHA = a * smoothstep(0.0, 0.12, v_t) * (1.0 - v_t) * 0.6 * v_near;
}
