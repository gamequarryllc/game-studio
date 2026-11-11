# Roomfile (home inventory for insurance): notes

App 1 on the studio's app list (STUDIO.md, "Apps"). Slug `home-inventory`, bundle id `com.gamequarry.homeinventory`. "Roomfile" is a working name.

- Preview: https://gamequarryllc.github.io/game-studio/apps/home-inventory/
- On an iPhone: README.md, "Run it on your iPhone".
- Where the work stands: PROGRESS.md.

## What it is

After a fire, a flood or a break-in, an insurer asks for a list of everything, with proof. The app is where that list is kept beforehand: one record per thing (photo, room, category, value, how many, brand, model, serial number, purchase date, shop, price paid, receipt photo, notes), added up by room, and turned into a PDF report and a spreadsheet. Nothing leaves the phone unless the person exports it.

The whole design follows from one fact about the job: people do it once, in an afternoon, then hardly open the app again until the day they need it. So adding a thing has to be quick, the app has to say what is still missing (no photo, no value, no serial number), the report has to look like a document an adjuster will accept, and there must be a backup that does not depend on the phone surviving.

## Art direction

**The idea:** a household file kept in a drawer. Warm paper, one manila folder, ledger-green ink, and a bookish serif for the numbers that matter.

**Palette** (`src/ui/theme.ts`; light / dark):

| Swatch | Light | Dark | Used for |
|---|---|---|---|
| Paper | `#F5F1E8` | `#121110` | The page behind everything |
| Card | `#FFFFFF` | `#1D1B18` | Lists and forms |
| Ink | `#1C1B18` | `#F1EDE4` | Text; `ink2` and `ink3` are its two quieter steps |
| Ledger green | `#1E5B48` | `#74C7A7` | Actions, and the figures that add up |
| Manila | `#EDDCB1` | `#45381C` | The folder, and nothing else |
| Amber | `#9A5B13` | `#E3A85C` | A gap worth filling in (no photo, no value) |
| Red | `#B3261E` | `#F2685E` | Deleting |

**Type:** Newsreader (SIL Open Font License; the licence ships in `@expo-google-fonts/newsreader`) for titles and totals only. Everything else is the system font at the iOS text-style sizes, so Dynamic Type scales it. Figures use tabular numerals.

**The motif:** the folder with a slanted tab at the top of the Rooms tab, labelled with the name of the home. It appears in exactly two places: there, and as a marked example on the welcome screen. The icon is the same idea reduced to one shape: a folder whose tab is a roof.

**Where the look comes from** (none of them apps): manila file folders and their index tabs; bank passbooks and ledger paper; the object labels in a museum case, with their small serif titles and plain facts.

**House rules that keep it from looking generated:**

- One uppercase label in the whole app: the folder's tab. No eyebrow above headlines.
- No lists of three icons in tinted squares. If a screen needs to explain the app, it shows the app (the example folder).
- Sentence case, no exclamation marks, and say a thing once ("No results for ..." rather than a title and a body that repeat each other).
- Amber means "worth filling in" and nothing else. A room whose things have no value says so in amber instead of showing "$0".
- The add button beside a large title is a quiet toolbar circle, not a filled floating button.
- One wording for a missing value everywhere, including the PDF: "No value".

## Money

- **Free:** the first 25 items, with every feature. Nothing already added is ever locked: at the limit, editing, the report and backups all keep working, and only adding stops.
- **Roomfile Pro:** one payment, $5.99 (draft), removes the limit. Non-consumable `com.gamequarry.homeinventory.pro`, RevenueCat entitlement `home_inventory_pro`. No subscription, no ads.
- **Why these numbers** (research/market.md, "Home inventory", 2026-11-11): the pay-once apps in this category sit at $5.99 and $6.99, one of them with the same 25-item free tier; the subscription apps charge about $35 to $80 a year, and recurring fees for a set-it-up-once tool are the complaint that comes up most in their reviews. 25 items is enough to see the whole app work on one room and not enough to finish a home.
- **Store name:** "Roomfile: Home Inventory", subtitle "Belongings list for insurance" (`store/home-inventory/listing.json`). **The name has not been checked against the App Store**: its search could not be reached from the workspace. App Store Connect says whether it is free when the app record is created; three alternatives are in the listing.
- **Privacy label:** the app list was planned as "Data Not Collected". RevenueCat's own guide says an app that uses it must declare Purchase History, because RevenueCat keeps the purchase record. The honest draft is "Data not linked to you: Purchases", everything else not collected (`privacy_label` in the listing). The owner decides, and should give this app whatever the reference app's listing already declares.

## Going live: the owner's steps

Nothing here is done by Claude: Apple and RevenueCat only let the account holder do it. The Paid Apps agreement and the `SUPPORT_EMAIL` variable are shared with the games (store/README.md).

1. **Bundle id and app record.** Register `com.gamequarry.homeinventory` (developer.apple.com, Identifiers) and create the app in App Store Connect with the name from the listing. If Apple says the name is taken, try the alternatives in the listing.
2. **The purchase.** App Store Connect, the app, Monetization, In-App Purchases: one Non-Consumable, product id `com.gamequarry.homeinventory.pro`, $5.99, display name "Roomfile Pro".
3. **RevenueCat.** A project for the app with an App Store app for the bundle id; import the product; an entitlement named exactly `home_inventory_pro` with the product attached; and a current offering whose Lifetime package is that product (the app reads the current offering to find the product and its local price).
4. **The key.** Give Claude the public App Store SDK key (it starts with `appl_`; it ships inside the app and is not a secret). It goes in `src/pro/config.ts`. Never a secret key.
5. **A build.** Real purchases can't run in Expo Go: they need a development build or a TestFlight build, made with EAS (`npx eas-cli@latest build --platform ios`; it asks to sign in to an Expo account and the Apple developer account the first time). The exact steps are in Expo's own guide, https://docs.expo.dev/eas/index.md, which could not be read from the workspace, so follow the guide rather than this line. `npm run check:release` must pass first.
6. **The listing.** Paste the text, the two links and the privacy answers from `store/home-inventory/listing.json`. Read the privacy policy once before submitting: https://gamequarryllc.github.io/game-studio/apps/privacy/

## What needs a phone, and what needs more than Expo Go

**Works in Expo Go (by design; none of it has run on a real phone yet):** the camera and photo library (`expo-image-picker`), resizing photos (`expo-image-manipulator`), the PDF (`expo-print`), the share sheet (`expo-sharing`), picking a backup file (`expo-document-picker`), the date picker, SF Symbols (`expo-symbols`), haptics, the system tab bar (`expo-router/native-tabs`), file storage (`expo-file-system`).

**Needs a development or TestFlight build:** buying and restoring Pro (`react-native-purchases`). The module is only loaded when a store key is set, so Expo Go never touches it. Until then the Pro screen's button explains that purchases are off in this build, and "Pretend Pro is bought" in Settings shows the unlocked app.

**Different on the web preview:** no PDF and no share sheet (the report opens in a new tab and files download; a note under the Report buttons says so, on the web only), Material symbols stand in for SF Symbols, the browser's date field stands in for the iPhone's, and the tab bar, action sheets and alerts are drawn to match the system's. Each of these sits behind a `.web.ts` or `.web.tsx` twin.

## QA

**Unit tests** (`npm test`, 75): the document parser and its repairs, rooms and items, totals, gaps, search, filters and sorting, money parsing and formatting, dates, the report's contents and escaping, the spreadsheet, the backup file round trip, the free limit, and one test for every bug below.

**The browser run** (`node e2e/run.cjs`, 20 steps, about 75 seconds): a fresh install through the welcome screens; the empty states; a form that refuses an empty name and bad amounts; an item with every field, a photo and a receipt; editing, the largest amount the app holds, cancel asking before it discards; a very long name; rooms added, renamed, reordered, given a new symbol and deleted with and without moving their things; search, the three filters, sorting; deleting an item; the report (every item, photo and receipt present), the spreadsheet, the backup; a reload and deep links; erase everything; a restore, including a file that is not a backup; the free limit at exactly 25 and Pro on and off; the 48-item sample home and a currency change; a 650-item home (the Items tab and the report each open in under half a second); then dark mode, a small phone and a large phone, each restoring the backup and visiting every main screen. It fails on any console error or anything wider than the screen.

**Bugs found by looking at the screenshots, each now a test:**

| Bug | Fix | Test |
|---|---|---|
| The last letter of the folder's label was half hidden under the slanted edge | More room after the label | Browser run: the label ends before the edge begins |
| A very large total ended in an ellipsis | The figure steps down in size (`figureSize`) | Unit test, and the browser run checks nothing is cut off |
| In the PDF, Each and Total touched, and the columns shifted from room to room | Fixed columns, the two money columns sized from the longest amount | Unit tests on the column group |
| On a small phone the example's "Photographed" ran into "31 of 37" and wrapped | The two meters stack when they would collide (`fitSideBySide`), also with long counts or large text | Unit tests, and the browser run measures both meters at every size |
| The web preview's tab bar let the list show through | It blurs what is under it, as the iPhone's does | Seen in the screenshots |

**Critic review 1 (2026-11-11): almost.** "This doesn't look generated. The copy is careful and the folder card has a real idea behind it. What's holding it back is a set of template habits plus some leftover build text." What was done with each finding:

1. *Build text inside the product.* The Pro screen no longer shows a notice or a dead-looking button: the button is live and, in a build with no store key, tapping it explains why nothing can be bought. The note under the Report buttons stays, on the web preview only (the ready-to-test bar asks for it).
2. *A Developer section in Settings.* Kept, as asked for by the owner, and only in test builds and the web preview. "Erase everything" moved out of it into a "Your data" section that every build has.
3. *The Pro screen's empty middle and washed-out button.* The button now sits 32 points under what it buys, in full green, with a plain Restore button under it.
4. *Item names cut off in the Items list.* Two lines.
5. *A filled green floating button for adding.* A quiet toolbar circle with a green plus.
6. *Arrows on the quantity control, no currency on the value.* A minus and plus stepper; the currency code after the amount ("1,899 USD").
7. *Stock onboarding and Pro pattern, eyebrows everywhere.* The welcome screen shows an example folder instead of three icon rows; the eyebrows on the welcome and Pro screens are gone (the app's name is a small serif wordmark; Pro's is the bar title).
8. *"$0" for a room whose things have no value, and "$0" under "Nothing filed yet".* The room says "1 item · no value yet" in amber; an empty home shows no figure.
9. *"What should happen to them?" for one item; "Move up the list".* "it" for one thing; "Move up" and "Move down". Dragging rooms to reorder is polish work (below).
10. *A lone letter on a second line.* Titles avoid a single short word on the last line (`lineBreakStrategyIOS="push-out"` on the phone, `text-wrap: pretty` on the web).
11. *"No matches / Nothing matches".* "No results for "zzzz"" and a hint.
12. *The PDF: no page foot, "Not valued", a floating Items column.* A foot with the home's name, the date and "Page 1 of 3" (drawn by the web preview; see the gap below); "No value" everywhere; Items sits beside Value.
13. *A clip-art icon.* Redrawn flat as one shape: a folder whose tab is a roof.

The critic also asked for the dark folder to be less muddy: it is a little warmer now.

## Known gaps and polish work

- **Nothing has run on a real iPhone.** The first Expo Go run is the real test of the camera, the PDF, the share sheet, the date picker, the tab bar and the splash screen. Expect a few fixes.
- **Page numbers in the iPhone's PDF.** The foot is written as page-margin text, which the web preview prints and WebKit (which makes the PDF on the phone) has not supported. If it is missing on the phone, the fix is a native header and footer, or laying the pages out by hand.
- **Review 1's fixes have not been seen by a critic.** A second pass on fresh screenshots is the next block's job, after the owner's feedback.
- **Reordering rooms** is "Move up" and "Move down" in the room's menu. Dragging in the Rooms list would be better.
- **The web preview's note and the Developer section** show in App Store-style screenshots taken from the browser run. Store screenshots must be shot with both hidden.
- **VoiceOver** labels are on the controls but have not been listened to on a phone.
- **iPad** is off (`supportsTablet: false`): the layout is a phone's.
- **App Store name** not checked (see "Money").
