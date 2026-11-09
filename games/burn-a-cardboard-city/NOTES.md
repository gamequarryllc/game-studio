# Burn a Cardboard City

Someone filled an enormous empty warehouse with a whole city built from cardboard
boxes: suburbs of little box houses, a downtown of office boxes, a row of skyscrapers
and a cardboard castle in the middle. You are a giant next to it, seen from your own
eyes: the houses come up to your knees, the offices to your chest. Burn it all down,
block by block. It's a craft project: nobody lives there but flat paper cut-out people,
who hop out and skip off to safety.

Godot 4.4, Compatibility renderer, landscape 1280x720 (stretch: canvas_items / expand).
Bundle ID (when it ships): `com.gamequarry.burnacardboardcity`.

## Art bible

**Palette** (every UI colour and most of the city come from these; ink on kraft and ink
on paper both clear 7:1 contrast, the flame orange is the only saturated warm colour on
screen so the fire always pops against the cool warehouse):

| Swatch | Hex | Role |
|---|---|---|
| Kraft | `#c89a64` | Cardboard: the buildings, the HUD tags, the shop box |
| Kraft shadow | `#8e6236` | Cut edges, panel outlines, the empty part of progress strips |
| Marker ink | `#221d1b` | All lettering, icon outlines, drawn windows |
| Masking tape | `#e8d8a8` | Tape on tags and buildings, road markings, highlights |
| Warehouse steel | `#5c6b7a` | Concrete floor, walls, dim overlays: the cool backdrop |
| Flame | `#ef7a28` | Fire, the crosshair when it can light, the one call-to-action colour |
| Paper | `#f7f1e3` | Notes, price tags, luggage tags, item cards |

**Type.** Display: *Permanent Marker* (Apache 2.0, `fonts/PermanentMarker-LICENSE.txt`),
a thick felt-tip capital hand for titles, numbers and buttons. Body: *Patrick Hand* (OFL,
`fonts/PatrickHand-OFL.txt`), a neat handwriting for notes and descriptions. Scale: 68
(chain stamp) / 40 (coins, popup titles) / 30 (shop button) / 24-26 (labels, titles on
cards) / 20-22 (body) / 18 (tabs).

**UI motif: cut cardboard tags held on with masking tape.** Every panel is a piece of
board or paper cut by hand (`scripts/card_style.gd`: irregular edges seeded per panel,
faint corrugation lines, a darker cut edge, a soft drop shadow, tape strips with torn
ends). Buy buttons are paper price tags with a punched hole; the timed offer is a luggage
tag that swings on its string; first-run hints are notes taped up at both corners; chains
are stamped on in red marker. Tags sit 1-3 degrees off true on purpose. The shop is a
cardboard box that slides up and swings its flaps open, with divider tabs inside. Icons
(`icons/*.svg`, drawn by `tools/make_icons.py`) are one style: a thick ink outline over a
marker fill printed slightly off register, like a hand-coloured sticker. No emoji anywhere.

**Shape language.** Boxes, never quite square: tops sag, flaps stand open at different
angles, corners are bevelled and wander a few millimetres. Round things are cardboard
tubes and rolled paper cones (turrets, the poster-tube hotel, paper trees), wheels are
bottle caps. Windows, doors and box labels ("KITCHEN", "BOOKS", "FRAGILE") are felt-tip
drawings with overshooting corners and scribbled fills (`models/marker_sheet.png`, drawn
by `art/textures/make_marker_sheet.py`). Fire is cut paper too: flat layered flames with
a dark red cut edge that flicker at a stop-motion 8 frames a second. Things fall with
weight: towers lean back before they go (anticipation), accelerate, bounce and squash
flat on impact; houses fold down like a box being stamped on.

**Light.** Daylight from strips of skylights: a warm key from high up, a cool blue fill
and blue-grey ambience, soft shafts of dusty light through the roof, depth haze across
the warehouse. Warm fire against a cool room.

**Inspirations (outside games):** cardboard-box towns made in school craft lessons;
felt-tip drawings in children's craft and activity books; stop-motion films shot on
cut-paper sets.

**Models** are built in Blender (5.2 as a Python module, headless) from scripts in
`art/blender/` and exported to `models/*.glb`. Each model has a "card" surface (vertex
colours = paint x ambient occlusion baked in Cycles; alpha = material: card, paper, tape,
shiny, glass) and a "decal" surface (marker drawings from the marker sheet).

    python3 art/textures/make_marker_sheet.py     # the felt-tip drawings
    python3 art/blender/build_all.py              # every model -> models/*.glb (about 6 s)
    python3 art/blender/contact_sheet.py /tmp/sheet.png houses.glb offices.glb   # Cycles review render
    python3 tools/make_icons.py                   # icons/*.svg and icon.svg

## Status: first playable

Loads, phone and desktop controls work, fire spreads building to building, buildings
collapse and topple onto their neighbours in chains, coins come in (with chain bonuses),
4 tools, 5 upgrades, 2 helpers, a working shop (the box), the 2x rewarded boost and
the other rewarded ads, Remove Ads + permanent 2x, the timed offer tag, the starter pack,
the golden lens, coin packs and restore (all stubbed), finds (with "double this find"),
paper citizens, toy fire trucks that douse fires, autosave + save on backgrounding,
first-run hints, generated sound effects, dev boosts, and an ending when the keep falls.

## The design

**The core: buildings are structures that burn, weaken and fall** (`scripts/city_grid.gd`).
The floor is a 102 x 102 grid of 0.5 m cells (51 m across): 9 x 9 blocks of 8 cells with
3-cell streets. Every house, car, paper tree, office box, skyscraper, castle piece and fire
truck is a structure covering a rectangle of cells, with a height, an ignite threshold
and an integrity. Heat builds up on structures (from the tool, helpers, burning neighbours,
debris) and bleeds away (`COOL` per second); past the threshold it catches. A burning
structure's fire grows over its `fill` time, pushes heat into its precomputed neighbours
(weighted by the gap between them: touching 1.0, one empty cell 0.55, across a street
0.05; and by the wind), and eats its integrity over `burn` seconds while paying coins.
At zero it **collapses**: short things crumple in place, tall things (offices, skyscrapers,
castle towers) **topple** in a direction (downwind and toward whatever's still standing)
across a strip as long as they are tall. When they hit the ground they dump `spill` heat
on everything they land on (or are touching) and scatter burning debris on the floor.
Collapses within 3 s of each other make a **chain**: each link adds 20% to the collapse
bonus, up to 3x.

- **Tiers.** A structure heated steadily settles at heat / COOL, so a tool's *power* lights
  anything whose threshold is below it. Houses, cars and trees (7-15) take the magnifying
  glass (20); office boxes (56-88) and fire trucks the candle (120); skyscrapers (224-350)
  the blowtorch (480); the castle (720-1250, double if damp) the rockets (2600). A
  falling tower's spill can light its own tier on the far side of a street; it can't jump
  a tier (except the keep, which only rockets reach).
- **Streets** stop radiant heat. Fire crosses them on cars parked in the middle lane
  (a car is one cell from both kerbs), on toppling towers, on burning scraps blown off
  tall buildings (spotting), and with Dry cardboard.
- **Wind** comes from four big floor fans, one per wall; every 70-130 s a different one
  comes on (the wind swings round, its blades spin up). The HUD arrow shows it relative
  to where you look.
- **Obstacles.** Toy fire trucks (5) squirt water at the nearest fire within 3.6 m every
  2.4 s (knocking half the fire off; a doused building stays wet for 8 s) until you burn
  them (candle). Puddles from the leaky roof make the buildings within 2 cells damp (2x
  harder); the castle has a moat.
- **Districts** (square rings): the suburbs, downtown, skyscraper row, the cardboard castle.

**First person, as the giant** (`scripts/giant.gd`). Eye height 3.3 m, looking down at the
streets. You stride over anything below 1.25 m (houses, cars), jumping clears downtown;
skyscrapers and the castle you walk round. The tool works where the crosshair lands, out
to its range. The held tool is drawn at the bottom right, on top of the world, bobbing with
your stride. Big collapses near you shake the view.

| Phone | Desktop |
|---|---|
| Left thumb: floating stick (a bottle cap on card) to walk | WASD / arrows |
| Right side: drag to look | Click, then move the mouse |
| Hold the big taped fire badge to burn (drag from it to aim) | Hold left click |
| Jump tag | Space |
| Shop button (top right) | E or Tab |
| Tap the offer tag / the golden ticket tag | B / G |
| | M mute, Esc frees the mouse, F1 dev boosts (playtest) |

**Progression** (all numbers in `scripts/balance.gd`):
- Tools, bought in order (`scripts/tool_fx.gd` draws each): Magnifying glass (a shaft of
  skylight into the lens, a white-hot point), Candle (drips of burning wax, 150), Blowtorch
  (blue jet, 2,000), Firework rockets (fly in an arc and burst where they land, 12,000).
- Upgrades: Hotter flame (+25% power), Dry cardboard (+8% spread), Loose change (+15% coins),
  Cheap glue (buildings fall 6% sooner: faster chains), Big boots (+12% speed).
- Helpers (`scripts/helpers.gd`): wind-up cars with a sparkler taped on (drive the street
  grid by breadth-first search, pull up beside a house and hold the sparkler to it), and
  paper planes with a lit fuse (circle office roofs).
- Paper citizens (`scripts/citizens.gd`) hop out of burning buildings, skip away and fold
  themselves up. Finds pop out of falling buildings (5% of houses, 15% offices, 35%
  skyscrapers, every castle piece): a rubber duck, a lost sock, a toy robot, marbles, a
  yo-yo, a very small teddy (0.4 min of income each), and 7% of the time a golden ticket
  (2 min of income, and a rewarded ad doubles it). The shop's Finds tab collects them.

## Money

Architecture as in the studio's reference game: the game only talks to the `Monetization`
autoload, which forwards to one `MonetizationProvider`; right now the
`StubMonetizationProvider` (fake 3-second ads, purchases succeed, everything counted in the
dev tab). To go live, write an AdMob + RevenueCat provider and return it from
`Monetization._create_provider()`.

**Rewarded ad placements** (AdMob rewarded units):

| Placement ID | Reward | Where |
|---|---|---|
| `boost_2x_fire` | 2x fire for 5 min (coins and tool power), stacks to 15 min | Shop > Free stuff, offer tag |
| `helper_rush` | Helpers work 3x (and hurry) for 3 min | Shop > Free stuff, offer tag |
| `instant_coins` | 3 min of recent income, capped at 60% of the next tool, 4 min cooldown | Shop > Free stuff, offer tag |
| `double_find` | Double a golden ticket | Tag for 9 s after a golden ticket pops out |

**Interstitial placement:** `shop_close` (closing the box is the natural break). Never in
the first 5 min, at most every 4 min, never right after a rewarded ad, never with Remove Ads.

**In-app purchase product IDs:**

| Product ID | Type | Price | What |
|---|---|---|---|
| `remove_ads_2x` | non-consumable | $4.99 | Remove ads + permanent 2x (the anchor offer) |
| `starter_pack` | non-consumable (one time) | $1.99 | 2,500 coins + party sparks (exclusive cosmetic: every tool's sparks in felt-tip colours). Offered once in a popup after 10 min, and in the shop |
| `golden_lens` | non-consumable | $2.99 | Premium cosmetic: gold fire and a gilded tool, +10% power (toggle in the shop) |
| `coins_small` / `coins_medium` / `coins_large` | consumable | $0.99 / $2.99 / $9.99 | 35% / 100% / 400% of the next tool's cost (at least 400 / 1.5K / 8K). Shown in the Tools tab when you're short for the next tool, and always in the Shop tab |
| Restore purchases | | | Shop tab |

**Timed offer tag** (`scripts/ad_offers.gd`): a luggage tag hanging off the shop button
that names what it buys ("Free: +[coin]1.20K, enough for the blowtorch"). Gentle rules:
none in the first 2.5 min, one at a time, gone after 40 s, the wait grows 1.5x each time
one is ignored (200 s up to 8 min), only offers worth having right now, never one whose ad
isn't loaded, the clock only runs while you play. Free coins that would buy the next tool
come first.

Guardrails: finishable without paying; Remove Ads and boosts speed it up.

## Dev boosts and code-driven play (playtest builds)

The shop box has a **Dev** tab (and F1 opens it) only when the `playtest` feature tag is
on (or in a debug build): time scale 1x/5x/10x/50x (`Engine.time_scale`), income x1/x10/x100,
give coins, unlock everything, skip to downtown / skyscraper row / the castle, burn the
district you're in, fake ad and purchase counts, and start over.

For the QA block's playthrough bot, every action is a call: `world.ignite_at(point)`,
`world.move_giant_to(point, look_at)` (nudged out of anything tall), `world.giant.aim_at(point)`,
`world.force_fire = true` (hold the tool), `GameState.buy("tool:candle" | "upgrade:dry" |
"helper:windup")`, `world.skip_to_district(z)`, `hud.open_shop(tab)`, `hud.watch_ad(kind)`,
`Monetization.buy(id)`.

## What's done (this block)

- Structure fire simulation: heat, gaps and wind, fill, integrity, crumple and topple with
  impact spill, debris, spotting, chains, fire trucks, puddles and the moat, districts.
- 29 Blender-built models (5 houses, 5 office boxes, 5 skyscrapers, 5 castle pieces, 3 cars,
  the fire truck, 3 trees, wind-up car, paper plane, rocket, 4 tools, 7 warehouse props),
  AO baked into vertex colours, decals from a hand-drawn marker sheet.
- Rendering: one MultiMesh per model; the burn (scorch, char creeping up from below, glowing
  edges, a dark glowing inside) and the fall (lean back, topple, bounce, squash; or fold
  down) are animated in the shader from per-instance data, so the CPU only touches a
  building when something happens to it. Paper flames and smoke rebuilt per fire tick,
  debris scraps, the floor's paper sheets / scorch / embers / baked contact shadows per cell,
  masking-tape road markings, the warehouse (steel walls, trusses, skylights, light shafts,
  fans, props), a fire light on computers.
- HUD and shop in the cardboard-tag style; drawn SVG icons; touch controls.
- Money: everything above, stubbed. Dev tab.
- Save: `user://city_save.json` (one character per structure), autosave every 10 s, on
  app pause / focus out / close, and when the browser tab is hidden.
- Sound: 39 effects and loops from `tools/make_audio.py` (crinkly cardboard crackle and a
  roar that follow how much is burning near you, a loop per tool, crumples, a creak-and-thump
  topple, coins, the box's flaps, tape, giant footsteps on concrete, paper hops, fire-truck
  squirts, the fan and the warehouse's room tone). Volume and mute in Settings.
- Phone performance: Compatibility renderer, MultiMesh everywhere, shadows only on
  computers (phones get baked contact shadows), no omni lights on touch devices, 3D render
  scale fitted to the screen (`World._fit_render_scale()`, 1 MP budget on touch screens) and
  turned down further when the frame rate drops. The sim costs about 2 ms per 0.1 s tick at
  the height of a 180-building fire on desktop (`tests/fire_bench.gd`).
- Tests: `tests/smoke_test.gd` (passes, 63 checks), `tests/screenshots.gd`, `tests/fire_bench.gd`.

## Next steps toward the polish bar (STUDIO.md)

1. **Pacing bot and balance** (`tests/playthrough.gd`, keen / casual / boosted): spread is
   generous right now (one match in the suburbs takes down 25-90 buildings), which feels
   great but may make the run short; tune gaps, spill and tool costs for a 30-60 min run.
2. **Music**: a couple of generated tunes (warehouse radio?) with a music slider.
3. **More juice**: scraps flying on the wind (the sim already reports them), the fire-truck
   squirt as a visible arc, coins flying to the HUD tag, a camera nudge toward big topples,
   the keep's own finale (the flags falling, every citizen cheering), a stats screen with
   "where to next?".
4. **Art pass after the critic's review**: per-building wear (dents, a stain, a torn flap),
   more box labels and colourways, the giant's own sleeve/hand on the tool, a splash screen.
5. **Real-phone test**: stick size, look sensitivity, the fire badge, frame rate with a big
   fire (MAX_FLAMES 1500), the render-scale floor.

## Known bugs and limitations

- The held tool draws on top of everything (depth test off), so in rare poses it can show
  through a wall you're pressed against; it never clips into one, which was the point.
- Toppled towers lie across the cells they landed on visually, but the giant can walk
  through rubble (rubble has no height).
- A big blaze is one endless chain (chain stamps show only at 3, 5, 8, 12, 20, 30, 50).
- MultiMesh custom data is stored as half floats by the Compatibility renderer, so the
  shaders' clock steps back every 5 min (`CityView._rebase`). If a falling building ever
  "jumps" in its animation, look there.
- MultiMeshes need `use_colors` with white instance colours in Compatibility or the vertex
  colours come out black (set on every structure MultiMesh).
- Headless runs print "resources still in use at exit" (dummy audio teardown).

## Balance notes

- The city (seed 20261110): 232 houses, 128 cars, 118 paper trees, 90 office boxes, 39
  skyscrapers, 11 walls, 4 towers, a gatehouse, the keep, 5 fire trucks. Base value
  ~108K coins (keep 40K, castle ~65K); chains and Loose change multiply it.
- `tests/fire_bench.gd` (wind 0.6, one building lit): suburbs 25-90 fall in 20-48 s for
  160-600 coins; downtown 55-90 fall for 660-1,380; skyscraper row 1 (an isolated tower)
  to 180 (a fire that runs out into downtown) for up to 7.9K. So the candle (150) comes with
  the first fire, the blowtorch (2K) after a couple of downtown fires, rockets (12K) partway
  through skyscraper row.
- Knobs: `KINDS[].heat / ignite / spill / burn`, `GAP_WEIGHT`, `COOL`, `CHAIN_*`, car chance
  per street (`_cars_and_trucks`), `DEBRIS_HEAT`.

## Files

```
project.godot / export_presets.cfg (preset "Web", playtest)   default_bus_layout.tres (SFX, Fire)
scenes/main.tscn            the only scene; everything is built in code
scripts/balance.gd          every number
scripts/city_grid.gd        the city as data and the structure fire (spread, collapse, topple, debris, trucks, saving)
scripts/city_view.gd        drawing it (MultiMeshes per model, flames, smoke, debris, floor, tape, bursts)
scripts/model_lib.gd        loads the Blender models and gives them their shaders
scripts/warehouse.gd        the building, light, fans (the wind), props
scripts/giant.gd            you: walking, stepping over, aiming, the held tool
scripts/tool_fx.gd          each tool's effect, rockets
scripts/helpers.gd          wind-up cars (street pathfinding) and paper planes
scripts/citizens.gd         paper people and finds
scripts/world.gd            builds it all, the loop, controls, wind, coins, hints, actions for bots
scripts/hud.gd              the HUD, offer tag, finds tag, chain stamps, toasts, popups
scripts/shop_box.gd         the shop: a cardboard box (and the dev tab)
scripts/touch_controls.gd   phone controls
scripts/craft.gd            palette, fonts, styles, icons
scripts/card_style.gd       the cut-cardboard StyleBox
scripts/gfx.gd              particles and textures for effects
scripts/game_state.gd       autoload: economy, purchases' effects, save/load, dev boosts
scripts/ad_offers.gd        when the timed offer tag shows and what it offers
scripts/monetization/       provider interface, stub, autoload facade (product and placement IDs)
scripts/audio/sound.gd      autoload: effects, loops, volume
shaders/                    cardboard + marker (+ collapse.gdshaderinc), paper_flame, smoke, floor, tape, light_shaft, metal_wall, prop
models/                     *.glb from art/blender, marker_sheet.png
art/blender/                model scripts (kit.py, city_buildings.py, castle.py, vehicles.py, nature_props.py, tools.py, build_all.py, contact_sheet.py)
art/textures/               make_marker_sheet.py (+ the UV map it writes)
icons/                      drawn SVG icons (tools/make_icons.py)
audio/                      generated by tools/make_audio.py
fonts/                      Permanent Marker (Apache 2.0), Patrick Hand (OFL)
tests/                      smoke_test, screenshots, fire_bench
```

Run: `godot --headless --import`, then `godot --headless -s res://tests/smoke_test.gd`;
screenshots: `xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/city-shots`.
