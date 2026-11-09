shader_type spatial;
// The walls of the lift shaft seen from the moving cage. The tube travels
// with the cage but everything here is in world space, so the rock streams
// past: each layer's own colour (zone_tex, one texel per layer, 24 m each),
// the painted stone texture and the strata bands, as on the dig site, with a
// glow in the layers that glow by themselves.
render_mode cull_back, diffuse_lambert;

uniform sampler2D paint_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D strata_tex : filter_linear, repeat_enable;
uniform sampler2D zone_tex : filter_nearest, repeat_disable;
uniform sampler2D glow_tex : filter_nearest, repeat_disable;
uniform float zones = 10.0;
uniform float zone_depth = 24.0;

varying vec3 wpos;
varying vec3 wnrm;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 w = pow(abs(wnrm), vec3(4.0));
	w /= (w.x + w.y + w.z);
	vec4 a = texture(paint_tex, wpos.zy * 0.43) * w.x + texture(paint_tex, wpos.xz * 0.43) * w.y + texture(paint_tex, wpos.xy * 0.43) * w.z;
	float p = a.r;
	float crack = a.b;
	float depth = clamp(-wpos.y / (zones * zone_depth), 0.0, 0.999);
	vec3 base = texture(zone_tex, vec2(depth, 0.5)).rgb;
	float glow = texture(glow_tex, vec2(depth, 0.5)).r;
	if (wpos.y > -0.6) {
		base = vec3(0.42, 0.3, 0.18);
	}
	float sy = wpos.y + 0.35 * sin(wpos.x * 0.37 + wpos.z * 0.21) + 0.22 * sin(wpos.z * 0.53 - wpos.x * 0.11);
	vec3 st = texture(strata_tex, vec2(sy / 64.0, 0.5)).rgb;
	float strata = mix(1.0, st.r * 1.25, 1.35);
	vec3 warmth = mix(vec3(0.9, 0.95, 1.07), vec3(1.08, 1.0, 0.88), st.g);
	vec3 rock = base * (0.7 + 0.9 * (p - 0.69)) * strata * warmth * (1.0 - 0.45 * crack);
	ALBEDO = rock;
	ROUGHNESS = 0.95;
	SPECULAR = 0.2;
	EMISSION = base * glow * (0.35 + 0.55 * p + 0.9 * crack);
}
