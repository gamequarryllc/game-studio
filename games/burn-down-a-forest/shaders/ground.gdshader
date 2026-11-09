shader_type spatial;
render_mode diffuse_lambert, specular_disabled;
// The forest floor. `cells` holds one pixel per forest cell: rgb = the ground
// colour there (cursed moss, dirt trail, fresh ash, packed village earth...),
// a = how hot the ash still is (it glows with embers for a while after the
// fire). `meadow` is 1 where the meadow has grown: it's painted here in sage,
// in lighter and darker drifts, with a ragged edge where it meets the ash
// (and a darker rim of fresh turf against the cinders). Lookups are pushed
// around by noise so edges wander organically instead of following the cells.
// Warm light: the fire nearby (`fire_light`) and the keeper's lantern pool.

uniform sampler2D cells : filter_linear, repeat_disable;
uniform sampler2D meadow : filter_linear, repeat_disable;
uniform sampler2D fire_light : filter_linear_mipmap, repeat_disable;
uniform vec2 forest_origin = vec2(-60.0, -60.0);
uniform float forest_size = 120.0;
uniform float cell_size = 1.5;
uniform vec3 hill_color : source_color = vec3(0.16, 0.12, 0.2);
uniform vec3 hill_top : source_color = vec3(0.23, 0.18, 0.28);
uniform vec3 ember : source_color = vec3(0.91, 0.39, 0.17);
uniform vec3 core_glow : source_color = vec3(1.0, 0.757, 0.369);
uniform vec3 speck : source_color = vec3(0.18, 0.118, 0.078);
uniform vec3 sage_dark : source_color = vec3(0.29, 0.39, 0.2);
uniform vec3 sage : source_color = vec3(0.44, 0.55, 0.3);
uniform vec3 moss : source_color = vec3(0.24, 0.3, 0.2);
uniform vec4 village_rect = vec4(-18.0, 44.0, 18.0, 60.0);   // x0, z0, x1, z1: the village square
uniform vec2 well_pos = vec2(-4.4, 50.4);
uniform vec3 fire_tint : source_color = vec3(1.0, 0.55, 0.25);
uniform float fire_gain = 1.7;
uniform vec3 lantern_pos = vec3(0.0, -100.0, 0.0);
uniform vec3 lantern_tint : source_color = vec3(1.0, 0.66, 0.34);
uniform float lantern_flicker = 1.0;
uniform float key_response = 0.62;   // flat ground faces the high moon square on: keep it below the trees' lit tops

// a flat fill under every light: the night stays plum but never goes black (L* 20-25 in the shadows)
uniform vec3 fill = vec3(0.0);
uniform float fill_gain = 2.3;   // the flat ground gets more of it than the plants (it faces the dark sky)       // linear (set from code, not converted)

varying vec3 v_world;

uniform float meadow_raise = 0.07;
uniform float water_level = -0.35;   // the turf stands a little proud of the ash

void vertex() {
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec2 muv = (w.xz - forest_origin) / forest_size;
	if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) {
		VERTEX.y += textureLod(meadow, muv, 0.0).r * meadow_raise;
	}
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
	// the village square: packed earth, mossy where few feet go
	vec2 vr0 = village_rect.xy;
	vec2 vr1 = village_rect.zw;
	float in_v = smoothstep(vr0.x, vr0.x + 3.0, p.x) * (1.0 - smoothstep(vr1.x - 3.0, vr1.x, p.x))
		* smoothstep(vr0.y, vr0.y + 3.0, p.y) * inside;
	// painted earth: warmer and cooler patches, darker where feet wear it down
	// (round the well and along the path), pale pebbles, moss where few feet go
	float patch = vnoise(p * 0.5 + 7.0) * 0.6 + vnoise(p * 1.9) * 0.4;
	col = mix(col, col * vec3(1.08, 1.0, 0.9), smoothstep(0.45, 0.75, patch) * in_v * 0.5);
	col = mix(col, col * vec3(0.84, 0.84, 0.86), smoothstep(0.55, 0.25, patch) * in_v * 0.5);
	float worn = 1.0 - smoothstep(1.5, 6.0, length(p - well_pos));
	col = mix(col, col * 0.72, worn * in_v * 0.7);
	float pebble = step(0.82, vnoise(p * 7.0 + 3.3)) * step(0.5, vnoise(p * 2.3));
	col = mix(col, col * 1.35 + vec3(0.02), pebble * in_v * 0.5);
	float mossy = smoothstep(0.5, 0.72, vnoise(p * 0.32) * 0.7 + vnoise(p * 1.4) * 0.3) * (1.0 - worn);
	col = mix(col, moss * (0.8 + 0.4 * n), mossy * in_v * 0.55);
	// the meadow: sage in drifts, a ragged edge into the ash
	// the meadow, in a band from the ash inward: dark turned soil with seedlings
	// coming up, then grass in patches, then the full sward in lighter and
	// darker drifts, its texture combed in blades (never a flat paint fill)
	// (a soft five-tap read of the mask: the band runs over a couple of metres, not along the cells)
	vec2 mo = vec2(cell_size * 0.85 / forest_size, 0.0);
	vec2 muv = clamp(uv, vec2(0.001), vec2(0.999));
	float m = (texture(meadow, muv).r * 2.0 + texture(meadow, muv + mo).r + texture(meadow, muv - mo).r
		+ texture(meadow, muv + mo.yx).r + texture(meadow, muv - mo.yx).r) / 6.0 * inside;
	float rag = vnoise(p * 1.7) * 0.6 + vnoise(p * 4.8) * 0.4;
	float edge = m + (rag - 0.5) * 0.7;
	float soil = smoothstep(0.18, 0.34, edge);
	float patchy = (vnoise(p * 2.4 + 11.0) - 0.5) * 0.3 + (vnoise(p * 7.0) - 0.5) * 0.12;
	float mt = smoothstep(0.4, 0.62, edge + patchy);
	col = mix(col, mix(col * 0.6, vec3(0.13, 0.1, 0.075), 0.45), soil * (1.0 - mt));
	float sprout = step(0.7, vnoise(p * 11.0)) * smoothstep(0.24, 0.42, edge) * (1.0 - mt);
	col = mix(col, sage_dark * 1.15, sprout);
	float drift = vnoise(p * 0.11) * 0.6 + vnoise(p * 0.45) * 0.4;
	vec3 mc = mix(sage_dark, sage, smoothstep(0.25, 0.8, drift));
	vec2 bp = vec2(p.x * 0.8 + p.y * 0.6, p.y * 0.8 - p.x * 0.6);
	float blades = vnoise(vec2(bp.x * 22.0, bp.y * 4.0)) * 0.6 + vnoise(vec2(bp.x * 9.0, bp.y * 2.0)) * 0.4;
	mc *= 0.8 + 0.34 * blades;
	mc *= 0.9 + 0.2 * vnoise(p * 2.4);
	mc = mix(mc * 0.72, mc, smoothstep(0.44, 0.7, edge));     // younger, darker grass at the edge
	col = mix(col, mc, mt);
	// the banks: wet, darker earth just above the water, a pale gravel line at the edge
	float wet = 1.0 - smoothstep(water_level + 0.05, water_level + 0.55, v_world.y);
	col = mix(col, col * 0.62 * vec3(0.95, 0.92, 0.9), wet * inside);
	float gravel = (1.0 - smoothstep(0.0, 0.12, abs(v_world.y - water_level - 0.04))) * inside;
	col = mix(col, vec3(0.42, 0.39, 0.34) * (0.8 + 0.4 * vnoise(p * 8.0)), gravel * 0.6);
	// little dark specks: grit, needles, pebbles
	float s = step(0.9, vnoise(p * 9.0)) * 0.35 * (1.0 - mt * 0.6);
	col = mix(col, speck, s);
	ALBEDO = col * key_response;
	ROUGHNESS = 1.0;
	// the fire's edge on the ground: `cells` alpha is heat (1 under a fire, fading
	// on fresh ash). Where it crosses a ragged threshold, a thin glowing line
	// creeps along with the front; inside it the ground smoulders dully. No
	// speckle of dots.
	float g = c.a * inside;
	float flick = 0.7 + 0.3 * sin(TIME * 5.0 + n * 14.0);
	float th = 0.55 + 0.24 * (vnoise(p * 1.6 + vec2(0.0, TIME * 0.15)) - 0.5);
	float fw = max(fwidth(g), 0.004);
	float line = (1.0 - smoothstep(fw * 0.7, fw * 2.6, abs(g - th))) * step(0.05, g);
	vec3 em = mix(ember, core_glow, 0.45) * line * 1.2 * flick;
	// inside the edge the ground smoulders: a dull glow broken up by cracks
	float cracks = smoothstep(0.35, 0.75, vnoise(p * 2.6 + 5.0));
	em += ember * smoothstep(th, 0.98, g) * (0.18 + 0.3 * cracks) * flick;
	// warm light thrown on the ground by the fire nearby
	vec2 fuv = (p - forest_origin) / forest_size;
	float fl = textureLod(fire_light, fuv, 1.0).r * 0.6 + textureLod(fire_light, fuv, 2.5).r * 1.7;
	fl = 1.0 - exp(-fl * 1.6);
	em += col * fire_tint * fl * fire_gain;
	// and the lantern's pool round the keeper's feet, with a soft painted edge
	float ld = length(v_world.xz - lantern_pos.xz);
	float pool = pow(clamp(1.0 - ld / 4.5, 0.0, 1.0), 1.8) * (0.85 + 0.15 * vnoise(p * 3.0 + TIME * 0.5));
	em += col * lantern_tint * pool * 0.55 * lantern_flicker;
	// dark colours are lifted most, light ones (plaster, packed earth) hardly: the shadows come up, nothing glares
	float fl_l = dot(col, vec3(0.2126, 0.7152, 0.0722)) * 26.0;
	float fill_w = 1.0 / (1.0 + fl_l * fl_l);
	em += col * fill * fill_w * fill_gain * (0.35 + 0.65 * inside);   // the far hills stay dark against the sky
	EMISSION = em;
}
