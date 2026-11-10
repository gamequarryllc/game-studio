# Art review 1: fresh-eyes critic, 2026-11-09 (first build)

**Verdict: No.** The UI art direction is close, but procedural-looking terrain, primitive models and flat lighting give the world away as generated. **Phone readability:** tide board labels and dial numerals are ~9 px and unreadable, tap targets are tiny, and stacked popups cover close to half the screen.

## Problems, worst first

1. **The terrain looks procedural**: a round bullseye bowl with concentric terraces; every pool edge stair-stepped from the heightmap, with steps showing through the water in the central basin; grass and sand as blurry noise blotches. Fix: hand-sculpt an asymmetric bay (a headland, a rocky point, a river mouth, the sea wall as a hero landmark); a smooth modelled shoreline lip; painted tide lines, ripple marks running one way, stones in clusters instead of noise.
   - Done (2026-11-10): `make_bay.py` rebuilt from hand-drawn isobaths at 0.5 m: west headland, rocky point with strata, river mouth and weir, the sea wall as the hero; pools have smooth modelled lips, tide lines, ripples running one way, stones in clusters, painted fields instead of noise.
2. **Primitive-soup models**: houses and the chapel are box + pyramid + chimney; the clock tower a prism with a cone; the crab a sphere on cylinders; the puffer a sphere with cones; turtle and flounder discs; the whale a lump; fins single flat triangles; the bell reads as a ball; the "galleon" is a rowboat; one flat colour per part, smooth-shaded, no AO or wear. Fix: real silhouettes and thickness (eaves, sagging ridgelines, window frames); countershading, markings, barnacle and weed lines on creatures and hulls; wrecks broken open with ribs showing.
   - Done: every building, creature, wreck and engine rebuilt in Blender: eaves, sagging ridges, framed windows, a real clock tower; countershaded creatures with markings and thick rayed fins; wrecks broken open on their ribs, a real galleon; weed lines, barnacles and baked AO; the river weir rebuilt stone by stone in this pass.
3. **The lost-town payoff fails**: murky green dark, grey hollow boxes, a centred card over the town, "+39K" floaters still up. Fix: hold a beat and dolly to the clock tower in warm light with weed dripping and wet glints; bring the card in afterwards, off to one side.
   - Done: `EndingShot` hides the HUD, holds a 1.9 s beat while the calf goes home, dollies to the clock tower in low gold light with weed dripping and a wet sheen; the card slides in from the left afterwards; no floaters, no find cards, nothing stranded or aground in front of the lens, and the camera always clear of the seabed (smoke-tested).
4. **Popups stack and cover the action**: a zone card, a toast, a notice, a badge and an ad offer at once; the zone card sits on the wreck; the "stranded in the shallows" hint still up at 15 m. Fix: zone names as curved italic chart lettering in the world; one message at a time, anchored to its object.
   - Done: one message at a time on a single tag tied to its object; zone names inked into the seabed as curved italic chart lettering (`chart_lettering.gd`); stale hints dropped.
5. **Flat, washed-out lighting**: no late-afternoon key; blurry cloud blobs instead of cast shadows; depths not cooler. Fix: a low warm key from the west-south-west, crisp long shadows from pilings and wrecks, a cool fill, darker depths, the sea glittering beyond the wall.
   - Done: low warm key from the WSW (19 degrees up) with crisp long shadows, a cool teal fill, height fog that cools and darkens the deep, the open sea glittering beyond the wall.
6. **The aquarium is a bare box**: flat teal walls seen head-on; creatures evenly spaced in a void, fogged to one pale tint; panels hide a third of the tank. Fix: rockwork, a sand slope, caustics, pier timbers around the glass, true creature colours; the register as a natural-history plate with small engraved sketches; unfound species as silhouettes.
   - Done: rockwork stacks, a sand slope, caustics on the glass, pier timbers round the tank, true creature colours in their own habitats; the register is a natural-history plate with engraved sketches and unfound species as silhouettes, sized to fit any screen; the ticket office is a small slip in the corner.
7. **The shop is a template**: equal tabs, identical rows, three identical "Watch ad" rows, generic play icons, a spiral standing for "brass", a visible "Playtest" tab. Fix: a chandler's counter or pegboard with paper tags, a bigger slot for the next buy, ad offers merged into one notice, dev access hidden.
   - Done: the Chandlery is a pegboard with paper tags on pegs and a big "Next on the list" tag; every ad offer is on one notice in the harbour office; no Playtest tab (dev log: hold the money cartouche or F9, playtest builds only).
8. **Scale is off**: houses dwarf the pier; the pump (the core verb) is a tiny cross on a pallet; creatures are specks inside generic white rings. Fix: one scale rule, chunky pumps with smoke and hoses, larger creatures, chart-style tap markers.
   - Done: one scale rule in `models.gd`; chunky pumps that smoke, with hoses laid out over the sand to the water; creatures drawn 2.4x larger, pumps 1.6x; chart-symbol tap markers.
9. **Tide board collisions**: the depth pointer covers zone labels; labels on grey translucent boxes look like debug labels; the log dial is unreadable; "salvage and rescues pay" is filler. Fix: pointer on the other side, ink-on-paper labels, a dial with three marks, real copy.
   - Done: the level pointer reads from the left, ring names are ink on the board's paper, the dial has three marks (100, 10K, 1M) and a red seep needle, real copy throughout.
10. **Pool numerals look like debug IDs** (giant hollow "1₃, 2₀"). Fix: small chart soundings scattered over all the water.
   - Done: small italic chart soundings scattered over all the water, updating as it drops.
11. **Every UI panel uses the same wobble** (the same jittered double rule over graph paper). Fix: a treatment per role: a pinned torn slip, a cartouche with flourishes, real fold creases.
   - Done: a treatment per role: pinned torn slips for notices, the money cartouche with flourishes, string tags for callouts, a folded chart for the ending, an engraved plate for the register, painted boards on strings for signs.
12. **The water is flat**: one teal with noise, a tiling caustic net, a uniform white foam line. Fix: a colour gradient by depth, broken foam, sun glitter.
   - Done: water coloured by depth, broken foam at the edge, sun glitter, soft caustics only in the shallows (no tiling net); the river behind the weir shades from bank to channel.

## Keep

- The palette and type: Fraunces italic for water names, Atkinson for reading, restrained cream, teal and rust, no emoji.
- The in-world HUD ideas: the signal-flag halyard, the tide board turning white as the water drops, the notices to mariners.
- The copy ("Loud, smoky and honest. Runs all night.", "The clock tower still keeps time.") and the models with real silhouettes: hand pump, diving helmet, barge, ship's wheel, pier.
