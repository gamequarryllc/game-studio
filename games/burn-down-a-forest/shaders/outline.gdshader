shader_type spatial;
render_mode unshaded, cull_front, shadows_disabled, fog_disabled;
// A second pass on the fire-keeper: the mesh pushed out along its normals by a
// constant width on screen and drawn back faces only, in ink. A hard linocut
// outline that keeps the hero readable against any woods, near or far.

uniform vec3 ink : source_color = vec3(0.105, 0.07, 0.055);
uniform float width_px = 2.2;

void vertex() {
	vec4 clip = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vec3 nv = normalize(mat3(MODELVIEW_MATRIX) * NORMAL);
	vec2 n2 = (PROJECTION_MATRIX * vec4(nv, 0.0)).xy;
	float l = length(n2);
	if (l > 0.0001) {
		clip.xy += n2 / l * width_px * 2.0 / VIEWPORT_SIZE * clip.w;
	}
	POSITION = clip;
}

void fragment() {
	ALBEDO = ink;
}
