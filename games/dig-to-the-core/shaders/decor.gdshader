shader_type spatial;
// Pebbles, ore nuggets and crystals scattered over the dug rock (MultiMesh).
// COLOR = the model's baked AO times each copy's own colour (the rock's for a
// pebble, the ore's for a nugget). Nuggets and crystals catch a rim of light
// where they face away from you, brightest near the headlamp, so ore glints
// out of the dark before you're on top of it.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float glint = 0.0;
uniform float glow = 0.0;
uniform float lamp_range = 11.0;

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = mix(0.92, 0.25, glint);
	METALLIC = glint * 0.35;
	SPECULAR = mix(0.25, 0.75, glint);
	float facing = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float rim = pow(1.0 - facing, 2.5);
	float lamp = clamp(1.0 - length(VERTEX) / (lamp_range * 0.85), 0.0, 1.0);
	EMISSION = COLOR.rgb * (glint * (0.12 + 1.6 * rim) * lamp + glow);
}
