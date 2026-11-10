class_name ShopPanel
extends Control
## The Chandlery: the pump merchant's pegboard on the town quay. Goods hang
## on pegs as manila price tags, grouped under painted headings (pumps by
## pad, barges, upgrades, helpers); the next thing worth buying hangs on its
## own big tag at the left with the price stamped large. The harbour office
## (purchases, restore, sound) is a drawer of its own behind a hanging sign,
## and every free-for-an-ad offer is one pinned notice in it, not a row each.
##
## Every buy stamp has a name the bots can press: "buy:pad:2", "buy:barge",
## "buy:up:power", "buy:helper:pelican", "iap:<product>", "ad:<kind>",
## "restore", "sound", "office", "board", "back".

const PAD_NAMES := ["Town beach", "Slipway", "Pier steps", "River mouth", "East point", "West cliffs"]

var world
var hud
var tab := "board"                # "board" or "office"
var board: Control
var next_slot: Control
var scroll: ScrollContainer
var grid: Container
var title_box: Control
var _dirty := true
var _rebuild_t := 0.0
var _ticked := false                 # money or state moved since the last look
var _sig := ""                       # what the board was built from (money aside)
var rebuilds := 0                    # for tests: money ticks must not rebuild the board


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade := ColorRect.new()
	shade.color = Color(0.04, 0.14, 0.17, 0.6)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(shade)
	board = Control.new()
	board.draw.connect(func(): UiTheme.pegboard(board, Rect2(Vector2.ZERO, board.size)))
	add_child(board)
	title_box = Control.new()
	add_child(title_box)
	next_slot = Control.new()
	add_child(next_slot)
	scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	grid = VBoxContainer.new()
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("separation", 6)
	scroll.add_child(grid)
	GameState.changed.connect(func(): _ticked = true)
	Monetization.purchases_changed.connect(func(): _dirty = true)
	resized.connect(_layout)
	_layout()


func _layout() -> void:
	var vs := get_viewport_rect().size
	var m := 22.0
	board.position = Vector2(m, m)
	board.size = vs - Vector2(m * 2.0, m * 2.0)
	board.queue_redraw()
	title_box.position = board.position + Vector2(24, 12)
	title_box.size = Vector2(board.size.x - 48, 92)
	var slot_w := clampf(board.size.x * 0.3, 330.0, 430.0)
	next_slot.position = board.position + Vector2(20, 112)
	next_slot.size = Vector2(slot_w, board.size.y - 130)
	scroll.position = board.position + Vector2(slot_w + 44, 112)
	scroll.size = Vector2(board.size.x - slot_w - 64, board.size.y - 126)


func open(t: String = "") -> void:
	tab = "office" if t in ["purchases", "office"] else "board"
	visible = true
	_dirty = true
	if hud != null:
		hud.set_hud_visible(false)
	_layout()
	_rebuild()
	Sound.play("ui_open", -4.0)


func close() -> void:
	if not visible:
		return
	visible = false
	if hud != null:
		hud.set_hud_visible(true)
	Sound.play("ui_close", -5.0)
	GameState.save_game()
	if world != null:
		world.on_panel_closed()


func _process(delta: float) -> void:
	if not visible:
		return
	_rebuild_t -= delta
	if _ticked and not _dirty and _rebuild_t <= 0.0:
		# The aquarium pays every second: only rebuild when something on the
		# board would read differently, otherwise just restamp the "short by".
		_ticked = false
		if _state_sig() != _sig:
			_dirty = true
		else:
			_restamp()
	if _dirty and _rebuild_t <= 0.0 and not _finger_down():
		_rebuild()


func _state_sig() -> String:
	var gs = GameState
	var afford := ""
	for b in find_children("*", "StampButton", true, false):
		if b.has_meta("cost"):
			afford += "1" if gs.money >= float(b.get_meta("cost")) else "0"
	var rush := [gs.boost_can_stack(), gs.is_ticket_rush_active(), gs.is_helper_rush_active(), gs.aquarium_income() > 0.0, gs.has_helpers()]
	for k in Balance.AD_REWARDS:
		rush.append(Monetization.is_rewarded_ready(str(Balance.AD_REWARDS[k].placement)))
	return var_to_str([tab, gs.pads, gs.upgrade_levels, gs.helper_counts, gs.barges.size(), world.bay.pool_ids().size() if world != null else 0,
		snappedf(world.bay.main_level(), 0.5) if world != null else 0.0, gs.owns_remove_ads, gs.owns_brass, gs.owns_starter, gs.starter_offered,
		Sound.muted, Fmt.num(gs.instant_cash_amount()), rush, afford])


func _restamp() -> void:
	for b in find_children("*", "StampButton", true, false):
		if b.has_meta("short"):
			var c := float(b.get_meta("cost"))
			(b as StampButton).set_label((b as StampButton).text, "" if GameState.money >= c else "short by %s" % Fmt.num(c - GameState.money))
		elif b.has_meta("pack"):
			(b as StampButton).set_label((b as StampButton).text, "+%s" % Fmt.num(GameState.cash_pack_amount(str(b.get_meta("pack")))))


func _finger_down() -> bool:
	## Never pull a stamp out from under a finger that's pressing it.
	for b in find_children("*", "BaseButton", true, false):
		var m: int = (b as BaseButton).get_draw_mode()
		if m == BaseButton.DRAW_PRESSED or m == BaseButton.DRAW_HOVER_PRESSED:
			return true
	return false


func find_button(id: String) -> BaseButton:
	## For bots and tests: the stamp or sign with this name, if it's showing.
	for n in find_children("*", "BaseButton", true, false):
		if str(n.get_meta("id", "")) == id and (n as Control).is_visible_in_tree():
			return n
	return null


func press(id: String) -> bool:
	var b := find_button(id)
	if b == null or b.disabled:
		return false
	b.pressed.emit()
	return true


# --- Building -----------------------------------------------------------------------------------
func _rebuild() -> void:
	_dirty = false
	_ticked = false
	_rebuild_t = 0.25
	rebuilds += 1
	var keep := scroll.scroll_vertical
	for c in title_box.get_children() + next_slot.get_children() + grid.get_children():
		c.get_parent().remove_child(c)
		c.queue_free()
	_title()
	_next_buy()
	if tab == "office":
		_office()
	else:
		_goods()
	_sig = _state_sig()
	await get_tree().process_frame
	scroll.scroll_vertical = keep


func _title() -> void:
	var hb := HBoxContainer.new()
	hb.size = title_box.size
	hb.add_theme_constant_override("separation", 18)
	title_box.add_child(hb)
	var tv := VBoxContainer.new()
	tv.add_theme_constant_override("separation", -6)
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hb.add_child(tv)
	tv.add_child(UiTheme.label("The Chandlery" if tab == "board" else "The harbour office", 46, UiTheme.PAPER, UiTheme.display()))
	tv.add_child(UiTheme.label("ship's chandler and pump merchant, on the town quay" if tab == "board" else "next door, up the stairs: purchases, the post, the sound", 22, Color(UiTheme.PAPER, 0.78), UiTheme.italic()))
	var sw := SignButton.new("Harbour office" if tab == "board" else "The pegboard", 3)
	sw.set_meta("id", "office" if tab == "board" else "board")
	sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sw.pressed.connect(func():
		tab = "office" if tab == "board" else "board"
		scroll.scroll_vertical = 0
		Sound.play("click", -6.0)
		_rebuild())
	hb.add_child(sw)
	var back := SignButton.new("Back to the bay", 7)
	back.set_meta("id", "back")
	back.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	back.pressed.connect(close)
	hb.add_child(back)


func _next_buy() -> void:
	## The big tag: the cheapest next pump (or, when every pad is at its
	## best, the cheapest upgrade), the price stamped large, and if you're
	## short, the harbour office's free coins right under it.
	var gs = GameState
	var p: int = gs.cheapest_pad()
	var id := ""
	var name := ""
	var what := ""
	var gain := ""
	var icon := "pump_1"
	var cost := 0.0
	if p >= 0:
		var t := int(gs.pads[p])
		var nd: Dictionary = Balance.pump_def(t + 1)
		id = "pad:%d" % p
		name = str(nd.name)
		what = "%s, on pad %d by the %s." % ["Set up" if t == 0 else "Swapped in for the %s" % str(Balance.pump_def(t).name).to_lower(), p + 1, PAD_NAMES[p].to_lower()]
		gain = "moves %s" % Fmt.flow(gs.pump_flow(t + 1, world.bay.main_level()))
		icon = "pump_%d" % (t + 1)
		cost = gs.pad_next_cost(p)
	else:
		var best := ""
		var bc := INF
		for u in Balance.UPGRADES:
			var c: float = gs.upgrade_cost(u.key)
			if c > 0.0 and c < bc:
				bc = c
				best = u.key
		if best != "":
			var ud: Dictionary = gs.upgrade_def(best)
			id = "up:" + best
			name = str(ud.name)
			what = str(ud.desc)
			gain = "level %d of %d" % [int(gs.upgrade_levels[best]) + 1, int(ud.max)]
			icon = "up_" + best
			cost = bc
	var t := Paper.new(12, 24)
	t.style = "tag"
	t.add_theme_constant_override("margin_left", 44)
	t.position = Vector2(0, 30)
	t.custom_minimum_size = Vector2(next_slot.size.x, 0)
	t.rotation = deg_to_rad(-1.4)
	next_slot.add_child(t)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	t.add_child(vb)
	vb.add_child(UiTheme.label("NEXT ON THE LIST", 21, UiTheme.RUST, UiTheme.bold()))
	if id == "":
		vb.add_child(UiTheme.wrap(UiTheme.label("You've bought the shop out. The harbour office still has the odd thing.", 24, UiTheme.INK, UiTheme.body()), next_slot.size.x - 80))
		return
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 12)
	vb.add_child(hb)
	var ic := TextureRect.new()
	ic.texture = UiTheme.icon(icon)
	ic.custom_minimum_size = Vector2(96, 96)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	hb.add_child(ic)
	hb.add_child(UiTheme.wrap(UiTheme.label(name, 34, UiTheme.INK, UiTheme.display()), next_slot.size.x - 200))
	vb.add_child(UiTheme.wrap(UiTheme.label(what, 23, Color(UiTheme.INK, 0.8), UiTheme.body()), next_slot.size.x - 80))
	vb.add_child(UiTheme.label(gain, 24, UiTheme.INK, UiTheme.italic()))
	var b := StampButton.new("Buy  %s" % Fmt.num(cost), "" if gs.money >= cost else "short by %s" % Fmt.num(cost - gs.money), 32)
	b.icon = UiTheme.icon("coin")
	b._fit()
	b.disabled = gs.money < cost
	b.set_meta("id", "buy:" + id)
	b.set_meta("cost", cost)
	b.set_meta("short", true)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.pressed.connect(func(): _buy(id))
	vb.add_child(b)
	if gs.money < cost:
		# Short: the free coins and the cash packs, right where you need them.
		var note := Paper.new(14, 16)
		note.style = "slip"
		note.add_theme_constant_override("margin_top", 22)
		note.position = Vector2(10, t.position.y + 470)
		note.custom_minimum_size = Vector2(next_slot.size.x - 20, 0)
		note.rotation = deg_to_rad(1.2)
		next_slot.add_child(note)
		var nv := VBoxContainer.new()
		nv.add_theme_constant_override("separation", 6)
		note.add_child(nv)
		nv.add_child(UiTheme.wrap(UiTheme.label("The harbour fund will advance you %s for a short ad." % Fmt.num(gs.instant_cash_amount()), 23, UiTheme.INK, UiTheme.body()), next_slot.size.x - 60))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		nv.add_child(row)
		var ab := StampButton.new("Watch an ad", "", 24)
		ab.ink = UiTheme.TEAL
		ab.disabled = not Monetization.is_rewarded_ready(Monetization.PLACEMENT_CASH)
		ab.set_meta("id", "ad:cash")
		ab.pressed.connect(func(): world.watch_ad("cash"))
		row.add_child(ab)
		var pid: String = Monetization.PRODUCT_CASH_SMALL
		var cb := StampButton.new(Monetization.price(pid), "+%s" % Fmt.num(gs.cash_pack_amount("small")), 24)
		cb.ink = UiTheme.INK
		cb.set_meta("id", "iap:" + pid)
		cb.set_meta("pack", "small")
		cb.pressed.connect(func(): Monetization.buy(pid))
		row.add_child(cb)
	await get_tree().process_frame
	if is_instance_valid(t):
		t.reset_size()


func _heading(text: String) -> void:
	var l := UiTheme.label(text, 30, UiTheme.PAPER, UiTheme.italic())
	l.add_theme_color_override("font_outline_color", Color(UiTheme.INK, 0.5))
	l.add_theme_constant_override("outline_size", 4)
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 10)
	m.add_theme_constant_override("margin_left", 6)
	m.add_child(l)
	grid.add_child(m)


func _flow() -> HFlowContainer:
	var f := HFlowContainer.new()
	f.add_theme_constant_override("h_separation", 22)
	f.add_theme_constant_override("v_separation", 18)
	f.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_child(f)
	return f


func _tag(parent: Control, icon: String, name: String, line: String, stamp: String, sub: String, enabled: bool, id: String, cb: Callable,
		ink: Color = UiTheme.RUST, seed: int = 1, cost: float = -1.0) -> StampButton:
	## One price tag on a peg.
	var hang := PegTag.new(seed)
	parent.add_child(hang)
	var t := Paper.new(seed, 14)
	t.style = "tag"
	t.add_theme_constant_override("margin_left", 40)
	t.add_theme_constant_override("margin_top", 12)
	t.add_theme_constant_override("margin_bottom", 12)
	t.custom_minimum_size = Vector2(318, 0)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hang.add_child(t)
	hang.tag = t
	t.pivot_offset = Vector2(20, 30)
	t.rotation = deg_to_rad(UiTheme.jitter(seed, 3) * 1.6)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 2)
	t.add_child(vb)
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 10)
	vb.add_child(hb)
	var ic := TextureRect.new()
	ic.texture = UiTheme.icon(icon)
	ic.custom_minimum_size = Vector2(52, 52)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hb.add_child(ic)
	hb.add_child(UiTheme.wrap(UiTheme.label(name, 24, UiTheme.INK, UiTheme.bold()), 200))
	if line != "":
		vb.add_child(UiTheme.wrap(UiTheme.label(line, 22, Color(UiTheme.INK, 0.78), UiTheme.body()), 250))
	var b: StampButton = null
	if stamp != "":
		b = StampButton.new(stamp, sub, 26)
		if ink == UiTheme.RUST and stamp.length() > 0 and stamp[0].is_valid_int():
			b.icon = UiTheme.icon("coin")
			b._fit()
		b.ink = ink
		b.disabled = not enabled
		b.set_meta("id", id)
		if cost > 0.0:
			b.set_meta("cost", cost)
		b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		b.pressed.connect(cb)
		vb.add_child(b)
	return b


func _takings(m: float) -> String:
	return "Coins for the harbour fund: about %s of takings." % ("%d minutes" % int(m) if m < 60.0 else ("an hour" if m < 90.0 else "%d hours" % int(roundf(m / 60.0))))


func _price(c: float) -> String:
	return Fmt.num(c) if c > 0.0 else ""


func _buy(id: String) -> void:
	if world.buy(id):
		Sound.play("buy", -3.0)
	else:
		Sound.play("cant_afford", -6.0)


func _goods() -> void:
	var gs = GameState
	_heading("Pumps, by pad")
	var f := _flow()
	for i in gs.pads.size():
		var t := int(gs.pads[i])
		var c: float = gs.pad_next_cost(i)
		var pid: int = i
		if c <= 0.0:
			_tag(f, "pump_%d" % t, "Pad %d, %s" % [i + 1, PAD_NAMES[i]], "%s, the best there is." % str(Balance.pump_def(t).name), "", "", false, "", Callable(), UiTheme.RUST, 30 + i)
			continue
		var nd: Dictionary = Balance.pump_def(t + 1)
		var line := ("Empty. Next: %s." if t == 0 else "%s now. Next: %%s." % str(Balance.pump_def(t).name)) % str(nd.name).to_lower()
		_tag(f, "pump_%d" % (t + 1), "Pad %d, %s" % [i + 1, PAD_NAMES[i]], line, _price(c), "", gs.money >= c, "buy:pad:%d" % pid, func(): _buy("pad:%d" % pid), UiTheme.RUST, 30 + i, c)
	_heading("Barges and helpers")
	f = _flow()
	var bc: float = gs.barge_cost()
	var pools: int = world.bay.pool_ids().size()
	_tag(f, "barge", "Barge pump", "%d of %d afloat. %s" % [gs.barges.size(), Balance.BARGE_COSTS.size(), ("%d pool%s holding water." % [pools, "s" if pools != 1 else ""]) if pools > 0 else "Tap a pool to send one."],
		_price(bc) if bc > 0.0 else "", "", bc > 0.0 and gs.money >= bc, "buy:barge", func(): _buy("barge"), UiTheme.RUST, 41, bc)
	for hd in Balance.HELPERS:
		var c: float = gs.helper_cost(hd.key)
		var key: String = hd.key
		_tag(f, "helper_" + key, str(hd.name), "%s %d working." % [str(hd.desc), gs.helper_count(key)], _price(c), "", c > 0.0 and gs.money >= c,
			"buy:helper:" + key, func(): _buy("helper:" + key), UiTheme.RUST, 43 + key.length(), c)
	_heading("Upgrades")
	f = _flow()
	for u in Balance.UPGRADES:
		var lvl := int(gs.upgrade_levels[u.key])
		var c: float = gs.upgrade_cost(u.key)
		var key: String = u.key
		_tag(f, "up_" + key, str(u.name), "%s Level %d of %d." % [str(u.desc), lvl, int(u.max)], _price(c), "", c > 0.0 and gs.money >= c,
			"buy:up:" + key, func(): _buy("up:" + key), UiTheme.RUST, 51 + key.length(), c)


func _office() -> void:
	var gs = GameState
	# Every ad offer on one pinned notice.
	var note := Paper.new(91, 18)
	note.style = "slip"
	note.add_theme_constant_override("margin_top", 24)
	grid.add_child(note)
	var nv := VBoxContainer.new()
	nv.add_theme_constant_override("separation", 8)
	note.add_child(nv)
	nv.add_child(UiTheme.label("NOTICE: FREE FOR A SHORT AD", 21, UiTheme.RUST, UiTheme.bold()))
	nv.add_child(UiTheme.wrap(UiTheme.label("Watch one and the harbour pays: twice the pumping for five minutes (stacks to fifteen), a few minutes' takings, or the aquarium selling double for ten.", 23, UiTheme.INK, UiTheme.body()), 720))
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 14)
	nv.add_child(row)
	var defs := [["boost", "2x pumping", gs.boost_can_stack()], ["cash", "+%s coins" % Fmt.num(gs.instant_cash_amount()), true],
		["tickets", "Double tickets", gs.aquarium_income() > 0.0 and not gs.is_ticket_rush_active()], ["helper_rush", "Helpers 3x", gs.has_helpers() and not gs.is_helper_rush_active()]]
	for d in defs:
		var kind: String = d[0]
		var b := StampButton.new(str(d[1]), "", 24)
		b.ink = UiTheme.TEAL
		b.disabled = not bool(d[2]) or not Monetization.is_rewarded_ready(str(Balance.AD_REWARDS[kind].placement))
		b.set_meta("id", "ad:" + kind)
		b.pressed.connect(func(): world.watch_ad(kind))
		row.add_child(b)
	_heading("From the harbour office")
	var f := _flow()
	var ra := Monetization.PRODUCT_REMOVE_ADS_2X
	_tag(f, "flag_z", "No ads, 2x for good", "Every pump and helper twice as hard, forever. No ad breaks.", "" if gs.owns_remove_ads else Monetization.price(ra),
		"owned" if gs.owns_remove_ads else "", true, "iap:" + ra, func(): Monetization.buy(ra), UiTheme.INK, 61)
	var br := Monetization.PRODUCT_BRASS
	_tag(f, "brass", "Polished brass pumps", "Every pump in gleaming brass, and 10% more flow.", "" if gs.owns_brass else Monetization.price(br),
		"", true, "iap:" + br, func(): Monetization.buy(br), UiTheme.INK, 62)
	if gs.starter_offered and not gs.owns_starter:
		var st := Monetization.PRODUCT_STARTER
		_tag(f, "chest", "Harbour starter pack", "A strongbox of %s coins and the signal-flag livery. Once only." % Fmt.num(gs.starter_cash()),
			Monetization.price(st), "", true, "iap:" + st, func(): Monetization.buy(st), UiTheme.INK, 63)
	for pid in [Monetization.PRODUCT_CASH_SMALL, Monetization.PRODUCT_CASH_MEDIUM, Monetization.PRODUCT_CASH_LARGE]:
		var pd: Dictionary = Monetization.PRODUCTS[pid]
		var p: String = pid
		var pb := _tag(f, "coins", str(pd.title), _takings(float(Balance.CASH_PACK_MINUTES[str(pd.pack)])), Monetization.price(pid),
			"+%s" % Fmt.num(gs.cash_pack_amount(str(pd.pack))), true, "iap:" + pid, func(): Monetization.buy(p), UiTheme.INK, 64 + str(pd.pack).length())
		pb.set_meta("pack", str(pd.pack))
	_heading("The post and the sound")
	f = _flow()
	_tag(f, "restore", "Restore purchases", "Bought on another phone? It comes back here.", "Restore", "", true, "restore", func():
		Monetization.restore()
		hud.say("Purchases restored."), UiTheme.INK, 71)
	_tag(f, "sound", "Sound", "Pumps, gulls and the sea: %s." % ("off" if Sound.muted else "on"), "Turn on" if Sound.muted else "Turn off", "", true, "sound", func():
		Sound.set_muted(not Sound.muted)
		_dirty = true, UiTheme.INK, 72)


class PegTag extends MarginContainer:
	## A peg on the board and the tag hanging from it on a loop of string.
	## The tag is this container's child, so rows of tags never overlap.
	var tag: Paper
	var seed := 1

	func _init(s: int) -> void:
		seed = s
		add_theme_constant_override("margin_top", 30)
		add_theme_constant_override("margin_left", 4)
		add_theme_constant_override("margin_right", 8)
		add_theme_constant_override("margin_bottom", 6)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		if tag == null:
			return
		var peg := Vector2(30, 8)
		var eye := tag.position + tag.pivot_offset + (tag.eyelet - tag.pivot_offset).rotated(tag.rotation)
		draw_line(peg, eye, UiTheme.ROPE_DARK, 2.0, true)
		draw_line(peg + Vector2(4, 0), eye + Vector2(2, 1), UiTheme.ROPE, 1.2, true)
		draw_circle(peg + Vector2(1, 2), 6.5, Color(0.04, 0.1, 0.12, 0.5))
		draw_circle(peg, 6.0, UiTheme.BRASS_DARK)
		draw_circle(peg, 4.0, UiTheme.BRASS)


class SignButton extends BaseButton:
	## A small painted board hung on two strings: the sign to the office,
	## the way out.
	var text := ""
	var seed := 1
	var _press := 0.0

	func _init(t: String, s: int) -> void:
		text = t
		seed = s
		focus_mode = Control.FOCUS_NONE
		var w := UiTheme.display().get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x
		custom_minimum_size = Vector2(w + 48, 74)

	func _process(delta: float) -> void:
		_press = move_toward(_press, 1.0 if is_pressed() else 0.0, delta * 10.0)
		queue_redraw()

	func _draw() -> void:
		var r := Rect2(Vector2(4, 16 + _press * 3.0), size - Vector2(8, 20))
		draw_line(Vector2(r.position.x + 14, 0), r.position + Vector2(14, 2), UiTheme.ROPE_DARK, 2.0)
		draw_line(Vector2(r.end.x - 14, 0), Vector2(r.end.x - 14, r.position.y + 2), UiTheme.ROPE_DARK, 2.0)
		draw_colored_polygon(UiTheme.rough_rect(Rect2(r.position + Vector2(3, 4), r.size), seed + 4, 1.0), Color(0.04, 0.1, 0.12, 0.45))
		draw_colored_polygon(UiTheme.rough_rect(r, seed, 1.2), Color("#e7d7b3"))
		draw_polyline(UiTheme._closed(UiTheme.rough_rect(r.grow(-5), seed + 1, 0.6, 4)), Color(UiTheme.RUST, 0.7), 1.6)
		var f := UiTheme.display()
		var tw := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x
		draw_string(f, Vector2(r.position.x + (r.size.x - tw) * 0.5, r.position.y + r.size.y * 0.5 + 9), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, UiTheme.INK)
