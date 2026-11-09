shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
// The river and the pond: deep teal with drifting ripples.

uniform vec3 deep : source_color = vec3(0.06, 0.2, 0.3);
uniform vec3 shallow : source_color = vec3(0.18, 0.5, 0.58);

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = v_world.xz;
	float r = sin(p.x * 1.7 + TIME * 1.3) * sin(p.y * 1.3 - TIME * 1.1) + sin((p.x + p.y) * 2.9 + TIME * 2.0) * 0.4;
	ALBEDO = mix(deep, shallow, 0.5 + 0.25 * r);
	ROUGHNESS = 0.12;
	SPECULAR = 0.7;
	EMISSION = vec3(0.4, 0.9, 1.0) * smoothstep(1.1, 1.35, r) * 0.25;
}
