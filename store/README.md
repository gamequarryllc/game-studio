# App Store listings and settings

One folder per game, kept outside the game folders so store work never collides with a game that is mid-build.

- `<slug>/listing.json`: the draft store text (name, subtitle, keywords, promotional text, description, category, age-rating answers, in-app products, ad placements). Run `python3 tools/store_check.py` after editing: it checks Apple's limits and the studio's rules.
- `<slug>/ios.json` (optional): build settings read by `tools/ios_preset.py` (`plugins`, `plist_extra`, `min_ios`, `iphone_only`, `tracking_enabled`, `tracking_domains`, `real_monetization`).
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

## Still needed before a game can be sent to App Review

- Real ads and purchases in the game (see STUDIO.md, "App Store pipeline").
- In-app products created in App Store Connect with the ids and prices in `listing.json`. A product id is the bundle id, a dot, and the key, for example `com.gamequarry.digtothecore.remove_ads_2x`. Product ids can't repeat across apps on one account, which is why they carry the bundle id.
- An AdMob app for the game with one rewarded and one interstitial ad unit (one of each per game is enough; the game tracks which offer was shown), and an `app-ads.txt` file on the website named in the listing.
- A privacy policy page and a support page (both can live on the studio's play-links site; drafts to come).
- App Privacy answers in App Store Connect (what the ad network collects), the age-rating questions (draft answers are in `listing.json`), an icon and screenshots.
- A featuring nomination in App Store Connect at least two weeks before the planned release date (Apple suggests up to three months).
