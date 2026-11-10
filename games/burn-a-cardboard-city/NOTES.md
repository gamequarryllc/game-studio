# Burn a Cardboard City

Someone filled an enormous empty warehouse with a whole city built from cardboard
boxes: suburbs of little box houses, a downtown of office boxes, a row of skyscrapers
and a cardboard castle in the middle. You are a giant next to it, seen from your own
eyes: the houses come up to your knees, the offices to your chest. Burn it all down,
block by block. It's a craft project: nobody lives there but flat paper cut-out people,
who hop out and skip off to safety.

Godot 4.7.2 (`godot_version.txt`; moved from 4.4.1 in the ship prep), Compatibility renderer,
landscape 1280x720 (stretch: canvas_items / expand).
Bundle ID: `com.gamequarry.burnacardboardcity`.

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
| Warehouse steel | `#5c6b7a` | Walls, dim overlays: the cool backdrop (the concrete floor is a darker, matte `#3a3d42`-ish grey so kraft and fire stand off it) |
| Flame | `#ef7a28` | Fire, the crosshair when it can light, the one call-to-action colour |
| Paper | `#f7f1e3` | Notes, price tags, luggage tags, item cards |
| Char | `#2a2420` | Everything burnt (never `#000`), with grey ash `#8a8580` on top |

District materials (the city is a recycling-bin craft project): the suburbs are cereal
boxes painted in chalky poster paint (teal, mustard, brick, chalk) with the print left
showing on the back panels and the roofs folded from other boxes print side up, plus
milk and juice cartons, a tissue box and an inside-out cereal box, with big cereal-box
prints on their roofs so they read at play distance; trees are scrunched sage tissue on
six-sided painted pencils in a thumb-pressed blob of clay (the fir is one spiral of
twisted tissue); lawns are sage construction paper with fibres, a pale cut edge and
lifted corners. Downtown is
printed shipping boxes (made-up brands: Kestrel, Parcelo, Tinworks, Mossy, Bluefin,
No. 9; stencilled handling marks, barcode labels, the box maker's round stamp).
Skyscraper row is white copy-paper boxes with lids, stacked 2-3x downtown's height.
Box stock varies per building in the shader (kraft, white-lined, dark brown, sun-faded,
grey board; copy-paper in cream, cool and bright whites), and so do the felt-tip pairs
the windows were coloured with. The castle is egg boxes on a wooden pallet (deck boards
you can see under): toilet and kitchen rolls with the spiral seam of the wound paper
showing, cones rolled from printed cereal card with a taped overlap seam, battlements
of egg cups cut from a grey carton with gaps between them.

**Type.** Headers: *Saira Stencil One* (OFL, `fonts/SairaStencilOne-OFL.txt`), stencilled
like the markings on a shipping box: district names, the box's title and tabs, card
titles, button words. Numbers: *Permanent Marker* (Apache 2.0, `fonts/PermanentMarker-LICENSE.txt`)
only for coins, prices, floating numbers and the chain stamp. Body: *Patrick Hand* (OFL,
`fonts/PatrickHand-OFL.txt`) for notes and descriptions. Box print (baked into the marker
sheet, not used in the UI): *Archivo Black* (OFL, `art/fonts/`). Scale: 68 (chain stamp)
/ 40 (coins, popup titles) / 30-34 (box title, featured card) / 22-24 (labels, card titles)
/ 19-22 (body) / 18 (tabs).

**UI motif: cut cardboard tags held on with masking tape.** Every panel is a piece of
board or paper cut by hand (`scripts/card_style.gd`: irregular edges seeded per panel,
faint corrugation lines, a darker cut edge, a soft drop shadow, tape strips with torn
ends). Buy buttons are paper price tags with a punched hole; the timed offer is a luggage
tag that swings on its string; first-run hints are notes taped up at both corners; chains
are stamped on in red marker. Tags sit 1-3 degrees off true on purpose. The shop is the
inside of a cardboard box in perspective (darker inner walls, a corrugated cut rim, flaps
standing open) with a divider of five tabs cut to different widths; the starter pack is a
matchbox whose drawer slides out, the price on a tag tied on with string; phone controls
are bottle caps; the wind is a ribbon tied to a drawn fan. One note at a time. Icons
(`icons/*.svg`, drawn by `tools/make_icons.py`) are one style: a thick ink outline over a
marker fill printed slightly off register, like a hand-coloured sticker. No emoji anywhere.

**Shape language.** Boxes, never quite square: tops sag, flaps stand open at different
angles, corners are bevelled and wander a few millimetres. Round things are cardboard
tubes and rolled paper cones (turrets, the poster-tube hotel, paper trees), wheels are
bottle caps. Windows, doors and box labels ("KITCHEN", "BOOKS", "FRAGILE") are felt-tip
drawings with overshooting corners and scribbled fills (`models/marker_sheet.png`, drawn
by `art/textures/make_marker_sheet.py`, which also prints the boxes' brands, stencils and
labels). Fire is cut paper too: six flame shapes from layers of coloured paper with torn
edges and a deep red base (two whole fires, two licks, two low fires); each building gets
ONE big flame cluster rooted on its roof where it's alight (two or three along a long
wall), a few licks on the roof edges and, once well alight, up the corners facing you,
leaning with the fans and flipping at a stop-motion 8 frames a second; burning scraps get
one low flame per 1.5 m patch. Smoke is a column of torn grey tissue, sooty low down,
leaning downwind; sparks are hard orange specks. Burning creeps up the board as one
dark-brown scorch front with a thin glowing edge. Things fall with
weight: towers lean back before they go (anticipation), accelerate, bounce and squash
flat on impact; houses fold down like a box being stamped on; what's left is a crumpled,
torn shell or a fallen tower lying along its fall, in matte char with soft ash on top,
toasted curled lips catching the light, embers cooling to grey, and one wall left
standing (the paint still showing low down) so you can tell what stood there; on the
floor round it, a hand-painted scorch decal (`models/scorch.png`, brush strokes, soot
dragged outward, no noise). The giant's tools are held in a chunky cartoon hand with an
ink outline, a hammer grip with the thumb wrapped round, framed above the phone's buttons.

**Light.** Late afternoon in a dim warehouse: a warm `#ffcf92` key low through the west
windows (26 degrees, long shadows: real shadow maps on computers, baked along the key
into the floor on phones), a cool `#7488aa` fill, low ambient (0.34), dusty light shafts,
skylights that glow without blowing out. The floor darkens near the giant's feet and a
soft vignette frames the foreground.
Four pooled fire lights (the biggest fires near you) are added in the shaders themselves,
so phones get them too. The haze browns and thickens as the city burns.

**Inspirations (outside games):** cardboard-box towns made in school craft lessons;
felt-tip drawings in children's craft and activity books; stop-motion films shot on
cut-paper sets.

**Models** are built in Blender (5.2 as a Python module, headless) from scripts in
`art/blender/` and exported to `models/*.glb`. Each model has a "card" surface (vertex
colours = paint x ambient occlusion baked in Cycles; alpha = material: card, paper, tape,
shiny, glass) and a "decal" surface (marker drawings from the marker sheet).

    python3 art/textures/make_marker_sheet.py     # the felt-tip drawings
    python3 art/textures/make_fire_sheets.py      # models/flames.png, models/smoke.png
    python3 art/textures/make_scorch_decals.py    # models/scorch.png (the painted scorch marks)
    python3 art/blender/build_all.py              # every model -> models/*.glb (about a minute)
    godot --headless --import                     # always re-import after building models
    python3 art/blender/contact_sheet.py /tmp/sheet.png houses.glb offices.glb   # Cycles review render
    BACKFACE=1 python3 art/blender/contact_sheet.py /tmp/tools.png tools.glb     # (culls the hand's outline hull)
    python3 tools/make_icons.py                   # icons/*.svg and icon.svg

## Status: first playable; review-3 critic "almost"; ship prep done (Godot 4.7.2, real AdMob + RevenueCat with placeholder ids, release leftovers out; see "Ship prep")

Ship prep (2026-11-10) put the studio's shipping stack in: see "Ship prep" and "Money". It earns
nothing until the owner's ids are in (`store/README.md`, "Burn a Cardboard City"). Still open from
ART_REVIEW 3: its art items 1 to 6 and most of 8 and 9 (the one budgeted polish pass left).


Art pass 2 answered all 12 items of review 1, and the polish pass all 10 items of review 2
(plus its phone-readability notes) in `ART_REVIEW.md`; the QA blocks played every profile
start to finish (see QA). Next: the third fresh-eyes critic. Loads, phone and desktop controls work, fire spreads building to building, buildings
collapse and topple onto their neighbours in chains, coins come in (with chain bonuses),
4 tools, 5 upgrades, 2 helpers, a working shop (the box), the 2x rewarded boost and
the other rewarded ads, Remove Ads + permanent 2x, the timed offer tag, the starter pack,
the golden lens, coin packs and restore (all stubbed), finds (with "double this find"),
paper citizens, toy fire trucks that douse fires, autosave + save on backgrounding,
first-run hints, generated sound effects, dev boosts, and an ending when the keep falls.

## Ship prep (2026-11-10): Godot 4.7.2, real ads and purchases, release leftovers out

STUDIO.md shipping-list item 1 on this game, the second after Burn Down a Forest.
**Engine:** 4.4.1 to 4.7.2 (`godot_version.txt`); no script, shader or MultiMesh needed
changing, and the screenshots match the 4.4.1 ones. **Money:** the AdMob + RevenueCat stack
behind the provider interface (see "Money"), product ids `<bundle id>.<key>`,
`store_config.gd` placeholders, `tests/release_check.gd`, `tests/monetization_test.gd`.
**Release leftovers** (ART_REVIEW 3, items 7 to 9, the parts that show on the money screens):

- No "(test)" on prices outside playtest builds; developer tools only with the `playtest`
  feature (they used to show in every debug build, so in editor runs and screenshots).
- The starter offer has the screen to itself: every HUD piece now lives in `hud.hud_box`, which
  fades out under the offer and back after it, so the title no longer runs into the wind tag
  and no timed offer tag hangs behind it. The matchbox, its open drawer, the string and the
  price tag are placed to fit the screen (the tag used to hang off the right edge at 16:9 and 4:3).
- Coins print whole below a thousand ("3", not "3.2"); payouts round to the coin and never
  read "+0"; the rate keeps one decimal while it's small ("+0.7 a second").
- The delivery note prints time in words ("23 minutes of burning", "Under a minute of
  burning"), not "20s of burning".
- Restore purchases answers with what it found; the last strip of a list is no longer cut off
  by the box's lip; the store names of the products match the names the box shows.

**Results (Godot 4.7.2):** smoke test 122 checks pass (18 new); the ads and purchases test
passes (37 checks); the release check fails as it should, listing the four placeholders;
boosted passes (the keep falls at 18:13); keen passes and ends at 22:12 (candle 5:35, blowtorch
15:33, rockets 20:20); chaos passes (6:07 of random input, 96% of the city down); screenshots
render clean (22, two new: the purchases at the end of Extras, and Settings). **Browser run:**
the 4.7.2 web export (10 MB of game data: the plugins add only their scripts) loads and starts
at 844x390, 932x430 and 1024x768 with the touch controls, a tap reaches the game, no console
or page errors. **iOS:** `tools/fetch_plugins.sh` fetches both native halves for this game and
`tools/ios_preset.py` writes its preset (iOS 15.0, the tracking prompt's text, RevenueCat on);
the iOS check build on GitHub's Mac runner is the proof that it compiles and links.

**Bugs found and fixed in this block** (numbered on from the QA list; each has a smoke check):

21. "(test)" on every price in screenshots and any non-playtest build.
22. Developer tools showed in editor runs and screenshots (any debug build).
23. The starter offer's title and text ran into the HUD's wind tag, with the timed offer tag
    still hanging behind it.
24. The starter offer's price tag hung off the right edge of a 1280-wide screen.
25. "3.2" coins on the counter and decimal payouts.
26. "20s of burning" on the delivery note.
27. Restore purchases never said what happened.
28. After "Walk around the ashes" every HUD piece was forced visible, whatever its own state.

## The design

**The core: buildings are structures that burn, weaken and fall** (`scripts/city_grid.gd`).
The floor is a 122 x 122 grid of 0.5 m cells (61 m across): 9 x 9 blocks of 8 cells. The
streets inside a district are 3 cells of grey card with tape lines; between districts the
streets widen to 5-7 cells of bare warehouse floor (`Balance.STREET_W`, `GAP_STREETS`),
where the builder's giant paint cans, mugs, tape rolls, pallet, pen and scissors stand. Every house, car, paper tree, office box, skyscraper, castle piece and fire
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
  anything whose threshold is below it. Houses, cars and trees (6-15) take the magnifying
  glass (20); office boxes (56-88) and fire trucks the candle (120); skyscrapers (272-425)
  the blowtorch (480); the castle (760-1225, up to 2,470 where the moat makes it damp) the
  rockets (2600; bursts pile up to that, so a dry wall takes one rocket and a damp one two
  or three). Damp doubles a threshold but never past what the building's own tool lights
  at base power (`Balance.TIER`): nothing needs upgrades to reach (the bot once stalled at
  97% with rockets that couldn't light the damp towers). A falling tower's spill can light
  its own tier on the far side of a street; it can't jump a tier.
- **Streets** stop radiant heat. Fire crosses them on cars parked in the middle lane
  (a car is one cell from both kerbs), on toppling towers, on burning scraps blown off
  tall buildings (spotting), and with Dry cardboard.
- **Wind** comes from four big floor fans, one per wall; every 70-130 s a different one
  comes on (the wind swings round, its blades spin up). The HUD arrow shows it relative
  to where you look.
- **Obstacles.** Toy fire trucks (9) squirt water at the nearest fire within 4.2 m every
  2 s (knocking half the fire off; a doused building stays wet for 8 s) until you burn
  them (candle) or their tank runs dry (12 squirts, saved; the bot found a deadlock without
  it). Puddles from the leaky roof make the buildings within 2 cells damp (2x
  harder); the castle has a moat.
- **Districts** (square rings): the suburbs, downtown, skyscraper row, the cardboard castle.
  The block in front of the castle gate is a low square of paper trees, so the castle stays
  in sight straight up the main street from the warehouse door (where you start).
- **District gating** (`Balance.TOOL_GATE`): the next tool only goes on sale once 85% of
  the suburbs (candle), 86% of downtown (blowtorch) or 86% of skyscraper row (rockets) is
  down. The district tag shows a notch where that is; the box says what it's waiting for.
- **The keep's walls** (`Balance.KEEP_GATE`): the keep won't catch until 75% of the rest
  of the castle is down. You breach the walls first.
- **No dead ends:** if nothing you can light is left and you can't afford the next tool,
  it goes on clearance for what you've got (`GameState.tool_cost()`; the bot found this).

**First person, as the giant** (`scripts/giant.gd`). Eye height 3.3 m, looking down at the
streets. You stride over anything below 1.25 m (houses, cars), jumping clears downtown;
skyscrapers and the castle you walk round. The tool works where the crosshair lands, out
to its range. The held tool is drawn at the bottom right, its grip pinned to a point measured
from the screen's bottom-right corner (`Giant.grip_screen`: above the jump and fire caps
on phones, lower on computers), so it sits in the same place on any screen shape, bobbing
with your stride. Big collapses near you shake the view.

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
- Tools, bought in order, each held in the giant's drawn hand (`scripts/tool_fx.gd` draws
  the effects): Magnifying glass (a brass ring whose lens shows the city magnified and
  bent, a white-hot focus dot and a wisp of smoke), Candle (drips of burning wax),
  Blowtorch (gas canister, valve, brass nozzle, a hissing blue jet), Firework rockets
  (paper rockets on sticks out of a glass bottle; spark trails, felt-tip star bursts).
  250, 9,000 and 24,000 coins (`Balance.TOOLS`). Each tool has to **focus** on one thing for a moment before it
  gives its full heat (`Balance.FOCUS`: the glass 3 s, wax 2.2 s, the torch 1.2 s); the
  crosshair's ring fills meanwhile. Sweeping the tool about barely warms anything.
- Upgrades: Hotter flame (+12% power), Dry cardboard (+4% spread), Loose change (+12% coins),
  Cheap glue (buildings fall 5% sooner: faster chains), Big boots (+8% speed). Each level
  costs about 2.1-2.3x the last.
- Helpers (`scripts/helpers.gd`, each one 1.75x the price of the last): wind-up cars with a sparkler taped on (drive the street
  grid by breadth-first search, pull up beside a house and hold the sparkler to it), and
  paper planes with a lit fuse (circle office roofs).
- Paper citizens (`scripts/citizens.gd`) hop out of burning buildings, skip away and fold
  themselves up. Finds pop out of falling buildings (5% of houses, 15% offices, 35%
  skyscrapers, every castle piece): a rubber duck, a lost sock, a toy robot, marbles, a
  yo-yo, a very small teddy (0.4 min of income each, capped by what the building was
  worth; finds don't count as income, or they compound), drawn from a shuffled bag so all
  six turn up, and 7% of the time a golden ticket (2 min of income, one for sure after 18
  finds without; a rewarded ad doubles it). The shop's Finds tab collects them.

## Money

Architecture as in the studio's reference game: the game only talks to the `Monetization`
autoload, which forwards to one `MonetizationProvider` (`Monetization._create_provider()`):

| Build | Provider | Ads | Purchases |
|---|---|---|---|
| iOS release (what ships) | `MobileMonetizationProvider` | AdMob (`admob_ads.gd`): rewarded + interstitial, Google's consent form (UMP) first, the iPhone tracking prompt (when the IDFA message is on in AdMob), retry with back-off (4 s to 2 min) | RevenueCat (`revenuecat_store.gd`): purchase, restore, local prices from the store |
| playtest (web play links, iOS playtest flavor) | `StubMonetizationProvider` | pretend 3-second ads | pretend purchases, counted in the playtest tools; prices say "(test)" |
| editor and tests (debug, no `playtest` feature) | `StubMonetizationProvider` | pretend | pretend, plain prices |
| a release desktop build | base `MonetizationProvider` | none | none |

Each half of the real provider switches itself off when its plugin or ids are missing (ads
report "not ready", so no offer tag shows; purchases fail politely). Debug builds and builds
with the `test_ads` feature only ever load Google's test ad units. The stack (Poing Studios
AdMob v5.1.0, GodotX RevenueCat 2.6.0) is the one Burn Down a Forest took from the reference
game: the GDScript halves are in `addons/`, the native iOS halves are fetched at build time by
`tools/fetch_plugins.sh` (pinned in `tools/plugin_versions.env`, never committed). Both editor
plugins are on in `project.godot`; on a headless import the AdMob plugin downloads its small
native libraries into `addons/admob/*/bin` by itself (ignored by git).

**Ids that ship in the app** (`scripts/monetization/store_config.gd`, each a clearly marked
PLACEHOLDER until the owner provides it):
- `REVENUECAT_KEY_IOS`: RevenueCat's public App Store key (`appl_...`).
- `ADMOB_REWARDED["iOS"]`, `ADMOB_INTERSTITIAL["iOS"]`: one rewarded and one interstitial ad
  unit (`ca-app-pub-.../...`); every rewarded placement shares the one unit.
- The AdMob **app** id (`ca-app-pub-...~...`) goes in `project.godot` as `[admob]`
  `general/ios/app_id="..."`. Until then it is Google's sample app id (the plugin's default).
- `PRIVACY_POLICY_URL` is already set: the studio's page, https://gamequarryllc.github.io/game-studio/privacy/.

`tests/release_check.gd -- iOS` lists every placeholder still left (four today) and checks the
product ids, the store listing and that the iOS preset has no `playtest` feature;
`tools/ios_build.sh` runs it on every iOS build, and a TestFlight upload of the release flavor
stops until it passes. `tests/monetization_test.gd` drives the real AdMob and RevenueCat code
against fake plugin singletons (37 checks). To switch the real ones on: put the ids in (or send
them to Claude; none is secret), run the release check, then Actions > "iOS build" >
`burn-a-cardboard-city`, `testflight`, `release`. The owner's account steps are in
`store/README.md`, "Burn a Cardboard City".

In the box: Extras ends with Restore purchases, which says what it found in a note; Settings
(the dial beside Close) has "Privacy policy" and, where Google says the player must be able
to reopen the consent form (EEA/UK), "Ad privacy choices".

**Rewarded ad placements** (all share the one AdMob rewarded unit; the names are the game's own bookkeeping):

| Placement ID | Reward | Where |
|---|---|---|
| `boost_2x_fire` | 2x fire for 5 min (coins and tool power), stacks to 15 min | The box > Extras, offer tag |
| `helper_rush` | Helpers work 3x (and hurry) for 3 min | The box > Extras, offer tag |
| `instant_coins` | 3 min of recent income, capped at 60% of the next tool, 4 min cooldown | The box > Extras, offer tag |
| `double_find` | Double a golden ticket | Tag for 9 s after a golden ticket pops out |

**Interstitial placement:** `shop_close` (closing the box is the natural break). Never in
the first 5 min, at most every 4 min, never right after a rewarded ad, never with Remove Ads.

**In-app purchase product ids** (each is `com.gamequarry.burnacardboardcity.` + the key; ids
can't repeat across the account's apps; `store/burn-a-cardboard-city/listing.json` has the same list):

| Key (product id = bundle id + "." + key) | Type | Price | RevenueCat entitlement | What |
|---|---|---|---|---|
| `remove_ads_2x` | non-consumable | $4.99 | `remove_ads` | No ads between breaks + permanent 2x (the anchor offer) |
| `starter_pack` | non-consumable (one time) | $1.99 | `starter_pack` | "A box of matches": 2,500 coins + party sparks (exclusive cosmetic: every tool's sparks in felt-tip colours). Offered once after 10 min as a matchbox with the price on a tag, and in the shop |
| `golden_lens` | non-consumable | $2.99 | `golden_lens` | Premium cosmetic: gold fire and a gilded tool, +10% power (toggle in the shop) |
| `coins_small` / `coins_medium` / `coins_large` | consumable | $0.99 / $2.99 / $9.99 | none | 35% / 100% / 400% of the next tool's cost (at least 400 / 1.5K / 8K). Shown in the Tools tab when you're short for the next tool, and always in the Extras tab |
| Restore purchases | | | | The last strip of the Extras tab |

A restore (or RevenueCat's startup report) grants a non-consumable once and never flips the
player's own settings back (the golden lens toggle stays where they left it).

**Timed offer tag** (`scripts/ad_offers.gd`): a luggage tag hanging off the shop button
that names what it buys ("Free: +[coin]1.20K, enough for the blowtorch"). Gentle rules:
none in the first 4 min, one at a time, gone after 30 s, the wait grows 1.5x each time
one is ignored (5 min up to 10 min; it used to feel permanent on a phone), only offers worth having right now, never one whose ad
isn't loaded, the clock only runs while you play. Free coins that would buy the next tool
come first.

Guardrails: finishable without paying; Remove Ads and boosts speed it up.

## Dev boosts and code-driven play (playtest builds)

Not a tab in the box any more. In playtest builds only (the `playtest` feature tag: the web
play links and the iOS playtest flavor; no longer in every debug build, so they stay out of
editor runs and screenshots; tests switch them on with `GameState.dev_forced`): F1 on a computer, or hold the box's stencilled name ("THE BOX") for a second on a
phone, or Settings (the dial by the lid) > Playtest tools. It has: time scale 1x/5x/10x/50x
(`Engine.time_scale`), income x1/x10/x100, give coins, unlock everything (every tool,
upgrades to 5, helpers, every district open), skip to downtown / skyscraper row / the
castle, burn the district you're in, fake ad and purchase counts, and start over.

For the QA block's playthrough bot, every action is a call: `world.ignite_at(point)`,
`world.move_giant_to(point, look_at)` (nudged out of anything tall), `world.giant.aim_at(point)`,
`world.force_fire = true` (hold the tool), `world.bot_move = Vector2(x, forward)` (a thumb on the stick), `GameState.buy("tool:candle" | "upgrade:dry" |
"helper:windup")`, `world.skip_to_district(z)`, `hud.open_shop(tab)`, `hud.watch_ad(kind)`,
`Monetization.buy(id)`.

## What's done (polish pass, review 2)

- Floor and light for phones: darker matte concrete with joints, tape scraps, spills and
  splashes; darker card roads; a warmer, lower key; tamer skylights; a darker foreground
  (floor and a HUD vignette); craft props round the edges (glue gun, stepladder, offcuts).
- Burnt aftermath: painted scorch decals, matte char (no more white glints), ash on top,
  toasted lips, slower embers, one wall left standing per building, a pencil per tree.
- Fire: one rooted cluster per building, edge licks, corner flames, low flames per patch of
  scraps, denser leaning smoke columns, orange-speck sparks, a stronger fire light pool.
- Castle: spiral-seamed rolls, printed-card cones with taped seams, cut egg-cup battlements,
  a pallet deck you can see under. Trees and lawns rebuilt (tissue, hex pencils, clay;
  fibre paper with cut edges and lifted corners).
- Hand: a hammer grip per tool with the thumb wrapped round, framed above the buttons on any
  screen; the blowtorch with label, knurled knob, igniter and a roaring blue cone.
- Shop: tools in cut-out inserts (next tool big), in-world tab icons, ink-on-tape captions.
- HUD: a filled breeze tag, a labelled district notch, one note spot, screen-space coin
  numbers, a stamp that never jumps back, no placeholder copy, rarer offer tags.
- Variety: box stock and window pens per building, big roof prints.
- Ending: the hand goes, a 16 s crane over the ashes, nothing left standing.

## What was done in art pass 2 + its QA block

- Light: dimmer cool ambient, a warm low key with long shadows, cool fill, four pooled fire
  lights in the shaders, haze that thickens as the city burns.
- Fire: cut-paper flame atlas, a tall leaning lead flame per building, tissue smoke on the
  wind, a burn front with a thin glowing edge, char that's never black; 16 burnt states
  (crumpled heaps, fallen towers along their fall line) with embers cooling to grey.
- Models rebuilt per district (cereal-box suburbs, printed shipping boxes, copy-paper towers
  2-3x downtown, egg-carton castle on a pallet), floor gaps with the builder's giant props,
  FOV 60, the castle up the main sightline.
- The giant's drawn hand holds every tool; the magnifier's lens really magnifies.
- UI: stencil headers, marker numbers, one note at a time, device-aware wording, the shop as
  the inside of a box with five uneven tabs and the next tool up front, the matchbox
  starter pack, bottle-cap controls, the wind ribbon on a fan.
- Dev access without a tab (F1, hold THE BOX, Settings); the playthrough bot and the six
  balance passes; the bugs it found (QA).
- Tests: `tests/smoke_test.gd` (passes, 104 checks after the polish pass), `tests/playthrough.gd`, `tests/screenshots.gd`,
  `tests/quick_shot.gd`, `tests/fire_bench.gd`.

## What was done in the first block

- Structure fire simulation: heat, gaps and wind, fill, integrity, crumple and topple with
  impact spill, debris, spotting, chains, fire trucks, puddles and the moat, districts.
- Blender-built models (rebuilt in art pass 2: 6 houses, 5 office boxes, 5 skyscrapers, 5
  castle pieces, 3 cars, the fire truck, 4 trees, wind-up car, paper plane, rocket, 4 tools
  in the hand, 16 burnt states, the warehouse props), AO baked into vertex colours (not the
  hand), decals from a hand-drawn marker sheet.
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

## Next steps toward the polish bar (STUDIO.md)

0. **To ship:** the owner's ids (`store/README.md`, "Burn a Cardboard City"), a 1024 px store
   icon and App Store screenshots (`store/burn-a-cardboard-city/`), then the one budgeted polish
   pass left: ART_REVIEW 3 items 1 to 6 (fire, ruins, lighting, layout, models, the shop), the
   rest of 8 (the HUD's height, "0%, candle at 85%") and the art half of 9 (the ending's light).
1. **Pacing with people**: the bots finish in about 22-25 (keen) and 50 (casual) minutes; watch
   two or three real players before pushing the numbers further (see QA below).
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
- The giant can walk through rubble (it has no collision), including fallen towers.
- The bots finish in about 22-25 / 50 minutes against a 30 / 60 target (see QA).
- A big blaze is one endless chain (chain stamps show only at 3, 5, 8, 12, 20, 30, 50).
- MultiMesh custom data is stored as half floats by the Compatibility renderer, so the
  shaders' clock steps back every 5 min (`CityView._rebase`). If a falling building ever
  "jumps" in its animation, look there.
- MultiMeshes need `use_colors` with white instance colours in Compatibility or the vertex
  colours come out black (set on every structure MultiMesh).
- Headless runs print "resources still in use at exit" (dummy audio teardown). The
  playthrough bot ignores exactly that line and the ObjectDB leak warning at exit.

## QA

Every profile below played the game start to finish with no hand-holding. The bot
(`tests/playthrough.gd`) plays through the real controls: it walks with the stick
(`world.bot_move`, A* round anything it can't step over), aims the crosshair, holds the fire
button, and shops by pressing the box's own buttons. The parent process runs the game as a
child with its own save file (`CITY_SAVE`) and fails the run on any engine or script error in
the child's output (only the two known exit-teardown lines are ignored).

```
godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- keen|casual|boosted|chaos|castle [ads]
xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/city-shots [844x390]
xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 --fixed-fps 20 \
    -s res://tests/playthrough.gd -- boosted visual /tmp/city-visual
python3 tools/browser_check.py games/burn-a-cardboard-city      (from the studio root)
```

It fails the run on: no ending; no progress for 3 minutes; the controls off with nothing on
screen for 15 s (softlock); the giant leaving the warehouse; a save/reload at 12, 35, 62 and
85% down that doesn't bring back every building's state, coins, upgrades, helpers, finds and
the fire trucks' water; a tool, upgrade, helper or find it never got; a stubbed ad or purchase
flow that doesn't pay out (three rewarded ads from the Extras tab, double-a-find, the
interstitial and its 5-minute rule, all six products, no interstitials after Remove Ads,
restore); the ending's delivery note not showing, or the HUD not coming back after it.

**Results (polish pass, review 2):**

| Run | Game time | Real time | Result |
|---|---|---|---|
| smoke test (`tests/smoke_test.gd`) | | 5 s | passed, 104 checks |
| keen | 21m 18s | 92 s | passed |
| boosted (keen with dev income x10) | 17m 27s / 18m 03s | 60-72 s | passed (twice) |
| screenshots (`tests/screenshots.gd`, 1280x720 and 844x390) | | 5 min | 20 shots each, judged at phone size |
| browser (`tools/browser_check.py`) | | 9 min | passed: loads at 844x390, 932x430 and 1024x768, taps work, no console errors; on the 4:3 tablet the fist sits above the fire cap |

One boosted attempt crashed in the engine at startup ("Caller thread can't call this function
in this node" on the scene root, then signal 11) before the city had loaded, while other studio jobs were
running; the rerun and every run after passed. If it comes back, look at threaded loading.

**Results (art pass 2, final balance):**

| Run | Game time | Real time | Result |
|---|---|---|---|
| keen (plays well, never idles) | 21m 48s | 85 s | passed |
| casual (nearest target, watches its fires 8 s, wanders, shops now and then) | 50m 04s | 121 s | passed |
| boosted (keen with dev income x10) | 18m 14s | 90 s | passed |
| chaos (6 min of random keys, touches, buttons, shop, ads, backgrounding, resizes) | 6m 07s | 28 s | passed |
| visual (boosted, screenshots every 12 s at 844x390, 932x430, 1024x768) | 17m 14s | 558 s | passed (84 shots) |
| browser (`tools/browser_check.py`: web export, headless Chromium as a phone with touch) | | | passed: loads at 844x390, 932x430 and 1024x768, taps work, no console errors |

**Pacing (game time):**

Polish pass keen run: candle on sale/bought 4m 31s / 4m 35s, suburbs 90% 5m 37s, blowtorch
12m 44s / 14m 51s, downtown 90% 13m 09s, rockets 18m 22s / 19m 13s, skyscraper row 90% 18m 33s,
the keep falls 21m 18s (the offer tags now wait 4 min, then 5-10 min between: 6 seen).

| Milestone | keen | casual |
|---|---|---|
| first upgrade | 30s | 57s |
| candle on sale / bought | 5m 46s / 5m 47s | 17m 22s / 17m 44s |
| suburbs 90% down | 7m 19s | 18m 07s |
| starter pack offered | 10m 00s | 10m 00s |
| blowtorch on sale / bought | 13m 27s / 15m 27s | 33m 20s / 36m 51s |
| downtown 90% down | 13m 53s | 33m 43s |
| firework rockets on sale / bought | 19m 03s / 19m 38s | 44m 41s / 47m 12s |
| skyscraper row 90% down | 19m 11s | 45m 03s |
| the keep falls | 21m 48s | 50m 04s |
| longest chain, finds, upgrades at the end | 62, 61, heat 9 | 19, 59, heat 8 |

Against the target of about 30 (keen) and 60 (casual) minutes the bots come in at 22-25 and
48-50 (the previous pass, same balance but rockets at 45K: 24m 31s and 48m 38s; runs vary
by 2-3 min with the wind and the first fires). Both bots know every building's threshold and
never miss or hesitate, so people should take longer. It took six passes (keen 16 -> 19 ->
22 -> 22 -> 19 -> 20 -> 25 min): see Balance notes for what moved it and what didn't.

**Bugs the runs found, all fixed, each with a smoke-test check (`tests/smoke_test.gd`):**

1. Finds paid "0.4 min of recent income" and counted as income themselves, so they compounded
   into trillions late on. Finds no longer count as income and are capped by what the
   building was worth. (Check: a find's coins don't count as income.)
2. A save made while a building was falling stored it as fallen: after reloading it lay in
   the rubble without paying its coins or setting its neighbours alight. Falling now saves
   as burning. (Checks: a save made while a house is falling keeps it burning; the reloaded
   city doesn't count it as down.)
3. Dead end: the keen bot spent everything on upgrades, ran out of things the blowtorch could
   light and could never afford the rockets. The next tool now goes on clearance for what
   you've got when nothing is left to light. (Check: out of things to light and short, the
   next tool goes on clearance.)
4. Deadlock: fire trucks kept dousing the last suburbs while the candle (the only thing that
   lights them) waited for those suburbs to come down. Trucks now carry 12 squirts and run
   dry; the water is saved. (Checks: a fire truck runs out of water and stops squirting.)
5. Stall at 97%: the castle pieces by the moat were damp (2x) and out of the rockets' reach
   at base power, and a casual player who hadn't bought Hotter flame had no way to earn it.
   Damp is now capped at what each building's own tool lights, and the rockets' bursts pile
   up to exactly their stated power. (Check: every building can be lit by its own tool at
   base power.)
6. Two runs at once shared one save file and loaded each other's cities: `CITY_SAVE`
   environment override (also used by the tests).
7. Notes stacked on top of each other, floating numbers sat over the chain stamp, and phone
   hints said "click" / "press G": one note at a time, the stamp clears the numbers,
   device-aware wording. (Checks for each.)
8. The ending's card was drawn under the HUD: the HUD steps aside and "Walk around the ashes"
   brings it back. (Checks for both.)
9. The 2x boost timed itself on the wall clock, so it ran out while the game was in the
   background: it runs on play time now. (Check: the boost lasts its five minutes of play.)
10. Visual run: when the keep paid out, two coin numbers sat on top of each other and filled a
   third of the screen. Every floating number now shares one gap (on game time, so slow
   frames don't let them pile up) and none is drawn bigger than it would be 9 m away.
   (Check: two coin numbers at once, only one shows.)
11. Visual run: the district tag showed the whole city's progress and never drew the notch
   for the next tool. It shows the district you're standing in, with the notch where the
   next tool goes on sale (the keep's breach in the castle). (Check: the district tag.)
12. Screenshot run: with the focus time, half a second of the glass no longer lit anything,
   so "street on fire" showed no fire: the screenshot script lights it directly now.
13. Screenshot run: the ending's delivery note was placed before its backdrop had a size,
   so it was pinned up off the right edge of the screen; it's centred now. (Check: the
   delivery note is pinned up on screen.) It also said "1 buildings"; plurals fixed.

Found and fixed in the polish pass (each with a smoke-test check):

14. The "white blotches" on burnt ground were the burning scraps' char, glossy enough to mirror
    the low sun at grazing angles; char is matte now. (The noise scorch is gone too: painted
    decals.)
15. Two chains at once flicked the stamp x5 -> x8 -> x5: a smaller chain never stamps over a
    bigger one still showing, and the stamp lifts off. (Checks: both.)
16. The first-run hint and a note could show together (and the note sat over the breeze tag):
    one spot, the note takes it. (Check: never both.)
17. Coin numbers were 3D labels that shrank with distance (unreadable on a phone): screen text
    at 40 px. (Check: 34 px or more, screen layer.)
18. The hand sat under the jump cap on phones and under the fire cap on 4:3 tablets: the grip is
    pinned above the buttons from the screen's corner. (Check: fist above the fire cap, clear
    of jump.)
19. Castle pieces could still stand at the ending (the keep only needs 75% of the castle): the
    rest comes down round the keep and stragglers turn to ash. (Checks: nothing standing; the
    hand hidden and the camera moving; both back after "Walk around the ashes". The bot fails
    the run on either too.)
20. The smoke was there but too sparse and pale to read against the light boxes: denser,
    sootier columns.

The bot's own failures (stand spots inside the castle walls, interleaved logs from parallel
runs, the interstitial check not knowing the 5-minute rule, and in the first visual run its
shopping coroutine pressing a box the ending had already shut) were fixed in the bot.

## Balance notes

- The city (seed 20261110): 565 structures: 232 houses, 56 cars, 122 paper trees, 90 office
  boxes, 39 skyscrapers, 11 walls, 4 towers, a gatehouse, the keep, 9 fire trucks. Base
  value ~111K coins (keep 40K); chains, Loose change and finds multiply it.
- What sets the pace (found by the bot over six passes): the keen bot is never idle, so the
  run is as long as the number of things it has to light by hand, not the fire's speed or
  the prices. The knobs that moved it: the tools' focus time (`FOCUS`), how far fire jumps
  on its own (house/car `heat`, office/skyscraper `spill`, `WIND_GAIN`), the district gates
  (`TOOL_GATE`), and how much upgrades and helpers multiply that (Dry cardboard and Cheap
  glue per level, `HELPER_GROWTH`). Raising tool prices barely moved it: late income is
  large, and when there's nothing left to light the next tool goes on clearance anyway.
- Rockets cost 24K because that's about what players hold when skyscraper row runs out
  (at 45K every bot got them on clearance).
- Knobs: `KINDS[].heat / ignite / spill / burn`, `GAP_WEIGHT`, `COOL`, `CHAIN_*`, car chance
  per street (`_cars_and_trucks`), `DEBRIS_HEAT`.

## Files

```
project.godot / export_presets.cfg (preset "Web", playtest)   default_bus_layout.tres (SFX, Fire)
scenes/main.tscn            the only scene; everything is built in code
scripts/balance.gd          every number
scripts/city_grid.gd        the city as data and the structure fire (spread, collapse, topple, debris, trucks, saving)
scripts/city_view.gd        drawing it (MultiMeshes per model, flame clusters, smoke columns, sparks, scorch decals,
                            debris, floor, the pallet deck, lifted lawn corners, tape, bursts)
scripts/model_lib.gd        loads the Blender models and gives them their shaders
scripts/warehouse.gd        the building, light, fans (the wind), props
scripts/giant.gd            you: walking, stepping over, aiming, the held tool
scripts/tool_fx.gd          each tool's effect, rockets
scripts/helpers.gd          wind-up cars (street pathfinding) and paper planes
scripts/citizens.gd         paper people and finds
scripts/world.gd            builds it all, the loop, controls, wind, coins, hints, actions for bots
scripts/hud.gd              the HUD (every piece in hud_box), wind ribbon, offer tag, finds tag, chain stamps, one-at-a-time notes,
                            matchbox starter pack, ending
scripts/shop_box.gd         the shop: the inside of a box (5 tabs, featured next tool, settings, playtest tools)
scripts/touch_controls.gd   phone controls
scripts/craft.gd            palette, fonts, styles, icons
scripts/card_style.gd       the cut-cardboard StyleBox
scripts/gfx.gd              particles and textures for effects
scripts/game_state.gd       autoload: economy, purchases' effects, save/load, dev boosts
scripts/ad_offers.gd        when the timed offer tag shows and what it offers
scripts/monetization/       provider interface, stub, the real provider (mobile_provider, admob_ads, revenuecat_store),
                            store_config (the ids that ship), autoload facade (product and placement ids)
addons/                     the GDScript halves of the AdMob and RevenueCat plugins (native halves: tools/fetch_plugins.sh)
godot_version.txt           4.7.2 (CI, the iOS pipeline and tools/browser_check.py read it)
scripts/audio/sound.gd      autoload: effects, loops, volume
shaders/                    cardboard (+ box stock) + marker (+ window pens; collapse.gdshaderinc: the burn front), rubble (cooling embers),
                            held_tool (drawn style, the lens), firelight.gdshaderinc (4 pooled fire lights as shader globals),
                            paper_flame, smoke, sparks, torch_flame, scorch_decal, floor (+ the pallet deck), tape, light_shaft, metal_wall, prop
models/                     *.glb from art/blender (rubble.glb: the burnt states), marker_sheet.png, flames.png, smoke.png, scorch.png
art/blender/                model scripts: kit.py, suburbs.py, downtown.py, skyline.py, castle.py, rubble.py, vehicles.py,
                            nature_props.py, tools.py, build_all.py, contact_sheet.py
art/textures/               make_marker_sheet.py (+ the UV map it writes), make_fire_sheets.py (cut-paper flames, tissue smoke),
                            make_scorch_decals.py (hand-painted scorch marks)
art/fonts/                  Archivo Black (OFL), only for baking box print into the marker sheet
icons/                      drawn SVG icons (tools/make_icons.py)
audio/                      generated by tools/make_audio.py
fonts/                      Saira Stencil One (OFL), Permanent Marker (Apache 2.0), Patrick Hand (OFL)
tests/                      smoke_test, playthrough (the pacing/QA bot), screenshots, quick_shot (one view), fire_bench,
                            monetization_test (the real ad and store code against fake plugins), release_check (store ids)
```

Run: `godot --headless --import`, then `godot --headless -s res://tests/smoke_test.gd`;
screenshots: `xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/city-shots`.
