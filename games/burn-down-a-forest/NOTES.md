# Burn Down a Forest

## Art bible (read before touching anything visible)

**The look in one line:** a linocut picture book at night. Cold, crooked cursed
woods in plum and slate; one warm thing, the fire; a round, cosy village and
hero; and where the fire has been, a soft sage meadow.

**Inspirations (not games):** linocut picture books (flat cut shapes, an inked
edge, carved highlights); Scandinavian folk painting (round cottages, red and
cream, flowers in drifts); old forestry and fire-warden signage (burnt-wood
boards, stencilled lettering, tags on string).

**Palette** (sRGB; CIE L* lightness measured, so the value structure is real):

| Swatch | Hex | L* | Role |
|---|---|---|---|
| Plum shadow | `#2B1F3A` | 14 | shadows, cursed ground, fog base, the night |
| Hex violet | `#5A3F7A` | 32 | hex oak and giant foliage (under 40 on purpose) |
| Slate teal | `#2F5C66` | 36 | cursed pines, grass, gloom bushes |
| Curse mint | `#9FF0D0` | 89 | ONLY cursed knots (knothole eyes) and cursed hearts, and the sparkles round the hearts |
| Fire body | `#E8642C` | 59 | flames, the lit brand on the burn button: the main action |
| Fire core | `#FFC15E` | 82 | the hot core of flames, lantern glass, lit windows. Fire is never white |
| Meadow sage | `#8FAE5E` | 67 | the healed meadow; with poppy `#D9483B` and cream `#EFE3C8` petals |

UI: paper `#EFE3C8` (L* 90), ink `#2E1E14` (13), char `#1A1310` (7), the
keeper's blue-black handwriting `#2F3B5C`, stamp ink `#C24A22` (ember on
paper is only 2.6:1, stamp ink is 3.8:1). Contrast: ink on paper 12.6:1,
handwriting on paper 8.7:1, paper on char 14.4:1, fire core on char 11.4:1.
Ember orange appears in the UI only on the main action (the burn button's brand
while burning, the buy stamps).

**Value structure:** foreground woods darkest, plum fog lifts the distance,
the meadow sits mid-light, fire and the mint seeds are the only near-white
values. Ambient light warms from cold plum to warm grey as the meadow spreads.
For phones the woods never go near-black (the darkest quarter of a phone frame at L* 16-19, the median 21-29): a flat
night fill (`World.FILL_NIGHT`, the `fill` uniform on the ground, plant and
prop shaders) lifts dark colours most and light ones (plaster, packed earth)
hardly at all, and the ground colours themselves were lifted (moss `#3B3445`,
trails `#625850`). Measure with an L* percentile over the middle of a phone
screenshot before changing any of it.

**Type** (all SIL OFL, licences in `fonts/`): Keeper Fell for titles, names and
prices: IM Fell English SC with its old-style figures swapped for thickened
Libre Caslon lining figures (`art/fonts/make_keeper_fell.py` builds it; the
sources and their licences are in `art/fonts/`), because IM Fell's figures read
"+11" as "+II" and "x1" as "XI"; Alegreya Sans for body text with lining
figures on (`lnum`), and lining tabular figures (Bold, `lnum`+`tnum`) for the HUD
counter and the floating numbers; Caveat Brush for the keeper's handwriting,
never below 22 px. Scale (px at 1280x720): 17 / 19 / 22 / 28 / 36 / 48. On
phones (under ~600 points tall) the whole UI is drawn 1.32x bigger
(`Hud.fit_ui_scale`), so the 17 px small type is 12 px on an 844x390 screen;
the thumb controls keep their size. Wrapped notes go through `UiTheme.wrap`
(no lone last word).

**UI motif:** a field notebook plus burnt-wood signs. HUD pieces are charred
planks with saw-cut uneven ends, wood grain, fire-darkened ends and a hard 3-4
px ink shadow (no glows anywhere). Transient things are paper: taped toasts,
the offer tag hanging on a string, handwritten first-run notes beside the
control they explain with a drawn finger. The shop is the keeper's notebook:
leather cover, cream pages with grain, ruled lines and scorched edges, a
stitched spine, coloured index tabs, a sketch per entry, prices on taped
manila tags, ink stamps to buy, a red ribbon to close. Phone controls are
slices of log: a flame branded into the burn button, a chevron into jump.
Copy is short, dry, in-world, sentence case, never an exclamation mark.

**Icons:** one SVG set in `ui/icons/`, drawn by `art/icons/make_icons.py`:
2 px ink line, at most two flat fills, a slight hand wobble on every point.
Tools are drawn as the real objects; the currency is a cracked glowing coal. No
emoji anywhere.

**Shape language:** cursed things are spiky and crooked (hooked pine tips,
drooping star-shaped tiers, scalloped canopies with hanging points, clawed
branches, knothole eyes). The hero, the village and the meadow are round (bell
robe, loaf thatch, round doors and windows, cupped petals).

**Lighting:** the moon is the key: cool `#C4D2F2` from the upper left as seen
from the village (west-north-west, high), strong, with cast shadows (trees,
cottages, the keeper; grass, bushes and flowers don't cast), over a low plum
ambient so the shadowed sides stay plum and the lit tops read. A cold rim on
the canopy tops (plant shader). The foreground nearer than the keeper is
darkened to frame them. Warm light comes only from fire: a blurred per-cell
fire-light map (`ForestView._fire_img`, mipmapped) lights the ground, trunks,
props and the keeper near any fire, on phones too; one omni light follows the
nearest big fire on desktop. The keeper's lantern paints a warm pool on the
ground and warms nearby trunks. The flat ground's response to the moon is
damped (`key_response`) so the meadow sits mid-value under the trees' lit
tops. Linear tonemapping and no bloom. After the ending it's dawn (peach
horizon, warm low sun from the east).

**Fire:** an inked flipbook (`art/fx/make_fx.py` draws `fx/flames.png`, 4 x 8
cells): three flame silhouettes, a tall leading flame, two composed bonfires
(a leading tongue off to one side with licks stepping down from it), a low
ragged grass front and a dying fire, four held drawings each, played at 8 a
second, carved lines, sooty tips; stored as levels, so the shader paints
cursed-wood, phoenix or dragon fire. A burning tree is ONE bonfire set on the
near side of its crown (a lick at the roots on half of them, a tall leading
flame on giants and the Elder), dying down to low licks; grass burns as a
front along the fire's edge, thin behind it, with a tall crest now and then:
under two cards per burning cell. Every card shears downwind and its tip
curls further; cards shrink away near the camera, never stand taller than a
quarter of the screen (`max_screen`), and duck right down in front of the
keeper. Each tree sends up a three-puff plume that bends downwind, orange at
its base. The fire map lights trunks and the ground, and a wider blur of it
the undersides of nearby canopies. On the ground the fire's edge is a thin
glowing contour that creeps with the front (from the heat in the cell
texture's alpha); burnt ground is char `#2A2420`, never black. Trees char from
the roots up behind an ember line with glowing bark cracks.

**Camera:** an over-the-shoulder chase camera that rises over any canopy at its
spot (never pulls in among leaves), tilts down 0.3 rad more when the woods
round the keeper are thick (the player can still drag it back up), and cuts away everything up to the keeper's
depth inside a circle on screen round them, with an inked rim (grass and
bushes are spared, `ForestView.standing_flag`). The hero is always framed. The
keeper's ink outline fades in only while a fire burns between the camera and
them (`Keeper._update_outline`); otherwise they read by colour (mustard hood
against plum and teal) and a soft moon rim.

**Models:** all built in Blender from scripts in `art/blender/` (see "Models"
below), detail baked into vertex colours (ray-cast AO, a vertical gradient,
carved highlights on rims and tips, edge wear and crease grime from the
mesh's curvature, a soft painted mottle). The keeper's body is a quad cage
smoothed by subdivision (`characters.Cage`), then painted part by part.
Contact sheet: `python3 art/blender/contact_sheet.py OUT.png [files.glb] [--only a,b]`.

---

## The game

A cursed forest grew over the valley overnight and swallowed the village. You are
the village fire-keeper: burn the cursed forest back, ring by ring, and where it
burns, ash turns into a meadow of flowers. At the heart stands the Elder Tree;
burning it lifts the curse and frees the village. Cartoonish and magical: violet
and teal cursed trees, warm hand-drawn fire, critters that always scamper out unharmed.

**Godot 4.7.2** (`godot_version.txt`; CI, the iOS pipeline and the tools read it.
The AdMob and RevenueCat plugins need 4.7.2; the other studio games are still on
4.4.1), Compatibility renderer, landscape 1280x720 (stretch: canvas_items / expand).
Bundle ID: `com.gamequarry.burndownaforest`.

## Status: first playable; review-4 critic "almost"; ship prep done (Godot 4.7.2, real AdMob + RevenueCat with placeholder ids, debug leftovers out; see "Ship prep")

Loads, phone and desktop controls work, the fire spreads by itself in chain
reactions, embers come in, 6 tools (4 reachable in a normal run so far), 5
upgrades, 2 helpers, a working shop (the notebook), the 2x rewarded boost and
the other rewarded ads, Remove Ads + permanent 2x, the timed offer tag, the
starter pack, the Phoenix Flame cosmetic, ember packs and restore (real AdMob +
RevenueCat in iOS release builds once the owner's ids are in; pretend elsewhere),
autosave + save on backgrounding, first-run hints, generated sound effects, and
an ending when the Elder Tree burns.

## The design

**The core: fire spreads on its own** (`scripts/forest_grid.gd`). The forest is
an 80x80 grid of 1.5 m cells (120 m square). Each cell is grass, gloom bush,
cursed pine, hex oak, giant cursed tree, the Elder Tree, or stone / water / dirt
(which never burn). The fire is heat: a cell catches when its heat passes its
ignite threshold (each cell a little drier or damper than the next; cells within
two cells of water are 2.2x harder). A burning cell pushes heat into its 8
neighbours for its burn time, weighted by the wind (up to ~1.7x downwind, 0.15x
upwind), and pays out its embers while it burns, so a big chain reaction is a
big payday. Burned cells go to ash (glowing embers for a few seconds), then bloom
into a meadow. The fire runs at a fixed 10 Hz tick over sparse sets only (burning
cells, heated cells, ash waiting to bloom).

- **Tiers.** A cell heated only from outside settles at heat_in / COOL, so a tool
  with heat H lights anything with ignite < 2H. Each kind of plant spreads to its
  own kind but can only barely light the next kind up: each new tool opens the
  next ring (Matchstick: grass and bushes; Lighter: pines; Tiki Torch: oaks;
  Flamethrower: giants; Dragon Breath / heat upgrades / a whole burning grove: the
  Elder Tree). The HUD says when your tool is too weak and which tool would do.
- **Rings.** The Thicket (grass, bushes) outside, then Pinewood, Oakwood, the
  Cursed Grove, and the Elder Tree at the heart, ringed by giants. The village
  is at the south edge, with a patch of grass in front of it to light first.
- **Patches.** Dirt trails (the edges of a jittered Voronoi pattern) split the
  outer rings into patches of ~100 cells; a river crosses the north and there's
  a pond in the south-east; rocks sit in the outer rings. Fire can't walk across
  a trail, only jump it: burning bushes and trees throw **embers** a few cells
  downwind now and then (spotting). So one match burns one patch, and Dry Winds
  (more spread, embers jump further and more often) makes the chain reactions
  bigger and jump trails.
- **The wind** shifts every 70 to 130 s (direction and strength), shown by the
  HUD's wind arrow (relative to the camera). Flames and trees lean with it.

**Camera and controls** (`scripts/keeper.gd`, `scripts/touch_controls.gd`). An
elevated over-the-shoulder chase camera 11 m behind the fire-keeper (a round
figure in a soot-stained rust cape, an ember scarf and a round hood, a lantern
on a crooked pole held up on the side away from the crosshair), orbiting a
point a little above and to the right of them so the crosshair and its ring
never sit on the keeper. The tool heats where the screen's centre lands (the crosshair, and
an inked dashed ring on the ground), out to the tool's range; aim further and it
lands at the edge of the range. Everything up to the keeper's depth inside a circle on
screen round them is cut away with an inked rim (plant and prop shaders; grass
and bushes are spared), the camera rises over any canopy at its spot and tilts
down a little more in thick woods, and the aim ray starts just beyond the keeper
so it never picks a tree that's been cut away. The crosshair stops on the first
standing tree in line, so you step closer or round it to reach one behind.

| Phone | Desktop |
|---|---|
| Left thumb: floating stick to walk | WASD / arrows |
| Right side: drag to orbit the camera | Click, then move the mouse |
| Hold the burn button (a log slice with a branded flame; drag from it to aim) | Hold left click |
| Jump button (a log slice with a chevron) | Space |
| Notebook (plank, top right) | N or Tab |
| Tap the offer tag | Click it, or B (G doubles a golden critter) |
| | M mute, Esc frees the mouse |

**Progression** (all numbers in `scripts/balance.gd`):
- Tools, bought in order: Matchstick (heat 8), Lighter (40, 250 embers), Tiki
  torch (150, 9K), Flamethrower (520, 55K), Dragon breath (1800, 95K), Meteor
  shower (6000, 110K: the only thing that lights the Elder Tree, ignite 9000).
  Each has its own effect (`scripts/tool_fx.gd`): a flick of sparks, a thin jet,
  lobbed fireballs, a billowing cone, a purple dragon jet, shooting stars.
- **Tiers hold:** heat a burning plant pushes into a tougher kind of tree is
  damped (`Balance.TIER_UP` 0.35 one tier up, `TIER_UP2` 0.1 further), so a
  fire front can't light the next ring by itself (it used to cascade into
  whole-forest jackpots that bought four tools in two minutes). Within a kind,
  trees push about a quarter to a third of their own ignite level: fires run
  along fronts and die out in patches; grass and bushes still sweep a patch.
- **The safety net:** if nothing your tool can light is left (fewer than 150
  stray cells, about 3% of the forest, and nothing burning) and you can't afford the next tool (you spent on upgrades), the
  next tool costs what you have, with a toast and "a fair price" in the notebook
  (`GameState.stuck`, checked by `World`). No forest can leave you stuck.
- Upgrades: Hotter flame (+10% heat, 5 levels: reach a tier a little early, never
  skip one), Dry winds (+4% spread, embers jump further), Ember value (+8%
  embers, 15 levels), Wide flame (+6% flame size), Swift boots.
- Helpers (`scripts/helpers.gd`): fire sprites (round flame spirits with faces,
  light grass and bushes) and ember salamanders (ember lizards with a flame ridge,
  light pines and oaks). Each picks something it can light near the keeper, goes there and holds
  its heat on it. Past 12 of a kind the visible ones just burn hotter.
- Critters (`scripts/critters.gd`): a rabbit, a fox and a hedgehog (Blender
  models) bolt out of 7% of trees as they catch, bound away from the fire and
  pop out of sight with a drawn mint heart. 6% of them are golden and
  drop a bonus (1.5 minutes of income, capped at a quarter of the next tool, or
  20K once every tool is bought) that a rewarded ad can double.

**Art direction:** see the art bible at the top. **The world** (`scripts/forest_view.gd`):
pines and oaks in three sizes each (small/medium/large, picked from each cell's
`vary`), two kinds of giant, the Elder Tree (its face and glowing heart look
south at the village), gloom bushes, cursed grass, boulders, cheap silhouettes
on the hills. Hand-placed landmark trees (`ForestGrid._place_landmarks`, bigger,
with room round them): two crooked gate pines where the path leaves the thicket
(a great root arches over the path between them), an old watcher oak where the
path ends, a lone giant pine on the hill west of the village, a great oak by the
pond, a big pine east of the village. **The spawn** is composed: a cobbled
square with four cottages half-swallowed by roots as stage wings (warm lit
windows), a well, firewood, fences, lantern posts down to the path, roots
crawling across the square, flower gardens by the walls, and a winding path
(`ForestGrid.path_x`) leading the eye into the woods. **Fire**
(`shaders/flame.gdshader`): hand-drawn cel flames, flat body and core colours
inside an ink outline, a darker band at the edge, smoky tips, held drawings at
8 a second; opaque with a cut-out edge so it never blows out to white. Burning
trees char and glow in creeping ember veins. **The meadow** (`ForestView._bloom`):
poppies, oxeye daisies, buttercups and harebells in drifts of one species (a
low-frequency noise picks the species, a second one how thick), sage grass tufts
everywhere, flowers bunched round a spot in each cell, thinning toward trails,
rocks and water; the ground under it wanders organically (domain-warped cell
lookup), no grid edges.

**HUD and shop theme: burnt-wood signs and a field notebook** (see the art bible;
`scripts/ui_theme.gd` draws the planks, paper and tags as StyleBoxes,
`scripts/ui_parts.gd` the stamps, tabs, ribbon, fuse, wind disc, parcel and the
hint finger). The shop is **the fire-keeper's notebook**, opened from the HUD
anywhere. Chapters: Tools, Upgrades, Helpers, Free magic (rewarded ads), Shop
(purchases), Settings (+ developer tools in playtest builds). The left page
holds the embers, the chapter, a note in the keeper's hand, a doodled map of the
rings (burned share hatched, an x where you are) and a sketch of the tool in hand.

## Models

Every model is a Python script for Blender 5.2 (`import bpy`, headless) in
`art/blender/`, sharing `forest_lib.py` (bmesh sweeps, lathes, lumpy blobs with
scalloped rims and hanging points, crooked spines; ray-cast AO against the model
and a ground plane; a vertical gradient; highlights on rims and tips; export).
Vertex colours are linear; vertex alpha marks the part (1 foliage: sways and
shrinks as it burns; 0.5 glow: mint knots and hearts, windows, lanterns, sprite
bodies; 0 everything else). Triangle counts:

| File | Models |
|---|---|
| `forest.glb` (trees.py) | pine_s 313, pine_m 461, pine_l 581 (crooked trunk, drooping star tiers, hooked tip, mint knothole eyes on every size); oak_round 1.46K, oak_tall 1.05K, oak_lean 1.15K, oak_weep 1.38K (four silhouettes, each with a long bare forked trunk, clawed roots and twigs, carved scalloped cushions hanging into points, its own cast of violet, mint eyes); giant_a/b ~2.7K (buttress roots, clawed branches, carved cushions, curse moss, the curse's seed pod split open round a mint seed, with the only sparkles); elder ~6K (five crooked finger limbs reaching ~35 m, clawed tips, knuckle cushions, weeping moss, a seed pod in its trunk and a glowing seed held up in its palm, the face looking south); elder_stump 450 and sapling ~180 (what's left at the heart after the fire); grass 36, bush 140, boulder 120, far_pine 72, far_oak ~550 (a bare forked trunk under carved crowns with hanging points, planted in groves) |
| `meadow.glb` (meadow.py) | poppy 52, oxeye_daisy 80, buttercup 96, harebell 162, sage_tuft 28, tall_grass 162 (seeding grass, the tall layer), yarrow 176, sprout 42 (seedlings at the meadow's edge) |
| `village.glb` (village.py) | lodge ~11K (the landmark: coursed stone ground floor, jettied timber-framed upper floor, deep thatch with a dormer, porch on crooked posts, great fieldstone gable chimney, window boxes); cottage_mid (thatch loaf, fieldstone stack), cottage_small (wooden shingles, deep eaves, brick chimney), cottage_slate (hipped slate, clay chimney pot): all at house size, damp plaster, roots over them; woodshed; well ~2K (coursed fieldstones, shingled roof, windlass, rope, bucket); lantern_post, signpost, woodpile (split logs between stakes under a plank roof, chopping block and axe), fence, ground_roots, root_arch, flagstone_0..5 (flat hand-cut slabs, laid sunk) |
| `keeper.glb`, `tools.glb`, `creatures.glb` (characters.py) | the keeper: k_body ~6K (ONE subdivided mesh: cape with folds and a sooty ragged hem, mustard capelet, hood with a floppy tip and tassel round a face, knitted scarf, satchel with the notebook strapped on, a strap across the chest), k_hand (knitted mitten), k_foot (laced boot), k_scarf (the two loose ends), k_lantern, k_pole; matchstick, rainbow sparkler, lighter, tiki torch, flamethrower, dragon puppet, meteor staff (bevelled, worn); fire sprite, salamander (+ leg), rabbit, fox, hedgehog (heads, snouts, legs) |
| `fx/flames.png`, `fx/puffs.png` (art/fx/make_fx.py) | the fire flipbook (flames, leading flame, bonfires, grass front, dying fire) and the smoke puffs |
| `fonts/KeeperFell-Regular.ttf` (art/fonts/make_keeper_fell.py) | IM Fell English SC with lining figures from Libre Caslon Text |

`art/blender/contact_sheet.py OUT.png [files...]` renders them all in Cycles on
the CPU (one cell each, labelled with triangle counts) for review.

## Ship prep (2026-11-10): Godot 4.7.2, real ads and purchases, debug leftovers out

STUDIO.md shipping-list item 1 on this game. **Engine:** moved from 4.4.1 to
4.7.2 (`godot_version.txt`); nothing in the scripts, shaders, MultiMesh, fonts or
input needed changing, and the 3D renders the same (the same spawn, pine and oak
views measure the same mean luminance under both). **Money:** the AdMob +
RevenueCat stack from Melt a Glacier's publish branch behind the provider
interface (see "Money"), product ids `<bundle id>.<key>`, `store_config.gd`
placeholders, `tests/release_check.gd`, `tests/monetization_test.gd`. **Debug
leftovers (ART_REVIEW 4, item 8):** no "(test)" on prices outside playtest
builds; developer tools only with the `playtest` feature; floating numbers whole,
one per burst (paydays within about a patch, or close on screen, add up into one
number, and a number still rising takes the next payday), at most two new at a
time, and placed so their whole rise stays clear of every HUD piece; the letter
says "43 minutes by the fire" and "92% of the cursed forest is meadow now";
phone-size screenshots are taken in touch mode, and a smoke check reads every
visible HUD text in touch mode for "click" or "mouse".

**Results (Godot 4.7.2):** smoke test 104 checks pass (10 new); the ads and
purchases test passes (36 checks: consent first, a failed load retried, reward
timing, closing early, Remove Ads stops interstitials, purchase / cancel / error /
restore, local prices, restores don't flip settings, every request answered once
without plugins); the release check fails as it should, listing the five
placeholders; boosted passes (2:02 of play); keen passes and ends at 27:51 (28:04
of play: lighter 0:33, tiki torch 13:12, flamethrower 21:34, dragon breath 25:24,
meteor shower 27:13; inside the 24-30 minute band); chaos passes (4 game-minutes,
seeds 4242 and 77); screenshots render clean at 1280x720 (33) and 844x390 (32).
**Browser run:** the 4.7.2 web export (3.9 MB of game data) loads and starts at
844x390, 932x430 and 1024x768 with the touch controls, a tap reaches the game,
pretend ads are on, no console or page errors. (On this busy machine the tool's
3-minute screenshot timeout ran out again, so the same export was loaded with a
longer one.)
**iOS:** a local Linux export of the Xcode project succeeds: AdMob's app id, 50
SKAdNetwork ids, the tracking prompt's text and iOS 15.0 in the Info.plist,
RevenueCat and AdMob's libraries linked, game data 3.9 MB. Godot links AdMob's
Swift package (Google Mobile Ads, UMP) only when it exports on a Mac; its patch
was checked against the 4.7.2 project template here, and `tools/ios_build.sh`
fails early if it's missing. The iOS check build on GitHub's Mac runner is the
proof that it compiles and links.

**Bugs found and fixed in this block** (smoke or monetization checks where they can):

24. "(test)" on every price in screenshots and any non-playtest build.
25. Developer tools showed in editor runs and screenshots (any debug build).
26. Floating numbers: decimals ("+8.7"), one per patch piling up, sliding under the HUD.
27. The letter said "43s by the fire" and "0.22 acres".
28. Phone-size screenshots were taken in desktop mode ("Move the mouse", no touch controls).
29. Under 4.7.2 the parcel drawing logged "Invalid polygon data, triangulation
    failed" whenever a bowed face folded over (found by the chaos run): a face the
    engine can't fill is skipped.
30. RevenueCat's iOS frameworks (200 MB) were imported as resources and packed
    into the game data: `ios/` is ignored by Godot (`ios/.gdignore`, written by
    `tools/fetch_plugins.sh`) and excluded from every export.
31. A restore would have switched the phoenix flame back on after the player
    turned it off: non-consumables are granted once.

## QA (2026-11-09, after the review-3 polish pass; the art-pass-2 notes follow)

Run per STUDIO.md "Playtesting". Commands (headless unless noted; runs side by
side each need `-- save=<name> log=<path>` plus `--log-file <path>` before `-s`):

    godot --headless -s res://tests/smoke_test.gd                                   # 104 checks
    godot --headless -s res://tests/monetization_test.gd                            # real ad/store wiring, fake plugins
    godot --headless -s res://tests/release_check.gd -- iOS                         # fails while any store id is a placeholder
    godot --headless --fixed-fps 20 -s res://tests/playthrough.gd -- keen|casual|boosted [ads]
    godot --headless --fixed-fps 20 -s res://tests/chaos.gd -- 6 4242               # minutes, seed
    xvfb-run ... godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- DIR [size=844x390]
    xvfb-run ... godot --rendering-driver opengl3 -s res://tests/look.gd -- DIR [size=844x390] [hud] [close|ending|...]
    GODOT=<the 4.7.2 binary> python3 tools/browser_check.py games/burn-down-a-forest

`godot` here is Godot **4.7.2** (since 2026-11-10). Screenshots at a phone size
(`size=` under 600 px tall) are taken in touch mode, as a phone shows them.

**Polish pass results:** smoke test passes (94 checks, 17 new for this pass);
boosted passes (2:01 of play, 17 s real); keen passes and reaches the ending at
28:39 (28:52 of play: lighter 0:33, tiki torch 15:49, flamethrower 23:59,
dragon breath 26:24, meteor shower 28:01), inside the 24-30 minute band of the
last runs, so the pacing didn't drift (casual wasn't rerun: no balance number
changed). Screenshots were reviewed at 1280x720 and at 844x390; the forest
interior measures L* p25 16-19 / median 21-29 at 844x390 (was 5-6 / 7);
smallest HUD type 12 px at 844x390.

**Bugs found in this pass and fixed** (each has a smoke-test check where it can):

13. The keen bot stalled 18 m from the Elder Tree for minutes: from there the
    crosshair at its highest pitch landed on the mound at the Elder's foot,
    3.7 m off-centre, where even the meteor shower's heat never reached its
    ignite level (a player would have hit the same wall). A crosshair on the
    Elder's roots (within 6 m of it) now counts as on the Elder.
14. Locked price tags drew their pencil outline offset by half their size,
    sticking out past the page's edge.
15. Notebook chapters changed width with the size of their sketches: the right
    page has a fixed minimum width now.
16. Floating numbers landed on top of one another ("+8.?7.1"): a new one skips
    any spot within 70 px of a number still rising.
17. The see-through window cut away cottage walls standing beside the keeper
    (not in front), showing the inside of the house: props are only cut when
    they're 2.2 m nearer the camera than the keeper.
18. Old-style figures: "+11" read "+II" and "x1" read "XI" (Keeper Fell, `lnum`).
19. HUD second lines were ~7-9 px on an 844x390 phone (the phone UI scale).
20. A big fire drew 4-9 identical cards per burning cell (now under 2.3).
21. The mint hearts read as health pickups (seed pods now).
22. Every ash cell sparkled with orange dots (the creeping edge replaces it).
23. The stub ad's countdown wrote to a freed button when an ad was closed early
    and another opened within the second (found by the chaos run): the
    countdown now checks it's still its own ad.

**Chaos run:** 4 game-minutes each, seeds 4242 and 77, after the fix: passes, no
errors, no soft-lock, no broken UI state (the new notebook pages, tags and
tallies included).

**Browser run:** `tools/browser_check.py` exported the web build and loaded it
at 844x390; on this busy machine (other games' agents running) its 3-minute
screenshot timeout ran out at the larger sizes, so the same export was loaded
again with a longer timeout: it loads and starts at 844x390, 932x430 and
1024x768 with the phone UI scale and the thumb controls in place, a tap
reaches the game, and there are no console or page errors.

**The playthrough bot** plays a fresh save to the ending through the real
systems: it walks with the stick input, turns the camera until the crosshair
sits on something its tool can light (stepping closer when a tree is in the
way), holds the burn button, and shops by opening the notebook and pressing
the price tags. Like a person it takes a moment to settle on each new target
(keen 1 s, casual 2.2 s), and a casual player idles about 40% of the time and
shops every 25 s. It fails on: no ending in time, progress stalled, any tool /
upgrade / helper / golden critter never reached, the keeper leaving the world
or sinking under it, a save-and-reload mismatch (at 20/45/70% of the forest
and right after the flamethrower and the meteor shower, with big fires going),
a stub ad or purchase flow that doesn't finish, anything logged as an error.
Once the forest is nearly gone and its tool can light the Elder Tree it heads
there. Debug arguments: `debug` (a trace every 10 s), `from=<ring>`,
`embers=<n>`, `at=<x>,<z>`.

**Pacing after art pass 2** (game time; final balance; the polish pass's keen run is above):

| Milestone | keen | casual | boosted (x10 income, ads) |
|---|---|---|---|
| lighter | 0:33 | 0:53 | 0:07 |
| the thicket burned | 10:15 | 15:36 | - |
| tiki torch | 15:07 | 19:39 | 0:19 |
| ember salamander hired | 20:09 | 28:50 | 0:55 |
| flamethrower | 24:29 | 41:21 | 0:35 |
| oakwood / pinewood burned | 23:20 / 24:38 | 44:09 / 42:21 | - |
| dragon breath | 28:55 | 47:11 | 0:47 |
| the cursed grove burned | 29:39 | 49:01 | 1:38 |
| meteor shower | 29:50 | 49:41 | 0:51 |
| **the ending** | **30:10** (99% burned) | **50:01** (97%) | **1:47** (36%) |
| reloads / golden critters | 5 / 4 | 5 / 4 | 3 / 1 |
| real time (quiet machine) | 150 s | 141 s | 24 s |

Runs vary by a few minutes (keen 24-30, casual 50-61 over the last runs; the
casual bot finished at 60-61 before it was taught to try the first salamander).
No jackpots left: the biggest jump is the grove fire after the dragon breath
(about 100K in a minute, the finale). The keen run spent so much on upgrades
that the safety net offered it the dragon breath for 69K at 28:28; that is the
net doing its job, not a stall.

**Bugs found and fixed** (each has a smoke-test check now):

1. Jackpot cascades: a fire front lit the next tier of tree by itself, Dry Winds
   and spotting carried fire through every trail, and keen bought four tools in
   two minutes (the whole game took 3:14). Heat into tougher kinds is now damped
   (`TIER_UP`), spotting cut 5x, trails split the grove too, giants need the
   flamethrower.
2. Hotter Flame went to 20 levels (5.5x heat), letting the tiki torch light half
   the giants: now 5 levels of +10%.
3. Golden critters paid 1.5 minutes of income uncapped (300K+ during a grove
   fire, 1M once every tool was bought): capped at a quarter of the next tool,
   20K after the last.
4. Soft-lock: a player who spent on upgrades could be left with nothing their
   tool could light and the next tool out of reach, forever (the bot sat stuck
   for 8 minutes). The safety net now offers the next tool for what you have.
5. In thick woods the new camera tilt clamped the pitch so the crosshair never
   reached more than ~4 m: now an offset the player can drag against.
6. The Elder Tree's aim volume was one cell wide around a trunk three times
   wider: the crosshair slid past it and the off-centre heat never reached its
   ignite level, even with the meteor shower.
7. Two ads requested at once (a rewarded ad during an interstitial, or two
   placements): the second was dropped without an answer, freezing the keeper
   and blocking every later ad (found by the chaos run). Now refused with a
   failure callback.
8. `AdOffers.eligible("")` logged a script error every 20 s whenever nothing
   was worth offering (found by the boosted run's log check).
9. Boosts, cooldowns and interstitial spacing ran on the wall clock, so the
   developer time scale (and the bot) broke them: they run on a game clock now,
   which catches up with real time on load. The fire, keeper, critters and
   helpers also keep up at 5x-50x time.
10. Flames standing between the camera and the keeper could hide the hero (seen
    in the visual run): they shrink away inside the see-through circle.
11. The keeper faced the camera at spawn; the meadow mask was unset (meadow
    painted everywhere); the Free magic chapter widened the notebook and
    clipped its tabs; phone strings said click (all from the art pass review).
12. The dawn sweep at the ending showed the hill woods as flat pink lollipops in
    thick fog: the far oaks are carved cushions like the near ones now, and the
    dawn air clears to about half the night fog.

Test-side fixes along the way (no game change): the bot read the full tool
price instead of the tag's price, so it never took the safety net's offer;
it gave up walking to a far target after 9 s; the golden-critter count was
lost on each reload; the log check counted the audio driver's "no sound card"
error on this machine.

**Chaos run:** 6 game-minutes of random input, two seeds (every control, every
notebook chapter and entry, offers, finds, ads watched or closed early,
purchases, popups, touch/mouse switching, time scale 1-50x, background and
resume): passes, no errors, no soft-lock, no broken UI state.

**Visual run:** the boosted bot rendered every 10 game-seconds at 844x390,
932x430 (touch) and 1024x768 (tablet): HUD, notebook, coach notes, toasts,
boost tags and touch controls fit at every size with no overlap or clipped
text; the keeper stays framed through the biggest fires.

**Browser run:** `tools/browser_check.py` exports the web build and opens it in
headless Chromium as a touch phone: it loads and starts at 844x390, 932x430 and
1024x768, the touch stick, burn and jump buttons and the first coach note show,
a tap reaches the game, and there are no console or page errors. (The tablet
screenshot at 2x needs more than the tool's 3-minute screenshot timeout under
software GL on this machine, so that size was rerun with a longer timeout from
the same export; frame rate has to be checked on a real phone.)

## Money

Architecture as in the studio's reference game: the game only talks to the
`Monetization` autoload, which forwards to one `MonetizationProvider`
(`Monetization._create_provider()`):

| Build | Provider | Ads | Purchases |
|---|---|---|---|
| iOS release (what ships) | `MobileMonetizationProvider` | AdMob (`admob_ads.gd`): rewarded + interstitial, Google's consent form (UMP) first, the iPhone tracking prompt (when the IDFA message is on in AdMob), retry with back-off (4 s to 2 min) | RevenueCat (`revenuecat_store.gd`): purchase, restore, local prices from the store |
| playtest (web play links, iOS playtest flavor) | `StubMonetizationProvider` | pretend 3-second ads | pretend purchases, counted in the developer tools; prices say "(test)" |
| editor and tests (debug, no `playtest` feature) | `StubMonetizationProvider` | pretend | pretend, plain prices |
| a release desktop build | base `MonetizationProvider` | none | none |

Each half of the real provider switches itself off when its plugin or ids are
missing (ads report "not ready", so no offer tag shows; purchases fail politely).
Debug builds and builds with the `test_ads` feature only ever load Google's test
ad units. The stack (Poing Studios AdMob v5.1.0, GodotX RevenueCat 2.6.0) is
copied from Melt a Glacier's publish branch: the GDScript halves are in
`addons/`, the native iOS halves are fetched at build time by
`tools/fetch_plugins.sh` (pinned in `tools/plugin_versions.env`, never committed).
Both editor plugins are on in `project.godot`; on a headless import the AdMob
plugin downloads its small native libraries into `addons/admob/*/bin` by itself
(ignored by git) and re-saves `project.godot` (same content).

**Ids that ship in the app** (`scripts/monetization/store_config.gd`, every one a
clearly marked PLACEHOLDER until the owner provides it):
- `REVENUECAT_KEY_IOS`: RevenueCat's public App Store key (`appl_...`).
- `ADMOB_REWARDED["iOS"]`, `ADMOB_INTERSTITIAL["iOS"]`: one rewarded and one
  interstitial ad unit (`ca-app-pub-.../...`); every rewarded placement shares the
  one unit (`ADMOB_REWARDED_BY_PLACEMENT` can split them later, for reports only).
- The AdMob **app** id (`ca-app-pub-...~...`) goes in `project.godot` as
  `[admob]` `general/ios/app_id="..."`: the plugin writes it into the iOS
  Info.plist. Until then it is Google's sample app id (the plugin's default, so
  Godot doesn't write the line).
- `PRIVACY_POLICY_URL`: the privacy policy page (shown in Settings once set).

`tests/release_check.gd -- iOS` lists every placeholder still left (and checks the
product ids, the store listing and that the iOS preset has no `playtest`
feature). `tools/ios_build.sh` runs it on every iOS build: an unsigned check build
only prints the list; a TestFlight upload of the release flavor stops until it
passes. `tests/monetization_test.gd` drives the real AdMob and RevenueCat code
against fake plugin singletons (consent, loading, retry, reward timing, Remove
Ads, purchases, cancel, errors, restore, local prices, grant rules).

**How the owner switches real ads and purchases on** (the account steps are in
`store/README.md`, "Burn Down a Forest"):
1. Put the four ids above into `store_config.gd` and `project.godot` (or send
   them to Claude; none of them is secret).
2. Run the release check (`godot --headless -s res://tests/release_check.gd -- iOS`):
   it must say every store id is filled in.
3. GitHub > Actions > "iOS build" > Run workflow: `burn-down-a-forest`, mode
   `testflight`, flavor `release`. The playtest flavor keeps the pretend ads and
   the developer tools, for trying the game on a phone.

Settings shows "Ad privacy choices" when Google says the player must be able to
reopen the consent form (EEA/UK), and "Privacy policy" once its URL is set.
Restore Purchases (Shop chapter) reports what it found in a toast.

**Rewarded ad placements** (all share the one AdMob rewarded unit; the names are the game's own bookkeeping):

| Placement ID | Reward | Where |
|---|---|---|
| `boost_2x_fire` | 2x fire for 5 min (embers and tool/helper heat), stacks to 15 min | Notebook > Free Magic, offer tag |
| `helper_rush` | Helpers work 3x (and hurry) for 3 min | Notebook > Free Magic, offer tag |
| `instant_embers` | Free embers: 3 min of recent income, capped at 60% of the next tool, 4 min cooldown | Notebook > Free Magic, offer tag |
| `double_find` | Double a golden critter's embers | Tag for 9 s after a golden critter |

**Interstitial placement:** `notebook_close` (closing the notebook is the
natural break). Never in the first 5 min of play, at most every 4 min, never right
after a rewarded ad, never with Remove Ads.

**In-app purchase product ids** (each is `com.gamequarry.burndownaforest.` + the key;
ids can't repeat across the account's apps; `store/burn-down-a-forest/listing.json`
has the same list):

| Key (product id = bundle id + "." + key) | Type | Price | RevenueCat entitlement | What |
|---|---|---|---|---|
| `remove_ads_2x` | non-consumable | $4.99 | `remove_ads` | Remove Ads + permanent 2x (the anchor offer) |
| `starter_pack` | non-consumable (one time) | $1.99 | `starter_pack` | 2,500 embers + the rainbow sparkler (exclusive cosmetic matchstick). Offered once after 10 min of play as a parcel tied with twine, and in the shop |
| `phoenix_flame` | non-consumable | $2.99 | `phoenix_flame` | Premium cosmetic: golden phoenix fire on every tool, 10% hotter (toggle in the shop) |
| `embers_small` / `embers_medium` / `embers_large` | consumable | $0.99 / $2.99 / $9.99 | none | 35% / 100% / 400% of the next tool's cost (at least 500 / 2K / 10K). Shown in the Tools chapter when you're short for the next tool, and always in the Shop |
| Restore Purchases | | | | In the Shop chapter |

A restore (or RevenueCat's startup report) grants a non-consumable once and never
flips the player's own settings back (the phoenix toggle stays where they left it).

**Timed offer tag** (`scripts/ad_offers.gd`): a paper tag hanging on a string
under the notebook, swaying, naming exactly what the reward buys ("Free: [coal]
2.7K embers, enough for the tiki torch"), with a fuse burning down its time. Gentle rules: none in the first 2.5 min of play, one at a time, gone
after 40 s, the wait grows 1.5x each time one is ignored (200 s up to 8 min),
only offers worth having right now (free embers only when they're at least a
minute of income; 2x only when not running; helper rush only with helpers),
never one whose ad isn't loaded, and the clock only runs while you're playing.
Free embers that would buy the next tool are offered first.

Guardrails: the game is finishable without paying; Remove Ads and boosts speed it up.

## What's done

- **Art pass 1** (from `ART_REVIEW.md`, all 12 items done, the 3 strengths kept):
  art bible; IM Fell English SC, Alegreya Sans and Caveat Brush in, Outfit and
  the emoji font out; a drawn SVG icon set; the HUD as charred planks, paper
  toasts and tags; the notebook as a real notebook; log-slice phone controls;
  phone-first hints with a drawn finger; sentence-case copy; every model rebuilt
  in Blender (trees in three sizes, landmarks, giants, the Elder Tree, the
  village, the keeper, tools, helpers, critters, meadow flowers); cel flames;
  the round see-through window; a composed spawn with a path; the meadow in
  drifts; night lighting with a value structure. Smoke test passes.

- Fire simulation with wind, dampness, spotting, trails, rings; burn -> ash -> meadow.
- Chunked MultiMesh forest (about 6,000 plant instances in 25 chunks per kind),
  burn animation driven per instance in the shader (the CPU only touches a plant
  when its state changes), flame and smoke billboards rebuilt per tick, meadow
  flowers appended as cells bloom, ground colour from a per-cell texture.
- Third-person keeper with walk animation, tool models, aiming ring, see-through trees.
- 6 tools with their own effects, 5 upgrades, 2 helpers, critters, golden critters.
- HUD: embers (rolling counter, the coal swells on paydays, eased) and income per
  second, wind disc, ring name + a burning-fuse progress bar, notebook plank,
  boost tags, offer tag, target info above the crosshair ("Too tough for the
  lighter. Try the tiki torch"), tool and heat, taped toasts, floating "+embers"
  over the biggest fires, first-run hints (7 steps, about six words each, beside
  their control, with a drawn finger on phones), rotate-to-landscape overlay, the
  ending as a ruled letter with stats.
- Money: all of the above; real AdMob + RevenueCat in iOS release builds (ids
  still placeholders, see "Money"), pretend in playtest builds.
- Save: `user://forest_save.json` (every cell's state in one string), autosave every
  10 s, on app pause / focus out / close, and when the browser tab is hidden.
- Sound: 28 effects and loops synthesised by `tools/make_audio.py` (fire crackle
  and roar that follow how much is burning near the camera, a loop per tool,
  catching trees, embers ticking in, pages, buying, rewards, footsteps, critters,
  blooming flowers, a night-forest ambience). Volume and mute in Settings.
- Phone performance: Compatibility renderer, MultiMesh everywhere (plants in
  20-cell chunks per kind and size; flowers per species in 32-cell chunks that
  grow as cells bloom), no shadows, no bloom, no omni lights on touch devices,
  grass/bush/flower chunks hidden past 55-62 m, 3D render scale fitted to the
  screen (`World._fit_render_scale()`, 1 MP budget on touch screens) and turned
  down further when the frame rate drops. `tests/draw_calls.gd` (real renderer):
  spawn 212 draw calls (3D 134, HUD 78), Pinewood 180, over the forest 187, the
  grove 168; 120-180K triangles in view. HUD pieces batch their lines and shading
  (multiline and triangle-array calls) to keep that low.
  `tests/perf_bench.gd`: at ~580 burning cells the fire costs ~1 ms per tick plus
  ~1 ms to rebuild the flames, 10 times a second, on desktop.
- Tests: `tests/smoke_test.gd` (94 checks, passes; includes a regression check
  for every bug the QA runs found), `tests/playthrough.gd` (the playthrough bot,
  keen / casual / boosted, plus the visual run), `tests/chaos.gd` (random input),
  `tests/screenshots.gd` (30 shots incl. the establishing shot, the phone layout,
  every notebook chapter, the keeper close up and the dawn ending),
  `tests/look.gd` (a few 3D views fast, for art tuning), `tests/fire_bench.gd`,
  `tests/perf_bench.gd`, `tests/draw_calls.gd`.
- Developer tools (Settings, only with the `playtest` export feature: the web play
  links and the iOS playtest flavor; not in editor runs or screenshots, never in a
  release build): time 1x/5x/10x/50x, income x1/x10/x100, free embers, unlock
  everything, skip to a ring, fire speed, fake ad/purchase counts, start over,
  reset the save.

## Next steps toward the polish bar (STUDIO.md)

0. **Fourth fresh-eyes art review** of the polish pass (review 3 is all done,
   see ART_REVIEW.md): the screenshots from `tests/screenshots.gd` at 1280x720
   and at `size=844x390`, and the model contact sheet; "ready to play" needs a
   "yes". Then the casual pacing run once more.

1. Real-phone playtest of the new lighting (moon shadows cost a depth pass; the
   distance is 32 m on touch screens) and of the camera's tilt in the woods.
2. **Music**: two or three generated tunes for the forest plus one for the meadow
   after the curse lifts, with a music volume slider (effects are done).
3. **Juice on the fire**: ember sparks flying from spotting (the sim already
   reports them in `take_spots()`), embers flying to the HUD counter on paydays,
   a bigger reveal when a whole patch goes up, tree-collapse puffs, the Elder
   Tree's own finale (and the villagers coming out).
4. **More progression**: a third helper (a baby phoenix that drops fire from the
   air), "finds" in the forest (things the curse swallowed: lost toys, a village
   bell, the mayor's hat) that pop out as patches burn, Dragon Breath / Meteor
   Shower tuning, a stats screen at the end, then "Where to next?".
5. **Money tuning**: interstitial cadence and offer timing once the pacing bot
   exists; consider a second tag type at "moments of desire" (just short of a tool).
6. Icon is in (`icon.svg`); still need a splash screen and store name check.
7. Playtest on real phones: camera distance/pitch, see-through radius, stick
   sensitivity, fire button size.

## Known bugs and limitations

- Walking ignores trees (you pass through them). Intended for now, it's much
  nicer on a phone, but trunks might deserve a soft push later.
- Moon shadows: the plant shader's see-through window also runs in the shadow
  pass, so trees cut away round the keeper cast no shadow on them (it reads as
  moonlight on the hero; left as is).
- On a headless import the AdMob editor plugin downloads its native libraries
  into `addons/admob/*/bin` (about 3.5 MB, ignored by git) and re-saves
  `project.godot` with the same content; settings equal to Godot's defaults
  (and the AdMob app id while it's Google's sample id) are not written there.
- Godot only links AdMob's Swift package into the Xcode project when it exports
  on a Mac (its end-of-export hook runs on macOS alone); a Linux export writes the
  package but leaves it unlinked. `tools/ios_build.sh` checks it's linked.
- The headless (dummy) renderer can't read MultiMesh buffers back, so
  `ForestView._grow` skips copying there; real renderers keep every flower.
- MultiMesh custom data is stored as half floats by the Compatibility renderer,
  so the plant animation clock steps back every 5 min (`ForestView._rebase`).
  If burning trees ever "jump" in their burn animation, look there.
- Without per-instance colours the Compatibility renderer multiplies vertex
  colours by zero, so every plant MultiMesh sets `use_colors` and white colours.
- Headless test runs print "ObjectDB instances leaked / resources still in use"
  at exit (dummy audio driver teardown); not seen in normal play.
- Shader colour uniforms are set from code with `Color("#hex")` (sRGB, converted);
  defaults written in a shader are taken as linear, so don't rely on them.
- Tests that run side by side must each pass `-- save=<name>` (and
  `--log-file <path>`), or they overwrite one another's save and log.

## Balance notes

- What the forest holds raw (seed 20261109): Thicket 5.7K (2.6K cells), Pinewood
  19K (1.1K), Oakwood 46K (600), Cursed Grove 156K (300, 150K of it in 187
  giants), Elder Tree 50K. Ember Value and the boosts multiply all of it. The
  forest is finite, so tool prices are set against what the ring before pays:
  each needs roughly 70-90% of it (with some upgrades bought on the way).
- Spread knobs: `PLANTS[].heat` (spread within a kind: grass and bushes sweep a
  patch, trees about 0.25-0.35 of their own ignite so fronts die out in places),
  `ignite` (the tier gap), `TIER_UP` / `TIER_UP2` (heat into tougher kinds),
  `spot` (jumping trails; cut 5x in the QA pass), `SPREAD`, `DIAGONAL`, `COOL`,
  `PATCH`. Trails now split every ring, the grove too.
- `tests/fire_bench.gd` lights single cells in each ring for spread tuning;
  `tests/playthrough.gd` is the real pacing check (see "QA").

## Files

```
project.godot / export_presets.cfg (preset "Web", playtest)   default_bus_layout.tres (SFX, Fire)
godot_version.txt           the engine version (4.7.2); CI and the iOS pipeline read it
addons/admob/               Poing Studios AdMob plugin v5.1.0, GDScript half (MIT); native halves fetched at build time
addons/godotx_revenue_cat/  GodotX RevenueCat plugin 2.6.0, GDScript half (MIT); iOS frameworks fetched at build time
scenes/main.tscn            the only scene; everything is built in code
scripts/balance.gd          every number
scripts/forest_grid.gd      the forest as data, the fire simulation, the ground's heights, saving
scripts/forest_view.gd      drawing the forest (chunked MultiMeshes, flames, smoke, flowers, ground texture, village)
scripts/models.gd           loads the Blender models (models/*.glb) and hands out meshes by name, size variants
scripts/keeper.gd           the fire-keeper, chase camera, aiming, tool heat
scripts/tool_fx.gd          each tool's particles
scripts/helpers.gd          fire sprites and salamanders
scripts/critters.gd         critters running from the fire, golden ones
scripts/world.gd            builds it all, controls, wind, embers, floating numbers, hints, starter offer, ending
scripts/hud.gd              HUD, offer tag, golden-critter tag, toasts, first-run hints, popups (parcel, ending)
scripts/notebook.gd         the shop: the fire-keeper's notebook
scripts/touch_controls.gd   phone controls (log-slice buttons)
scripts/ui_theme.gd         palette, type, icons, drawn StyleBoxes (planks, paper, tags)
scripts/ui_parts.gd         drawn controls: ink stamp, index tab, ribbon, fuse, wind disc, parcel, hint finger
scripts/game_state.gd       autoload: economy, purchases' effects, save/load
scripts/ad_offers.gd        when the timed offer tag shows and what it offers
scripts/monetization/       monetization.gd (autoload facade, product and placement ids), monetization_provider.gd
                            (interface), stub_provider.gd (pretend), mobile_provider.gd (real: admob_ads.gd +
                            revenuecat_store.gd), store_config.gd (the ids that ship, placeholders for now)
scripts/audio/sound.gd      autoload: effects, fire loops, ambience, volume
shaders/                    plant (baked colours, ink edge, creeping char and cracks, moon rim, fire and lantern
                            light, see-through window), flame (flipbook), smoke (puffs), ground (meadow mask,
                            fire light, lantern pool), water, prop (village, keeper, creatures), outline (the
                            keeper's ink line), pencil (notebook entries out of reach)
models/                     Blender exports: forest, meadow, village, keeper, tools, creatures (.glb)
art/blender/                the model scripts (forest_lib.py helpers; trees, meadow, village, characters)
                            and contact_sheet.py; rebuild a file: python3 art/blender/trees.py
art/icons/make_icons.py     draws ui/icons/*.svg (incl. the match cursors)
art/fx/make_fx.py           draws fx/flames.png and fx/puffs.png
art/fonts/make_keeper_fell.py  builds fonts/KeeperFell-Regular.ttf (sources and their OFL licences beside it)
ui/icons/                   the icon set (SVG)
audio/                      generated by tools/make_audio.py
fonts/                      Keeper Fell (IM Fell English SC + Libre Caslon figures), Alegreya Sans, Caveat Brush (all OFL, licences beside them)
tools/make_audio.py         rebuilds audio/ (numpy, scipy, ffmpeg)
tests/                      smoke_test, monetization_test, release_check, playthrough (the bot, and the visual
                            run), chaos, screenshots, look, fire_bench, perf_bench, draw_calls
fx/                         the fire flipbook and smoke puffs (drawn by art/fx/make_fx.py)
```

Run: `godot --headless --import`, then `godot --headless -s res://tests/smoke_test.gd`;
screenshots: `xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/forest-shots`.
Models: `python3 art/blender/<trees|meadow|village|characters>.py` (Blender 5.2 as
the `bpy` module) writes `models/*.glb`; then `godot --headless --import`.
