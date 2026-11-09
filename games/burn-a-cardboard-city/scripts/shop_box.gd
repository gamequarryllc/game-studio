class_name ShopBox
extends Control
## The shop is a cardboard box. It slides up from the bottom of the screen and its
## flaps swing open; inside, divider tabs (tools, upgrades, helpers, free stuff,
## the shop, finds, settings, and dev boosts in playtest builds) and paper cards
## taped in, each with a price tag on a string.

signal closed

const TABS := [
	["tools", "magnifier", "Tools"],
	["upgrades", "heat", "Upgrades"],
	["helpers", "windup", "Helpers"],
	["free", "tv", "Free stuff"],
	["shop", "gift", "Shop"],
	["finds", "duck", "Finds"],
	["settings", "gear", "Settings"],
]
const NOTES := {
	"tools": "Each one burns hotter. Thicker card needs a hotter tool.",
	"upgrades": "Little tricks of the trade.",
	"helpers": "Toys that like fire as much as you do.",
	"free": "Watch a short ad and get a hand for a while.",
	"shop": "For giants in a hurry. Everything here can be earned by burning, too.",
	"finds": "Things that were in the boxes.",
	"settings": "Knobs and dials.",
	"dev": "Playtest builds only. None of this is in the real game.",
}

var hud
var tab := "tools"
var _tab_buttons := {}
var _list: GridContainer
var _note: Label
var _coins: Label
var _refreshers: Array = []
var _t := 0.0
var _open := 0.0
var _scroll: ScrollContainer
var _box: PanelContainer
var _flaps: Flaps
var _card_seed := 100


class Flaps:
	extends Control
	## The box's two top flaps, swinging open about the top edge.
	var open := 0.0
	var box_rect := Rect2()

	func _draw() -> void:
		var top := box_rect.position.y + 4.0
		var x0 := box_rect.position.x + 10.0
		var x1 := box_rect.end.x - 10.0
		var mid := (x0 + x1) * 0.5
		var h := minf(130.0, box_rect.size.y * 0.3)
		# Closed (angle 180) the flaps lie down over the front; open they stand up and splay out.
		var a := deg_to_rad(lerpf(180.0, 48.0, open))
		for side in [-1.0, 1.0]:
			var ha := Vector2(x0 if side < 0 else mid + 4.0, top)
			var hb := Vector2(mid - 4.0 if side < 0 else x1, top)
			var out := Vector2(side * sin(a) * 70.0, -cos(a) * h)
			var lean := Vector2(side * sin(a) * 24.0, 0)
			var pts := PackedVector2Array([ha, hb, hb + out + lean * (0.3 if side < 0 else 1.0), ha + out + lean * (1.0 if side < 0 else 0.3)])
			var inside := cos(a) > 0.0
			var col := Craft.KRAFT.darkened(0.18) if inside else Craft.KRAFT
			var sh := PackedVector2Array()
			for p in pts:
				sh.append(p + Vector2(4, 5))
			draw_colored_polygon(sh, Color(0, 0, 0, 0.25))
			draw_colored_polygon(pts, col)
			var closed_pts := pts.duplicate()
			closed_pts.append(pts[0])
			draw_polyline(closed_pts, Craft.KRAFT_DARK.darkened(0.2), 2.5, true)
			# The corrugated cut edge along the free side.
			var e0 := pts[2]
			var e1 := pts[3]
			for k in 18:
				var p := e0.lerp(e1, (k + 0.5) / 18.0)
				draw_line(p, p + Vector2(0, 3.0 if k % 2 == 0 else -3.0), Craft.KRAFT_PALE, 2.0)


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.07, 0.08, 0.1, 0.55)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	_flaps = Flaps.new()
	_flaps.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_flaps.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_flaps)
	_box = PanelContainer.new()
	var bs := Craft.card(Craft.KRAFT, 77, 0)
	bs.content_margin_left = 26
	bs.content_margin_right = 26
	bs.content_margin_top = 18
	bs.content_margin_bottom = 14
	bs.wobble = 4.0
	_box.add_theme_stylebox_override("panel", bs)
	_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_box.offset_left = 44
	_box.offset_right = -44
	_box.offset_top = 92
	_box.offset_bottom = 30
	add_child(_box)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	_box.add_child(v)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 14)
	v.add_child(head)
	var title := Craft.label(36)
	title.text = "The box"
	title.rotation = -0.03
	head.add_child(title)
	head.add_child(Craft.icon_rect("coin", 40))
	_coins = Craft.label(34)
	head.add_child(_coins)
	var fill := Control.new()
	fill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(fill)
	var close := Button.new()
	close.text = "Close"
	close.icon = Craft.icon("close")
	Craft.tag_button(close, Craft.PAPER, 24, 78)
	close.custom_minimum_size = Vector2(0, 54)
	close.pressed.connect(func(): closed.emit())
	head.add_child(close)
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 6)
	v.add_child(tabs)
	var all := TABS.duplicate()
	if GameState.dev_enabled():
		all.append(["dev", "gear", "Dev"])
	for t in all:
		var b := Button.new()
		b.text = t[2]
		b.icon = Craft.icon(t[1])
		b.custom_minimum_size = Vector2(0, 46)
		var key: String = t[0]
		b.pressed.connect(func():
			Sound.play("tape", -10.0, 1.0, 0.1)
			select(key))
		tabs.add_child(b)
		_tab_buttons[key] = b
	_note = Craft.body(21, Color(Craft.INK, 0.8))
	v.add_child(_note)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(_scroll)
	_list = GridContainer.new()
	_list.columns = 2
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("h_separation", 14)
	_list.add_theme_constant_override("v_separation", 12)
	_scroll.add_child(_list)
	select(tab)
	_box.position.y += 400.0


func _process(delta: float) -> void:
	# Slides up with a little overshoot, then the flaps swing open.
	_open = minf(1.0, _open + delta * 2.6)
	var u := clampf(_open * 1.6, 0.0, 1.0)
	var back := 1.0 + 2.2 * pow(u - 1.0, 3.0) + 1.2 * pow(u - 1.0, 2.0)
	_box.offset_top = 92.0 + (1.0 - back) * 420.0
	_box.offset_bottom = 30.0 + (1.0 - back) * 420.0
	var f := clampf((_open - 0.35) / 0.65, 0.0, 1.0)
	_flaps.open = 1.0 - pow(1.0 - f, 3.0) * (1.0 - 0.0) + sin(f * PI) * 0.06
	_flaps.box_rect = Rect2(Vector2(44 + 0.0, _box.offset_top), Vector2(size.x - 88, size.y))
	_flaps.queue_redraw()
	_t += delta
	if _t >= 0.2:
		_t = 0.0
		refresh()


func select(key: String) -> void:
	tab = key
	for k in _tab_buttons:
		var b: Button = _tab_buttons[k]
		Craft.tag_button(b, Craft.PAPER if k == key else Craft.KRAFT_PALE, 18, 90 + _tab_buttons.keys().find(k))
		b.add_theme_constant_override("icon_max_width", 24)
		for st in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
			var sb := b.get_theme_stylebox(st) as CardStyle
			sb.content_margin_left = 10
			sb.content_margin_right = 10
		b.rotation = -0.03 if k == key else 0.0
	_note.text = NOTES.get(key, "")
	rebuild()


func rebuild() -> void:
	for c in _list.get_children():
		c.queue_free()
	_refreshers.clear()
	_card_seed = 100
	match tab:
		"tools":
			_build_tools()
		"upgrades":
			_build_upgrades()
		"helpers":
			_build_helpers()
		"free":
			_build_free()
		"shop":
			_build_shop()
		"finds":
			_build_finds()
		"settings":
			_build_settings()
		"dev":
			_build_dev()
	_scroll.scroll_vertical = 0
	refresh()


func refresh() -> void:
	_coins.text = Fmt.num(GameState.coins)
	for r in _refreshers:
		r.call()


# =====================================================================================
# Cards
# =====================================================================================
func _card(icon: String, title: String, desc: String) -> Dictionary:
	_card_seed += 1
	var p := PanelContainer.new()
	var s := Craft.paper(_card_seed, 1 if _card_seed % 3 == 0 else (3 if _card_seed % 3 == 1 else 0))
	s.content_margin_left = 14
	s.content_margin_right = 14
	s.content_margin_top = 12
	s.content_margin_bottom = 10
	p.add_theme_stylebox_override("panel", s)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p.custom_minimum_size = Vector2(500, 0)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	p.add_child(h)
	var ic := Craft.icon_rect(icon, 62)
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(ic)
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 0)
	h.add_child(v)
	var tl := Craft.label(25)
	tl.text = title
	v.add_child(tl)
	var dl := Craft.body(20, Color(Craft.INK, 0.85))
	dl.text = desc
	dl.custom_minimum_size = Vector2(220, 0)
	v.add_child(dl)
	var xl := Craft.body(19, Craft.FLAME_DEEP)
	xl.custom_minimum_size = Vector2(220, 0)
	xl.visible = false
	v.add_child(xl)
	var b := Button.new()
	b.custom_minimum_size = Vector2(150, 60)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	Craft.price_button(b, _card_seed + 300)
	h.add_child(b)
	_list.add_child(p)
	return {"panel": p, "title": tl, "desc": dl, "extra": xl, "button": b, "icon": ic}


func _set_btn(card: Dictionary, text: String, enabled: bool, hot: bool = false, icon: String = "") -> void:
	var b: Button = card.button
	if b.text != text:
		b.text = text
	var tex: Texture2D = Craft.icon(icon) if icon != "" else null
	if b.icon != tex:
		b.icon = tex
	b.disabled = not enabled
	Craft.hot(b, hot and enabled)


func _extra(card: Dictionary, text: String) -> void:
	var l: Label = card.extra
	l.visible = text != ""
	if l.text != text:
		l.text = text


func _section(text: String) -> void:
	var l := Craft.label(26, Craft.INK)
	l.text = text
	l.rotation = -0.02
	_list.add_child(l)
	_list.add_child(Control.new())


func _buy_feedback(ok: bool, what: String) -> void:
	if ok:
		Sound.play("buy", -3.0)
		hud.toast(what)
	else:
		Sound.play("nope", -6.0)
	refresh()


func _build_tools() -> void:
	for i in Balance.TOOLS.size():
		var t: Dictionary = Balance.TOOLS[i]
		var card := _card(str(t.key), str(t.name), str(t.desc))
		var idx := i
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_tool(idx), "%s in hand" % t.name))
		_refreshers.append(func():
			_extra(card, "Lights %s" % t.lights)
			if idx == GameState.tool_index:
				_set_btn(card, "In hand", false, false, "check")
			elif idx < GameState.tool_index:
				_set_btn(card, "Owned", false, false, "check")
			elif idx == GameState.next_tool_index():
				var cost := float(t.cost)
				var can := GameState.coins >= cost
				_set_btn(card, Fmt.num(cost), can, can, "coin")
			else:
				_set_btn(card, Fmt.num(float(t.cost)), false, false, "lock")
				_extra(card, "Buy the %s first" % str(Balance.TOOLS[idx - 1].name).to_lower()))
	if GameState.short_for_next_tool():
		_section("Short of coins?")
		_packs(true)


func _packs(only_useful: bool) -> void:
	var icons := ["sock_coins", "jar", "shoebox"]
	for k in Monetization.PACK_PRODUCTS.size():
		var id: String = Monetization.PACK_PRODUCTS[k]
		var p: Dictionary = Monetization.PRODUCTS[id]
		var card := _card(icons[k], str(p.title), "")
		var pack := k
		card.button.pressed.connect(func(): Monetization.buy(id))
		_refreshers.append(func():
			var amount := GameState.coin_pack_amount(pack)
			card.desc.text = "+%s coins, right now." % Fmt.num(amount)
			var nt := GameState.next_tool_index()
			if nt >= 0 and GameState.coins + amount >= float(Balance.TOOLS[nt].cost):
				_extra(card, "Enough for the %s" % str(Balance.TOOLS[nt].name).to_lower())
			else:
				_extra(card, "")
			_set_btn(card, Monetization.price(id), true))


func _build_upgrades() -> void:
	for u in Balance.UPGRADES:
		var card := _card(str(u.key), str(u.name), str(u.desc))
		var key: String = u.key
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_upgrade(key), "%s, level %d" % [u.name, int(GameState.upgrade_levels[key])]))
		_refreshers.append(func():
			var lv := int(GameState.upgrade_levels[key])
			card.title.text = "%s  %d/%d" % [u.name, lv, int(u.max)]
			if GameState.upgrade_maxed(key):
				_set_btn(card, "Full", false, false, "check")
			else:
				var cost := GameState.upgrade_cost(key)
				var can := GameState.coins >= cost
				_set_btn(card, Fmt.num(cost), can, can, "coin"))


func _build_helpers() -> void:
	for i in Balance.HELPERS.size():
		var h: Dictionary = Balance.HELPERS[i]
		var card := _card(str(h.key), str(h.name), str(h.desc))
		var idx := i
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_helper(idx), "Another %s" % str(h.name).to_lower()))
		_refreshers.append(func():
			var n := int(GameState.helper_counts[idx])
			card.title.text = "%s  x%d" % [h.name, n] if n > 0 else str(h.name)
			var cost := GameState.helper_cost(idx)
			var can := GameState.coins >= cost
			_set_btn(card, Fmt.num(cost), can, can, "coin"))


func _build_free() -> void:
	var boost := _card("flame", "2x fire for 5 minutes", "Everything burns twice as hot and pays twice the coins. Watch again to stack it, up to 15 minutes.")
	boost.button.pressed.connect(func(): hud.watch_ad("boost"))
	_refreshers.append(func():
		var left := GameState.boost_seconds_left()
		_extra(boost, "Running: %s left" % Fmt.duration(left) if left > 0.0 else "")
		if GameState.boost_full():
			_set_btn(boost, "Full", false)
		else:
			_set_btn(boost, "Watch", not Monetization.is_watching(), hud.offers.current == "boost", "tv"))
	var rush := _card("windup", "Helpers 3x for 3 minutes", "Your wind-up cars and paper planes burn three times as hot, and hurry.")
	rush.button.pressed.connect(func(): hud.watch_ad("helper_rush"))
	_refreshers.append(func():
		if not GameState.has_helpers():
			_set_btn(rush, "No helpers", false)
			_extra(rush, "Get a wind-up car first")
		elif GameState.is_helper_rush_active():
			_set_btn(rush, Fmt.duration(GameState.helper_rush_seconds_left()), false)
			_extra(rush, "")
		else:
			_set_btn(rush, "Watch", not Monetization.is_watching(), hud.offers.current == "helper_rush", "tv")
			_extra(rush, ""))
	var instant := _card("coin", "Free coins", "")
	instant.button.pressed.connect(func(): hud.watch_ad("instant"))
	_refreshers.append(func():
		instant.desc.text = "+%s coins now, about three minutes of burning." % Fmt.num(GameState.instant_amount())
		var tool := AdOffers.unlocks_tool()
		_extra(instant, "Enough for the %s" % tool.to_lower() if tool != "" else "")
		if not GameState.instant_ready():
			_set_btn(instant, Fmt.duration(GameState.instant_ready_at - GameState.now()), false)
		else:
			_set_btn(instant, "Watch", not Monetization.is_watching(), hud.offers.current == "instant", "tv"))


func _build_shop() -> void:
	var ra := Monetization.PRODUCT_REMOVE_ADS_2X
	var card := _card("noads", "No ads, and 2x for good", "No more ads between breaks, and everything burns twice as hot and pays twice the coins, forever.")
	card.button.pressed.connect(func(): Monetization.buy(ra))
	_refreshers.append(func():
		if Monetization.owns(ra):
			_set_btn(card, "Yours", false, false, "check")
		else:
			_set_btn(card, Monetization.price(ra), true, true))
	var sp := Monetization.PRODUCT_STARTER
	var starter := _card("gift", "Starter pack", "+%s coins and party sparks: every tool throws sparks in every colour of the felt-tip set. One time only." % Fmt.num(Balance.STARTER_COINS))
	starter.button.pressed.connect(func(): Monetization.buy(sp))
	_refreshers.append(func():
		_set_btn(starter, "Yours" if Monetization.owns(sp) else Monetization.price(sp), not Monetization.owns(sp), false, "check" if Monetization.owns(sp) else ""))
	var gl := Monetization.PRODUCT_GOLDEN
	var golden := _card("lens", "The golden lens", "A magnifying glass that belonged to someone important. Every tool burns with gold fire, 10% hotter.")
	golden.button.pressed.connect(func():
		if Monetization.owns(gl):
			GameState.golden_on = not GameState.golden_on
			refresh()
		else:
			Monetization.buy(gl))
	_refreshers.append(func():
		if Monetization.owns(gl):
			_set_btn(golden, "On" if GameState.golden_on else "Off", true)
		else:
			_set_btn(golden, Monetization.price(gl), true))
	if GameState.owns_starter:
		var party := _card("gift", "Party sparks", "Sparks in every colour.")
		party.button.pressed.connect(func():
			GameState.party_on = not GameState.party_on
			refresh())
		_refreshers.append(func(): _set_btn(party, "On" if GameState.party_on else "Off", true))
	_section("Coins")
	_packs(false)
	var restore := _card("restore", "Restore purchases", "Bought something on another device? Get it back here.")
	restore.button.pressed.connect(func():
		Monetization.restore()
		hud.toast("Asked the store for your purchases"))
	_set_btn(restore, "Restore", true)


func _build_finds() -> void:
	var all: Array = Balance.FINDS.duplicate()
	all.append({"key": "ticket", "name": "A golden ticket"})
	for f in all:
		var key: String = f.key
		var n := int(GameState.finds.get(key, 0))
		var card := _card(key, str(f.name) if n > 0 else "Not found yet", "Found %d" % n if n > 0 else "Keep burning. Finds pop out of buildings as they fall.")
		card.button.visible = false
		if n == 0:
			(card.icon as TextureRect).modulate = Color(0.2, 0.18, 0.16, 0.35)


func _build_settings() -> void:
	var vol := _card("speaker", "Sound", "Crackling, crumpling, coins.")
	var h: HBoxContainer = vol.button.get_parent()
	var minus := Button.new()
	minus.text = "-"
	minus.custom_minimum_size = Vector2(64, 60)
	minus.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	Craft.tag_button(minus, Craft.PAPER, 30, 201)
	h.add_child(minus)
	h.move_child(minus, vol.button.get_index())
	vol.button.custom_minimum_size = Vector2(64, 60)
	minus.pressed.connect(func():
		Sound.set_volume(Sound.volume - 0.1)
		refresh())
	vol.button.pressed.connect(func():
		Sound.set_volume(Sound.volume + 0.1)
		Sound.play("coin", -8.0)
		refresh())
	_refreshers.append(func():
		vol.title.text = "Sound  %d%%" % int(round(Sound.volume * 100.0))
		_set_btn(vol, "+", Sound.volume < 1.0)
		minus.disabled = Sound.volume <= 0.0)
	var mute := _card("mute", "Mute everything", "On a computer, M does this too.")
	mute.button.pressed.connect(func():
		Sound.set_muted(not Sound.muted)
		refresh())
	_refreshers.append(func(): _set_btn(mute, "Unmute" if Sound.muted else "Mute", true))


func _build_dev() -> void:
	## Dev boosts for playtesting (the `playtest` feature tag only).
	var speed := _card("fan", "Time scale", "Everything runs faster (Engine.time_scale).")
	speed.button.pressed.connect(func():
		var steps := [1.0, 5.0, 10.0, 50.0]
		var k := steps.find(Engine.time_scale)
		Engine.time_scale = steps[(k + 1) % steps.size()]
		refresh())
	_refreshers.append(func(): _set_btn(speed, "%dx" % int(Engine.time_scale), true))
	var income := _card("coins", "Income", "Multiplies every coin the fire pays.")
	income.button.pressed.connect(func():
		GameState.dev_income = 1.0 if GameState.dev_income >= 100.0 else GameState.dev_income * 10.0
		refresh())
	_refreshers.append(func(): _set_btn(income, "x%d" % int(GameState.dev_income), true))
	var cash := _card("coin", "Give coins", "Adds ten times what you have (at least 1K).")
	cash.button.pressed.connect(func():
		GameState.grant_coins(maxf(1000.0, GameState.coins * 10.0))
		refresh())
	_set_btn(cash, "Add", true)
	var unlock := _card("lock", "Unlock everything", "Every tool, upgrades to 5, three of each helper.")
	unlock.button.pressed.connect(func():
		GameState.dev_unlock_everything()
		refresh())
	_set_btn(unlock, "Unlock", true)
	for z in [1, 2, 3]:
		var zone: int = z
		var skip := _card(["house", "office", "skyscraper", "castle"][z], "Skip to %s" % str(Balance.ZONES[z].short).to_lower(),
			"Everything outside it has burned. You get the tool it needs.")
		skip.button.pressed.connect(func():
			hud.world.skip_to_district(zone)
			closed.emit())
		_set_btn(skip, "Go", true)
	var burn := _card("flame", "Burn this district", "Everything in the district you're standing in catches at once.")
	burn.button.pressed.connect(func():
		var g: Node3D = hud.giant
		var c: CityGrid = hud.city
		var cell := c.cell_at(g.position.x, g.position.z)
		var z := Balance.zone_for_cell(cell % c.n, cell / c.n) if cell >= 0 else 0
		c.burn_zone(z)
		closed.emit())
	_set_btn(burn, "Burn", true)
	var ads := _card("tv", "Fake ads and purchases", "")
	_refreshers.append(func():
		var cnt = Monetization.provider.get("counts")
		var c: Dictionary = cnt if cnt != null else {}
		ads.desc.text = "Rewarded %d, interstitial %d, purchases %d" % [int(c.get("rewarded", 0)), int(c.get("interstitial", 0)), int(c.get("purchases", 0))]
		ads.button.visible = false)
	var wipe := _card("restore", "Start over", "A fresh city. Keeps purchases.")
	wipe.button.pressed.connect(func():
		Engine.time_scale = 1.0
		GameState.wipe_save()
		get_tree().reload_current_scene())
	_set_btn(wipe, "Reset", true)
