# Plainlimit: progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Status: building. The iPhone side is written and compiles; none of it has run on a real iPhone (2026-11-11)

The web preview and Expo Go still run on pretend use and are unchanged. A build with the Screen Time pieces needs signing; Apple's side of that is ready and the studio's build has to do the rest (step 1 below).

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

- The iPhone side: the Screen Time library and its three extensions, the widget in Swift (small, medium, lock screen), the day's plan as tested plain data, permission, Apple's app picker for What counts and Always allowed, the covering screens and their buttons, earned extra time, the notifications, and settings that lock while the battery is empty (NOTES.md, "How the iPhone side is put together").
- The app's identifiers and App Group are registered with Apple.

## Next, in order

1. **A TestFlight build.** Apple's side is ready: Family Controls (Distribution) is on for the app and its extensions, and the app record exists. The studio's iPhone build has to get an app with extensions through signing (NOTES.md, "What is still needed").
2. **On the owner's phone:** the eleven checks in NOTES.md, "To check on the phone", and fixing what they find.
3. First-run setup: pick a goal and a recharge time, then the Screen Time permission and the widget.
4. A fresh-eyes critic on the screenshots, and its findings fixed.
5. Pro: it needs a new hook now that "your own picks" cannot be held back on a phone (NOTES.md, decision 3), then RevenueCat and the store listing in `store/plainlimit/`.
6. Privacy and support sections on the studio's app pages.

## Not yet tried on a real iPhone

Everything. The app's screens have only run in a browser. The Screen Time code and the widget compile on the studio's Mac runners and have never been run. NOTES.md, "To check on the phone", is the list.
