extends SceneTree
## Loads every script so parse errors show up in one run.

func _initialize() -> void:
	var bad := 0
	for dir in ["res://scripts", "res://scripts/ui", "res://scripts/monetization", "res://scripts/audio", "res://tests"]:
		for f in DirAccess.get_files_at(dir):
			if f.ends_with(".gd"):
				var s = load(dir + "/" + f)
				if s == null:
					bad += 1
					print("FAILED ", f)
	print("parse check done, failures: ", bad)
	quit()
