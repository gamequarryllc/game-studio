# Plainpins: a map of everywhere you have been

Put a pin on a place you have visited, then add the photos, the day, who came along and what you did. Zoom out and it all sits on a globe. No account and no server: everything stays on the phone.

"Plainpins" is a working name; the owner has not chosen one (ideas are in the listing). The bundle id is `com.gamequarry.plainpins`. The draft store listing is in [`store/plainpins/`](../../store/plainpins/listing.json); the design, the money rules, the feature ideas and QA are in [NOTES.md](NOTES.md), and where the work stands is in [PROGRESS.md](PROGRESS.md).

## Try it in a browser

https://gamequarryllc.github.io/game-studio/apps/plainpins/

Open it on a phone, or in a desktop browser. What you enter stays in that browser. To see it full: Settings, then Developer, then "Sample map".

The preview is a stand-in for the map. On an iPhone the map is Apple Maps, with streets, search, "where I am" and a real globe. The browser draws its own plain globe with coastlines only, cannot search for places or name a town, and adds zoom buttons for a mouse. Photos are picked from the computer's files.

## Install it on an iPhone (TestFlight)

The app is built on GitHub and sent to TestFlight; there is nothing to install on a computer, and it does not use Expo Go.

1. **The key and the four secrets**: already in the repository (the same ones every studio app signs with).
2. **The app record** (the owner, once, about two minutes): App Store Connect > Apps > + > New App: platform iOS, name `Plainpins: Travel Pin Map` (any name will do for testing; alternatives are in the listing), primary language English (U.S.), bundle id `com.gamequarry.plainpins`, SKU `plainpins`. If the bundle id is not in the list yet, register it first at developer.apple.com > Account > Certificates, IDs & Profiles > Identifiers (an App ID, explicit, no extra capabilities).
3. **The build**: commit a change to `testflight-request.json` (raise `request`), or GitHub > Actions > "iOS app build" > Run workflow: app `plainpins`, mode `testflight`, flavor `playtest`. Claude starts these.
4. **On the phone**: when Apple has processed the upload it appears in the TestFlight app.

The `playtest` flavor is the whole app with the Developer section left in (Settings > Developer: "Pretend Pro is bought" and the sample map). The `release` flavor is what goes to the App Store; run `npm run check:release` first. Nothing in the workflow sends an app to App Review.

**What only a real iPhone can show:** the Apple Maps globe and its pins, place search, "where I am" and the location question, the photo picker and camera, the share sheet for a backup, and buying Pro in TestFlight's sandbox.

## Working on it

```bash
npm run lint          # eslint
npm run typecheck     # tsc
npm test              # unit tests for the logic in src/domain/
npm run check         # all of the above, then the web export and the iPhone bundle
npm run check:release # before an App Store build

# The end-to-end run: uses the web build in a headless browser the way a person
# would, at two phone sizes, light and dark. Needs Playwright with Chromium.
APP_BASE_URL=/game-studio/apps/plainpins npx expo export --platform web
node e2e/run.cjs
node e2e/shots.cjs <folder> light   # a screenshot of every screen
```

## How it is put together

- `src/domain/`: the rules, with no React in them: places, limits, the backup format, the sample map, selectors for the lists and counts.
- `src/state/`: one JSON document saved in the app's folder, and the operations that change it.
- `src/platform/`: the parts that differ between an iPhone and a browser (files, photos, geocoding, the share sheet, the App Store), each as a `.ts` and a `.web.ts` twin.
- `src/ui/`: the theme, the small kit of controls, the drawn sample pictures, and the map (`WorldMap.tsx` is Apple Maps through `expo-maps`; `WorldMap.web.tsx` is the drawn globe).
- `src/app/`: the screens (Expo Router).
