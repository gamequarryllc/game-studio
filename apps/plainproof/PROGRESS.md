# Plainproof (home inventory for insurance): progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Status: in TestFlight, waiting for the owner's first run on a phone (2026-11-11)

**Build 1.0.0 (14), playtest flavor, was signed on GitHub and uploaded to TestFlight on 2026-11-11** ("iOS app build", run 43098533628). The app has its identifier (`com.gamequarry.plainproof`) and its App Store Connect record ("Plainproof: Home Inventory"; Apple accepted the name), and an internal testing group, "Me", with automatic distribution and the account holder as its one tester. The owner ran build 14 on his iPhone the same day; build 17 carried the changes he asked for after that run (the welcome picture, fewer words, 20 free items), build 19 the first file drawer, build 20 the cabinets, build 21 a drawer you flipped through from the front, and the build after it the drawer as it is now. A 3D sketch of another way the drawer could look (a real cabinet drawer, the chosen folder lifted out) was made in Blender for the owner the same night; it is a picture to react to, not a plan.

The preview was built and published by CI for the first time on 2026-11-11 (the build and the Pages deployment both succeeded; the live page itself cannot be opened from the workspace, as with the games).

**Checks right now:** lint clean, typecheck clean, 93 unit tests pass, the web export and the iPhone bundle both build, the browser run (`node e2e/run.cjs`, 21 steps, three phone sizes and dark mode) passes with no console errors, `python3 tools/store_check.py` passes, and **the native iPhone build compiles on GitHub** (an unsigned `check` build of the Xcode project that `expo prebuild` writes; about 20 minutes on a Mac runner). Two fresh-eyes critics have both said **almost** (reviews 1 and 2 in NOTES.md); everything they found that could be fixed without a phone or a new library is fixed and has a test.

## Done

- **The drawer, third version (2026-11-11, from the owner's screen recording of the second):** every folder in view at once, one of them open, and the opening slides down the column with the finger, a tick for each folder; tap a tab to open it, tap the open folder to go in. A short plate, coloured label symbols, clearer folders in the dark theme, and a screen that cannot scroll (`src/ui/RoomDeck.tsx`; NOTES.md, "The drawer"). The browser run slides the drawer, checks which folder is open and where every folder sits at each stop, taps a closed folder open and then into its room, and checks on three phone sizes that every folder is on the screen.
- **The drawer, second version (2026-11-11, after the owner tried the first):** flipping through the folders. The front folder tips away as the next comes forward, with a tick under the finger for each one that passes; the Rooms tab fits one screen with only the drawer to move (`src/ui/RoomDeck.tsx`; NOTES.md, "The drawer"). The browser run flips the drawer, checks the folder in front at each stop, opens a room from the front and from a tab behind, and checks on three phone sizes that the screen fits.
- **Cabinets: more than one place (2026-11-11, the second half of the owner's idea).** A place is a file cabinet; the Rooms tab is the open drawer of one, and the cabinets screen switches between them, adds one (Pro), renames, changes the kind and deletes (never the last). Each place has its own rooms, items, report and spreadsheet; backups carry every place; the free limits count across places. NOTES.md, "The cabinets" and "How places are kept". 13 new unit tests (89 in all) and a new step in the browser run (21 steps).
- **The file drawer (2026-11-11, the owner's idea):** the Rooms tab shows the rooms as manila folders in a drawer, with stepped tabs, a pile that gathers at the top as the list scrolls, and a lift on press (`src/ui/RoomDrawer.tsx`; NOTES.md, "The drawer"). The browser run checks the tabs (names clear of the slanted edge, stepped positions), scrolls the drawer, checks the pile and opens a room from it. The welcome screen also says why: one line about insurance and a shield on the folder.
- **After the owner's first run on his phone (2026-11-11):** the welcome screen is a picture with a few words instead of a paragraph (`src/ui/WelcomeArt.tsx`; NOTES.md, "The welcome picture"), the room picker is a grid of tiles, the first prompt on the Rooms tab is one short line, and the free version holds 20 items instead of 25. The browser run now checks that the picture is drawn and that the first screen fits above the button on every phone size.
- Expo SDK 58 project (the SDK the current Expo Go runs), Expo Router, TypeScript.
- Logic in `src/domain/` (pure, unit tested): the document and its repair-on-load parser, rooms and items, totals and gaps, search/filter/sort, money parsing and formatting, dates, the report HTML, the CSV, the backup zip (streamed), the free limit, a sample home.
- Storage: one JSON document written safely to the app's documents folder, photos as files beside it (full and small copy); IndexedDB on the web preview.
- Screens: welcome (two steps, with an example folder), Rooms, room, item, add/edit form, photo viewer, Items (search, filters, sort), Report (PDF report, spreadsheet, backup, restore), Settings (Pro, currency, links, erase everything, developer tools), Pro.
- Pro: free up to 20 items with every feature (the owner's number, 2026-11-11); RevenueCat adapter behind `src/pro/`, off until a key is set; "Pretend Pro is bought" developer switch; `npm run check:release` refuses a store build without the key.
- Browser run with screenshots at three phone sizes and in dark mode.
- Screenshot review and critic review 1; fixes for both (list in NOTES.md, "QA").
- App icon, splash mark (light and dark) and favicon, drawn as SVG in `art/`.
- Critic review 2 on the fixed screens, and its fixes: a warm dark folder, one empty state on Rooms, item rows of one height, whole amounts in the app, a tighter welcome screen on short phones, dashes in the report's empty cells, a larger icon with a sharper roof.
- The iPhone build: `.github/workflows/ios-app.yml` and `tools/ios_app_build.sh` (`check` and `testflight` both proven on GitHub: the first signed upload was build 14 on 2026-11-11), a privacy manifest and no unused microphone text in `app.json`, the version and build number set by the build, and a `playtest` flavor that keeps the Developer section in a TestFlight build.
- CI: the web workflow lints, typechecks, tests and exports every app in `apps/` and publishes the preview at `/apps/<slug>/`; the site page has an Apps section; a reloaded screen inside a preview comes back through the site's `404.html`.
- Privacy policy and support pages for the apps on the site (`/apps/privacy/`, `/apps/support/`), a draft store listing (`store/plainproof/listing.json`) and `tools/store_check.py` rules for apps.
- README with the Expo Go steps; NOTES.md with design, art direction, QA, what needs a phone and the going-live steps.

## In progress

- Waiting for the owner's first run on the iPhone from TestFlight, and his list of what is wrong. The work is in the owner's Plainproof conversation (STUDIO.md, block log): the daily backstop leaves this app alone.

## Next (after the owner's feedback, which comes first)

0. The owner's verdict on the drawer and the cabinets on his phone: how flipping through the folders feels under a finger, and the tick, are the things the browser run can't judge.
1. Whatever the owner finds on the phone. Everything native has only run in a browser so far (list below).
2. Done 2026-11-11: the first real `testflight` run. The first try (under the old id) built and archived, then stopped at "Error Downloading App Information" because the app had no identifier or app record with Apple; with both in place the next run signed and uploaded with no change to `tools/ios_app_build.sh`. A new build for the phone is one run of the workflow: app `plainproof`, mode `testflight`, flavor `playtest`.
3. Polish left from the two reviews: drag to reorder rooms (needs a gesture library); page numbers in the iPhone's PDF; whether backup lives on the Report tab or in Settings (the owner's call). NOTES.md, "Known gaps".
4. App Store screenshots from the browser run once the look is settled, with believable made-up names and the web-only note and Developer section hidden.

## Not yet tried on a real iPhone

Everything native (camera, photo library, PDF creation, share sheet, date picker, haptics, file storage, the system tab bar and its icons, the splash screen) is written against the SDK 58 type definitions, compiles into the iPhone bundle and links into a native app on GitHub's Mac, but has only been exercised through the web build. The owner's first Expo Go run is the first real-device test.
