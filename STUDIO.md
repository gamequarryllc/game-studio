# Studio state (read this first every work block)

This repo is Alex's game studio. Claude builds mobile games here in a loop,
polishes them, and pings Alex to playtest. This file is the loop's memory:
the conversation that runs the loop gets long and is summarized over time,
so anything that must survive goes here.

- **Queue and per-game status:** `queue.json` (order = priority). The play-links page reads it too.
- **Play links:** https://gamequarryllc.github.io/game-studio/ (each game at `/<slug>/`). Every push to `main` rebuilds them (`.github/workflows/web.yml`). Per-game build results: `/status.json` on the same site.
- **Each game:** its own Godot 4.4 project in `games/<slug>/`, with a `NOTES.md` (design, what's done, what's next, known bugs). Status lives only in `queue.json`.
- **Reference game:** `gamequarryllc/melt-a-glacier` (Godot 4.4, Compatibility renderer, first-person landscape, phone touch controls, generated audio, stub monetization, smoke/pacing/screenshot tests). It sets the quality bar. Copying small utilities from it is fine; copying its look, HUD, shop or concept is not (see Apple 4.3 below).

## How the loop runs

1. The loop lives in Alex's Claude conversation "how do i be more proactive with claude usage" (started 2026-11-08). Claude schedules its own wake-ups there with `send_later`: at the **start** of each work block, check `list_triggers` for a pending studio wake-up and schedule one if there isn't (one at a time, never two, so they can't multiply).
2. Each block: read this file and `queue.json` → apply any new feedback from Alex first → pick the next work (two games at a time, top of the queue first) → hand each game to a worker agent with a full brief (workers never run git) → commit each game folder and push → check the Actions run and `status.json` → update this file and `queue.json` → ping Alex only on milestones.
3. Alex has said: use his plan as much as needed. Run continuously. If the plan limit hits, the loop pauses and resumes after the reset.
4. Stop working on a game when it meets the polish bar below; mark it `ready-to-play` and ping. When every game is ready or parked, pitch 10 new ideas in the conversation and wait for Alex to pick.

## Pings (push notification + short message in the conversation)

- A game reaches **first playable** (play link works, core loop is fun for 5 minutes).
- A game reaches **ready to play** (polish bar met).
- Something needs Alex (a decision, an account, a store step).
- One evening roundup per day (what moved, what's next). No pings for routine blocks.

## Rules

- Alex's feedback jumps the queue. Log it below with the date, then act on it.
- Every game must be **distinct** in core mechanic, art direction, HUD/UI theme and audio. Apple rejects "multiple similar apps using a repackaged app template" (guideline 4.3). No shared visible template across games.
- Keep the word "arson" out of all titles and store text.
- Fire games are cartoonish and fictional (cursed forest, cardboard city). No real places, no people harmed.
- Bundle IDs: `com.gamequarry.<slug without dashes>`. Store names checked for availability before launch.
- Playtest builds include developer tools (`playtest` feature tag) and fake ads/purchases, like Melt a Glacier.

## Making money (the point of the studio)

Alex's goal is revenue. Every game is designed around its monetization from the first build, not bolted on at the end. Reference implementation: Melt a Glacier's `scripts/monetization/` (provider interface + stub), `scripts/ad_offers.gd` and `Balance.AD_REWARDS` (copy the architecture, not the look).

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

**Going live (later, needs Alex's accounts):** AdMob for rewarded and interstitial ads, RevenueCat for purchases (already used by Plainworth), store products created per game.

## First playable (minimum for the first ping)

Loads on a phone from the play link in landscape, touch controls work, the core action is satisfying, money comes in, at least 3 tools and a working shop, the 2x rewarded-ad boost and the shop's Remove Ads offer work (stubbed), saves progress, smoke test passes, screenshots checked by eye.

## Polish bar (ready to play)

1. A full run of 30 to 60 minutes with a real ending and stats screen (pacing bot proves it: keen player ~30, casual ~60).
2. Phone controls feel right; desktop keys work too.
3. First-run hints.
4. Sound effects and music made for the game (generated, no stock audio), with volume and mute.
5. Save/load, autosave, and save on backgrounding.
6. Its own art direction, HUD and UI theme.
7. Shop with tools, upgrades and helpers and a clear progression; finds/collectibles.
8. Smooth on a phone (render scale), no errors in the console.
9. The full "Making money" set above is in and tuned: every rewarded ad, timed offer tags, light interstitials, all IAPs, restore. Pacing bot runs both with and without ads.
10. Icon, splash, store name, bundle ID.
11. Smoke test, pacing test and screenshot script all pass; CI green.

## App Store pipeline

- Status: not set up. Godot iOS builds need macOS. Plan: a GitHub Actions macOS job that exports the Xcode project, builds, signs with an App Store Connect API key and uploads to TestFlight.
- Needs from Alex (only when the first game is ready): repo secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` (he adds them; Claude never handles keys), and an App Store Connect listing per game (Apple only lets a person create it).
- Apple Developer account exists (Plainworth is on it, team owner `appkingmaker` on Expo).

## Alex's feedback log

- 2026-11-08: Build all 10, Claude picks the order. Use the plan as much as needed. Wants pings with status, to come back and playtest, and fresh idea lists when the queue runs dry.
- 2026-11-08: "The goal is to make money": every game needs incentives to spend, through IAPs or rewarded ads ("watch an ad for 2x mining"). → Added the "Making money" section; monetization is part of first playable.

## Block log (newest first; roll entries older than a week into one summary line)

- 2026-11-08: Studio set up. Started Burn Down a Forest and Dig to the Core.
