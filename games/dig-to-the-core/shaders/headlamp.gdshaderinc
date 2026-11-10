// The headlamp, worked out per pixel for the rock and everything lying on it
// (rock.gdshader, decor.gdshader), so its pool is exactly what we want: a warm,
// near-neutral beam (the layer's own colour shows), bright where you aim,
// falling off fast to near-black within a few metres; a little spill round
// the beam; cool light only on edges that turn away from you. The lamp sits
// on the camera and points where it looks. The SpotLight3D on the player
// lights props and the tool to match, and skips these surfaces (their render
// layer, Player.ROCK_LAYER, is left out of its light_cull_mask).

uniform float lamp_on = 0.0;                 // 0 up on the field, 1 underground (Player)
uniform vec3 lamp_color = vec3(1.0, 0.92, 0.8);
uniform float lamp_energy = 1.25;
uniform float lamp_range = 9.5;              // metres to black (the Headlamp Range upgrade adds to it)
uniform float lamp_cos_in = 0.97;            // cos of the bright core's half-angle (~14 deg)
uniform float lamp_cos_out = 0.85;           // cos of the beam's edge (~32 deg)
uniform vec3 bounce_color = vec3(0.3, 0.38, 0.5);
uniform float bounce = 0.0;

// x: the warm beam's strength at this point (0..~2), y: how much of the beam
// it's in (0..1, for glints), z: the cool edge light (0..1).
vec3 headlamp_terms(vec3 wpos, vec3 nw, mat4 inv_view) {
	vec3 cam = inv_view[3].xyz;
	vec3 fwd = -normalize(inv_view[2].xyz);
	vec3 lv = cam - wpos;
	float d = max(length(lv), 0.001);
	vec3 l = lv / d;
	float ca = dot(-l, fwd);
	float cone = smoothstep(lamp_cos_out, lamp_cos_in, ca);
	float spill = 0.1 * smoothstep(0.45, lamp_cos_out, ca);
	float att = 1.0 / (1.0 + 0.07 * d * d);
	att *= 1.0 - smoothstep(lamp_range * 0.55, lamp_range, d);
	// right at the lens the beam would blow rock out to flat colour
	att *= mix(0.45, 1.0, smoothstep(0.3, 2.0, d));
	float ndl = clamp(dot(nw, l) * 0.8 + 0.2, 0.0, 1.0);
	float beam = (cone + spill) * att * ndl;
	float facing = clamp(dot(nw, l), 0.0, 1.0);
	float rim = pow(1.0 - facing, 3.0) * (1.0 - cone) * (1.0 - smoothstep(1.2, lamp_range * 0.8, d));
	return vec3(beam, cone * att, rim);
}

vec3 headlamp_light(vec3 albedo, vec3 terms) {
	// the cool edge light reads even on dark rock (a painter's rim, not a lamp)
	return (albedo * lamp_color * lamp_energy * terms.x + (albedo * 0.7 + vec3(0.05)) * bounce_color * bounce * 1.8 * terms.z) * lamp_on;
}
