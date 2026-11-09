class_name Notebook
extends Control
## The shop: the fire-keeper's notebook, opened full screen from the HUD from
## anywhere in the forest. A charcoal leather cover, two soot-dark pages: the
## contents on the left (your embers, the chapters, how much forest is gone),
## the chapter's entries on the right in the keeper's own handwriting.

signal closed

const TABS := [
	["tools", "🔥", "Tools"],
	["upgrades", "⬆", "Upgrades"],
	["helpers", "✨", "Helpers"],
	["magic", "📺", "Free Magic"],
	["shop", "💎", "Shop"],
	["settings", "⚙", "Settings"],
]
const NOTES := {
	"tools": "Each one burns hotter. Hotter fire lights tougher trees.",
	"upgrades": "Little tricks of the trade.",
	"helpers": "Friends who like fire as much as I do.",
	"magic": "A short ad, and the old magic helps out for a while.",
	"shop": "For keepers in a hurry. Everything can be earned by burning, too.",
	"settings": "Knobs and dials.",
}

var hud                               # the Hud (untyped: it calls back into it)
var tab := "tools"
var _tab_buttons := {}
var _list: VBoxContainer
var _heading: Label
var _note: Label
var _embers: Label
var _progress: Label
var _refreshers: Array = []
var _t := 0.0
var _scroll: ScrollContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.01, 0.02, 0.6)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var cover := PanelContainer.new()
	cover.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cover.offset_left = 36
	cover.offset_right = -36
	cover.offset_top = 18
	cover.offset_bottom = -18
	var cs := UiTheme.panel(Color(0.1, 0.075, 0.07), 26, Color(UiTheme.EMBER, 0.5), 0.3, 14.0)
	cs.border_width_left = 4
	cs.border_width_right = 4
	cover.add_theme_stylebox_override("panel", cs)
	add_child(cover)
	var spread := HBoxContainer.new()
	spread.add_theme_constant_override("separation", 0)
	cover.add_child(spread)
	spread.add_child(_left_page())
	var spine := ColorRect.new()
	spine.color = Color(0.03, 0.02, 0.02)
	spine.custom_minimum_size = Vector2(10, 0)
	spread.add_child(spine)
	spread.add_child(_right_page())
	select(tab)


func _page_box(stretch: bool) -> PanelContainer:
	var p := PanelContainer.new()
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.17, 0.145, 0.14)
	s.set_corner_radius_all(10)
	s.border_color = Color(0.28, 0.23, 0.21)
	s.set_border_width_all(1)
	s.content_margin_left = 20
	s.content_margin_right = 20
	s.content_margin_top = 14
	s.content_margin_bottom = 14
	p.add_theme_stylebox_override("panel", s)
	if stretch:
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return p


func _left_page() -> Control:
	var page := _page_box(false)
	page.custom_minimum_size = Vector2(300, 0)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	page.add_child(v)
	var title := UiTheme.label(30, UiTheme.EMBER_HOT, UiTheme.hand())
	title.text = "The Fire-Keeper's\nNotebook"
	v.add_child(title)
	_embers = UiTheme.label(34, UiTheme.CREAM)
	v.add_child(_embers)
	var rule := ColorRect.new()
	rule.color = Color(UiTheme.EMBER, 0.35)
	rule.custom_minimum_size = Vector2(0, 2)
	v.add_child(rule)
	for t in TABS:
		var b := Button.new()
		b.text = "%s  %s" % [t[1], t[2]]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.custom_minimum_size = Vector2(0, 52)
		var key: String = t[0]
		b.pressed.connect(func():
			Sound.play("page", -6.0, 1.0, 0.08)
			select(key))
		v.add_child(b)
		_tab_buttons[key] = b
	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(fill)
	_progress = UiTheme.label(22, UiTheme.ASH, UiTheme.hand())
	_progress.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(_progress)
	return page


func _right_page() -> Control:
	var page := _page_box(true)
	page.clip_contents = true
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	page.add_child(v)
	var head := HBoxContainer.new()
	v.add_child(head)
	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", -6)
	head.add_child(titles)
	_heading = UiTheme.label(40, UiTheme.EMBER_HOT, UiTheme.hand())
	titles.add_child(_heading)
	_note = UiTheme.label(22, UiTheme.ASH, UiTheme.hand())
	_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_child(_note)
	var close := Button.new()
	close.text = "Close"
	close.custom_minimum_size = Vector2(150, 58)
	UiTheme.ember_button(close, UiTheme.CHARCOAL_3, 22)
	close.add_theme_color_override("font_color", UiTheme.CREAM)
	close.pressed.connect(func(): closed.emit())
	head.add_child(close)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 8)
	_scroll.add_child(_list)
	return page


func select(key: String) -> void:
	tab = key
	for k in _tab_buttons:
		var b: Button = _tab_buttons[k]
		if k == key:
			UiTheme.ember_button(b, UiTheme.EMBER, 22)
		else:
			UiTheme.ember_button(b, UiTheme.CHARCOAL_2, 22)
			b.add_theme_color_override("font_color", UiTheme.CREAM)
			b.add_theme_color_override("font_hover_color", UiTheme.EMBER_HOT)
	for t in TABS:
		if t[0] == key:
			_heading.text = "%s %s" % [t[1], t[2]]
	_note.text = NOTES[key]
	rebuild()


func rebuild() -> void:
	for c in _list.get_children():
		c.queue_free()
	_refreshers.clear()
	match tab:
		"tools":
			_build_tools()
		"upgrades":
			_build_upgrades()
		"helpers":
			_build_helpers()
		"magic":
			_build_magic()
		"shop":
			_build_shop()
		"settings":
			_build_settings()
	_scroll.scroll_vertical = 0
	refresh()


func _process(delta: float) -> void:
	_t += delta
	if _t >= 0.2:
		_t = 0.0
		refresh()


func refresh() -> void:
	_embers.text = "🔥 " + Fmt.num(GameState.embers)
	var f := GameState.forest
	if f != null:
		var z := f.zone_at(GameState.keeper.position.x, GameState.keeper.position.z) if GameState.keeper != null else 0
		_progress.text = "%d%% of the cursed forest burned.\nYou're in %s." % [int(f.progress() * 100.0), Balance.ZONES[z].name]
	for r in _refreshers:
		r.call()


# =====================================================================================
# Entries
# =====================================================================================
func _card(icon: String, title: String, desc: String) -> Dictionary:
	var p := PanelContainer.new()
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.22, 0.185, 0.175)
	s.set_corner_radius_all(14)
	s.border_color = Color(0.32, 0.26, 0.24)
	s.set_border_width_all(2)
	s.content_margin_left = 14
	s.content_margin_right = 14
	s.content_margin_top = 10
	s.content_margin_bottom = 10
	p.add_theme_stylebox_override("panel", s)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 14)
	p.add_child(h)
	var ic := UiTheme.label(42)
	ic.text = icon
	ic.custom_minimum_size = Vector2(60, 0)
	ic.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ic.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.add_child(ic)
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 0)
	h.add_child(v)
	var tl := UiTheme.label(25, UiTheme.CREAM)
	tl.text = title
	v.add_child(tl)
	var dl := UiTheme.label(18, UiTheme.ASH, UiTheme.regular())
	dl.text = desc
	dl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dl.custom_minimum_size = Vector2(260, 0)
	v.add_child(dl)
	var xl := UiTheme.label(17, UiTheme.EMBER_HOT, UiTheme.regular())
	xl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	xl.custom_minimum_size = Vector2(260, 0)
	xl.visible = false
	v.add_child(xl)
	var b := Button.new()
	b.custom_minimum_size = Vector2(200, 70)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiTheme.ember_button(b, UiTheme.EMBER, 22)
	h.add_child(b)
	_list.add_child(p)
	return {"panel": p, "style": s, "title": tl, "desc": dl, "extra": xl, "button": b, "icon": ic}


func _set_btn(card: Dictionary, text: String, enabled: bool, hot: bool = false) -> void:
	var b: Button = card.button
	if b.text != text:
		b.text = text
	b.disabled = not enabled
	var s: StyleBoxFlat = card.style
	s.border_color = Color(UiTheme.EMBER, 0.85) if hot else Color(0.32, 0.26, 0.24)
	s.shadow_color = Color(UiTheme.EMBER, 0.25 if hot else 0.0)
	s.shadow_size = 8 if hot else 0


func _extra(card: Dictionary, text: String) -> void:
	var l: Label = card.extra
	l.visible = text != ""
	if l.text != text:
		l.text = text


func _section(text: String) -> void:
	var l := UiTheme.label(26, UiTheme.EMBER, UiTheme.hand())
	l.text = text
	_list.add_child(l)


func _buy_feedback(ok: bool, what: String) -> void:
	if ok:
		Sound.play("buy", -3.0)
		hud.toast("✔ " + what)
	else:
		Sound.play("nope", -6.0)
	refresh()


func _build_tools() -> void:
	for i in Balance.TOOLS.size():
		var t: Dictionary = Balance.TOOLS[i]
		var card := _card(_tool_icon(i), t.name, t.desc)
		var idx := i
		card.button.pressed.connect(func():
			var ok := GameState.buy_tool(idx)
			_buy_feedback(ok, "%s in hand!" % t.name))
		_refreshers.append(func():
			var heat := float(t.heat) * GameState.upgrade_mult("heat")
			_extra(card, "Heat %s · lights %s" % [Fmt.num(heat), t.lights])
			if idx == GameState.tool_index:
				_set_btn(card, "In hand ✓", false)
			elif idx < GameState.tool_index:
				_set_btn(card, "Owned", false)
			elif idx == GameState.next_tool_index():
				var cost := float(t.cost)
				var can := GameState.embers >= cost
				_set_btn(card, "🔥 " + Fmt.num(cost), can, can)
			else:
				_set_btn(card, "🔒 " + Fmt.num(float(t.cost)), false)
				_extra(card, "Buy the %s first." % Balance.TOOLS[idx - 1].name))
	# Ember packs, when you're short for the next tool.
	if GameState.short_for_next_tool():
		_section("Short on embers?")
		for k in Monetization.PACK_PRODUCTS.size():
			var id: String = Monetization.PACK_PRODUCTS[k]
			var p: Dictionary = Monetization.PRODUCTS[id]
			var card := _card(["👝", "🫙", "🍲"][k], p.title, "")
			var pack := k
			card.button.pressed.connect(func(): Monetization.buy(id))
			_refreshers.append(func():
				var amount := GameState.ember_pack_amount(pack)
				card.desc.text = "+🔥 %s embers right now." % Fmt.num(amount)
				var nt := GameState.next_tool_index()
				if nt >= 0 and GameState.embers + amount >= float(Balance.TOOLS[nt].cost):
					_extra(card, "Enough for the %s!" % Balance.TOOLS[nt].name)
				else:
					_extra(card, "")
				_set_btn(card, Monetization.price(id), true))


func _tool_icon(i: int) -> String:
	return ["🔥", "🔥", "🔥", "🔥", "🐉", "☄"][i] if i < 6 else "🔥"


func _build_upgrades() -> void:
	for u in Balance.UPGRADES:
		var card := _card(u.icon, u.name, u.desc)
		var key: String = u.key
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_upgrade(key), "%s up!" % u.name))
		_refreshers.append(func():
			var lv := int(GameState.upgrade_levels[key])
			card.title.text = "%s  ·  Lv %d/%d" % [u.name, lv, int(u.max)]
			if GameState.upgrade_maxed(key):
				_set_btn(card, "MAX", false)
			else:
				var cost := GameState.upgrade_cost(key)
				var can := GameState.embers >= cost
				_set_btn(card, "🔥 " + Fmt.num(cost), can, can))


func _build_helpers() -> void:
	for i in Balance.HELPERS.size():
		var h: Dictionary = Balance.HELPERS[i]
		var card := _card(h.icon, h.name, h.desc)
		var idx := i
		card.button.pressed.connect(func():
			_buy_feedback(GameState.buy_helper(idx), "A new %s!" % h.name))
		_refreshers.append(func():
			var n := int(GameState.helper_counts[idx])
			card.title.text = "%s  ·  %d" % [h.name, n] if n > 0 else str(h.name)
			_extra(card, "Heat %s each" % Fmt.num(float(h.heat) * GameState.upgrade_mult("heat")))
			var cost := GameState.helper_cost(idx)
			var can := GameState.embers >= cost
			_set_btn(card, "🔥 " + Fmt.num(cost), can, can))


func _build_magic() -> void:
	var boost := _card("⚡", "2x fire for 5 minutes", "Everything burns twice as hot and pays twice the embers. Watch again to stack it, up to 15 minutes.")
	boost.button.pressed.connect(func(): hud.watch_ad("boost"))
	_refreshers.append(func():
		var left := GameState.boost_seconds_left()
		_extra(boost, "Running: %s left" % Fmt.duration(left) if left > 0.0 else "")
		if GameState.boost_full():
			_set_btn(boost, "Full", false)
		else:
			_set_btn(boost, "📺 Watch", not Monetization.is_watching(), hud.offers.current == "boost"))
	var rush := _card("✨", "Helpers work 3x for 3 minutes", "Your sprites and salamanders burn three times as hot, and hurry.")
	rush.button.pressed.connect(func(): hud.watch_ad("helper_rush"))
	_refreshers.append(func():
		if not GameState.has_helpers():
			_set_btn(rush, "No helpers yet", false)
			_extra(rush, "Hire a Fire Sprite first.")
		elif GameState.is_helper_rush_active():
			_set_btn(rush, Fmt.duration(GameState.helper_rush_seconds_left()), false)
			_extra(rush, "")
		else:
			_set_btn(rush, "📺 Watch", not Monetization.is_watching(), hud.offers.current == "helper_rush")
			_extra(rush, ""))
	var instant := _card("🔥", "Free embers", "")
	instant.button.pressed.connect(func(): hud.watch_ad("instant"))
	_refreshers.append(func():
		instant.desc.text = "+🔥 %s embers now (a few minutes of your burning)." % Fmt.num(GameState.instant_amount())
		var tool := AdOffers.unlocks_tool()
		_extra(instant, "Enough for the %s!" % tool if tool != "" else "")
		if not GameState.instant_ready():
			_set_btn(instant, Fmt.duration(GameState.instant_ready_at - GameState.now()), false)
		else:
			_set_btn(instant, "📺 Watch", not Monetization.is_watching(), hud.offers.current == "instant"))


func _build_shop() -> void:
	var ra := Monetization.PRODUCT_REMOVE_ADS_2X
	var card := _card("🚫", "Remove Ads + Permanent 2x", "No more ads between breaks, and everything burns 2x and pays 2x embers, forever.")
	card.button.pressed.connect(func(): Monetization.buy(ra))
	_refreshers.append(func():
		if Monetization.owns(ra):
			_set_btn(card, "Owned ✓", false)
		else:
			_set_btn(card, Monetization.price(ra), true, true))
	var sp := Monetization.PRODUCT_STARTER
	var starter := _card("🎁", "Fire-Keeper's Starter Pack", "+🔥 %s embers and the Rainbow Sparkler, a striped matchstick that fizzes in four colours. One time only." % Fmt.num(Balance.STARTER_EMBERS))
	starter.button.pressed.connect(func(): Monetization.buy(sp))
	_refreshers.append(func():
		_set_btn(starter, "Owned ✓" if Monetization.owns(sp) else Monetization.price(sp), not Monetization.owns(sp)))
	var ph := Monetization.PRODUCT_PHOENIX
	var phoenix := _card("🪶", "Phoenix Flame", "Every tool burns with golden phoenix fire, and 10% hotter.")
	phoenix.button.pressed.connect(func():
		if Monetization.owns(ph):
			GameState.phoenix_on = not GameState.phoenix_on
			refresh()
		else:
			Monetization.buy(ph))
	_refreshers.append(func():
		if Monetization.owns(ph):
			_set_btn(phoenix, "On ✓" if GameState.phoenix_on else "Off", true)
		else:
			_set_btn(phoenix, Monetization.price(ph), true))
	if GameState.owns_starter:
		var spk := _card("🎇", "Rainbow Sparkler", "Show the striped matchstick.")
		spk.button.pressed.connect(func():
			GameState.sparkler_on = not GameState.sparkler_on
			refresh())
		_refreshers.append(func(): _set_btn(spk, "On ✓" if GameState.sparkler_on else "Off", true))
	_section("Embers")
	for k in Monetization.PACK_PRODUCTS.size():
		var id: String = Monetization.PACK_PRODUCTS[k]
		var p: Dictionary = Monetization.PRODUCTS[id]
		var pc := _card(["👝", "🫙", "🍲"][k], p.title, "")
		var pack := k
		pc.button.pressed.connect(func(): Monetization.buy(id))
		_refreshers.append(func():
			pc.desc.text = "+🔥 %s embers." % Fmt.num(GameState.ember_pack_amount(pack))
			_set_btn(pc, Monetization.price(id), true))
	var restore := _card("🔄", "Restore purchases", "Already bought something on another device? Get it back here.")
	restore.button.pressed.connect(func():
		Monetization.restore()
		hud.toast("Restore requested"))
	_set_btn(restore, "Restore", true)


func _build_settings() -> void:
	var vol := _card("🔊", "Sound effects", "Crackling, whooshing, footsteps.")
	var h: HBoxContainer = vol.button.get_parent()
	var minus := Button.new()
	minus.text = "−"
	minus.custom_minimum_size = Vector2(70, 70)
	minus.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiTheme.ember_button(minus, UiTheme.CHARCOAL_3, 30)
	minus.add_theme_color_override("font_color", UiTheme.CREAM)
	h.add_child(minus)
	h.move_child(minus, vol.button.get_index())
	vol.button.custom_minimum_size = Vector2(70, 70)
	minus.pressed.connect(func():
		Sound.set_volume(Sound.volume - 0.1)
		refresh())
	vol.button.pressed.connect(func():
		Sound.set_volume(Sound.volume + 0.1)
		Sound.play("buy", -8.0)
		refresh())
	_refreshers.append(func():
		vol.title.text = "Sound effects  ·  %d%%" % int(round(Sound.volume * 100.0))
		_set_btn(vol, "+", Sound.volume < 1.0)
		minus.disabled = Sound.volume <= 0.0)
	var mute := _card("🔇", "Mute everything", "On a computer, M does this too.")
	mute.button.pressed.connect(func():
		Sound.set_muted(not Sound.muted)
		refresh())
	_refreshers.append(func(): _set_btn(mute, "Unmute" if Sound.muted else "Mute", true))
	if OS.is_debug_build() or OS.has_feature("playtest"):
		_section("Developer tools (playtest builds only)")
		var cash := _card("💰", "Free embers", "Adds 10x your embers (at least 1K).")
		cash.button.pressed.connect(func():
			GameState.grant_embers(maxf(1000.0, GameState.embers * 10.0))
			refresh())
		_set_btn(cash, "Add", true)
		var speed := _card("⏩", "Fire speed", "Multiplies all tool and helper heat, for testing.")
		speed.button.pressed.connect(func():
			GameState.debug_speed = 1.0 if GameState.debug_speed >= 100.0 else GameState.debug_speed * 10.0
			refresh())
		_refreshers.append(func(): _set_btn(speed, "x%d" % int(GameState.debug_speed), true))
		var burn := _card("🔥", "Burn this ring", "Everything in the ring you're standing in catches at once.")
		burn.button.pressed.connect(func():
			var f := GameState.forest
			f.burn_everything_in_zone(f.zone_at(GameState.keeper.position.x, GameState.keeper.position.z))
			closed.emit())
		_set_btn(burn, "Burn", true)
		var ads := _card("📊", "Fake ads and purchases", "")
		_refreshers.append(func():
			var c: Dictionary = Monetization.provider.get("counts") if Monetization.provider.get("counts") != null else {}
			ads.desc.text = "Rewarded %d · interstitial %d · purchases %d" % [int(c.get("rewarded", 0)), int(c.get("interstitial", 0)), int(c.get("purchases", 0))]
			_set_btn(ads, "—", false))
		var wipe := _card("🗑", "Start over", "A fresh cursed forest. Keeps purchases.")
		wipe.button.pressed.connect(func():
			GameState.wipe_save()
			get_tree().reload_current_scene())
		_set_btn(wipe, "Wipe", true)
