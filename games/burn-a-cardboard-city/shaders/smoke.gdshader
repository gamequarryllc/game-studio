shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
// Smoke cut from grey tissue paper (models/smoke.png: four torn pieces), rising off the
// fires and drifting the way the fans blow, turning slowly, darker and sootier low
// down, paling and fading as it goes up. Loops on its own.
// INSTANCE_CUSTOM r = seed, g = size, b = how dark (0 pale, 1 sooty), a = rise speed.

uniform vec2 wind = vec2(0.6, -0.4);
uniform sampler2D tissue : source_color, filter_linear_mipmap, repeat_disable;
uniform vec3 pale : source_color = vec3(0.46, 0.44, 0.43);
uniform vec3 soot : source_color = vec3(0.13, 0.12, 0.115);

varying float v_t;
varying float v_dark;
varying float v_near;
varying float v_piece;

void vertex() {
	float seed = INSTANCE_CUSTOM.r;
	float t = fract(TIME * (0.07 + 0.07 * INSTANCE_CUSTOM.a) + seed);
	v_t = t;
	v_dark = INSTANCE_CUSTOM.b;
	v_piece = floor(fract(seed * 7.13) * 3.999);
	vec3 o = MODEL_MATRIX[3].xyz;
	float size = INSTANCE_CUSTOM.g * (0.6 + 2.0 * t);
	o.y += t * (2.2 + 2.6 * INSTANCE_CUSTOM.g);
	o.xz += wind * (t * 2.0 + t * t * 4.0) + vec2(sin(seed * 40.0 + t * 3.0), cos(seed * 31.0 + t * 2.0)) * t * 0.4;
	float a = seed * 6.28 + t * (seed - 0.5) * 2.0;
	vec2 r = vec2(cos(a) * VERTEX.x - sin(a) * VERTEX.y, sin(a) * VERTEX.x + cos(a) * VERTEX.y);
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	vec3 p = o + (right * r.x + up * r.y) * size;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
	v_near = smoothstep(1.2, 3.5, distance(o, INV_VIEW_MATRIX[3].xyz));
}

void fragment() {
	vec4 t = texture(tissue, vec2((v_piece + UV.x) / 4.0, UV.y));
	vec3 col = mix(soot, pale, clamp(v_t * 1.2 - v_dark * 0.45, 0.0, 1.0));
	ALBEDO = col * (0.75 + 0.35 * t.r);
	ALPHA = min(1.0, t.a * 1.35) * smoothstep(0.0, 0.08, v_t) * (1.0 - smoothstep(0.55, 1.0, v_t)) * 0.95 * v_near;
}
