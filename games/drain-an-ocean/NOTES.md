# Drain an Ocean: notes

## Art bible (read before touching anything visible)

**Idea.** A harbour master's chart of a small bay, come to life as a tilted
diorama at the end of a long afternoon. The bay is closed off by an old stone
sea wall; behind it the open sea still sits at full height, glittering. In
front of it the water drops ring by ring: sandbars and lagoons by the town,
a kelp forest, a reef, three wrecks, a trench, and at the very bottom the
lost town with its clock tower. The interface is the paperwork of that
harbour: a painted tide board, a chart cartouche, a brass pressure dial,
signal flags on a halyard, and notices to mariners pinned up crooked.

**Palette** (sRGB; every UI and model colour is one of these or a mix of two):

| Swatch | Hex | Role |
|---|---|---|
| Deep Teal | `#0F4C5C` | deep water, the sea beyond the wall, shadows in the UI, flag blue |
| Shoal Green | `#4FA89B` | shallow water, kelp, "go" and "buy" accents |
| Warm Sand | `#E3C48F` | dry seabed, beach, timber in sun, brass highlights |
| Chart Paper | `#F3EAD3` | every paper surface, text on dark |
| Coral | `#E0603F` | coral heads, creature accents, signal-flag red, stamps (fills only) |
| Rust | `#8C4425` | wrecks, rope in shadow, prices, warnings |
| Chart Ink | `#1C2A33` | text, outlines, the darkest value in any frame (never `#000`) |

Value contrast (WCAG): ink on paper 12.3:1, paper on deep teal 7.9:1, ink on
sand 8.8:1, rust on paper 5.9:1, ink on shoal 5.2:1, ink on coral 4.1:1.
Coral on paper is only 3.0:1, so coral is never used for small lettering:
it fills stamps, flags and creature markings, and anything written on it is
in ink. Prices are printed in rust.

**Fonts** (SIL OFL 1.1, licences in `fonts/`):
- **Fraunces** (Undercase Type), a soft, slightly wonky old-style serif:
  titles, the money figure, ring names. Ring and water names are set in
  *Fraunces Italic*, as on real charts (water features in italic, land
  features upright). High optical size, `SOFT` 50, `WONK` 1.
- **Atkinson Hyperlegible** (Braille Institute) Regular and Bold: everything
  people read at a glance on a phone: numbers in rows, buttons, hints.

**UI motif.** Admiralty-chart paper (warm cream with a faint blue graticule,
a ruled double border and fold creases), the harbour tide board (white
boards with black "E" graduations), a brass pressure dial for the pump flow,
International Code signal flags on a rope halyard for the main buttons, and
notices to mariners (small printed slips) for hints. Rope is drawn as a laid
three-strand line, not a plain stroke. No rounded dark pills, no glows, no
planks, no brass plates with rivets, no cardboard.

**Icons.** Drawn for the game (`art/icons/make_icons.py` writes
`ui/icons/*.svg`): engraved-chart style, a 2.5 px Chart Ink outline with a
slightly uneven hand, flat palette fills, hatching for shade instead of
gradients. No emoji anywhere in the UI.

**Shape language.** Worn by water: corners rounded like sea glass, timber
swollen and sagging, nothing perfectly straight (pilings lean, the sea wall
bows, hulls are broken along a line). Machines are chunky and bolted, with
flanges and big wheels. Creatures are round-bodied with big eyes and
oversized fins; the bigger the find, the more it leans. Small things are
clustered in groups of three or five, never scattered evenly.

**Lighting.** One low warm sun from the west-south-west (late afternoon,
`#FFC890`), long shadows across the drained shelves, a cool teal sky fill,
a warm rim on everything standing up. The open sea behind the wall catches
the sun; the deepest parts of the bay stay in cool shadow so the eye falls
down into them. Wet sand is darker and slightly glossy, dry sand pale and
matte; the change follows the waterline down.

**Copy.** Short, in-world, sentence case, almost no exclamation marks.
"The lagoon's cut off. Two crabs in there." Phone wording first (tap, drag,
pinch); desktop wording only when a mouse is in use.

**Inspirations (not games):**
1. 19th-century Admiralty charts: soundings printed on the water, italic
   water names, cartouches, compass roses and engraved hatching.
2. Harbour tide boards and the tide tables of a nautical almanac.
3. Deyrolle natural-history wall charts (for the creatures and the
   aquarium's register: specimen plates with a number and a Latin-ish name).

## The game

A bay closed off by a sea wall has to be pumped dry; a lost town is at the
bottom. One water level falls as the pumps run (their flow adds up, and each
metre of lift costs flow). The seabed comes up ring by ring: Sandbars (0-3 m),
Kelp forest (3-7), Reef (7-11), Shipwrecks (11-15), The trench (15-20) and The
lost town (20-24.5). Depressions with a rim become separate pools when the
bay drops below the rim and keep their water until a barge pump works them
(eleven designed pools: three lagoons, two kelp hollows, two reef pools, the
galleon's scour and the steamer's boiler pit, two trench potholes).
Creatures left in shallow water are stranded: tap them (or let a pelican) and
they go to the aquarium on the pier, which sells tickets all the time. Finds
and wreck loads are salvaged by tapping (or by salvage crabs). The bay's last
water gathers in the town square, with a grey whale calf in it; pumping that
out is the ending (the calf goes home over the wall).

- **Perspective and controls:** a tilted diorama camera (perspective, 30°
  lens, 49° down). Phone: drag to pan (the ground stays under your finger),
  pinch to zoom, tap to act. Desktop: mouse drag, wheel, click; WASD/arrows
  pan, +/- zoom, E chandlery, Q aquarium, B takes an offer, M mutes.
- **Taps:** stranded creature = rescue; glinting find = salvage; wreck =
  a salvage load (cooldown 1.2 s); pump pad = a callout with the next pump and
  its price stamp; water = a callout to send (or buy) a barge; a barge =
  where it's pumping; the aquarium building = the aquarium.
- **Pumps (shore pads, 6):** Bucket brigade, Hand pump, Diesel pump, Giant
  siphon, Whirlpool engine. Each pad holds one; buying puts the next tier on
  it. Each has its own Blender model with a moving part, a hose down the
  beach that follows the water and a swirl where it drinks.
- **Barges (up to 4):** float on whatever water you send them to; when a pool
  drops away from them they slide down with it; aground once it's empty.
- **Upgrades:** Pump power, Pipe width (less lift loss), Salvage value,
  Rescue nets. **Helpers:** pelicans (rescue), salvage crabs (pick up finds
  and wreck loads). **Species:** 16 (three to a ring, the whale calf).
  **Finds:** 12 named ones, two or three to a ring.

## Status: polished first playable (2026-11-10)

The first build (2026-11-09) got a "No" from the fresh-eyes critic
(`ART_REVIEW.md`); every one of its twelve problems is now fixed and marked
there. What changed in this block:

- **The bay** is rebuilt from hand-drawn isobaths (`art/bay/make_bay.py`,
  257x257 at 0.5 m): an asymmetric bay with the west headland and
  lighthouse, a rocky point with strata, the river mouth behind a stone
  weir, the sea wall as the hero landmark, the town shore with pier and
  aquarium, eleven designed pools with smooth lips, tide lines, ripples
  running one way, stones in clusters, painted far fields.
- **Light and water:** a low warm key from the west-south-west with crisp
  long shadows, a cool fill, height fog cooling the deep, the open sea
  glittering beyond the wall; water coloured by depth with broken foam,
  sun glitter and soft caustics in the shallows only.
- **Models** (61, all Blender): houses and chapel with eaves, sagging
  ridges and framed windows, the clock tower, creatures with countershading,
  markings and thick rayed fins, wrecks broken open on their ribs, a real
  galleon, weed and barnacle lines, baked AO. One scale rule
  (`scripts/models.gd`): pumps 1.6x with smoke and hoses down the sand,
  creatures 2.4x, chart-symbol tap markers.
- **UI:** one message at a time on a tag tied to its object; ring names
  inked into the seabed as curved chart lettering; chart soundings on all
  the water; the tide board reads from the left with ink-on-paper names; a
  dial with three marks; a treatment per role (pinned slips, the money
  cartouche, string tags, painted signs, a folded chart, an engraved plate).
- **The Chandlery** is a pegboard of paper tags with a big "Next on the
  list" tag; the harbour office holds every ad offer on one notice and the
  purchases; no visible dev tab.
- **The aquarium** has rockwork, a sand slope, caustics, pier timbers, true
  colours and habitats; its register is a natural-history plate of engraved
  sketches (`art/blender/sketches.py`), unfound species as silhouettes.
- **The ending** (`scripts/ending_shot.gd`): the HUD goes, a held beat
  while the calf goes home over the wall, a dolly to the clock tower in
  gold light with weed dripping and a wet sheen, then the card.
- **QA:** the playthrough bot, the chaos run, a visual run and the browser
  run (see "QA").

Everything from the first playable is still there: 5 pump tiers on 6 pads,
barges, 4 upgrades, 2 helpers, 16 species, 12 finds, 3 wrecks with salvage
loads, ring bonuses, the stubbed money set, autosave, generated sound.

## Engine

- `art/bay/make_bay.py` (numpy) builds the level offline into
  `data/bay.json`: the heightmap (257x257, 0.5 m cells, from hand-drawn
  isobath splines turned into a distance field), painted vertex colours,
  a coarse far-land grid, hand-placed landmarks (the wall's line, the weir,
  the river, ripple direction, ring label paths) and prop scatter, and the
  **merge tree** of the seabed. Unplanned dimples are filled first (priority flood from the
  deepest point), then the designed pools are carved with explicit rims, then
  tiny leftover leaves are filled, so the only pools are the designed ones.
- `Bay` (scripts/bay.gd) is pure logic: a body of water is (tree node,
  level). Pumping lowers a body by flow·dt/area (area from a binary search of
  the node's sorted heights); below its node's low end it splits into its
  children (or empties). No runtime flood fills; a full drain of the bay
  takes about 0.3 s of CPU headless. The main body is the one holding the
  sink (the town square).
- Rendering: one seabed mesh and one water mesh on the same triangulation.
  Each vertex looks up its body's slot (an R8 texture, rebuilt only on
  splits) and the body levels (a 32-float uniform array, every frame); dry
  vertices beside a body draw that body's level (always below them), so the
  water meets the sand exactly at the shoreline. The water shader colours by
  depth with broken foam and sun glitter; the seabed shader draws a smooth
  shoreline lip from each vertex's four neighbours, darkens wet sand near the
  water (and pools that just emptied dry over 45 s), adds caustics in the
  shallows and faint chart isobaths on dry seabed. Ring names are per-letter
  Label3Ds laid along a curve on the seabed (`chart_lettering.gd`); tap
  markers are chart symbols (`chart_marks.gd`). Kelp is a MultiMesh whose shader
  reads the water over each base: swaying under water, slumping when dry.
- The aquarium is its own little scene at x = 4000 on render layer 2 with
  its own camera, environment and lights.

## Money

All stubbed through `scripts/monetization/` (provider interface +
`StubMonetizationProvider`, the reference game's architecture; untouched in
this block so the real providers can be wired in). Playtest builds fake ads
and purchases and count them in the dev log.

Rewarded placements (AdMob ad unit keys):

| Placement | What it gives | Where |
|---|---|---|
| `boost_2x_pump` | 2x pumping for 5 min, stacks to 15 | the Z flag ("2x pumping"), the chandlery, offer flag |
| `instant_cash` | about 3 min of income, never more than 60% of the next pump | chandlery (also under "short by" when you can't afford the next pump), offer flag |
| `helper_rush` | pelicans and crabs 3x for 3 min | chandlery Helpers, offer flag |
| `ticket_rush` | the aquarium sells double for 10 min | the aquarium's ticket office, chandlery, offer flag |
| `double_find` | a find pays out again | the find's specimen card, for 9 s |

Interstitial placement: `panel_close` (leaving the chandlery or the aquarium;
at most every 4 min, none in the first 5 min, none for 3 min after a rewarded
ad, never with Remove Ads).

Products (prefixed with the bundle id):

| Product id | Type | Price |
|---|---|---|
| `com.gamequarry.drainanocean.remove_ads_2x` | non-consumable: no ads, permanent 2x pumping and helpers | $4.99 |
| `com.gamequarry.drainanocean.starter_pack` | non-consumable, offered once after 10 min: coins + signal-flag pump livery | $1.99 |
| `com.gamequarry.drainanocean.brass_pumps` | non-consumable cosmetic: polished brass pumps, +10% flow | $2.99 |
| `com.gamequarry.drainanocean.cash_small` | consumable | $0.99 |
| `com.gamequarry.drainanocean.cash_medium` | consumable | $2.99 |
| `com.gamequarry.drainanocean.cash_large` | consumable | $7.99 |

Timed offer (`AdOffers`): a red-and-white pennant run up under the halyard
with a paper tag naming what it buys ("Free: +1.2K coins, enough for the
diesel pump"). None in the first 2.5 min, one at a time, gone after 40 s,
waits longer each time one is ignored (200 s up to 8 min), only offers worth
having, never one whose ad isn't ready. Restore Purchases is in the
harbour office. Bundle id: `com.gamequarry.drainanocean`.

## Dev menu and bot hooks

Playtest builds only (`playtest` feature tag or the editor): hold the money
cartouche for about a second (or press F9) and the harbour master's logbook
opens (`scripts/dev_panel.gd`). Nothing on screen shows it's there. Time
x1/5/10/50, income x1/10/100, give coins, unlock everything, skip to any
ring, reset the save, and the ad/purchase/interstitial counts. It never
opens over the chandlery, the aquarium or the ending.

Actions callable from code (World): `place_pump(pad)`, `send_barge(x, z)`,
`move_barge(i, x, z)`, `rescue_creature(i)`, `salvage_find(f)`,
`salvage_wreck(w)`, `buy(id)` (`"pad:2"`, `"barge"`, `"up:power"`,
`"helper:pelican"`), `watch_ad(kind)`, `open_shop(tab)`, `open_aquarium()`,
`skip_to_ring(r)`, `dev_reset()`, `step_water(seconds)` (runs the pumps
without rendering), `pick_at(screen_pos)` + `act_on(pick)` (a tap). Queries:
`creatures.stranded_list()`, `finds.exposed_list()`, `finds.wreck_ready(w)`,
`bay.pool_ids()`, `bay.main_level()`. `OCEAN_SAVE=<name>` in the environment
gives a test or bot its own save file. The stub's `instant = true` skips the
fake ad screens.

## Tests

All headless runs take `timeout` on this shared machine; none leaves Godot
running.

- `godot --headless -s res://tests/smoke_test.gd`: 98 checks. The first
  build's (pumps, pools and barges, rescues and the aquarium's income,
  salvage, the shop, ads and purchases, touch, save/load, seepage, the
  ending) plus one for every bug found in this block (listed under "QA").
- `godot --headless -s res://tests/playthrough.gd -- keen|casual|boosted`:
  the playthrough bot (header of the file explains it). Plays a fresh save
  to the end through real taps, callouts and price stamps, saves and
  reloads at every ring, and fails on stalls, unreachable creatures, finds
  or pools, unbuyable goods, save mismatches, broken ad or purchase flows,
  idle takings that would buy the ending, or any logged error. Keen about
  80 s real, casual 2.5-3 min, boosted 15-35 s (depending on the load).
- `godot --headless -s res://tests/chaos.gd -- 5`: five game-minutes of
  random touches, drags, pinches, keys and button presses (including the
  fake ad screens and the dev log) and backgrounding, then checks the game
  can always get back to the bay with one panel at most and no errors.
- Visual run: `xvfb-run -a -s "-screen 0 1600x900x24" godot --path . -s
  res://tests/playthrough.gd -- boosted --shots DIR --every 12 --size 844x390`
  (also 932x430 and 1024x768): a screenshot every 12 game-seconds and
  `DIR/contact_sheet.png`.
- `xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/ocean-shots [names]`;
  `-- DIR 07` shoots only the ending (beat, dolly, card) at phone size.
- `python3 tools/browser_check.py games/drain-an-ocean`: web export in
  headless Chromium as an iPhone in landscape, three sizes.
- `tests/pacing.gd` (the old greedy estimate), `tests/parse_all.gd`,
  `tests/bay_check.gd` as before.

## Rebuilding assets

- Level: `python3 art/bay/make_bay.py --preview /tmp/bay.png` (prints every
  pool's spill level; the preview shows contours, pools, wrecks and props).
- Models: `python3 art/blender/buildings.py` (houses, chapel, clock tower,
  sea wall, weir, lighthouse, stones), `wrecks.py`, `engines.py` (pumps,
  barge, helpers), `creatures.py`, `finds.py`, `aquarium_set.py`,
  `scenery.py`, `pumps.py` (each takes model names to build only some;
  shared helpers in `kit.py`), then `TILE=300 SAMPLES=10 python3
  art/blender/contact_sheet.py out.png [names]`.
- Register sketches: `python3 art/blender/sketches.py` (Freestyle line
  renders of each species into `ui/sketches/`, plus silhouettes).
- After adding a script with a `class_name` or a new model, run
  `godot --headless --import` once before the tests.
- Icons: `python3 art/icons/make_icons.py` (also writes `icon.svg`).
- Sounds: `python3 art/audio/make_sfx.py` (numpy, scipy, ffmpeg).

## Credits

Made by Game Quarry. Fonts: Fraunces (Undercase Type) and Atkinson
Hyperlegible (Braille Institute), SIL Open Font License 1.1. Everything else
(level, models, icons, sounds) is generated by the scripts in `art/`.

## QA (polish block, 2026-11-10)

**Results** (all on this build):

- Smoke test: 98 checks pass.
- Playthrough bot: keen PASSED (dry at 32:16 game time, 81 s real), casual
  PASSED (63:19, 2.5 min real), boosted PASSED (2:49, 14-35 s real; run
  five times in a row to rule out flakiness). Every run: 49 of 49 creatures,
  12 of 12 finds, every pool pumped, all four barges, every upgrade, helper
  and tier buyable at the end, five save/reload round trips that matched,
  stubbed ads and purchases paying out, no errors.
- Chaos run (5 game-minutes): PASSED.
- VISUAL_AND_BROWSER

**Pacing** (game time; keen buys whenever it can and taps everything,
casual looks in every few minutes, buys two things at a time, wanders off to
the aquarium and pauses; boosted is dev income x10 plus every ad):

| Moment | Keen | Casual | Boosted |
|---|---|---|---|
| first hand pump | 2:11 | 7:06 | 0:22 |
| Kelp forest | 3:14 | 5:55 | 0:48 |
| first diesel pump | 7:05 | 15:16 | 1:16 |
| Reef | 8:31 | 16:02 | 1:42 |
| Shipwrecks | 14:35 | 28:17 | 2:17 |
| first giant siphon | 20:30 | 28:56 | 2:14 |
| The trench | 21:40 | 37:00 | 2:31 |
| The lost town | 28:39 | 50:10 | 2:40 |
| first whirlpool engine | 30:53 | 50:00 | 2:38 |
| **the bay is dry** | **32:16** | **63:19** | **2:49** |
| pump purchases | 24 | 26 | 29 |

Aquarium takings at each ring: 9/s, 117/s, 549/s, 1.6K/s, 4.2K/s (boosted
about 6x that). **Idle check:** at the lost town the first whirlpool engine
costs 5.6 minutes of aquarium takings (the bot fails under 3), and the last
metres count 45x, so leaving the game to the aquarium doesn't buy the
ending: the top tier has to be bought and run.

**Bugs found and fixed** (each has a smoke assertion):

1. Playthrough (boosted): a pool pumped shallower than a barge's 15 cm
   draught, or a barge grounded by an unrelated split, could never be
   finished: the pool held water for good. Barges now float on any water at
   a pool's deepest point.
2. Screenshots: the Chandlery rebuilt itself on every aquarium payout,
   several times a second: a frame of overlapping rows (price stamps under
   the next row), and a stamp could be freed under a finger. It now
   restamps prices in place, rebuilds only when something on the board
   reads differently, and never while a stamp is held.
3. Screenshots: the specimen register ran off both sides of a 1280x720
   screen, and read "out in the the lost town".
4. Screenshots: a salvage crab's find put its specimen card up in the
   middle of the ending's shot.
5. Screenshots: stranded fish, a pelican's catch on its way to the
   aquarium and barges aground in the square sat right in front of the
   ending camera; anything in its sightline is now left out of the shot.
6. Chaos: F9 could open the dev log over the aquarium.
7. Playthrough: a body of water that had just split away could be asked
   for its deepest point after it was gone (an out-of-range read from the
   soundings); now safe.
8. Smoke (ending): messages queued while the HUD was away came back over
   the ending card; the queue now clears when the HUD goes.
9. Playthrough (error scan): the money cartouche's outline crossed itself
   (polygon triangulation errors in the log).
10. Pacing, from the bot's tables: the first tuning finished keen in 12:40
    without ever needing the top tier; the next stalled for good at 23 m;
    the next ran the finale in 3 seconds; and casual players who spent on
    upgrades finished faster than ones who didn't (upgrades too cheap).
    Retuned: tier costs, seepage that grows past 20 m, the town's 45x
    holding, steeper upgrade prices.
11. "1 creatures rescued" on the ending card.
12. Screenshots: the ending camera came to rest 1.7 m inside the basin's
    slope, looking through the back of the seabed (a dark wedge across the
    shot). It now rises until it clears the sand and sees the tower's foot.
13. Visual run: the land round the bay (the far grid) drew far paler than
    the bay's own land, a straight seam and washed-out corners in every
    wide shot: a StandardMaterial's sRGB vertex colours in the Compatibility
    renderer. It now uses `shaders/land.gdshader`, converting exactly as
    the terrain shader does.

Bugs in the bots themselves (not the game), also fixed: stale stamp states
after a rebuild, a money comparison racing the helpers' income, the chaos
run not closing the fake ad screen when recovering.

**Art fixed from the re-shoots:** the river weir was white boxes (rebuilt
stone by stone in Blender with cutwaters, a plank gate, a footbridge and
winding gear); the river was a flat cyan strip (now shaded bank to channel
and fading into the banks); long hoses were ruled lines across the bay (now
laid in loose loops that widen with the run); the aquarium's light shafts
read as solid planks (fog on additive quads); the brain coral was a smooth
orange egg (now a lumpy dome with deep meandering valleys).

## Balance notes

All numbers in `scripts/balance.gd`. The bay holds about 65,000 m3 below the
old sea level, but deep water counts for more per metre
(`Bay.volume_mult`: 1 + (depth / 2.4)^2, so x26 at 12 m and x70 at 20 m,
and the town's last water a further x45 from 20.5 m) so the small deep rings
still take minutes. Pump flow loses to lift (`HEAD_LOSS` 0.11 per metre,
eased by Pipe width) and the sea seeps back in at 7 x depth^2.45 m3/s,
growing another 8% per metre past 20 m: that is the gate. Each pump tier
reaches about one ring deeper and the water slows to a stop near your
pumps' limit (the dial's red seep needle catches the black one and a notice
says so); the lost town needs the whirlpool engine. Tiers are about 4x apart
in flow (40, 150, 580, 2.3K, 9K) and cost 18, 320, 7.5K, 170K, 1.4M, x1.55
for each further pad at a tier. Upgrades grow x2.8 to x3.1 a level, so they
help but never replace the next tier.

Money: rescues pay a small bounty at once; the aquarium's takings (total
appeal x 0.8 a second) are the main earner and grow 3-13x per ring; finds,
wreck loads and ring bonuses (60, 700, 4K, 20K, 90K) are kept to a fraction
of the next tier's price so a new ring never pays for everything at once.

## Next steps

1. **Fresh-eyes critic, round 2**, on the new shots, the model contact
   sheet and the visual-run sheets.
2. **Real ads and purchases** through the provider interface (STUDIO.md,
   "North star"); the stub stays for playtest builds.
3. **Music** (generated, per ring) and separate music/effects sliders.
4. **Juice**: squash on rescues, a crate swing on wreck salvage, the lost
   town's clock striking at the end, pelicans visibly carrying the fish.
5. A second modelling pass on the weakest small props, judged from the
   contact sheet: the statue, weathervane, figurehead and compass finds and
   the wreck crate are still simple. Also a name plate on the aquarium tank
   (it's blank), a splash screen, a breaking-wave line along the sea wall.
6. Frame rate on a real phone (the browser here renders at about 1 fps).

## Known bugs / rough edges

- The water's edge pulls in by up to half a metre next to a ridge between
  two bodies of water (the dry ridge vertex draws the higher body's level).
- Slumped kelp on dry sand fans out rather than lying along the slope.
- Creature markings are painted per vertex, so small patterns are soft.
- The time offer's tag and a hint tag can both be up at once (they belong
  to different things: the pennant and the bay).
- The phone-size screenshot resizes the window under xvfb; if the window
  manager ignores it the shot is 1280x720.
- Headless runs print leaked-RID warnings at exit (dummy renderer teardown).
