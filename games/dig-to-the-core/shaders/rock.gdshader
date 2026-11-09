shader_type spatial;
// The rock of the dig site (and the field's grass). Colour comes from the mesh
// (DigField._vertex_color): RGB = rock colour (ore veins tint it), A = how much
// ore glints there. UV.x = how much the rock glows by itself (magma, the core),
// UV.y = 1 on grass.
//
// A hand-painted stone texture (textures/rock_paint.png, art/textures/
// make_textures.py) is projected three ways and mixed at two scales so it
// doesn't repeat; strata bands (textures/strata.png) wander across the walls,
// each band 10-20% lighter or darker than the next. Faces are lit a little
// flat so the rock reads as chipped. The headlamp and the zone-tinted fog (set
// in World._update_env) do the rest: an amber pool that falls to near black.
// Note: the Compatibility renderer lights colours as they are (no linear
// conversion), so colours here match the vertex colours one to one.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D paint_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D strata_tex : filter_linear, repeat_enable;
uniform vec3 lamp_pos = vec3(0.0, 0.0, 0.0);
uniform float lamp_range = 11.0;
uniform vec3 hit_pos = vec3(0.0, 1000.0, 0.0);
uniform float hit_amount = 0.0;
uniform float hit_radius = 0.8;
uniform vec3 hit_color = vec3(1.0, 0.55, 0.2);
uniform float facet = 0.5;
uniform vec3 grass_dark = vec3(0.32, 0.38, 0.17);
uniform vec3 grass_light = vec3(0.56, 0.62, 0.3);

varying vec3 wpos;
varying vec3 wnrm;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

vec4 tri(vec3 p, vec3 w, float s) {
	return texture(paint_tex, p.zy * s) * w.x + texture(paint_tex, p.xz * s) * w.y + texture(paint_tex, p.xy * s) * w.z;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	// Facets: a little of the flat face normal mixed in.
	vec3 fn = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	if (dot(fn, VERTEX) > 0.0) {
		fn = -fn;
	}
	NORMAL = normalize(mix(NORMAL, fn, facet));

	vec3 w = pow(abs(wnrm), vec3(4.0));
	w = w / (w.x + w.y + w.z);
	vec4 a = tri(wpos, w, 0.43);
	// A second, bigger and rotated projection breaks the repeat.
	vec3 rp = vec3(wpos.x * 0.8 - wpos.z * 0.6, wpos.y, wpos.x * 0.6 + wpos.z * 0.8) + vec3(3.1, 1.7, 5.3);
	vec4 b = tri(rp, w, 0.15);
	float paint = mix(a.r, b.r, 0.35);
	float crack = max(a.b, b.b * 0.6);
	float grit = a.g;

	float glint = COLOR.a;
	vec3 base = COLOR.rgb;
	// Grass: painted clumps from above, darker in the dips; its edge with a
	// path follows the clumps so it's ragged, not a straight line.
	float clump = texture(paint_tex, wpos.xz * 0.23).a * 0.6 + texture(paint_tex, wpos.xz * 0.071 + vec2(0.3, 0.6)).a * 0.4;
	float is_grass = step(0.5 + (clump - 0.5) * 0.8, UV.y);

	// Strata: bands that wander a little, on every rock face. Each band is
	// lighter or darker than the last and a little warmer or cooler; a thin
	// dark seam where two meet; now and then a bed of grit.
	float sy = wpos.y + 0.35 * sin(wpos.x * 0.37 + wpos.z * 0.21) + 0.22 * sin(wpos.z * 0.53 - wpos.x * 0.11);
	vec3 st = texture(strata_tex, vec2(sy / 64.0, 0.5)).rgb;
	float strata = mix(1.0, st.r * 1.25, 1.35);   // pushed a little past the texture's own steps
	vec3 warmth = mix(vec3(0.9, 0.95, 1.07), vec3(1.08, 1.0, 0.88), st.g);

	// Up on the field the bare dirt (paths, the dig site's edge) is packed
	// earth: the stones barely show through.
	float topside = smoothstep(-1.2, -0.4, wpos.y);
	float under = 1.0 - topside;
	paint = mix(paint, 0.7 + 0.25 * (paint - 0.7), topside);
	crack *= 1.0 - 0.85 * topside;
	// Big slow drifts in value across a wall, so no two metres look alike.
	float drift = b.r * 0.5 + texture(paint_tex, rp.xz * 0.031 + rp.y * 0.017).r * 0.5;
	float shade = mix(0.86 + 0.3 * (paint - 0.7), 0.7 + 0.9 * (paint - 0.69), under) * mix(1.0, strata, under) * (0.93 + 0.14 * grit);
	shade *= mix(1.0, 0.82 + 0.36 * drift, under);
	shade *= 1.0 - 0.45 * crack;
	shade *= 1.0 - 0.25 * st.b * step(0.6, grit) * under;   // grit beds and seams
	vec3 rock = base * shade * mix(vec3(1.0), warmth, under);

	vec3 grass = mix(grass_dark, grass_light, clump) * (base / vec3(0.48, 0.55, 0.25));
	ALBEDO = mix(rock, grass, is_grass);
	// The headlamp is strong enough to light a pool metres away, so rock right
	// at the lens would blow out to flat colour: hold it down up close.
	ALBEDO *= mix(mix(0.42, 1.0, smoothstep(0.3, 1.9, length(VERTEX))), 1.0, topside);

	ROUGHNESS = mix(0.95, 0.35, glint);
	METALLIC = glint * 0.4;
	SPECULAR = mix(0.25, 0.6, glint);

	// Ore sparkles: tiny cells that flash as you move, near your headlamp.
	float lamp = clamp(1.0 - distance(wpos, lamp_pos) / (lamp_range * 0.9), 0.0, 1.0);
	vec3 cell = floor(wpos * 11.0);
	float h = hash13(cell);
	vec3 vdir = normalize((INV_VIEW_MATRIX * vec4(VERTEX, 0.0)).xyz);
	float tw = sin(h * 60.0 + dot(vdir, vec3(9.0, 13.0, 7.0)) * 3.0);
	float sparkle = step(0.8, h) * smoothstep(0.55, 1.0, tw);
	vec3 emit = base * glint * (0.12 + 1.6 * sparkle) * lamp;
	// Rock that glows by itself (magma, molten metal), hottest in the cracks.
	float self_glow = UV.x;
	emit += base * self_glow * (0.35 + 0.55 * paint + 0.9 * crack);
	// Where the tool is working: a small hot spot, faded out right at the lens
	// so it can never fill the screen.
	float hd = distance(wpos, hit_pos) / max(hit_radius, 0.05);
	float near_fade = smoothstep(0.35, 1.3, length(VERTEX));
	emit += hit_color * hit_amount * clamp(1.0 - hd, 0.0, 1.0) * (0.5 + 0.8 * grit) * near_fade;
	EMISSION = emit;
}
