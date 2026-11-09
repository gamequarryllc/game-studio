# Art review 1: fresh-eyes critic, 2026-11-09 (first-playable build)

Reviewed all 19 screenshots from `tests/screenshots.gd` against the studio's "Look and feel" standard. The next art pass works from this list. Mark each item done here when fixed, then get a second review.

## Problems, worst first

1. **Emoji are the icon set** (HUD, notebook, offer tag, popup). 🔥 is the currency, four tool icons and every label's bullet; ⬆️ ↔️ 💎 📺 ⚙️ are stock glyphs. Fix: one SVG icon set (2px ink line, two flat fills, a slight wobble). Draw each tool as the real object; embers as a cracked, glowing coal.
2. **One template panel everywhere**: dark-brown rounded rectangle, one corner radius, thin orange stroke, soft orange glow, glowing orange pill buttons. Fix: no glows at all. HUD pieces as charred planks with uneven cut ends and a hard 2px offset ink shadow.
3. **The "notebook" is a dark settings page** (sidebar nav, list rows, a Close button). Fix: cream paper #EFE3C8 with grain and ruled lines, scorched edges, a stitched spine, coloured index tabs. Each item gets a sketch and a price on a taped tag. Buy with an ink stamp; close with a ribbon.
4. **Type**: Outfit is the banned default sans. The script font is hairline and grey on brown, too thin to read on a phone, and its K reads as a stray capital ("NotebooK").
5. **Occluding trees fade with a dotted dither pattern** that looks like a render bug. Fix: a soft circular cutout, or fade the canopy to an outlined silhouette.
6. **Primitive models**: pines are stacked cones, oaks are faceted spheres, all one size, evenly scattered, flat-shaded. The hero is a sphere on a cone about 40px tall, hidden under the target label. Fix: Blender trees with crooked trunks, hooked tips, drooping tiers, knothole eyes and baked AO, in three sizes, plus hand-placed landmark trees. Hero 1.5-2x bigger with a tall hood, a lantern and a rim light; the label above the ring.
7. **Fire blows out to pure white**, and flames are flat fans of cards. Fix: core #FFC15E, body #E8642C, smoky tips, hand-drawn animated flames with an ink edge.
8. **The spawn looks like a blockout**: two pastel boxes cut off by the frame, z-fighting seams, randomly placed crystals, and the bottom 40% of the view is empty brown fog. Fix: cottages half-swallowed by roots, warm lit windows, a path into the forest.
9. **No value structure in the palette**: violet oaks and teal pines are the same lightness; cyan sparkles are sprinkled evenly everywhere. Fix: the palette below, sparkles only on cursed hearts.
10. **The meadow** is one star-shaped flower scattered evenly over saturated green with hard grid edges. Fix: 3-4 species in clusters that thin out at the edges, muted green, grass tufts.
11. **The tutorial** is a centred box with PC instructions, and the offer tag says "Press B". Fix: phone-only lines of about six words beside their control, with a drawn finger.
12. **Copy and controls**: exclamation marks ("Burning!"), Title Case, middle dots everywhere, all-caps "HOLD TO BURN", a stock joystick, a centred popup with a gift-emoji pill button. Fix: sentence case, no "!", a branded wooden burn button, the starter pack as a parcel tied with twine.

## Keep

1. The cold cursed forest turning into a warm meadow, and the glowing cracked-ember ash.
2. The dry writing voice: "Ash. Flowers soon.", "Click, whoosh.", "a very polite dragon."
3. The notebook as the shop, with handwritten margin notes; the hazy depth in the grove view.

## Art direction for the next pass

- **Palette:** shadows plum #2B1F3A, oaks violet #5A3F7A, pines slate teal #2F5C66, all under 40% lightness. Mint #9FF0D0 only on cursed knots. Fire is the only warm light: #E8642C and #FFC15E, never white. Meadow sage #8FAE5E with cream and poppy #D9483B petals.
- **UI:** paper #EFE3C8, ink #2E1E14, char #1A1310; ember orange only on the main action. Motif: a field notebook plus burnt-wood signs (grain, scorch marks, tape, tags on string, hard ink shadows).
- **Type:** IM Fell English SC for titles and numbers, Alegreya Sans for body, Caveat Brush at 22px or larger for notes (all open-licensed; include the licence files).
- **Shapes:** a linocut storybook. Cursed things are spiky and crooked; the hero, village and meadow are round.
- **Lighting:** cool moonlight from the upper left, real point lights on the fire, a rim light on the hero, ambient light warming as the meadow grows.
- **Inspirations:** linocut picture books, Scandinavian folk painting, old forestry signs.
