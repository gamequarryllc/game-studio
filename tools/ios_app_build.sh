#!/bin/bash
# Builds one app (an Expo project in apps/<slug>/) for iPhone. Needs a Mac with
# Xcode, Node and CocoaPods (the "iOS app build" workflow runs it).
#
#   tools/ios_app_build.sh <slug> check        unsigned build: proves the app compiles and packages for iPhone
#   tools/ios_app_build.sh <slug> testflight   signs with the App Store Connect API key and uploads to TestFlight
#
# Environment:
#   FLAVOR         release (default for check) or playtest (default for testflight).
#                  playtest = the Developer section is in the app (pretend Pro, the sample
#                  data), for trying it on a real phone before the store key exists.
#                  release = what goes to the App Store; an upload is refused until the
#                  app's own release check passes (`npm run check:release`: the store key is in).
#   VERSION        version shown in TestFlight and on the App Store (default 1.0.0)
#   BUILD_NUMBER   must go up with every upload (default 1)
#   WORK           scratch folder (default: a new temp folder)
#   testflight only: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the .p8 text, or base64 of it), APPLE_TEAM_ID
#
# The Xcode project is never kept in the repo: `expo prebuild` writes it from
# app.json each time (apps/<slug>/ios is ignored by git).
#
# Nothing here submits an app for review. An upload lands in TestFlight; sending
# a build to App Review stays a manual step in App Store Connect.
set -euo pipefail

slug="${1:?usage: tools/ios_app_build.sh <slug> check|testflight}"
mode="${2:-check}"
root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/apps/$slug"

case "$slug" in *[!a-z0-9-]*|"") echo "Bad app name: $slug" >&2; exit 2;; esac
case "$mode" in check|testflight) ;; *) echo "Mode must be check or testflight" >&2; exit 2;; esac
[ -f "$app/app.json" ] && [ -f "$app/package.json" ] || { echo "No app at apps/$slug" >&2; exit 2; }

if [ "$mode" = "testflight" ]; then FLAVOR="${FLAVOR:-playtest}"; else FLAVOR="${FLAVOR:-release}"; fi
case "$FLAVOR" in release|playtest) ;; *) echo "FLAVOR must be release or playtest" >&2; exit 2;; esac
VERSION="${VERSION:-1.0.0}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
echo "$VERSION" | grep -Eq '^[0-9]+(\.[0-9]+){0,2}$' || { echo "VERSION must look like 1.0.0" >&2; exit 2; }
echo "$BUILD_NUMBER" | grep -Eq '^[0-9]+$' || { echo "BUILD_NUMBER must be a whole number" >&2; exit 2; }
WORK="${WORK:-$(mktemp -d)}"
mkdir -p "$WORK"
logs="$WORK/logs"; mkdir -p "$logs"

say() { printf '\n== %s\n' "$*"; }

# Runs a command quietly into a log; on failure prints the errors and the tail.
quiet() {
  local log="$1"; shift
  if "$@" > "$log" 2>&1; then return 0; fi
  echo "$1 failed. Errors:" >&2
  grep -nE 'error:|errors? generated|\*\* .*FAILED \*\*|Provisioning|No profiles|No signing|requires a|\[!\]' "$log" | head -60 >&2 || true
  echo "--- last lines of $(basename "$log") ---" >&2
  tail -40 "$log" >&2
  return 1
}
xcb() {
  local log="$1"; shift
  quiet "$log" xcodebuild "$@" || return 1
  grep -E '^\*\* .* \*\*$' "$log" | tail -1 || true
}

if [ "$mode" = "testflight" ]; then
  missing=""
  for v in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8 APPLE_TEAM_ID; do
    eval "val=\${$v:-}"
    [ -n "$val" ] || missing="$missing $v"
  done
  if [ -n "$missing" ]; then
    echo "Can't sign: these repository secrets are not set:$missing" >&2
    echo "The owner adds them under Settings > Secrets and variables > Actions (see store/README.md)." >&2
    exit 3
  fi
fi

bundle="$(node -e 'console.log(require(process.argv[1]).expo.ios.bundleIdentifier)' "$app/app.json")"
[ "$bundle" = "com.gamequarry.$(echo "$slug" | tr -d '-')" ] || { echo "app.json has bundle id $bundle, expected com.gamequarry.<slug without dashes>" >&2; exit 2; }

say "Tools"
xcodebuild -version
echo "node $(node --version), CocoaPods $(pod --version)"

say "Install the app's packages"
(cd "$app" && quiet "$logs/npm.log" npm ci --no-audit --no-fund)

if [ "$mode" = "testflight" ] && [ "$FLAVOR" = "release" ]; then
  say "Release check"
  # A build for the store must be able to sell and restore Pro.
  (cd "$app" && npm run --silent check:release) || {
    echo "Refusing to upload a release build of $slug: its release check did not pass." >&2
    echo "Upload the playtest flavor to try the app on a phone." >&2
    exit 4
  }
fi

# The playtest flavor is the same app with its Developer section left in. The
# flag is read when the JavaScript is bundled, during the Xcode build.
rm -f "$app/.env.local"
if [ "$FLAVOR" = "playtest" ]; then
  export EXPO_PUBLIC_PLAYTEST=1
  echo "EXPO_PUBLIC_PLAYTEST=1" > "$app/.env.local"
else
  unset EXPO_PUBLIC_PLAYTEST
fi

say "Write the Xcode project (expo prebuild)"
rm -rf "$app/ios"
(cd "$app" && APP_VERSION="$VERSION" APP_BUILD_NUMBER="$BUILD_NUMBER" CI=1 quiet "$logs/prebuild.log" npx expo prebuild --platform ios --no-install)

say "Install the native libraries (pod install)"
(cd "$app/ios" && quiet "$logs/pods.log" pod install)

workspace="$(ls -d "$app"/ios/*.xcworkspace | head -1)"
[ -d "$workspace" ] || { echo "pod install made no workspace" >&2; exit 1; }
name="$(basename "$workspace" .xcworkspace)"
echo "name on the phone: $name"
echo "bundle id: $bundle"
echo "version: $VERSION ($BUILD_NUMBER), flavor: $FLAVOR"

plist_value() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true; }

# Looks inside a built .app: the things App Store Connect or a phone would trip over.
check_app() {
  local built="$1"
  [ -d "$built" ] || { echo "No app at $built" >&2; exit 1; }
  local info="$built/Info.plist"
  [ "$(plist_value "$info" CFBundleIdentifier)" = "$bundle" ] || { echo "The built app has bundle id $(plist_value "$info" CFBundleIdentifier)" >&2; exit 1; }
  # The version and build number come from the app's app.config.js (APP_VERSION,
  # APP_BUILD_NUMBER). An upload with the wrong ones would be refused by Apple
  # or shadow an earlier build; a check build only needs to say so.
  local got_version got_build
  got_version="$(plist_value "$info" CFBundleShortVersionString)"; got_build="$(plist_value "$info" CFBundleVersion)"
  if [ "$got_version" != "$VERSION" ] || [ "$got_build" != "$BUILD_NUMBER" ]; then
    if [ "$mode" = "testflight" ]; then
      echo "The built app is version $got_version ($got_build), wanted $VERSION ($BUILD_NUMBER): its app.config.js must read APP_VERSION and APP_BUILD_NUMBER (see apps/home-inventory/app.config.js)" >&2; exit 1
    fi
    echo "::warning title=$slug::The built app is version $got_version ($got_build), not $VERSION ($BUILD_NUMBER). Its app.config.js must read APP_VERSION and APP_BUILD_NUMBER before a TestFlight upload (see apps/home-inventory/app.config.js)."
  fi
  [ -s "$built/main.jsbundle" ] || { echo "The app's JavaScript (main.jsbundle) is missing from the app" >&2; exit 1; }
  if [ ! -f "$built/PrivacyInfo.xcprivacy" ]; then
    # Apple asks every app to say why it uses certain system calls (React Native uses several).
    # A playtest or check build can do without; a store build cannot.
    if [ "$mode" = "testflight" ] && [ "$FLAVOR" = "release" ]; then
      echo "The privacy manifest is missing from the app: add ios.privacyManifests to app.json (see apps/home-inventory/app.json)" >&2; exit 1
    fi
    echo "::warning title=$slug::No privacy manifest in the app. Add ios.privacyManifests to app.json before a store build (see apps/home-inventory/app.json)."
  fi
  [ -f "$built/Assets.car" ] || { echo "No compiled asset catalog (icons) in the app" >&2; exit 1; }
  # An app that takes photos must say why, in its own words.
  if grep -q '"expo-image-picker"' "$app/app.json" && [ -z "$(plist_value "$info" NSCameraUsageDescription)" ]; then
    echo "The app uses the camera but has no camera permission text" >&2; exit 1
  fi
  if [ -n "$(plist_value "$info" NSMicrophoneUsageDescription)" ]; then echo "The app asks for the microphone, which it never uses" >&2; exit 1; fi
  if [ -n "$(plist_value "$info" NSUserTrackingUsageDescription)" ]; then echo "The app has a tracking prompt; the apps track nothing" >&2; exit 1; fi
  local archs; archs="$(lipo -archs "$built/$(plist_value "$info" CFBundleExecutable)")"
  echo "architectures: $archs"
  [ "$archs" = "arm64" ] || { echo "Expected an arm64 app" >&2; exit 1; }
  echo "minimum iOS: $(plist_value "$info" MinimumOSVersion)"
  echo "size: $(du -sh "$built" | cut -f1) (unsigned, uncompressed)"
}

common=(-workspace "$workspace" -scheme "$name" -configuration Release -sdk iphoneos -destination "generic/platform=iOS")
unsigned=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=)

if [ "$mode" = "check" ]; then
  say "Unsigned build"
  xcb "$logs/build.log" "${common[@]}" -derivedDataPath "$WORK/dd" build "${unsigned[@]}"
  check_app "$WORK/dd/Build/Products/Release-iphoneos/$name.app"
  say "OK: $slug builds for iPhone (unsigned check, nothing uploaded)"
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
if [ -d "$app/targets" ]; then
  # An app with extensions (a widget, Screen Time) needs its entitlements: the
  # App Group they share, and Apple's permission to use Screen Time. A fully
  # unsigned archive carries none, and the export step has nothing to sign them
  # back in from. Signing "to run locally" needs no certificate or device either,
  # and it writes each target's entitlements into the archive, where the export
  # step finds them. Only apps that have a targets/ folder take this path.
  say "Archive (signed to run locally, so the extensions keep their entitlements)"
  xcb "$logs/archive.log" "${common[@]}" -archivePath "$archive" archive \
    CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=YES \
    AD_HOC_CODE_SIGNING_ALLOWED=YES PROVISIONING_PROFILE_SPECIFIER= DEVELOPMENT_TEAM="$APPLE_TEAM_ID"
  check_app "$archive/Products/Applications/$name.app"
  kept="$(codesign -d --entitlements - --xml "$archive/Products/Applications/$name.app" 2>/dev/null | plutil -p - 2>/dev/null || true)"
  echo "$kept" | grep -q "application-groups" || { echo "The archived app lost its App Group entitlement; an upload would not work on a phone" >&2; exit 1; }
  for appex in "$archive/Products/Applications/$name.app"/PlugIns/*.appex; do
    [ -d "$appex" ] && echo "extension: $(basename "$appex")"
  done
else
  say "Archive (unsigned)"
  xcb "$logs/archive.log" "${common[@]}" -archivePath "$archive" archive "${unsigned[@]}"
  check_app "$archive/Products/Applications/$name.app"
fi
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
