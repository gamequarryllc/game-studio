shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
// A shaft of daylight from a skylight down to the floor, with dust turning in it.
// A quad that turns about its own long axis to face the camera; UV.x runs across
// the beam (soft edges), UV.y along it (fades out near the roof and the floor).

uniform vec3 color : source_color = vec3(1.0, 0.93, 0.78);
uniform float strength = 0.16;

varying vec3 v_world;

void vertex() {
	vec3 o = MODEL_MATRIX[3].xyz;
	vec3 axis = normalize(MODEL_MATRIX[1].xyz);
	float len = length(MODEL_MATRIX[1].xyz);
	float wid = length(MODEL_MATRIX[0].xyz);
	vec3 to_cam = INV_VIEW_MATRIX[3].xyz - o;
	vec3 side = normalize(cross(axis, to_cam));
	vec3 p = o + axis * VERTEX.y * len + side * VERTEX.x * wid;
	v_world = p;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(p, 1.0);
}

float hash12(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	float across = 1.0 - pow(abs(UV.x - 0.5) * 2.0, 2.0);
	float along = smoothstep(0.0, 0.25, UV.y) * (1.0 - smoothstep(0.75, 1.0, UV.y));
	vec2 g = floor(v_world.xz * 9.0 + vec2(0.0, v_world.y * 9.0) + vec2(TIME * 0.6, TIME * -0.4));
	float mote = step(0.985, hash12(g)) * 0.8;
	ALBEDO = color * (across * along * strength + mote * across * along * 0.15);
}
