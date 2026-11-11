# Home inventory (working name: Roomfile): progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Status: ready to test (2026-11-11)

The preview was built and published by CI for the first time on 2026-11-11 (the build and the Pages deployment both succeeded; the live page itself cannot be opened from the workspace, as with the games).

**Checks right now:** lint clean, typecheck clean, 75 unit tests pass, the web export and the iPhone bundle both build, the browser run (`node e2e/run.cjs`, 20 steps, three phone sizes and dark mode) passes with no console errors, `python3 tools/store_check.py` passes. The fresh-eyes critic said **almost** (review 1 in NOTES.md); every finding that could be fixed without a phone is fixed and has a test.

## Done

- Expo SDK 58 project (the SDK the current Expo Go runs), Expo Router, TypeScript.
- Logic in `src/domain/` (pure, unit tested): the document and its repair-on-load parser, rooms and items, totals and gaps, search/filter/sort, money parsing and formatting, dates, the report HTML, the CSV, the backup zip (streamed), the free limit, a sample home.
- Storage: one JSON document written safely to the app's documents folder, photos as files beside it (full and small copy); IndexedDB on the web preview.
- Screens: welcome (two steps, with an example folder), Rooms, room, item, add/edit form, photo viewer, Items (search, filters, sort), Report (PDF report, spreadsheet, backup, restore), Settings (Pro, currency, links, erase everything, developer tools), Pro.
- Pro: free up to 25 items with every feature; RevenueCat adapter behind `src/pro/`, off until a key is set; "Pretend Pro is bought" developer switch; `npm run check:release` refuses a store build without the key.
- Browser run with screenshots at three phone sizes and in dark mode.
- Screenshot review and critic review 1; fixes for both (list in NOTES.md, "QA").
- App icon, splash mark (light and dark) and favicon, drawn as SVG in `art/`.
- CI: the web workflow lints, typechecks, tests and exports every app in `apps/` and publishes the preview at `/apps/<slug>/`; the site page has an Apps section; a reloaded screen inside a preview comes back through the site's `404.html`.
- Privacy policy and support pages for the apps on the site (`/apps/privacy/`, `/apps/support/`), a draft store listing (`store/home-inventory/listing.json`) and `tools/store_check.py` rules for apps.
- README with the Expo Go steps; NOTES.md with design, art direction, QA, what needs a phone and the going-live steps.

## In progress

- **The iPhone build pipeline** (2026-11-11, started at the owner's request so the app can go on his phone through TestFlight): `.github/workflows/ios-app.yml` and `tools/ios_app_build.sh` write the Xcode project with `expo prebuild`, build it on a Mac runner, and in `testflight` mode sign and upload it. The first unsigned `check` build is running; until it is green, treat the pipeline as unproven. The `testflight` half cannot be tried until the owner's four secrets exist.

## Next (after the owner's feedback, which comes first)

1. Whatever the owner finds on the phone. Everything native has only run in a browser so far (list below).
2. A second critic pass on fresh screenshots (review 1's fixes have not been seen by a critic yet).
3. Polish left from review 1: drag to reorder rooms; page numbers in the iPhone's PDF (NOTES.md, "Known gaps").
4. App Store screenshots from the browser run once the look is settled.

## Not yet tried on a real iPhone

Everything native (camera, photo library, PDF creation, share sheet, date picker, haptics, file storage, the system tab bar and its icons, the splash screen) is written against the SDK 58 type definitions and compiles into the iPhone bundle, but has only been exercised through the web build. The owner's first Expo Go run is the first real-device test.
