# Plainpins: progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Done

- Project in `apps/plainpins/` (Expo 58, the same plumbing as Plainkeep; bundle id `com.gamequarry.plainpins`).
- The logic, with 59 unit tests (`npm test`).
- Every screen: welcome, map (globe, pins, card strip, placing a pin), place page, place form, photo viewer, Places list, Settings, Pro, sample map.
- Icon and launch mark (`art/`).
- The sample map: 44 real places with made-up visits and drawn pictures (Settings > Developer > Sample map), and a 9-place starter.
- Free and Pro (NOTES.md, "Money"); "Pretend Pro is bought" in Developer.
- The end-to-end browser run (`e2e/run.cjs`, 27 steps at two phone sizes, no console errors).
- Critic review 1 (verdict: almost) and its fixes (NOTES.md, "QA").
- Store listing draft (`store/plainpins/listing.json`), README, NOTES, the Maps section of the apps' privacy page.

## In progress

- Critic review 2 fixes are in; a third review after the first phone test.
- Waiting on the owner's first test of TestFlight build 1.0.0 (112), uploaded 2026-11-21.

## Next

1. The owner's first test on a phone: the Apple Maps globe and pins, search, "where I am", the photo picker, a backup through the share sheet. Fix what he finds.
2. Check the sample pins against the real map on the phone (coordinates were written from memory).
3. Move a pin without deleting the place.
4. Store screenshots from the phone build, then the "later" list in NOTES.md when the owner takes the extras off hold.
