# Home inventory (working name: Roomfile): progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Status: building (first build, 2026-11-11)

**Checks right now:** lint clean, typecheck clean, 61 unit tests pass, the web export builds, the browser run (`node e2e/run.cjs`, 20 steps) passes with no console errors.

## Done

- Expo SDK 58 project (the SDK the current Expo Go runs), Expo Router, TypeScript.
- Logic in `src/domain/` (pure, unit tested): the document and its repair-on-load parser, rooms and items, totals and gaps, search/filter/sort, money parsing and formatting, dates, the report HTML, the CSV, the backup zip (streamed), the free limit, a sample home.
- Storage: one JSON document written safely to the app's documents folder, photos as files beside it (full and small copy); IndexedDB on the web preview.
- Screens: welcome (two steps), Rooms, room, item, add/edit form, photo viewer, Items (search, filters, sort), Report (PDF report, spreadsheet, backup, restore), Settings (Pro, currency, links, developer tools), Pro.
- Pro: free up to 25 items with every feature; RevenueCat adapter behind `src/pro/`, off until a key is set; "Pretend Pro is bought" developer switch.
- Browser run with screenshots at three phone sizes and in dark mode.

## In progress

- Screenshot review and the fresh-eyes critic; fix what they find.

## Next

1. CI: build every app in `apps/` in the web workflow and publish it to `/apps/<slug>/`; apps section on the site page; privacy and support pages for the apps.
2. README (Expo Go steps), NOTES.md (design, art direction, QA), store listing draft in `store/home-inventory/`.
3. App icon and splash.
4. Set `ready-to-test` in `queue.json` once the critic says at least "almost", and ping the owner.

## Not yet tried on a real iPhone

Everything native (camera, photo library, PDF creation, share sheet, date picker, haptics, file storage) is written against the SDK 58 type definitions but has only been exercised through the web build. The owner's first Expo Go run is the first real-device test.
