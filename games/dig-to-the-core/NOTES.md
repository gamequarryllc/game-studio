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

**UI motif.** Riveted brass and blackened iron like the dials on a mine hoist, plus worn cream enamel signs. Plates are drawn in code (`RivetBox`): hand-cut uneven chamfers, rivets, a glint on the top edge, grain specks, fine scratches and chipped paint, and each plate wears differently. The first-run hint is a cream enamel sign hung slightly crooked; the offer tag hangs off-true; the money gauge sits left of centre. The depth gauge is a brass tube with a glass window, the main HUD element.

**Icons.** Drawn for the game (`art/icons/make_icons.py` writes `ui/icons/*.svg`): one style, a thick soot outline, flat palette fills, one cream highlight, a little hand wobble. No emoji anywhere in the UI.

**Shape language.** Chunky, faceted and a little top-heavy; bevelled hard edges; working ends of tools slightly oversized; nothing perfectly straight (boards lean, the roof sags, fence posts tilt). Round only where it's alive (moles). Rock is faceted (the shader mixes flat face normals in) with strata bands, pebbles and baked nooks.

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
- Phone render scale and frame-rate watcher (from the reference game).
- Tests: `tests/smoke_test.gd` (52 checks), `tests/screenshots.gd`, `tests/pacing.gd`, `tests/field_bench.gd`.

## Dev menu and bot hooks

Playtest builds only (`playtest` feature tag, or the editor; hidden in release): the shop's Bonus tab ends with time scale 1x/5x/10x/50x (`Engine.time_scale`), income x1/x10/x100 (`GameState.income_mult`), dig speed x10, +cash, unlock everything, reset save, skip to any layer 1 to 10, and ad/purchase counters.

Actions a bot can call: `World.move_player(pos, yaw, pitch)`, `World.dig_at(pos, radius, damage)` (or `Player.strike(damage)` at the crosshair, `World.force_dig`), `World.ride_lift(down)` / `World.use_context()`, `World.skip_to_zone(z)`, `GameState.buy(id)` (tool icon name like `"pickaxe"`, upgrade key like `"power"`, helper key like `"mole"`), `GameState.unlock_everything()`, `Hud.open_shop(tab)`, `Hud.watch_ad(kind)`, `Monetization.buy(product_id)`; the stub's `instant = true` skips the fake ad screens.

## QA still to do (the "Playtesting" section)

Not done in this block: `tests/playthrough.gd` (keen / casual / boosted profiles, stall and stuck detection, mid-run save/reload checks), the chaos run, the visual run contact sheet at phone and tablet sizes, and `tools/browser_check.py` on a local web export. `tests/pacing.gd` is a simplified bot (it calls the field directly) and can seed the playthrough bot.

## Next steps (toward the polish bar)

1. **Pacing for a full run.** The first ten minutes are tuned (see below); layers 6 to 10 with Dynamite, Laser Drill and Earth-Borer still go too fast once you have them. Tune with `tests/pacing.gd` until a keen run is ~30 min and casual ~60, and add the run's stats screen polish.
2. **Art, what's left** (the fresh-eyes critic should drive this): Blender models for the finds (they're the SVG icons on billboards for now) and for the deeper layers' set pieces (crystal clusters in Crystal Caves, lava pools in Lava Lakes); the oak canopy is still blobby; the ride cut-scene's rock tube is a plain textured cylinder; a splash screen; switch cream-on-verdigris lettering to soot; motion polish (eased staggered reveals in the shop, squash on the find pop).
3. **Music.** Generated tunes for the surface and for the deep (only SFX and ambience so far), and separate music/effects volume sliders.
4. **Deeper layers' identity.** Crystal Caves and Lava Lakes need their caves to read (glowing crystal props, lava you can't stand in), and per-layer ambience.
5. **Real-phone check** of the web build: touch feel, frame rate while the jackhammer is running (chunk re-meshing is ~0.5 ms per chunk on desktop, 0.08 s per-chunk throttle), memory after a long session.

## Known bugs / rough edges

- The 2x boost doubles strikes exactly; income follows the rock you hit, so the smoke test accepts 1.5x to 2.5x.
- A lift stop can end up in an awkward pit if you stand there; it drops to the floor when dug out from under, but it never moves sideways.
- Unloaded layers above you are treated as open (so you can see sky up the shaft); a layer that's been dug sideways far above can show a missing ceiling for a moment while it streams back.
- Dust from the drill can haze the view on light rock (Fossil Bed).
- Finds still use 2D icons in the world.

## Balance notes

All numbers in `scripts/balance.gd`. A rock point pays hp x worth x m³; hp grows about 4x per layer from Bedrock on and worth stays near 1, so value per m³ climbs with depth (2.5, 10.5, 50, 220, 900, 3.8K...). Ore pays its rock times 3 to 14. Tools are roughly 4x apart in damage per second; each is meant to carry you through about two layers.

Pacing bot (`godot --headless -s res://tests/pacing.gd [-- casual | ads]`), simulated time:

| | Pickaxe | Clay | Bedrock | Jackhammer | Fossil Bed | Drill | Crystal Caves |
|---|---|---|---|---|---|---|---|
| keen | 1:34 | 1:38 | 3:06 | 5:05 | 5:13 | 9:33 | 9:54 |
| casual | 2:39 | 2:43 | 4:43 | 8:07 | 8:21 | 14:01 | 14:31 |
| keen, always boosted | 0:53 | 0:42 | 1:23 | 2:46 | 2:50 | 4:51 | 5:02 |

## Rebuilding assets

- Models: `python3 art/blender/tools.py` and `python3 art/blender/world_models.py` (Blender 5.2 as a Python module), then `python3 art/blender/contact_sheet.py out.png` to review.
- Icons: `python3 art/icons/make_icons.py`.
- Sounds: `python3 art/audio/make_sfx.py` (needs numpy, scipy, ffmpeg).

## Credits

Made by Game Quarry. Fonts: Rye (Sorkin Type) and Zilla Slab (Typotheque / Mozilla), SIL Open Font License 1.1. Everything else (models, icons, sounds) is generated by the scripts in `art/`.
