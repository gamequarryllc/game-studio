shader_type spatial;
// Crystals: hard facets (flat face normals), a body colour that gets lighter
// toward the tips, a light from inside that's strongest low down where the
// crystal is thickest, and a bright rim where a face turns away from you, so
// a cluster glows in the dark and lights its own corner of the cave.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

uniform vec3 body = vec3(0.31, 0.64, 0.57);
uniform vec3 tip = vec3(0.86, 0.94, 0.86);
uniform float inner = 0.55;
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
	ALBEDO = c * 0.6;
	ROUGHNESS = 0.15;
	METALLIC = 0.1;
	SPECULAR = 0.85;
	float facing = clamp(dot(fn, VIEW), 0.0, 1.0);
	float rim = pow(1.0 - facing, 2.5);
	// Facets glow unevenly: each face's own brightness from its normal.
	float face = 0.75 + 0.25 * sin(dot(fn, vec3(12.9, 78.2, 37.7)));
	EMISSION = c * (inner * (1.0 - 0.45 * h) * face + rim * 1.1);
}
