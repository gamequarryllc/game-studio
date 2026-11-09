# Burn Down a Forest

A cursed forest grew over the valley overnight and swallowed the village. You are
the village fire-keeper: burn the cursed forest back, ring by ring, and where it
burns, ash turns into a meadow of flowers. At the heart stands the Elder Tree;
burning it lifts the curse and frees the village. Cartoonish and magical: violet
and teal cursed trees, warm orange fire, critters that always scamper out unharmed.

Godot 4.4, Compatibility renderer, landscape 1280x720 (stretch: canvas_items / expand).
Bundle ID (when it ships): `com.gamequarry.burndownaforest`.

## Status: first playable

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
elevated third-person chase camera 10 m behind a small hooded fire-keeper with a
lantern on their back. The tool heats where the screen's centre lands (the
crosshair, and a glowing ring on the ground), out to the tool's range; aim
further and it lands at the edge of the range. Trees between the camera and the
keeper, near the camera, or right over the keeper's head dissolve (dithered in
the plant shader) so you can always see yourself and the fire.

| Phone | Desktop |
|---|---|
| Left thumb: floating stick to walk | WASD / arrows |
| Right side: drag to orbit the camera | Click, then move the mouse |
| Hold the big 🔥 button to burn (drag from it to aim) | Hold left click |
| JUMP button | Space |
| 📓 Notebook button (top right) | N or Tab |
| Tap the offer tag | B (G doubles a golden critter) |
| | M mute, Esc frees the mouse |

**Progression** (all numbers in `scripts/balance.gd`):
- Tools, bought in order: Matchstick (heat 8), Lighter (40, 250 embers), Tiki
  Torch (150, 4.5K), Flamethrower (520, 30K), Dragon Breath (1800, 200K), Meteor
  Shower (6000, 1.5M). Each has its own effect (`scripts/tool_fx.gd`): a flick of
  sparks, a thin jet, lobbed fireballs, a billowing cone, a purple dragon jet,
  shooting stars from the sky.
- Upgrades: Hotter Flame (+25% heat), Dry Winds (+6% spread, embers jump
  further), Ember Value (+15% embers), Wide Flame (+12% flame size), Swift Boots.
- Helpers (`scripts/helpers.gd`): Fire Sprites (floating sparks with eyes, light
  grass and bushes) and Ember Salamanders (glowing lizards, light pines and
  oaks). Each picks something it can light near the keeper, goes there and holds
  its heat on it. Past 12 of a kind the visible ones just burn hotter.
- Critters (`scripts/critters.gd`) bolt out of 7% of trees as they catch, hop
  away from the fire and pop out of sight with a heart. 4% of them are golden and
  drop a bonus (1.5 minutes of income) that a rewarded ad can double.

**Art direction.** Faceted low-poly models built in code (`scripts/models.gd`),
cursed foliage in violet to teal with little glowing cyan "lanterns", a dusk
sky in violet and pink, violet fog; fire is warm orange billboards
(`shaders/flame.gdshader`) that pop against the cool forest. The meadow is
bright green with flowers in six colours. Fonts: Outfit (HUD) and Nothing You
Could Do (the keeper's handwriting in the notebook), both OFL.

**HUD and shop theme: charcoal and ember.** Dark rounded panels with a warm
orange rim glow, ember-orange buttons with a darker lip. The shop is **the
fire-keeper's notebook**: a full-screen two-page spread (contents on the left,
the chapter's entries on the right, handwritten headings), opened from the HUD
anywhere. Chapters: Tools, Upgrades, Helpers, Free Magic (rewarded ads), Shop
(purchases), Settings (+ developer tools in playtest builds).

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
| `starter_pack` | non-consumable (one time) | $1.99 | 2,500 embers + the Rainbow Sparkler (exclusive cosmetic matchstick). Offered once in a popup after 10 min of play, and in the shop |
| `phoenix_flame` | non-consumable | $2.99 | Premium cosmetic: golden phoenix fire on every tool, +10% heat (toggle in the shop) |
| `embers_small` / `embers_medium` / `embers_large` | consumable | $0.99 / $2.99 / $9.99 | 35% / 100% / 400% of the next tool's cost (at least 500 / 2K / 10K). Shown in the Tools chapter when you're short for the next tool, and always in the Shop |
| Restore Purchases | | | In the Shop chapter |

**Timed offer tag** (`scripts/ad_offers.gd`): hangs under the notebook button and
names exactly what the reward buys ("FREE: +🔥 2.7K embers, enough for the Tiki
Torch!"). Gentle rules: none in the first 2.5 min of play, one at a time, gone
after 40 s, the wait grows 1.5x each time one is ignored (200 s up to 8 min),
only offers worth having right now (free embers only when they're at least a
minute of income; 2x only when not running; helper rush only with helpers),
never one whose ad isn't loaded, and the clock only runs while you're playing.
Free embers that would buy the next tool are offered first.

Guardrails: the game is finishable without paying; Remove Ads and boosts speed it up.

## What's done (this block)

- Fire simulation with wind, dampness, spotting, trails, rings; burn -> ash -> meadow.
- Chunked MultiMesh forest (about 6,000 plant instances in 25 chunks per kind),
  burn animation driven per instance in the shader (the CPU only touches a plant
  when its state changes), flame and smoke billboards rebuilt per tick, meadow
  flowers appended as cells bloom, ground colour from a per-cell texture.
- Third-person keeper with walk animation, tool models, aiming ring, see-through trees.
- 6 tools with their own effects, 5 upgrades, 2 helpers, critters, golden critters.
- HUD: embers (rolling counter that swells on paydays) and income per second, wind,
  ring + progress bar, notebook button, boost timers, offer tag, target info
  ("Too tough for your Lighter: try the Tiki Torch"), tool and heat, toasts,
  floating "+embers" over the biggest fires, first-run hints (6 steps), rotate-to-
  landscape overlay, the ending with stats.
- Money: all of the above, stubbed.
- Save: `user://forest_save.json` (every cell's state in one string), autosave every
  10 s, on app pause / focus out / close, and when the browser tab is hidden.
- Sound: 28 effects and loops synthesised by `tools/make_audio.py` (fire crackle
  and roar that follow how much is burning near the camera, a loop per tool,
  catching trees, embers ticking in, pages, buying, rewards, footsteps, critters,
  blooming flowers, a night-forest ambience). Volume and mute in Settings.
- Phone performance: Compatibility renderer, MultiMesh everywhere, no shadows,
  no omni lights on touch devices, grass/bush/flower chunks hidden past 55-60 m,
  3D render scale fitted to the screen (`World._fit_render_scale()`, 1 MP budget on
  touch screens) and turned down further when the frame rate drops.
  `tests/perf_bench.gd`: at ~580 burning cells the fire costs ~1 ms per tick plus
  ~1 ms to rebuild the flames, 10 times a second, on desktop.
- Tests: `tests/smoke_test.gd` (passes), `tests/screenshots.gd`, `tests/fire_bench.gd`
  (spread tuning), `tests/perf_bench.gd`.

## Next steps toward the polish bar (STUDIO.md)

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
scripts/models.gd           all low-poly models, built in code
scripts/keeper.gd           the fire-keeper, chase camera, aiming, tool heat
scripts/tool_fx.gd          each tool's particles
scripts/helpers.gd          fire sprites and salamanders
scripts/critters.gd         critters running from the fire, golden ones
scripts/world.gd            builds it all, controls, wind, embers, floating numbers, hints, starter offer, ending
scripts/hud.gd              HUD, offer tag, golden-critter tag, toasts, popups
scripts/notebook.gd         the shop: the fire-keeper's notebook
scripts/touch_controls.gd   phone controls
scripts/ui_theme.gd         charcoal-and-ember look, fonts
scripts/game_state.gd       autoload: economy, purchases' effects, save/load
scripts/ad_offers.gd        when the timed offer tag shows and what it offers
scripts/monetization/       provider interface, stub, autoload facade (product and placement IDs)
scripts/audio/sound.gd      autoload: effects, fire loops, ambience, volume
shaders/                    plant (burn, see-through), flame, smoke, ground, water
audio/                      generated by tools/make_audio.py
fonts/                      Outfit, Nothing You Could Do (OFL), Noto Color Emoji subset (OFL/Apache)
tools/make_audio.py         rebuilds audio/ (numpy, scipy, ffmpeg)
tools/subset_emoji.sh       rebuilds the emoji subset (run after adding an emoji to the code)
tests/                      smoke_test, screenshots, fire_bench, perf_bench
```

Run: `godot --headless --import`, then `godot --headless -s res://tests/smoke_test.gd`;
screenshots: `xvfb-run -a -s "-screen 0 1600x900x24" godot --rendering-driver opengl3 -s res://tests/screenshots.gd -- /tmp/forest-shots`.
