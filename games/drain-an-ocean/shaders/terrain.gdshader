shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;
// The seabed and the shore. Colour comes from the painted vertex colours
// (art/bay/make_bay.py); water levels come from the Bay: every vertex looks up
// which body of water it belongs to (body_tex) and that body's level.
// Wet sand is darker and glossy and dries as the water drops away from it;
// sand under shallow water catches caustics; on the dry seabed the old ring
// depths show as faint chart isobaths.

uniform sampler2D body_tex : filter_nearest;
uniform sampler2D drained_tex : filter_nearest;
uniform float levels[32];
uniform float grid_w = 129.0;
uniform float game_time = 0.0;
uniform vec3 under_tint : source_color = vec3(0.55, 0.78, 0.74);
uniform vec3 ink : source_color = vec3(0.11, 0.165, 0.2);
uniform float isobath_alpha = 0.22;

varying float v_water;
varying float v_has;
varying float v_age;
varying vec3 v_world;

vec3 to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
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

void vertex() {
	ivec2 c = ivec2(round(UV * (grid_w - 1.0)));
	int slot = int(round(texelFetch(body_tex, c, 0).r * 255.0));
	bool has = slot < 32;
	v_has = has ? 1.0 : 0.0;
	v_water = has ? levels[slot] : VERTEX.y - 3.0;
	v_age = game_time - texelFetch(drained_tex, c, 0).r;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 col = to_linear(COLOR.rgb);
	vec2 p = v_world.xz;
	float y = v_world.y;
	// Grain and sand ripples (wind and current marks), broken up by noise.
	float n1 = vnoise(p * 1.9);
	float far = smoothstep(35.0, 110.0, length(VERTEX));
	float n2 = mix(vnoise(p * 7.3), 0.5, far);
	float rip = sin(dot(p, vec2(0.62, 1.31)) * 3.1 + n1 * 5.0) * 0.5 + 0.5;
	col *= 0.9 + 0.12 * n1 + 0.06 * n2;
	col *= 1.0 - 0.07 * rip * smoothstep(-0.5, -1.5, y) * (1.0 - smoothstep(-15.0, -19.0, y));
	float depth = v_water - y;              // > 0 under water
	float above = -depth;
	float damp_level = (1.0 - smoothstep(0.0, 1.7, above)) * v_has;
	float damp_age = 1.0 - smoothstep(0.0, 45.0, v_age);
	float damp = clamp(max(damp_level, damp_age), 0.0, 1.0);
	float rough = 0.93;
	float spec = 0.25;
	if (depth > 0.0) {
		// Under water: cooler, darker with depth, caustics in the shallows.
		float uw = smoothstep(0.0, 7.0, depth);
		col *= mix(under_tint, under_tint * 0.35, uw);
		float t = game_time;
		float c1 = sin(p.x * 1.7 + t * 0.8 + sin(p.y * 1.3 + t * 0.6) * 1.6);
		float c2 = sin(p.y * 1.9 - t * 0.7 + sin(p.x * 1.1 - t * 0.5) * 1.6);
		float caust = pow(clamp(1.0 - abs(c1 + c2) * 0.5, 0.0, 1.0), 7.0);
		col += vec3(0.55, 0.62, 0.5) * caust * (1.0 - smoothstep(0.3, 4.0, depth)) * 0.35;
		rough = 0.85;
	} else {
		// Wet sand: darker and glossy, drying back as the water leaves.
		col *= mix(1.0, 0.56, damp);
		rough = mix(0.94, 0.28, damp);
		spec = mix(0.2, 0.62, damp);
		// A thin line of tide wrack just above the waterline.
		float wrack = smoothstep(0.08, 0.0, abs(above - 0.12 - 0.05 * n1)) * v_has * (1.0 - smoothstep(0.0, 0.6, abs(above)));
		col = mix(col, col * vec3(0.55, 0.5, 0.42), wrack * 0.5);
		// Faint chart isobaths at the old ring depths, dashed.
		if (y < -0.5) {
			float line = 0.0;
			for (int k = 0; k < 5; k++) {
				float b = k == 0 ? -3.0 : (k == 1 ? -7.0 : (k == 2 ? -11.0 : (k == 3 ? -15.0 : -20.0)));
				float fw = fwidth(y) * 1.3 + 0.004;
				line = max(line, 1.0 - smoothstep(0.0, fw, abs(y - b)));
			}
			float dash = step(0.45, fract((p.x + p.y) * 0.35));
			col = mix(col, to_linear(ink), line * dash * isobath_alpha);
		}
	}
	// Pull the warm sand back a little: value structure over saturation.
	col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, 0.78);
	ALBEDO = col;
	ROUGHNESS = rough;
	SPECULAR = spec;
}
