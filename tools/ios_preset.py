#!/usr/bin/env python3
"""Adds (or replaces) the "iOS" export preset in a game's export_presets.cfg.

The iOS preset is generated at build time instead of being kept in each game
folder, so every game gets the same, reviewed App Store settings and nothing
about the Apple account is ever committed.

Usage:
  python3 tools/ios_preset.py games/<slug> --team <TEAM_ID> [--version 1.0.0] [--build 1]
                              [--flavor release|playtest] [--out <dir>] [--print-only]

It prints the path to pass to Godot, e.g.:
  godot --headless --path games/<slug> --export-release "iOS" <printed path>

What it sets (see STUDIO.md, "App Store pipeline"):
  - bundle id com.gamequarry.<slug without dashes>, or "bundle_id" from store/<slug>/ios.json
  - export_project_only: Godot writes the Xcode project, the workflow builds and signs it
  - flavor "release": no "playtest" feature tag, so no developer tools.
    flavor "playtest": the tag is set (developer tools, pretend ads and purchases),
    for trying a game on a real phone through TestFlight before its store setup exists
  - purpose strings for the camera, microphone and photo APIs the engine links (never shown: the games don't ask)
  - the privacy manifest reasons for the system APIs the engine itself touches
  - store/<slug>/icon_1024.png as the app icon when it exists (otherwise the project icon)
  - iOS plugins listed in ios.json ("plugins": ["name", ...]) switched on, plus any extra Info.plist lines

  - the game's own export filter (its "Web" preset's exclude_filter, which keeps
    tests and the plugins' editor-only parts out), with tests/* always excluded
  - minimum iOS 15.0 for games on Godot 4.7 or later (games/<slug>/godot_version.txt;
    the 4.7 iOS template and the AdMob SDK need it), 14.0 for older ones

Per-game App Store settings live outside the game folders, in store/<slug>/ at
the top of the repo. Optional store/<slug>/ios.json keys: bundle_id, min_ios,
plugins, plist_extra, iphone_only (true to drop iPad), tracking_enabled,
tracking_domains, real_monetization (see tools/ios_build.sh).

The file it edits is not meant to be committed with the iOS preset in it:
run it in CI, or on a scratch copy of the game folder.
"""
import argparse
import json
import os
import re
import sys

PRESET_NAME = "iOS"
PLACEHOLDER_TEAM = "0000000000"  # for unsigned check builds only
DEFAULT_GODOT_VERSION = "4.4.1"  # a game without games/<slug>/godot_version.txt


def read_godot_version(game_dir):
    path = os.path.join(game_dir, "godot_version.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            v = f.read().strip()
        if not re.fullmatch(r"\d+\.\d+(\.\d+)?", v):
            sys.exit(f"Bad godot_version.txt: {v!r}")
        return v
    return DEFAULT_GODOT_VERSION


def version_tuple(v):
    return tuple(int(x) for x in v.split("."))


def web_exclude_filter(cfg_text):
    """The exclude_filter of the game's Web preset (what it already keeps out of a build)."""
    for block in split_presets(cfg_text).values():
        if re.search(r'^platform="Web"\s*$', block, re.M):
            m = re.search(r'^exclude_filter="(.*)"\s*$', block, re.M)
            if m:
                return m.group(1)
    return ""


def read_project_name(game_dir):
    with open(os.path.join(game_dir, "project.godot"), encoding="utf-8") as f:
        m = re.search(r'^config/name="(.*)"\s*$', f.read(), re.M)
    if not m:
        sys.exit("No config/name in project.godot")
    return m.group(1)


def xcode_name(title):
    """A plain ASCII name for the Xcode project, scheme and files."""
    words = re.findall(r"[A-Za-z0-9]+", title)
    name = "".join(w[:1].upper() + w[1:] for w in words)
    return name or "Game"


def split_presets(text):
    """Returns the cfg text split into {index: block_text} keeping original order."""
    blocks = {}
    current = None
    for line in text.splitlines(keepends=True):
        m = re.match(r"^\[preset\.(\d+)(\.options)?\]\s*$", line)
        if m:
            current = int(m.group(1))
            blocks.setdefault(current, "")
        if current is not None:
            blocks[current] += line
    return blocks


def cfg_str(value):
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("game_dir")
    ap.add_argument("--team", default=PLACEHOLDER_TEAM, help="Apple team id (a placeholder is fine for unsigned check builds)")
    ap.add_argument("--version", default="1.0.0", help="version shown on the App Store")
    ap.add_argument("--build", default="1", help="build number; must go up with every upload")
    ap.add_argument("--flavor", choices=["release", "playtest"], default="release")
    ap.add_argument("--out", default=None, help="folder for the Xcode project (default: <game>/build/ios)")
    ap.add_argument("--print-only", action="store_true", help="print the preset instead of writing it")
    args = ap.parse_args()

    game_dir = os.path.abspath(args.game_dir)
    slug = os.path.basename(game_dir.rstrip("/"))
    title = read_project_name(game_dir)
    name = xcode_name(title)
    godot_version = read_godot_version(game_dir)
    default_min_ios = "15.0" if version_tuple(godot_version) >= (4, 7) else "14.0"

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    store_dir = os.path.join(repo_root, "store", slug)
    store = {}
    store_path = os.path.join(store_dir, "ios.json")
    if os.path.exists(store_path):
        with open(store_path, encoding="utf-8") as f:
            store = json.load(f)

    bundle_id = store.get("bundle_id") or "com.gamequarry." + slug.replace("-", "")
    if not re.fullmatch(r"[A-Za-z0-9.-]+", bundle_id):
        sys.exit(f"Bad bundle id: {bundle_id}")
    if not re.fullmatch(r"\d+(\.\d+){0,2}", args.version):
        sys.exit(f"Bad version (want 1, 1.2 or 1.2.3): {args.version}")
    if not re.fullmatch(r"\d+(\.\d+){0,2}", str(args.build)):
        sys.exit(f"Bad build number: {args.build}")
    if not re.fullmatch(r"[A-Z0-9]{10}", args.team):
        sys.exit("Bad team id (want 10 letters and digits)")

    cfg_path = os.path.join(game_dir, "export_presets.cfg")
    text = ""
    if os.path.exists(cfg_path):
        with open(cfg_path, encoding="utf-8") as f:
            text = f.read()
    excludes = [e.strip() for e in web_exclude_filter(text).split(",") if e.strip()]
    if "tests/*" not in excludes:
        excludes.insert(0, "tests/*")
    exclude_filter = ", ".join(excludes)
    if '"' in exclude_filter or "\n" in exclude_filter:
        sys.exit("Bad exclude_filter in the Web preset")

    out_dir = os.path.abspath(args.out) if args.out else os.path.join(game_dir, "build", "ios")
    export_path = os.path.join(out_dir, name + ".xcodeproj")

    # Godot's own Info.plist already answers the encryption question
    # (ITSAppUsesNonExemptEncryption = false), so nothing is added for it here.
    plist = store.get("plist_extra", "")

    options = [
        ("custom_template/debug", '""'),
        ("custom_template/release", '""'),
        ("architectures/arm64", "true"),
        ("application/app_store_team_id", cfg_str(args.team)),
        ("application/export_method_release", "0"),
        ("application/targeted_device_family", "0" if store.get("iphone_only") else "2"),
        ("application/bundle_identifier", cfg_str(bundle_id)),
        ("application/short_version", cfg_str(args.version)),
        ("application/version", cfg_str(str(args.build))),
        ("application/min_ios_version", cfg_str(store.get("min_ios", default_min_ios))),
        ("application/additional_plist_content", cfg_str(plist)),
        ("application/export_project_only", "true"),
        # A development identity keeps Xcode's signing style on Automatic; the
        # App Store signature is applied when the archive is exported.
        ("application/code_sign_identity_release", cfg_str("iPhone Developer")),
        # The engine links the camera, microphone and photo APIs whether a game
        # uses them or not, and Apple refuses builds whose purpose strings are
        # empty. The games never ask for these, so the text is never shown.
        ("privacy/camera_usage_description", cfg_str("This game does not use the camera.")),
        ("privacy/microphone_usage_description", cfg_str("This game does not use the microphone.")),
        ("privacy/photolibrary_usage_description", cfg_str("This game does not use your photos.")),
        ("application/delete_old_export_files_unconditionally", "true"),
        # Privacy manifest: why the engine touches these system APIs.
        # file timestamps: shown/used inside the app's own container (DDA9.1 + C617.1)
        ("privacy/file_timestamp_access_reasons", "3"),
        # boot time: measuring elapsed time on the device (35F9.1)
        ("privacy/system_boot_time_access_reasons", "1"),
        # disk space: writing the save file (E174.1 + 85F4.1)
        ("privacy/disk_space_access_reasons", "3"),
        # user defaults: the app's own settings (CA92.1)
        ("privacy/user_defaults_access_reasons", "4"),
        ("privacy/tracking_enabled", "true" if store.get("tracking_enabled") else "false"),
    ]
    domains = store.get("tracking_domains") or []
    options.append(("privacy/tracking_domains",
                    "PackedStringArray(" + ", ".join(cfg_str(d) for d in domains) + ")"))

    icon = os.path.join(store_dir, "icon_1024.png")
    if os.path.exists(icon):
        options.append(("icons/icon_1024x1024", cfg_str(icon)))

    for plugin in store.get("plugins", []):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", plugin):
            sys.exit(f"Bad plugin name: {plugin}")
        options.append((f"plugins/{plugin}", "true"))

    blocks = split_presets(text)

    # Drop an existing iOS preset, keep the others, renumber from 0.
    kept = [b for _, b in sorted(blocks.items())
            if not re.search(r'^name="%s"\s*$' % re.escape(PRESET_NAME), b, re.M)]
    renumbered = []
    for i, b in enumerate(kept):
        renumbered.append(re.sub(r"^\[preset\.\d+(\.options)?\]", lambda m: f"[preset.{i}{m.group(1) or ''}]", b, flags=re.M))
    n = len(renumbered)

    preset = (
        f"[preset.{n}]\n\n"
        f'name="{PRESET_NAME}"\n'
        'platform="iOS"\n'
        "runnable=true\n"
        "advanced_options=true\n"
        "dedicated_server=false\n"
        f'custom_features="{"playtest" if args.flavor == "playtest" else ""}"\n'
        'export_filter="all_resources"\n'
        'include_filter=""\n'
        f'exclude_filter="{exclude_filter}"\n'
        f"export_path={cfg_str(export_path)}\n"
        'encryption_include_filters=""\n'
        'encryption_exclude_filters=""\n'
        "encrypt_pck=false\n"
        "encrypt_directory=false\n"
        "script_export_mode=2\n\n"
        f"[preset.{n}.options]\n\n"
        + "".join(f"{k}={v}\n" for k, v in options)
    )

    if args.print_only:
        sys.stdout.write(preset)
        return

    body = "".join(b if b.endswith("\n") else b + "\n" for b in renumbered)
    if body and not body.endswith("\n\n"):
        body += "\n"
    with open(cfg_path, "w", encoding="utf-8") as f:
        f.write(body + preset)
    os.makedirs(out_dir, exist_ok=True)

    # Lines the workflow reads (key=value).
    print(f"name={name}")
    print(f"title={title}")
    print(f"bundle_id={bundle_id}")
    print(f"export_path={export_path}")
    print(f"out_dir={out_dir}")
    print(f"flavor={args.flavor}")
    print(f"godot_version={godot_version}")
    print(f"plugins={','.join(store.get('plugins', []))}")
    print(f"real_monetization={'true' if store.get('real_monetization') else 'false'}")


if __name__ == "__main__":
    main()
