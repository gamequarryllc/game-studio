# Roomfile: a home inventory for insurance

Photograph what you own, note the serial number and what it would cost to replace, room by room, and keep a PDF report ready for an insurer. No account and no server: everything stays on the phone.

"Roomfile" is a working name. The draft store listing is in [`store/home-inventory/`](../../store/home-inventory/listing.json); design notes, QA and what is left are in [NOTES.md](NOTES.md) and [PROGRESS.md](PROGRESS.md).

## Try it in a browser

https://gamequarryllc.github.io/game-studio/apps/home-inventory/

Open it on a phone, or in a desktop browser (it keeps the proportions of a phone). What you enter stays in that browser. To see it full: Settings, then "Load the sample home". The web preview can't make a PDF or open the share sheet, so the report opens in a new tab and files download instead.

## Run it on your iPhone

This uses Expo Go, so no Apple developer setup is needed.

1. On the iPhone, install **Expo Go** from the App Store.
2. On a computer with [Node](https://nodejs.org) 22.13 or newer, on the same Wi-Fi as the phone:

   ```bash
   git clone https://github.com/gamequarryllc/game-studio.git
   cd game-studio/apps/home-inventory
   npm install
   npx expo start
   ```

3. Point the iPhone's Camera at the QR code in the terminal and tap the banner. The app opens in Expo Go.
4. If the phone can't reach the computer (guest Wi-Fi, a work network), stop it and run `npx expo start --tunnel` instead.

Changes to the code show on the phone as soon as a file is saved. Shake the phone for the developer menu (Reload is there).

**In Expo Go, everything works except buying Pro.** The camera, the photo library, the PDF report, the spreadsheet, backup and restore through the share sheet, and dark mode are all real. Purchases are switched off until the store key is added (`src/pro/config.ts`), and real purchases need a TestFlight or development build in any case. To see the app with Pro: Settings, Developer, "Pretend Pro is bought". The Developer section (pretend Pro, the sample homes, erase everything) only exists in test builds and the web preview.

The app is built with Expo SDK 58. If Expo Go says the project needs a different SDK, update Expo Go from the App Store.

## Working on it

```bash
npm run lint          # eslint
npm run typecheck     # tsc
npm test              # unit tests for the logic in src/domain/
npm run check         # all of the above, then the web export and the iPhone bundle
npm run check:release # before an App Store build: is the store key in?

# The end-to-end run: uses the web build in a headless browser the way a
# person would, at three phone sizes and in dark mode, and saves a screenshot
# of every screen. Needs Playwright with Chromium.
APP_BASE_URL=/game-studio/apps/home-inventory npx expo export --platform web
SHOTS_DIR=/tmp/roomfile-shots node e2e/run.cjs
```

Add packages with `npx expo install <package>` so the version matches the SDK. Read [AGENTS.md](AGENTS.md) before touching any Expo API.

## How it is put together

| Folder | What is in it |
|---|---|
| `src/app/` | The screens (Expo Router): the four tabs, a room, an item, the add and edit form, the photo viewer, Pro, the welcome screens |
| `src/domain/` | The logic, with no React in it and unit tests beside it: the inventory document and its repair-on-load parser, totals and gaps, search and sort, money and dates, the report, the spreadsheet, the backup file, the free limit |
| `src/state/` | The one in-memory copy of the inventory and the operations that save it |
| `src/platform/` | Everything that touches the device (files, photos, the share sheet, haptics), each with a `.web.ts` twin for the preview |
| `src/pro/` | The Pro unlock: RevenueCat behind a small adapter, kept in its own file apart from the inventory, so a backup never carries a purchase |
| `src/ui/` | The theme and the handful of pieces every screen is built from |
| `e2e/` | The end-to-end browser run and its fixture photos |
| `art/` | The icon and splash mark as SVG (the PNGs in `assets/images/` are rendered from these) |

## Before it can go on the App Store

The owner's steps (an app record, the in-app purchase, the RevenueCat key) are listed in [NOTES.md](NOTES.md) under "Going live". Nothing here submits anything.
