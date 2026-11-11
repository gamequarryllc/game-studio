# App Store listings and settings

One folder per game, kept outside the game folders so store work never collides with a game that is mid-build.

- `<slug>/listing.json`: the draft store text (name, subtitle, keywords, promotional text, description, category, age-rating answers, in-app products, ad placements), the two links every listing needs (`support_url`, `privacy_url`) and, once a game has real ads and purchases, a `support` block: where Restore purchases, the ad privacy choices and the sound settings are in that game, in the words the game uses. Run `python3 tools/store_check.py` after editing: it checks Apple's limits, the studio's rules, the links and that the site pages build. CI runs it too.
- `<slug>/ios.json` (optional): build settings read by `tools/ios_preset.py` (`plugins`, `plist_extra`, `min_ios`, `iphone_only`, `tracking_enabled`, `tracking_domains`, `real_monetization`). The engine version is the game's own `games/<slug>/godot_version.txt` (4.4.1 when absent); games with native ad and store plugins get them from `tools/fetch_plugins.sh` (versions in `tools/plugin_versions.env`).
- `<slug>/icon_1024.png` (optional): the App Store icon, 1024 x 1024, no transparency. Without it the build uses the game's project icon.
- Screenshots go in `<slug>/screenshots/` once a game is ready to play (6.9-inch iPhone and 13-inch iPad, landscape; the first three are what search results show).

The privacy policy and the support page are one page each for all the studio's games, on the play-links site: `site/privacy.html` and `site/support.html` at the top of the repo, built by `tools/site_pages.py` into https://gamequarryllc.github.io/game-studio/privacy/ and https://gamequarryllc.github.io/game-studio/support/ on every push. The support page gets a section per game from the `support` block in its `listing.json`. The policy describes exactly what the shipped ad and purchase code does; if a game ever adds another service, the policy changes first. **The owner should read the policy once before the first submission**: it is a careful draft based on the reference game's policy, not legal advice.

**Apps** (the Expo projects in `apps/<slug>/`; STUDIO.md, "Apps") keep their listings here too, marked `"kind": "app"`. An app's listing has exactly one product (the lifetime Pro unlock, `<bundle id>.pro`, entitlement `<slug with underscores>_pro`, priced from 2.99 to 9.99), no ads, a `privacy_label` draft, and a `support` block with `restore` and `backup` (where each is in the app). Its two links point at the apps' own pages, `site/apps-privacy.html` and `site/apps-support.html`, published at https://gamequarryllc.github.io/game-studio/apps/privacy/ and https://gamequarryllc.github.io/game-studio/apps/support/ (the support link ends in `#<slug>`). `tools/store_check.py` also checks that the listing and the app agree on the bundle id, the product id, the entitlement and the price. Each app's NOTES.md has the owner's going-live steps.

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

   And one repository **variable** (same page, the Variables tab > New repository variable): `SUPPORT_EMAIL`, the business's public contact address. The site build puts it on the privacy and support pages; it is a variable, not a file, so no email address is ever written in this repo. Until it is set, both pages send players to the repo's issue page instead, which works but needs a GitHub account, and Apple expects an easy way to reach the developer. Set it before the first game goes to review. `status.json` on the site says which one is live (`"site": {"contact": "email"}` or `"issue page"`).
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
6. **Privacy policy and support links.** WHAT: paste the two links from `listing.json`: `privacy_url` (https://gamequarryllc.github.io/game-studio/privacy/) and `support_url` (https://gamequarryllc.github.io/game-studio/support/). Read the policy once first. WHEN: when filling in the listing. WHERE: App Store Connect > Apps > Burn Down a Forest > App Privacy > Privacy Policy URL, and the version page > Support URL. (Claude puts the privacy link in the game's `store_config.gd`, `PRIVACY_POLICY_URL`; nothing to send.)
7. **App Privacy answers.** WHAT: Data used to track you: Device ID (advertising, through AdMob). Data not linked to you: Purchase History (RevenueCat), Device ID, Product Interaction, Advertising Data and Coarse Location (AdMob). WHEN: before sending the build to review. WHERE: App Store Connect > Apps > Burn Down a Forest > App Privacy.
8. **The first real build.** WHAT: once the ids are in, `godot --headless -s res://tests/release_check.gd -- iOS` in the game folder must say every store id is filled in; then start the upload. WHEN: after steps 4 to 6. WHERE: GitHub > Actions > "iOS build" > Run workflow: `burn-down-a-forest`, mode `testflight`, flavor `release`. Buy something with a Sandbox account in TestFlight to check purchases end to end.
9. **After launch.** WHAT: link the App Store listing to the AdMob app, and set up `app-ads.txt` (next section). WHERE: AdMob > Apps > App settings.

## Burn a Cardboard City: what the owner provides to switch on real ads and purchases

The same code as Burn Down a Forest is in (Godot 4.7.2; the game's NOTES.md, "Money"), so the steps are the forest's steps 2 to 8 above with this game's names. The Paid Apps agreement (step 1), the `SUPPORT_EMAIL` variable and the privacy and support links are done once for the whole account and site. Do this game after the forest is in review: one launch at a time is easier to follow, and the store name "Burn a Cardboard City" should be checked when the app record is created.

- **Bundle id and app record:** `com.gamequarry.burnacardboardcity`, name "Burn a Cardboard City" (general steps 4 and 5 at the top).
- **The six in-app purchases** (App Store Connect > Apps > Burn a Cardboard City > Monetization > In-App Purchases; display names are in `listing.json`; the review screenshot can be any shot of the box's Extras tab):

   | Product id | Type | Price |
   |---|---|---|
   | `com.gamequarry.burnacardboardcity.remove_ads_2x` | Non-Consumable | $4.99 |
   | `com.gamequarry.burnacardboardcity.starter_pack` | Non-Consumable | $1.99 |
   | `com.gamequarry.burnacardboardcity.golden_lens` | Non-Consumable | $2.99 |
   | `com.gamequarry.burnacardboardcity.coins_small` | Consumable | $0.99 |
   | `com.gamequarry.burnacardboardcity.coins_medium` | Consumable | $2.99 |
   | `com.gamequarry.burnacardboardcity.coins_large` | Consumable | $9.99 |

- **RevenueCat:** a project "Burn a Cardboard City" with an App Store app for the bundle id (the In-App Purchase key from the forest's step 3 can be reused: it belongs to the account, not to one app); import the six products; three entitlements named exactly `remove_ads`, `starter_pack` and `golden_lens`, each with the product of the same key (`remove_ads` gets `remove_ads_2x`). **Send Claude:** the public App Store SDK key (`appl_...`) for `REVENUECAT_KEY_IOS`.
- **AdMob:** an iOS app "Burn a Cardboard City" with one Rewarded and one Interstitial ad unit; the GDPR and IDFA explainer messages published for it under Privacy & messaging. **Send Claude:** the app id (with a `~`) and the two ad unit ids (with a `/`).
- **Links and App Privacy:** the same two links and the same App Privacy answers as the forest (steps 6 and 7).
- **The first real build:** `godot --headless -s res://tests/release_check.gd -- iOS` in the game folder must say every store id is filled in (today it lists the four placeholders); then Actions > "iOS build" > Run workflow: `burn-a-cardboard-city`, mode `testflight`, flavor `release`.

## app-ads.txt (once for the whole account, after the first game is live)

`app-ads.txt` is a one-line text file that tells ad buyers the studio's AdMob account really is the seller of its ad space. Google calls it "not mandatory, but highly recommended": without a verified file, the ad buyers that check it don't bid, so ads pay less. One file covers every app on the AdMob account, Melt a Glacier included.

The catch is where it has to be. Ad networks read the website in the App Store listing's **Marketing URL** and look only at the root of that host, `https://<host>/app-ads.txt`, never in a sub-folder. The play-links site is a sub-folder (`gamequarryllc.github.io/game-studio/`), so a file published there is not found. Two ways to get it to a root, either is fine:

- **A root site for the organisation (free, about ten minutes).** WHAT: create a public repository named exactly `gamequarryllc.github.io` in the organisation, add one file `app-ads.txt` holding the line AdMob shows (AdMob > Apps > View all apps > app-ads.txt > "How to set up app-ads.txt"; it looks like `google.com, pub-..., DIRECT, f08c47fec0942fa0`), and switch on Pages for its main branch. Then set every game's Marketing URL to `https://gamequarryllc.github.io/`. WHERE: github.com (new repository) and App Store Connect > the app > the version page > Marketing URL. Claude can't create repositories, so this one is the owner's.
- **A domain of the business's own.** Point it at this repo's Pages site (repo Settings > Pages > Custom domain). The play links then live at the root of that domain, and the line goes in `site/app-ads.txt` here (send it to Claude, or paste it in: a publisher id is public, not a secret). The site build publishes the file as soon as it holds a real line. Marketing URL: the domain.

Afterwards: AdMob > Apps > View all apps > app-ads.txt > "Check for updates". Verifying can take a day.

## Still needed before a game can be sent to App Review

- Real ads and purchases in the game (see STUDIO.md, "App Store pipeline"). Burn Down a Forest and Burn a Cardboard City have them (ids pending, above); Dig to the Core and Drain an Ocean still have pretend ones.
- In-app products created in App Store Connect with the ids and prices in `listing.json`. A product id is the bundle id, a dot, and the key, for example `com.gamequarry.digtothecore.remove_ads_2x`. Product ids can't repeat across apps on one account, which is why they carry the bundle id. The game's code must use the same full ids (Burn Down a Forest does).
- An AdMob app for the game with one rewarded and one interstitial ad unit (one of each per game is enough; the game tracks which offer was shown). `app-ads.txt` (section above) can follow the launch.
- The privacy policy and support links in the listing (the pages exist; `privacy_url` and `support_url` in `listing.json`), the `SUPPORT_EMAIL` repository variable set, and a `support` block in the game's `listing.json` that matches the game.
- App Privacy answers in App Store Connect (what the ad network collects), the age-rating questions (draft answers are in `listing.json`), an icon and screenshots.
- A featuring nomination in App Store Connect at least two weeks before the planned release date (Apple suggests up to three months).
