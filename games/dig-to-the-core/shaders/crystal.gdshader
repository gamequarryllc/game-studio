shader_type spatial;
// Crystals: hard facets (flat face normals), a cool body colour that gets
// lighter toward the tips, a glowing rim where a face turns away from you,
// and a soft light from inside, so a cluster reads in the dark.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

uniform vec3 body = vec3(0.31, 0.64, 0.57);
uniform vec3 tip = vec3(0.86, 0.94, 0.86);
uniform float inner = 0.35;
uniform float height = 1.4;

varying vec3 lpos;

void vertex() {
	lpos = VERTEX;
}

void fragment() {
	vec3 fn = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	if (dot(fn, VERTEX) > 0.0) {
		fn = -fn;
	}
	NORMAL = fn;
	float h = clamp(lpos.y / height, 0.0, 1.0);
	vec3 c = mix(body, tip, h * h);
	ALBEDO = c * 0.7;
	ROUGHNESS = 0.18;
	METALLIC = 0.1;
	SPECULAR = 0.8;
	float facing = clamp(dot(fn, VIEW), 0.0, 1.0);
	float rim = pow(1.0 - facing, 3.0);
	EMISSION = c * (inner * (0.4 + 0.6 * h) + rim * 0.9);
}
