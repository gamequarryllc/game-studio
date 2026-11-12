# Plainproof (home inventory for insurance): notes

App 1 on the studio's app list (STUDIO.md, "Apps"). Slug `plainproof`, bundle id `com.gamequarry.plainproof`. The owner chose the name **Plainproof** on 2026-11-11, a sibling to Plainworth and Plainlimit ("Plain" plus what the app is for: proof of what you own). It was called Roomfile, with the slug `home-inventory`, until then; the folder, the ids and the text in the app were renamed before anything was registered with Apple.

- Preview: https://gamequarryllc.github.io/game-studio/apps/plainproof/
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
| Manila | `#EDDCB1` | `#2A2620` | The folders (one per room), and nothing else. In dark mode it is a warm brown-grey with a lighter tab (`#37322A`): a dark gold looked dirty |
| Button | `#1E5B48` | `#2F8A62` | Filled buttons, always with white text. The mint above is for links and symbols only |
| Amber | `#9A5B13` | `#E3A85C` | A gap worth filling in (no photo, no value) |
| Red | `#B3261E` | `#F2685E` | Deleting |

**Type:** Newsreader (SIL Open Font License; the licence ships in `@expo-google-fonts/newsreader`) for titles and totals only. Everything else is the system font at the iOS text-style sizes, so Dynamic Type scales it. Figures use tabular numerals.

**The motif: a file cabinet.** A place (a home, an office) is a cabinet, and each of its rooms is a manila folder in the drawer. That is the owner's idea, from his first evening with the app on his phone (2026-11-11): "high level is file cabinet, and per room level is the folders".

**The drawer** (`src/ui/RoomDeck.tsx`, the Rooms tab): every room's folder is in view at once, a column of manila tabs stepped across in three positions as cut tabs are, each with a symbol in its own label colour, the room's name and how many things are in it. One folder is open and shows what is written on it: its count, its total and a round green button. **Sliding through:** put a finger anywhere on the drawer and slide down, and the opening travels down the column with the finger, one folder for one folder's height of sliding, with a tick under the finger (the selection haptic) for each. Slide up and it goes back; a flick carries on and settles on a folder. Tapping a tab brings the opening to that folder; tapping the open folder goes into the room. The first time the drawer is seen after the app starts, the opening dips to the second folder and back by itself, and a line under the drawer says how it works until it has been used once.

This is the third version, and each came from the owner trying the one before on his phone. The first (build 19) was a list that piled up at the top as it scrolled. The second (build 21) was a deck seen from the front, the front folder tipping away as the next came forward; his screen recording of it showed two or three folders at a time in a small window, text ghosting through as folders crossed, dark folders that were hard to tell apart, and he said it "took me a sec to figure out how to scroll". He asked for more intuitive, cleaner, more folders at once, and unique. So: all the folders at once; the thing that moves is the opening, and it moves the way the finger does; nothing fades through anything else (a folder's writing shows only while it is the open one, and is covered by the next folder as it closes); and in the dark theme the folders are a step lighter than they were, with a clearer top edge.

The whole Rooms tab is laid out to fit one screen with nothing to scroll but the drawer (`FittedTabScreen` in `src/ui/kit.tsx`: a plain view, so no page scroll competes with the slide). The plate above the drawer is short: the place, the total, the count and the three "worth filling in" chips in one row that slides sideways before it wraps; the two meters are gone from this screen. When there are things here and no backup, or something was added or changed since the last one, the first chip says so ("Not backed up", "Backup out of date") and leads to the backup section of the Report tab: an inventory whose only copy is on the phone can be lost with the home, which is the one gap that undoes the rest (`backupState` in `src/domain/selectors.ts`; a restore counts as a backup, since the phone then holds exactly what the file does). The drawer takes the height that is left and spaces the folders to use it (`stackLayout`); when there are more folders than fit, the column also moves up as the opening moves down.

How it is built, for whoever changes it: the slide is an ordinary scroll view, so the momentum and the settle on one folder (`snapToInterval`) are the iPhone's own, and nothing needs a gesture library. The scroll view is turned upside down (`scaleY: -1`, as an inverted list is) so that sliding down counts up from the first folder; the folders sit on a stage that moves down exactly as fast as the content moves up, so it stays in view, and is turned the right way up again. Each folder's place is an interpolation of the scroll position on the native driver: every folder after the open one sits one opening lower.

**The cabinets** (`src/app/places.tsx`, `src/ui/CabinetArt.tsx`; the button with the two stacked drawers beside the title on the Rooms tab): every place is a drawn file cabinet with its name, its total and its count, and the one being looked at has its top drawer out with folder tabs showing, and a check. Tapping a cabinet opens its drawer. The last tile is the dashed outline of a cabinet that isn't there yet: "Add a place". A new place asks for a name and a kind (home, rental property, office or business, storage unit, somewhere else) and starts with a few rooms that suit the kind, so its drawer is never empty.

The folder also appears in the picture on the welcome screen.

**The welcome picture** (`src/ui/WelcomeArt.tsx`, drawn with `react-native-svg`): three snapshots standing in the folder, an armchair, a laptop and a guitar, each a photo print with two lines of handwriting and a green price tag, and a green shield on the front of the folder. The shield and the one line under the headline ("Your proof for an insurance claim.") are there because the owner asked for the screen to say why you would track your things at all: insurance. It replaced a paragraph and an example folder full of figures after the owner's first run on his phone (2026-11-11: "This is a lot of words, easy imagery would be better"). The prints keep their light paper and colours in dark mode, as real prints would; only the folder follows the theme. Under it the screen has one headline, three words (Photo, Value, Report) and one line about privacy. **The owner's rule for every screen since: pictures first, few words.** The room picker on the second welcome screen is a grid of tiles with large symbols for the same reason. While a home is empty, the folder itself holds the one prompt and the "Add your first item" button, so the screen never stacks two empty states. The icon is the same idea reduced to one shape: a folder whose tab is a roof.

**Where the look comes from** (none of them apps): manila file folders and their index tabs; bank passbooks and ledger paper; the object labels in a museum case, with their small serif titles and plain facts.

**House rules that keep it from looking generated:**

- One uppercase label in the whole app: the name of the place on the drawer's label plate. No eyebrow above headlines.
- No lists of three icons in tinted squares. If a screen needs to explain the app, it shows a picture drawn for it (the welcome picture), not a paragraph.
- Sentence case, no exclamation marks, and say a thing once ("No results for ..." rather than a title and a body that repeat each other).
- Amber means "worth filling in" and nothing else. A room whose things have no value says so in amber instead of showing "$0".
- The add button beside a large title is a quiet toolbar circle, not a filled floating button.
- One wording for a missing value everywhere, including the PDF: "No value".
- Amounts are whole in the app when there are no cents ("$1,899"), and always carry cents in the PDF, which is a document.
- Every row in a list is the same height. A name gets the whole first line; the room and the value share the second.

## Money

- **Free:** the first 20 items, with every feature (the owner set 20 on 2026-11-11; the first build had 25), in one place. The 20 are counted across every place.
- **More than one place is Pro.** That was Claude's call when the owner asked for cabinets, not his: the pay-once competitor's free tier is also one property (research/market.md), and it gives Pro a second reason beyond the item count. To make places free, change `FREE_PLACE_LIMIT` in `src/domain/library.ts`. Nothing is ever locked: with Pro gone, places already made stay and only adding stops. Nothing already added is ever locked: at the limit, editing, the report and backups all keep working, and only adding stops.
- **The free version, checked end to end (2026-11-11, at the owner's request).** His rule: the core of the app works without paying, and paying unlocks more or conveniences. No feature is behind Pro: photos, receipts, serial numbers, search, the PDF report, the spreadsheet, backup and restore are all free. Pro is only "more": items past 20 and places past one. The browser run now walks a full free inventory (step 16): editing, adding a photo to something already there, adding a room, the report, the spreadsheet and a backup all work with 21 items and Pro off; deleting two makes room for one more and then it is full again; and a backup bigger than the free version restores whole on a phone that has not paid. **The open point is the number, and it is the owner's:** 20 items is about two rooms, and the line below says outright that the cap was sized so a home could not be finished on it. If "the core works free" means a person can document a home, 20 does not meet it; the change is one number, `FREE_ITEM_LIMIT` in `src/domain/limits.ts` (every screen, the store text check and the tests read it from there, except the browser run, which counts to 20 by hand).
- **Plainproof Pro:** one payment, $5.99, removes the limit. Non-consumable `com.gamequarry.plainproof.pro`. No subscription, no ads.
- **Pro is bought straight from the App Store, with nothing in between (2026-11-12).** The app was first built on RevenueCat, like the games. It now uses StoreKit through `expo-iap` (`src/pro/appstore.ts`): the App Store sells the product, Apple signs the purchase, and the iPhone itself checks what the Apple Account owns, offline included. Why: the app's promise on its first screen and its Pro screen is that nothing leaves the phone, and RevenueCat keeps a purchase record and an anonymous id on its servers; going live through RevenueCat also needed three things only the owner could do (a project, a key file from Apple uploaded to it, and a key sent back), where this needs none; and the privacy label becomes a plain "Data Not Collected". What is given up: RevenueCat's sales dashboard (App Store Connect's own sales reports cover one product) and its cross-platform bookkeeping (there is one platform). The adapter's whole surface is five functions, so going back is one file. Fifteen unit tests run the adapter against a stand-in store: owned and not owned, the phone unable to say (a saved answer is kept, so Pro works offline), a cancelled sheet, Ask to Buy (waits, then unlocks when the approval arrives), a product the store does not offer, a sheet that closes with no answer, and the four ways a restore can end. The owner bought Pro in build 30 from TestFlight's sandbox on 2026-11-12 and it worked; restoring on a fresh install, Ask to Buy and a refund have not been tried on a phone.
- **Why these numbers** (research/market.md, "Home inventory", 2026-11-11): the pay-once apps in this category sit at $5.99 and $6.99, one of them with a 25-item free tier; the subscription apps charge about $35 to $80 a year, and recurring fees for a set-it-up-once tool are the complaint that comes up most in their reviews. 25 items is enough to see the whole app work on one room and not enough to finish a home.
- **Store name:** "Plainproof: Home Inventory", subtitle "Belongings list for insurance" (`store/plainproof/listing.json`). **Apple accepted the name** when the app record was created on 2026-11-11, so it is free on the App Store. A web search the same day found no app called Plainproof; that was a search, not a trademark check.
- **Privacy label:** "Data Not Collected" (`privacy_label` in the listing). No server, no account, no analytics, no ads, and no purchase service: nothing is collected by the developer or by anything the app brings in.

## Going live

What the app needs from App Store Connect, and who does it. The Paid Apps agreement and the `SUPPORT_EMAIL` variable are shared with the games (store/README.md).

1. **Bundle id and app record.** Done 2026-11-11: `com.gamequarry.plainproof` is registered and the app "Plainproof: Home Inventory" exists in App Store Connect, with an internal TestFlight group ("Me", automatic distribution).
2. **The Paid Apps agreement** (owner only: it asks for bank and tax details). Without it the App Store offers no product, in the sandbox or anywhere, and the Pro screen says Pro can't be bought right now.
3. **The purchase.** Done 2026-11-12: one Non-Consumable, `com.gamequarry.plainproof.pro`, "Plainproof Pro", $5.99 in the United States with Apple's matching prices elsewhere, sold everywhere, with the Pro screen as its review screenshot. Apple shows it as Ready to Submit. It goes to review with the app's first version: on the version's page, under In-App Purchases, it has to be picked once (Apple has no API for that).
4. **A release build.** Actions > "iOS app build" > Run workflow, flavor `release`, which is refused until `npm run check:release` passes (the product id matches the bundle id and the store is built in). No Expo account or Mac is needed. Real purchases can't run in Expo Go.
5. **The listing.** Done 2026-11-12 by `tools/asc_listing.py` (Actions > "Store listing"; `plan` looks, `apply` writes, and running it again changes only what differs): subtitle, privacy link, categories (Productivity, Lifestyle), the age-rating answers (4+), the description, keywords, promotional text, support link, copyright, the five screenshots, the notes for App Review, the app's price (free) and where it is sold. **The EU is left out**, as the owner chose for the studio's first game, because selling there needs a trader declaration under the Digital Services Act; `leave_out_eu` in the listing turns that off.
6. **Left for a person, because Apple has no API for it or it is personal:** the App Privacy answer ("Data Not Collected"), picking the purchase on the version's page, the contact person for App Review (a name, a phone number and an email address: never in this repository), and Submit for Review.

**The screenshots** (`store/plainproof/screenshots/`, made by `node e2e/store-shots.cjs` after a web export): five screens of the app with the sample home, each under one short line, at 1320 x 2868. They are drawn by the web build, which runs the same screens from the same code; the note about the web preview is hidden and the report button carries the iPhone's words. The sample home in them has 45 items, which is more than the free version holds, so the last picture says in so many words what is free and what Pro adds. Run the script again whenever a screen in them changes, then "Store listing" with `apply`.

## How places are kept

**The report with more than one place (the owner asked before release, 2026-11-12):** the report, the spreadsheet and the Report tab are always the open place's, and each place keeps its own name, address, insurer and policy number (the owner's name is carried to a new place). That is deliberate: an insurer covers one address on one policy, and a claim is for one of them. With more than one place the Report tab says so under the page preview ("This report is for Lake cabin only. Each place has its own.") with a way to change place. A backup is the one thing that holds every place. There is no single report across places; if the owner wants one it is a new feature, not a setting.

Everything the app keeps is a **library** (`src/domain/library.ts`): a list of places, each with a kind and a document, and the id of the place being looked at. A place's document is exactly what the app kept when there was only one home (rooms, items, the name and address, the currency), so the screens, the report, the spreadsheet and every action still work on one document: the current place's (`useDoc()`, `store.update()`). Only a few things look across places: the free limits, backups (a backup holds every place; format 2, and format 1 from before places still restores as one home), photo clean-up, the currency (one for every place) and the cabinets screen (`useLibrary()`, `store.updateLibrary()`). The saved file is still `inventory.json`; one written before places existed is read as a library with a single home, so nothing on a phone that ran an earlier build is lost.

## What needs a phone, and what needs more than Expo Go

**Works in Expo Go (by design; none of it has run on a real phone yet):** the camera and photo library (`expo-image-picker`), resizing photos (`expo-image-manipulator`), the PDF (`expo-print`), the share sheet (`expo-sharing`), picking a backup file (`expo-document-picker`), the date picker, SF Symbols (`expo-symbols`), haptics, the system tab bar (`expo-router/native-tabs`), file storage (`expo-file-system`).

**Needs a TestFlight build:** buying and restoring Pro (`expo-iap`, which is StoreKit). The module is only loaded outside Expo Go, which has no StoreKit module; there, and on the web preview, the Pro screen's button explains that nothing can be bought, and "Pretend Pro is bought" in Settings shows the unlocked app. A TestFlight build buys in Apple's sandbox: the sheet is the real one and nothing is charged.

**The iPhone build** (`tools/ios_app_build.sh` and `.github/workflows/ios-app.yml` at the top of the repo): the Xcode project is not kept in the repo; `expo prebuild` writes it from `app.json` each time. `app.json` carries the app's privacy manifest (the reasons its native libraries give for the system calls Apple asks about) and turns off the microphone permission text the photo picker would otherwise add. `app.config.js` lets a build set the version and build number. Two flavors: `playtest` sets `EXPO_PUBLIC_PLAYTEST=1`, which leaves the Developer section in a TestFlight build; `release` is the store build and never has it.

**Different on the web preview:** no PDF and no share sheet (the report opens in a new tab and files download; a note under the Report buttons says so, on the web only), Material symbols stand in for SF Symbols, the browser's date field stands in for the iPhone's, and the tab bar, action sheets and alerts are drawn to match the system's. Each of these sits behind a `.web.ts` or `.web.tsx` twin.

## QA

**Unit tests** (`npm test`, 76): the document parser and its repairs, rooms and items, totals, gaps, search, filters and sorting, money parsing and formatting, dates, the report's contents and escaping, the spreadsheet, the backup file round trip, the free limit, and one test for every bug below.

**The browser run** (`node e2e/run.cjs`, 22 steps, about 90 seconds): a fresh install through the welcome screens; the empty states; a form that refuses an empty name and bad amounts; an item with every field, a photo and a receipt; editing, the largest amount the app holds, cancel asking before it discards; a very long name; rooms added, renamed, reordered, given a new symbol and deleted with and without moving their things; search, the three filters, sorting; deleting an item; the report (every item, photo and receipt present), the spreadsheet, the backup; a reload and deep links; erase everything; a restore, including a file that is not a backup; the free limit at exactly 25 and Pro on and off; the 48-item sample home and a currency change; a 650-item home (the Items tab and the report each open in under half a second); then dark mode, a small phone and a large phone, each restoring the backup and visiting every main screen. It fails on any console error or anything wider than the screen.

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

**Critic review 2 (2026-11-11), on the fixed screens: almost.** "The design has a point of view... What remains is a handful of finishing problems, mostly in dark mode, empty states and consistency. I found no exclamation marks, no stray Title Case and no filler copy." Its ten findings:

1. *(must)* *The dark folder is a muddy olive.* Now a warm brown-grey with a lighter tab and cream figures.
2. *(must)* *The empty Rooms screen stacks two empty states.* The prompt and the button are inside the folder; the white card is gone.
3. *(must)* *Item rows of uneven height.* Every row is the same: the name on the first line, the room and the value on the second, no chevron. (Review 1 asked for two-line names; this gives a name the full width instead.)
4. *Money precision changes between screens; the value card on an item is heavy.* Whole amounts in the app, cents in the PDF; the item's value is a serif line under its title, with "Cost to replace" or "The price you paid" beneath it.
5. *On a 375-point phone the example folder lost a meter and the privacy line fell off the screen.* A short screen gets tighter spacing and a smaller headline, and the example's counts are short enough for both meters to share a row. A first attempt loosened the fit measure instead and squeezed the labels until they were cut off: the browser run now checks that neither a label nor a count is truncated.
6. *"0 items found" above "No results".* The count line is hidden when nothing is found.
7. *"No subscription" twice on the Pro screen; a mint button in dark mode.* Said once; filled buttons are brand green with white text in both modes.
8. *"Move up" is not how iOS reorders.* Not done: dragging needs a gesture library the app does not have yet (below).
9. *Backup and restore belong in Settings.* Not done, on purpose for now: the Report tab is "getting things out of the app" (report, spreadsheet, backup). The owner's call after using it.
10. *"Not recorded" down the PDF's Purchase column; a stock-looking icon.* A quiet dash in empty cells; the icon's folder is a tenth larger with a sharper roof. It stays flat (review 1 asked for no gradient, review 2 for a soft one).

## Known gaps and polish work

- **Nothing has run on a real iPhone.** The first Expo Go run is the real test of the camera, the PDF, the share sheet, the date picker, the tab bar and the splash screen. Expect a few fixes.
- **Page numbers in the iPhone's PDF.** The foot is written as page-margin text, which the web preview prints and WebKit (which makes the PDF on the phone) has not supported. If it is missing on the phone, the fix is a native header and footer, or laying the pages out by hand.
- **The TestFlight upload works** (first signed upload: build 1.0.0 (14), playtest, 2026-11-11). Only the playtest flavor has been uploaded; the first `release` upload waits for the store key.
- **Reordering rooms** is "Move up" and "Move down" in the room's menu. Both critics asked for dragging in the Rooms list; that needs a gesture library and is the first polish job after the owner's test.
- **Where backup lives** (Report tab or Settings) is an open question for the owner (review 2, finding 9).
- **The web preview's note and the Developer section** show in App Store-style screenshots taken from the browser run. Store screenshots must be shot with both hidden.
- **VoiceOver** labels are on the controls but have not been listened to on a phone.
- **iPad** is off (`supportsTablet: false`): the layout is a phone's.
- **App Store name** accepted by Apple (see "Money").
