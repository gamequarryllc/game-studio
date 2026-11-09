shader_type spatial;
render_mode diffuse_lambert, specular_disabled;
// The forest floor. `cells` holds one pixel per forest cell: rgb = the ground
// colour there (cursed moss, dirt trail, fresh ash, meadow...), a = how hot
// the ash still is (it glows with embers for a while after the fire). The
// lookup is pushed around by noise so the edges between meadow, ash and moss
// wander organically instead of following the cell grid.

uniform sampler2D cells : filter_linear, repeat_disable;
uniform vec2 forest_origin = vec2(-60.0, -60.0);
uniform float forest_size = 120.0;
uniform float cell_size = 1.5;
uniform vec3 hill_color : source_color = vec3(0.16, 0.12, 0.2);
uniform vec3 hill_top : source_color = vec3(0.23, 0.18, 0.28);
uniform vec3 ember : source_color = vec3(0.91, 0.39, 0.17);
uniform vec3 speck : source_color = vec3(0.18, 0.118, 0.078);
uniform vec4 village_rect = vec4(-17.0, 46.0, 17.0, 60.0);   // x0, z0, x1, z1: the cobbled square

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void fragment() {
	vec2 p = v_world.xz;
	vec2 warp = vec2(vnoise(p * 0.45), vnoise(p * 0.45 + 17.3)) - 0.5;
	warp += (vec2(vnoise(p * 1.3 + 3.1), vnoise(p * 1.3 + 9.7)) - 0.5) * 0.5;
	vec2 uv = (p + warp * cell_size * 1.3 - forest_origin) / forest_size;
	vec4 c = texture(cells, clamp(uv, vec2(0.001), vec2(0.999)));
	vec2 uv0 = (p - forest_origin) / forest_size;
	float inside = step(0.0, uv0.x) * step(uv0.x, 1.0) * step(0.0, uv0.y) * step(uv0.y, 1.0);
	vec3 hills = mix(hill_color, hill_top, clamp(v_world.y / 18.0, 0.0, 1.0));
	vec3 col = mix(hills, c.rgb, inside);
	float n = vnoise(p * 0.55) * 0.5 + vnoise(p * 2.1) * 0.3 + vnoise(p * 6.0) * 0.2;
	col *= 0.82 + 0.36 * n;
	// the village square is cobbled: rounded stones with dark gaps, worn at the edges
	vec2 vr0 = village_rect.xy;
	vec2 vr1 = village_rect.zw;
	float in_v = smoothstep(vr0.x, vr0.x + 3.0, p.x) * (1.0 - smoothstep(vr1.x - 3.0, vr1.x, p.x))
		* smoothstep(vr0.y, vr0.y + 4.0, p.y) * step(c.b * 1.5, c.r) * step(c.g * 1.12, c.r) * inside;
	if (in_v > 0.01) {
		vec2 q = p * 1.6;
		vec2 qi = floor(q);
		float best = 9.0;
		float second = 9.0;
		float shade = 0.0;
		for (int yy = -1; yy <= 1; yy++) {
			for (int xx = -1; xx <= 1; xx++) {
				vec2 cellq = qi + vec2(float(xx), float(yy));
				vec2 pt = cellq + vec2(hash(cellq), hash(cellq + 7.1)) * 0.8 + 0.1;
				float dd = distance(q, pt);
				if (dd < best) {
					second = best;
					best = dd;
					shade = hash(cellq + 3.3);
				} else if (dd < second) {
					second = dd;
				}
			}
		}
		float gap = smoothstep(0.02, 0.12, second - best);
		float worn = vnoise(p * 0.3);
		vec3 stone = col * (1.05 + shade * 0.3) + vec3(0.02, 0.015, 0.01);
		vec3 cob = mix(col * 0.68, stone, gap);
		col = mix(col, cob, in_v * smoothstep(0.3, 0.6, worn + 0.15) * 0.85);
	}
	// little dark specks: grit, needles, pebbles
	float s = step(0.9, vnoise(p * 9.0)) * 0.35;
	col = mix(col, speck, s);
	ALBEDO = col;
	ROUGHNESS = 1.0;
	float g = c.a * inside;
	float hot = smoothstep(0.55, 0.8, vnoise(p * 3.0 + vec2(TIME * 0.2, 0.0)));
	float flick = 0.65 + 0.35 * sin(TIME * 6.0 + n * 20.0);
	EMISSION = ember * g * (0.15 + hot * 0.9) * flick;
}
