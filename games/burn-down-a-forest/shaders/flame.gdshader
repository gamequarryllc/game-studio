shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
// A cartoon flame on a camera-facing quad (it stays upright, leans with the
// wind). Drawn from a MultiMesh: INSTANCE_CUSTOM r = random seed, g = how
// strong (0..1), b = colour style (0 = cursed-wood fire, 1 = golden phoenix,
// 2 = dragon purple), a = unused. The quad's bottom edge sits on the instance origin.

uniform vec2 wind = vec2(0.6, -0.4);
uniform float brightness = 1.0;

varying vec4 v_c;
varying float v_near;

void vertex() {
	v_c = INSTANCE_CUSTOM;
	vec3 o = MODEL_MATRIX[3].xyz;
	float sx = length(MODEL_MATRIX[0].xyz);
	float sy = length(MODEL_MATRIX[1].xyz);
	vec3 right = normalize(vec3(INV_VIEW_MATRIX[0].x, 0.0, INV_VIEW_MATRIX[0].z));
	float h = VERTEX.y + 0.5;
	vec3 p = o + right * VERTEX.x * sx + vec3(0.0, h * sy, 0.0);
	float flick = sin(TIME * 9.0 + v_c.r * 40.0) * 0.06 + sin(TIME * 5.3 + v_c.r * 13.0) * 0.08;
	p.xz += (wind * 0.35 + vec2(flick)) * h * h * sy * 0.5;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
	// Flames right by the camera would fill the screen: fade them out.
	v_near = smoothstep(2.5, 7.0, distance(o + vec3(0.0, sy * 0.4, 0.0), INV_VIEW_MATRIX[3].xyz));
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
	float t = TIME * (1.6 + v_c.r) + v_c.r * 17.0;
	float n = vnoise(vec2(x * 2.2 + v_c.r * 9.0, h * 3.2 - t * 2.1)) * 0.65 + vnoise(vec2(x * 5.0, h * 7.0 - t * 4.0)) * 0.35;
	// Teardrop: round at the bottom, licking up to a point.
	float width = sqrt(clamp(h * 6.0, 0.0, 1.0)) * (1.0 - h) * 1.05 + 0.04;
	float shape = width - abs(x) * (0.9 + 0.3 * h) + (n - 0.5) * 0.55 * (0.25 + h);
	float a = smoothstep(0.0, 0.18, shape);
	float core = smoothstep(0.18, 0.55, shape) * (1.0 - h * 0.6);
	vec3 outer = vec3(0.95, 0.16, 0.06);
	vec3 mid = vec3(1.0, 0.5, 0.1);
	vec3 hot = vec3(1.0, 0.92, 0.6);
	if (v_c.b > 1.5) {
		outer = vec3(0.55, 0.1, 0.9);
		mid = vec3(0.95, 0.3, 0.85);
		hot = vec3(1.0, 0.85, 1.0);
	} else if (v_c.b > 0.5) {
		outer = vec3(1.0, 0.45, 0.1);
		mid = vec3(1.0, 0.78, 0.2);
		hot = vec3(1.0, 1.0, 0.85);
	}
	vec3 col = mix(outer, mid, smoothstep(0.0, 0.3, shape));
	col = mix(col, hot, core);
	float fade = (1.0 - smoothstep(0.75, 1.0, h)) * smoothstep(0.0, 0.06, h);
	ALBEDO = col * brightness * (0.6 + 0.4 * v_c.g);
	ALPHA = a * fade * (0.55 + 0.45 * v_c.g) * v_near;
}
