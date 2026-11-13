# Plainlimit: progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Status: the daily loop works on the owner's iPhone (2026-11-13). Not yet ready for the App Store

Seen working on a real phone over three days of TestFlight builds (15 to 40), details in NOTES.md: counting against the phone's own Screen Time, cells draining, the "Last cell" screen, the empty screen, sums that earn time by the clock, the apps covered again on the minute by the phone itself, the recharge at the start of the next day, settings locked while empty, the widget, and the "What used it" list.

Known faults: the widget runs about a minute behind (the phone's own scheduling, as far as can be told); a video already playing keeps playing under a covering screen; when iOS 26 reports checkpoints too early the app now refuses to lock (build 42) but does not yet tell the owner the day is going uncounted.

Fixed since: the dead zone over "What used it" (build 41).

Decided 2026-11-13: the notification stays as the way from the empty screen to the sums (Apple allows nothing more direct; answering sums on the covering screen itself was offered and declined for now).

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

1. **Done 2026-11-13:** finer minutes, the "Not counting" warning, quitting made visible (build 45); the week view and first-run setup (build 46). Setup can only be seen on a fresh install (or the second phone).
2. A fresh-eyes critic on the screenshots, and its findings fixed.
3. Pro: the owner suggested "What used it" as the paid part; the week view fits beside it. Then RevenueCat and the store listing in `store/plainlimit/`.
4. Privacy and support sections on the studio's app pages; the review notes Apple needs for a Screen Time app.
5. A release build (no test tools) for the owner's last look, then he submits.
