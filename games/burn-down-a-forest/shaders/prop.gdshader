shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_disabled;
// Single models: the village, its props, the fire-keeper, the tools, the
// helpers and the critters. Colour from the baked vertex colours (linear).
// Vertex alpha: 0.5 = a glowing part (lit windows, the lantern, a sprite's
// body), 0.3 = a faint ember glow (the keeper's scarf stripes), 0 = plain.
// An inked silhouette edge like the forest; for the keeper a rim light (cool
// moonlight) so the hero reads against the woods; warm light from fires nearby
// and from the keeper's lantern; village props are cut away in the same round
// window as the trees when they come between the camera and the keeper.

uniform vec3 ink : source_color = vec3(0.18, 0.118, 0.078);
uniform float ink_edge = 0.5;
uniform float glow_strength = 1.2;
uniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec3 rim_color : source_color = vec3(0.62, 0.72, 0.95);
uniform float rim = 0.0;
uniform vec3 emit_tint : source_color = vec3(1.0, 1.0, 1.0);
uniform float emit_all = 0.0;
uniform sampler2D fire_light : filter_linear_mipmap, repeat_disable;
uniform vec2 forest_origin = vec2(-60.0, -60.0);
uniform float forest_size = 120.0;
uniform vec3 fire_tint : source_color = vec3(1.0, 0.55, 0.25);
uniform float fire_gain = 2.2;
uniform vec3 lantern_pos = vec3(0.0, -100.0, 0.0);
uniform vec3 lantern_tint : source_color = vec3(1.0, 0.66, 0.34);
uniform float lantern_gain = 0.0;
uniform float see_through = 0.0;
uniform vec3 focus_pos = vec3(0.0);
uniform float hole_radius = 2.3;

varying vec3 v_world;
varying vec4 v_clip;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_clip = PROJECTION_MATRIX * VIEW_MATRIX * vec4(v_world, 1.0);
}

void fragment() {
	float g = step(0.2, COLOR.a) * (1.0 - step(0.75, COLOR.a));
	float glow = g * mix(0.3, 1.0, step(0.42, COLOR.a));
	vec3 col = COLOR.rgb * tint.rgb;
	float fr = 1.0 - abs(dot(normalize(NORMAL), normalize(VIEW)));
	col = mix(col, ink, smoothstep(0.66, 0.98, fr) * ink_edge * (1.0 - g));
	if (see_through > 0.5) {
		vec4 kc = PROJECTION_MATRIX * VIEW_MATRIX * vec4(focus_pos, 1.0);
		float keep = 1.0;
		if (kc.w > 0.1 && v_clip.w < kc.w - 0.8) {
			float aspect = VIEWPORT_SIZE.x / max(VIEWPORT_SIZE.y, 1.0);
			vec2 a = v_clip.xy / v_clip.w;
			vec2 b = kc.xy / kc.w;
			float dd = length(vec2((a.x - b.x) * aspect, a.y - b.y));
			float r = hole_radius * PROJECTION_MATRIX[1][1] / kc.w;
			keep = smoothstep(r * 0.94, r * 1.06, dd);
		}
		keep = min(keep, smoothstep(1.5, 3.5, length(v_world - (INV_VIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz)));
		if (keep < 0.5) {
			discard;
		}
		col = mix(col, ink, 1.0 - smoothstep(0.5, 0.68, keep));
	}
	ALBEDO = col;
	ROUGHNESS = 1.0;
	vec3 em = COLOR.rgb * glow * glow_strength * emit_tint;
	em += col * emit_all;
	em += rim_color * pow(fr, 2.6) * rim;
	vec2 fuv = (v_world.xz - forest_origin) / forest_size;
	float fl = textureLod(fire_light, fuv, 1.0).r * 0.55 + textureLod(fire_light, fuv, 2.5).r * 1.6;
	fl = 1.0 - exp(-fl * 1.6);
	float ld = distance(v_world, lantern_pos);
	float ll = pow(clamp(1.0 - ld / 6.0, 0.0, 1.0), 2.0) * lantern_gain;
	em += col * (fire_tint * fl * fire_gain + lantern_tint * ll);
	EMISSION = em;
}
