# Plainlimit: notes

Slug `plainlimit`, bundle id `com.gamequarry.plainlimit`. Until 2026-11-11 the working name was "Screen Battery" and the folder was `apps/screen-battery/`.

## The idea (the owner's, 2026-11-11)

A visual warning that you are nearing your screen-time goal, read at a glance from the home screen by someone who would rather not open their phone. The owner chose a battery over a number: six cells that empty through the day and a colour that goes from green to red. It has to stay simple.

## What the owner signed off

1. **Setup:** one daily goal (3 hours by default) and a recharge time (6:00 AM by default). The battery's day runs from recharge to recharge, not midnight to midnight, so running out at night means staying empty until morning.
2. **The widget:** six cells, each one sixth of the goal. Colour fades green, to yellow, to red. Words instead of live numbers ("Plenty left", "Half gone", "Getting low", "Nearly out", "Empty"), with the goal as a fixed label. Small and medium for the home screen, and one without colour for the lock screen.
3. **What counts:** everything (the default), a "time-wasters" preset (Social, Games, Entertainment), or the person's own picks (Pro).
4. **Always-allowed apps:** Phone, Messages and Maps by default. They never lock.
5. **As it runs low:** one notification on the last cell; a warning screen over apps on the last cell and again shortly before the end, which can be tapped through.
6. **When it is empty,** one setting with three levels: Warn (red screen, tap through), Work for it (solve sums for more time; the default), Locked (nothing opens until the recharge except the always-allowed apps).
7. **Sums:** three for 15 minutes, then five for 10, then seven for 5. The battery stays empty; only the lock lifts.
8. **Money:** the whole core free; one pay-once Pro for the person's own picks of what counts. Not built yet.

**Pinned for later, not in this build:** earning time back with steps (Pro); groups of people who also have the app, holding each other to it (Pro, and only if Apple's rules allow a "past the goal today" flag to leave the phone). **Dropped:** texting someone as the price of more time.

## Why words and cells, not minutes

An app is never told how many minutes have been used. It can only ask the phone to speak up when a total is reached, and a widget is redrawn when the system chooses, a few dozen times a day at most. A live minute counter would visibly lag. Six cells need six updates a day, and a word like "Getting low" stays true for half an hour, so nothing on the home screen is ever caught being late.

## Look

The owner's note on the first build (2026-11-11): a good baseline, but dull. The second pass:

- **Today is the battery's colour, edge to edge.** The top of the screen is a field of the day's colour with a large battery, the word at the largest size the phone allows on one line, and the recharge time with a live "in 12 h 13 min". The rest of the app stays on one dark ground (`#0E1011`), so that colour is the only colour on any screen. No light version.
- **The colour marks what is chosen everywhere else:** the open tab, the chosen level, the goal's figures, the filled part of the day's ruler, finished sums. The deep red of an empty battery is too dark to read on the dark ground, so there it gives way to a lighter red (`accentOnDark` in `src/domain/tone.ts`, held to 4.5 to 1 by a test).
- **The battery is drawn like a sticker:** a thick casing, a hard shadow under it, a short glint on each lit cell. One drawing (`src/ui/Battery.tsx`) at every size; the icon is the same battery (`art/make_icons.py`).
- **Movement:** a used-up cell fades and shrinks away, the colour eases to the next one over half a second, and the last cell left breathes slowly. All of it stands still when the phone is set to reduce motion (`src/ui/motion.ts`).
- **The day's ruler** under "Used so far": six stretches, one per cell, filling as the battery empties.
- Space Grotesk for the word, titles and figures, set large and tight; the system font for everything else.
- The colour of the day is worked out in OKLCH and turned into hex, and a test holds every point of the day to a text contrast of 4.5 to 1.
- The cells and the word carry the meaning as well as the colour, so it reads without colour vision.
- The screens that cover an app keep to what an iPhone allows there: a picture, a title, one line, two buttons. Once the battery is empty the main button is always "Close this app"; the way through is the smaller one.
- Sentence case, no exclamation marks, one uppercase label style (the small group labels and the goal chip).

## What is real and what is pretend

| Part | In a browser or Expo Go | In an iPhone build with Screen Time on |
|---|---|---|
| Goal, recharge time, levels | Real, saved on the phone | The same, and handed to the phone as the day's plan |
| Battery cells, colour, words | Real logic, fed by pretend use | Fed by the checkpoints the phone reports |
| Minutes used | Pretend: added by hand under Developer | A floor: the largest checkpoint reached ("At least 1h 30m") |
| Per-app times on Today | Not built | Not built (needs Apple's report extension; not in version one) |
| Always-allowed list | Names typed in | Apple's app picker; the app only learns how many are ticked |
| What counts | Everything or the preset, saved | Everything, or whatever is ticked in Apple's picker |
| Warning and empty screens | Previews opened from Developer | Drawn by the phone over other apps |
| Sums | Real | The same, reached from a notification |
| Home screen and lock screen widgets | Not there | Native, in Swift (`targets/widget/`) |
| The lock | Not there | Apple's Screen Time |
| Pro | Not built | Not built |

The Developer section (pretend use, recharge now, the two previews) shows in test builds and the web preview, never in a store build, and it hides once real Screen Time is on (`DEV_TOOLS` in `src/platform/screenTime.ts`).

## How the iPhone side is put together

**Written 2026-11-11 and compiled on the studio's Mac runners. Not one line of it has run on a real iPhone yet.** Everything below is how it is meant to work; "To check on the phone" further down is the list of what has to be seen with eyes.

- **The library.** `react-native-device-activity` 0.6.1 gives the app Screen Time permission, Apple's app picker, monitoring, and three extensions (monitor, shield action, shield configuration) that it drives from settings the app writes into the shared App Group. The app writes no Swift for those.
- **`plugins/withTargets.js`** runs on every `expo prebuild`: it copies the library's three extensions into `targets/` (not kept in git), gives the monitor the bundle id registered with Apple, adds three lines to the monitor so it redraws the widget, and removes the push-notification entitlement that the notifications package adds by default.
- **`targets/widget/`** is ours: the six-cell battery for the home screen (small, medium) and the lock screen. It reads the goal and recharge time the app left in the App Group (`plainlimit_plan`) and the times the monitor recorded for each checkpoint, and applies the same rules as the app: a checkpoint counts if it came after the last recharge and not impossibly early. A test (`monitorPlan.test.ts`) keeps its colours, words and names equal to the app's.
- **`modules/plainlimit-widgets/`** is a ten-line native module so the app can ask for a widget redraw after a setting changes.
- **`src/domain/monitorPlan.ts`** turns the settings into the day's plan as plain data. **`src/platform/screenTime.ts`** is the only file that hands it to the library.

The day's plan:

| When | What the phone does |
|---|---|
| Each cell used up (`cell-1` to `cell-5`) | Records the time; the widget redraws |
| Last cell begins (`cell-5`) | Covers the counted apps with the "Last cell" screen. "Keep going" takes it away |
| A few minutes before the end (`final-warning`) | A "Nearly out" notification |
| Goal reached (`empty`) | Covers the counted apps with the empty screen for the chosen level |
| A minute before the recharge time | Takes every covering screen away |

What the empty screen's second button does: Warn takes the screen away for the rest of the day; Work for it sends a notification that opens the sums (a covering screen cannot open an app directly); Locked has no second button. After the sums are solved the app uncovers the apps and asks the phone to cover them again after that many more minutes of use.

Decisions made while writing it, each of which the owner can change:

1. **iOS 18 or later.** The library's extensions are built for 18; an app that installed on older phones but could not count there would be worse than not installing.
2. **"Everything" counts every app, the always-allowed ones too.** Apple's counting has no "everything except". The always-allowed apps are only spared from being covered.
3. **"Time-wasters" on a phone is whatever is ticked in Apple's picker.** An app cannot pre-tick Social, Games and Entertainment; the screen asks the person to. So on a phone, Time-wasters and "your own picks" are the same thing, and there is nothing left for Pro to unlock there. Pro needs a different hook (ideas: the lock screen widget, more than one top-up a day, the pinned steps and groups).
4. **Settings lock while the battery is empty** (on a real phone only). Otherwise the way round an empty battery is to nudge the goal up.
5. **The first day counts from the recharge time, not from setup.** The phone is asked to include the day's earlier use, so the battery can be part-drained the moment Screen Time is turned on.

## What is still needed

1. **A signed build on the owner's phone, by TestFlight.** Everything it needs from Apple is in place as of 2026-11-11: Family Controls (Distribution) is on for the app and its three extensions, and the app record "Plainlimit" exists in App Store Connect. What is left is the studio's "iOS app build" in testflight mode working for an app with extensions. `tools/ios_app_build.sh` archives such an app "signed to run locally" so the entitlements survive, then signs for the App Store while exporting; that path has not succeeded yet. If it cannot be made to work, the fallback is its signed-archive route, which needs one iPhone registered under Devices in Apple's developer portal (there are none today).
2. **Trying it on the phone** ("To check on the phone", below), and fixing what that finds.
3. First-run setup, a critic pass, Pro, the store listing, privacy and support sections (PROGRESS.md).

## Known limits and risks

- **Checkpoints that arrive far too early.** On recent iOS versions the phone has reported limits as reached moments after they were set. `isPlausible` in `src/domain/checkpoints.ts` throws away a checkpoint that arrives sooner than its own minutes after the recharge. It cannot catch one that is early but possible (90 minutes reported after two hours of wall time), and it needs testing against a real phone.
- **The empty screen's button cannot open this app.** Apple gives no supported way. The supported route is a notification the person taps, so "I need more time" is two taps: the button, then the notification. Unofficial ways round it have been rejected in review.
- **"Everything counts" and always-allowed apps.** Apple has "block everything except these" for the lock but not for counting, so in the Everything mode time in Phone or Messages still drains the battery, though those apps never lock. The preset and the person's own picks avoid it. The What counts screen says so.
- **Block-everything-except has had bugs** where the exceptions were blocked too. Because the list is for emergencies, it must be tried on a real phone before anyone relies on it.
- **Widget updates are a request, not a command.** A cell can go dark a few minutes late. Six cells make that invisible; a finer colour fade between cells is a bonus if it proves reliable.
- **A second device.** Screen Time shared across devices is not handled; one iPhone only.

- **An early checkpoint can still cover apps.** The plausibility check protects what the app and the widget show. The covering itself is done by the phone the moment it reports a checkpoint, early or not. If the phone turns out to report them early, the cover actions need a guard of their own.
- **Counting "everything" rests on an assumption:** that a checkpoint registered with no apps, categories or sites counts all use of the phone. If it does not, "Everything" has to become "tick every category in Apple's picker".
- **Changing a setting re-registers the day.** The phone is asked to keep the day's count when that happens (iOS 17.4 and later can), and checkpoints already passed should simply be reported again. Unverified.

## To check on the phone (nothing here has been tried)

In order; each one that fails changes the code, not just a setting.

1. The app installs and opens, and Settings shows the Screen Time card.
2. "Turn on Screen Time" brings up Apple's sheet; allowing it turns the card to "On".
3. The widget can be added (small, medium, lock screen) and shows a battery, not "Open Plainlimit to set up".
4. With a 30-minute goal (the smallest), use the phone: a cell goes dark about every five minutes, on the widget without opening the app, and in the app.
5. On the last cell the "Last cell" screen covers apps; "Keep going" removes it.
6. At the goal the empty screen appears with the right buttons for the level. Phone and Messages (ticked under Always allowed) still open.
7. Work for it: "I need more time" sends a notification; tapping it opens the sums; solving them uncovers the apps; they are covered again after the earned minutes.
8. At the recharge time everything uncovers and the widget is full, without the app being opened.
9. Changing the goal mid-day keeps the day's use.
10. Time-wasters: ticking a few apps in Apple's picker makes only those drain the battery and only those get covered.
11. No screen appears impossibly early (see "Known limits").

## QA (2026-11-11)

- 36 unit tests: cells for goals that do and do not divide by six, the colour and its contrast at every point of the day, the recharge clock across midnight, a month end and a clock change, checkpoints and the early-arrival check, sums (always two digits with a carry, repeatable from a seed), top-ups that shrink and never run past the recharge, settings limits, reading back a damaged saved copy, and the wording of the warning and empty screens at each level.
- The browser run (`e2e/run.cjs`, 16 steps, no console errors): fresh start; the goal and recharge steppers to their limits; what counts; removing and adding always-allowed apps including a duplicate, an empty name and an over-long one; draining cell by cell; the warning screen; the empty screen at all three levels; a wrong answer, letters and an empty answer on the sums; earning 15 minutes then 10; reload; far past the goal; recharge; the sums refused while there is charge; a reloaded inner page and an unknown page; a 320 pt phone.
- Bugs found by looking at the screenshots, each now a test: the recharge stepper ran out of its card on a 320 pt phone (it drops to its own line); the three choices did not tell a screen reader which was chosen in the browser.
- After the second look pass: 38 unit tests (the accent on the dark ground, the countdown wording), the same 16 browser steps clean, screenshots taken once the movement has settled. One bug from the screenshots: the battery's casing changed colour at once while the ground behind it eased, so the two disagreed for half a second (the casing now eases with it).
- Not done yet: a fresh-eyes critic on the screenshots; anything on a real iPhone.

## Registered with Apple

Done in the owner's developer account on 2026-11-11, by the owner's conversation:

| Identifier | For | Capabilities switched on |
|---|---|---|
| `com.gamequarry.plainlimit` | the app | App Groups, Family Controls (Development and Distribution), In-App Purchase |
| `com.gamequarry.plainlimit.ActivityMonitor` | the monitor extension | App Groups, Family Controls (Development and Distribution) |
| `com.gamequarry.plainlimit.ShieldAction` | buttons on the screens over apps | App Groups, Family Controls (Development and Distribution) |
| `com.gamequarry.plainlimit.ShieldConfiguration` | the look of the screens over apps | App Groups, Family Controls (Development and Distribution) |
| `com.gamequarry.plainlimit.widget` | the home screen widget | App Groups |
| `group.com.gamequarry.plainlimit` | the App Group all five share | (assigned to all five) |

The app record "Plainlimit" (iOS, English (U.S.), SKU `plainlimit`) was created in App Store Connect the same day, which also holds the name.

The three extension names are the ones `react-native-device-activity` expects; the widget's is ours.

- **Family Controls (Development)** needs no approval and is enough for a development build on the owner's own iPhone.
- **Family Controls (Distribution)** was requested the same day, showed as "Assigned" under Capability Requests within hours, and is now ticked on the first four identifiers (the widget does not need it).
- Apple's list also has a newer "Family Controls App and Website Usage" capability. Nobody has looked at what it is for; it is off.

## Name

The owner chose **Plainlimit** on 2026-11-11, as a sibling to Plainworth ("Plain" plus the thing the app is about). The folder, the URL scheme and the bundle id were renamed to `plainlimit` the same day, before anything was registered with Apple.

Draft for the store fields, not final:

- Name (30): `Plainlimit Screen Time Battery` (30 exactly; with a colon it is 31, one too long). Fallback: `Plainlimit: Screen Time Widget` (30).
- Subtitle (30): `Scroll less, see your day left` (30).
- Words for the hidden keyword field, none repeated from the two above: reduce, phone, usage, blocker, focus, detox, doomscroll, habit, lock.
- "Drained" stays as the word for the empty battery in the app and in the screenshots.

A web search on 2026-11-11 found no app called Plainlimit. Nearby names on the App Store: several apps called "Limit", and a screen-time app once called "Plain Mode". That was a search, not a trademark check.
