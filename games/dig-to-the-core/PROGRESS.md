# Dig to the Core: polish pass progress (art review 3)

Builders get cut off; this file says where the polish pass stands. Update after every finished item.

## Status

- Smoke test: PASSES, 92 checks (8 new this session, one per fix below).
- Playthrough boosted: PASSES (11:00 of play, 185 s real, 16 of 16 finds, 9 reloads; final run after every change).
- Playthrough keen: PASSES (23:59, 16 of 16 finds, 4 interstitials, 9 reloads). An earlier keen run failed once (bot teleported into rock when stuck walking to a buried find); bot fallback fixed, rerun passed.
- Browser check: PASSES at 844x390, 932x430, 1024x768.
- Privacy check: passes.
- NOTE: the `.godot/imported` cache was stale for several rebuilt models (the fossil slab showed its old cardboard-disc version). Always run `godot --headless --import --path .` after rebuilding a .glb or texture before judging screenshots.

## Done (this session)

1. Rock glints: the ore sparkle lit whole 9 cm cells, which read as pale confetti on every wall. Now pin-points about a centimetre across (`shaders/rock.gdshader`).
2. Landmark lanterns (clay timbers, ore cart) were range-5 floodlights that lit the cave edge to edge and hid the headlamp pool; now range 3.2 with a fast falloff (`DigField._place_landmark`).
3. Rock textures written at 512 px per tile (was 256): walls half a metre away showed blurry stair-steps (`art/textures/make_rock.py`, edges softened half a pixel with wrap).
4. The player's spot falls off like the shader's pool (`spot_attenuation` 0.7, was 1.8), so props (fossil slab, skeleton, cart) sit in the same pool as the rock instead of going dark.
5. `tests/look.gd`: `lm1`..`lm9` landmark views (same framing as screenshots.gd), env toggles LOOK_NODECOR, LOOK_NOLIGHTS, LOOK_NOROCK, LOOK_FACET, LOOK_LIST for quick lighting checks (~20 s a view).

6. Birch rebuilt: thin upswept branches whose twigs arch over and hang, carrying small leaf sprays as flat cupped double-sided plates (`leaf_plates` in `art/blender/world_models.py`), an open crown with sky through it (was blobs on a stick). Maple's crown is now clumps of leaf plates with one side turning amber (was faceted lumps). ~5K and ~6K faces.

7. Shack: the door lantern was an emissive box glowing white at noon; now an unlit lantern (sooty frame, peaked cap, dull amber glass, wall bracket), and the daytime shack light is gone.
8. "Open shaft" sign: the heavy stroke filled Rye's counters (blobs); light stroke now, readable from the path (`art/textures/make_signs.py`).
9. Tools: metallic turned down to 40% (no reflections in the game, so metal rendered nearly black and hid the wear paint); the shovel blade's face is fanned and subdivided so its worn edge, pits, rust and scratches actually show (it had no inside vertices: one flat grey).
10. Skeleton turned side-on to the shaft (`"turn"` in `DigField.LANDMARKS`).

11. Inner core: its molten gaps glow (STYLE glow 0.22 -> 0.7) and its landmark light is smaller, so the walls read as bronze crystals with amber between instead of crumpled paper.
12. Lift ride: the tool is put away for the ride (it filled the middle of the view) and back on stepping out; the set lamps are small framed lanterns instead of glowing boxes.
13. Glove buckle brass metal turned down too (smoke test checks every held tool's metallic <= 0.4).

14. Bone decor rebuilt as a femur (broad knee with two condyles and a notch, head on a neck, trochanter ridge; squashed ellipsoid lobes) instead of a dog's chew bone.
15. Drill: ribbed iron cooling rings at the motor end, a riveted brass maker's plate on top, a rubber cord out of the back cap, chipped enamel.

16. Lift ride: the guide shoes are iron sleeves with a brass collar on an arm (they were yellow boxes).
17. Screenshots re-shot after a fresh import: `/tmp/dig-shots-v6`.

18. Lift stop lantern glass warm amber at a lower glow (it was a white-hot box up close).
19. Bot: the stuck-walking fallback only teleports to an open spot.
20. ART_REVIEW.md: a "Checked (second pass)" note under every review-3 item; NOTES.md: art bible, done list, tests, rebuild notes and QA updated.

## In progress

- Nothing. The polish pass is complete: every review-3 item has a "Checked (second pass)" note in ART_REVIEW.md, NOTES.md QA is updated.

## Next (for a later pass or the fourth critic)

- Left for a later pass: the skull is small and dim from the shaft side; pebbles are still smooth rounded stones; timber_post plain.
- A fourth fresh-eyes critic review of `/tmp/dig-shots-v6` (or a fresh shoot) and the model sheet.
