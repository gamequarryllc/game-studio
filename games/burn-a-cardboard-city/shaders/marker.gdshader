shader_type spatial;
render_mode world_vertex_coords, blend_mix, depth_draw_never, cull_back, diffuse_lambert_wrap, specular_disabled;
// The marker-pen drawings on the city (windows, doors, box labels): the "decal"
// surface of the Blender models, sampling models/marker_sheet.png. They fall with
// their building and burn away with it.

#include "res://shaders/collapse.gdshaderinc"

uniform sampler2D sheet : source_color, filter_linear_mipmap, repeat_disable;

varying vec4 v_col;

void vertex() {
	vec3 base = MODEL_MATRIX[3].xyz;
	vec3 v = VERTEX;
	vec3 nrm = NORMAL;
	vec3 obj;
	float burning;
	float fallen;
	structure_vertex(v, nrm, base, INSTANCE_CUSTOM, obj, burning, fallen);
	v_obj = obj;
	v_burning = burning;
	v_fallen = fallen;
	v_char = INSTANCE_CUSTOM.r;
	v_vary = INSTANCE_CUSTOM.g;
	VERTEX = v;
	NORMAL = nrm;
	v_col = COLOR;
}

void fragment() {
	vec4 ink = texture(sheet, UV);
	float c = char_mask(v_obj, v_char, v_vary);
	// Felt-tip ink soaks into the board: slightly darker where the board is shaded.
	ALBEDO = ink.rgb * mix(1.0, v_col.r, 0.5) * (1.0 - c * 0.8);
	ALPHA = ink.a * (1.0 - smoothstep(0.6, 1.0, c)) * 0.94;
	ROUGHNESS = 0.8;
}
