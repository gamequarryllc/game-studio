shader_type spatial;
render_mode diffuse_lambert_wrap, specular_schlick_ggx, cull_disabled;
// Things that don't burn down: the warehouse props, the helpers, the giant's tools.
// Same vertex-colour convention as cardboard.gdshader (alpha = material).

uniform vec3 tint : source_color = vec3(1.0);
uniform float tint_amount = 0.0;
uniform float gold = 0.0;           // the Golden lens purchase gilds the tools
uniform vec3 glow : source_color = vec3(0.0);
uniform float always_on_top = 0.0;

#include "res://shaders/firelight.gdshaderinc"

varying vec4 v_col;
varying vec3 v_obj;
varying vec3 v_world;

void vertex() {
	v_col = COLOR;
	v_obj = VERTEX;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash12(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

void fragment() {
	float flag = v_col.a;
	float card = step(0.6, flag);
	float tape = step(0.4, flag) * (1.0 - card);
	float shiny = step(0.1, flag) * (1.0 - step(0.4, flag));
	vec3 col = mix(v_col.rgb, v_col.rgb * tint, tint_amount);
	float fib = vnoise(v_obj.xz * 40.0 + v_obj.y * 23.0);
	col *= 1.0 + (fib - 0.5) * 0.08 * card;
	float lum = dot(col, vec3(0.3, 0.55, 0.15));
	col = mix(col, vec3(1.0, 0.78, 0.3) * (0.45 + lum * 1.2), gold * (shiny + card * 0.6));
	if (!FRONT_FACING) {
		col *= 0.45;
	}
	ALBEDO = col;
	ROUGHNESS = mix(0.86, 0.5, tape) * (1.0 - shiny * 0.65) * (1.0 - gold * 0.4);
	SPECULAR = 0.25 + shiny * 0.4 + gold * 0.3;
	METALLIC = shiny * 0.2 + gold * 0.5;
	vec3 wn = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	EMISSION = glow + col * fire_light(v_world, wn);
}
