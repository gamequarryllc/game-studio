shader_type spatial;
render_mode diffuse_lambert, specular_schlick_ggx;
// The warehouse floor: dark, worn blue-grey concrete in 4 m slabs with sawn joints,
// scraps of old masking tape, dried paint and tea rings; and under the city, sheets of
// paper cut by hand (green construction-paper lawns with fibres and a pale cut edge,
// grey paving downtown, charcoal plazas, the castle's pallet), with puddles from the
// leaky roof. `kinds` holds one texel per grid cell (what the floor is there); `burn`
// holds soot (r), glowing embers (g) and the soft shadow of the buildings standing round
// it (b). The scorch a burnt building leaves is a hand-painted decal on top of this
// (scorch_decal.gdshader); here soot is only a faint, smooth darkening.
// The same material draws the pallet deck the castle stands on (above y = 0.05).

uniform sampler2D kinds : filter_nearest, repeat_disable;
uniform sampler2D burn : filter_linear, repeat_disable;
uniform vec2 city_origin = vec2(-25.5, -25.5);
uniform float city_size = 51.0;
uniform vec3 concrete : source_color = vec3(0.225, 0.245, 0.275);
uniform vec3 lawn : source_color = vec3(0.39, 0.47, 0.27);
uniform vec3 pave : source_color = vec3(0.6, 0.59, 0.56);
uniform vec3 plaza : source_color = vec3(0.28, 0.29, 0.31);
uniform vec3 water : source_color = vec3(0.1, 0.12, 0.15);
uniform vec3 paint : source_color = vec3(0.86, 0.68, 0.18);
uniform vec3 road : source_color = vec3(0.3, 0.31, 0.33);
uniform vec3 wood : source_color = vec3(0.66, 0.5, 0.32);
uniform vec3 tape_col : source_color = vec3(0.78, 0.71, 0.52);
uniform float shadow_strength = 0.5;

#include "res://shaders/firelight.gdshaderinc"

varying vec3 v_world;
varying vec3 v_wn;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_wn = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
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
	if (k < 5.5) return water;
	return road;
}

float not_lawn(float k) {
	return (k > 0.5 && k < 1.5) ? 0.0 : 1.0;
}

bool is_sheet(float k) {
	return (k > 0.5 && k < 4.5) || k > 5.5;
}

// A torn strip of masking tape: a rotated rectangle with ragged ends.
float tape_scrap(vec2 w, vec2 c, float ang, vec2 half_size, float seed) {
	vec2 d = w - c;
	vec2 q = vec2(cos(ang) * d.x + sin(ang) * d.y, -sin(ang) * d.x + cos(ang) * d.y);
	float tear = (hash12(vec2(floor(q.y * 40.0), seed)) - 0.5) * 0.03;
	return step(abs(q.x), half_size.x + tear) * step(abs(q.y), half_size.y);
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
	float spec = 0.3;
	bool deck = v_world.y > 0.05;
	if (k < 0.5) {
		// Concrete: trowel clouds, a polished sheen in the traffic lanes.
		col = concrete * (0.84 + 0.26 * big) * (0.95 + 0.1 * fine);
		vec2 slab = floor(w / 4.0);
		col *= 0.95 + 0.1 * hash12(slab);
		// Sawn joints every 4 m (dark, with a chipped lighter lip), faint cuts every 2 m.
		vec2 j = abs(fract(w / 4.0 + 0.5) - 0.5) * 4.0;
		float jd = min(j.x, j.y);
		float joint = 1.0 - smoothstep(0.012, 0.03, jd);
		float lip = smoothstep(0.03, 0.045, jd) * (1.0 - smoothstep(0.045, 0.07, jd));
		col *= 1.0 - joint * 0.55;
		col *= 1.0 + lip * 0.06;
		vec2 j2 = abs(fract(w / 2.0 + 0.5) - 0.5) * 2.0;
		col *= 1.0 - (1.0 - smoothstep(0.004, 0.012, min(j2.x, j2.y))) * 0.18 * (1.0 - joint);
		// Dried spills: a darker blob with a darker ring at its edge (tea, paint thinner).
		vec2 sc = (slab + vec2(hash12(slab + 3.1), hash12(slab + 7.7)) * 0.7 + 0.15) * 4.0;
		float sr = 0.25 + 0.6 * hash12(slab + 1.3);
		float sd = length((w - sc) * vec2(1.0, 0.8 + 0.4 * hash12(slab + 9.0))) / sr + (vnoise(w * 3.0) - 0.5) * 0.3;
		float has = step(0.55, hash12(slab + 5.5));
		float blob = (1.0 - smoothstep(0.92, 1.0, sd)) * has;
		float ring = (1.0 - smoothstep(0.0, 0.07, abs(sd - 0.95))) * has;
		col *= 1.0 - blob * 0.1 - ring * 0.18;
		// Old scraps of masking tape left on the floor (one in three slabs), and the odd
		// splash of the builder's paint.
		float t1 = tape_scrap(w, (slab + vec2(hash12(slab + 11.0), hash12(slab + 13.0))) * 4.0, hash12(slab + 17.0) * 3.14,
			vec2(0.18 + 0.3 * hash12(slab + 19.0), 0.035), slab.x * 7.0 + slab.y) * step(0.66, hash12(slab + 23.0));
		col = mix(col, tape_col * (0.8 + 0.15 * fine), t1 * 0.85);
		vec2 pc = (slab + vec2(hash12(slab + 29.0), hash12(slab + 31.0))) * 4.0;
		float pd = length(w - pc) / (0.08 + 0.12 * hash12(slab + 37.0)) + (vnoise(w * 11.0) - 0.5) * 0.6;
		float splash = (1.0 - smoothstep(0.85, 1.0, pd)) * step(0.82, hash12(slab + 41.0));
		col = mix(col, vec3(0.55, 0.52, 0.48), splash * 0.7);
		// Painted walkway lines round the city.
		float edge = max(abs(w.x), abs(w.y));
		float line = 1.0 - smoothstep(0.06, 0.09, abs(edge - (city_size * 0.5 + 2.2)));
		col = mix(col, paint * (0.8 + 0.15 * fine), line * (0.7 + 0.25 * vnoise(w * 5.0)));
		rough = mix(0.58, 0.8, big) + line * 0.1 + t1 * 0.1;
		spec = 0.14;
		// Under a sheet of paper's edge: a thin shadow on the concrete.
		float k2 = kind_at(w + wob + vec2(-0.05, -0.06));
		if (is_sheet(k2)) {
			col *= 0.62;
		}
	} else if (k > 4.5 && k < 5.5) {
		col = water * (0.9 + 0.2 * big);
		rough = 0.06 + 0.06 * fine;
		spec = 0.6;
		NORMAL_MAP = vec3(0.5 + (vnoise(w * 3.0 + TIME * 0.3) - 0.5) * 0.08, 0.5 + (vnoise(w * 3.0 + 9.0 - TIME * 0.2) - 0.5) * 0.08, 1.0);
	} else if (k > 3.5 && k < 4.5) {
		if (deck) {
			// The pallet's deck boards: grain, the odd darker board, nails.
			vec2 q = w + vec2(0.0, 0.3);
			float board = fract(q.x / 0.9);
			float id = floor(q.x / 0.9);
			float grain = vnoise(vec2(q.x * 30.0, q.y * 1.2 + id * 7.0)) * 0.6 + vnoise(vec2(q.x * 80.0, q.y * 3.0)) * 0.4;
			col = wood * (0.78 + 0.28 * hash12(vec2(id, 3.0))) * (0.86 + 0.2 * grain);
			float nail = 1.0 - smoothstep(0.03, 0.05, length(vec2(board - 0.45, fract(q.y / 3.0) - 0.5) * vec2(0.9, 3.0)));
			col = mix(col, vec3(0.25, 0.24, 0.24), nail * 0.8);
			float edge_b = smoothstep(0.03, 0.08, board) * (1.0 - smoothstep(0.8, 0.86, board));
			col *= 0.7 + 0.3 * edge_b;
			if (abs(v_wn.y) < 0.5) {
				col *= 0.55;      // the boards' sawn sides
			}
			rough = 0.8;
			spec = 0.15;
		} else {
			// Under the pallet, in its shadow.
			col = vec3(0.05, 0.045, 0.04);
			rough = 1.0;
			spec = 0.0;
		}
	} else if (k > 0.5 && k < 1.5) {
		// Green construction paper: matte, its fibres showing, flecked, cut with scissors.
		float sheet = hash12(floor((w + 30.5) / 4.0));            // each block's sheet came out of a different pack
		vec3 base = lawn * (0.92 + 0.12 * sheet) * vec3(1.0 + 0.05 * (sheet - 0.5), 1.0, 1.0 - 0.06 * (sheet - 0.5));
		float fa = vnoise(vec2(w.x * 70.0 + w.y * 21.0, w.y * 9.0)) ;
		float fb = vnoise(vec2(w.x * 8.0, w.y * 66.0 - w.x * 19.0));
		float fibre = smoothstep(0.62, 0.9, fa) * 0.5 + smoothstep(0.62, 0.9, fb) * 0.5;
		float fleck = smoothstep(0.82, 0.95, vnoise(w * 23.0 + 5.0));
		col = base * (0.92 + 0.1 * big) * (0.95 + 0.08 * fine);
		col = mix(col, col * 1.22, fibre * 0.55);
		col = mix(col, vec3(0.62, 0.66, 0.5), fleck * 0.25);
		// The cut edge: the paper's paler core shows along every edge of the sheet.
		float ex = kind_at(w + wob + vec2(0.06, 0.0));
		float ey = kind_at(w + wob + vec2(0.0, 0.06));
		float ex2 = kind_at(w + wob + vec2(-0.06, 0.0));
		float ey2 = kind_at(w + wob + vec2(0.0, -0.06));
		float at_edge = max(max(not_lawn(ex), not_lawn(ey)), max(not_lawn(ex2), not_lawn(ey2)));
		col = mix(col, vec3(0.7, 0.72, 0.6), at_edge * 0.45);
		rough = 0.95;
		spec = 0.06;
	} else {
		col = paper_color(k) * (0.92 + 0.1 * big) * (0.96 + 0.08 * fine);
		if (k > 5.5) {
			// Grey card roads: a faint ribbed texture.
			col *= 0.95 + 0.06 * sin(w.x * 40.0 + vnoise(w * 3.0) * 4.0);
		}
		rough = 0.9;
		spec = 0.12;
	}
	vec2 uv = (w - city_origin) / city_size;
	float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
	vec4 b = texture(burn, clamp(uv, vec2(0.001), vec2(0.999))) * inside;
	// The shadow standing buildings throw across the floor, baked per cell along the key light.
	col *= 1.0 - b.b * shadow_strength;
	// Soot: a faint, smooth warm darkening (the painted scorch decals do the rest).
	float soot = smoothstep(0.15, 0.95, b.r) * 0.42;
	col = mix(col, vec3(0.12, 0.1, 0.09), soot * (k > 4.5 && k < 5.5 ? 0.3 : 1.0));
	// The floor nearest the giant's feet sits darker (the foreground frames the view).
	float near = smoothstep(1.5, 9.0, distance(v_world, CAMERA_POSITION_WORLD));
	col *= mix(0.68, 1.0, near);
	ALBEDO = col;
	ROUGHNESS = mix(rough, 0.95, soot);
	SPECULAR = spec * (1.0 - soot);
	// Embers: sparse glowing specks where burning scraps lie, winking out as they cool.
	float speck = smoothstep(0.78, 0.93, vnoise(w * 14.0 + vec2(TIME * 0.2, 0.0)));
	float flick = 0.6 + 0.4 * sin(TIME * 7.0 + fine * 25.0);
	vec3 fl = fire_light(v_world, vec3(0.0, 1.0, 0.0));
	EMISSION = vec3(1.0, 0.36, 0.08) * b.g * (0.03 + speck * 1.6) * flick + col * fl * 1.25 + fl * 0.035;
}
