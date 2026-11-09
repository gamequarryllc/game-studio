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

## Status: first playable (2026-11-09)

**Done**
- The composed bay (`art/bay/make_bay.py`): sea wall and open sea, two
  headlands with the lighthouse, the town shore with pier and aquarium,
  six depth rings, eleven designed pools, three wrecks, the lost town.
- Water: one level falling with the pumps, pools cutting off at their rims,
  barges draining them, seepage at depth, the deep-water volume multiplier;
  stylised water (depth tint, foam band, swell, glints), wet sand that dries
  as the water leaves, caustics, chart isobaths, kelp that slumps when dry,
  chart soundings floating over every pool.
- Touch controls (drag pan with inertia, pinch zoom, tap), desktop mouse,
  wheel and keys; tap picking by screen distance (forgiving on phones);
  callouts with a leader line, one at a time.
- 5 pump tiers on 6 pads, barges, 4 upgrades, 2 helpers (pelicans fly
  rescues, salvage crabs walk the beach), 16 species, 12 finds, 3 wrecks with
  salvage loads, ring banners, ring bonuses, the ending (the town square's
  last water and the whale calf going home, its own card with the HUD
  hidden).
- The aquarium scene (its own camera and light), with the specimen register,
  ticket office and the double-tickets ad; the Chandlery (index tabs, ruled
  rows, stamped prices), purchases, restore, sound, playtest tools.
- The whole stubbed money set (see "Money"), timed offer pennant, light
  interstitials, starter pack offered once after 10 minutes, brass and
  signal-flag pump liveries.
- Save: autosave every 10 s, on backgrounding/focus loss/close, on leaving
  the chandlery and after every purchase; the water's bodies are saved as
  (tree node, level) pairs.
- Phone-first notices to mariners for the first steps (look, rescue, find,
  second pad, barge, hand pump, aquarium, chandlery) and a stall notice.
- Generated sound: sea and gull ambience, a loop per pump tier, rescue,
  find, salvage, ship's bell for each ring, bosun's whistle for offers, UI.
- 56 Blender models, 21 SVG icons, the app icon.

## Engine

- `art/bay/make_bay.py` (numpy) builds the level offline into
  `data/bay.json`: the heightmap (129x129, 1 m cells), painted vertex
  colours, hand-placed landmarks and prop scatter, and the **merge tree** of
  the seabed. Unplanned dimples are filled first (priority flood from the
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
  depth with a foam band; the seabed shader darkens wet sand near the water
  (and pools that just emptied dry over 45 s), adds caustics in the shallows
  and faint chart isobaths on dry seabed. Kelp is a MultiMesh whose shader
  reads the water over each base: swaying under water, slumping when dry.
- The aquarium is its own little scene at x = 4000 on render layer 2 with
  its own camera, environment and lights.

## Money

All stubbed through `scripts/monetization/` (provider interface +
`StubMonetizationProvider`, the reference game's architecture). Playtest
builds fake ads and purchases and count them in the Playtest tab.

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
chandlery's Purchases tab. Bundle id: `com.gamequarry.drainanocean`.

## Dev menu and bot hooks

Playtest builds only (`playtest` feature tag or the editor): the chandlery's
Playtest tab has time x1/5/10/50, income x1/10/100, give coins, unlock
everything, skip to any ring, reset the save, and ad/purchase/interstitial
counters.

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

- `godot --headless -s res://tests/smoke_test.gd`: 71 checks (pumps lower the
  level, more pumps pump more, a lagoon cuts off and keeps its water until a
  barge drains it, aground barges can be re-sent, rescues fill the aquarium
  and its income, ticket income arrives over time, finds and wreck loads pay,
  the wreck cooldown, shop purchases and refusing what you can't afford,
  every chandlery tab builds, 2x boost doubles flow and stacks to 15 min,
  Remove Ads gives permanent 2x and stops interstitials, cash and ticket ads,
  a cash pack, drag pans, pinch zooms, a quick touch is a tap, tapping a pad
  picks it and opens its callout, phone-first hint wording, save/load round
  trip of money, water, pools, rescues, pumps and purchases, seepage at
  depth and bucket brigades stalling against it, the ending).
- `godot --headless -s res://tests/pacing.gd [-- ads]`: the greedy-tapper
  pacing estimate (see "Balance notes"); `PACE_TRACE=1` logs the 6:30-7:10
  window that showed the old cascade.
- `xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/ocean-shots [names]`.
- `tests/parse_all.gd` loads every script (quick parse check);
  `tests/bay_check.gd` drains the bay headless and times it.

## Rebuilding assets

- Level: `python3 art/bay/make_bay.py --preview /tmp/bay.png` (prints every
  pool's spill level; the preview shows contours, pools, wrecks and props).
- Models: `python3 art/blender/pumps.py`, `creatures.py`, `finds.py`,
  `scenery.py` (each takes model names to build only some), then
  `python3 art/blender/contact_sheet.py out.png [names]`.
- Icons: `python3 art/icons/make_icons.py` (also writes `icon.svg`).
- Sounds: `python3 art/audio/make_sfx.py` (numpy, scipy, ffmpeg).

## Credits

Made by Game Quarry. Fonts: Fraunces (Undercase Type) and Atkinson
Hyperlegible (Braille Institute), SIL Open Font License 1.1. Everything else
(level, models, icons, sounds) is generated by the scripts in `art/`.

## QA (first playable block)

- Smoke test: 71 checks pass.
- Screenshots (`tests/screenshots.gd`, all checked by eye): the full bay at
  the start, the town shore, mid-drain with three lagoons cut off, soundings,
  hoses and stranded creatures, a pad callout with its leader line and
  disabled price stamp, a wreck out of the water, the wreck shelf with the
  ring banner, the aquarium, the chandlery (pumps and purchases), the phone
  size (1266x585) with touch wording and the offer pennant, the ending card.
- Browser run (`tools/browser_check.py`, local web export in headless
  Chromium as an iPhone in landscape): passes at 844x390, 932x430 and
  1024x768; the level data loads, touch works, no console or page errors.
- Fixed from the screenshots: fog washing everything out; the sun behind the
  camera (no glints, flat shading) moved to the west-north-west; aliased water
  normals and grain; oversaturated sand and lava-orange coral patches;
  banner, toast, notice and ending card placed off-screen (absolute
  positions set after layout); a toast stacking under the ring banner (now
  waits for it); dial labels colliding; the HUD showing through the
  chandlery; the aquarium's unreadable back button.
- Fixed from the pacing estimate: a dead opening (nothing for 5+ minutes),
  then a cascade from the first diesel to the end in 11 seconds (see
  "Balance notes").
- Bugs found while building, each now covered by the smoke test: GDScript
  lambdas capture locals by value, so the tap picker never picked anything
  (now a state dictionary); unnamed containers broke the banner and find-card
  paths; the tap test now picks a pump pad and opens its callout.

## Balance notes

All numbers in `scripts/balance.gd`. The bay holds about 65,000 m³ below the
old sea level (21K sandbars, 19K kelp, 12K reef, 7K wrecks, 4K trench, 0.9K
town), but deep water counts for more per metre (`Bay.volume_mult`, x1 at
the surface, x17 at 12 m, x45 at 20 m) so the small deep rings still take
minutes. Pump flow loses to lift (`HEAD_LOSS` 0.11 per metre, eased by Pipe
width) and the sea seeps back in at 7 · depth^2.45 m³/s, which is the gate:
each pump tier reaches about one ring deeper, and the water slows to a stop
near your pumps' limit (the red needle on the dial catches the black one,
and a notice says so). Tiers are ~4x apart in flow (40, 150, 580, 2.3K, 9K)
and cost 18, 260, 4.2K, 100K, 2.2M, x1.55 for each further pad at a tier.

Money: rescues pay a small bounty at once; the aquarium's ticket takings
(total appeal per second) are the main earner and grow about 5x per ring;
finds, wreck loads and ring bonuses are kept to a fraction of the next
tier's price so a new ring never pays for everything at once (an earlier
version cascaded from diesel to the end in 11 seconds).

`tests/pacing.gd` (a greedy tapper, not the playthrough bot) reaches: kelp
3:11, reef 9:00, shipwrecks 12:23, trench 15:51, lost town 21:24, dry
29:02, with stalls before each new tier. A real player taps slower and won't
buy perfectly, so a casual run will be longer; the playthrough bot (next
block) needs to confirm keen ~30 / casual ~60.

## Next steps (toward the polish bar)

1. **Fresh-eyes critic** on the screenshots and contact sheet, then fix.
2. **Playthrough bot** (`tests/playthrough.gd`: keen / casual / boosted),
   chaos run, visual run, browser run at three sizes; tune pacing with ads
   and without (the greedy estimate is 29 min).
3. **Art**: creature models need another pass (fins are flat boards, the
   clownfish tail is a block, the moray is plain); the water could use a
   breaking-wave line at the sea wall and spray from pump outflows; the far
   land frame is flat; houses are simple boxes; a splash screen.
4. **Music** (generated, per ring) and separate music/effects sliders.
5. **Juice**: squash on rescues, a crate swing on wreck salvage, the lost
   town's clock striking at the end, pelicans actually carrying the fish.

## Known bugs / rough edges

- Ring tags on the tide board can sit under the level tag when the water is
  right at a ring's top.
- The water's edge pulls in by up to a metre next to a ridge between two
  bodies of water (the dry ridge vertex draws the higher body's level); fine
  at normal zoom.
- Slumped kelp on dry sand fans out like a dark star rather than lying
  along the slope.
- Creature markings are painted per vertex, so small patterns are soft.
- The phone-size screenshot resizes the window under xvfb; if the window
  manager ignores it the shot is 1280x720 (still shows touch wording).
- Headless runs print leaked-RID warnings at exit (dummy renderer teardown).
