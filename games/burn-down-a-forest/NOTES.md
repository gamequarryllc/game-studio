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
the meadow sits mid-light, fire and the mint hearts are the only near-white
values. Ambient light warms from cold plum to warm grey as the meadow spreads.

**Type** (all SIL OFL, licences in `fonts/`): IM Fell English SC for titles,
names and prices; Alegreya Sans for body text, with lining tabular figures
(Alegreya Sans Bold, `lnum`+`tnum`) for the HUD counter because IM Fell only has
old-style figures and "1.00M" read as "I.ooM"; Caveat Brush for the keeper's
handwriting, never below 22 px. Scale (px at 1280x720): 16 / 19 / 22 / 28 / 36 / 48.

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

**Lighting:** cool moonlight `#C4D2F2` from the upper left as seen from the
village (west-north-west, high); plum ambient that warms as the meadow grows;
real omni light on the fire on desktop (phones skip it: the flames and the
burning trees light themselves); a cool rim light on the keeper in its shader.
Linear tonemapping and no bloom, so colours land where the palette puts them.

**Models:** all built in Blender from scripts in `art/blender/` (see "Models"
below), detail baked into vertex colours (ray-cast AO, a vertical gradient,
carved highlights on rims and tips). Contact sheet:
`python3 art/blender/contact_sheet.py OUT.png`.

---

## The game

A cursed forest grew over the valley overnight and swallowed the village. You are
the village fire-keeper: burn the cursed forest back, ring by ring, and where it
burns, ash turns into a meadow of flowers. At the heart stands the Elder Tree;
burning it lifts the curse and frees the village. Cartoonish and magical: violet
and teal cursed trees, warm hand-drawn fire, critters that always scamper out unharmed.

Godot 4.4, Compatibility renderer, landscape 1280x720 (stretch: canvas_items / expand).
Bundle ID (when it ships): `com.gamequarry.burndownaforest`.

## Status: first playable, art pass 1 done (awaiting the second review)

Loads, phone and desktop controls work, the fire spreads by itself in chain
reactions, embers come in, 6 tools (4 reachable in a normal run so far), 5
upgrades, 2 helpers, a working shop (the notebook), the 2x rewarded boost and
the other rewarded ads, Remove Ads + permanent 2x, the timed offer tag, the
starter pack, the Phoenix Flame cosmetic, ember packs and restore (all stubbed),
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
elevated over-the-shoulder chase camera 11 m behind the fire-keeper (a madder-red
robe, a tall flopping hood, a brass lantern on the back), orbiting a point a
little above and to the right of them so the crosshair and its ring never sit on
the keeper. The tool heats where the screen's centre lands (the crosshair, and
an inked dashed ring on the ground), out to the tool's range; aim further and it
lands at the edge of the range. Trees between the camera and the keeper, near
the camera, or right over the keeper's head are cut away in a round window with
an inked rim (plant shader; no dither, no transparency), and the aim ray starts
just beyond the keeper so it never picks a tree that's been cut away.

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
  torch (150, 4.5K), Flamethrower (520, 30K), Dragon breath (1800, 200K), Meteor
  shower (6000, 1.5M). Each has its own effect (`scripts/tool_fx.gd`): a flick of
  sparks, a thin jet, lobbed fireballs, a billowing cone, a purple dragon jet,
  shooting stars from the sky.
- Upgrades: Hotter flame (+25% heat), Dry winds (+6% spread, embers jump
  further), Ember value (+15% embers), Wide flame (+12% flame size), Swift boots.
- Helpers (`scripts/helpers.gd`): fire sprites (round flame spirits with faces,
  light grass and bushes) and ember salamanders (ember lizards with a flame ridge,
  light pines and oaks). Each picks something it can light near the keeper, goes there and holds
  its heat on it. Past 12 of a kind the visible ones just burn hotter.
- Critters (`scripts/critters.gd`): a rabbit, a fox and a hedgehog (Blender
  models) bolt out of 7% of trees as they catch, bound away from the fire and
  pop out of sight with a drawn heart. 4% of them are golden and
  drop a bonus (1.5 minutes of income) that a rewarded ad can double.

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
| `forest.glb` (trees.py) | pine_s 265, pine_m 405, pine_l 533 (crooked trunk, drooping star tiers, hooked tip, knothole eye with a mint pupil on the big one); oak_s 384, oak_m 529, oak_l 545 (forked crooked trunk, scalloped canopy with hanging points, knothole eyes); giant_a/b 1335 (buttress roots, clawed branches, a cursed heart with the only sparkles, mint eyes); elder 2156 (huge gnarled trunk, roots, a face of mint knot eyes, the cursed heart); grass 36, bush 140, boulder 120, far_pine 72, far_oak 52 |
| `meadow.glb` (meadow.py) | poppy 52, oxeye_daisy 80, buttercup 96, harebell 162, sage_tuft 28 |
| `village.glb` (village.py) | cottage_a/b/c 2.5-2.8K (rounded walls, loaf thatch, round lit windows, roots over the roof), well, lantern_post, signpost, woodpile, fence, ground_roots, root_arch |
| `keeper.glb`, `tools.glb`, `creatures.glb` (characters.py) | the keeper in six parts (body, head, tall hood, hand, foot, lantern); matchstick, rainbow sparkler, lighter, tiki torch, flamethrower, dragon puppet, meteor staff; fire sprite, salamander (+ leg), rabbit, fox, hedgehog |

`art/blender/contact_sheet.py OUT.png [files...]` renders them all in Cycles on
the CPU (one cell each, labelled with triangle counts) for review.

## Money

Architecture as in the studio's reference game: the game only talks to the
`Monetization` autoload, which forwards to one `MonetizationProvider`; right now
the `StubMonetizationProvider` (fake 3-second ads, purchases succeed, everything
counted in the developer menu). To go live, write an AdMob + RevenueCat (or store
plugin) provider and return it from `Monetization._create_provider()`.

**Rewarded ad placements** (create these as AdMob rewarded units):

| Placement ID | Reward | Where |
|---|---|---|
| `boost_2x_fire` | 2x fire for 5 min (embers and tool/helper heat), stacks to 15 min | Notebook > Free Magic, offer tag |
| `helper_rush` | Helpers work 3x (and hurry) for 3 min | Notebook > Free Magic, offer tag |
| `instant_embers` | Free embers: 3 min of recent income, capped at 60% of the next tool, 4 min cooldown | Notebook > Free Magic, offer tag |
| `double_find` | Double a golden critter's embers | Tag for 9 s after a golden critter |

**Interstitial placement:** `notebook_close` (closing the notebook is the
natural break). Never in the first 5 min of play, at most every 4 min, never right
after a rewarded ad, never with Remove Ads.

**In-app purchase product IDs:**

| Product ID | Type | Price | What |
|---|---|---|---|
| `remove_ads_2x` | non-consumable | $4.99 | Remove Ads + permanent 2x (the anchor offer) |
| `starter_pack` | non-consumable (one time) | $1.99 | 2,500 embers + the rainbow sparkler (exclusive cosmetic matchstick). Offered once after 10 min of play as a parcel tied with twine, and in the shop |
| `phoenix_flame` | non-consumable | $2.99 | Premium cosmetic: golden phoenix fire on every tool, 10% hotter (toggle in the shop) |
| `embers_small` / `embers_medium` / `embers_large` | consumable | $0.99 / $2.99 / $9.99 | 35% / 100% / 400% of the next tool's cost (at least 500 / 2K / 10K). Shown in the Tools chapter when you're short for the next tool, and always in the Shop |
| Restore Purchases | | | In the Shop chapter |

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
- Money: all of the above, stubbed.
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
- Tests: `tests/smoke_test.gd` (passes), `tests/screenshots.gd` (27 shots incl.
  the phone layout, every notebook chapter, the village path, the Elder Tree,
  the meadow, the ending), `tests/fire_bench.gd` (spread tuning), `tests/perf_bench.gd`,
  `tests/draw_calls.gd`.

## Next steps toward the polish bar (STUDIO.md)

0. **Second fresh-eyes art review** of the new screenshots and the contact sheet
   (STUDIO.md process step 2), then fix what it finds.

1. **Pacing bot** (`tests/pacing.gd`): a bot that walks to patches, lights them,
   buys in order, with and without ads; tune for a keen run ~30 min and casual ~60.
   The balance is first-pass (see below).
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

- In very dense woods the canopy can still hide the fire you're lighting from
  some camera angles; tilting the camera down (or the see-through) fixes it.
  Worth a smarter camera (pull up when occluded) after playtesting.
- Walking ignores trees (you pass through them). Intended for now, it's much
  nicer on a phone, but trunks might deserve a soft push later.
- The giant canopies are big; from low camera angles the Oakwood/Grove is a sea
  of violet blobs. Fine from the default angle.
- The headless editor import prints `Parameter "t" is null` once per .glb (Godot
  4.4.1 does it for a one-cube .glb in an empty project too); harmless, and not
  seen at runtime.
- The headless (dummy) renderer can't read MultiMesh buffers back, so
  `ForestView._grow` skips copying there; real renderers keep every flower.
- MultiMesh custom data is stored as half floats by the Compatibility renderer,
  so the plant animation clock steps back every 5 min (`ForestView._rebase`).
  If burning trees ever "jump" in their burn animation, look there.
- Without per-instance colours the Compatibility renderer multiplies vertex
  colours by zero, so every plant MultiMesh sets `use_colors` and white colours.
- Headless test runs print "ObjectDB instances leaked / resources still in use"
  at exit (dummy audio driver teardown); not seen in normal play.
- Wind direction changes are shown on the HUD but not announced.

## Balance notes

- What the forest holds (seed 20261109): Thicket 2.7K burnable cells / ~5.8K
  embers, Pinewood 1.1K / ~19K, Oakwood 600 / ~47K, Cursed Grove 300 / ~206K,
  Elder Tree 50K. Ember Value and the boosts multiply all of it.
- Tool costs follow that: the Lighter (250) after the first patch or two, the Tiki
  Torch (4.5K) partway through the Pinewood, the Flamethrower (30K) in the Oakwood.
  Dragon Breath (200K) needs most of the Grove or Ember Value upgrades; the Elder
  Tree is also reachable with the Flamethrower + ~8 levels of Hotter Flame, or by
  burning the whole ring of giants around it with Dry Winds up.
- `tests/fire_bench.gd` lights single cells in each ring: with no Dry Winds one
  ignition burns ~0-330 cells (a patch), at Dry Winds 5 (x1.3) a few hundred to a
  whole ring, at max (x1.6) usually much of a ring and sometimes a jackpot that
  cascades inward. That jackpot is fun but can skip a tool; watch it in the pacing bot.
- Spread knobs: `PLANTS[].heat` (spread within a kind), `ignite` (the tier gap),
  `spot` (jumping trails), `SPREAD`, `DIAGONAL`, `COOL`, `PATCH` (patch size).

## Files

```
project.godot / export_presets.cfg (preset "Web", playtest)   default_bus_layout.tres (SFX, Fire)
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
scripts/monetization/       provider interface, stub, autoload facade (product and placement IDs)
scripts/audio/sound.gd      autoload: effects, fire loops, ambience, volume
shaders/                    plant (baked colours, ink edge, burn, round see-through window), flame (cel),
                            smoke, ground (organic edges, cobbled square), water, prop (village, keeper, creatures)
models/                     Blender exports: forest, meadow, village, keeper, tools, creatures (.glb)
art/blender/                the model scripts (forest_lib.py helpers; trees, meadow, village, characters)
                            and contact_sheet.py; rebuild a file: python3 art/blender/trees.py
art/icons/make_icons.py     draws ui/icons/*.svg
ui/icons/                   the icon set (SVG)
audio/                      generated by tools/make_audio.py
fonts/                      IM Fell English SC, Alegreya Sans, Caveat Brush (all OFL, licences beside them)
tools/make_audio.py         rebuilds audio/ (numpy, scipy, ffmpeg)
tests/                      smoke_test, screenshots, fire_bench, perf_bench, draw_calls
```

Run: `godot --headless --import`, then `godot --headless -s res://tests/smoke_test.gd`;
screenshots: `xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/forest-shots`.
Models: `python3 art/blender/<trees|meadow|village|characters>.py` (Blender 5.2 as
the `bpy` module) writes `models/*.glb`; then `godot --headless --import`.
