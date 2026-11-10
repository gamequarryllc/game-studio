# Studio state (read this first every work block)

This repo is a small game studio. Claude builds mobile games here in a loop,
polishes them, and pings the owner to playtest. This file is the loop's memory:
the conversation that runs the loop gets long and is summarized over time,
so anything that must survive goes here.

- **Queue and per-game status:** `queue.json` (order = priority). The play-links page reads it too.
- **Play links:** https://gamequarryllc.github.io/game-studio/ (each game at `/<slug>/`). Every push to `main` rebuilds them (`.github/workflows/web.yml`). Per-game build results: `/status.json` on the same site.
- **Each game:** its own Godot project in `games/<slug>/`, with a `NOTES.md` (design, what's done, what's next, known bugs). Status lives only in `queue.json`. Engine version per game: `games/<slug>/godot_version.txt` (CI, the iOS pipeline and local tools read it; no file means 4.4.1). Games move to 4.7.2 when they take the real ads-and-purchases stack; Burn Down a Forest and Burn a Cardboard City are on it. Local binaries: 4.4.1 at `/home/claude/dl/godot/`, 4.7.2 at `/home/claude/dl/godot47/bin/` (`tools/browser_check.py` picks by the game's `godot_version.txt`; a web export also needs that version's `web_nothreads_*` export templates in `~/.local/share/godot/export_templates/<version>.stable/`).
- **Reference game:** `gamequarryllc/melt-a-glacier` (Godot 4.4, Compatibility renderer, first-person landscape, phone touch controls, generated audio, stub monetization, smoke/pacing/screenshot tests). It sets the quality bar. Copying small utilities from it is fine; copying its look, HUD, shop or concept is not (see Apple 4.3 below).

## How the loop runs

1. The loop lives in the owner's studio conversation with Claude (started 2026-11-08). Claude schedules its own wake-ups there with `send_later`: at the **start** of each work block, check `list_triggers` for a pending studio wake-up and schedule one if there isn't (one at a time, never two, so they can't multiply).
1b. **Builders get cut off** (session restarts, usage limits) and long-running ones often can't be resumed. So every builder keeps `games/<slug>/PROGRESS.md` up to date after each finished item (what's done, what's in progress, what's next, current test status), and a replacement builder starts by reading it. When a builder stops and can't be resumed, back its folder up to a `wip/<slug>-...` branch (temp index + `git commit-tree`, so `main` and the working tree are untouched) unless its smoke test passes, in which case checkpoint-commit to `main`.
2. Each block: read this file and `queue.json` → apply any new feedback from the owner first → pick the next work (two games at a time, top of the queue first) → hand each game to a worker agent with a full brief (workers never run git) → commit each game folder and push → check the Actions run and `status.json` → update this file and `queue.json` → ping the owner only on milestones.
3. The owner has said: use the plan as much as needed. Run continuously. If the plan limit hits, the loop pauses and resumes after the reset.
4. Stop working on a game when it meets the polish bar below; mark it `ready-to-play` and ping. When every game is ready or parked, pitch 10 new ideas in the conversation and wait for the owner to pick.

## Autonomy (the owner: "something done at least once a day without my input")

- **Two engines.** (1) The conversation loop above (send_later wake-ups, runs continuously). (2) A daily scheduled task, "Game studio daily backstop" (3:17 AM local time, fresh session each run), which does at least one real work block every day even if the conversation loop has stalled. Both read and write only this repo, so either one can pick up where the other left off.
- **No collisions.** Neither engine works on a game folder that got a commit in the last 6 hours from the other one; pick the next game instead. A game marked `building` whose folder isn't in the repo yet, with a block-log entry in the last 24 hours, is mid-build in the conversation loop: don't start it from scratch. Always `git pull --rebase` before pushing.
- **New ideas without asking.** The owner has said: if you bet they'd like a new idea based on what's been built and their feedback, just build it. When fewer than 2 games are actively being built, or the queue is all ready/parked, add one new idea to `queue.json` (distinct mechanic, money-making rules apply), log why in the block log, and start it. Still pitch a list of ideas in the conversation every so often so they can steer.
- **Always improving.** When nothing is queued, keep polishing: the polish bar, the owner's feedback, then the monetization tuning (pacing with and without ads).

## Pings (push notification + short message in the conversation)

- A game reaches **first playable** (play link works, core loop is fun for 5 minutes).
- A game reaches **ready to play** (polish bar met).
- Something needs the owner (a decision, an account, a store step).
- One evening roundup per day (what moved, what's next). No pings for routine blocks.

## Rules

- The owner's feedback jumps the queue. Log it below with the date, then act on it.
- Every game must be **distinct** in core mechanic, art direction, HUD/UI theme and audio. Apple rejects "multiple similar apps using a repackaged app template" (guideline 4.3). No shared visible template across games.
- Keep the word "arson" out of all titles and store text.
- Fire games are cartoonish and fictional (cursed forest, cardboard city). No real places, no people harmed.
- Bundle IDs: `com.gamequarry.<slug without dashes>`. Store names checked for availability before launch.
- Playtest builds include developer tools (`playtest` feature tag) and fake ads/purchases, like Melt a Glacier.

## Privacy (this repo is public)

- Never commit personal information about the owner or anyone else: no people's names (write "the owner"), usernames or account handles, email addresses (only `noreply@anthropic.com` for commits), home towns, regions or time zones, employer, personal accounts and services, IP addresses or hostnames from a home network, file paths from anyone's computer, or chat titles. The business name "Game Quarry" and the org name `gamequarryllc` are fine.
- The same goes for commit messages and commit authors (always `Claude <noreply@anthropic.com>`).
- Before every push: run `python3 tools/privacy_check.py --commits` and fix every hit. Where the owner's private term list is available (kept outside this repo, never committed), add `--terms <that file>`. CI runs the generic check too and refuses to publish on a hit.

## Look and feel: hand-made, never "AI-generated" (the owner's standard)

The owner wants every game and UI to look like a small, skilled studio made it, with real leg work. Treat this as seriously as the money rules.

**Tells to hunt down and remove:**
- Emoji used as icons or in UI text (🔥 📓 📺 💰). Every icon is drawn for the game (SVG authored in the repo, one consistent stroke and fill style per game). Emoji only as a deliberate exception.
- Template UI: the same rounded dark pill panel everywhere, soft outer glows, centered symmetric layouts, one corner radius on everything, a default geometric sans (Outfit, Inter, Poppins and the like) as the only font.
- Generic copy: upbeat filler, Title Case Everywhere, exclamation marks on everything, emoji. Write short, specific, in-world lines in sentence case.
- Primitive-soup models (a sphere on a cylinder), random scatter with no composition, everything at one scale, flat untextured colours, oversaturated palettes with no value structure, dithering or z-fighting artifacts.
- Linear, floaty motion. Use easing, anticipation, squash and stretch, staggered reveals, weight.

**What to do instead:**
- **Art bible per game** at the top of its NOTES.md: a palette of 5 to 7 named swatches with roles (and checked value contrast), a characterful display font plus a readable body font (open-licensed, licence file included), a UI motif taken from the fiction (burnt-wood signs, cardboard tags and tape, brass mining gauges), a shape language, and 3 real-world inspirations that aren't other games (linocut prints, papercraft, old mining-company signage...).
- **Models built in Blender**, not in code from primitives: `pip install --break-system-packages bpy` (Blender 5.2 as a Python module, runs headless here). Write each model as a Python script in `games/<slug>/art/blender/` (the source stays in the repo so it's reproducible), with real silhouettes, bevels, deliberate proportions, the game's shape language, and vertex-colour or small-texture detail (baked AO, gradients, edge wear). Export `.glb` to `games/<slug>/models/` (`bpy.ops.export_scene.gltf(export_format="GLB", export_apply=True)`). Render a contact sheet of every model with Cycles on the CPU to review them before they go in the game. Keep poly counts phone-friendly and use LODs or MultiMesh for repeats.
- **Composed levels:** hand-placed landmarks, paths and sightlines, variety in scale and silhouette, lighting with intent (a time of day, rim light, warm/cool contrast).
- **UI with texture and imperfection:** grain, paper, wear, slightly irregular hand-drawn edges, intentional asymmetry, a real type scale, motion with easing.

**Lessons from the critics so far (avoid these from the first build):**
- Fire as identical upright teardrop cards spaced like birthday candles, with no smoke and no light cast. Vary shape and size, lean with the wind, one tall leading flame, smoke, sparks, warm light on nearby surfaces.
- A noise "lava" texture pasted on burning things; burnt things as pure black. Show burning as a creeping glowing edge; char around #2a2420, ash grey, never #000.
- Trees built from icosphere clusters or stacked cones; one material on every model; windows in perfect grids. Build distinct silhouettes and materials in Blender.
- Flat, pale lighting with no key direction. One warm key with long shadows, a cool fill, a rim on silhouettes, darker foregrounds, fire as the brightest warm light.
- The hero hidden by foliage or buildings. Camera collision plus a clean radial fade.
- Held tools as primitives with no hand. Draw a hand holding each tool, framed above the touch buttons.
- Desktop wording on phones ("click", "press B", "left mouse button"). Device-aware prompts, touch wording first.
- Template shop layouts (equal tabs, identical rows or card grids, a second buy button), stock centred modals, too many popups at once. Build shops and offers as physical objects from the game's world, one popup at a time.
- Default free fonts that read as AI picks (Outfit, Permanent Marker as the only font). Pick fonts with character that match the fiction.
- An ending card shown over live gameplay with the HUD still up. Hide the HUD and give the ending its own moment.
- Terrain that looks generated: perfectly round or concentric shapes, stair-stepped heightmap edges, blurry noise blotches for grass and sand. Sculpt asymmetric landforms with landmarks, smooth modelled edges, painted detail that has direction (tide lines, ripples, paths).
- Anything that looks like debug output: numbered IDs on objects, labels on grey translucent boxes, raw units ("398 cells"), "(test)" in prices, a visible dev tab. Use in-world lettering and real copy; hide dev tools.
- The same frame treatment on every panel. Give each UI role its own material.

**Process, every time a game is shown to the owner:**
1. Screenshots plus the model contact sheet.
2. A fresh-eyes critic agent that has NOT seen the build process reviews them with one question: "what here looks AI-generated, generic or template-made, and what would a skilled indie artist change?" It must return concrete findings.
3. **Polish budget:** after first playable, a game gets at most two polish passes (each followed by a critic) before its builder slot goes to a new game from the queue. Further polish waits for the owner's playtest feedback, which always outranks the critic. This keeps new games flowing while the critics, who are told to find problems, keep raising the bar.
4. The builder fixes every finding, then re-shoots. The critic ends with a verdict (yes / almost / no). A game is "first playable" once the verdict is at least "almost" (the remaining findings move into its polish work), and "ready to play" only when it's "yes".

## Playtesting: Claude plays every game end to end (the owner's request)

The owner wants every game played start to finish so the quirks are worked out before they play it. Every game gets:

1. **Dev boosts** in playtest builds only (`playtest` feature tag, hidden in release): time scale 1x/5x/10x/50x (`Engine.time_scale`), income x10/x100, give currency, unlock everything, skip to a stage, reset the save.
2. **A playthrough bot**, `tests/playthrough.gd`: plays from a fresh save to the ending through the game's real systems (moving, aiming, using tools, shopping the way a player would), sped up with `--fixed-fps` and time scale. Profiles: `keen`, `casual`, and `boosted` (dev x10, for speed). It reports when each tool was bought and each stage finished (pacing), and fails if the ending isn't reached; if progress stalls for too long; if any tool, upgrade, helper or find is unreachable; if the player leaves the world or gets stuck in geometry; if a save and reload at several points mid-run doesn't restore the same state; if an ad or purchase flow (stubbed) breaks anywhere it appears; or if anything is printed as an error.
3. **A chaos run**: several game-minutes of random input (every button, every panel opened and closed, random purchases, background and resume). No crash, no softlock, no broken UI state.
4. **A visual run**: the playthrough rendered under xvfb with a screenshot every N game-seconds, reviewed as a contact sheet for clipping, z-fighting, UI overlap and text overflow, at phone and tablet sizes.
5. **A browser run**: `python3 tools/browser_check.py games/<slug>` exports the web build locally, loads it in headless Chromium as an iPhone in landscape with touch at three sizes, and fails on any console or page error. (Rendering here is software GL at about 1 fps, so smoothness is judged on a real phone; loading, errors, touch and layout are judged here. The live github.io site is not reachable from the workspace, so always test a local export.)
6. **Every bug found gets fixed and becomes a smoke-test assertion** so it can't come back. Results go in the game's NOTES.md under "QA".
7. **When:** after first playable (catch the big quirks early), after each art pass, and before "ready to play". CI runs the `boosted` playthrough on every push when a game has one.

## Making money (the point of the studio)

### North star

The studio's goal is to cover its $200/month running cost from App Store proceeds as fast as possible (net of Apple's commission and the developer fee). Everything above that is a bonus.

- **Finishing and shipping beats starting.** A game earns nothing until it is live on the App Store with real ads and purchases.
- **New work is ranked by expected dollars per month and how soon it can ship.** Before picking work, ask: does this get real money in sooner?
- **No new game starts until the first game is in App Review** (decided 2026-11-09 from the research: five games are in flight and none can be sold yet). A free builder slot goes to the shipping list first, in this order: the iOS build pipeline, real ads and purchases behind the provider interface, store assets (icon, screenshots, name, subtitle, keywords), then discovery assets (preview clips, cross-promotion). This overrides the polish-budget rule about handing slots to new games.
- **Market research lives in `research/market.md`** and is refreshed weekly (markets, real monetization numbers, how to get found with no ad budget, and the math for the target). The queue order follows it.
- **Honest money only.** No fake reviews or review-gating, no misleading ads, screenshots or store text, no dark patterns, nothing aimed at kids, no copying other apps. Stay inside Apple's App Review Guidelines and AdMob's policies: a rejected app or a banned account earns nothing.
- Only the owner can see real proceeds. Estimates are always labelled as estimates, and earned amounts are never written in this repo.

The goal is revenue. Every game is designed around its monetization from the first build, not bolted on at the end. Reference implementation: Melt a Glacier's `scripts/monetization/` (provider interface + stub), `scripts/ad_offers.gd` and `Balance.AD_REWARDS` (copy the architecture, not the look).

**Rewarded ads (main earner).** Every game has at least these, themed to the game:
- **2x boost:** "Watch an ad: 2x [fire/digging/pumping] for 5 min", stacks to 15 min.
- **Helper rush:** helpers work 3x for 3 min.
- **Instant cash:** a lump sum worth a few minutes of current income (capped so it never replaces playing).
- **Double this find:** when a rare find pops out, offer to double its payout.
- **Timed offer tag** at moments of desire, naming what it buys: "FREE: +💰 70K, enough for the Flamethrower!". Rules from Melt a Glacier: none in the first ~2.5 min, one at a time, expires after ~40 s, backs off each time it's ignored, only offers worth having right now, never one whose ad hasn't loaded.

**Interstitials (light).** Only at natural breaks (leaving the shop, finishing a stage), at most every 4 min, never in the first few minutes or right after a rewarded ad, never with Remove Ads.

**In-app purchases.** Each game has:
- **Remove Ads + permanent 2x** (non-consumable, the anchor offer, about $4.99).
- **Starter pack** (one-time, about $1.99): a cash bundle plus an exclusive cosmetic tool, offered once after ~10 min of play.
- **Premium cosmetic** (non-consumable, about $2.99): a golden/legendary version of a tool with a small bonus.
- **Cash packs** (consumable, 3 sizes) shown in the shop when the player is short for the next tool.
- **Restore Purchases** (Apple requires it).

**Guardrails.** The game must be finishable without paying; ads and purchases speed it up. Not aimed at kids (stay out of the Kids category; its ad rules are much stricter). Playtest builds fake ads and purchases and count them in the dev menu so pacing with and without ads can be compared.

**Going live (later, needs the owner's accounts):** AdMob for rewarded and interstitial ads, RevenueCat for purchases (already used by Plainworth), store products created per game.

## First playable (minimum for the first ping)

Loads on a phone from the play link in landscape, touch controls work, the core action is satisfying, money comes in, at least 3 tools and a working shop, the 2x rewarded-ad boost and the shop's Remove Ads offer work (stubbed), saves progress, smoke test passes, screenshots checked by eye.

## Polish bar (ready to play)

1. A full run of 30 to 60 minutes with a real ending and stats screen (pacing bot proves it: keen player ~30, casual ~60).
2. Phone controls feel right; desktop keys work too.
3. First-run hints.
4. Sound effects and music made for the game (generated, no stock audio), with volume and mute.
5. Save/load, autosave, and save on backgrounding.
6. Its own art direction, HUD and UI theme, following "Look and feel": an art bible, Blender-made models, custom icons, no emoji UI, and a clean report from the fresh-eyes critic.
7. Shop with tools, upgrades and helpers and a clear progression; finds/collectibles.
8. Smooth on a phone (render scale), no errors in the console.
9. The full "Making money" set above is in and tuned: every rewarded ad, timed offer tags, light interstitials, all IAPs, restore. Pacing bot runs both with and without ads.
10. Icon, splash, store name, bundle ID.
11. Smoke test, screenshot script and the playthrough bot (keen, casual and boosted) all reach the ending cleanly; the chaos, visual and browser runs are clean; CI green.

## App Store pipeline

- **Status (2026-11-10): the build half works; signing waits for the owner's keys; two games (Burn Down a Forest, Burn a Cardboard City) have the real ads and purchases code with placeholder ids; the privacy policy and support pages are on the site.** Nothing is on the App Store.
- **What exists.** `.github/workflows/ios.yml` ("iOS build") runs on a Mac runner. `tools/ios_preset.py` writes each game's iOS export preset at build time (nothing about iOS is kept in the game folders); `tools/ios_build.sh` imports, runs the smoke test, has Godot write the Xcode project and builds it.
  - `check` mode: an unsigned build that needs no Apple account. It runs for every game whenever the pipeline files change, and on request for one game. All four games pass (arm64, landscape, iPhone and iPad, iOS 14+, built with Xcode 26.6, under two minutes a game; Burn Down a Forest is about 83 MB unsigned).
  - `testflight` mode: signs with the App Store Connect API key and uploads to TestFlight. Started by hand only. **Not yet run for real** (no secrets yet), so expect the first run to need a fix or two: it archives unsigned and lets Xcode sign with a cloud-managed certificate on upload, and falls back to automatic signing if that fails.
  - Flavors: `playtest` (developer tools, pretend ads and purchases; for trying a game on a real phone) and `release` (what ships). Uploading a `release` build is refused until `store/<slug>/ios.json` says `"real_monetization": true`.
  - Nothing in the pipeline submits an app for review. That stays a manual step.
- **Store listings** live in `store/` (one folder per game, outside the game folders): draft name, subtitle, keywords, description, products, age-rating answers, the support and privacy links and the game's support answers in `listing.json`, checked by `python3 tools/store_check.py`. `store/README.md` has the owner's step-by-step for the first TestFlight build and the list of what a game still needs before review.
- **Needs from the owner:** repo secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` (the owner adds them; Claude never handles keys), a registered bundle id and an App Store Connect app record per game (Apple only lets a person create them). Steps in `store/README.md`.
- The business's Apple Developer account exists (Plainworth is on it).

**Next on the shipping list (in order):**
1. **Real ads and purchases** behind `MonetizationProvider`, off until the owner's ids exist. **Copy the stack the reference game already ships with** (found 2026-11-09 on Melt a Glacier's publish branch, the newest `claude/project-thread-*` branch in its repo, not `main`; this replaces the plugin notes that stood here earlier today):
   - Godot **4.7.2** (both plugins need it), the Poing Studios AdMob plugin v5.1.0 (`addons/admob`) and the GodotX RevenueCat plugin 2.6.0 (`addons/godotx_revenue_cat`), pinned in `tools/plugin_versions.env` and fetched by `tools/fetch_plugins.sh`.
   - `scripts/monetization/`: `mobile_provider.gd` (the real provider), `admob_ads.gd` (rewarded and interstitial ads, Google's consent form, the iPhone tracking prompt, test ads in debug builds, retry with back-off), `revenuecat_store.gd` (purchases, restore, local prices), `store_config.gd` (the ids that ship in the app) and `tests/release_check.gd` (a store build stops while any id is a placeholder).
   - `docs/LAUNCH.md` there is the owner's checklist for Apple, AdMob and RevenueCat; `docs/privacy.html` is the privacy policy page; iOS minimum is 15.0.
   - So the studio games move to Godot 4.7.2 when they take this stack (a studio-wide change: CI, both engines' instructions and every game's tests). Do it on one game first and let the iOS check build prove it compiles and links.
   - Melt a Glacier uploads to TestFlight through Codemagic, whose free plan is 500 Mac minutes a month (about 15 to 20 builds). The studio games keep the GitHub Actions pipeline above, which has no such cap on a public repo; the same App Store Connect key works for both.
   - Product ids: Melt a Glacier uses the bare ids `remove_ads_2x` and `golden_hair_dryer`. Ids can't repeat across the account's apps, so every studio game must use `<bundle id>.<key>` (all four studio games do now).
   - **Taking the stack to the next game** (done for Burn a Cardboard City on 2026-11-10; Dig to the Core and Drain an Ocean are left): copy `addons/` and `scripts/monetization/{mobile_provider,admob_ads,revenuecat_store,store_config,monetization_provider}.gd` plus `tests/{release_check,monetization_test}.gd` from a game that has them; set the bundle id, entitlements and names in `store_config.gd`; in `monetization.gd` pick the provider per build, prefix the product ids, add `restore_done`, the privacy calls and the grant-once rule; make the stub answer every request and keep "(test)" for playtest builds; `godot_version.txt` 4.7.2, the two editor plugins in `project.godot`, the long exclude filter in `export_presets.cfg`; a "Privacy policy" and an "Ad privacy choices" entry in the game's own settings UI and a note when a restore finishes; developer tools only with the `playtest` feature; then `store/<slug>/ios.json` and the listing's product ids, entitlements and `support` answers. The plumbing is shared; everything the player sees stays the game's own.
2. **Store assets:** a 1024 px icon per game (`store/<slug>/icon_1024.png`), screenshots at App Store sizes shot from the game's own screenshot script once it is ready to play, and a short preview clip.
3. **A privacy policy and a support page** on the play-links site (Apple requires both links), plus `app-ads.txt` for the ad network. **Done 2026-11-10, except two owner steps.** One page each for all the games: `site/privacy.html` and `site/support.html`, built by `tools/site_pages.py` (called from `tools/build_site.py`) into `/privacy/` and `/support/` on the site; the support page gets a section per game from the `support` block in `store/<slug>/listing.json`, and `tools/store_check.py` (now also a CI step) checks the links, the sections and that both pages build. The link for every game's `store_config.gd` is `PRIVACY_POLICY_URL := "https://gamequarryllc.github.io/game-studio/privacy/"` (Burn a Cardboard City has it; Burn Down a Forest's is still empty: a small change for whoever works in that folder next, together with the placeholder count its `tests/monetization_test.gd` expects, five today and four afterwards). Owner steps (in `store/README.md`): set the `SUPPORT_EMAIL` repository variable (no email address is ever committed; until then the pages point at the issue page, and `status.json` says `"contact": "issue page"`), and `app-ads.txt`, which ad networks read only from the root of the Marketing URL's host, so it needs an organisation root site or a custom domain (`site/app-ads.txt` is published only once it holds a real line).
4. **Discovery:** a featuring nomination per launch (two weeks' notice at least), vertical clips cut from the playthrough bot for short-video posts, a "more from Game Quarry" shelf on ending screens once two games are live.

## Owner feedback log

- 2026-11-08: Build all 10, Claude picks the order. Use the plan as much as needed. Wants pings with status, to come back and playtest, and fresh idea lists when the queue runs dry.
- 2026-11-08: "The goal is to make money": every game needs incentives to spend, through IAPs or rewarded ads ("watch an ad for 2x mining"). → Added the "Making money" section; monetization is part of first playable.
- 2026-11-09: Keep personal information (names and anything like it) out of the public repo, and keep checking. → Added the Privacy section and `tools/privacy_check.py`.
- 2026-11-09: Screenshots "look pretty sweet so far". Strain to make the UI and game NOT look AI-generated; put in the leg work. Models must look very good too: use Blender or custom-build them as needed. → Added "Look and feel" (art bible, Blender pipeline, custom icons, fresh-eyes critic). Next free slot: a full art pass on Burn Down a Forest before starting a new game.
- 2026-11-09: Play every game end to end to work out the quirks; use temporary dev boosts (time speed-up, 10x income) for speed. → Added "Playtesting" (dev boosts, playthrough bot, chaos, visual and browser runs, `tools/browser_check.py`, CI playthrough). Each game gets a QA block after first playable and after its art pass.
- 2026-11-09: The heart of the goal: earn at least $200/month to cover the studio's running cost; find the markets and methods that get there. → Added 'North star', research/market.md and money-first priorities.
- 2026-11-09: Melt a Glacier is the first game to go through to the App Store; the owner is playing it through before sending it to review. → It ships from its own repo's publish branch, which another conversation is working on (real ads, purchases, TestFlight and a launch checklist are already there). The studio engines don't touch that repo; the studio games follow with the same ad and purchase stack.

- 2026-11-10: Keep the daily backstop daily (not more often): the plan's usage limit is hit quickly by the builders. → No schedule change; if the conversation loop goes idle, the owner nudges it.

## Block log (newest first; roll entries older than a week into one summary line)

- 2026-11-10: daily backstop: two shipping-list jobs; the research was a day old, so no refresh and no change to the queue order. (1) **Shipping-list item 3 done:** one privacy policy and one support page for all the games on the play-links site (`/privacy/`, `/support/`; sources in `site/`, built by `tools/site_pages.py`), `support_url` and `privacy_url` in every listing, a `support` block per game that has the real stack, `tools/store_check.py` extended and now a CI step. No email address is committed: the pages take the contact from the `SUPPORT_EMAIL` repository variable and point at the issue page until the owner sets it. `app-ads.txt` is only read from the root of the Marketing URL's host, which a project site can't serve: the two ways round it are in `store/README.md`. (2) **Burn a Cardboard City ship prep** (item 1 on the second game): Godot 4.7.2, AdMob + RevenueCat behind the provider with placeholder ids, product ids `com.gamequarry.burnacardboardcity.<key>`, `release_check.gd` (four placeholders left; the privacy link is in), `monetization_test.gd` (37 checks), a "Privacy policy" and "Ad privacy choices" entry in the box's settings, and the release leftovers from its review 3 (no test label or developer tools outside playtest builds, the HUD fades out under the starter offer and its price tag stays on screen, whole coins, time in words on the ending). Smoke 122, boosted, keen (22:12), chaos and the browser run pass; the web build and the iOS check build both passed on GitHub (AdMob and RevenueCat linked, 120 MB unsigned). The recipe for the next game is under "App Store pipeline". (3) Health: twice today a push built fine but its Pages deploy sat at "syncing files" for ten minutes and timed out (the Dig polish push at 08:19 UTC and this entry's first push at 09:10 UTC); nothing in the build was wrong and the next push deployed everything each time. Re-running the failed deploy job does not help: the timed-out deployment is cancelled under the commit's own id, so the re-run is "cancelled" at once; only a new commit gets a fresh deployment. If it keeps happening, look at the size of the site (four games, each with its own copy of the engine) before blaming GitHub. Privacy check clean. **Left for the conversation loop:** set `PRIVACY_POLICY_URL` in Burn Down a Forest's `store_config.gd` (its folder was inside the six-hour window; its Settings chapter already shows the link once the URL is set, but its `tests/monetization_test.gd` expects five placeholders and must expect four after the change, as the city's does); the stack on Dig to the Core and Drain an Ocean once their current passes land; a store icon and screenshots for the city. **Needs the owner:** an AdMob account with an app and two ad units per game (the same account serves Melt a Glacier), the RevenueCat keys, and the `SUPPORT_EMAIL` variable.
- 2026-11-10 07:30 UTC: **In progress in the conversation loop (daily backstop: don't work on these):** the Dig to the Core polish finish and the Drain an Ocean fixes + QA (uncommitted, in the loop's session; backups on `wip/dig-polish` and `wip/ocean-fixes`), and **shipping-list item 2 for Burn Down a Forest**: the 1024 px store icon (`store/burn-down-a-forest/icon_1024.png`) and App Store screenshots. Backstop: take item 3 instead (privacy policy and support pages on the site, `app-ads.txt`), or Burn a Cardboard City.
- 2026-11-10: The forest ship-prep commit passed both the web build and the iOS check build on GitHub (Godot 4.7.2 with the AdMob and RevenueCat plugins compiles and links for iPhone). Two session restarts (about 05:40 and 06:20 UTC) stopped every builder; none could be resumed (transcripts too large), so the Dig polish and Ocean fixes work is backed up on `wip/dig-polish` and `wip/ocean-fixes` and fresh builders continue it. Added the PROGRESS.md rule.
- 2026-11-10: **Burn Down a Forest ship prep landed** (shipping-list item 1): the game is on Godot 4.7.2; CI and the iOS pipeline build each game with its declared Godot version and fetch the native plugin halves (`tools/fetch_plugins.sh`, pinned in `tools/plugin_versions.env`; binaries gitignored); real AdMob + RevenueCat behind the provider with placeholder ids, `release_check.gd` and `monetization_test.gd`; product ids `com.gamequarry.burndownaforest.<key>`; debug leftovers out of release builds. Smoke 104, boosted, keen (27:51), chaos, browser pass. It earns nothing until the owner adds the RevenueCat key, AdMob app and ad unit ids and a privacy URL (steps in `store/README.md`). Shared tooling is free again for the backstop. Next for the forest: store icon and screenshots; then the iOS stack on the other games, one at a time.
- 2026-11-10 ~04:00 UTC (landed 06:00, see below): **Claimed by the conversation loop: shipping-list item 1 on Burn Down a Forest** (move it to Godot 4.7.2, copy Melt a Glacier's AdMob + RevenueCat stack behind the provider interface, `<bundle id>.<key>` product ids, release check, debug leftovers out of release builds, and the CI and iOS-pipeline changes needed for a per-game Godot version). Daily backstop: until this lands, don't edit `.github/workflows/`, `tools/ios_*`, `tools/fetch_plugins.sh` or the forest's folder; take items 2-3 instead (privacy policy and support pages on the site, `app-ads.txt`, 1024 px icons, store screenshots for the other games).
- 2026-11-10: Burn Down a Forest fourth critic: **Almost** (review 4). Per the North star its next block is ship prep, in the conversation loop: real AdMob + RevenueCat behind the provider interface (copying Melt a Glacier's publish-branch stack), debug leftovers out, store icon and screenshots, then the top review-4 art fixes. The backstop can apply the same ads/purchases stack to the other games once this lands.
- 2026-11-10: The conversation loop stalled from about 18:20 UTC (all builders stopped at the plan's usage limit) until 03:42 UTC (its session was idle, so its own wake-ups didn't arrive); the daily backstop kept the studio moving. Resumed the Dig to the Core polish, the Drain an Ocean fixes and QA, and the forest's fourth critic. Eat a Giant Cake back to `queued` per the North star (its builder had written no files).
- 2026-11-09: daily backstop, correction: the earlier note that Melt a Glacier still had pretend ads came from reading only its `main` branch. Its publish branch already has real AdMob ads, RevenueCat purchases, a TestFlight build and a launch checklist; what it still lacks are the owner's AdMob and RevenueCat ids (blank in its `store_config.gd` as of 22:56 UTC). The shipping list under "App Store pipeline" now says to copy that stack. Lesson: check every recent branch of a repo, not just `main`, before describing its state.
- 2026-11-09: daily backstop: a money-first day; every game folder had a commit in the last 6 hours, so no game was touched. (1) Added the North star and wrote `research/market.md`: a free game of ours is worth roughly $0.03 to $0.34 an install (estimate), so the target needs about 2,500 installs a month across the catalog in the base case, and installs, not ad tuning, are the constraint; short incremental games sell far better on Steam (pitched to the owner, not started). (2) Queue reordered by expected money per hour of work and time to ship: games in progress stay first, closest to ready first; queued games are now Dust a Haunted House, Unbury a Pyramid, Erase a Mountain, then the two melting games last (least new, most similar-app risk). No new game starts until the first is in App Review. (3) Built the iOS pipeline (`.github/workflows/ios.yml`, `tools/ios_preset.py`, `tools/ios_build.sh`): all four games pass an unsigned iOS build on a Mac runner; the TestFlight upload is written but untested until the owner's secrets exist; release uploads are refused while ads and purchases are pretend. (4) Draft store listings for the three first-playable games in `store/`, checked by `tools/store_check.py`, with the owner's steps in `store/README.md`. (5) Health: the three failed site builds at 18:07 to 18:17 UTC had no build job at all (a hiccup on GitHub's side, not our code); the next pushes built and deployed cleanly. A push within about 7 minutes of the last one cancels that run before it deploys, so space pushes out. (6) Seen in Burn Down a Forest's screenshots, for its next pass: shop prices still say "(test)" (the stub's `price_string`), and the "buy" label on the price tags is small for a thumb. Next for the backstop: real ads and purchases (the shipping list under "App Store pipeline"), then icons and store screenshots.
- 2026-11-09: Burn a Cardboard City third critic: **Almost** again (polish pass 1 done; review 3 is the list for its last budgeted pass). Added the polish budget (two passes, then new games; more on owner feedback).
- 2026-11-09: Burn Down a Forest polish pass done (composed bonfires, sculpted keeper, meadow growth band, dawn-ending shot, lifted shadows, four oak shapes, house-size village, illustrated notebook pages, Keeper Fell font with lining figures, ink parcel offer, seed pods, Elder on the skyline). Smoke 94; boosted, keen (28:52), chaos and browser pass; fixed an Elder-aim stall. Next: fourth critic. Started Eat a Giant Cake.
- 2026-11-09: Burn a Cardboard City polish pass done (hand-painted scorch, rooted fire clusters with smoke, darker dressed floor, real egg-carton castle, tissue trees and paper lawns, gripping hands, insert-tray shop, HUD fixes, box variety, crane-shot ending). Smoke 104; boosted (x2) and keen (21:18) pass; browser passes. One engine crash at startup under heavy load, not reproduced. Next: third critic. Started the Dig to the Core polish pass.
- 2026-11-09: Dig to the Core third critic: **Almost** → first playable. Review 3 is its polish list; the polish pass starts in the next free slot.
- 2026-11-09: Dig to the Core underground round 3 done (per-layer hand-painted rock and mood, soft headlamp, lava crust, glowing crystals, molten core, rebuilt underground props, gloves and sleeves, the shop as the shack counter, one brass depth tube, phone-first text >= 11 px). Smoke 75, boosted and keen (25:15) pass. Next: third critic. Started Drain an Ocean fixes + QA.
- 2026-11-09: Drain an Ocean first build handed back (one falling water level, 11 cut-off pools drained by barges, rescues into an idle-earning aquarium, salvage, 5 pump tiers, pelicans and crabs, sea seepage at depth for pacing, nautical-chart UI with signal-flag buttons; 71 smoke checks; browser check passes). Held at `building` until the critic and a QA playthrough. Started the Cardboard City polish pass.
- 2026-11-09: Burn a Cardboard City second critic: **Almost** → first playable. Review 2 is its polish list; the polish pass starts in the next free slot.
- 2026-11-09: Burn a Cardboard City review-1 fixes + QA done: cut-paper fire with tissue smoke, 16 Blender burnt states, district materials, hands holding tools, warm key light, FOV 60 with giant props, physical-object shop and matchbox offer, stencil type, bottle-cap controls, paper rockets. Playthrough passes keen (21:48), casual (50:04), boosted; chaos, visual and browser runs pass; 13 bugs fixed (95 smoke checks). Next: second critic. Started the forest polish pass (review 3).
- 2026-11-09: Burn Down a Forest third critic: **Almost** → first playable (the studio's first). Review 3 is its polish list (fire at scale, sculpted keeper, meadow edges, ending, darker-than-readable interior, number figures and text size, village models, notebook pages, offers, hearts and Elder silhouette).
- 2026-11-09: Burn Down a Forest review-2 fixes + QA done: inked flipbook fire with smoke and ground light, moon key and rim light, camera that never hides the keeper, rebuilt round keeper, carved oaks and a landmark Elder, hand-laid village and meadow drifts, notebook and ending fixes. Playthrough passes keen (30:10), casual (50-61 min), boosted; chaos and browser runs pass; 77 smoke checks. Next: third critic. Started Dig to the Core art round 3 (the underground).
- 2026-11-09: Started Drain an Ocean in the conversation loop (tap-to-play isometric bay diorama, global water level plus isolated pools, creature rescues into an idle-earning aquarium).
- 2026-11-09: Dig to the Core critic fixes + QA done: all 12 review items, playthrough bot passes keen (25:47), casual (~80 min, varies 63-92) and boosted (12:22 game time in ~2.5 min real), chaos/visual/browser runs clean, 12 bugs fixed and added to the smoke test (72 checks). Next: second critic.
- 2026-11-09: The daily backstop's first run stopped at the plan's usage limit (08:26 UTC) right after marking Drain an Ocean as building; nothing was built, so it's back to `queued` and the conversation loop starts it when a builder slot frees. Builders also paused at the limit 08:30-09:10 UTC and were resumed (Dig's builder couldn't resume: its partial work was checkpoint-committed and a fresh builder is finishing).
- 2026-11-09: daily backstop: all three games in progress had commits in the last 6 h, so it started the next queued game, Drain an Ocean (in progress in the backstop session; if `games/drain-an-ocean/` is still missing after 2026-11-09 16:00 UTC, treat it as abandoned and start it fresh).
- 2026-11-09: Burn Down a Forest art pass done: all 12 review items (41 SVG icons, charred-plank HUD, paper notebook, IM Fell/Alegreya/Caveat Brush, 48 Blender models, inked cartoon flames, composed village spawn, measured palette, meadow drifts, phone-first hints, sentence-case copy). Next: second critic review, then fixes + full QA playthrough.
- 2026-11-09: Burn a Cardboard City builder handed back (giant first-person view, collapsing buildings with chain bonuses, toy fire trucks, fan wind, 4 tools, cardboard-box shop, stubbed money set, 29 Blender models, SVG icons; 63 smoke checks). Held at `building` until the critic and a QA playthrough are done.
- 2026-11-09: In progress in the conversation loop (don't start these elsewhere): critic + fixes + QA for Burn a Cardboard City and Burn Down a Forest; Dig to the Core critic fixes + full QA playthrough.
- 2026-11-09: Dig to the Core builder handed back (10 streamed zones, 7 tools, lift, 16 finds, full stubbed money set, 18 Blender models, 51 SVG icons, brass-and-enamel UI; 52 smoke checks). Held at `building` until the fresh-eyes critic and a QA playthrough are done.
- 2026-11-09: Burn Down a Forest reached first playable (fire spread with wind, 6 tools, notebook shop, stubbed ads/IAPs, save, sound, ending; 45 smoke checks). Next: pacing bot, music, fix the odd pink blocks near spawn, finds, real-phone test.
- 2026-11-09: Privacy pass: personal details removed from the repo and its history; privacy check added (pre-push and CI).
- 2026-11-08: Studio set up. Started Burn Down a Forest and Dig to the Core.
