# Plainlimit: your screen time as a battery

A six-cell battery for the home screen. It drains as the day's screen time is used, turns from green to red on the way, and recharges at a time you set. No account and no server: everything stays on the phone.

Design notes, what is real and what is still pretend, and what is left are in [NOTES.md](NOTES.md) and [PROGRESS.md](PROGRESS.md).

**Where it stands:** the app's own screens and all of its logic are built and tested. The parts that belong to Apple's Screen Time (reading real use, the home screen widget, the warning and empty screens over other apps, the lock) are not wired in yet. They need Apple's approval and a build made for a real iPhone; NOTES.md has the list. Until then the battery runs on pretend use.

## Try it in a browser

https://gamequarryllc.github.io/game-studio/apps/plainlimit/

Open it on a phone, or in a desktop browser (it keeps the proportions of a phone). To drain the battery: Settings, then the buttons under Developer ("Use 30 more minutes"). The same section opens the warning screen and the empty screen. What you set stays in that browser.

## Run it on your iPhone

This uses Expo Go, so no Apple developer setup is needed.

1. On the iPhone, install **Expo Go** from the App Store.
2. On a computer with [Node](https://nodejs.org) 22.13 or newer, on the same Wi-Fi as the phone:

   ```bash
   git clone https://github.com/gamequarryllc/game-studio.git
   cd game-studio/apps/plainlimit
   npm install
   npx expo start
   ```

3. Point the iPhone's Camera at the QR code in the terminal and tap the banner. The app opens in Expo Go.
4. If the phone can't reach the computer (guest Wi-Fi, a work network), stop it and run `npx expo start --tunnel` instead.

**In Expo Go you get the same thing as the browser preview:** the app's screens, with pretend use. Expo Go cannot touch Screen Time, add a widget to the home screen or cover other apps; no app can without Apple's approval and its own build.

The app is built with Expo SDK 58. If Expo Go says the project needs a different SDK, update Expo Go from the App Store.

## Working on it

```bash
npm run lint          # eslint
npm run typecheck     # tsc
npm test              # unit tests for the logic in src/domain/
npm run check         # all of the above, then the web export and the iPhone bundle

# The end-to-end run: uses the web build in a headless browser the way a
# person would on a phone, and fails on any console error. Needs Playwright.
APP_BASE_URL=/game-studio/apps/plainlimit EXPO_OFFLINE=1 npx expo export --platform web
node e2e/run.cjs

python3 art/make_icons.py   # redraws the icon, favicon and splash mark
```

Where things are:

- `src/domain/`: the logic, with no React in it. The battery and its words, the colour of the day, the recharge clock, the checkpoints asked of the phone, the sums, the words on the warning and empty screens, and how a saved copy is read back.
- `src/state/store.ts`: the one copy of what the app knows.
- `src/platform/`: storage, haptics, and `screenTime.ts`, where Apple's Screen Time plugs in later.
- `src/ui/`: the battery drawing, the screen that covers an app, and the few shared pieces.
- `src/app/`: the screens.
