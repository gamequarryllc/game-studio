# Studio state (read this first every work block)

This repo is a small game studio. Claude builds mobile games here in a loop,
polishes them, and pings the owner to playtest. This file is the loop's memory:
the conversation that runs the loop gets long and is summarized over time,
so anything that must survive goes here.

- **Queue and per-game status:** `queue.json` (order = priority). The play-links page reads it too.
- **Play links:** https://gamequarryllc.github.io/game-studio/ (each game at `/<slug>/`). Every push to `main` rebuilds them (`.github/workflows/web.yml`). Per-game build results: `/status.json` on the same site.
- **Each game:** its own Godot 4.4 project in `games/<slug>/`, with a `NOTES.md` (design, what's done, what's next, known bugs). Status lives only in `queue.json`.
- **Reference game:** `gamequarryllc/melt-a-glacier` (Godot 4.4, Compatibility renderer, first-person landscape, phone touch controls, generated audio, stub monetization, smoke/pacing/screenshot tests). It sets the quality bar. Copying small utilities from it is fine; copying its look, HUD, shop or concept is not (see Apple 4.3 below).

## How the loop runs

1. The loop lives in the owner's studio conversation with Claude (started 2026-11-08). Claude schedules its own wake-ups there with `send_later`: at the **start** of each work block, check `list_triggers` for a pending studio wake-up and schedule one if there isn't (one at a time, never two, so they can't multiply).
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

**Process, every time a game is shown to the owner:**
1. Screenshots plus the model contact sheet.
2. A fresh-eyes critic agent that has NOT seen the build process reviews them with one question: "what here looks AI-generated, generic or template-made, and what would a skilled indie artist change?" It must return concrete findings.
3. The builder fixes every finding, then re-shoots. A game isn't "first playable" or "ready to play" while the critic still flags it.

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

- Status: not set up. Godot iOS builds need macOS. Plan: a GitHub Actions macOS job that exports the Xcode project, builds, signs with an App Store Connect API key and uploads to TestFlight.
- Needs from the owner (only when the first game is ready): repo secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` (the owner adds them; Claude never handles keys), and an App Store Connect listing per game (Apple only lets a person create it).
- The business's Apple Developer account exists (Plainworth is on it).

## Owner feedback log

- 2026-11-08: Build all 10, Claude picks the order. Use the plan as much as needed. Wants pings with status, to come back and playtest, and fresh idea lists when the queue runs dry.
- 2026-11-08: "The goal is to make money": every game needs incentives to spend, through IAPs or rewarded ads ("watch an ad for 2x mining"). → Added the "Making money" section; monetization is part of first playable.
- 2026-11-09: Keep personal information (names and anything like it) out of the public repo, and keep checking. → Added the Privacy section and `tools/privacy_check.py`.
- 2026-11-09: Screenshots "look pretty sweet so far". Strain to make the UI and game NOT look AI-generated; put in the leg work. Models must look very good too: use Blender or custom-build them as needed. → Added "Look and feel" (art bible, Blender pipeline, custom icons, fresh-eyes critic). Next free slot: a full art pass on Burn Down a Forest before starting a new game.
- 2026-11-09: Play every game end to end to work out the quirks; use temporary dev boosts (time speed-up, 10x income) for speed. → Added "Playtesting" (dev boosts, playthrough bot, chaos, visual and browser runs, `tools/browser_check.py`, CI playthrough). Each game gets a QA block after first playable and after its art pass.

## Block log (newest first; roll entries older than a week into one summary line)

- 2026-11-09: daily backstop: all three games in progress had commits in the last 6 h, so it started the next queued game, Drain an Ocean (in progress in the backstop session; if `games/drain-an-ocean/` is still missing after 2026-11-09 16:00 UTC, treat it as abandoned and start it fresh).
- 2026-11-09: Burn Down a Forest art pass done: all 12 review items (41 SVG icons, charred-plank HUD, paper notebook, IM Fell/Alegreya/Caveat Brush, 48 Blender models, inked cartoon flames, composed village spawn, measured palette, meadow drifts, phone-first hints, sentence-case copy). Next: second critic review, then fixes + full QA playthrough.
- 2026-11-09: Burn a Cardboard City builder handed back (giant first-person view, collapsing buildings with chain bonuses, toy fire trucks, fan wind, 4 tools, cardboard-box shop, stubbed money set, 29 Blender models, SVG icons; 63 smoke checks). Held at `building` until the critic and a QA playthrough are done.
- 2026-11-09: In progress in the conversation loop (don't start these elsewhere): critic + fixes + QA for Burn a Cardboard City and Burn Down a Forest; Dig to the Core critic fixes + full QA playthrough.
- 2026-11-09: Dig to the Core builder handed back (10 streamed zones, 7 tools, lift, 16 finds, full stubbed money set, 18 Blender models, 51 SVG icons, brass-and-enamel UI; 52 smoke checks). Held at `building` until the fresh-eyes critic and a QA playthrough are done.
- 2026-11-09: Burn Down a Forest reached first playable (fire spread with wind, 6 tools, notebook shop, stubbed ads/IAPs, save, sound, ending; 45 smoke checks). Next: pacing bot, music, fix the odd pink blocks near spawn, finds, real-phone test.
- 2026-11-09: Privacy pass: personal details removed from the repo and its history; privacy check added (pre-push and CI).
- 2026-11-08: Studio set up. Started Burn Down a Forest and Dig to the Core.
