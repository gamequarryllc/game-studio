shader_type spatial;
// Pebbles, ore nuggets and each layer's bits scattered over the dug rock
// (MultiMesh). COLOR = the model's baked AO (darkest where it sinks into the
// rock) times each copy's own colour (a shade off the rock for a pebble, the
// ore's for a nugget). Lit like the rock round it: the same cool bounce near
// you and the same hold-down right at the lens, so nothing pops out pale.
// Nuggets catch a rim of light where they face away from you, brightest near
// the headlamp, so ore glints out of the dark before you're on top of it.
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float glint = 0.0;
uniform float glow = 0.0;
uniform vec3 glow_color = vec3(1.0, 0.8, 0.4);
uniform float lamp_range = 11.0;
uniform vec3 lamp_pos = vec3(0.0);
uniform vec3 bounce_color = vec3(0.3, 0.38, 0.5);
uniform float bounce = 0.0;

varying vec3 wpos;
varying vec3 wnrm;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	// Held down right at the lens underground (the lamp is strong); never up on the field.
	ALBEDO = COLOR.rgb * mix(mix(0.5, 1.0, smoothstep(0.3, 1.9, length(VERTEX))), 1.0, smoothstep(-1.2, -0.4, wpos.y));
	ROUGHNESS = mix(0.9, 0.25, glint);
	METALLIC = glint * 0.35;
	SPECULAR = mix(0.2, 0.75, glint);
	float facing = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float rim = pow(1.0 - facing, 2.5);
	float lamp = clamp(1.0 - length(VERTEX) / (lamp_range * 0.85), 0.0, 1.0);
	float dl = distance(wpos, lamp_pos);
	float bf = clamp(1.0 - dl / (lamp_range * 0.62), 0.0, 1.0);
	bf *= bf;
	float face = 0.45 + 0.55 * clamp(dot(wnrm, normalize(lamp_pos - wpos)), 0.0, 1.0);
	EMISSION = ALBEDO * bounce_color * bounce * bf * face
		+ COLOR.rgb * glint * (0.12 + 1.6 * rim) * lamp
		+ glow_color * glow * (0.55 + 0.45 * rim) * COLOR.r;
}
