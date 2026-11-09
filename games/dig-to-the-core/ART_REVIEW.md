# Art review 1: fresh-eyes critic, 2026-11-09 (first build)

Reviewed every screenshot, the model contact sheet and the icon sheet against the studio's "Look and feel" standard. The next pass works from this list. Mark each item done here when fixed, then get a second review.

## Problems, worst first

1. **The underground is one flat orange-brown wash**: no darks; rock facets read as crumpled paper; pebbles are flat confetti quads floating in the air; ore is flat teal triangles. Fix: lamp light falls off to a zone-tinted soot (clay #2A1610) by 8 m; strata bands every 0.5-1.5 m, each about 15% lighter or darker than the next; a 256px hand-painted triplanar rock texture; half-buried 3D pebbles; ore as nuggets standing out of the wall with a rim glint.
2. **Clay and Fossil Bed shots are the same image**: a full-screen yellow dust card plus a white wedge (the drill bit clipping the camera near plane). Fix: viewmodel on its own camera; fade dust near the lens; each zone gets its own hue and a prop.
3. **The surface looks like stock Godot**: lime #5CC232 noise grass, default sky, mint fog hills, flat noon light. Fix: late-afternoon sun, warm key #FFD39A, cool ambient #8EA6C8, long shadows; olive grass #7E9A4C with darker clumps, worn umber paths, a spoil heap, hills in three values fading with distance.
4. **Spawn composition**: you spawn facing a headframe leg, the shack is hidden, an endless fence cuts the frame. Fix: spawn on a 3/4 view, shack on the left, headframe on the right, a path leading in.
5. **Hazard-stripe bollards** read as a modern car park (wrong era) and their random lean looks broken. Fix: weathered timber posts, sagging rope, one enamel "Open shaft" sign.
6. **Primitive-soup models**: mole and robo-mole are eggs; oak is icospheres and pine is stacked cones; the barrel is a bucket with hoops floating off it; the crate is a plain bevelled box; the jackhammer looks like a syringe; the borer is a salmon drum with no cutting head; the pickaxe has one point; tools drift to salmon #E8956B (not in the art bible). Fix: pear-bodied mole with spade claws, snout and hard hat; brass-boiler robo-mole; bulging barrel; planked crate; oversized double-ended pick; T-handle jackhammer; toothed cone on the borer; vertex AO and worn edges on every model.
7. **The headframe reads as a steel radio mast.** Fix: heavy squared timbers, back legs sloping out, a bigger sheave wheel, a cable that reaches the cage.
8. **Template UI**: every element is the same chamfered plate with four corner rivets and the same tick scratches; the shop is identical rows under five equal tabs. Fix: material by role (brass for money, chipped enamel for signs, paper ledger cards with stamped prices for items), uneven tabs, rivets only on brass.
9. **Off-palette blue (#4F86BF)** on the ad buttons, the rare-find frame and Jump is the loudest colour on screen. Fix: ad buttons in verdigris enamel or as a cream ticket with a red play stamp; Jump in soot iron.
10. **HUD overlaps**: the find card covers the gauge labels and stays up during the lift ride; zone names float in tiny grey lowercase; two 2x offers show at once; Jump overlaps Dig; the Down button has a soft glow halo.
11. **Viewmodels**: the shovel is held like a broom; the drill is hidden behind the buttons. Fix: a gloved hand, with the tool's working end framed above the buttons.
12. **The lift ride is a yellow void**, and finds are 2D billboards (make them Blender models).

## Keep

- The Rye and Zilla Slab fonts, the brass "Supply Shack" header and the money plate.
- The writing voice ("Grandpa's old shovel. Good for dirt, hopeless on rock.").
- The icon set's thick outline and flat fills, and the crooked paper offer tag.

## Direction for the next pass

Fix lighting first. Underground is a warm amber pool that fades to near-black within 8 m; each zone gets its own dark tint and one landmark (fossil ribs, crystals, lava as a second red light), with strata bands on every wall. The surface moves to late afternoon with a composed spawn view. Rebuild the weak models up to the standard of the shack (the best model): oversized working ends, AO and edge wear, only the seven palette colours. Drop the blue and the rivet-on-every-corner plate; each UI element's material follows its job. Fix the dust and the near-plane clip before the next screenshots.
