extends Node
## Autoload "Sound": every sound effect and the ambience, all synthesised by
## tools/make_audio.py into res://audio/.
##
## One-off sounds: play() / play_at(). The continuous ones are worked out every
## frame: the fire's crackle and roar (how much is burning near the giant, set by
## the world in `fire_near`), the tool's own loop while you hold it, the running
## fan and the warehouse's room tone. Loops are mixed by Godot ("stream"
## playback) rather than as Web Audio samples, which loop with a gap on the web.
## Volume and mute live in user://settings.cfg, apart from the save.

const DIR := "res://audio/"
const SETTINGS_PATH := "user://settings.cfg"
const LOOPS := ["crackle", "roar", "sizzle", "candle", "torch", "warehouse", "fan"]
const TOOL_LOOP := ["sizzle", "candle", "torch", ""]

var volume := 0.85
var muted := false
var fire_near := 0.0
var fan_level := 0.3
var tool_on := false
var tool_index := 0

var _bank := {}
var _voices: Array = []
var _voices3d: Array = []
var _next := 0
var _next3d := 0
var _cooldown := {}
var _loops := {}
var _clock := 0.0
var _hush := false
var _was_tool := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_load_settings()
	for _i in 12:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_voices.append(p)
	for _i in 10:
		var p := AudioStreamPlayer3D.new()
		p.bus = "SFX"
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		p.max_distance = 60.0
		p.unit_size = 6.0
		add_child(p)
		_voices3d.append(p)
	for name in LOOPS:
		var s := _stream(name)
		if s == null:
			continue
		if s is AudioStreamOggVorbis:
			(s as AudioStreamOggVorbis).loop = true
		var p := AudioStreamPlayer.new()
		p.stream = s
		p.bus = "Fire" if name in ["crackle", "roar"] else "SFX"
		p.volume_db = -80.0
		p.playback_type = AudioServer.PLAYBACK_TYPE_STREAM
		add_child(p)
		_loops[name] = p
	_apply_volume()


func _stream(name: String) -> AudioStream:
	if _bank.has(name):
		var list: Array = _bank[name]
		return null if list.is_empty() else list[randi() % list.size()]
	var list: Array = []
	if ResourceLoader.exists(DIR + name + ".ogg"):
		list.append(load(DIR + name + ".ogg"))
	else:
		var i := 1
		while ResourceLoader.exists(DIR + "%s_%d.ogg" % [name, i]):
			list.append(load(DIR + "%s_%d.ogg" % [name, i]))
			i += 1
	if list.is_empty():
		push_warning("Sound: no audio called '%s'" % name)
	_bank[name] = list
	return null if list.is_empty() else list[randi() % list.size()]


func _gap_ok(name: String, gap: float) -> bool:
	if gap <= 0.0:
		return true
	if _clock < float(_cooldown.get(name, -1.0)):
		return false
	_cooldown[name] = _clock + gap
	return true


func play(name: String, db: float = 0.0, pitch: float = 1.0, pitch_rand: float = 0.0, gap: float = 0.0) -> void:
	if _hush or not _gap_ok(name, gap):
		return
	var s := _stream(name)
	if s == null:
		return
	var p: AudioStreamPlayer = _voices[_next]
	_next = (_next + 1) % _voices.size()
	p.stream = s
	p.volume_db = db
	p.pitch_scale = maxf(0.05, pitch * (1.0 + randf_range(-pitch_rand, pitch_rand)))
	p.play()


func play_at(name: String, at: Vector3, db: float = 0.0, pitch: float = 1.0, pitch_rand: float = 0.08, gap: float = 0.0) -> void:
	if _hush or not at.is_finite() or not _gap_ok(name, gap):
		return
	var s := _stream(name)
	if s == null:
		return
	var p: AudioStreamPlayer3D = _voices3d[_next3d]
	_next3d = (_next3d + 1) % _voices3d.size()
	p.stream = s
	p.global_position = at
	p.volume_db = db
	p.pitch_scale = maxf(0.05, pitch * (1.0 + randf_range(-pitch_rand, pitch_rand)))
	p.play()


func _loop(name: String, level: float, pitch: float = 1.0, rate: float = 4.0, delta: float = 0.016) -> void:
	var p: AudioStreamPlayer = _loops.get(name)
	if p == null:
		return
	var want := -80.0 if level <= 0.001 or _hush else linear_to_db(level)
	var cur := p.volume_db
	var step := rate * 60.0 * delta
	p.volume_db = move_toward(cur, want, step) if want > cur else move_toward(cur, want, step * 0.5)
	p.pitch_scale = lerpf(p.pitch_scale, pitch, minf(1.0, delta * 3.0))
	if p.volume_db > -60.0 and not p.playing:
		p.play(randf() * 1.5)
	elif p.volume_db <= -79.0 and p.playing:
		p.stop()


func _process(delta: float) -> void:
	_clock += delta
	_hush = Monetization.is_showing_ad() or _web_hidden()
	var f := clampf(fire_near / 30.0, 0.0, 1.0)
	_loop("crackle", 0.12 + 0.7 * sqrt(f) if fire_near > 0.3 else 0.0, 1.0, 4.0, delta)
	_loop("roar", clampf((fire_near - 18.0) / 90.0, 0.0, 0.8), 0.9 + 0.2 * f, 3.0, delta)
	_loop("warehouse", 0.42, 1.0, 1.0, delta)
	_loop("fan", fan_level, 0.9 + fan_level * 0.3, 1.0, delta)
	var want: String = TOOL_LOOP[clampi(tool_index, 0, TOOL_LOOP.size() - 1)]
	for name in ["sizzle", "candle", "torch"]:
		_loop(name, 0.5 if tool_on and name == want else 0.0, 1.0, 10.0, delta)
	if tool_on and not _was_tool and tool_index < 3:
		play("tool_on", -6.0, 1.0, 0.08)
	_was_tool = tool_on


var _web_t := 0.0
var _web_was := false


func _web_hidden() -> bool:
	if not OS.has_feature("web"):
		return false
	_web_t -= get_process_delta_time()
	if _web_t <= 0.0:
		_web_t = 0.5
		var v = JavaScriptBridge.eval("document.hidden", true)
		_web_was = v == true
	return _web_was


func stop_all() -> void:
	## Silence everything at once (tests call this before quitting).
	for p in _voices:
		(p as AudioStreamPlayer).stop()
	for p in _voices3d:
		(p as AudioStreamPlayer3D).stop()
	for name in _loops:
		(_loops[name] as AudioStreamPlayer).stop()
	_bank.clear()


func set_volume(v: float) -> void:
	volume = snappedf(clampf(v, 0.0, 1.0), 0.1)
	_apply_volume()
	_save_settings()


func set_muted(m: bool) -> void:
	muted = m
	_apply_volume()
	_save_settings()


func _apply_volume() -> void:
	var idx := AudioServer.get_bus_index("Master")
	AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(volume, 0.0001)))
	AudioServer.set_bus_mute(idx, muted or volume <= 0.0)


func _load_settings() -> void:
	var c := ConfigFile.new()
	if c.load(SETTINGS_PATH) == OK:
		volume = float(c.get_value("sound", "volume", volume))
		muted = bool(c.get_value("sound", "muted", false))


func _save_settings() -> void:
	var c := ConfigFile.new()
	c.set_value("sound", "volume", volume)
	c.set_value("sound", "muted", muted)
	c.save(SETTINGS_PATH)
