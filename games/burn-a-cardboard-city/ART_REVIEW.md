# Art review 1: fresh-eyes critic, 2026-11-09 (first build)

Reviewed all 18 screenshots and the model sheet against the studio's "Look and feel" standard. The next pass works from this list. Mark each item done here when fixed, then get a second review.

## Problems, worst first

1. **Fire looks like clip-art**: every flame is the same cream-cored teardrop, same size, same upright angle; up close flames fill the screen; burning boxes get a pasted lava-noise texture; no smoke. Fix: 5-6 different cut-paper flame shapes with torn edges, a darker red base (#b8321c), one tall flame per building leaning with the wind; fade flames within ~3 m of the camera; grey tissue-paper smoke drifting with the fans; burning as a dark-brown scorch spreading across the box with a thin glowing edge, not magma.
2. **Burnt-out buildings are black holes**: pure-black slabs and splat decals; a fallen tower is a stiff black cube. Fix: 3-4 crumpled or folded Blender states per building type (curled flaps, exposed corrugation), grey ash piles (#8a8580); char #2a2420, never #000; embers cool to grey.
3. **Every model uses the same material**: plain orange kraft with baked shading, windows in a perfect grid, stock low-poly trees, flat lime grass. Fix: a real recycled-cardboard city: printed shipping boxes (stencil marks, barcodes, this-way-up arrows, made-up brands), inside-out cereal boxes, egg-carton roofs, toilet-roll turrets, straw antennas, visible packing tape and cut edges; trees of crumpled tissue on pencils; lawns of green construction paper; varied window spacing with gaps.
4. **Held tools are primitives with no hand**: the magnifier is a white disc that neither magnifies nor makes a hot spot; the blowtorch is a blue cylinder; the rocket reads as a bazooka. Fix: a chunky giant hand holding each tool. Magnifier: ridged brass rim, turned wooden handle, a lens that distorts what's behind it, a bright focus dot with a wisp of smoke. Blowtorch: gas canister with a domed top, valve knob, brass nozzle. Rocket: a paper rocket on a stick fired from a glass bottle.
5. **Flat, pale lighting**: almost everything between 60% and 85% brightness, no warm/cool contrast, fire lights nothing. Fix: ambient down ~35%, a warm key (#ffe2b0) from one skylight with long shadows, a cool fill (#7f93b0), 2-4 shared fire lights, haze that darkens as the city burns.
6. **No layout or sense of scale**: an even carpet of same-height boxes; the first screen shows no warehouse; a wide FOV makes edge towers lean. Fix: FOV ~60°, skyscrapers 2-3x downtown height, floor gaps between districts with giant warehouse props (pallet, tape roll, paint can, mug), the castle on a pallet on the main sightline.
7. **Too much UI, desktop wording**: up to 12 UI pieces at once; "+371 +60" prints over the CHAIN stamp; "Hold the left mouse button", "B to watch", "Click or press G". Fix: one find note at a time, spaced popups, device-aware prompts (touch wording on phones).
8. **The shop box is a flat panel**: 8 equal tabs (a "Shop" tab inside the shop, Settings and Dev with the same gear), a template 2x2 card grid, a broken purchases layout (floating "Coins" header, empty gap). Fix: draw the inside of the box in perspective with darker inner walls and a corrugated rim, 5 divider tabs of different widths, feature the next affordable tool, hide Dev.
9. **The starter popup is a stock modal**: centred, two stacked full-width buttons, a gift icon on "A box of matches". Fix: a real matchbox whose drawer slides open, the price on a tag tied with string, "not now" as a small scribble.
10. **Permanent Marker everywhere** (the default free "handwritten" font). Fix: a stencil display font such as Saira Stencil One (OFL) for district names and headers, like real box markings; keep the marker font only for numbers and the chain stamp.
11. **Touch controls don't match; the wind tag reads as a phone signal meter.** Fix: all three as bottle caps or card discs; wind as a ribbon on a fan whose length shows strength.
12. **Rockets show no rocket**, only a faint glow. Fix: a spinning paper rocket with a spark trail and a felt-tip-coloured burst.

## Keep

- The kraft tags, masking tape and price-tag buttons, and the in-world copy voice ("A lost sock.", "Too far. Walk closer").
- The open-flapped boxes with felt-tip windows and labels (KITCHEN, BANK, LOFTS) and the castle's marker brickwork.
- The truss-and-skylight warehouse ceiling, the consistent ink-outline icons, the red bottle-cap joystick.

## Direction for the next pass

A kid's craft project built from recycling, lit by late-afternoon skylight in a dim warehouse. Each district has its own materials: suburbs from painted cereal boxes and tissue trees, downtown from printed shipping boxes, skyscrapers from white printer-paper boxes, the castle from egg cartons and toilet rolls on a pallet. Lower ambient, one warm key with long shadows, cool blue in the shade; fire is the brightest, warmest thing on screen and lights what's near it. Fire is cut paper with grey tissue smoke; burning creeps across the board as a glowing edge and leaves crumpled shells and grey ash, never black voids. Every tool in a drawn giant hand. Giant warehouse props between districts for scale. UI: stencil headers, one popup at a time, touch-only wording, the shop and offers as physical objects (a box with depth, a matchbox, luggage tags on string).
