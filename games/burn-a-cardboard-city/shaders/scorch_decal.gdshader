shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back, diffuse_lambert, specular_disabled;
// The scorch a burnt building leaves on the floor: hand-painted decals (models/scorch.png,
// painted by art/textures/make_scorch_decals.py: a char core in brush strokes, soot
// dragged outward in dry-brush streaks, a heat-browned ring). Flat quads lying just above
// the floor, lit like it, warmed by the fire light.
// INSTANCE_CUSTOM r = which of the eight decals (0..7).

uniform sampler2D atlas : source_color, filter_linear_mipmap, repeat_disable;

#include "res://shaders/firelight.gdshaderinc"

varying float v_variant;
varying vec3 v_world;

void vertex() {
	v_variant = floor(INSTANCE_CUSTOM.r + 0.5);
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 cell = vec2(mod(v_variant, 4.0), floor(v_variant / 4.0));
	vec4 t = texture(atlas, (UV + cell) / vec2(4.0, 2.0));
	ALBEDO = t.rgb;
	ALPHA = t.a;
	ROUGHNESS = 0.95;
	EMISSION = t.rgb * fire_light(v_world, vec3(0.0, 1.0, 0.0)) * 1.25;
}
