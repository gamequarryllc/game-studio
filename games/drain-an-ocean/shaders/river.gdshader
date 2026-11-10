shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, specular_schlick_ggx;
// The river standing behind the weir: deeper and cooler in the channel,
// shallow and clear at the banks (fading into them, no hard edge), with
// slow streaks drifting down towards the weir.

uniform vec3 deep_col : source_color = vec3(0.09, 0.25, 0.28);
uniform vec3 shallow_col : source_color = vec3(0.3, 0.5, 0.46);
uniform vec3 bank_col : source_color = vec3(0.72, 0.7, 0.52);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void fragment() {
	float across = abs(UV.x - 0.5) * 2.0;             // 0 mid-channel, 1 at the bank
	float wobble = noise(vec2(UV.y * 0.9, 3.0)) * 0.18;
	float depth = 1.0 - smoothstep(0.15, 0.95 - wobble, across);
	vec3 col = mix(shallow_col, deep_col, depth);
	col = mix(col, bank_col, smoothstep(0.82 - wobble, 1.0, across) * 0.55);
	// slow streaks along the flow
	float s = noise(vec2(UV.x * 9.0, UV.y * 0.6 - TIME * 0.05));
	col += vec3(0.05, 0.07, 0.07) * smoothstep(0.72, 0.95, s) * depth;
	ALBEDO = col;
	ROUGHNESS = mix(0.6, 0.38, depth);
	SPECULAR = 0.3;
	ALPHA = 1.0 - smoothstep(0.86 - wobble * 0.5, 1.0, across);
}
