shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
// Plum smoke rising off the fire in cel-shaded puffs (fx/puffs.png): a lit top
// and a shadowed underside with a crisp edge, swelling as they rise, bending
// away downwind and thinning out. A tree sends up three puffs a third of a
// cycle apart, so they make one continuous plume; the bottom of the plume
// takes the fire's orange glow. Loops on its own in the shader.
// INSTANCE_CUSTOM r = seed, g = size, b = how dark (0 = a pale wisp, 1 = sooty), a = rise speed.

uniform vec2 wind = vec2(0.6, -0.4);
uniform sampler2D puffs : filter_linear_mipmap, repeat_disable;
uniform vec3 lit : source_color = vec3(0.4, 0.31, 0.47);
uniform vec3 shade : source_color = vec3(0.2, 0.14, 0.24);
uniform vec3 soot : source_color = vec3(0.13, 0.1, 0.15);
uniform float glow_low = 0.45;     // the fire's glow on the bottom of the plume (0 for chimney smoke)

varying float v_t;
varying float v_dark;
varying float v_near;
varying float v_seed;

void vertex() {
	float seed = INSTANCE_CUSTOM.r;
	v_seed = seed;
	float t = fract(TIME * (0.085 + 0.06 * INSTANCE_CUSTOM.a) + seed);
	v_t = t;
	v_dark = INSTANCE_CUSTOM.b;
	vec3 o = MODEL_MATRIX[3].xyz;
	float size = INSTANCE_CUSTOM.g * (0.5 + 1.7 * sqrt(t));
	o.y += t * (6.0 + 5.0 * INSTANCE_CUSTOM.g);
	o.xz += wind * t * t * (6.0 + 3.0 * INSTANCE_CUSTOM.g) + vec2(sin(seed * 40.0 + t * 3.0), cos(seed * 31.0 + t * 2.0)) * t * 0.8;
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	float a = seed * 6.28 + t * 0.8;
	vec2 v = mat2(vec2(cos(a), sin(a)), vec2(-sin(a), cos(a))) * VERTEX.xy;
	vec3 p = o + (right * v.x + up * v.y) * size;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
	// puffs close to the camera thin away (never a flat disc across the view)
	v_near = smoothstep(6.0, 15.0, distance(o, INV_VIEW_MATRIX[3].xyz));
}

void fragment() {
	float cell = floor(fract(v_seed * 3.7) * 4.0);
	vec2 uv = (vec2(mod(cell, 2.0), floor(cell / 2.0)) + UV) * 0.5;
	vec4 tx = texture(puffs, uv);
	float a = smoothstep(0.35, 0.55, tx.a);
	vec3 col = mix(shade, lit, step(0.7, tx.r));
	col = mix(col, soot, v_dark * 0.6);
	// low in the plume the fire underneath lights it orange
	vec3 warm = mix(vec3(0.42, 0.17, 0.1), vec3(0.75, 0.36, 0.17), step(0.7, tx.r));
	col = mix(col, warm, (1.0 - smoothstep(0.05, 0.32, v_t)) * glow_low);
	ALBEDO = col;
	ALPHA = a * smoothstep(0.0, 0.1, v_t) * (1.0 - smoothstep(0.55, 1.0, v_t)) * 0.72 * v_near;
}
