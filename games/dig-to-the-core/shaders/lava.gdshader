shader_type spatial;
// The melt under a lava lake's crust (and the molten iron and amber deeper
// down): it only shows in the gaps between the crust plates, which are real
// geometry (art/blender/props.py), so this is just the glow: slow streaks
// drifting across it (from the molten layers' painted flow lines, not noise),
// hottest along them, breathing a little. Unshaded: it is the light.
render_mode cull_back, unshaded;

uniform sampler2DArray layer_tex : filter_linear_mipmap, repeat_enable;
uniform vec3 hot = vec3(1.0, 0.78, 0.3);
uniform vec3 melt = vec3(0.9, 0.3, 0.06);
uniform float slice = 8.0;
uniform float heat = 1.0;

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 uv = wpos.xz * 0.45 + vec2(TIME * 0.02, TIME * 0.012);
	float f = texture(layer_tex, vec3(uv, slice)).r;
	float g = texture(layer_tex, vec3(wpos.xz * 0.21 - vec2(TIME * 0.01, -TIME * 0.016), slice)).b;
	float pulse = 0.9 + 0.1 * sin(TIME * 1.3 + wpos.x * 1.1 + wpos.z * 0.7);
	ALBEDO = mix(melt, hot, clamp((f - 0.35) * 1.4 + g * 0.6, 0.0, 1.0)) * pulse * heat;
}
