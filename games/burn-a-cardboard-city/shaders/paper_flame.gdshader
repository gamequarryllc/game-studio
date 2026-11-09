shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_opaque, fog_disabled;
// Fire, cut from paper: flat layered flames (red rim, orange, yellow core) with a
// darker cut edge, flickering at a stop-motion 8 frames a second. Drawn from a
// MultiMesh of camera-facing quads that stay upright and lean with the wind.
// INSTANCE_CUSTOM r = seed, g = strength 0..1, b = style (0 fire, 1 golden, 2 party, 3 blue gas), a = unused.
// (A single MeshInstance gets its instance values from the `single` uniform instead.)
// Alpha-scissored, so it draws in the opaque pass (cheap on phones, no sorting).

uniform vec2 wind = vec2(0.6, -0.4);
uniform float brightness = 1.35;
uniform float near_fade = 1.0;     // 0 for a flame held right in front of the eye (the candle)

varying vec4 v_c;
varying float v_near;

uniform vec4 single = vec4(0.0);

void vertex() {
	v_c = INSTANCE_CUSTOM + single;
	vec3 o = MODEL_MATRIX[3].xyz;
	float sx = length(MODEL_MATRIX[0].xyz);
	float sy = length(MODEL_MATRIX[1].xyz);
	vec3 right = normalize(vec3(INV_VIEW_MATRIX[0].x, 0.0, INV_VIEW_MATRIX[0].z));
	float h = VERTEX.y + 0.5;
	float step_t = floor(TIME * 8.0 + v_c.r * 13.0) / 8.0;
	vec3 p = o + right * VERTEX.x * sx + vec3(0.0, h * sy, 0.0);
	p.xz += (wind * 0.3 + vec2(sin(step_t * 5.0 + v_c.r * 30.0) * 0.08)) * h * h * sy;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
	v_near = distance(o, INV_VIEW_MATRIX[3].xyz);
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
	float h = 1.0 - UV.y;
	float x = (UV.x - 0.5) * 2.0;
	float seed = v_c.r;
	float t = floor(TIME * 8.0 + seed * 13.0) / 8.0;
	float n1 = vnoise(vec2(x * 1.8 + seed * 9.0, h * 2.2 - t * 2.6));
	float n2 = vnoise(vec2(x * 3.6 - seed * 3.0, h * 3.4 - t * 4.1));
	float width = sqrt(clamp(h * 5.0, 0.0, 1.0)) * pow(1.0 - h, 0.85) * 1.05 + 0.02;
	float sway = (n1 - 0.5) * 0.5 * h;
	// Tongues: the top splits into licks that move on every frame.
	float tongues = 0.16 * h * sin(x * 6.5 + t * 7.0 + seed * 20.0);
	float shape = width + tongues - abs(x + sway) + (n2 - 0.5) * 0.3 * h;
	float outer = step(0.0, shape);
	float rim = outer * (1.0 - step(0.045, shape));
	float mid = step(0.13 + 0.06 * h, shape);
	float core = step(0.27 + 0.12 * h, shape) * step(h, 0.72);
	vec3 c_out = vec3(0.93, 0.24, 0.07);
	vec3 c_mid = vec3(1.0, 0.54, 0.1);
	vec3 c_core = vec3(1.0, 0.88, 0.42);
	vec3 c_rim = vec3(0.6, 0.1, 0.04);
	if (v_c.b > 2.5) {
		c_out = vec3(0.2, 0.42, 1.0);
		c_mid = vec3(0.45, 0.7, 1.0);
		c_core = vec3(0.9, 0.97, 1.0);
		c_rim = vec3(0.1, 0.2, 0.6);
	} else if (v_c.b > 1.5) {
		float hue = fract(seed * 3.0 + t * 0.5);
		c_out = 0.5 + 0.5 * cos(6.2832 * (hue + vec3(0.0, 0.33, 0.67)));
		c_mid = 0.5 + 0.5 * cos(6.2832 * (hue + 0.25 + vec3(0.0, 0.33, 0.67)));
		c_core = vec3(1.0, 0.96, 0.85);
		c_rim = c_out * 0.5;
	} else if (v_c.b > 0.5) {
		c_out = vec3(1.0, 0.55, 0.12);
		c_mid = vec3(1.0, 0.8, 0.25);
		c_core = vec3(1.0, 0.98, 0.8);
		c_rim = vec3(0.75, 0.38, 0.06);
	}
	vec3 col = mix(c_out, c_mid, mid);
	col = mix(col, c_core, core);
	col = mix(col, c_rim, rim);
	ALBEDO = col * brightness * (0.75 + 0.35 * v_c.g);
	// Flames right in front of the eye would fill the screen.
	ALPHA = outer * mix(1.0, smoothstep(0.6, 1.6, v_near), near_fade);
	ALPHA_SCISSOR_THRESHOLD = 0.5;
}
