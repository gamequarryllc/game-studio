extends SceneTree
## Store builds run this before they're made, and stop while anything is still
## a placeholder:
##   godot --headless -s res://tests/release_check.gd -- iOS
## Lists every missing id and where it goes (store/README.md, "Burn Down a Forest",
## says where each one comes from). tools/ios_build.sh runs it for every iOS build:
## a TestFlight upload of the release flavor refuses to go on while it fails; the
## unsigned check build only prints the list.
## Adapted from the studio's reference game. Untyped on purpose: this compiles
## before the GameState autoload exists.


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var os_name: String = args[0] if args.size() > 0 else "iOS"
	var Config = load("res://scripts/monetization/store_config.gd")
	var missing: PackedStringArray = Config.missing_for_release(os_name)
	# Every product id must be "<bundle id>.<key>" (ids can't repeat across the account's apps).
	var Mon = load("res://scripts/monetization/monetization.gd")
	for id in Mon.PRODUCTS:
		if not str(id).begins_with(Config.BUNDLE_ID + "."):
			missing.append("product id %s does not start with %s." % [id, Config.BUNDLE_ID])
	# The store listing must name the same bundle id and products.
	var listing_path := ProjectSettings.globalize_path("res://").path_join("../../store/burn-down-a-forest/listing.json").simplify_path()
	var listing = JSON.parse_string(FileAccess.get_file_as_string(listing_path)) if FileAccess.file_exists(listing_path) else null
	if listing is Dictionary:
		if str(listing.get("bundle_id", "")) != Config.BUNDLE_ID:
			missing.append("store/burn-down-a-forest/listing.json bundle_id is not %s" % Config.BUNDLE_ID)
		for p in listing.get("products", []):
			if not Mon.PRODUCTS.has(Config.product_id(str(p.get("key", "")))):
				missing.append("listing.json product '%s' has no product in the game" % p.get("key", ""))
	# A store build must not carry the developer tools (the `playtest` feature).
	var presets := ConfigFile.new()
	if presets.load("res://export_presets.cfg") == OK:
		for section in presets.get_sections():
			if str(presets.get_value(section, "platform", "")) == os_name \
					and str(presets.get_value(section, "custom_features", "")).contains("playtest"):
				missing.append("the %s export preset has the 'playtest' feature (developer tools, pretend ads)" % os_name)
	if missing.is_empty():
		print("Release check (%s): every store id is filled in." % os_name)
		quit(0)
		return
	print("Release check (%s) FAILED. Still to fill in:" % os_name)
	for m in missing:
		print("  - " + m)
	quit(1)
