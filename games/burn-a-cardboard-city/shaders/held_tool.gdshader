shader_type spatial;
render_mode unshaded, cull_back, fog_disabled, shadows_disabled, depth_prepass_alpha;
// The giant's hand and the tool in it (models/tools.glb), drawn close to the eye.
// Vertex colour alpha says what each part is: 0.1 the ink outline (an inverted hull,
// so only its edge shows), 0 glass (the magnifying glass's lens magnifies what's
// behind it; the bottle is tinted see-through), 0.25 brass/tin/plastic, above that
// skin, wood, wax, paper.

uniform float gold = 0.0;            // the Golden lens purchase gilds the tools
uniform vec3 lens_local = vec3(0.0, 0.25, -0.012);
uniform float magnify = 1.7;
uniform float bottle = 0.0;          // 1 while the glass is the rocket bottle (tinted, not magnifying)
uniform float light = 1.0;
uniform float DEBUG_NO_INK = 1.0;           // dims with the warehouse as it fills with smoke
uniform vec3 warm = vec3(0.0);       // fire light on the hand when it's near a fire
uniform sampler2D lens_tex : source_color, filter_linear;   // what a narrow camera sees through the lens
uniform float lens_radius = 0.099;

varying vec4 v_col;
varying vec3 v_obj;

void vertex() {
	v_col = COLOR;
	v_obj = VERTEX;
}

void fragment() {
	float flag = v_col.a;
	float ink = step(0.05, flag) * (1.0 - step(0.17, flag));
	float glass = 1.0 - step(0.05, flag);
	float shiny = step(0.17, flag) * (1.0 - step(0.4, flag));
	vec3 col = v_col.rgb;
	float lum = dot(col, vec3(0.3, 0.55, 0.15));
	col = mix(col, vec3(1.0, 0.78, 0.3) * (0.45 + lum * 1.2), gold * shiny);
	if (ink > 0.5) {
		col = vec3(0.075, 0.062, 0.058);
	}
	// Drawn-style light from the upper left of the screen: a soft key, a cool shadow
	// side, a little rim (the hand belongs to the viewer, so it's lit for the viewer).
	vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
	float ndl = dot(NORMAL, L);
	float key = smoothstep(-0.25, 0.55, ndl);
	float rim = pow(1.0 - abs(dot(NORMAL, VIEW)), 2.0);
	vec3 lit = mix(vec3(0.52, 0.56, 0.68), vec3(1.08, 1.0, 0.9), key) * light + warm;
	if (glass > 0.5 && bottle > 0.5) {
		// Bottle glass: green, see-through, bright on its edges.
		ALBEDO = v_col.rgb * 1.6 * lit + vec3(0.85, 1.0, 0.9) * (rim * 0.45 + pow(max(ndl, 0.0), 30.0) * 0.8);
		ALPHA = 0.42 + rim * 0.5;
	} else if (glass > 0.5) {
		vec2 q = (v_obj.xy - lens_local.xy) / lens_radius;
		q *= 1.0 - 0.12 * dot(q, q);   // a little barrel distortion toward the rim
		vec3 seen = texture(lens_tex, vec2(q.x, -q.y) * 0.5 + 0.5).rgb;
		vec3 tint = mix(vec3(0.98, 1.0, 1.02), v_col.rgb * 2.4, bottle);
		ALBEDO = seen * tint + vec3(0.9, 0.95, 1.0) * (rim * 0.3 + pow(max(ndl, 0.0), 24.0) * 0.6);
	} else {
		float spec = pow(max(dot(reflect(-L, NORMAL), VIEW), 0.0), 18.0) * shiny * 0.7;
		ALBEDO = col * lit + vec3(1.0, 0.95, 0.85) * spec + col * rim * 0.12 * (1.0 - ink);
		if (ink > 0.5) {
			ALBEDO = col;
		}
	}
	if (!(glass > 0.5 && bottle > 0.5)) {
		ALPHA = 1.0;
	}
}
