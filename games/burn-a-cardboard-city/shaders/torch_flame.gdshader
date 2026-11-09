shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
// The blowtorch's flame: a cone of blue gas roaring out of the nozzle (a CylinderMesh,
// nozzle at -y, tip at +y), its sides shuddering, bright where you look into it and
// thin at its edges, fading toward the tip. Two of them: a deep blue outer cone and a
// short pale inner one.

uniform float height = 0.26;
uniform vec3 color : source_color = vec3(0.2, 0.42, 1.0);
uniform vec3 tip_color : source_color = vec3(0.45, 0.25, 0.85);
uniform float strength = 1.0;

varying float v_t;

void vertex() {
	v_t = clamp(VERTEX.y / height + 0.5, 0.0, 1.0);
	float shudder = sin(TIME * 47.0 + v_t * 19.0) * 0.5 + sin(TIME * 31.0 - v_t * 13.0) * 0.5;
	VERTEX.xz *= 1.0 + 0.22 * shudder * v_t;
	VERTEX.y *= 0.93 + 0.07 * sin(TIME * 23.0);
}

void fragment() {
	float facing = pow(clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0), 1.5);
	float fade = pow(1.0 - v_t, 0.8);
	vec3 c = mix(color, tip_color, smoothstep(0.55, 1.0, v_t));
	ALBEDO = c * (0.25 + 1.4 * facing) * fade * strength;
}
