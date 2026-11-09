shader_type spatial;
// Lava: plates of dark crust drifting slowly over a hot glowing melt, the
// cracks between them brightest. World-space, from the painted rock texture's
// crack and value channels, so it never repeats on the same spot.
render_mode cull_back, diffuse_lambert, specular_disabled;

uniform sampler2D paint_tex : filter_linear_mipmap, repeat_enable;
uniform vec3 hot = vec3(1.0, 0.62, 0.16);
uniform vec3 melt = vec3(0.85, 0.2, 0.05);
uniform vec3 crust = vec3(0.13, 0.055, 0.04);
uniform float heat = 1.0;

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 uv = wpos.xz * 0.55 + vec2(TIME * 0.03, TIME * 0.017);
	vec4 a = texture(paint_tex, uv);
	vec4 b = texture(paint_tex, wpos.xz * 0.21 - vec2(TIME * 0.011, -TIME * 0.02));
	float plate = smoothstep(0.52, 0.66, a.r * 0.6 + b.r * 0.4);
	float seam = clamp(a.b * 1.6 + (1.0 - plate) * 0.8, 0.0, 1.0);
	float pulse = 0.85 + 0.15 * sin(TIME * 1.7 + wpos.x * 1.3 + wpos.z * 0.9);
	vec3 glowc = mix(melt, hot, seam * seam) * pulse;
	ALBEDO = mix(glowc * 0.3, crust, plate);
	ROUGHNESS = mix(0.4, 0.95, plate);
	EMISSION = glowc * (1.0 - plate * 0.92) * 2.2 * heat;
}
