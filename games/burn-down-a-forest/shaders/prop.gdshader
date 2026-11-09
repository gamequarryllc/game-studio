shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_disabled;
// Single models: the village, its props, the fire-keeper, the tools, the
// helpers and the critters. Colour from the baked vertex colours (linear),
// vertex alpha 0.5 = a glowing part (lit windows, the lantern, a sprite's body),
// an inked silhouette edge like the forest, and for the keeper a rim light
// (cool moonlight, warmed by the lantern) so the hero reads against the woods.

uniform vec3 ink : source_color = vec3(0.18, 0.118, 0.078);
uniform float ink_edge = 0.5;
uniform float glow_strength = 1.2;
uniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec3 rim_color : source_color = vec3(0.62, 0.72, 0.95);
uniform float rim = 0.0;
uniform vec3 emit_tint : source_color = vec3(1.0, 1.0, 1.0);
uniform float emit_all = 0.0;

void fragment() {
	float glow = step(0.25, COLOR.a) * (1.0 - step(0.75, COLOR.a));
	vec3 col = COLOR.rgb * tint.rgb;
	float fr = 1.0 - abs(dot(normalize(NORMAL), normalize(VIEW)));
	col = mix(col, ink, smoothstep(0.66, 0.98, fr) * ink_edge * (1.0 - glow));
	ALBEDO = col;
	ROUGHNESS = 1.0;
	vec3 em = COLOR.rgb * glow * glow_strength * emit_tint;
	em += col * emit_all;
	em += rim_color * pow(fr, 2.6) * rim;
	EMISSION = em;
}
