shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;
// The open sea beyond the sea wall: still at full height, a long swell
// rolling in from the north, glittering in the low sun, and breaking white
// against the wall's outer face. Opaque and cheap.

uniform float game_time = 0.0;
uniform vec3 near_col : source_color = vec3(0.09, 0.36, 0.41);
uniform vec3 far_col : source_color = vec3(0.2, 0.42, 0.45);
uniform vec3 foam_col : source_color = vec3(0.95, 0.92, 0.83);
uniform vec3 sun_col : source_color = vec3(1.0, 0.85, 0.62);
uniform vec3 sun_dir = vec3(-0.85, 0.3, 0.42);
// The wall's outer face, as z = wall_z0 + wall_k * (x - wall_x0)^2.
uniform float wall_z0 = -58.4;
uniform float wall_x0 = -2.0;
uniform float wall_k = 0.0038;

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
	float dist = length(VERTEX);
	// Swell from the north, a cross sea, fine chop up close.
	float s1 = sin(p.y * 0.21 + p.x * 0.03 + t * 0.9);
	float s2 = sin(p.y * 0.37 - p.x * 0.19 + t * 1.3);
	float hx = cos(p.y * 0.37 - p.x * 0.19 + t * 1.3) * -0.19 * 0.4 + cos(p.y * 0.21 + p.x * 0.03 + t * 0.9) * 0.03;
	float hz = cos(p.y * 0.21 + p.x * 0.03 + t * 0.9) * 0.21 + cos(p.y * 0.37 - p.x * 0.19 + t * 1.3) * 0.37 * 0.4;
	float near = 1.0 - smoothstep(60.0, 260.0, dist);
	hx += (vnoise(p * 0.9 + t * 0.5) - 0.5) * 0.6 * near;
	hz += (vnoise(p * 0.9 - t * 0.43 + 5.0) - 0.5) * 0.6 * near;
	vec3 nw = normalize(vec3(-hx * 0.35, 1.0, -hz * 0.35));
	NORMAL = normalize((VIEW_MATRIX * vec4(nw, 0.0)).xyz);
	float far = smoothstep(60.0, 420.0, length(p));
	vec3 col = mix(near_col, far_col, far);
	col *= 0.92 + 0.08 * s1;
	// Breaking against the wall: foam that surges with the swell and lingers in lace.
	float wz = wall_z0 + wall_k * (p.x - wall_x0) * (p.x - wall_x0);
	float off = wz - p.y;                         // metres out from the wall's face
	float surge = 0.5 + 0.5 * sin(t * 0.9 + p.x * 0.05);
	float lace = smoothstep(0.35, 0.65, vnoise(p * 0.8 + vec2(t * 0.2, t * 0.31)) * 0.7 + vnoise(p * 2.3 - t * 0.4) * 0.4);
	float band = (1.0 - smoothstep(1.0 + 3.5 * surge, 6.0 + 4.0 * surge, off)) * step(-1.0, off);
	float foam = band * lace + (1.0 - smoothstep(0.0, 1.4, off)) * 0.7;
	foam *= step(abs(p.x - wall_x0), 34.0);
	col = mix(col, foam_col, clamp(foam, 0.0, 1.0) * 0.9);
	// Glitter: twinkling points everywhere, thickest out towards the sun and the horizon.
	vec3 V = normalize((INV_VIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz - v_world);
	vec3 R = reflect(-V, nw);
	float lobe = smoothstep(-0.6, 0.6, dot(R, normalize(sun_dir))) * 0.6 + 0.4 * far;
	vec2 cp = p * mix(1.6, 0.35, far);
	vec2 ci = floor(cp);
	float pick = hash(ci + floor(t * 2.5 + hash(ci) * 9.0) * 0.173);
	float pt = 1.0 - smoothstep(0.0, 0.2, length(fract(cp) - 0.5));
	float glint = step(0.9 - 0.12 * lobe, pick) * pt * lobe * (1.0 - clamp(foam, 0.0, 1.0));
	ALBEDO = col;
	EMISSION = sun_col * glint * 2.2;
	ROUGHNESS = mix(0.1, 0.8, clamp(foam, 0.0, 1.0));
	SPECULAR = 0.6;
}
