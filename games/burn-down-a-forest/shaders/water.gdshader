shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
// The river and the pond: dark slate water with slow ripples, catching the
// moonlight in short ink-and-cream glints.

uniform vec3 deep : source_color = vec3(0.1, 0.16, 0.2);
uniform vec3 shallow : source_color = vec3(0.18, 0.33, 0.37);
uniform vec3 glint : source_color = vec3(0.79, 0.84, 0.95);

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = v_world.xz;
	float r = sin(p.x * 1.7 + TIME * 1.1) * sin(p.y * 1.3 - TIME * 0.9) + sin((p.x + p.y) * 2.9 + TIME * 1.6) * 0.4;
	ALBEDO = mix(deep, shallow, 0.5 + 0.22 * r);
	ROUGHNESS = 0.2;
	SPECULAR = 0.5;
	EMISSION = glint * smoothstep(1.15, 1.32, r) * 0.18;
}
