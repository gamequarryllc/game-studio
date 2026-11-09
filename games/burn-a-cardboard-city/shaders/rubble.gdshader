shader_type spatial;
render_mode diffuse_lambert_wrap, specular_schlick_ggx, cull_disabled;
// What a building leaves behind (models/rubble.glb): char and ash baked into the vertex
// colours. Embers glow in the folds when it lands and cool to grey over half a minute.
// INSTANCE_CUSTOM r = when it landed (in `now`'s clock), g = a random 0..1.

#include "res://shaders/firelight.gdshaderinc"

uniform float now = 0.0;
uniform vec3 ember_color : source_color = vec3(1.0, 0.4, 0.08);
uniform float cool_time = 26.0;

varying vec4 v_col;
varying vec3 v_world;
varying vec3 v_obj;
varying float v_heat;
varying float v_vary;

float hash12(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

void vertex() {
	v_col = COLOR;
	v_obj = VERTEX;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float t = max(now - INSTANCE_CUSTOM.r, 0.0);
	v_heat = exp(-t / cool_time * 2.2) * step(0.0, now - INSTANCE_CUSTOM.r + 0.001);
	v_vary = INSTANCE_CUSTOM.g;
}

void fragment() {
	vec3 col = v_col.rgb;
	float n = vnoise(v_world.xz * 9.0 + v_world.y * 4.0 + v_vary * 7.0);
	float n2 = vnoise(v_world.xz * 31.0 - v_world.y * 13.0);
	col *= 0.9 + 0.2 * n2;
	if (!FRONT_FACING) {
		col *= 0.55;
	}
	// Embers: in the low, folded places, flickering, fading as it cools.
	float spot = smoothstep(0.62, 0.86, n) * (0.6 + 0.4 * n2);
	float low = clamp(1.0 - v_obj.y * 2.5, 0.2, 1.0);
	float flick = 0.65 + 0.35 * sin(TIME * 6.0 + n * 20.0 + v_vary * 9.0);
	vec3 em = ember_color * spot * low * v_heat * 2.4 * flick;
	// Still hot right after it lands: the whole heap glows a little.
	em += ember_color * 0.18 * v_heat * v_heat * low;
	ALBEDO = col;
	ROUGHNESS = 0.95;
	SPECULAR = 0.12;
	vec3 wn = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	EMISSION = em + col * fire_light(v_world, wn);
}
