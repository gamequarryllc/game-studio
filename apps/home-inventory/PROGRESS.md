# Home inventory (working name: Roomfile): progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Status: ready to test (2026-11-11)

The preview was built and published by CI for the first time on 2026-11-11 (the build and the Pages deployment both succeeded; the live page itself cannot be opened from the workspace, as with the games).

**Checks right now:** lint clean, typecheck clean, 76 unit tests pass, the web export and the iPhone bundle both build, the browser run (`node e2e/run.cjs`, 20 steps, three phone sizes and dark mode) passes with no console errors, `python3 tools/store_check.py` passes, and **the native iPhone build compiles on GitHub** (an unsigned `check` build of the Xcode project that `expo prebuild` writes; about 20 minutes on a Mac runner). Two fresh-eyes critics have both said **almost** (reviews 1 and 2 in NOTES.md); everything they found that could be fixed without a phone or a new library is fixed and has a test.

## Done

- Expo SDK 58 project (the SDK the current Expo Go runs), Expo Router, TypeScript.
- Logic in `src/domain/` (pure, unit tested): the document and its repair-on-load parser, rooms and items, totals and gaps, search/filter/sort, money parsing and formatting, dates, the report HTML, the CSV, the backup zip (streamed), the free limit, a sample home.
- Storage: one JSON document written safely to the app's documents folder, photos as files beside it (full and small copy); IndexedDB on the web preview.
- Screens: welcome (two steps, with an example folder), Rooms, room, item, add/edit form, photo viewer, Items (search, filters, sort), Report (PDF report, spreadsheet, backup, restore), Settings (Pro, currency, links, erase everything, developer tools), Pro.
- Pro: free up to 25 items with every feature; RevenueCat adapter behind `src/pro/`, off until a key is set; "Pretend Pro is bought" developer switch; `npm run check:release` refuses a store build without the key.
- Browser run with screenshots at three phone sizes and in dark mode.
- Screenshot review and critic review 1; fixes for both (list in NOTES.md, "QA").
- App icon, splash mark (light and dark) and favicon, drawn as SVG in `art/`.
- Critic review 2 on the fixed screens, and its fixes: a warm dark folder, one empty state on Rooms, item rows of one height, whole amounts in the app, a tighter welcome screen on short phones, dashes in the report's empty cells, a larger icon with a sharper roof.
- The iPhone build: `.github/workflows/ios-app.yml` and `tools/ios_app_build.sh` (`check` proven on GitHub; `testflight` written, not yet run), a privacy manifest and no unused microphone text in `app.json`, the version and build number set by the build, and a `playtest` flavor that keeps the Developer section in a TestFlight build.
- CI: the web workflow lints, typechecks, tests and exports every app in `apps/` and publishes the preview at `/apps/<slug>/`; the site page has an Apps section; a reloaded screen inside a preview comes back through the site's `404.html`.
- Privacy policy and support pages for the apps on the site (`/apps/privacy/`, `/apps/support/`), a draft store listing (`store/home-inventory/listing.json`) and `tools/store_check.py` rules for apps.
- README with the Expo Go steps; NOTES.md with design, art direction, QA, what needs a phone and the going-live steps.

## In progress

- Nothing. Waiting for the owner: either a first run in Expo Go (README, "Run it on your iPhone"), or the one-time Apple steps for a TestFlight build (README, "Install it as an app (TestFlight)").

## Next (after the owner's feedback, which comes first)

1. Whatever the owner finds on the phone. Everything native has only run in a browser so far (list below).
2. The first real `testflight` run of the iPhone build, once the owner's secrets, bundle id and app record exist. It has never run; expect a fix or two to the signing step in `tools/ios_app_build.sh`.
3. Polish left from the two reviews: drag to reorder rooms (needs a gesture library); page numbers in the iPhone's PDF; whether backup lives on the Report tab or in Settings (the owner's call). NOTES.md, "Known gaps".
4. App Store screenshots from the browser run once the look is settled, with believable made-up names and the web-only note and Developer section hidden.

## Not yet tried on a real iPhone

Everything native (camera, photo library, PDF creation, share sheet, date picker, haptics, file storage, the system tab bar and its icons, the splash screen) is written against the SDK 58 type definitions, compiles into the iPhone bundle and links into a native app on GitHub's Mac, but has only been exercised through the web build. The owner's first Expo Go run is the first real-device test.
