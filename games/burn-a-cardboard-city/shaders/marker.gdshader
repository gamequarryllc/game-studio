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
	float c = smoothstep(-0.02, 0.1, burn_field(v_obj, v_char, v_vary));
	// Each building's windows were coloured in with a different pair of felt tips (the
	// blue and the yellow fills are swapped for this building's pair), and on some
	// storeys the lights are off.
	vec3 rgb = ink.rgb;
	float blue = smoothstep(0.08, 0.2, rgb.b - rgb.r) * step(rgb.b, 0.95);
	float yellow = smoothstep(0.15, 0.3, rgb.r - rgb.b) * step(0.45, rgb.g) * step(rgb.b, 0.5);
	float set = floor(fract(v_vary * 5.37 + 0.41) * 5.0);
	vec3 pen_a = set < 0.5 ? vec3(0.24, 0.42, 0.72) : (set < 1.5 ? vec3(0.25, 0.55, 0.32) : (set < 2.5 ? vec3(0.78, 0.28, 0.22)
		: (set < 3.5 ? vec3(0.2, 0.55, 0.55) : vec3(0.45, 0.32, 0.6))));
	vec3 pen_b = set < 0.5 ? vec3(0.95, 0.77, 0.25) : (set < 1.5 ? vec3(0.96, 0.58, 0.2) : (set < 2.5 ? vec3(0.96, 0.9, 0.7)
		: (set < 3.5 ? vec3(0.93, 0.55, 0.64) : vec3(0.95, 0.82, 0.4))));
	float lb = dot(rgb, vec3(0.33));
	rgb = mix(rgb, pen_a * (0.7 + 0.6 * lb), blue * step(0.5, set));
	rgb = mix(rgb, pen_b * (0.75 + 0.35 * lb), yellow * step(0.5, set));
	float storey = floor(v_obj.y * 2.2 + v_vary * 3.0);
	float dark = step(0.72, fract(sin(storey * 12.9898 + v_vary * 78.233) * 43758.5453));
	rgb = mix(rgb, vec3(0.16, 0.15, 0.17), max(blue, yellow) * dark * 0.85);
	// Felt-tip ink soaks into the board: slightly darker where the board is shaded.
	ALBEDO = rgb * mix(1.0, v_col.r, 0.5) * (1.0 - c * 0.8);
	ALPHA = ink.a * (1.0 - smoothstep(0.6, 1.0, c)) * 0.94;
	ROUGHNESS = 0.8;
}
