#!/bin/bash
# Downloads the native halves of a game's ad and store plugins (they are big and
# versioned, so they're not in git). The GDScript halves are in games/<slug>/addons/.
# Copied from the studio's reference game and made per-game.
#
#   bash tools/fetch_plugins.sh <slug> ios        # before an iOS export (the iOS workflow runs it)
#   bash tools/fetch_plugins.sh <slug> android    # before an Android export (not used yet)
#
# A game without addons/admob or addons/godotx_revenue_cat needs nothing: the
# script says so and exits 0. Versions come from tools/plugin_versions.env.
# Re-running is safe. Downloads are cached in $PLUGIN_CACHE (default ~/.cache/game-studio-plugins).
#
# Where things land (all ignored by git):
#   games/<slug>/addons/admob/ios/bin/          AdMob's iOS libraries (+ package.gd, the plugin's
#                                               "installed" marker, so it doesn't download them again)
#   games/<slug>/ios/plugins/revenue_cat/       RevenueCat's iOS plugin (.gdip + xcframeworks)
set -euo pipefail

slug="${1:?usage: tools/fetch_plugins.sh <slug> ios|android}"
what="${2:-ios}"
root="$(cd "$(dirname "$0")/.." && pwd)"
game="$root/games/$slug"
case "$slug" in *[!a-z0-9-]*|"") echo "Bad game name: $slug" >&2; exit 2;; esac
case "$what" in ios|android) ;; *) echo "usage: $0 <slug> ios|android" >&2; exit 2;; esac
[ -f "$game/project.godot" ] || { echo "No game at games/$slug" >&2; exit 2; }

# shellcheck source=plugin_versions.env
source "$root/tools/plugin_versions.env"
CACHE="${PLUGIN_CACHE:-$HOME/.cache/game-studio-plugins}"
mkdir -p "$CACHE"
GH=https://github.com

has_admob=false; has_rc=false
[ -f "$game/addons/admob/plugin.cfg" ] && has_admob=true
[ -f "$game/addons/godotx_revenue_cat/plugin.cfg" ] && has_rc=true
if ! $has_admob && ! $has_rc; then
  echo "$slug has no native plugins: nothing to fetch."
  exit 0
fi

godot_version="4.4.1"
if [ -f "$game/godot_version.txt" ]; then godot_version="$(tr -d '[:space:]' < "$game/godot_version.txt")"; fi
if [ "$godot_version" != "$PLUGIN_GODOT_VERSION" ]; then
  echo "$slug is on Godot $godot_version, but the pinned plugins are built for $PLUGIN_GODOT_VERSION." >&2
  echo "Move the game to $PLUGIN_GODOT_VERSION first (games/$slug/godot_version.txt)." >&2
  exit 3
fi

cfg_version() {  # plugin.cfg -> its version, without a leading v
  sed -n 's/^version="\(.*\)"/\1/p' "$1" | head -1 | sed 's/^v//'
}

fetch() {  # url file
  if [ ! -s "$CACHE/$2" ]; then
    echo "Downloading $2"
    curl -fSL --retry 3 -o "$CACHE/$2.part" "$1"
    mv "$CACHE/$2.part" "$CACHE/$2"
  fi
}

admob() {  # android|ios
  local want="${ADMOB_PLUGIN_VERSION#v}" have
  have="$(cfg_version "$game/addons/admob/plugin.cfg")"
  [ "$have" = "$want" ] || { echo "games/$slug/addons/admob is v$have but tools/plugin_versions.env pins v$want" >&2; exit 4; }
  local f="admob-$1-template-v$godot_version-$ADMOB_PLUGIN_VERSION.zip"
  fetch "$GH/poingstudios/godot-admob-plugin/releases/download/$ADMOB_PLUGIN_VERSION/$1-template-v$godot_version.zip" "$f"
  local bin="$game/addons/admob/$1/bin"
  rm -rf "$bin"
  mkdir -p "$bin"
  unzip -q -o "$CACHE/$f" -d "$bin"
  # The plugin's own "installed" marker (its InstallerService writes the same file):
  # without it the editor plugin downloads the libraries again on a headless import.
  printf '# This file is dynamically generated.\n# It defines the current installed version of the platform plugin.\n# Do not modify this manually.\n\nconst VERSION := "%s"\n' \
    "$ADMOB_PLUGIN_VERSION" > "$bin/package.gd"
  echo "AdMob $1 libraries ($ADMOB_PLUGIN_VERSION) -> games/$slug/addons/admob/$1/bin"
}

revenuecat() {  # android|ios
  local have
  have="$(cfg_version "$game/addons/godotx_revenue_cat/plugin.cfg")"
  [ "$have" = "$REVENUECAT_PLUGIN_VERSION" ] || { echo "games/$slug/addons/godotx_revenue_cat is $have but tools/plugin_versions.env pins $REVENUECAT_PLUGIN_VERSION" >&2; exit 4; }
  local f="godotx_revenue_cat-$REVENUECAT_PLUGIN_VERSION.zip"
  fetch "$GH/godot-x/revenuecat/releases/download/$REVENUECAT_PLUGIN_VERSION/godotx_revenue_cat.zip" "$f"
  local tmp
  tmp="$(mktemp -d)"
  if [ "$1" = android ]; then
    unzip -q -o "$CACHE/$f" 'godotx_revenue_cat/android/*' -d "$tmp"
    rm -rf "$game/android/revenue_cat"
    mkdir -p "$game/android"
    cp -R "$tmp/godotx_revenue_cat/android/revenue_cat" "$game/android/"
    echo "RevenueCat Android library ($REVENUECAT_PLUGIN_VERSION) -> games/$slug/android/revenue_cat"
  else
    # Keep the dSYMs: each xcframework's Info.plist names them, and Xcode's archive fails if they're missing.
    unzip -q -o "$CACHE/$f" 'godotx_revenue_cat/ios/*' -d "$tmp"
    rm -rf "$game/ios/plugins/revenue_cat"
    mkdir -p "$game/ios/plugins"
    cp -R "$tmp/godotx_revenue_cat/ios/plugins/revenue_cat" "$game/ios/plugins/"
    # Godot's iOS exporter finds the .gdip with plain file access; without this
    # its importer would also take the frameworks' images as game resources
    # and pack all 200 MB of them into the game data.
    : > "$game/ios/.gdignore"
    echo "RevenueCat iOS plugin ($REVENUECAT_PLUGIN_VERSION) -> games/$slug/ios/plugins/revenue_cat"
  fi
  rm -rf "$tmp"
}

$has_admob && admob "$what"
$has_rc && revenuecat "$what"
exit 0
