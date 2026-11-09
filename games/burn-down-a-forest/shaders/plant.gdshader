shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_disabled;
// Every plant in the forest (and the meadow flowers), drawn from MultiMeshes.
// Models come from Blender with their detail baked into vertex colours (linear):
//   rgb = the colour (AO, gradient, carved highlights, wear already in), alpha = what it is:
//   1 = foliage, 0.5 = glow (mint curse knots and hearts), 0 = bark / stems / stone.
// INSTANCE_CUSTOM: r = time it caught fire (< 0: never), g = 0..1 per-plant variation,
//   b = time it crumbles away (ash -> meadow), a = how long it burns.
// `now` is set every frame by the game, in the same clock as those times.
//
// Burning: a charred front climbs the tree from the roots, a thin band of
// glowing ember just under it, and behind it the bark splits into glowing
// cracks that cool and go dark (cracks, not a noise texture).
// Light: cool moonlight (the scene's directional light, with shadows), a cold
// rim on the canopy tops, warm light from fires nearby (`fire_light`, a small
// blurred map of the burning cells) and from the keeper's lantern.
// The keeper is never hidden: anything between the camera and them is cut
// away in a clean round window on screen, with an inked rim.

uniform float now = 0.0;
uniform float flower_mode = 0.0;
uniform vec2 wind = vec2(0.6, -0.4);
uniform float sway = 0.035;
uniform vec3 ink : source_color = vec3(0.18, 0.118, 0.078);
uniform float ink_edge = 0.45;
uniform vec3 char_color : source_color = vec3(0.07, 0.05, 0.06);
uniform vec3 burn_color : source_color = vec3(0.91, 0.39, 0.17);
uniform vec3 core_color : source_color = vec3(1.0, 0.757, 0.369);
uniform float glow_strength = 1.3;
uniform vec3 rim_color : source_color = vec3(0.62, 0.72, 0.95);
uniform float rim_strength = 0.4;
uniform sampler2D fire_light : filter_linear_mipmap, repeat_disable;
uniform vec2 forest_origin = vec2(-60.0, -60.0);
uniform float forest_size = 120.0;
uniform vec3 fire_tint : source_color = vec3(1.0, 0.55, 0.25);
uniform float fire_gain = 2.2;
uniform vec3 lantern_pos = vec3(0.0, -100.0, 0.0);
uniform vec3 lantern_tint : source_color = vec3(1.0, 0.66, 0.34);
uniform float lantern_gain = 0.55;
uniform vec3 cam_pos = vec3(0.0, 1000.0, 0.0);
uniform vec3 focus_pos = vec3(0.0);
uniform float see_through = 1.0;
uniform float hole_radius = 2.3;
uniform float foreground_dark = 0.14;
uniform float albedo_gain = 1.15;
uniform float healed = 0.0;      // 0 cursed .. 1 the curse lifted (the far woods turn green)

varying float v_burn;
varying float v_var;
varying float v_y;
varying float v_height;
// a flat fill under every light: the night stays plum but never goes black (L* 20-25 in the shadows)
uniform vec3 fill = vec3(0.0);       // linear (set from code, not converted)

varying vec3 v_world;
varying vec4 v_clip;
varying float v_small;

void vertex() {
	float t0 = INSTANCE_CUSTOM.r;
	float dur = max(INSTANCE_CUSTOM.a, 0.1);
	float burn = t0 < 0.0 ? 0.0 : clamp((now - t0) / dur, 0.0, 1.0);
	float gone = clamp((now - INSTANCE_CUSTOM.b) / 0.7, 0.0, 1.0);
	float leaf = step(0.75, COLOR.a);
	v_y = VERTEX.y;
	v_height = dur * 0.85;                 // how tall the plant is, from how long it burns
	// grass and bushes (custom.a 0.5 while standing, a short burn while burning) never
	// hide the keeper: the round window leaves them be
	v_small = t0 < 0.0 ? step(INSTANCE_CUSTOM.a, 0.75) : step(INSTANCE_CUSTOM.a, 5.0);
	if (flower_mode > 0.5) {
		// flowers: custom.r is when it sprouted. The stem shoots up first, then
		// the head opens with a little overshoot.
		burn = 0.0;
		gone = 0.0;
		float g = clamp((now - t0) / 0.55, 0.0, 1.0);
		float up = g * g * (3.0 - 2.0 * g);
		float o = clamp((now - t0 - 0.35) / 0.6, 0.0, 1.0);
		float open = 1.0 - pow(1.0 - o, 3.0) + 0.22 * sin(o * 3.14159);
		VERTEX.y *= up;
		VERTEX.xz *= mix(0.15, 1.0, open) * mix(1.0, 1.0, step(0.0, VERTEX.y));
	}
	v_burn = burn;
	v_var = INSTANCE_CUSTOM.g;
	float seed = fract(INSTANCE_CUSTOM.g * 7.31);
	float ph = seed * 6.2831 + MODEL_MATRIX[3].x * 0.31 + MODEL_MATRIX[3].z * 0.17;
	float s = sin(TIME * 1.3 + ph) * sway * VERTEX.y * (0.35 + 0.65 * leaf);
	VERTEX.xz += wind * s;
	// Burning: the tree shivers in the heat, then slumps into charcoal.
	VERTEX.xz += vec2(sin(TIME * 23.0 + ph), cos(TIME * 19.0 + ph)) * 0.025 * burn * (1.0 - burn) * VERTEX.y;
	VERTEX.y *= 1.0 - 0.3 * burn * burn;
	VERTEX.xz *= 1.0 - 0.28 * burn * burn * leaf;
	VERTEX *= (1.0 - gone);
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_clip = PROJECTION_MATRIX * VIEW_MATRIX * vec4(v_world, 1.0);
}

vec2 hash2(vec2 p) {
	p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
	return fract(sin(p) * 43758.5453);
}

float crack(vec2 p) {
	// distance to the nearest edge of a cell pattern: thin cracks between bark plates
	vec2 i = floor(p);
	vec2 f = fract(p);
	float d1 = 8.0;
	float d2 = 8.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 o = hash2(i + g) * 0.85 + 0.075;
			float d = length(g + o - f);
			if (d < d1) {
				d2 = d1;
				d1 = d;
			} else if (d < d2) {
				d2 = d;
			}
		}
	}
	return d2 - d1;
}

void fragment() {
	float leaf = step(0.75, COLOR.a);
	float glow = step(0.25, COLOR.a) * (1.0 - leaf);
	vec3 col = COLOR.rgb;
	// each plant a touch lighter or darker, warmer or cooler than its neighbours
	float v = v_var - 0.5;
	col *= 1.0 + v * 0.24 * (0.4 + 0.6 * leaf);
	col *= vec3(1.0 + v * 0.06, 1.0, 1.0 - v * 0.06);
	// and every tree its own cast of leaf: some plummier, some bluer, some greyer
	float hv = fract(v_var * 5.3);
	vec3 alt = hv < 0.33 ? col * vec3(1.2, 0.84, 0.84) : (hv < 0.66 ? col * vec3(0.78, 0.97, 1.15) : mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))), 0.45) * 1.08);
	col = mix(col, alt, leaf * (0.3 + 0.7 * fract(v_var * 11.7)) * (1.0 - flower_mode));
	// once the curse is lifted the woods on the hills turn green again
	vec3 green = vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.62, 1.05, 0.5) * 1.5;
	col = mix(col, green, healed * leaf * (1.0 - flower_mode));
	col = mix(col, col * vec3(1.1, 0.95, 0.85), healed * (1.0 - leaf));
	// the inked edge of the silhouette (a linocut line, from the normals)
	float fr = 1.0 - abs(dot(normalize(NORMAL), normalize(VIEW)));
	float edge = smoothstep(0.62, 0.97, fr) * ink_edge * (1.0 - glow);
	col = mix(col, ink, edge);
	// the foreground (nearer than the keeper) goes darker, framing them and the fire beyond
	float dc = distance(v_world, cam_pos);
	float kd = max(distance(focus_pos, cam_pos), 4.0);
	col *= mix(1.0 - foreground_dark, 1.0, smoothstep(kd * 0.35, kd * 0.85, dc));
	vec3 em = COLOR.rgb * glow * glow_strength;

	// --- burning: a charred front climbing from the roots, glowing cracks behind it
	if (v_burn > 0.0) {
		float H = max(v_height, 0.6);
		float front = v_burn * H * 1.35 - 0.2;
		float charred = 1.0 - smoothstep(front - 0.25, front + 0.05, v_y);
		col = mix(col, char_color * (0.8 + 0.4 * v_var), charred);
		glow *= 1.0 - charred;
		em *= 1.0 - charred;
		float alive = 1.0 - smoothstep(0.86, 1.0, v_burn);
		// the creeping edge: a thin line of ember right under the front
		float band = smoothstep(front - 0.22, front - 0.08, v_y) * (1.0 - smoothstep(front - 0.08, front + 0.02, v_y));
		em += mix(burn_color, core_color, 0.3) * band * 1.1 * alive;
		// behind it the bark splits into thin glowing cracks that cool as the front
		// moves on; the leaves just char, with a few embers caught in them
		vec3 n = abs((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
		vec2 q = (n.x > n.z ? v_world.zy : v_world.xy) * vec2(5.5, 3.2);
		if (n.y > 0.75) {
			q = v_world.xz * 5.5;
		}
		float c = 1.0 - smoothstep(0.02, 0.06, crack(q + v_var * 13.0));
		float heat = (1.0 - smoothstep(0.0, H * 0.4, front - v_y)) * charred;
		float flick = 0.75 + 0.25 * sin(TIME * 7.0 + v_world.y * 3.0 + v_var * 20.0);
		float bark = 1.0 - leaf;
		em += mix(burn_color, core_color, heat * heat) * c * bark * heat * 1.2 * flick * alive;
		// the leaves glow only along the creeping edge, never in a speckle
		em += burn_color * leaf * smoothstep(front - 0.55, front - 0.1, v_y) * (1.0 - smoothstep(front - 0.1, front + 0.05, v_y)) * 0.55 * alive;
	}

	// --- the round window: cut away whatever is between the camera and the keeper
	if (see_through > 0.5 && flower_mode < 0.5) {
		float keep = smoothstep(1.8, 4.5, dc);
		vec4 kc = PROJECTION_MATRIX * VIEW_MATRIX * vec4(focus_pos, 1.0);
		if (kc.w > 0.1 && v_clip.w < kc.w + 0.4 && v_small < 0.5) {
			float aspect = VIEWPORT_SIZE.x / max(VIEWPORT_SIZE.y, 1.0);
			vec2 a = v_clip.xy / v_clip.w;
			vec2 b = kc.xy / kc.w;
			float dd = length(vec2((a.x - b.x) * aspect, a.y - b.y));
			float r = hole_radius * PROJECTION_MATRIX[1][1] / kc.w;
			keep = min(keep, smoothstep(r * 0.94, r * 1.06, dd));
		}
		if (keep < 0.5) {
			discard;
		}
		// an inked rim where the window cuts through the tree
		col = mix(col, ink, 1.0 - smoothstep(0.5, 0.68, keep));
	}

	// --- light from the fire and the lantern (painted in, no extra light passes)
	vec2 fuv = (v_world.xz - forest_origin) / forest_size;
	vec3 nw = (INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz;
	float fl = textureLod(fire_light, fuv, 1.0).r * 0.55 + textureLod(fire_light, fuv, 2.5).r * 1.6;
	fl = 1.0 - exp(-fl * 1.6);
	fl *= 1.0 - smoothstep(2.0, 9.0, v_y);     // the low trunks catch it, the high crowns less
	// the canopies round a fire catch its glow too, strongest on their undersides
	// and sides (lit from below), from a wider blur of the fire map
	float fw = textureLod(fire_light, fuv, 3.2).r * 2.4 + textureLod(fire_light, fuv, 1.8).r * 0.6;
	fw = (1.0 - exp(-fw * 1.4)) * leaf * (0.45 + 0.55 * clamp(0.5 - nw.y * 0.8, 0.0, 1.0));
	fl = max(fl, fw * 0.85);
	float ld = distance(v_world, lantern_pos);
	float ll = pow(clamp(1.0 - ld / 6.5, 0.0, 1.0), 2.0) * lantern_gain;
	em += col * (fire_tint * fl * fire_gain + lantern_tint * ll) * (1.0 - v_burn * 0.6);
	// a cold rim of moonlight along the tops of the crowns
	em += rim_color * pow(fr, 3.0) * smoothstep(0.1, 0.7, nw.y) * leaf * rim_strength * (0.5 + 0.8 * fract(v_var * 3.1)) * (1.0 - v_burn) * (1.0 - healed * 0.7);
	// dark colours are lifted most, light ones (plaster, packed earth) hardly: the shadows come up, nothing glares
	float fl_l = dot(col, vec3(0.2126, 0.7152, 0.0722)) * 26.0;
	float fill_w = 1.0 / (1.0 + fl_l * fl_l);
	em += col * albedo_gain * fill * fill_w * (1.0 - v_burn * 0.7);
	ALBEDO = col * albedo_gain;
	ROUGHNESS = 1.0;
	EMISSION = em;
}
