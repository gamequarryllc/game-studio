shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
// The river and the pond: water that's shallow and lighter at its edges and
// dark in the middle (from a small height map of the ground under it), with a
// pale line where it laps the bank, slow ripples, the sky mirrored in it at a
// low angle (plum at night, peach at dawn), and short cream glints.

uniform vec3 deep : source_color = vec3(0.06, 0.13, 0.19);
uniform vec3 shallow : source_color = vec3(0.17, 0.32, 0.36);
uniform vec3 glint : source_color = vec3(0.79, 0.84, 0.95);
uniform vec3 sky_tint : source_color = vec3(0.37, 0.3, 0.45);
uniform vec3 shore_col : source_color = vec3(0.75, 0.72, 0.62);
uniform sampler2D height_tex : filter_linear, repeat_disable;   // L8: (ground height - water level + 1) / 3
uniform vec2 hmap_origin = vec2(-90.0, -90.0);
uniform float hmap_size = 180.0;

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = v_world.xz;
	float r = sin(p.x * 1.7 + TIME * 1.1) * sin(p.y * 1.3 - TIME * 0.9) + sin((p.x + p.y) * 2.9 + TIME * 1.6) * 0.4;
	vec2 huv = (p - hmap_origin) / hmap_size;
	float g = texture(height_tex, huv).r * 3.0 - 1.0;          // ground height relative to the water
	float depth = clamp(-g / 0.8, 0.0, 1.0);
	vec3 col = mix(shallow, deep, smoothstep(0.05, 0.75, depth));
	col *= 0.92 + 0.12 * r;
	// the sky in it, more at a low angle
	float fr = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.5);
	col = mix(col, sky_tint, clamp(0.08 + fr * 0.45, 0.0, 0.45) * (0.75 + 0.25 * r));
	// a pale line where it laps the bank, breaking up with the ripples
	float shore = (1.0 - smoothstep(0.0, 0.07 + 0.03 * r, depth));
	col = mix(col, shore_col, shore * 0.75);
	ALBEDO = col;
	ROUGHNESS = 0.25;
	SPECULAR = 0.5;
	EMISSION = glint * smoothstep(1.1, 1.32, r) * 0.3 + col * 0.18;
}
