class_name DevPanel
extends Control
## Playtest builds only (the "playtest" feature tag or the editor): the
## harbour master's logbook, for playing the game end to end quickly. Hold
## the money cartouche for a second (or press F9) to open it; nothing in the
## game shows that it's there. Time x1/5/10/50, income x1/10/100, give
## coins, unlock everything, skip to any ring, reset the save, and the
## stubbed ad / purchase / interstitial counts.

var world
var hud
var page: Paper
var list: VBoxContainer


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade := ColorRect.new()
	shade.color = Color(0.04, 0.14, 0.17, 0.55)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e):
		if (e is InputEventMouseButton and e.pressed) or (e is InputEventScreenTouch and e.pressed):
			close())
	add_child(shade)
	page = Paper.new(201, 24)
	add_child(page)
	var sc := ScrollContainer.new()
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	page.add_child(sc)
	list = VBoxContainer.new()
	list.add_theme_constant_override("separation", 6)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(list)


func open() -> void:
	visible = true
	var vs := get_viewport_rect().size
	page.position = Vector2(vs.x * 0.5 - 380, 30)
	page.size = Vector2(760, vs.y - 60)
	page.custom_minimum_size = page.size
	_build()


func close() -> void:
	if not visible:
		return
	visible = false
	GameState.save_game()


func _row(text: String, buttons: Array) -> void:
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 10)
	list.add_child(hb)
	var l := UiTheme.label(text, 23, UiTheme.INK, UiTheme.bold())
	l.custom_minimum_size.x = 210
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hb.add_child(l)
	for b in buttons:
		var sb := StampButton.new(str(b[0]), "", 22)
		sb.ink = UiTheme.INK if not b.size() > 2 else b[2]
		sb.set_meta("id", "dev:" + str(b[0]).to_lower().replace(" ", "_"))
		var cb: Callable = b[1]
		sb.pressed.connect(func():
			cb.call()
			_build())
		hb.add_child(sb)


func _build() -> void:
	for c in list.get_children():
		list.remove_child(c)
		c.queue_free()
	var gs = GameState
	list.add_child(UiTheme.label("Harbour master's log", 36, UiTheme.INK, UiTheme.italic()))
	list.add_child(UiTheme.wrap(UiTheme.label("Playtest builds only. Ads %d, purchases %d, interstitials %d. Played %s. Time x%d, income x%d." % [
		gs.ads_watched, gs.purchases_made, Monetization.interstitials_shown, Fmt.duration(gs.play_time), int(Engine.time_scale), int(gs.income_mult)],
		22, Color(UiTheme.INK, 0.8), UiTheme.body()), 680))
	var times: Array = []
	for ts in [1.0, 5.0, 10.0, 50.0]:
		var v: float = ts
		times.append(["x%d" % int(ts), func(): Engine.time_scale = v])
	_row("Time", times)
	var incs: Array = []
	for im in [1.0, 10.0, 100.0]:
		var v: float = im
		incs.append(["x%d" % int(im), func(): gs.income_mult = v])
	_row("Income", incs)
	_row("Coins", [["Give", func(): gs.grant_money(maxf(gs.next_pump_cost(), 1000.0) * 10.0)]])
	_row("Unlock", [["Everything", func():
		gs.unlock_everything()
		world.on_shop_bought()]])
	var rings: Array = []
	for r in Balance.RINGS.size():
		var rr: int = r
		rings.append([str(r + 1), func():
			close()
			world.skip_to_ring(rr)])
	_row("Skip to ring", rings)
	_row("Save", [["Reset", func():
		close()
		world.dev_reset(), UiTheme.FLAG_RED]])
	_row("", [["Close", func(): close()]])
