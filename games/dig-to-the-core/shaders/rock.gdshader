shader_type spatial;
// The rock of the dig site. Colour comes from the mesh (DigField._vertex_color):
// RGB = rock or ore colour, A = how much ore glints there. UV.x = how much the
// rock glows by itself (magma, the core). The faces are lit partly flat, so
// the rock looks chipped into facets rather than smooth, and a world-space
// noise texture adds grain, blotches and strata. Ore sparkles where your
// headlamp reaches; where your tool is working the rock glows (sparks, heat).
// Note: the Compatibility renderer lights colours as they are (no linear
// conversion), so colours here match the vertex colours one to one.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D detail_tex : filter_linear_mipmap, repeat_enable;
uniform vec3 lamp_pos = vec3(0.0, 0.0, 0.0);
uniform float lamp_range = 11.0;
uniform vec3 hit_pos = vec3(0.0, 1000.0, 0.0);
uniform float hit_amount = 0.0;
uniform float hit_radius = 0.8;
uniform vec3 hit_color = vec3(1.0, 0.55, 0.2);

varying vec3 wpos;
varying vec3 wnrm;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	// Facets: blend the smooth normal with the flat face normal.
	vec3 fn = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	if (dot(fn, VERTEX) > 0.0) {
		fn = -fn;
	}
	NORMAL = normalize(mix(NORMAL, fn, 0.6));

	vec3 w = abs(wnrm);
	w = w / (w.x + w.y + w.z);
	vec3 tx = texture(detail_tex, wpos.zy * 0.23).rgb;
	vec3 ty = texture(detail_tex, wpos.xz * 0.23).rgb;
	vec3 tz = texture(detail_tex, wpos.xy * 0.23).rgb;
	vec3 d = tx * w.x + ty * w.y + tz * w.z;
	// A second, finer layer of grit for close up.
	float fx = texture(detail_tex, wpos.zy * 1.37 + vec2(0.31, 0.7)).r;
	float fy = texture(detail_tex, wpos.xz * 1.37 + vec2(0.53, 0.11)).r;
	float fz = texture(detail_tex, wpos.xy * 1.37 + vec2(0.17, 0.43)).r;
	float grit = fx * w.x + fy * w.y + fz * w.z;
	float grain = d.r * 0.55 + grit * 0.45;
	float blotch = d.g;
	// Strata: thin horizontal bands, on the walls only.
	float strata = texture(detail_tex, vec2(wpos.x * 0.05 + wpos.z * 0.05, wpos.y * 0.32)).b;
	float side = 1.0 - w.y;

	float glint = COLOR.a;
	vec3 base = COLOR.rgb;
	float shade = (0.62 + 0.76 * grain) * (0.86 + 0.28 * blotch) * mix(1.0, 0.9 + 0.2 * strata, side * (1.0 - glint));
	ALBEDO = base * shade;
	ROUGHNESS = mix(0.93, 0.28, glint);
	METALLIC = glint * 0.55;
	SPECULAR = 0.35 + glint * 0.4;

	// Ore sparkles: tiny cells that flash as you move, near your headlamp.
	float lamp = clamp(1.0 - distance(wpos, lamp_pos) / (lamp_range * 1.25), 0.0, 1.0);
	vec3 cell = floor(wpos * 11.0);
	float h = hash13(cell);
	vec3 vdir = normalize((INV_VIEW_MATRIX * vec4(VERTEX, 0.0)).xyz);
	float tw = sin(h * 60.0 + dot(vdir, vec3(9.0, 13.0, 7.0)) * 3.0);
	float sparkle = step(0.74, h) * smoothstep(0.45, 1.0, tw);
	vec3 emit = base * glint * (0.32 + 2.4 * sparkle) * lamp;
	// Rock that glows by itself (magma, molten metal), with slow pulses.
	float self_glow = UV.x;
	emit += base * self_glow * (0.55 + 0.35 * blotch);
	// Where the tool is working.
	float hd = distance(wpos, hit_pos) / max(hit_radius, 0.05);
	emit += hit_color * hit_amount * clamp(1.0 - hd, 0.0, 1.0) * (0.6 + 0.8 * grain);
	EMISSION = emit;
}
