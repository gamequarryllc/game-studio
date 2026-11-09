shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_opaque, fog_disabled;
// Fire, cut from paper (models/flames.png: six flame shapes, torn edges, a darker
// red base). Camera-facing quads that stay upright and lean with the fans' wind,
// flickering at a stop-motion 8 frames a second (a flame flips and stretches a little
// on every frame). Flames within ~3 m of the eye fade out (dithered), so a fire you
// walk into never fills the screen.
// INSTANCE_CUSTOM r = seed, g = strength 0..1, b = style (0 fire, 1 golden, 2 party,
// 3 blue gas), a = lead (1 for each building's one tall flame: it leans harder).
// A single MeshInstance gets its values from the `single` uniform instead.

uniform sampler2D flames : source_color, filter_linear_mipmap, repeat_disable;
uniform vec2 wind = vec2(0.6, -0.4);
uniform float brightness = 1.25;
uniform float near_fade = 1.0;     // 0 for a flame held right in front of the eye
uniform vec4 single = vec4(0.0);

varying vec4 v_c;
varying float v_near;
varying float v_flip;
varying float v_variant;

float hash(float n) {
	return fract(sin(n * 91.345) * 43758.5453);
}

void vertex() {
	v_c = INSTANCE_CUSTOM + single;
	vec3 o = MODEL_MATRIX[3].xyz;
	float sx = length(MODEL_MATRIX[0].xyz);
	float sy = length(MODEL_MATRIX[1].xyz);
	float frame = floor(TIME * 8.0 + v_c.r * 13.0);
	float jit = hash(frame + v_c.r * 71.0);
	v_flip = step(0.5, jit);
	v_variant = floor(v_c.r * 5.999);
	sy *= 0.92 + 0.16 * hash(frame * 1.7 + v_c.r * 23.0);
	vec3 right = normalize(vec3(INV_VIEW_MATRIX[0].x, 0.0, INV_VIEW_MATRIX[0].z));
	float h = VERTEX.y + 0.5;
	vec3 p = o + right * VERTEX.x * sx + vec3(0.0, h * sy, 0.0);
	float lean = 0.32 + 0.45 * v_c.a;
	p.xz += (wind * lean + vec2(sin(frame * 2.1 + v_c.r * 30.0), cos(frame * 1.3 + v_c.r * 17.0)) * 0.05) * h * h * sy;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
	v_near = distance(o + vec3(0.0, sy * 0.4, 0.0), INV_VIEW_MATRIX[3].xyz);
}

void fragment() {
	vec2 uv = UV;
	if (v_flip > 0.5) {
		uv.x = 1.0 - uv.x;
	}
	vec4 t = texture(flames, vec2((v_variant + uv.x) / 6.0, uv.y));
	vec3 col = t.rgb;
	if (v_c.b > 2.5) {
		float l = dot(col, vec3(0.3, 0.55, 0.15));
		col = mix(vec3(0.12, 0.25, 0.85), vec3(0.85, 0.95, 1.0), smoothstep(0.35, 0.9, l));
	} else if (v_c.b > 1.5) {
		float hue = fract(v_c.r * 3.0 + floor(TIME * 8.0) * 0.07);
		vec3 felt = 0.5 + 0.5 * cos(6.2832 * (hue + vec3(0.0, 0.33, 0.67)));
		float l = dot(col, vec3(0.3, 0.55, 0.15));
		col = mix(felt * 0.8, vec3(1.0, 0.97, 0.88), smoothstep(0.6, 0.95, l));
	} else if (v_c.b > 0.5) {
		float l = dot(col, vec3(0.3, 0.55, 0.15));
		col = mix(vec3(0.62, 0.36, 0.06), vec3(1.0, 0.95, 0.7), smoothstep(0.25, 0.9, l));
	}
	ALBEDO = col * brightness * (0.82 + 0.25 * v_c.g);
	// Close to the eye: fade out through a dither (alpha-scissored, so no sorting).
	float fade = mix(1.0, smoothstep(1.4, 3.0, v_near), near_fade);
	float d = fract(dot(FRAGCOORD.xy, vec2(0.7548776, 0.5698403)) + 0.5 * fract(FRAGCOORD.y * 0.618));
	ALPHA = t.a * step(d, fade);
	ALPHA_SCISSOR_THRESHOLD = 0.5;
}
