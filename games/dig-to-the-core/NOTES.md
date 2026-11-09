# Dig to the Core: notes

## Art bible

**Idea.** A 1920s mining company's assay office meets a cartoon cutaway of the Earth. Above ground: a sunny field, a tin-roofed shack, a timber headframe. Below: chunky faceted rock in a warm headlamp pool, ore glinting, and a brass depth gauge counting you down to the core.

**Palette** (sRGB; every UI and model colour is one of these or a tint of one):

| Swatch | Hex | Role |
|---|---|---|
| Lamp Amber | `#F2B544` | headlamp light, money, highlights, the core |
| Hoist Brass | `#C08A3E` | gauge frames, plates, rivets |
| Enamel Cream | `#EFE3C8` | sign faces, text on dark |
| Signal Red | `#B5332A` | the Dig button, warnings, sign lettering |
| Soot Iron | `#241C17` | panels, outlines, shadows |
| Verdigris | `#4FA391` | copper ore, "go/buy" plates |
| Topsoil Umber | `#6B4A2E` | earth, wood, the field's dirt |

Value contrast (WCAG): cream on soot 13.2:1, amber on soot 9.1:1, soot on brass 5.5:1, red on cream 4.8:1, amber on umber 4.3:1. Cream on verdigris is only 2.4:1, so cream text on verdigris plates always carries a soot outline (to do: switch those to soot lettering).

**Fonts** (both SIL OFL 1.1, licences in `fonts/`):
- **Rye** (Sorkin Type), a woodtype face like old mining-company signage: signs, titles, layer names, the tool plate. Never for sentences.
- **Zilla Slab** 500 and 700 (Typotheque for Mozilla): everything people read, numbers and buttons.

**UI motif.** Riveted brass and blackened iron like the dials on a mine hoist, plus worn cream enamel signs. The shop is the shack itself (`WoodBox`: plank wall, pegboard, ledger, drawer cabinet), and signs in the world have their lettering painted into enamel textures (`art/textures/make_signs.py`), never floating text. Plates are drawn in code (`RivetBox`): hand-cut uneven chamfers, rivets, a glint on the top edge, grain specks, fine scratches and chipped paint, and each plate wears differently. The first-run hint is a cream enamel sign hung slightly crooked; the offer tag hangs off-true; the money gauge sits left of centre. The depth gauge is a brass tube with a glass window, the main HUD element.

**Icons.** Drawn for the game (`art/icons/make_icons.py` writes `ui/icons/*.svg`): one style, a thick soot outline, flat palette fills, one cream highlight, a little hand wobble. No emoji anywhere in the UI.

**Shape language.** Chunky, faceted and a little top-heavy; bevelled hard edges; working ends of tools slightly oversized; nothing perfectly straight (boards lean, the roof sags, fence posts tilt). Round only where it's alive (moles). Rock is faceted (the shader mixes flat face normals in) with strata bands, pebbles and baked nooks.

**Each layer its own rock** (`DigField.STYLE`, `textures/rock_layers.png` from `art/textures/make_layers.py`): crumbly soil with root hairs; smeared, laminated clay; jointed grey stone and pink granite; cross-bedded shelly sandstone; an ochre cobble conglomerate; dark faceted crystal rock with glinting veins; black vesicular basalt whose cracks glow; folded granular peridotite with hot seams; streaming molten iron; bronze core crystal split by molten amber. Each has its own bed thickness and a second rock in alternate beds, its own loose stones, its own dark (fog) and a cool fill. The lamp is a wide, soft spot; a cool bounce near you keeps its edge soft.

**Copy.** Short, in-world, sentence case, almost no exclamation marks. "Back at the shack. The counter's open."

**Inspirations (not games):** 1920s mining-company stock certificates and enamel safety signs; geology-textbook cutaway diagrams of rock strata; brass pressure gauges and hoist dials in old engine houses.

## The game

You start in a sunny field next to the supply shack and the lift's headframe. Straight down is the planet: ten layers, 24 m each, 240 m to the core. Hold Dig at the crosshair to dig; every bit of rock you dig out pays, deeper rock is harder and pays more per cubic metre, ore veins (they glint in the headlamp) pay 3 to 14 times their rock, and 16 buried finds pop out for a lump sum. Spend at the shack on tools, upgrades and the crew. Digging out the core is the ending.

- **Layers:** Topsoil, Clay, Bedrock, Fossil Bed, Dinosaur Graveyard, Crystal Caves, Lava Lakes, Mantle, Outer Core, Inner Core (`Balance.ZONES`). Each has two rock types, one or two ores and some natural caves.
- **Tools:** Shovel, Pickaxe, Jackhammer, Drill, Dynamite (thrown, blasts craters), Laser Drill, Earth-Borer. Each has its own model, animation, particles and sound.
- **Upgrades:** Dig Power, Tool Size, Ore Value, Headlamp Range.
- **Crew:** Moles and Robo-Moles dig around the lift stop (the bottom of your shaft), even while you shop.
- **Lift:** the cage at the headframe takes you down to your deepest point; the lift stop (a lamp post that follows you down) takes you back up. A ride is a short cut-scene inside the moving cage.
- **Engine:** `DigField` is a density grid (0.5 m) per layer, meshed in 8x8x8 chunks with surface nets, streamed: the layers around you (and around the crew) are live, the rest are packed into save strings. Untouched layers regenerate from the seed. Raycasts march the grid, so aiming never waits for a mesh.

**Controls.** Phone: left thumb walks, right side drags to look, hold Dig, Jump, and a context button (lift up/down, shop) when you're near one. Desktop: WASD, mouse look (click to grab), hold left click, Space, E for the lift and the shop, B takes an offer, M mutes, Esc frees the mouse.

## Money

All stubbed through `scripts/monetization/` (provider interface + `StubMonetizationProvider`, same architecture as the reference game). Playtest builds fake ads and purchases and count them in the shop's playtest tools.

Rewarded placements (AdMob ad unit keys):

| Placement | What it gives |
|---|---|
| `boost_2x_dig` | 2x digging (swing twice as fast) for 5 min, stacks to 15 |
| `instant_cash` | about 3 minutes of income, never more than 60% of the next tool |
| `helper_rush` | the crew digs 3x for 3 min |
| `double_find` | a find pays out again (button on the find card for 9 s) |

Interstitial placement: `shop_close` (closing the shop; at most every 4 min, none in the first 5 min, none for 3 min after a rewarded ad, never with Remove Ads).

Products (App Store Connect / Play Console ids, prefixed with the bundle id so they stay unique in the account):

| Product id | Type | Price |
|---|---|---|
| `com.gamequarry.digtothecore.remove_ads_2x` | non-consumable | $4.99 |
| `com.gamequarry.digtothecore.starter_pack` | non-consumable, offered once after 10 min | $1.99 |
| `com.gamequarry.digtothecore.golden_tools` | non-consumable cosmetic (+10%) | $2.99 |
| `com.gamequarry.digtothecore.cash_small` | consumable | $0.99 |
| `com.gamequarry.digtothecore.cash_medium` | consumable | $2.99 |
| `com.gamequarry.digtothecore.cash_large` | consumable | $7.99 |

Timed offer tag (`AdOffers`): none in the first 2.5 min, one at a time, gone after 40 s, waits longer each time one is ignored (200 s up to 8 min), only offers worth having, never one whose ad isn't ready. It names what you get: "Free: +3.1K cash, enough for the jackhammer". Cash packs and the free cash ad also sit under the next tool in the shop when you're short. Restore Purchases is in the shop's Bonus tab.

Bundle id: `com.gamequarry.digtothecore`.

## Done (first playable)

- Streamed, diggable ten-layer planet with surface-nets meshing, collision, ore, caves, finds, save strings.
- Seven tools with Blender models, swing/vibrate/spin animations, particles, impact light, sounds; dynamite throws and explodes; the laser fires a beam.
- Shop panel (tools, upgrades, crew, finds collection, bonus/purchases/settings, playtest tools).
- Lift both ways with a ride cut-scene; the lift stop follows your deepest point.
- Moles and Robo-Moles (Blender models) digging on their own.
- Rewarded 2x boost (stacks to 15 min), instant cash, helper rush, double this find, timed offer tag, light interstitials, Remove Ads + 2x, starter pack, golden tools, cash packs, restore (all stubbed).
- Save/load including the dug shaft, autosave every 10 s, save on backgrounding and on closing the shop.
- First-run hints, layer-reached banners, depth gauge with finds, a metal-detector ping near finds.
- Generated sound effects and two ambience loops (`art/audio/make_sfx.py`), mute in the shop.
- Art pass: art bible, Rye + Zilla Slab, custom SVG icons, worn riveted plates, no emoji, Blender models for tools, helpers, the shack, headframe, cage, lift stop, trees, fence posts, crates and barrel.
- Art pass 2 (all 12 items of ART_REVIEW.md): headlamp-led lighting with zone-tinted depth fog, painted rock texture and strata, 3D pebbles and ore nuggets, a lit landmark per layer with lava and crystal shaders, late-afternoon surface with a composed spawn, timber-post fence and enamel sign, rebuilt mole, robo-mole, trees, headframe, jackhammer and pick, smooth gloved hands on every tool, all 16 finds as Blender models, UI materials by role, HUD overlap fixes, a dressed lift shaft for the ride.
- Art round 3 (all 9 items of ART_REVIEW.md review 2, the underground): a hand-painted texture per layer (texture array) with its own strata and second rock, pebbles in beds, a soft headlamp with a cool bounce, lava as crust plates on a glowing melt, glowing crystals, the inner core as molten amber; Blender rebuilds of the skeleton, a fossil slab, the timber set, the ore cart on rails, the mantle pillows, quartz clusters, the core's heart, pebbles and rubble, the lift cage and the shaft's timber sets; gloves with knuckles and sleeves with cuffs and folds, grained handles, grip tape, worn steel, a new laser drill; the shop as the shack (pegboard, ledger, notices, drawer cabinet, one enamel No ads sign); small depth-tested money numbers that count up, painted sign lettering, a cracked-rock crosshair mark; one brass depth tube; layer banners with one line each; the 2x ticket only when it's worth having; 20 px minimum text; phone-first prompts; oaks, maples and birches; clods and a spoil heap round the first hole; the HUD hidden during the lift ride.
- Phone render scale and frame-rate watcher (from the reference game).
- Tests: `tests/smoke_test.gd` (75 checks, incl. one per QA bug), `tests/playthrough.gd` (keen / casual / boosted, the visual run), `tests/chaos.gd`, `tests/screenshots.gd` (`--size 844x390` for phone size), `tests/look.gd` (quick art renders), `tests/pacing.gd`, `tests/field_bench.gd`. Each run can have its own save: `DIG_SAVE=<name>` in the environment uses `user://dig_save_<name>.json`, so bots and tests can run side by side.

## Dev menu and bot hooks

Playtest builds only (`playtest` feature tag, or the editor; hidden in release): the shop's Bonus tab ends with time scale 1x/5x/10x/50x (`Engine.time_scale`), income x1/x10/x100 (`GameState.income_mult`), dig speed x10, +cash, unlock everything, reset save, skip to any layer 1 to 10, and ad/purchase counters.

Bot runs: `godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- keen|casual|boosted [ads]`; the visual run adds `--shots DIR --every SECONDS --limit MINUTES --size 844x390 --touch` and runs under xvfb (`xvfb-run -a godot --headless -s res://tests/playthrough.gd -- boosted --shots ...`): the bot starts a rendering child at that size and writes `contact_sheet.png`. Chaos: `godot --headless --fixed-fps 20 -s res://tests/chaos.gd -- 6` (game-minutes).

Actions a bot can call: `World.move_player(pos, yaw, pitch)`, `World.dig_at(pos, radius, damage)` (or `Player.strike(damage)` at the crosshair, `World.force_dig`), `World.ride_lift(down)` / `World.use_context()`, `World.skip_to_zone(z)`, `GameState.buy(id)` (tool icon name like `"pickaxe"`, upgrade key like `"power"`, helper key like `"mole"`), `GameState.unlock_everything()`, `Hud.open_shop(tab)`, `Hud.watch_ad(kind)`, `Monetization.buy(product_id)`; the stub's `instant = true` skips the fake ad screens.

## QA

**Art round 3 (2026-11-09):** smoke test passes (75 checks; new: no text under 20 px in the HUD or any shop section, No ads + 2x sold from one sign only with no "(test)" prices). Playthrough **boosted** passes (11:18 of play, 118 s real, every ad and purchase checked) and **keen** passes (25:15, was 25:47: pacing unchanged; all 16 finds, 9 save/reload checks). Browser check passes at 844x390, 932x430 and 1024x768 (no console errors; the rock shader's texture array compiles under WebGL). Screenshots checked at 1280x720 and 844x390 (`tests/screenshots.gd -- DIR --size 844x390`). Exit-time "resources still in use" lines from looping sound playbacks are printed after the bots report; they don't affect the runs.

Done in the art pass 2 block (2026-11-09), per STUDIO.md "Playtesting". All runs on a shared 2-CPU machine, so real times are slow.

**Runs**
- Smoke test: passes, 72 checks (20 new, one or more per bug below).
- Playthrough bot, fresh save to the core through the real systems (walking, the lift, the shop's own buttons, keys for E/Space/B): **keen** passes (25:47, all 16 finds, 9 save/reload checks, interstitials shown and closed); **casual** passes (79:32); **boosted** passes (11:20 of play, about 6 minutes real time even with the machine at load 20+, so well inside CI's 15; every rewarded ad, the offer tag, double-this-find, the starter pack, all three cash packs, golden tools, Remove Ads + 2x and Restore checked). No errors printed in any run.
- Chaos run (6 game-minutes: 900 random keys, touches, clicks, button presses including every dev tool and a dev reset, shop open/close, touch mode flips, backgrounding): passes after the fixes below (it found three bugs).
- Visual run (the boosted bot rendered with the phone HUD, a shot every 20 game-seconds): 844x390, 932x430, 1024x768; contact sheets checked for clipping, overlap and overflow. The HUD fits at all three sizes (gauge, money plate, ticket, tool plate, stick, Dig, Jump and the context button never overlap; the find card and offer tag share the right column); it found bugs 8 to 10 below. Software GL here renders about 1 frame a second, so each size covers the first 5 to 7 minutes of play; the deep layers are covered by `tests/screenshots.gd`.
- Browser run (`tools/browser_check.py`, local web export, headless Chromium as an iPhone in landscape): passes at 844x390, 932x430 and 1024x768, touch works, no console or page errors. The first attempt timed out taking a screenshot (software GL on a loaded machine), not a game fault; a retry with a longer timeout passed.

**Bugs found and fixed** (each has a smoke-test check)
1. The headlamp didn't make a pool: the fill light and the lift-stop lantern washed everything orange, and exponential fog was already 70% dark at 4 m. Now the lamp is the main light with a flat falloff and depth fog runs from 1.6 m to the lamp's reach.
2. On the surface the tool in your hands was lit only by the cool ambient (its camera doesn't draw the world's sun), so it looked black. A shadowless twin sun now lights the viewmodel layer.
3. On phones the right-hand column (boost ticket, offer tag) ran off the right edge when the offer tag swung in. It now grows leftward.
4. Touch controls showed for a frame over a popup, the shop, an ad or the lift ride as it opened (chaos). They now hide the same frame.
5. Closing a fake rewarded ad early and opening another at once left the first countdown writing to freed buttons (chaos, script errors). Each ad screen now checks it's still the current one.
6. A dev reset while an ad played made the reward call back into a freed HUD (chaos, script error). The reward is still granted; the callback is skipped if its owner is gone.
7. The lava pool, the crystals and the core spires rendered as flat pale paper. They now get the lava, crystal and white-hot materials.
8. Floating money numbers and the lift stop's floating "Lift" tag ballooned into smeared text filling the view at the lens (visual run). The numbers are now a fixed size on screen; the tag hides within 2.4 m.
9. A mole could pop up and dig right in front of your face in a narrow shaft, filling the screen (visual run). Moles now duck when you come within about a metre and surface further from you.
10. Pale things right at the lens (the lift-stop sign, rock) blew out to flat colour under the strong lamp (visual run). Flatter lamp falloff and the rock shader damps rock within 2 m.
11. The lift down could drop you from high above when the lift stop had fallen into a pit since you last stood there (keen run: it landed you back on the surface and the ride never finished). It now sets you down on open floor beside the stop, loading that layer first.
12. Tests and bots shared one save file, so running two at once corrupted both. `DIG_SAVE=<name>` gives each its own.

Bot-side fixes (not game bugs): it dug a ring round its shaft and stood on the pillar left in the middle; it stood on the lip of a pit the crew had dug and aimed into it beyond reach; it hunted finds that were just out of reach without moving; it stood above a lift stop that had dropped into a pit; its "stuck in rock" check fired on steep pit floors (now it must also be unable to move at all).

**Pacing** (game time, no ads; boosted = income x10 and every ad taken)

| | keen | casual | boosted (x10, every ad) |
|---|---|---|---|
| Pickaxe | 0:54 | 1:47 | 0:26 |
| Topsoil done | 1:26 | 3:14 | 1:15 |
| Clay done | 3:00 | 7:55 | 2:04 |
| Jackhammer | 3:45 | 20:57 | 1:37 |
| Bedrock done | 4:27 | 16:53 | 3:05 |
| Drill | 5:02 | 30:51 | 2:44 |
| Fossil Bed done | 5:31 | 24:45 | 3:41 |
| Dinosaur Graveyard done | 7:08 | 32:15 | 5:33 |
| Dynamite | 7:59 | 39:23 | 4:36 |
| Laser Drill | 8:57 | 41:44 | 5:19 |
| Crystal Caves done | 9:12 | 39:56 | 5:42 |
| Lava Lakes done | 11:02 | 43:42 | 6:32 |
| Mantle done | 14:14 | 51:50 | 6:42 |
| Earth-Borer | 17:59 | 63:19 | 6:15 |
| Outer Core done | 20:09 | 64:54 | 7:51 |
| **The core** | **25:47** | **79:32** | **11:20** |
| Finds | 16 of 16 | 5 of 16 | 16 of 16 |

Keen lands a little under its ~30-minute target (22 to 26 across this block's runs); casual over its ~60 (63 to 92 across runs, the spread from its random pauses and which finds it stumbles on). The casual bot digs about 40% as much as the keen one (it digs 60% of the time, stops to look round, shops less often and skips most finds, which are a big share of early money), so one balance can't put both exactly on target; worth checking against a real casual player before tuning further. Before this block, Crystal Caves to the core took about 7 minutes for keen (Mantle in 6 seconds once the Earth-Borer was in hand); the last five layers now take about 16.

## Next steps (toward the polish bar)

1. **Pacing.** Keen and casual both reach the core with no stalls (see "QA"); casual still runs long (63 to 92 minutes for the bot). Check with a real casual player, then nudge the early tool prices if it holds. Polish the run's stats screen.
2. **Art, what's left**: a third fresh-eyes critic review (of art round 3); a splash screen; switch cream-on-verdigris lettering to soot; motion polish (eased staggered reveals in the shop, squash on the find pop); the pick head reads a little gold under the warm lamp.
3. **Music.** Generated tunes for the surface and for the deep (only SFX and ambience so far), and separate music/effects volume sliders.
4. **Deeper layers' identity.** Crystal Caves and Lava Lakes need their caves to read (glowing crystal props, lava you can't stand in), and per-layer ambience.
5. **Real-phone check** of the web build: touch feel, frame rate while the jackhammer is running (chunk re-meshing is ~0.5 ms per chunk on desktop, 0.08 s per-chunk throttle), memory after a long session.

## Known bugs / rough edges

- The 2x boost doubles strikes exactly; income follows the rock you hit, so the smoke test accepts 1.5x to 2.5x.
- A lift stop can end up in an awkward pit if you stand there; it drops to the floor when dug out from under, but it never moves sideways.
- Unloaded layers above you are treated as open (so you can see sky up the shaft); a layer that's been dug sideways far above can show a missing ceiling for a moment while it streams back.
- The headlamp is strong (it has to light a pool metres away); the rock shader damps rock within 2 m of the lens so close walls don't blow out.

## Balance notes

All numbers in `scripts/balance.gd`. A rock point pays hp x worth x m³, so value per m³ climbs with depth (2.5, 10.5, 51, 220, 900, 5K, 42K, 179K, 630K, 3.7M from Topsoil to Inner Core). Income per second follows the tool (damage x rate x upgrades x worth), not the rock's hardness, so hardness sets how long a layer takes to cross without starving the player. Ore pays its rock times 3 to 14. Tools are roughly 4x apart in damage per second and cost 120, 3.6K, 55K, 700K, 13M and 200M. The first five layers grow about 4x in hardness each; Crystal Caves to Inner Core were stretched in the QA block (4.8K, 40K, 170K, 600K, 3.4M) because once the Earth-Borer was in hand they went by in seconds, and the Earth-Borer came down from 300M to 200M so the end is digging, not waiting for money. Pacing: see "QA".

## Rebuilding assets

- Models: `python3 art/blender/tools.py`, `world_models.py`, `props.py` and `finds.py` (Blender 5.2 as a Python module, each takes model names to build only some), then `python3 art/blender/contact_sheet.py out.png [names]` to review and `python3 art/blender/viewmodel_preview.py out.png` to check the tools against the phone buttons.
- Textures: `python3 art/textures/make_textures.py` (the field's grass and packed earth, strata bands), `python3 art/textures/make_layers.py [preview.png]` (each layer's rock, a texture array: `textures/rock_layers.png` is imported with 10 vertical slices), `python3 art/textures/make_signs.py` (enamel signs with painted lettering).
- Icons: `python3 art/icons/make_icons.py`.
- Sounds: `python3 art/audio/make_sfx.py` (needs numpy, scipy, ffmpeg).

## Credits

Made by Game Quarry. Fonts: Rye (Sorkin Type) and Zilla Slab (Typotheque / Mozilla), SIL Open Font License 1.1. Everything else (models, icons, sounds) is generated by the scripts in `art/`.
