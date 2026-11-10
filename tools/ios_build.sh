#!/bin/bash
# Builds one game for iPhone and iPad. Needs a Mac with Xcode (the iOS workflow runs it).
#
#   tools/ios_build.sh <slug> check        unsigned build: proves the game compiles and packages for iOS
#   tools/ios_build.sh <slug> testflight   signs with the App Store Connect API key and uploads to TestFlight
#
# Environment:
#   GODOT          path to the Godot binary for this game (required): the version in
#                  games/<slug>/godot_version.txt, or 4.4.1 when there is none
#   FLAVOR         release (default for check) or playtest (default for testflight).
#                  playtest = developer tools and pretend ads and purchases, for trying a
#                  game on a real phone. release = what goes to the App Store; an upload
#                  is refused until store/<slug>/ios.json says "real_monetization": true,
#                  so a build with pretend ads can never be the one sent to review.
#                  An upload of the release flavor also needs tests/release_check.gd to pass
#                  (every store id filled in) when the game has one.
#   VERSION        version shown on the App Store (default 1.0.0)
#   BUILD_NUMBER   must go up with every upload (default 1)
#   WORK           scratch folder (default: a new temp folder)
#   testflight only: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the .p8 text, or base64 of it), APPLE_TEAM_ID
#
# Games with native plugins (addons/admob, addons/godotx_revenue_cat) get their iOS
# halves from tools/fetch_plugins.sh (versions pinned in tools/plugin_versions.env).
#
# Nothing here submits an app for review. An upload lands in TestFlight; sending
# a build to App Review stays a manual step in App Store Connect.
set -euo pipefail

slug="${1:?usage: tools/ios_build.sh <slug> check|testflight}"
mode="${2:-check}"
root="$(cd "$(dirname "$0")/.." && pwd)"
game="$root/games/$slug"

case "$slug" in *[!a-z0-9-]*|"") echo "Bad game name: $slug" >&2; exit 2;; esac
case "$mode" in check|testflight) ;; *) echo "Mode must be check or testflight" >&2; exit 2;; esac
[ -f "$game/project.godot" ] || { echo "No game at games/$slug" >&2; exit 2; }
: "${GODOT:?set GODOT to the Godot binary for this game}"
want_godot="4.4.1"
if [ -f "$game/godot_version.txt" ]; then want_godot="$(tr -d '[:space:]' < "$game/godot_version.txt")"; fi
have_godot="$("$GODOT" --version 2>/dev/null | head -1)"
case "$have_godot" in
  "$want_godot".stable*) ;;
  *) echo "$slug needs Godot $want_godot, but GODOT is $have_godot" >&2; exit 2;;
esac
has_plugins=false
if [ -f "$game/addons/admob/plugin.cfg" ] || [ -f "$game/addons/godotx_revenue_cat/plugin.cfg" ]; then has_plugins=true; fi

if [ "$mode" = "testflight" ]; then FLAVOR="${FLAVOR:-playtest}"; else FLAVOR="${FLAVOR:-release}"; fi
case "$FLAVOR" in release|playtest) ;; *) echo "FLAVOR must be release or playtest" >&2; exit 2;; esac
VERSION="${VERSION:-1.0.0}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
WORK="${WORK:-$(mktemp -d)}"
mkdir -p "$WORK"
logs="$WORK/logs"; mkdir -p "$logs"

say() { printf '\n== %s\n' "$*"; }

# Runs xcodebuild quietly into a log; on failure prints the errors and the tail.
xcb() {
  local log="$1"; shift
  if xcodebuild "$@" > "$log" 2>&1; then
    grep -E '^\*\* .* \*\*$' "$log" | tail -1 || true
    return 0
  fi
  echo "xcodebuild failed. Errors:" >&2
  grep -nE 'error:|errors? generated|\*\* .*FAILED \*\*|Provisioning|No profiles|No signing|requires a' "$log" | head -60 >&2 || true
  echo "--- last lines of $(basename "$log") ---" >&2
  tail -40 "$log" >&2
  return 1
}

team="0000000000"
if [ "$mode" = "testflight" ]; then
  missing=""
  for v in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8 APPLE_TEAM_ID; do
    eval "val=\${$v:-}"
    [ -n "$val" ] || missing="$missing $v"
  done
  if [ -n "$missing" ]; then
    echo "Can't sign: these repository secrets are not set:$missing" >&2
    echo "The owner adds them under Settings > Secrets and variables > Actions (see STUDIO.md, App Store pipeline)." >&2
    exit 3
  fi
  team="$APPLE_TEAM_ID"
fi

say "Xcode"
xcodebuild -version

if $has_plugins; then
  say "Native plugins (iOS)"
  bash "$root/tools/fetch_plugins.sh" "$slug" ios
fi

say "Import $slug (Godot $want_godot)"
"$GODOT" --headless --path "$game" --import > "$logs/import.log" 2>&1 || { tail -30 "$logs/import.log"; exit 1; }

if [ -f "$game/tests/smoke_test.gd" ]; then
  say "Smoke test"
  "$GODOT" --headless --path "$game" -s res://tests/smoke_test.gd > "$logs/smoke.log" 2>&1 || { tail -40 "$logs/smoke.log"; echo "Smoke test failed: not building." >&2; exit 1; }
  tail -2 "$logs/smoke.log" | cut -c1-200
fi

if [ -f "$game/tests/monetization_test.gd" ]; then
  say "Ads and purchases test"
  "$GODOT" --headless --path "$game" -s res://tests/monetization_test.gd > "$logs/monetization.log" 2>&1 || { tail -40 "$logs/monetization.log"; echo "Ads and purchases test failed: not building." >&2; exit 1; }
  grep -E 'MONETIZATION TEST' "$logs/monetization.log" | tail -1
fi

say "Xcode project"
python3 "$root/tools/ios_preset.py" "$game" --team "$team" --version "$VERSION" --build "$BUILD_NUMBER" --flavor "$FLAVOR" --out "$WORK/xcode" > "$WORK/vars.txt"
if [ "$mode" = "testflight" ] && [ "$FLAVOR" = "release" ] && ! grep -q '^real_monetization=true$' "$WORK/vars.txt"; then
  echo "Refusing to upload a release build of $slug: its ads and purchases are still pretend." >&2
  echo "Upload the playtest flavor to try it on a phone. Once the real ad and purchase code is in," >&2
  echo "set \"real_monetization\": true in store/$slug/ios.json (see STUDIO.md, App Store pipeline)." >&2
  exit 4
fi
if [ -f "$game/tests/release_check.gd" ] && [ "$FLAVOR" = "release" ]; then
  say "Release check (store ids)"
  if "$GODOT" --headless --path "$game" -s res://tests/release_check.gd -- iOS > "$logs/release_check.log" 2>&1; then
    grep -E '^Release check' "$logs/release_check.log" || true
  else
    grep -E '^Release check|^  - ' "$logs/release_check.log" || tail -20 "$logs/release_check.log"
    if [ "$mode" = "testflight" ]; then
      echo "Refusing to upload a release build of $slug while store ids are placeholders (store/README.md says where each comes from)." >&2
      exit 4
    fi
    echo "(Unsigned check build: carrying on. A TestFlight upload of the release flavor would stop here.)"
  fi
fi
name="$(grep '^name=' "$WORK/vars.txt" | cut -d= -f2-)"
bundle_id="$(grep '^bundle_id=' "$WORK/vars.txt" | cut -d= -f2-)"
export_path="$(grep '^export_path=' "$WORK/vars.txt" | cut -d= -f2-)"
"$GODOT" --headless --path "$game" --export-release "iOS" "$export_path" > "$logs/export.log" 2>&1 || { grep -iE 'error' "$logs/export.log" | head -20; tail -20 "$logs/export.log"; exit 1; }
project="$WORK/xcode/$name.xcodeproj"
[ -d "$project" ] || { echo "Godot did not write $name.xcodeproj" >&2; tail -30 "$logs/export.log" >&2; exit 1; }
echo "$name.xcodeproj  ($bundle_id, version $VERSION build $BUILD_NUMBER, $FLAVOR)"
if [ -f "$game/addons/admob/plugin.cfg" ]; then
  grep -rqs GADApplicationIdentifier "$WORK/xcode/$name/$name-Info.plist" || { echo "AdMob's app id is missing from the Info.plist (is the AdMob editor plugin enabled in project.godot?)" >&2; exit 1; }
  grep -qs SKAdNetworkItems "$WORK/xcode/$name/$name-Info.plist" || echo "note: no SKAdNetworkItems in the Info.plist"
  [ -f "$WORK/xcode/admob_spm/Package.swift" ] || { echo "AdMob's Swift package (Google Mobile Ads) was not written" >&2; exit 1; }
  # The AdMob plugin links its Swift package into the project while Godot exports
  # (only on a Mac: Godot calls that hook on macOS alone).
  grep -q 'XCLocalSwiftPackageReference "admob_spm"' "$project/project.pbxproj" || { echo "AdMob's Swift package is not linked in the Xcode project" >&2; exit 1; }
  echo "AdMob: app id, Swift package and libraries in the Xcode project"
fi
if grep -q '^plugins=.*GodotxRevenueCat' "$WORK/vars.txt"; then
  grep -qs GodotxRevenueCat "$project/project.pbxproj" || { echo "RevenueCat is not linked in the Xcode project (did tools/fetch_plugins.sh run?)" >&2; exit 1; }
  echo "RevenueCat: linked in the Xcode project"
fi

# Reads one Info.plist value from a built .app.
plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1/Info.plist" 2>/dev/null || true; }

check_app() {
  local app="$1"
  [ -d "$app" ] || { echo "No app at $app" >&2; exit 1; }
  local got_id got_ver got_build
  got_id="$(plist "$app" CFBundleIdentifier)"
  got_ver="$(plist "$app" CFBundleShortVersionString)"
  got_build="$(plist "$app" CFBundleVersion)"
  echo "name on the home screen: $(plist "$app" CFBundleDisplayName)"
  echo "bundle id: $got_id   version: $got_ver ($got_build)   minimum iOS: $(plist "$app" MinimumOSVersion)"
  echo "orientations: $(plist "$app" UISupportedInterfaceOrientations | tr -d '\n' | tr -s ' ')"
  echo "architectures: $(lipo -archs "$app/$name" 2>/dev/null || echo unknown)"
  echo "size: $(du -sh "$app" | cut -f1)"
  [ "$got_id" = "$bundle_id" ] || { echo "Bundle id is $got_id, expected $bundle_id" >&2; exit 1; }
  [ "$got_ver" = "$VERSION" ] || { echo "Version is $got_ver, expected $VERSION" >&2; exit 1; }
  [ "$got_build" = "$BUILD_NUMBER" ] || { echo "Build is $got_build, expected $BUILD_NUMBER" >&2; exit 1; }
  [ -f "$app/$name.pck" ] || { echo "The game data ($name.pck) is missing from the app" >&2; exit 1; }
  [ -f "$app/PrivacyInfo.xcprivacy" ] || { echo "The privacy manifest is missing from the app" >&2; exit 1; }
  # The marketing icon must be in the compiled asset catalog.
  [ -f "$app/Assets.car" ] || { echo "No compiled asset catalog (icons) in the app" >&2; exit 1; }
}

common=(-project "$project" -scheme "$name" -configuration Release -sdk iphoneos -destination "generic/platform=iOS"
  -skipPackagePluginValidation -skipMacroValidation)
unsigned=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=)

if [ "$mode" = "check" ]; then
  say "Unsigned build"
  xcb "$logs/build.log" "${common[@]}" -derivedDataPath "$WORK/dd" build "${unsigned[@]}"
  check_app "$WORK/dd/Build/Products/Release-iphoneos/$name.app"
  say "OK: $slug builds for iOS (unsigned check, nothing uploaded)"
  exit 0
fi

# ---- testflight ------------------------------------------------------------------------
keydir="$WORK/key"; mkdir -p "$keydir"; chmod 700 "$keydir"
key="$keydir/AuthKey_${ASC_KEY_ID}.p8"
cleanup() { rm -rf "$keydir"; }
trap cleanup EXIT
umask 077
case "$ASC_KEY_P8" in
  *"BEGIN PRIVATE KEY"*) printf '%s\n' "$ASC_KEY_P8" > "$key" ;;
  *) printf '%s' "$ASC_KEY_P8" | base64 --decode > "$key" 2>/dev/null || { echo "ASC_KEY_P8 is neither the .p8 text nor base64 of it" >&2; exit 3; } ;;
esac
grep -q "BEGIN PRIVATE KEY" "$key" || { echo "ASC_KEY_P8 does not look like an App Store Connect .p8 key" >&2; exit 3; }
auth=(-allowProvisioningUpdates -authenticationKeyPath "$key" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

cat > "$WORK/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

archive="$WORK/$name.xcarchive"
upload() {
  xcb "$1" -exportArchive -archivePath "$archive" -exportOptionsPlist "$WORK/ExportOptions.plist" -exportPath "$WORK/export" "${auth[@]}"
}

# First try: archive without signing, then let Xcode sign for the App Store with
# a cloud-managed certificate while it uploads. This needs no certificate or
# device on the build machine.
say "Archive (unsigned)"
xcb "$logs/archive.log" "${common[@]}" -archivePath "$archive" archive "${unsigned[@]}"
check_app "$archive/Products/Applications/$name.app"
say "Sign and upload to TestFlight"
if upload "$logs/upload.log"; then
  say "OK: $slug $VERSION ($BUILD_NUMBER) uploaded. It shows in TestFlight after Apple finishes processing."
  exit 0
fi

# Second try: archive with Xcode's automatic signing, then upload.
say "Retry: archive with automatic signing"
rm -rf "$archive" "$WORK/export"
xcb "$logs/archive_signed.log" "${common[@]}" -archivePath "$archive" archive "${auth[@]}" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic
check_app "$archive/Products/Applications/$name.app"
say "Sign and upload to TestFlight"
upload "$logs/upload_signed.log"
say "OK: $slug $VERSION ($BUILD_NUMBER) uploaded. It shows in TestFlight after Apple finishes processing."
