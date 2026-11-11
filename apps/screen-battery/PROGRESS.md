# Plainlimit: progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Status: building (first build, 2026-11-11)

Built in the owner's conversation. The studio's two engines leave this folder alone (STUDIO.md, "Apps").

**Checks right now:** lint clean, typecheck clean, 38 unit tests pass, the web export and the iPhone bundle build, the browser run (`node e2e/run.cjs`, 16 steps) passes with no console errors. The unsigned iPhone build on GitHub compiles and links (first run, 2026-11-11); it then stopped on the version number, which `app.config.js` now takes from the build.

## Done

- Expo SDK 58 project, Expo Router, TypeScript, on the same versions as the studio's first app.
- Logic in `src/domain/` (pure, unit tested): cells and words, the colour of the day, the recharge clock, checkpoints and the early-arrival check, sums and top-ups, settings and their limits, the saved copy and its repair, the words on the warning and empty screens.
- Storage: one small JSON document on the phone (browser storage in the preview).
- Screens: Today, Settings (goal, recharge time, what counts, always allowed, the three levels), What counts, Always allowed, the sums, and previews of the warning and empty screens.
- Developer tools for the preview: pretend use, recharge now, the two previews.
- Icon, favicon and splash mark drawn by `art/make_icons.py`.
- README, NOTES.md.
- Second look pass after the owner called the first build dull: Today as an edge-to-edge field of the day's colour, the sticker battery, the day's colour as the app's accent, movement, larger type, the day's ruler (NOTES.md, "Look").
- What the studio's iPhone build expects of an app: `app.config.js` reads the version and build number, a privacy manifest in `app.json`, and the Developer section can be kept in a playtest build (`EXPO_PUBLIC_PLAYTEST=1`).

## Next, in order

1. **The owner:** ask Apple for the Family Controls entitlement for `com.gamequarry.screenbattery` (NOTES.md, "What the real thing needs"). Nothing below step 3 can ship without it.
2. A fresh-eyes critic on the screenshots, and its findings fixed.
3. First-run setup: pick a goal and a recharge time, then (on an iPhone) the Screen Time permission.
4. The native pieces, in a development build on the owner's iPhone: the monitor extension and checkpoints, the widget in its three sizes, the screens over apps, the lock, the two notifications, shared storage.
5. Pro: the person's own picks of what counts (RevenueCat, the studio's `src/pro/` plumbing), and the store listing in `store/screen-battery/`.
6. Privacy and support sections on the studio's app pages.

## Not yet tried on a real iPhone

Everything. The app's screens have only run in a browser, and no Screen Time code exists yet.
