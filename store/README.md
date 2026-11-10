# App Store listings and settings

One folder per game, kept outside the game folders so store work never collides with a game that is mid-build.

- `<slug>/listing.json`: the draft store text (name, subtitle, keywords, promotional text, description, category, age-rating answers, in-app products, ad placements). Run `python3 tools/store_check.py` after editing: it checks Apple's limits and the studio's rules.
- `<slug>/ios.json` (optional): build settings read by `tools/ios_preset.py` (`plugins`, `plist_extra`, `min_ios`, `iphone_only`, `tracking_enabled`, `tracking_domains`, `real_monetization`). The engine version is the game's own `games/<slug>/godot_version.txt` (4.4.1 when absent); games with native ad and store plugins get them from `tools/fetch_plugins.sh` (versions in `tools/plugin_versions.env`).
- `<slug>/icon_1024.png` (optional): the App Store icon, 1024 x 1024, no transparency. Without it the build uses the game's project icon.
- Screenshots go in `<slug>/screenshots/` once a game is ready to play (6.9-inch iPhone and 13-inch iPad, landscape; the first three are what search results show).

Store text rules: sentence case, specific, no exclamation marks, no emoji, nothing the game doesn't do, no other app's name. The research behind the names and keywords is in `research/market.md`.

## The owner's steps for the first TestFlight build (once, about half an hour)

Claude can't do these: Apple only lets the account holder create keys, identifiers and app records.

1. **Check the Small Business Program.** If the account isn't enrolled, enrol at https://developer.apple.com/app-store/small-business-program/ so Apple keeps 15% instead of the standard rate. Enrolment is not automatic.
2. **Create an App Store Connect API key.** App Store Connect > Users and Access > Integrations > App Store Connect API > Team Keys > generate a key with the **Admin** role (Xcode needs it to create the signing certificate in Apple's cloud). Download the `.p8` file (Apple offers it once) and note the Key ID and the Issuer ID.
3. **Add four repository secrets.** GitHub > this repo > Settings > Secrets and variables > Actions > New repository secret:
   - `ASC_KEY_ID`: the Key ID
   - `ASC_ISSUER_ID`: the Issuer ID
   - `ASC_KEY_P8`: the whole text of the `.p8` file
   - `APPLE_TEAM_ID`: the 10-character Team ID (developer.apple.com > Account > Membership details)
4. **Register the bundle id.** developer.apple.com > Account > Certificates, IDs & Profiles > Identifiers > add an App ID with the explicit bundle id from the game's `listing.json` (for the first game: `com.gamequarry.burndownaforest`). No extra capabilities are needed.
5. **Create the app record.** App Store Connect > Apps > New App: platform iOS, the name from `listing.json` (if Apple says it is taken, tell Claude and it will propose others), primary language English (U.S.), the bundle id from step 4, any SKU (the game's folder name works).
6. **Start the build.** GitHub > Actions > "iOS build" > Run workflow: the game's folder name, mode `testflight`, flavor `playtest`. When Apple has processed the upload it appears under TestFlight for that app; add yourself as an internal tester and install it with the TestFlight app.

The `playtest` flavor has the developer tools and pretend ads and purchases, the same as the web play links. It is for trying a game on a real phone. The pipeline refuses to upload a `release` build until the game's real ad and purchase code is in, so a build with pretend ads can't be the one sent to review.

## Burn Down a Forest: what the owner provides to switch on real ads and purchases

The game already has the real code: AdMob ads and RevenueCat purchases in iPhone release builds (Godot 4.7.2; NOTES.md, "Money"). What's missing is four ids that only the owner's accounts can create. Until they're in, the release check (`tests/release_check.gd`) stops any release upload and lists what's missing; the play links and the playtest flavor keep their pretend ads.

Accounts: the Apple Developer account (exists), the RevenueCat account the studio already uses (a new project in it), and an AdMob account (a Google account signed up at admob.google.com). None of the ids below is a secret: they ship inside the app. Never send or commit a RevenueCat *secret* key or any `.p8` file.

Do these in order, after the general steps above (bundle id `com.gamequarry.burndownaforest` registered, app record created):

1. **Paid apps agreement.** WHAT: accept the Paid Apps agreement and add bank and tax details. WHEN: first; purchases don't work at all, not even in TestFlight, until it's active. WHERE: App Store Connect > Business (Agreements, Tax, and Banking).
2. **The six in-app purchases.** WHAT: create them with exactly these product ids, types and prices; each needs a display name (`display_name` in `listing.json`), a one-line description and a review screenshot (any shot of the notebook's Shop chapter). WHEN: right after step 1. WHERE: App Store Connect > Apps > Burn Down a Forest > Monetization > In-App Purchases.

   | Product id | Type | Price |
   |---|---|---|
   | `com.gamequarry.burndownaforest.remove_ads_2x` | Non-Consumable | $4.99 |
   | `com.gamequarry.burndownaforest.starter_pack` | Non-Consumable | $1.99 |
   | `com.gamequarry.burndownaforest.phoenix_flame` | Non-Consumable | $2.99 |
   | `com.gamequarry.burndownaforest.embers_small` | Consumable | $0.99 |
   | `com.gamequarry.burndownaforest.embers_medium` | Consumable | $2.99 |
   | `com.gamequarry.burndownaforest.embers_large` | Consumable | $9.99 |

3. **A key for RevenueCat.** WHAT: generate an In-App Purchase key and download its `.p8` (Apple offers it once); note its Key ID and the Issuer ID. WHEN: after step 2. WHERE: App Store Connect > Users and Access > Integrations > In-App Purchase. It goes only into RevenueCat (step 4), never to Claude or the repo.
4. **RevenueCat project.** WHAT: create a project "Burn Down a Forest"; add an App Store app with the bundle id and upload the key from step 3; import the six products; create three entitlements named exactly `remove_ads`, `starter_pack` and `phoenix_flame`, and attach the product with the same key to each (the ember packs need none; no offerings or paywall). WHEN: after step 3. WHERE: app.revenuecat.com. **Send Claude:** the public App Store SDK key (starts with `appl_`), from Project settings > API keys. It goes in `scripts/monetization/store_config.gd`, `REVENUECAT_KEY_IOS`.
5. **AdMob app and ad units.** WHAT: add an iOS app "Burn Down a Forest" (choose "not published yet"); create one **Rewarded** and one **Interstitial** ad unit; under Privacy & messaging, create and publish a European regulations (GDPR) message and an IDFA explainer message for the app (the explainer is what shows the iPhone tracking prompt). WHEN: any time, in parallel with steps 1 to 4. WHERE: admob.google.com > Apps. **Send Claude:** the app id (contains a `~`) and the two ad unit ids (contain a `/`). The app id goes in the game's `project.godot` (`[admob]` section, `general/ios/app_id`), the unit ids in `store_config.gd` (`ADMOB_REWARDED`, `ADMOB_INTERSTITIAL`).
6. **Privacy policy link.** WHAT: the privacy policy page's URL. WHEN: once the page is on the play-links site (STUDIO.md, shipping list item 3). WHERE: `store_config.gd`, `PRIVACY_POLICY_URL`, and App Store Connect > App Privacy > Privacy Policy URL.
7. **App Privacy answers.** WHAT: Data used to track you: Device ID (advertising, through AdMob). Data not linked to you: Purchase History (RevenueCat), Device ID, Product Interaction, Advertising Data and Coarse Location (AdMob). WHEN: before sending the build to review. WHERE: App Store Connect > Apps > Burn Down a Forest > App Privacy.
8. **The first real build.** WHAT: once the ids are in, `godot --headless -s res://tests/release_check.gd -- iOS` in the game folder must say every store id is filled in; then start the upload. WHEN: after steps 4 to 6. WHERE: GitHub > Actions > "iOS build" > Run workflow: `burn-down-a-forest`, mode `testflight`, flavor `release`. Buy something with a Sandbox account in TestFlight to check purchases end to end.
9. **After launch.** WHAT: link the App Store listing to the AdMob app, and put AdMob's `app-ads.txt` line on the website named in the listing. WHERE: AdMob > Apps > App settings, and the play-links site.

## Still needed before a game can be sent to App Review

- Real ads and purchases in the game (see STUDIO.md, "App Store pipeline"). Burn Down a Forest has them (ids pending, above); the other games still have pretend ones.
- In-app products created in App Store Connect with the ids and prices in `listing.json`. A product id is the bundle id, a dot, and the key, for example `com.gamequarry.digtothecore.remove_ads_2x`. Product ids can't repeat across apps on one account, which is why they carry the bundle id. The game's code must use the same full ids (Burn Down a Forest does).
- An AdMob app for the game with one rewarded and one interstitial ad unit (one of each per game is enough; the game tracks which offer was shown), and an `app-ads.txt` file on the website named in the listing.
- A privacy policy page and a support page (both can live on the studio's play-links site; drafts to come).
- App Privacy answers in App Store Connect (what the ad network collects), the age-rating questions (draft answers are in `listing.json`), an icon and screenshots.
- A featuring nomination in App Store Connect at least two weeks before the planned release date (Apple suggests up to three months).
