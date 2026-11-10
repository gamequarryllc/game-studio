class_name FlickerLight
extends OmniLight3D
## A light that breathes like something molten under it: slow swells with a
## faster shimmer on top (the lava lakes' glow on the walls).

var base_energy := 1.0
var _t := 0.0


func _ready() -> void:
	base_energy = light_energy
	_t = randf() * 10.0


func _process(delta: float) -> void:
	_t += delta
	light_energy = base_energy * (0.86 + 0.1 * sin(_t * 1.3) + 0.05 * sin(_t * 4.7 + 1.1) + 0.03 * sin(_t * 11.0))
