shader_type spatial;
render_mode diffuse_lambert, specular_disabled;
// The forest floor. `cells` holds one pixel per forest cell: rgb = the ground
// colour there (cursed moss, dirt trail, fresh ash, meadow...), a = how hot
// the ash still is (it glows with embers for a while after the fire).

uniform sampler2D cells : filter_linear, repeat_disable;
uniform vec2 forest_origin = vec2(-60.0, -60.0);
uniform float forest_size = 120.0;
uniform vec3 hill_color : source_color = vec3(0.17, 0.11, 0.2);
uniform vec3 hill_top : source_color = vec3(0.26, 0.16, 0.28);

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void fragment() {
	vec2 uv = (v_world.xz - forest_origin) / forest_size;
	vec4 c = texture(cells, clamp(uv, vec2(0.001), vec2(0.999)));
	float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
	vec3 hills = mix(hill_color, hill_top, clamp(v_world.y / 18.0, 0.0, 1.0));
	vec3 col = mix(hills, c.rgb, inside);
	float n = vnoise(v_world.xz * 0.55) * 0.55 + vnoise(v_world.xz * 2.1) * 0.3 + vnoise(v_world.xz * 6.0) * 0.15;
	col *= 0.78 + 0.44 * n;
	ALBEDO = col;
	ROUGHNESS = 1.0;
	float g = c.a * inside;
	float speck = smoothstep(0.55, 0.8, vnoise(v_world.xz * 3.0 + vec2(TIME * 0.2, 0.0)));
	float flick = 0.65 + 0.35 * sin(TIME * 6.0 + n * 20.0);
	EMISSION = vec3(1.0, 0.3, 0.05) * g * (0.25 + speck * 1.6) * flick;
}
