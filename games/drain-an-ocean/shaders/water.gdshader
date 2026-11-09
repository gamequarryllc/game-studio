shader_type spatial;
render_mode blend_mix, cull_back, depth_draw_opaque, diffuse_lambert, specular_schlick_ggx;
// Every body of water in the bay, in one mesh. Each vertex takes the level of
// the body it belongs to (body_tex + levels, the same lookup as the seabed),
// so the water's edge meets the sand exactly at the shoreline. Colour by
// depth (shoal green to deep teal), a soft foam band at the edge with a
// second line that breathes in and out, small swell, sun glints.

uniform sampler2D body_tex : filter_nearest;
uniform float levels[32];
uniform float grid_w = 129.0;
uniform float game_time = 0.0;
uniform vec3 shallow_col : source_color = vec3(0.31, 0.66, 0.61);
uniform vec3 deep_col : source_color = vec3(0.06, 0.3, 0.36);
uniform vec3 foam_col : source_color = vec3(0.95, 0.92, 0.83);

varying float v_depth;
varying vec3 v_world;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void vertex() {
	ivec2 c = ivec2(round(UV * (grid_w - 1.0)));
	int slot = int(round(texelFetch(body_tex, c, 0).r * 255.0));
	float h = UV2.x;
	float y = slot < 32 ? levels[slot] : h - 2.0;
	float d = y - h;
	float sw = sin(VERTEX.x * 0.31 + game_time * 1.1) * sin(VERTEX.z * 0.27 - game_time * 0.83) * 0.035 * clamp(d * 0.4, 0.0, 1.0);
	VERTEX.y = y + sw;
	v_depth = d;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float d = v_depth;
	if (d <= 0.0) {
		discard;
	}
	vec2 p = v_world.xz;
	float t = game_time;
	float n = vnoise(p * 0.9 + vec2(t * 0.15, -t * 0.1));
	float n2 = mix(0.5, vnoise(p * 3.1 - vec2(t * 0.3, t * 0.22)), 1.0 - smoothstep(40.0, 120.0, length(VERTEX)));
	float k = smoothstep(0.0, 6.0, d);
	vec3 col = mix(shallow_col, deep_col, k);
	float alpha = mix(0.42, 0.97, smoothstep(0.0, 2.8, d));
	// Foam: a soft band at the edge, broken up, and a second line breathing.
	float fw = 0.16 + 0.12 * n;
	float foam = 1.0 - smoothstep(fw * 0.35, fw, d);
	float ring = 0.36 + 0.14 * sin(t * 0.8 + n * 4.0);
	float band2 = (1.0 - smoothstep(0.0, 0.05, abs(d - ring))) * step(d, 0.7) * smoothstep(0.35, 0.65, n2);
	foam = max(foam * (0.65 + 0.35 * n2), band2 * 0.7);
	col = mix(col, foam_col, foam * 0.9);
	alpha = max(alpha, foam * 0.92);
	// Small waves in the normal.
	float dist = length(VERTEX);
	float near = 1.0 - smoothstep(30.0, 140.0, dist);
	float e = 0.6;
	float hx = vnoise((p + vec2(e, 0.0)) * 0.45 + t * 0.25) - vnoise((p - vec2(e, 0.0)) * 0.45 + t * 0.25);
	float hz = vnoise((p + vec2(0.0, e)) * 0.45 - t * 0.2) - vnoise((p - vec2(0.0, e)) * 0.45 - t * 0.2);
	hx += (vnoise(p * 1.4 + t * 0.5) - 0.5) * 0.25 * near;
	hz += (vnoise(p * 1.4 - t * 0.45 + 7.0) - 0.5) * 0.25 * near;
	vec3 nw = normalize(vec3(-hx * 0.32, 1.0, -hz * 0.32));
	NORMAL = normalize((VIEW_MATRIX * vec4(nw, 0.0)).xyz);
	ALBEDO = col;
	ALPHA = alpha;
	ROUGHNESS = mix(0.07, 0.85, foam);
	SPECULAR = 0.55;
}
