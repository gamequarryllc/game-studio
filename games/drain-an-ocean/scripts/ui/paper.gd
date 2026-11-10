class_name Paper
extends MarginContainer
## A sheet of chart paper with its children laid out inside the ruled border.

@export var seed := 1
@export var border := true
@export var grid := true
@export var fold := true
@export var shadow := true
@export var color := UiTheme.PAPER
## Which material: "chart", "slip", "tag", "cartouche", "label", "folded", "plate".
@export var style := "chart"
var eyelet := Vector2.ZERO          # where a tag's thread ties on (local)


func _init(s: int = 1, pad: int = 18) -> void:
	seed = s
	for side in ["left", "right", "top", "bottom"]:
		add_theme_constant_override("margin_" + side, pad)
	mouse_filter = Control.MOUSE_FILTER_STOP


func _draw() -> void:
	if size.x < 24.0 or size.y < 16.0:
		return
	var r := Rect2(Vector2.ZERO, size)
	match style:
		"slip":
			UiTheme.slip(self, r, seed)
		"tag":
			eyelet = UiTheme.tag(self, r, seed)
		"cartouche":
			UiTheme.cartouche(self, r, seed)
		"label":
			UiTheme.label_card(self, r, seed)
		"folded":
			UiTheme.folded(self, r, seed)
		"plate":
			UiTheme.plate(self, r, seed)
		_:
			UiTheme.paper(self, r, seed, {"border": border, "grid": grid, "fold": fold, "shadow": shadow, "color": color})
