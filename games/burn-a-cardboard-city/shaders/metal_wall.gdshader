shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
// The warehouse's corrugated steel walls: ribs every 20 cm, grubby near the floor.

uniform vec3 color : source_color = vec3(0.47, 0.53, 0.6);
uniform vec3 grime : source_color = vec3(0.27, 0.29, 0.31);

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash12(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

void fragment() {
	float u = (abs(NORMAL.x) > 0.5 ? v_world.z : v_world.x);
	float rib = sin(u * 31.4159);
	NORMAL_MAP = vec3(0.5 + rib * 0.35, 0.5, 1.0);
	float dirt = smoothstep(2.2, 0.0, v_world.y) * 0.6 + vnoise(vec2(u * 0.4, v_world.y * 0.6)) * 0.25;
	float panel = step(0.97, fract(u / 3.0));
	vec3 col = mix(color, grime, clamp(dirt, 0.0, 1.0)) * (1.0 - panel * 0.25);
	ALBEDO = col * (0.92 + 0.08 * rib);
	ROUGHNESS = 0.55;
	METALLIC = 0.3;
}
