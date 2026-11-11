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

| Part | Now | On an iPhone, later |
|---|---|---|
| Goal, recharge time, levels, always-allowed list | Real, saved on the phone | The same |
| Battery cells, colour, words | Real logic, fed by pretend use | Fed by the phone's checkpoints |
| Minutes used | Pretend: added by hand under Developer | From Apple's Screen Time |
| Per-app times on Today | A note saying where they will be | Apple's own report view |
| Always-allowed list | Names typed in | Apple's app picker (the app never learns the names) |
| What counts | Everything or the preset, saved | Applied through Apple's picker and categories |
| Warning and empty screens | Previews opened from Developer | Drawn by the phone over other apps |
| Sums | Real | The same, reached from a notification |
| Home screen and lock screen widgets | Not built | Native, in Swift |
| The lock | Not built | Apple's Screen Time |
| Pro | Not built | RevenueCat, like the other apps |

The Developer section (pretend use, recharge now, the two previews) shows in test builds and the web preview, never in a store build (`DEV_TOOLS` in `src/platform/screenTime.ts`).

## What the real thing needs

None of this can be built or tried in Expo Go or a browser, and none of it can be tested in the studio workspace.

1. **Apple's approval (the owner).** Family Controls needs a distribution entitlement that Apple grants on request, per bundle id: the app and each of its extensions. Request it at developer.apple.com/contact/request/family-controls-distribution from the business's developer account. Developers report waits of weeks, so this is worth doing first. A development build on the owner's own iPhone works without it.
2. **A development build.** The Screen Time pieces are native. The plan is `react-native-device-activity` (an Expo config plugin that adds the extensions) plus a WidgetKit widget in Swift; that means `expo prebuild` and a build on a Mac or a Mac build service, then installing on a real iPhone. The simulator does not run Screen Time.
3. **The native pieces:**
   - Screen Time permission, asked once at setup.
   - Apple's app picker for "your own picks" and "always allowed". It hands back tokens, not names.
   - A monitor extension: registers the checkpoints from `src/domain/checkpoints.ts` on a schedule that runs from recharge to recharge, and on each one writes the new state where the widget can read it, redraws the widget, and puts up the warning screen or the lock.
   - The screens over apps (title, line and buttons from `src/domain/shield.ts`) and their button handling.
   - The widget: small, medium and lock screen, drawn from the same cells, words and colours (`src/domain/battery.ts`, `tone.ts`).
   - A notification on the last cell, and one that opens the sums.
   - Shared storage between the app, the extension and the widget (an App Group), replacing `src/platform/storage.ts` for the shared part.

## Known limits and risks

- **Checkpoints that arrive far too early.** On recent iOS versions the phone has reported limits as reached moments after they were set. `isPlausible` in `src/domain/checkpoints.ts` throws away a checkpoint that arrives sooner than its own minutes after the recharge. It cannot catch one that is early but possible (90 minutes reported after two hours of wall time), and it needs testing against a real phone.
- **The empty screen's button cannot open this app.** Apple gives no supported way. The supported route is a notification the person taps, so "I need more time" is two taps: the button, then the notification. Unofficial ways round it have been rejected in review.
- **"Everything counts" and always-allowed apps.** Apple has "block everything except these" for the lock but not for counting, so in the Everything mode time in Phone or Messages still drains the battery, though those apps never lock. The preset and the person's own picks avoid it. The What counts screen says so.
- **Block-everything-except has had bugs** where the exceptions were blocked too. Because the list is for emergencies, it must be tried on a real phone before anyone relies on it.
- **Widget updates are a request, not a command.** A cell can go dark a few minutes late. Six cells make that invisible; a finer colour fade between cells is a bonus if it proves reliable.
- **A second device.** Screen Time shared across devices is not handled; one iPhone only.

## QA (2026-11-11)

- 36 unit tests: cells for goals that do and do not divide by six, the colour and its contrast at every point of the day, the recharge clock across midnight, a month end and a clock change, checkpoints and the early-arrival check, sums (always two digits with a carry, repeatable from a seed), top-ups that shrink and never run past the recharge, settings limits, reading back a damaged saved copy, and the wording of the warning and empty screens at each level.
- The browser run (`e2e/run.cjs`, 16 steps, no console errors): fresh start; the goal and recharge steppers to their limits; what counts; removing and adding always-allowed apps including a duplicate, an empty name and an over-long one; draining cell by cell; the warning screen; the empty screen at all three levels; a wrong answer, letters and an empty answer on the sums; earning 15 minutes then 10; reload; far past the goal; recharge; the sums refused while there is charge; a reloaded inner page and an unknown page; a 320 pt phone.
- Bugs found by looking at the screenshots, each now a test: the recharge stepper ran out of its card on a 320 pt phone (it drops to its own line); the three choices did not tell a screen reader which was chosen in the browser.
- After the second look pass: 38 unit tests (the accent on the dark ground, the countdown wording), the same 16 browser steps clean, screenshots taken once the movement has settled. One bug from the screenshots: the battery's casing changed colour at once while the ground behind it eased, so the two disagreed for half a second (the casing now eases with it).
- Not done yet: a fresh-eyes critic on the screenshots; anything on a real iPhone.

## Name

The owner chose **Plainlimit** on 2026-11-11, as a sibling to Plainworth ("Plain" plus the thing the app is about). The folder, the URL scheme and the bundle id were renamed to `plainlimit` the same day, before anything was registered with Apple.

Draft for the store fields, not final:

- Name (30): `Plainlimit Screen Time Battery` (30 exactly; with a colon it is 31, one too long). Fallback: `Plainlimit: Screen Time Widget` (30).
- Subtitle (30): `Scroll less, see your day left` (30).
- Words for the hidden keyword field, none repeated from the two above: reduce, phone, usage, blocker, focus, detox, doomscroll, habit, lock.
- "Drained" stays as the word for the empty battery in the app and in the screenshots.

A web search on 2026-11-11 found no app called Plainlimit. Nearby names on the App Store: several apps called "Limit", and a screen-time app once called "Plain Mode". That was a search, not a trademark check.
