class_name Helpers
extends Node3D
## Pelicans (rescue stranded creatures) and salvage crabs (pick up exposed
## finds and wreck loads). Each one claims a job, travels there, does it and
## comes home; trip time comes from GameState.helper_trip (Rescue nets,
## helper rush and the permanent 2x make them quicker).

signal job_done(kind: String, index: int)

var world                         # World (actions: rescue / salvage)
var home := Vector3(21.0, 6.0, 52.0)
var crab_home := Vector3(10.0, 1.0, 46.0)
var units: Array = []             # {"key", "node", "state", "from", "to", "t", "dur", "job"}
var _claimed := {}                # "c:3" / "f:2" / "w:1" -> true


func setup(w, aquarium_pos: Vector3) -> void:
	world = w
	home = aquarium_pos + Vector3(0, 7.0, -2.0)
	sync()


func sync() -> void:
	for key in ["pelican", "crab"]:
		var have := 0
		for u in units:
			if u.key == key:
				have += 1
		while have < GameState.helper_count(key):
			var n := Models.instance("pelican" if key == "pelican" else "crab_helper")
			add_child(n)
			var start := home if key == "pelican" else crab_home
			n.position = start + Vector3(randf_range(-2, 2), 0, randf_range(-2, 2))
			units.append({"key": key, "node": n, "state": "idle", "from": n.position, "to": n.position,
				"t": 0.0, "dur": 1.0, "job": "", "wait": randf() * 2.0})
			have += 1


func _speed(key: String) -> float:
	# A round trip of ~45 m in `trip` seconds.
	return 90.0 / GameState.helper_trip(key)


func update(delta: float, now: float) -> void:
	for u in units:
		var n: Node3D = u.node
		match str(u.state):
			"idle":
				u.wait = float(u.wait) - delta
				if float(u.wait) <= 0.0:
					u.wait = 0.8
					_find_job(u)
				if u.key == "pelican":
					var a := now * 0.5 + float(n.get_instance_id() % 100)
					n.position = home + Vector3(cos(a) * 4.0, sin(now * 1.3) * 0.4, sin(a) * 4.0)
					n.rotation.y = -a + PI
					_flap(n, now, 1.0)
			"out", "back":
				u.t = float(u.t) + delta
				var k := clampf(float(u.t) / float(u.dur), 0.0, 1.0)
				var e := k * k * (3.0 - 2.0 * k)
				var p := (u.from as Vector3).lerp(u.to, e)
				if u.key == "pelican":
					p.y += sin(k * PI) * 4.0
					_flap(n, now, 1.6)
				else:
					p.y = world.bay.height_at(p.x, p.z) + 0.05
				var dir: Vector3 = (u.to as Vector3) - (u.from as Vector3)
				if dir.length() > 0.1:
					n.rotation.y = atan2(-dir.x, -dir.z)
				n.position = p
				if k >= 1.0:
					if u.state == "out":
						_arrive(u)
					else:
						u.state = "idle"
						u.wait = 0.5
			"work":
				u.t = float(u.t) + delta
				if float(u.t) > 0.5:
					_go(u, home if u.key == "pelican" else crab_home, "back")


func _flap(n: Node3D, now: float, speed: float) -> void:
	var wl := Models.find(n, "WingL")
	var wr := Models.find(n, "WingR")
	if wl != null:
		wl.rotation.z = sin(now * 7.0 * speed) * 0.5
	if wr != null:
		wr.rotation.z = -sin(now * 7.0 * speed) * 0.5


func _go(u: Dictionary, to: Vector3, state: String) -> void:
	u.from = (u.node as Node3D).position
	u.to = to
	u.t = 0.0
	u.dur = maxf(0.6, (u.from as Vector3).distance_to(to) / _speed(str(u.key)))
	u.state = state


func _find_job(u: Dictionary) -> void:
	var from: Vector3 = (u.node as Node3D).position
	var best := ""
	var best_d := 1e9
	var best_pos := Vector3.ZERO
	if u.key == "pelican":
		for i in world.creatures.stranded_list():
			var id := "c:%d" % i
			if _claimed.has(id):
				continue
			var p: Vector3 = world.creatures.spots[i].pos
			var d := p.distance_to(from)
			if d < best_d:
				best_d = d
				best = id
				best_pos = p
	else:
		for f in world.finds.exposed_list():
			var id := "f:%d" % f
			if _claimed.has(id):
				continue
			var p: Vector3 = world.finds.spots[f].pos
			var d := p.distance_to(from)
			if d < best_d:
				best_d = d
				best = id
				best_pos = p
		for w in world.finds.wrecks.size():
			if not world.finds.wreck_ready(w):
				continue
			var id := "w:%d" % w
			if _claimed.has(id):
				continue
			var p: Vector3 = world.finds.wrecks[w].pos
			var d := p.distance_to(from)
			if d < best_d:
				best_d = d
				best = id
				best_pos = p
	if best == "":
		return
	_claimed[best] = true
	u.job = best
	_go(u, best_pos + Vector3(0, 0.4, 0), "out")


func _arrive(u: Dictionary) -> void:
	var job := str(u.job)
	_claimed.erase(job)
	u.job = ""
	u.state = "work"
	u.t = 0.0
	var parts := job.split(":")
	var idx := int(parts[1])
	match parts[0]:
		"c":
			if world.creatures.is_stranded(idx):
				world.rescue_creature(idx, true)
				job_done.emit("rescue", idx)
		"f":
			if world.finds.is_exposed(idx):
				world.salvage_find(idx, true)
				job_done.emit("find", idx)
		"w":
			if world.finds.wreck_ready(idx):
				world.salvage_wreck(idx, true)
				job_done.emit("wreck", idx)
