shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, fog_disabled;
// Inked cartoon flames from a hand-drawn flipbook (fx/flames.png, drawn by
// art/fx/make_fx.py): each flame boils through four held drawings, 8 a second,
// leans with the wind (the taller it is, the more its tip bends), and is
// mirrored or not at random, so no two neighbours match. Opaque with a cut-out
// edge, never added on top: a big fire never blows out to white. The same
// MultiMesh draws the sparks that spit up out of the fire.
// INSTANCE_CUSTOM: r = random seed, g = how strong (0..1), b = colour style
// (0 = cursed-wood fire, 1 = golden phoenix, 2 = dragon violet),
// a = what it is (0 = a flame, 1 = the tall leading flame of a cluster, 2 = a spark).
// The quad's bottom edge sits on the instance origin.

uniform sampler2D flames : filter_linear_mipmap, repeat_disable;
uniform vec2 wind = vec2(0.6, -0.4);
uniform vec3 ink : source_color = vec3(0.16, 0.1, 0.07);
uniform vec3 body_col : source_color = vec3(0.91, 0.39, 0.17);
uniform vec3 core_col : source_color = vec3(1.0, 0.757, 0.369);
uniform vec3 deep_col : source_color = vec3(0.72, 0.21, 0.12);
uniform vec3 smoke_col : source_color = vec3(0.27, 0.2, 0.3);
uniform float fps = 8.0;
uniform vec3 focus_pos = vec3(0.0, -1000.0, 0.0);   // the keeper: flames in front of them shrink away
uniform float hole_radius = 2.6;

varying vec4 v_c;
varying float v_life;

void vertex() {
	v_c = INSTANCE_CUSTOM;
	vec3 o = MODEL_MATRIX[3].xyz;
	float sx = length(MODEL_MATRIX[0].xyz);
	float sy = length(MODEL_MATRIX[1].xyz);
	vec3 right = normalize(vec3(INV_VIEW_MATRIX[0].x, 0.0, INV_VIEW_MATRIX[0].z));
	v_life = 0.0;
	vec3 p;
	if (v_c.a > 1.5) {
		// a spark: spat up out of the fire, drifting downwind, shrinking as it cools
		float life = fract(TIME * (0.45 + 0.5 * v_c.r) + v_c.r * 13.0);
		v_life = life;
		o.y += life * (1.5 + 2.5 * v_c.r) * sy;
		o.xz += (wind * 1.6 + vec2(sin(v_c.r * 40.0 + TIME * 3.0), cos(v_c.r * 31.0 + TIME * 2.3)) * 0.35) * life * sy;
		float s = sx * (1.0 - life * 0.8);
		vec3 up = INV_VIEW_MATRIX[1].xyz;
		vec3 r = INV_VIEW_MATRIX[0].xyz;
		p = o + (r * VERTEX.x + up * VERTEX.y) * s;
	} else {
		// flames right by the camera would fill the screen: they shrink away instead of fading
		float near = smoothstep(2.5, 7.0, distance(o + vec3(0.0, sy * 0.4, 0.0), INV_VIEW_MATRIX[3].xyz));
		// and so do flames standing between the camera and the keeper (never hide the hero)
		vec4 kc = PROJECTION_MATRIX * VIEW_MATRIX * vec4(focus_pos, 1.0);
		vec4 fc = PROJECTION_MATRIX * VIEW_MATRIX * vec4(o + vec3(0.0, sy * 0.35, 0.0), 1.0);
		if (kc.w > 0.1 && fc.w > 0.1 && fc.w < kc.w - 0.5) {
			float aspect = VIEWPORT_SIZE.x / max(VIEWPORT_SIZE.y, 1.0);
			vec2 d = fc.xy / fc.w - kc.xy / kc.w;
			float r = hole_radius * PROJECTION_MATRIX[1][1] / kc.w;
			near = min(near, mix(0.22, 1.0, smoothstep(r * 0.8, r * 1.5, length(vec2(d.x * aspect, d.y)))));
		}
		sx *= near;
		sy *= near;
		float h = VERTEX.y + 0.5;
		p = o + right * VERTEX.x * sx + vec3(0.0, (h - 0.08) * sy, 0.0);
		float frame = floor(TIME * fps + v_c.r * 7.0);
		float jig = fract(sin(frame * 12.9898 + v_c.r * 78.233) * 43758.5453) - 0.5;
		float lean = 0.42 + 0.3 * v_c.a;
		p.xz += (wind * lean + vec2(jig * 0.1)) * h * h * sy * 0.55;
	}
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
}

void fragment() {
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
	if (v_c.a > 1.5) {
		// a spark: a little four-pointed glint with an ink edge
		vec2 q = abs(UV - 0.5) * 2.0;
		float d = pow(q.x, 0.6) + pow(q.y, 0.6);
		if (d > 1.0 || v_life > 0.96) {
			discard;
		}
		ALBEDO = d > 0.72 ? ink : mix(core, body, v_life);
	} else {
		float frame = mod(floor(TIME * fps + v_c.r * 7.0), 4.0);
		float row = v_c.a > 0.5 ? 3.0 : floor(fract(v_c.r * 3.71) * 3.0);
		vec2 uv = UV;
		if (fract(v_c.r * 5.13) > 0.5) {
			uv.x = 1.0 - uv.x;
		}
		vec4 t = texture(flames, (vec2(frame, row) + uv) * 0.25);
		if (t.a < 0.5) {
			discard;
		}
		float lv = t.r;
		vec3 col = ink;
		col = mix(col, deep, step(0.2, lv));
		col = mix(col, body, step(0.5, lv));
		col = mix(col, core, step(0.84, lv));
		col = mix(col, smoke_col, step(0.5, t.g) * step(0.2, lv));
		ALBEDO = col;
	}
}
