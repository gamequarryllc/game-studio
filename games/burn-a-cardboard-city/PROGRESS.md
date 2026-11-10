# Burn a Cardboard City: progress on the current block

A builder that gets cut off leaves this file for the next one (STUDIO.md, "How the loop runs", 1b).

## Block: ship prep (2026-11-10, daily backstop)

Goal: the same shipping stack Burn Down a Forest got (STUDIO.md shipping-list item 1), plus the
release leftovers from ART_REVIEW 3 that show on the money screens.

### Done (everything in this block)

- Godot 4.7.2 (`godot_version.txt`, `project.godot` features, `.import` files re-saved by 4.7.2).
- `addons/admob` (v5.1.0) and `addons/godotx_revenue_cat` (2.6.0): the GDScript halves, copied from
  Burn Down a Forest. The native halves are fetched at build time (`tools/fetch_plugins.sh`).
- `scripts/monetization/`: `mobile_provider.gd`, `admob_ads.gd`, `revenuecat_store.gd`,
  `store_config.gd` (bundle id, entitlements, placeholders, the privacy policy link);
  `monetization.gd` picks the provider per build and uses `<bundle id>.<key>` product ids;
  the stub answers every request once and shows "(test)" on prices only in playtest builds.
- `tests/release_check.gd` (lists the four placeholders), `tests/monetization_test.gd` (37 checks pass).
- Export filter keeps the plugins' editor-only parts and the native folders out of the game data.
- UI: a restore says what it found; Settings has "Privacy policy" (new `policy` icon) and, where
  the ad network asks for it, "Ad privacy choices"; developer tools only with the `playtest`
  feature (tests use `GameState.dev_forced`).
- Release leftovers: the HUD fades out under the starter offer (all HUD pieces now live in
  `hud.hud_box`), the offer's price tag stays on screen, coins print whole, payouts never read
  "+0", the ending note prints time in words.
- `store/burn-a-cardboard-city/ios.json`; the listing's product ids, entitlements and support
  answers; the owner's steps in `store/README.md`.
- NOTES.md ("Ship prep", "Money", "Files"), ART_REVIEW.md (what review 3 still has open).

### Test status (Godot 4.7.2, 2026-11-10)

Smoke 122 checks pass. Ads and purchases test 37 pass. Boosted passes (18:13). Keen passes
(22:12). Chaos passes (6:07). Screenshots: 22, looked at. Browser run passes at three sizes.
Release check: fails as it should (four placeholders). On GitHub, the web build and the iOS
check build both passed for the ship-prep push.

### Next (for whoever picks this game up)

1. Nothing is half done: this block is finished.
2. Store assets: a 1024 px icon and App Store screenshots in `store/burn-a-cardboard-city/`.
3. The one budgeted polish pass left: ART_REVIEW 3, items 1 to 6, then what's open in 7 to 9.
4. When the owner sends the ids: `store_config.gd` and `project.godot` (`[admob]`), then the
   release check must pass.
