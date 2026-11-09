shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_disabled;
// Every plant in the forest (and the meadow flowers), drawn from MultiMeshes.
// Models come from Blender with their detail baked into vertex colours (linear):
//   rgb = the colour (AO, gradient, highlights already in), alpha = what it is:
//   1 = foliage, 0.5 = glow (mint curse knots and hearts), 0 = bark / stems / stone.
// INSTANCE_CUSTOM: r = time it caught fire (< 0: never), g = 0..1 per-plant variation,
//   b = time it crumbles away (ash -> meadow), a = how long it burns.
// `now` is set every frame by the game, in the same clock as those times.

uniform float now = 0.0;
uniform float flower_mode = 0.0;
uniform vec2 wind = vec2(0.6, -0.4);
uniform float sway = 0.035;
uniform vec3 ink : source_color = vec3(0.18, 0.118, 0.078);
uniform float ink_edge = 0.45;
uniform vec3 char_color : source_color = vec3(0.07, 0.05, 0.05);
uniform vec3 burn_color : source_color = vec3(0.91, 0.39, 0.17);
uniform float glow_strength = 1.15;
// Trees near the camera, between the camera and the keeper, or right over the
// keeper's head are cut away in a round window around the keeper (no dither,
// no transparency), and the cut edge is inked, like a hole cut in a print.
uniform vec3 cam_pos = vec3(0.0, 1000.0, 0.0);
uniform vec3 focus_pos = vec3(0.0);
uniform float see_through = 1.0;
uniform float hole_radius = 3.6;

varying float v_burn;
varying float v_var;
varying float v_y;
varying float v_seed;
varying vec3 v_world;

void vertex() {
	float t0 = INSTANCE_CUSTOM.r;
	float burn = t0 < 0.0 ? 0.0 : clamp((now - t0) / max(INSTANCE_CUSTOM.a, 0.1), 0.0, 1.0);
	float gone = clamp((now - INSTANCE_CUSTOM.b) / 0.7, 0.0, 1.0);
	float grow = 1.0;
	if (flower_mode > 0.5) {
		// flowers: custom.r is when it sprouted; it pops up with a little overshoot
		burn = 0.0;
		float g = clamp((now - t0) / 0.9, 0.0, 1.0);
		grow = g * g * (3.0 - 2.0 * g) * (1.0 + 0.18 * sin(g * 3.14159));
		gone = 0.0;
	}
	float leaf = step(0.75, COLOR.a);
	v_burn = burn;
	v_var = INSTANCE_CUSTOM.g;
	v_seed = fract(INSTANCE_CUSTOM.g * 7.31);
	v_y = VERTEX.y;
	float ph = v_seed * 6.2831 + MODEL_MATRIX[3].x * 0.31 + MODEL_MATRIX[3].z * 0.17;
	float s = sin(TIME * 1.3 + ph) * sway * VERTEX.y * (0.35 + 0.65 * leaf);
	VERTEX.xz += wind * s;
	// Burning: the tree shivers in the heat, then slumps into charcoal.
	VERTEX.xz += vec2(sin(TIME * 23.0 + ph), cos(TIME * 19.0 + ph)) * 0.025 * burn * (1.0 - burn) * VERTEX.y;
	VERTEX.y *= 1.0 - 0.35 * burn * burn;
	VERTEX.xz *= 1.0 - 0.3 * burn * burn * leaf;
	VERTEX *= (1.0 - gone) * grow;
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
	float leaf = step(0.75, COLOR.a);
	float glow = step(0.25, COLOR.a) * (1.0 - leaf);
	vec3 col = COLOR.rgb;
	// each plant a touch lighter or darker, warmer or cooler than its neighbours
	float v = v_var - 0.5;
	col *= 1.0 + v * 0.24 * (0.4 + 0.6 * leaf);
	col *= vec3(1.0 + v * 0.06, 1.0, 1.0 - v * 0.06);
	// the inked edge of the silhouette (a linocut line, from the normals)
	float fr = 1.0 - abs(dot(normalize(NORMAL), normalize(VIEW)));
	float edge = smoothstep(0.62, 0.97, fr) * ink_edge * (1.0 - glow);
	col = mix(col, ink, edge);
	col = mix(col, char_color, smoothstep(0.08, 0.7, v_burn));
	if (see_through > 0.5 && flower_mode < 0.5) {
		float keep = smoothstep(1.8, 5.0, distance(v_world, cam_pos));
		vec3 ab = focus_pos - cam_pos;
		float t = clamp(dot(v_world - cam_pos, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
		float dl = distance(v_world, cam_pos + ab * t);
		float between = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.84, 0.97, t));
		keep = min(keep, mix(1.0, smoothstep(hole_radius * 0.35, hole_radius, dl), between));
		// and the canopy right over the keeper's head
		float dk = length(v_world.xz - focus_pos.xz);
		keep = min(keep, mix(1.0, smoothstep(1.8, 3.4, dk), step(focus_pos.y + 0.6, v_world.y)));
		if (keep < 0.5) {
			discard;
		}
		// an inked rim where the window cuts through the tree
		col = mix(col, ink, 1.0 - smoothstep(0.5, 0.6, keep));
	}
	ALBEDO = col;
	ROUGHNESS = 1.0;
	vec3 em = COLOR.rgb * glow * glow_strength * (1.0 - v_burn);
	if (v_burn > 0.05) {
		// burning: glowing veins of embers creep over the charring bark and leaves
		float n = vnoise(v_world.xz * 2.4 + vec2(v_world.y * 1.9, TIME * 0.7)) * 0.7 + vnoise(v_world.xz * 6.0 - vec2(TIME * 1.3, v_world.y * 4.0)) * 0.3;
		float hot = smoothstep(0.08, 0.45, v_burn) * (1.0 - smoothstep(0.85, 1.0, v_burn));
		em += burn_color * hot * (0.18 + smoothstep(0.5, 0.72, n) * 0.85);
	}
	EMISSION = em;
}
