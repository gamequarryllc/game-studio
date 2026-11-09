// Shared by every city structure (cardboard and marker ink): the burn and the fall.
// Drawn from MultiMeshes with world_vertex_coords. INSTANCE_CUSTOM:
//   r = how charred it is (0..1, the game updates it while it burns)
//   g = a random 0..1 per building (tone, crumple pattern)
//   b = the time it started to fall (in `now`'s clock; far in the future = still up)
//   a = code: fall direction (0 +x, 1 -x, 2 +z, 3 -z) + 4 x topples + 8 x burning
//       + 16 x (half the footprint along the fall direction, in 0.1 m steps)
// The instance origin is the middle of the footprint on the floor.

uniform float now = 0.0;

varying float v_char;
varying float v_burning;
varying float v_vary;
varying float v_fallen;
varying vec3 v_obj;

vec3 rotate_axis(vec3 p, vec3 k, float a) {
	float c = cos(a);
	float s = sin(a);
	return p * c + cross(k, p) * s + k * dot(k, p) * (1.0 - c);
}

void structure_vertex(inout vec3 v, inout vec3 nrm, vec3 base, vec4 cd, out vec3 obj, out float burning, out float fallen) {
	float code = cd.a;
	float he = floor(code / 16.0) * 0.1;
	float rem = mod(code, 16.0);
	burning = step(8.0, rem);
	float bits = mod(rem, 8.0);
	float topple = step(4.0, bits);
	float dir = mod(bits, 4.0);
	float vary = cd.g;
	fallen = 0.0;
	vec3 rel = v - base;
	obj = rel;
	// Burning buildings shiver in the heat and sag a little.
	float sag = cd.r * cd.r * 0.06 * max(rel.y, 0.0);
	rel.y -= sag * burning;
	rel.xz += vec2(sin(TIME * 21.0 + vary * 40.0), cos(TIME * 17.0 + vary * 31.0)) * 0.004 * burning * max(rel.y, 0.0);
	v = base + rel;
	float tc = now - cd.b;
	if (tc <= 0.0) {
		return;
	}
	if (topple > 0.5) {
		vec3 fd = dir < 0.5 ? vec3(1.0, 0.0, 0.0) : (dir < 1.5 ? vec3(-1.0, 0.0, 0.0) : (dir < 2.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0)));
		float T = 1.05;
		float k = clamp(tc / T, 0.0, 1.0);
		float pre = 0.2;
		float ang;
		if (k < pre) {
			// Anticipation: it leans back a touch before it goes.
			ang = -0.07 * sin(k / pre * 3.14159);
		} else {
			float f = (k - pre) / (1.0 - pre);
			ang = 1.5708 * f * f * f;
		}
		float after = max(tc - T, 0.0);
		ang -= 0.1 * exp(-after * 7.0) * sin(after * 20.0) * step(T, tc);
		vec3 pivot = base + fd * he;
		vec3 axis = normalize(cross(vec3(0.0, 1.0, 0.0), fd));
		vec3 p = rotate_axis(v - pivot, axis, ang);
		nrm = rotate_axis(nrm, axis, ang);
		v = pivot + p;
		// On impact it crumples flat onto the floor (squash), with a bounce first (stretch).
		float sq = smoothstep(0.0, 0.3, after);
		float bounce = exp(-after * 9.0) * step(T, tc);
		v.y = max(v.y * mix(1.0, 0.42, sq) * (1.0 + 0.12 * bounce), 0.0);
		v += nrm * sin(dot(v, vec3(9.1, 5.7, 7.3)) + vary * 30.0) * 0.035 * sq;
		fallen = sq;
	} else {
		float T = 0.55;
		float k = clamp(tc / T, 0.0, 1.0);
		float e = k * k * (3.0 - 2.0 * k);
		float h = max(rel.y, 0.0);
		// Folds down on itself: squashes, bulges, and zig-zags like a crushed box.
		rel.y = h * mix(1.0, 0.16, e);
		rel.xz *= 1.0 + 0.22 * e * clamp(h * 1.5, 0.0, 1.0);
		rel.xz += vec2(sin(h * 11.0 + vary * 20.0), cos(h * 9.0 + vary * 13.0)) * 0.05 * e * clamp(h * 2.0, 0.0, 1.0);
		float over = exp(-max(tc - T, 0.0) * 10.0) * step(T, tc);
		rel.y *= 1.0 + 0.25 * over;
		v = base + rel;
		nrm = normalize(mix(nrm, vec3(0.0, 1.0, 0.0), e * 0.4));
		fallen = e;
	}
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

float vnoise3(vec3 p) {
	return vnoise(p.xz + p.y * vec2(0.71, 1.33));
}

// How burnt this point is (0 clean, 1 charred), from the building's char amount.
float char_mask(vec3 obj, float amount, float vary) {
	float n = vnoise3(obj * 3.1 + vary * 17.0) * 0.6 + vnoise3(obj * 9.0) * 0.4;
	// Char creeps up from below and in from the edges where it burns.
	float lowness = clamp(1.0 - obj.y * 0.35, 0.0, 1.0) * 0.25;
	return smoothstep(0.0, 0.12, amount * 1.25 + lowness * amount - n);
}
