# Art review 1: fresh-eyes critic, 2026-11-09 (first-playable build)

Reviewed all 19 screenshots from `tests/screenshots.gd` against the studio's "Look and feel" standard. The next art pass works from this list. Mark each item done here when fixed, then get a second review.

## Problems, worst first

1. **Emoji are the icon set** (HUD, notebook, offer tag, popup). 🔥 is the currency, four tool icons and every label's bullet; ⬆️ ↔️ 💎 📺 ⚙️ are stock glyphs. Fix: one SVG icon set (2px ink line, two flat fills, a slight wobble). Draw each tool as the real object; embers as a cracked, glowing coal.
   - **Done.** 41 SVG icons drawn by `art/icons/make_icons.py` (2px ink line, two fills, seeded wobble) in `ui/icons/`; the coal is the currency, every tool is the real object; critters are Blender models now; the emoji font and its tool are gone and no emoji is left in code or UI text.
2. **One template panel everywhere**: dark-brown rounded rectangle, one corner radius, thin orange stroke, soft orange glow, glowing orange pill buttons. Fix: no glows at all. HUD pieces as charred planks with uneven cut ends and a hard 2px offset ink shadow.
   - **Done.** HUD pieces are drawn charred planks (`UiTheme.PlankBox`: saw-cut ragged ends, grain, fire-darkened ends, hard 3-4px ink shadow), transient things are paper and tags; no glow in the UI or the 3D view (bloom off).
3. **The "notebook" is a dark settings page** (sidebar nav, list rows, a Close button). Fix: cream paper #EFE3C8 with grain and ruled lines, scorched edges, a stitched spine, coloured index tabs. Each item gets a sketch and a price on a taped tag. Buy with an ink stamp; close with a ribbon.
   - **Done.** Leather cover, two #EFE3C8 pages with grain, ruled lines and scorched edges, a stitched spine, six coloured index tabs, a sketch per entry, prices on taped manila tags, ink stamps to buy (they thump), a red ribbon bookmark to close; the left page adds a doodled map of the rings.
4. **Type**: Outfit is the banned default sans. The script font is hairline and grey on brown, too thin to read on a phone, and its K reads as a stray capital ("NotebooK").
   - **Done.** IM Fell English SC (titles, names, prices), Alegreya Sans (body; lining tabular figures for the HUD counter, since IM Fell's old-style figures read "1.00M" as "I.ooM"), Caveat Brush at 22px+ in blue-black ink on paper. Outfit and Nothing You Could Do removed; OFL licences included.
5. **Occluding trees fade with a dotted dither pattern** that looks like a render bug. Fix: a soft circular cutout, or fade the canopy to an outlined silhouette.
   - **Done.** A round window is cut around the keeper with an inked rim where it meets each tree (no dither, no transparency). Tried outline-only silhouettes first; in dense oak woods they became a scribble, so the cutout won. The aim ray now skips the cut-away trees.
6. **Primitive models**: pines are stacked cones, oaks are faceted spheres, all one size, evenly scattered, flat-shaded. The hero is a sphere on a cone about 40px tall, hidden under the target label. Fix: Blender trees with crooked trunks, hooked tips, drooping tiers, knothole eyes and baked AO, in three sizes, plus hand-placed landmark trees. Hero 1.5-2x bigger with a tall hood, a lantern and a rim light; the label above the ring.
   - **Done.** Every model is a Blender script in `art/blender/` with ray-cast AO, gradients and rim highlights baked into vertex colours: pines and oaks in three sizes (crooked trunks, drooping star tiers and hooked tips, scalloped canopies with hanging points, knothole eyes), two giants, the Elder Tree, six hand-placed landmark trees. The keeper is 1.6x bigger, with a tall flopping hood, a brass lantern and a shader rim light, framed over the shoulder; the target label sits above the crosshair, clear of him.
7. **Fire blows out to pure white**, and flames are flat fans of cards. Fix: core #FFC15E, body #E8642C, smoky tips, hand-drawn animated flames with an ink edge.
   - **Done.** Cel flames in `shaders/flame.gdshader`: a #E8642C body, a #FFC15E core, a darker band at the edge, smoky tips, an ink outline, redrawn as held drawings at 8 fps. Opaque with a cut-out edge, linear tonemap, no bloom: never white. Burning trees glow in creeping ember veins.
8. **The spawn looks like a blockout**: two pastel boxes cut off by the frame, z-fighting seams, randomly placed crystals, and the bottom 40% of the view is empty brown fog. Fix: cottages half-swallowed by roots, warm lit windows, a path into the forest.
   - **Done.** Four round cottages with roots over their roofs and warm lit windows frame the spawn view like stage wings. A cobbled square has a well, firewood, fences, lantern posts, crawling roots and gardens. A winding path leads into the woods under a root arch between two landmark pines. The crystals are gone.
9. **No value structure in the palette**: violet oaks and teal pines are the same lightness; cyan sparkles are sprinkled evenly everywhere. Fix: the palette below, sparkles only on cursed hearts.
   - **Done.** The palette is in the art bible with measured L* values: plum 14, violet 32, teal 36, sage 67, fire core 82, mint 89. Mint appears only on cursed knots and hearts, and the only sparkles drift round the giants' and the Elder Tree's hearts. Plum fog lifts the distance, and the ambient light warms as the meadow spreads.
10. **The meadow** is one star-shaped flower scattered evenly over saturated green with hard grid edges. Fix: 3-4 species in clusters that thin out at the edges, muted green, grass tufts.
    - **Done.** Poppy, oxeye daisy, buttercup and harebell grow in drifts of one species, bunched in each cell and thinning toward trails, rocks and water, with sage grass tufts everywhere. The ground is muted sage, and a domain-warped cell lookup removes the grid edges.
11. **The tutorial** is a centred box with PC instructions, and the offer tag says "Press B". Fix: phone-only lines of about six words beside their control, with a drawn finger.
    - **Done.** Seven hints of about six words each ("Hold to light the cursed grass", "Thumb here to walk") on taped paper in the keeper's hand, placed beside the burn button, stick, notebook, counter or wind sign. On phones a drawn finger presses or swipes. The offer tag says "tap (or click) to watch a short ad"; no key names.
12. **Copy and controls**: exclamation marks ("Burning!"), Title Case, middle dots everywhere, all-caps "HOLD TO BURN", a stock joystick, a centred popup with a gift-emoji pill button. Fix: sentence case, no "!", a branded wooden burn button, the starter pack as a parcel tied with twine.
    - **Done.** All copy is sentence case, with no "!" and no middle dots. The burn button is a log slice with a flame branded into it (lit ember only while burning); jump is a slice with a chevron; the stick is a carved wooden ring. The starter pack is a brown paper parcel tied with twine, with a label tag, an ink stamp and a handwritten "not now", set off-centre.

## Keep

1. The cold cursed forest turning into a warm meadow, and the glowing cracked-ember ash. **Kept** (and the ambient light now warms with it).
2. The dry writing voice: "Ash. Flowers soon.", "Click, whoosh.", "a very polite dragon." **Kept**, and new lines follow it.
3. The notebook as the shop, with handwritten margin notes; the hazy depth in the grove view. **Kept** (plum fog; the notes are in the keeper's blue-black hand).

## Art direction for the next pass

- **Palette:** shadows plum #2B1F3A, oaks violet #5A3F7A, pines slate teal #2F5C66, all under 40% lightness. Mint #9FF0D0 only on cursed knots. Fire is the only warm light: #E8642C and #FFC15E, never white. Meadow sage #8FAE5E with cream and poppy #D9483B petals.
- **UI:** paper #EFE3C8, ink #2E1E14, char #1A1310; ember orange only on the main action. Motif: a field notebook plus burnt-wood signs (grain, scorch marks, tape, tags on string, hard ink shadows).
- **Type:** IM Fell English SC for titles and numbers, Alegreya Sans for body, Caveat Brush at 22px or larger for notes (all open-licensed; include the licence files).
- **Shapes:** a linocut storybook. Cursed things are spiky and crooked; the hero, village and meadow are round.
- **Lighting:** cool moonlight from the upper left, real point lights on the fire, a rim light on the hero, ambient light warming as the meadow grows.
- **Inspirations:** linocut picture books, Scandinavian folk painting, old forestry signs.

Next: a second fresh-eyes review of the new screenshots and the contact sheet (the art pass is written up in NOTES.md, "Art bible").

---

# Art review 2: second fresh-eyes critic, 2026-11-09 (after the art pass)

**Verdict: not yet.** The 2D layer (planks, notebook, icons, copy) passes as hand-made. The 3D world fills most of every frame, and its sticker fire, gnome-like hero and blob trees still read as hobby or AI work. The next pass is about the 3D.

## Problems, worst first

1. **Fire looks like emoji stickers**: every flame is the same orange-yellow teardrop card, upright and evenly spaced like birthday candles, jagged edges, no smoke, lights nothing; burning canopies get a generic noise "lava camo" texture. Fix: inked flipbook flames that vary in size and lean with the wind, one tall leading flame per cluster, plum smoke, sparks, a warm glow cast on the ground; charring as glowing cracks creeping along the model.
2. **Keeper and critters are primitive builds**: sphere head with diamond eyes, blush dots and a ball nose on a cone body with a belt and a white fur hem reads as Santa or a garden gnome; the spiky hat breaks the "hero is round" rule. Rabbit is a snowman, hedgehog a ball, sprite a flat kite, tools are boxes and cylinders. Fix: redesign the keeper around fire (soot-stained cape, ember scarf, round hood, lantern on a pole, boots), sculpted with bevels and painted vertex colour; critters with real heads and legs; tools with bevels and wear.
3. **Muddy values, lighting without intent**: one mid-dark plum/teal soup, no moonlight direction, no rim; the keeper disappears; the mint accent is almost absent. Fix: a key light with cast shadows, a cool rim on canopy tops, a darker foreground, mint knothole eyes on every cursed tree, a warm lantern pool under the keeper.
4. **Camera buried in foliage**: frames fill with purple blobs and the hero is hidden. Fix: camera collision, a clean radial fade of anything blocking the view, a steeper angle in the dense rings.
5. **Hex oaks are stock icosphere-cluster trees**, brighter than the #5A3F7A swatch; the Elder is just a bigger oak and shows in-game as a black trunk. Fix: scalloped canopies with hanging points, clawed branches, carved-line highlights, less saturation; the Elder gets its own landmark silhouette visible from the village.
6. **Meadow looks like a paint-bucket fill**: lime not sage, hard edge against the stones, evenly scattered flowers. Fix: value variation, a ragged edge into the ash, drifts by species, a blooming animation.
7. **Voronoi flagstone ground** reads as a procedural shader. Fix: hand-laid stones of varied sizes, a worn path into the woods, moss.
8. **Village is symmetric and blank**: two near-identical huts flank a centred keeper; untextured wall slabs, smooth thatch, a perfect pyramid of identical logs. Fix: asymmetric layout, huts at different sizes, a landmark with chimney smoke, carved thatch and wear.
9. **Emoji-like glyphs**: red floating hearts (the bible says mint), smiling flame and dragon icons, the stock pointing-hand cursor, an odd hand-rabbit icon on the critter toast. Fix: redraw in the game's ink icon style.
10. **The notebook is a shop-list template with a paper skin**: every row icon/title/blurb/price plus a second stamp button; the left page is the same on every tab; the Free magic page widens and clips the tabs; locked items use grey stamps like disabled web buttons. Fix: stamp the price tag itself, a different left-page sketch per tab, margin notes, locked items as pencil outlines, fix the width jump.
11. **The ending is a card over gameplay** with the HUD still showing "Pinewood 17% burned". Fix: hide the HUD and sweep the camera over the restored valley at dawn. Phone screens say "click" instead of "tap".

## Keep

- The wood-and-paper UI: charred planks with saw-cut ends and hard shadows, taped handwritten notes, the offer tag on a string with a rope timer, the log-slice touch buttons.
- The notebook's craft and the consistent hand-drawn ink icons.
- The dry, in-world, sentence-case copy.
- Best models: the hooked cursed pines, the daisies, the root arch.
