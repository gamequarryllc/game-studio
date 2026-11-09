shader_type canvas_item;
// Something not yet in reach, sketched in pencil: the ink lines of a drawing
// turn to graphite and the colour fills drop away.

uniform vec4 lead : source_color = vec4(0.43, 0.42, 0.45, 1.0);

void fragment() {
	vec4 c = texture(TEXTURE, UV) * COLOR;
	float l = dot(c.rgb, vec3(0.3, 0.59, 0.11));
	float line = (1.0 - smoothstep(0.2, 0.36, l)) * c.a;
	COLOR = vec4(lead.rgb, line * 0.85);
}
