shader_type spatial;
// The walls of the lift shaft seen from the moving cage. The tube travels
// with the cage but everything here is in world space, so the rock streams
// past: each layer's own hand-painted wall (textures/rock_walls.png, as on the
// dig site, 24 m a layer), smeared along the shaft by the cage's speed (four
// taps spread over how far the wall moves in a frame or so), so even a still
// shows you're moving; a glow in the cracks of the layers that glow.
render_mode cull_back, diffuse_lambert;

uniform sampler2DArray wall_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform float zones = 10.0;
uniform float zone_depth = 24.0;
uniform float ride_speed = 0.0;          // metres a second, World._update_ride
uniform vec4 glow_color[10];             // rgb the layer's glow, a how hot (0 = none)

varying vec3 wpos;
varying vec3 wnrm;

vec4 wall(vec3 p, vec3 w, float layer, float smear) {
	vec4 acc = vec4(0.0);
	for (int i = 0; i < 4; i++) {
		float o = (float(i) - 1.5) * smear;
		vec3 q = p + vec3(0.0, o, 0.0);
		acc += texture(wall_tex, vec3(vec2(q.z, -q.y) * 0.45, layer)) * w.x
			+ texture(wall_tex, vec3(vec2(q.x, -q.y) * 0.45, layer)) * w.z;
	}
	return acc * 0.25;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 w = pow(abs(wnrm), vec3(6.0));
	w /= (w.x + w.y + w.z + 0.0001);
	float yb = wpos.y + 0.7 * sin(wpos.x * 0.61 + wpos.z * 0.37);
	int li = clamp(int(floor(-yb / zone_depth)), 0, int(zones) - 1);
	float smear = clamp(ride_speed * 0.018, 0.0, 0.45);
	vec4 t = wall(wpos, w, float(li), smear);
	vec3 rock = t.rgb;
	if (wpos.y > -0.6) {
		rock = vec3(0.3, 0.2, 0.12);
	}
	ALBEDO = rock;
	ROUGHNESS = 0.95;
	SPECULAR = 0.2;
	vec4 g = glow_color[li];
	EMISSION = g.rgb * g.a * t.a * 1.4;
}
