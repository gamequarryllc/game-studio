shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;
// The land round the bay (the coarse far grid). Its vertex colours are
// sRGB; converted here exactly as terrain.gdshader does, so the two meet
// without a seam. (A StandardMaterial with vertex_color_is_srgb drew it
// far paler in the Compatibility renderer.)

void fragment() {
	vec3 c = COLOR.rgb;
	c = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
	c = mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, 0.82);
	ALBEDO = c;
	ROUGHNESS = 0.93;
	SPECULAR = 0.22;
}
