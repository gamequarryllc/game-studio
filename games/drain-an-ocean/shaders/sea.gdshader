shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;
// The open sea beyond the sea wall: still at full height, glittering in the
// low sun. Opaque and cheap; swell in the normal only.

uniform float game_time = 0.0;
uniform vec3 near_col : source_color = vec3(0.09, 0.36, 0.41);
uniform vec3 far_col : source_color = vec3(0.2, 0.42, 0.45);

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = v_world.xz;
	float t = game_time;
	float e = 0.4;
	float hx = vnoise((p + vec2(e, 0.0)) * 0.45 + t * 0.2) - vnoise((p - vec2(e, 0.0)) * 0.45 + t * 0.2);
	float hz = vnoise((p + vec2(0.0, e)) * 0.45 - t * 0.17) - vnoise((p - vec2(0.0, e)) * 0.45 - t * 0.17);
	hx += (vnoise(p * 1.7 + t * 0.6) - 0.5) * 0.3;
	vec3 nw = normalize(vec3(-hx * 0.7, 1.0, -hz * 0.7));
	NORMAL = normalize((VIEW_MATRIX * vec4(nw, 0.0)).xyz);
	float far = smoothstep(60.0, 400.0, length(p));
	ALBEDO = mix(near_col, far_col, far);
	ROUGHNESS = 0.12;
	SPECULAR = 0.6;
}
