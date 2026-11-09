shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
// Masking-tape road markings stuck to the warehouse floor (street edges and the
// dashed middle line). UV.x runs along the strip: the ends are torn.

uniform vec3 color : source_color = vec3(0.9, 0.83, 0.63);

varying vec2 v_len;

float hash12(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	v_len = vec2(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[2].xyz));
}

void fragment() {
	float along = UV.x * v_len.x;
	float tear = 0.012 + 0.02 * hash12(vec2(floor(UV.y * 6.0), floor(MODEL_MATRIX[3].x * 7.0 + MODEL_MATRIX[3].z * 3.0)));
	if (along < tear || along > v_len.x - tear) {
		discard;
	}
	float grain = hash12(floor(vec2(along * 80.0, UV.y * 6.0)));
	ALBEDO = color * (0.94 + 0.08 * grain);
	ROUGHNESS = 0.55;
	SPECULAR = 0.4;
}
