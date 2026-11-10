shader_type spatial;
// Rock chips and clods kicked up by the tool (ToolRig's particles). Lit like
// the rock they came from: the headlamp is worked out here
// (headlamp.gdshaderinc) and the player's spot skips them (they sit on the
// rock's render layer), so they never flare pale at the lens. COLOR = the
// rock's colour in sRGB (set per strike). They fade out right in front of the
// lens (screen-door, so they stay opaque and sort with the rock).
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

#include "res://shaders/headlamp.gdshaderinc"

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float fade = smoothstep(0.45, 1.3, length(VERTEX));
	float dither = fract(sin(dot(floor(FRAGCOORD.xy), vec2(12.9898, 78.233))) * 43758.5453);
	if (fade < dither) {
		discard;
	}
	vec3 s = COLOR.rgb;
	vec3 c = mix(pow((s + vec3(0.055)) / 1.055, vec3(2.4)), s / 12.92, step(s, vec3(0.04045)));
	// each face of a chip a step lighter or darker, like a fresh break
	vec3 fn = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	c *= 0.82 + 0.3 * abs(dot(fn, vec3(0.36, 0.8, 0.48)));
	ALBEDO = c;
	ROUGHNESS = 0.9;
	SPECULAR = 0.2;
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vec3 hl = headlamp_terms(wpos, nw, INV_VIEW_MATRIX);
	float under = 1.0 - smoothstep(-1.2, -0.4, wpos.y);
	EMISSION = headlamp_light(ALBEDO, hl) * under;
}
