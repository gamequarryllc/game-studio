shader_type spatial;
// The walls of the lift shaft seen from the moving cage. The tube travels
// with the cage but everything here is in world space, so the rock streams
// past: each layer's own colour (zone_tex, one texel per layer, 24 m each),
// the painted stone texture and the strata bands, as on the dig site.
render_mode cull_back, diffuse_lambert;

uniform sampler2D paint_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D strata_tex : filter_linear, repeat_enable;
uniform sampler2D zone_tex : filter_nearest, repeat_disable;
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
	float p = texture(paint_tex, wpos.zy * 0.41).r * w.x + texture(paint_tex, wpos.xz * 0.41).r * w.y + texture(paint_tex, wpos.xy * 0.41).r * w.z;
	float crack = texture(paint_tex, wpos.zy * 0.41).b * w.x + texture(paint_tex, wpos.xy * 0.41).b * w.z;
	float depth = clamp(-wpos.y / (zones * zone_depth), 0.0, 0.999);
	vec3 base = texture(zone_tex, vec2(depth, 0.5)).rgb;
	if (wpos.y > -0.6) {
		base = vec3(0.42, 0.3, 0.18);
	}
	float strata = texture(strata_tex, vec2((wpos.y + 0.3 * sin(wpos.x * 0.4)) / 64.0, 0.5)).r * 1.25;
	ALBEDO = base * (0.5 + 0.62 * p) * mix(1.0, strata, 0.9) * (1.0 - 0.35 * crack);
	ROUGHNESS = 0.95;
	SPECULAR = 0.2;
}
