shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, fog_disabled;
// A hand-drawn cartoon flame on a camera-facing quad (it stays upright and
// leans with the wind). Flat areas of colour inside an ink outline, a hot core
// low down, smoky tips, and it moves in held drawings (8 a second, like cel
// animation) instead of sliding noise. Opaque with a cut-out edge, never added
// on top, so a big fire never blows out to white.
// From a MultiMesh: INSTANCE_CUSTOM r = random seed, g = how strong (0..1),
// b = colour style (0 = cursed-wood fire, 1 = golden phoenix, 2 = dragon violet).
// The quad's bottom edge sits on the instance origin.

uniform vec2 wind = vec2(0.6, -0.4);
uniform vec3 ink : source_color = vec3(0.18, 0.118, 0.078);
uniform vec3 body_col : source_color = vec3(0.91, 0.39, 0.17);
uniform vec3 core_col : source_color = vec3(1.0, 0.757, 0.369);
uniform vec3 deep_col : source_color = vec3(0.72, 0.21, 0.12);
uniform vec3 smoke_col : source_color = vec3(0.29, 0.23, 0.29);
uniform float fps = 8.0;

varying vec4 v_c;

void vertex() {
	v_c = INSTANCE_CUSTOM;
	vec3 o = MODEL_MATRIX[3].xyz;
	float sx = length(MODEL_MATRIX[0].xyz);
	float sy = length(MODEL_MATRIX[1].xyz);
	// Flames right by the camera would fill the screen: they shrink away instead of fading.
	float near = smoothstep(2.5, 7.0, distance(o + vec3(0.0, sy * 0.4, 0.0), INV_VIEW_MATRIX[3].xyz));
	sx *= near;
	sy *= near;
	vec3 right = normalize(vec3(INV_VIEW_MATRIX[0].x, 0.0, INV_VIEW_MATRIX[0].z));
	float h = VERTEX.y + 0.5;
	vec3 p = o + right * VERTEX.x * sx + vec3(0.0, h * sy, 0.0);
	float frame = floor(TIME * fps + v_c.r * 7.0);
	float jig = fract(sin(frame * 12.9898 + v_c.r * 78.233) * 43758.5453) - 0.5;
	p.xz += (wind * 0.32 + vec2(jig * 0.16)) * h * h * sy * 0.5;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
}

float rnd(float n) {
	return fract(sin(n * 91.3458 + 17.0) * 47453.5453);
}

void fragment() {
	float h = 1.0 - UV.y;
	float x = (UV.x - 0.5) * 2.0;
	// a new drawing 8 times a second, each a little different
	float frame = floor(TIME * fps + v_c.r * 7.0);
	float f0 = rnd(frame + v_c.r * 31.0);
	float f1 = rnd(frame * 1.7 + v_c.r * 13.0);
	float f2 = rnd(frame * 2.3 + v_c.r * 5.0);
	float strength = 0.75 + 0.25 * v_c.g;
	// the body: a fat teardrop, round at the bottom
	float lean = (f0 - 0.5) * 0.3 * h * h;
	// the body: a fat round-bottomed teardrop that reaches about two thirds up
	float hb = h / (0.62 + 0.12 * f1);
	float w = sqrt(clamp(hb * 3.2, 0.0, 1.0)) * pow(max(1.0 - hb, 0.0), 0.75) * 0.98 * strength;
	float shape = w - abs(x - lean);
	// one tall curling tongue and one or two smaller ones, redrawn every frame
	float seedw = fract(v_c.r * 9.17);
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		float r1 = rnd(frame * (3.1 + fi) + v_c.r * (11.0 + fi * 7.0));
		bool main_t = i == 0;
		if (!main_t && fi > 1.0 + seedw * 1.5) {
			break;
		}
		float side = main_t ? (seedw - 0.5) * 0.3 : (fi == 1.0 ? -1.0 : 1.0) * (0.3 + 0.12 * r1);
		float top = main_t ? 0.86 + r1 * 0.12 : 0.5 + r1 * 0.22;
		float base = main_t ? 0.3 : 0.25;
		float tt = clamp((h - base) / max(top - base, 0.05), 0.0, 1.0);
		float curl = (r1 - 0.5) * (main_t ? 0.55 : 0.4) * tt * tt + (main_t ? (seedw - 0.5) * 0.35 * tt : side * 0.25 * tt);
		float tw = (main_t ? 0.34 : 0.2) * pow(1.0 - tt, 1.25) * (h > base - 0.05 ? 1.0 : 0.0) * strength;
		shape = max(shape, tw - abs(x - side * (1.0 - tt * 0.4) - curl));
	}
	shape += (f1 - 0.5) * 0.015;
	if (shape <= 0.0) {
		discard;
	}
	vec3 body = body_col;
	vec3 core = core_col;
	vec3 deep = deep_col;
	if (v_c.b > 1.5) {
		body = vec3(0.6, 0.31, 0.82);
		core = vec3(0.94, 0.63, 0.91);
		deep = vec3(0.36, 0.17, 0.55);
	} else if (v_c.b > 0.5) {
		body = vec3(0.95, 0.76, 0.31);
		core = vec3(1.0, 0.88, 0.54);
		deep = vec3(0.85, 0.48, 0.16);
	}
	vec3 col = body;
	// a darker band just inside the outline, then the hot core low down
	col = mix(deep, col, smoothstep(0.03, 0.09, shape));
	float core_shape = w * 0.62 - abs(x - lean * 0.6) - h * 0.25;
	col = mix(col, core, step(0.0, core_shape) * step(h, 0.62 + f2 * 0.08));
	// smoky tips: the very tops of the tongues go to soot
	col = mix(col, smoke_col, step(0.72 + f2 * 0.08, h) * step(shape, 0.12));
	// the ink outline
	col = mix(ink, col, step(0.034, shape));
	ALBEDO = col;
}
