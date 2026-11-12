# Plainkeep: a maintenance log for the home and the car

Furnace filters, smoke alarm batteries, oil changes, registrations: Plainkeep remembers when each was last done and reminds you before it comes round again. No account and no server: everything stays on the phone.

It was the list's `upkeep-log`; it is named Plainkeep so the folder, the bundle id (`com.gamequarry.plainkeep`) and the store name agree from the first build. The draft store listing is in [`store/plainkeep/`](../../store/plainkeep/listing.json); the design, the money rules, the feature pass and QA are in [NOTES.md](NOTES.md), and where the work stands is in [PROGRESS.md](PROGRESS.md).

## Try it in a browser

https://gamequarryllc.github.io/game-studio/apps/plainkeep/

Open it on a phone, or in a desktop browser (it keeps the proportions of a phone). What you enter stays in that browser. To see it full: Settings, then "Load the sample household". A browser tab cannot deliver a reminder weeks from now, so the preview only lists what the iPhone would have waiting (Settings > Coming reminders); files download instead of opening the share sheet, and the service record opens in a new tab.

## Install it on an iPhone (TestFlight)

The app is built on GitHub and sent to TestFlight; there is nothing to install on a computer, and it does not use Expo Go.

1. **The key and the four secrets**: already in the repository (the same ones every studio app signs with).
2. **The app record** (the owner, once, about two minutes): App Store Connect > Apps > + > New App: platform iOS, name `Plainkeep: Home & Car Upkeep` (alternatives are in the listing if Apple says it is taken), primary language English (U.S.), bundle id `com.gamequarry.plainkeep`, SKU `plainkeep`. If the bundle id is not in the list yet, register it first at developer.apple.com > Account > Certificates, IDs & Profiles > Identifiers (an App ID, explicit, no extra capabilities).
3. **The build**: GitHub > Actions > "iOS app build" > Run workflow: app `plainkeep`, mode `testflight`, flavor `playtest`. Claude starts these.
4. **On the phone**: when Apple has processed the upload it appears in the TestFlight app. Add the build to the internal group the other apps use so new builds arrive by themselves.

The `playtest` flavor is the whole app with the Developer section left in (Settings > Developer: "Pretend Pro is bought", the sample household). The `release` flavor is what goes to the App Store; the build refuses to upload it until `npm run check:release` passes. Nothing in the workflow sends an app to App Review.

**What only a real iPhone can show:** reminders arriving (the planning is unit-tested and the list in Settings > Coming reminders is what gets scheduled, but delivery is the iPhone's), the notification permission question, the PDF in the share sheet, the system date and time pickers, and buying Pro in TestFlight's sandbox.

## Working on it

```bash
npm run lint          # eslint
npm run typecheck     # tsc
npm test              # unit tests for the logic in src/domain/ (run in a fixed time zone)
npm run check         # all of the above, then the web export and the iPhone bundle
npm run check:release # before an App Store build: does the product id match, is the store built in?

# The end-to-end run: uses the web build in a headless browser the way a
# person would, with the clock fixed, at two phone sizes and in dark mode, and
# saves a screenshot of every screen. Needs Playwright with Chromium.
APP_BASE_URL=/game-studio/apps/plainkeep npx expo export --platform web
SHOTS_DIR=/tmp/plainkeep-shots node e2e/run.cjs
```

In the studio workspace Expo's version service is not reachable: put `EXPO_OFFLINE=1` in front of `npx expo install` and `npx expo export`. Add packages with `npx expo install <package>` so the version matches the SDK. Read [AGENTS.md](AGENTS.md) before touching any Expo API.

## How it is put together

| Folder | What is in it |
|---|---|
| `src/app/` | The screens (Expo Router): the four tabs, a thing, a job, the forms, coming reminders, Pro, welcome |
| `src/domain/` | The logic, with no React in it and unit tests beside it: calendar days, when each job is due (by date, by odometer, fixed dates), the reminder plan, the document and its repair-on-load parser, the backup file, the spreadsheet, the service record, the suggested jobs, the free limit |
| `src/state/` | The one in-memory copy of the log, the operations that save and export it, and the piece that keeps the phone's reminders in step with it |
| `src/platform/` | Everything that touches the device (files, notifications, the share sheet, haptics), each with a `.web.ts` twin for the preview |
| `src/pro/` | The Pro unlock: the App Store's own purchase (StoreKit, through `expo-iap`) behind a small adapter, with no service in between, kept apart from the log so a backup never carries a purchase |
| `src/ui/` | The theme and the handful of pieces every screen is built from: the rule (gauge), the odometer, the job line |
| `e2e/` | The end-to-end browser run |
| `art/` | The icon and launch mark as SVG (the PNGs in `assets/images/` are rendered from these with `rsvg-convert`) |
