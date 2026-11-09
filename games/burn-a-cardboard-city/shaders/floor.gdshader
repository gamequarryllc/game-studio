shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
// The warehouse floor: cool blue-grey polished concrete with slab joints and old
// stains, and under the city, sheets of paper cut by hand (green lawns in the
// suburbs, grey paving downtown, charcoal plazas, the castle's kraft yard), with
// puddles from the leaky roof. `kinds` holds one texel per grid cell (what the
// floor is there); `burn` holds scorch (r), glowing embers (g) and the soft
// shadow of the buildings standing round it (b).

uniform sampler2D kinds : filter_nearest, repeat_disable;
uniform sampler2D burn : filter_linear, repeat_disable;
uniform vec2 city_origin = vec2(-25.5, -25.5);
uniform float city_size = 51.0;
uniform vec3 concrete : source_color = vec3(0.4, 0.44, 0.49);
uniform vec3 lawn : source_color = vec3(0.45, 0.62, 0.33);
uniform vec3 pave : source_color = vec3(0.7, 0.69, 0.65);
uniform vec3 plaza : source_color = vec3(0.32, 0.33, 0.36);
uniform vec3 yard : source_color = vec3(0.8, 0.66, 0.47);
uniform vec3 water : source_color = vec3(0.12, 0.15, 0.19);
uniform vec3 paint : source_color = vec3(0.93, 0.74, 0.18);
uniform vec3 road : source_color = vec3(0.52, 0.53, 0.54);
uniform vec3 wood : source_color = vec3(0.72, 0.55, 0.35);
uniform float shadow_strength = 0.5;

#include "res://shaders/firelight.gdshaderinc"

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

float kind_at(vec2 w) {
	vec2 uv = (w - city_origin) / city_size;
	if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
		return 0.0;
	}
	return floor(texture(kinds, uv).r * 255.0 / 40.0 + 0.5);
}

vec3 paper_color(float k) {
	if (k < 0.5) return concrete;
	if (k < 1.5) return lawn;
	if (k < 2.5) return pave;
	if (k < 3.5) return plaza;
	if (k < 4.5) return yard;
	if (k < 5.5) return water;
	return road;
}

void fragment() {
	vec2 w = v_world.xz;
	// Hand-cut paper: the edges wander a few centimetres.
	vec2 wob = (vec2(vnoise(w * 2.7), vnoise(w * 2.7 + 17.0)) - 0.5) * 0.07;
	float k = kind_at(w + wob);
	float big = vnoise(w * 0.07) * 0.5 + vnoise(w * 0.23) * 0.3 + vnoise(w * 1.3) * 0.2;
	float fine = vnoise(w * 9.0) * 0.5 + vnoise(w * 31.0) * 0.5;
	vec3 col;
	float rough = 0.5;
	float spec = 0.35;
	if (k < 0.5) {
		col = concrete * (0.86 + 0.24 * big) * (0.95 + 0.1 * fine);
		// Slab joints every 4 m, and the odd dark stain.
		vec2 j = abs(fract(w / 4.0 + 0.5) - 0.5) * 4.0;
		float joint = 1.0 - smoothstep(0.0, 0.025, min(j.x, j.y));
		col *= 1.0 - joint * 0.35;
		float stain = smoothstep(0.62, 0.8, vnoise(w * 0.35 + 40.0));
		col *= 1.0 - stain * 0.18;
		// Painted walkway lines round the city.
		float edge = max(abs(w.x), abs(w.y));
		float line = 1.0 - smoothstep(0.06, 0.09, abs(edge - (city_size * 0.5 + 2.2)));
		col = mix(col, paint * (0.85 + 0.15 * fine), line * (0.75 + 0.25 * vnoise(w * 5.0)));
		rough = mix(0.42, 0.6, big) + line * 0.2;
		// Under a sheet of paper's edge: a thin shadow on the concrete.
		float k2 = kind_at(w + wob + vec2(-0.05, -0.06));
		if ((k2 > 0.5 && k2 < 4.5) || k2 > 5.5) {
			col *= 0.72;
		}
	} else if (k > 4.5) {
		col = water * (0.9 + 0.2 * big);
		rough = 0.06 + 0.06 * fine;
		spec = 0.6;
		NORMAL_MAP = vec3(0.5 + (vnoise(w * 3.0 + TIME * 0.3) - 0.5) * 0.08, 0.5 + (vnoise(w * 3.0 + 9.0 - TIME * 0.2) - 0.5) * 0.08, 1.0);
	} else if (k > 3.5 && k < 4.5) {
		// The castle stands on a pallet: deck boards with dark gaps, grain, the odd nail.
		vec2 q = w + vec2(0.0, 0.3);
		float board = fract(q.x / 0.9);
		float gap = smoothstep(0.0, 0.03, board) * (1.0 - smoothstep(0.86, 0.9, board));
		float id = floor(q.x / 0.9);
		float grain = vnoise(vec2(q.x * 30.0, q.y * 1.2 + id * 7.0)) * 0.6 + vnoise(vec2(q.x * 80.0, q.y * 3.0)) * 0.4;
		col = wood * (0.82 + 0.25 * hash12(vec2(id, 3.0))) * (0.88 + 0.18 * grain);
		float nail = 1.0 - smoothstep(0.03, 0.05, length(vec2(board - 0.45, fract(q.y / 3.0) - 0.5) * vec2(0.9, 3.0)));
		col = mix(col, vec3(0.25, 0.24, 0.24), nail * 0.8);
		col = mix(vec3(0.08, 0.06, 0.05), col, gap);
		rough = 0.8;
		spec = 0.15;
	} else if (k > 0.5 && k < 1.5) {
		// Green construction paper: matte, fibrous, flecked, cut with scissors.
		float fleck = smoothstep(0.78, 0.92, vnoise(w * 23.0 + 5.0));
		float fibre = vnoise(vec2(w.x * 60.0, w.y * 8.0)) * 0.5 + vnoise(vec2(w.x * 7.0, w.y * 55.0)) * 0.5;
		col = lawn * (0.9 + 0.12 * big) * (0.93 + 0.1 * fibre);
		col = mix(col, col * 1.25, fleck * 0.5);
		rough = 0.95;
		spec = 0.08;
	} else {
		col = paper_color(k) * (0.92 + 0.1 * big) * (0.96 + 0.08 * fine);
		if (k > 5.5) {
			// Grey card roads: a faint ribbed texture.
			col *= 0.95 + 0.06 * sin(w.x * 40.0 + vnoise(w * 3.0) * 4.0);
		}
		rough = 0.9;
		spec = 0.15;
	}
	vec2 uv = (w - city_origin) / city_size;
	float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
	vec4 b = texture(burn, clamp(uv, vec2(0.001), vec2(0.999))) * inside;
	// The shadow standing buildings throw across the floor, baked per cell along the key light.
	col *= 1.0 - b.b * shadow_strength;
	// Scorch and ash.
	float ash = vnoise(w * 4.0) * 0.6 + fine * 0.4;
	vec3 burnt = mix(vec3(0.165, 0.141, 0.125) * 0.8, vec3(0.42, 0.4, 0.38), smoothstep(0.5, 0.88, ash));
	float sc = smoothstep(0.0, 0.25, b.r - (1.0 - ash) * 0.35);
	col = mix(col, burnt, sc * (k > 4.5 ? 0.3 : 1.0));
	ALBEDO = col;
	ROUGHNESS = mix(rough, 0.95, sc);
	SPECULAR = spec * (1.0 - sc);
	// Embers: sparse glowing specks in the ash that wink out as it cools (not a glowing sea).
	float speck = smoothstep(0.78, 0.93, vnoise(w * 14.0 + vec2(TIME * 0.2, 0.0)));
	float flick = 0.6 + 0.4 * sin(TIME * 7.0 + ash * 25.0);
	EMISSION = vec3(1.0, 0.36, 0.08) * b.g * (0.04 + speck * 1.6) * flick + col * fire_light(v_world, vec3(0.0, 1.0, 0.0));
}
