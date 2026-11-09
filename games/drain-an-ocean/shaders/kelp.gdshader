shader_type spatial;
render_mode cull_disabled, diffuse_burley;
// Kelp stands (MultiMesh). Under water the blades stand up and sway; as the
// water drops past them they slump, and on dry sand they lie flat in the
// direction the water went. Each instance reads the water over its own base
// from the same body lookup as the seabed.

uniform sampler2D body_tex : filter_nearest;
uniform float levels[32];
uniform float grid_w = 129.0;
uniform vec2 grid_origin = vec2(-64.0, -64.0);
uniform float cell = 1.0;
uniform float game_time = 0.0;
uniform float blade_height = 3.2;

vec3 to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void vertex() {
	vec3 origin = MODEL_MATRIX[3].xyz;
	ivec2 c = ivec2(round((origin.xz - grid_origin) / cell));
	c = clamp(c, ivec2(0), ivec2(int(grid_w) - 1));
	int slot = int(round(texelFetch(body_tex, c, 0).r * 255.0));
	float water = slot < 32 ? levels[slot] : -1000.0;
	float scale_y = length(MODEL_MATRIX[1].xyz);
	float tall = blade_height * scale_y;
	float depth = water - origin.y;
	float slump = 1.0 - clamp(depth / tall, 0.0, 1.0);
	float u = clamp(VERTEX.y / blade_height, 0.0, 1.0);
	float phase = fract(sin(dot(origin.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.28;
	// sway while it's under water
	float sway = sin(game_time * 0.9 + phase + u * 2.0) * 0.32 * u * u * (1.0 - slump);
	VERTEX.x += sway;
	VERTEX.z += cos(game_time * 0.7 + phase) * 0.12 * u * u * (1.0 - slump);
	// slump: bend over around the base, more towards the tip
	float ang = slump * 1.42 * (0.35 + 0.65 * u);
	VERTEX.xz *= mix(1.0, 0.45, slump);
	float yy = VERTEX.y * mix(1.0, 0.55, slump);
	float zz = VERTEX.z;
	VERTEX.y = yy * cos(ang) - zz * sin(ang) + 0.04 * slump;
	VERTEX.z = yy * sin(ang) + zz * cos(ang);
	// Out of the water kelp dries to an olive brown.
	COLOR.rgb = mix(COLOR.rgb, vec3(0.6, 0.55, 0.36), slump * 0.8);
}

void fragment() {
	ALBEDO = to_linear(COLOR.rgb);
	ROUGHNESS = 0.6;
	SPECULAR = 0.35;
	BACKLIGHT = vec3(0.25, 0.3, 0.12);
}
