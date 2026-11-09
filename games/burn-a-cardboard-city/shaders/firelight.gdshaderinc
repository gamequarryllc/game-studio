// Up to four pooled fire lights (set every fire tick by CityView from the biggest fires
// near the giant): xyz = where, w = how bright. Added as warm light in the shaders
// themselves, so phones pay a few multiplies, not a render pass per light.
global uniform vec4 fire_l0;
global uniform vec4 fire_l1;
global uniform vec4 fire_l2;
global uniform vec4 fire_l3;

vec3 _one_fire(vec4 l, vec3 p, vec3 n) {
	vec3 d = l.xyz - p;
	float dist = length(d);
	float range = 3.0 + 2.6 * l.w;
	float att = clamp(1.0 - dist / range, 0.0, 1.0);
	att *= att;
	float facing = clamp(dot(n, d / max(dist, 0.001)), 0.0, 1.0) * 0.75 + 0.25;
	return vec3(1.0, 0.5, 0.2) * l.w * att * facing;
}

vec3 fire_light(vec3 p, vec3 n) {
	return _one_fire(fire_l0, p, n) + _one_fire(fire_l1, p, n) + _one_fire(fire_l2, p, n) + _one_fire(fire_l3, p, n);
}
