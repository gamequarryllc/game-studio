class_name Paper
extends MarginContainer
## A sheet of chart paper with its children laid out inside the ruled border.

@export var seed := 1
@export var border := true
@export var grid := true
@export var fold := true
@export var shadow := true
@export var color := UiTheme.PAPER


func _init(s: int = 1, pad: int = 18) -> void:
	seed = s
	for side in ["left", "right", "top", "bottom"]:
		add_theme_constant_override("margin_" + side, pad)
	mouse_filter = Control.MOUSE_FILTER_STOP


func _draw() -> void:
	UiTheme.paper(self, Rect2(Vector2.ZERO, size), seed, {"border": border, "grid": grid, "fold": fold, "shadow": shadow, "color": color})
