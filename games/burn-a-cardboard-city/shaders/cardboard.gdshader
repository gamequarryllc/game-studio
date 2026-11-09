shader_type spatial;
render_mode world_vertex_coords, diffuse_lambert_wrap, specular_schlick_ggx, cull_disabled;
// Every cardboard building, car, tree and castle piece (the "card" surface of the
// Blender models). Vertex colour: rgb = paint x baked AO, alpha = what it's made of
// (1 corrugated card, 0.75 paper, 0.5 masking tape, 0.25 shiny caps and tin, 0 holes).
// Burning creeps over the board as a dark-brown scorch with a thin glowing edge and
// leaves char (#2a2420, never black). The fall is in collapse.gdshaderinc.

#include "res://shaders/collapse.gdshaderinc"
#include "res://shaders/firelight.gdshaderinc"

uniform vec3 char_color : source_color = vec3(0.165, 0.141, 0.125);    // #2a2420
uniform vec3 scorch_color : source_color = vec3(0.36, 0.23, 0.13);
uniform vec3 toast_color : source_color = vec3(0.55, 0.38, 0.22);
uniform vec3 ember_color : source_color = vec3(1.0, 0.42, 0.1);
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
	// Box stock: plain kraft board, keeping its shading, is swapped per building for
	// white-lined board, dark brown, sun-faded or grey recycled board.
	vec3 nc = normalize(v_col.rgb + vec3(1e-4));
	float kraftness = card * (1.0 - smoothstep(0.07, 0.16, length(nc - vec3(0.85, 0.49, 0.2))));
	float stock = floor(fract(v_vary * 7.31 + 0.13) * 5.0);
	vec3 target = stock < 0.5 ? vec3(0.0) : (stock < 1.5 ? vec3(0.74, 0.7, 0.62) : (stock < 2.5 ? vec3(0.27, 0.15, 0.07)
		: (stock < 3.5 ? vec3(0.6, 0.47, 0.31) : vec3(0.4, 0.36, 0.31))));
	float lum = dot(col, vec3(0.3, 0.59, 0.11)) / 0.378;
	col = mix(col, target * lum, kraftness * step(0.5, stock));
	// White copy-paper boxes come in a few whites too: cream, cool grey, bright.
	float whiteness = paper * smoothstep(0.55, 0.7, min(v_col.r, min(v_col.g, v_col.b)) / max(0.001, max(v_col.r, v_col.g)) * step(0.35, v_col.g));
	float pw = fract(v_vary * 3.17);
	col *= mix(vec3(1.0), pw < 0.33 ? vec3(1.02, 0.97, 0.86) : (pw < 0.66 ? vec3(0.9, 0.93, 0.97) : vec3(1.04, 1.03, 1.0)), whiteness);
	// Fibre and blotches in the board, flat at a distance.
	float fib = vnoise3(v_obj * 23.0 + v_vary * 5.0) * 0.6 + vnoise3(v_obj * 61.0) * 0.4;
	col *= 1.0 + (fib - 0.5) * 0.09 * (card + paper);
	col = mix(col, col * 0.93, tape * vnoise3(v_obj * 40.0));
	// The burn: browned ahead of the edge, a thin glowing edge, scorched, then char.
	float f = burn_field(v_obj, v_char, v_vary) * (1.0 - shiny * 0.5);
	float toast = smoothstep(-0.12, 0.0, f) * step(0.001, v_char);
	float scorch = smoothstep(0.0, 0.05, f);
	float charred = smoothstep(0.06, 0.2, f);
	float edge = (1.0 - smoothstep(0.0, 0.022, abs(f - 0.008))) * step(0.001, v_char);
	col = mix(col, col * toast_color * 1.6, toast * 0.45 * (1.0 - shiny));
	col = mix(col, scorch_color * (0.85 + fib * 0.3), scorch * (1.0 - shiny * 0.7));
	col = mix(col, char_color * (0.85 + fib * 0.3), charred);
	float flick = 0.7 + 0.3 * sin(TIME * 7.0 + v_obj.y * 5.0 + fib * 9.0);
	vec3 em = ember_color * edge * 1.7 * flick * max(v_burning, 0.15);
	if (!FRONT_FACING) {
		// The inside of a box: dark, warm where it's burning.
		col = vec3(0.2, 0.14, 0.09) * (1.0 - charred * 0.4);
		em += ember_color * v_burning * 0.25 * flick;
	}
	ALBEDO = col;
	// Char is matte (a glossy char mirrored the low sun at grazing angles and the burnt
	// scraps on the floor read as white blotches); it's never a flat black either.
	ROUGHNESS = mix(mix(0.88, 0.5, tape) * (1.0 - shiny * 0.62), 0.94, charred);
	SPECULAR = mix(0.25 + shiny * 0.35 + tape * 0.15, 0.05, charred);
	METALLIC = shiny * 0.15;
	vec3 wn = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	EMISSION = em + col * fire_light(v_world, wn);
}
