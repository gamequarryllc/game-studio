shader_type spatial;
render_mode world_vertex_coords, diffuse_lambert_wrap, specular_schlick_ggx, cull_disabled;
// Every cardboard building, car, tree and castle piece (the "card" surface of the
// Blender models). Vertex colour: rgb = paint x baked AO, alpha = what it's made of
// (1 corrugated card, 0.75 paper, 0.5 masking tape, 0.25 shiny caps and tin, 0 holes).
// The burn and the fall are in collapse.gdshaderinc.

#include "res://shaders/collapse.gdshaderinc"

uniform vec3 char_color : source_color = vec3(0.09, 0.065, 0.05);
uniform vec3 scorch_color : source_color = vec3(0.36, 0.2, 0.09);
uniform vec3 ember_color : source_color = vec3(1.0, 0.36, 0.06);
uniform float tint_amount = 0.12;

varying vec4 v_col;
varying float v_flag;
varying vec3 v_world;

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
	v_flag = COLOR.a;
	v_world = v;
}

void fragment() {
	vec3 col = v_col.rgb;
	float card = step(0.9, v_flag);
	float paper = step(0.6, v_flag) * (1.0 - card);
	float tape = step(0.4, v_flag) * (1.0 - step(0.6, v_flag));
	float shiny = step(0.1, v_flag) * (1.0 - step(0.4, v_flag));
	// Every box came from somewhere different: a little warmer, paler or darker.
	float tone = v_vary - 0.5;
	col *= 1.0 + tone * tint_amount * 2.0 * (card + paper);
	col = mix(col, col * vec3(1.04, 0.98, 0.9), clamp(tone * 2.0, 0.0, 1.0) * card * 0.5);
	// Fibre and blotches in the board, flat at a distance.
	float fib = vnoise3(v_obj * 23.0 + v_vary * 5.0) * 0.6 + vnoise3(v_obj * 61.0) * 0.4;
	col *= 1.0 + (fib - 0.5) * 0.09 * (card + paper);
	// Tape is a little see-through: the board darkens it.
	col = mix(col, col * 0.93, tape * vnoise3(v_obj * 40.0));
	// Burning: scorch, then char, with glowing edges while it's alight.
	float c = char_mask(v_obj, v_char, v_vary) * (1.0 - shiny * 0.6);
	float edge = char_mask(v_obj, v_char + 0.12, v_vary) - c;
	col = mix(col, scorch_color, clamp(edge * 1.5, 0.0, 1.0) * (1.0 - shiny));
	col = mix(col, char_color * (0.8 + fib * 0.4), c);
	float flick = 0.55 + 0.45 * sin(TIME * 9.0 + v_obj.y * 7.0 + fib * 12.0);
	vec3 em = ember_color * edge * 2.6 * v_burning * flick;
	em += ember_color * c * v_burning * smoothstep(0.55, 0.9, vnoise3(v_obj * 7.0 + vec3(0.0, -TIME * 0.7, 0.0))) * 1.4;
	if (!FRONT_FACING) {
		// The inside of a box: dark, and glowing when it burns.
		col = vec3(0.2, 0.14, 0.09) * (1.0 - c * 0.5);
		em += ember_color * v_burning * 0.6 * flick;
	}
	ALBEDO = col;
	ROUGHNESS = mix(0.88, 0.5, tape) * (1.0 - shiny * 0.62);
	SPECULAR = 0.25 + shiny * 0.35 + tape * 0.15;
	METALLIC = shiny * 0.15;
	EMISSION = em;
}
