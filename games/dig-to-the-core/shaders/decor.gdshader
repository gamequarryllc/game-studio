shader_type spatial;
// Pebbles, ore nuggets and each layer's bits scattered over the dug rock
// (MultiMesh). COLOR = the model's own painted vertex colour (linear: a
// gradient, baked shading and edge wear from art/blender/props.py) times each
// copy's tint, linear (the layer's stone, the ore's colour; the engine
// multiplies the instance colour in; DigField._multimesh). Lit by the
// headlamp exactly like
// the rock round it (headlamp.gdshaderinc), so nothing pops out pale. Nuggets
// and crystals catch a rim of light where they turn away from you, but only
// inside the beam, so ore glints out of the pool.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

#include "res://shaders/headlamp.gdshaderinc"

uniform float glint = 0.0;
uniform float glow = 0.0;
uniform vec3 glow_color = vec3(1.0, 0.8, 0.4);

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 c = COLOR.rgb;
	ALBEDO = c;
	ROUGHNESS = mix(0.88, 0.25, glint);
	METALLIC = glint * 0.35;
	SPECULAR = mix(0.2, 0.75, glint);
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vec3 hl = headlamp_terms(wpos, nw, INV_VIEW_MATRIX);
	float under = 1.0 - smoothstep(-1.2, -0.4, wpos.y);
	float facing = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float rim = pow(1.0 - facing, 2.5);
	float inbeam = clamp(hl.y * 2.0, 0.0, 1.0) * lamp_on;
	EMISSION = headlamp_light(ALBEDO, hl) * under
		+ c * glint * (0.1 + 2.2 * rim) * inbeam
		+ glow_color * glow * (0.55 + 0.45 * rim) * clamp(dot(c, vec3(0.5)), 0.0, 1.0);
}
