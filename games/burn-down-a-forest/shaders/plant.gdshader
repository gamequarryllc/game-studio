shader_type spatial;
render_mode diffuse_lambert, specular_disabled;
// Every plant in the forest (and the meadow flowers), drawn from MultiMeshes.
// Vertex colour: rgb = the colour (or a shade, for leaves), alpha = what it is:
//   1 = leaves (tinted per instance), 0.5 = cursed glow bits, 0 = bark / stems.
// INSTANCE_CUSTOM: r = time it caught fire (< 0: never), g = 0..1 hue / flower colour,
//   b = time it crumbles away (ash -> meadow), a = how long it burns.
// `now` is set every frame by the game, in the same clock as those times.

uniform float now = 0.0;
uniform float flower_mode = 0.0;
uniform vec3 curse_a : source_color = vec3(0.36, 0.22, 0.6);
uniform vec3 curse_b : source_color = vec3(0.1, 0.42, 0.48);
uniform vec3 glow_color : source_color = vec3(0.25, 0.85, 0.95);
uniform vec2 wind = vec2(0.6, -0.4);
uniform float sway = 0.035;
// Trees near the camera, or between the camera and the keeper, dissolve
// (dithered) so the chase camera can always see the keeper and the fire.
uniform vec3 cam_pos = vec3(0.0, 1000.0, 0.0);
uniform vec3 focus_pos = vec3(0.0);
uniform float see_through = 1.0;

varying float v_burn;
varying float v_hue;
varying float v_y;
varying float v_seed;
varying vec3 v_world;

void vertex() {
	float t0 = INSTANCE_CUSTOM.r;
	float burn = t0 < 0.0 ? 0.0 : clamp((now - t0) / max(INSTANCE_CUSTOM.a, 0.1), 0.0, 1.0);
	float gone = clamp((now - INSTANCE_CUSTOM.b) / 0.7, 0.0, 1.0);
	float grow = 1.0;
	if (flower_mode > 0.5) {
		// flowers: custom.r is when it sprouted
		burn = 0.0;
		grow = clamp((now - t0) / 0.9, 0.0, 1.0);
		grow = grow * grow * (3.0 - 2.0 * grow);
		gone = 0.0;
	}
	v_burn = burn;
	v_hue = INSTANCE_CUSTOM.g;
	v_seed = fract(INSTANCE_CUSTOM.g * 7.31);
	v_y = VERTEX.y;
	float ph = v_seed * 6.2831 + MODEL_MATRIX[3].x * 0.31 + MODEL_MATRIX[3].z * 0.17;
	float s = sin(TIME * 1.3 + ph) * sway * VERTEX.y * (0.4 + 0.6 * COLOR.a);
	VERTEX.xz += wind * s;
	// Burning: the tree shivers in the heat, then slumps into charcoal.
	VERTEX.xz += vec2(sin(TIME * 23.0 + ph), cos(TIME * 19.0 + ph)) * 0.025 * burn * (1.0 - burn) * VERTEX.y;
	VERTEX.y *= 1.0 - 0.35 * burn * burn;
	VERTEX.xz *= 1.0 - 0.25 * burn * burn * COLOR.a;
	VERTEX *= (1.0 - gone) * grow;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

vec3 flower(float h) {
	float k = floor(h * 6.0);
	if (k < 1.0) return vec3(1.0, 0.56, 0.78);
	if (k < 2.0) return vec3(1.0, 0.86, 0.3);
	if (k < 3.0) return vec3(1.0, 1.0, 0.96);
	if (k < 4.0) return vec3(0.62, 0.72, 1.0);
	if (k < 5.0) return vec3(1.0, 0.6, 0.3);
	return vec3(0.86, 0.6, 1.0);
}

void fragment() {
	if (see_through > 0.5) {
		float fade = smoothstep(1.5, 5.0, distance(v_world, cam_pos));
		vec3 ab = focus_pos - cam_pos;
		float t = clamp(dot(v_world - cam_pos, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
		float dl = distance(v_world, cam_pos + ab * t);
		float between = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.82, 0.97, t));
		fade = min(fade, mix(1.0, smoothstep(0.8, 3.2, dl), between));
		// and the canopy right over the keeper's head
		float dk = length(v_world.xz - focus_pos.xz);
		fade = min(fade, mix(1.0, smoothstep(1.6, 3.0, dk), step(focus_pos.y + 0.4, v_world.y)));
		float noise = fract(52.9829189 * fract(dot(FRAGCOORD.xy, vec2(0.06711056, 0.00583715))));
		if (fade < noise) {
			discard;
		}
	}
	float leaf = step(0.75, COLOR.a);
	float glow = step(0.25, COLOR.a) * (1.0 - leaf);
	vec3 tint = flower_mode > 0.5 ? flower(v_hue) : mix(curse_a, curse_b, v_hue) * 1.7;
	vec3 col = mix(COLOR.rgb, COLOR.rgb * tint, leaf);
	if (flower_mode < 0.5) {
		col = mix(col, glow_color, glow);
	}
	col = mix(col, vec3(0.055, 0.045, 0.045), smoothstep(0.08, 0.7, v_burn));
	ALBEDO = col;
	ROUGHNESS = 0.95;
	float crack = 0.5 + 0.5 * sin(TIME * 7.0 + v_y * 5.0 + v_seed * 20.0);
	vec3 em = glow_color * glow * 0.55 * (1.0 - v_burn);
	em += vec3(1.0, 0.34, 0.06) * smoothstep(0.08, 0.45, v_burn) * (1.0 - smoothstep(0.85, 1.0, v_burn)) * (0.35 + crack) * 1.4;
	EMISSION = em;
}
