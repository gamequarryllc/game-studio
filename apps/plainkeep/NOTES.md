# Plainkeep: notes

A maintenance log for a home and a car. One job: know what is due, and have a record of what was done.

## Art direction: the service tag

Three things from the real world, none of them apps: the oil-change sticker in the corner of a windscreen; the inspection tag that hangs from a furnace or a fire extinguisher, with its punched dates; and the enamel data plate riveted to a machine, with the marks of a steel rule.

- **Palette** (light / dark), each with one role. Wall `#ECEEEC` / `#0F1215` (the page: a cool workshop white, not paper). Tag `#FFFFFF` / `#191D21` (cards). Ink `#161A1E` / `#ECEFF0`. Enamel blue `#1D4F7C` / `#8ABBE8`: actions, and anything in good time. Amber `#9A5A06` / `#E6AC53`: coming up. Red `#B3331B` / `#F27A61`: past due. Plate `#1B2026` / `#07090B`: the dark cells an odometer's figures sit on. Blue, amber and red mean those three states and nothing else.
- **Type.** Barlow Condensed (open licence, `@expo-google-fonts/barlow-condensed`) for titles and every figure: the lettering of equipment plates and road signs. The system font for everything that is read as a sentence.
- **Motif.** *The rule*: a row of marks like the edge of a steel rule. Marks to the left of today are inked; the last, taller mark is the day the job falls due. It is on every job's line, large on a job's own screen, and on the icon. *The ring*: the hole a tag hangs by, which is also how a job is marked done. *The odometer*: figures in cells on a dark plate. *The stamp*: a date in a small bordered square in the log.
- **Shape.** Cards are plain white on the wall with the iPhone's own corner (12) and no outline; only the small instrument pieces (an odometer, a symbol's plate) are cut square. Hairlines only between rows.
- **The icon** is one tag on enamel blue: seven thick marks of its rule, the tall red due mark, and the punched ring. The welcome picture is the same tag with a second behind it.

**House rules that keep it from looking generated:**

- A figure and the sentence beside it never say the same thing twice. A job's line shows what is left ("19 days") as the figure and where the limit lies ("Dec 1") as the words.
- No uppercase labels, no eyebrows above headlines, no rows of three icons in tinted squares. Empty screens are a title, a sentence and one button, left-aligned.
- Sentence case, no exclamation marks, and the same word for the same thing everywhere: a *thing* is looked after, a *job* comes round, the *log* holds what was done, a job is *paused*, a turn is *skipped*, late is *overdue* (never "over"), money is *spent*.
- Colour is never decoration. A card or symbol is blue, amber or red only because of when its most pressing job is due.
- The add button beside a large title is a quiet toolbar circle, not a filled floating button.

## How it works

- **A thing** is a home, a vehicle or something else (a mower). Only a vehicle has an odometer.
- **A job** comes round by the calendar (every n days, weeks, months or years), by distance (vehicles), or both, whichever comes first. It either counts from the day it was last done (a filter) or stays on its date however early or late it is done (a registration): `anchor: 'done' | 'fixed'`. With neither interval it happens once.
- **Never logged, last date unknown** (`unsure`): the job waits under "Not logged yet" with no countdown and no rule, because any date would be made up (critic 1). It says how often it comes round, and the ring sets the day it was last done. It still gets one reminder to look at it, within a month (or its own interval if shorter), and one more ten days on. A job given a first date is not unsure: that date is real.
- **A fixed job done early** counts for the date that is coming up if it is within a quarter of the interval of it; otherwise for the date that has passed. So a registration renewed two weeks early or seven months late is next due on the same date the year after.
- **Distance** jobs are due at a reading. From two readings at least two weeks apart (within the last year) the app works out the pace and the day the reading should be reached; that day is what reminders use. With no reading a distance job cannot be placed, and the list says "Needs an odometer reading" instead of guessing. Logging a job with a reading also updates the odometer.
- **States:** overdue (past the date or the reading), due today, coming up (the next 30 days for every job alike, so nothing in "Later" is ever sooner than something above it; or the last tenth of a distance, at least 300; or a reading the odometer should reach within 30 days), not logged yet, later, paused, finished. Within a group the list is in order of the day to plan around.
- **A date in another year always shows its year.** "Done Jan 1 ... Due Jan 9" on a yearly job read as eight days.
- **Deleting** a thing or a job is in its Edit form, with what goes with it spelled out, not on the screen you read.
- **Reminders** are local notifications the iPhone delivers itself (`expo-notifications` with remote notifications switched off, so there is no push entitlement and no server). For each job: the lead time before (the app's setting or the job's own), the day itself, and 3 and 10 days after if it has not been done; then silence. Jobs falling at the same minute arrive as one reminder that names each job and whose it is. A vehicle with distance jobs gets one "what does the odometer say?" a month after its last reading. At most 48 are planned, nearest first (the iPhone holds 64). The plan is worked out again whenever the log changes or the app comes to the front, and Settings > Upcoming reminders shows exactly what is waiting, marking the ones that only come "if it isn't done".
- **The permission question** is only asked when the person turns reminders on (the Due tab's notice or Settings). If the iPhone says no, the app says where to change it and keeps the setting, so reminders start the moment they are allowed.
- **Storage:** one JSON document (`upkeep.json` in the app's documents folder, written beside the old copy and swapped in). A line that cannot be read is dropped and the rest kept. A backup is that document in one file; it holds nothing about Pro, and whether reminders are on stays this phone's choice after a restore.

## Money

- **Free:** two things (a home and a car, say) with every feature they need: as many jobs, reminders and log entries as they like, the spreadsheet, backup and restore. The owner's rule (2026-11-12): the app must be completely usable free; Pro only adds more or conveniences.
- **Plainkeep Pro, $6.99 once** (the owner's price): as many things as you have, and a PDF service record for each. Non-consumable `com.gamequarry.plainkeep.pro`. No subscription, no ads.
- **Why two things, and why the record:** the core use is one household's home and car, and that is whole without paying. A second car, a rental, a cabin or a mower is "more", which is what the owner said Pro may be. The PDF is a convenience that matters on a few days in a thing's life (selling, moving out, a warranty claim); the spreadsheet of the same history is free, so nothing is held back. The pay-once car logs sell the same two things (several vehicles, PDF export) for $9.99 to $24.99, and the home apps are almost all subscriptions at $5.99 to $6.99 a month (web search, 2026-11-12; store pages only, no sales figures).
- **Nothing is ever locked.** Past the limit (after a restore, or if Pro were refunded) everything already there keeps working; only adding another thing stops. `FREE_THING_LIMIT` in `src/domain/limits.ts` is the one number.
- **Pro is bought straight from the App Store** (StoreKit through `expo-iap`, the adapter copied from Plainproof with its fifteen tests): no purchase service, so the privacy label is a plain "Data Not Collected".
- **Store name:** "Plainkeep: Home & Car Upkeep", subtitle "Maintenance log and reminders". A web search on 2026-11-12 found no app called Plainkeep; that is a search, not Apple's answer or a trademark check. Apple decides when the app record is created.

## Use cases and feature ideas (the feature pass, 2026-11-12)

Who uses it, and what each needed when the app was walked as them:

| Who | What they need | In the app |
|---|---|---|
| A first-time homeowner | Not to have to know what the jobs are | The suggested jobs for a home, the common ones ticked |
| A renter | A short list: alarms, a filter | The same list, fewer ticks; nothing assumes a house |
| A household with one car | Oil by distance or date, registration on its date | Both limits, fixed-date jobs |
| A household with two cars, or a landlord | More things, each with its own log | Pro |
| Someone selling a car or a house | Proof it was looked after | The service record (Pro); the spreadsheet (free) |
| Someone who does their own work | The filter size and the oil weight next time | A note on every job, shown on its screen; cost per entry and per year |
| A cabin or a mower | Jobs that sleep for a season | Pause, and skip a turn |
| Someone who only wants the nudge | To be told, at a sensible hour, and not nagged | Reminders with a chosen time, one lead time, two follow-ups, then quiet |

What the other apps offer and what their reviewers ask for (store pages, 2026-11-12): subscriptions are the standing complaint; one home app charges to add your own tasks; a widget is asked for; reminders that pile up are a complaint; the car logs put several vehicles, photos of receipts and PDF export behind their paid tier.

| Idea | For | Value | Effort | Decision |
|---|---|---|---|---|
| Suggested jobs with usual intervals | Everyone, on day one | High | Done | **Built** (free) |
| Fixed-date jobs (registration, tax) | Car owners | High | Done | **Built** (free) |
| Skip a turn; pause a job | Seasonal things | Medium | Done | **Built** (free) |
| The day a distance job should fall due, from your own driving | Car owners | Medium | Small | **Built** (free): a job's screen says "At the pace you drive, that is about Jan 20" |
| Same-minute reminders folded into one; two follow-ups then quiet | Everyone | High | Done | **Built** (free) |
| "Upcoming reminders": see what the phone has waiting | Anyone who does not trust reminders | Medium | Small | **Built** (free) |
| One-off repairs in the log; cost per year | DIY, sellers | Medium | Done | **Built** (free) |
| Service record PDF | Sellers, landlords | High on a few days | Done | **Built** (Pro) |
| A home-screen widget of what is due | Everyone | High | Large: a Swift target, like Plainlimit's | Later (the first thing after launch) |
| A photo of the receipt on a log entry | Sellers, warranties | Medium | Medium: Plainproof's photo store can be copied; a backup then needs to carry photos | Later (Pro) |
| "Remind me next week" from the notification | Nudge-only users | Medium | Medium: notification actions | Later |
| A badge with the number overdue | Everyone | Low: it cannot change while the app is closed | Small | No |
| Sync between two phones | Couples | High | Needs a server or iCloud; breaks "nothing leaves the phone" | No |
| Fuel and mileage economy | Car enthusiasts | Medium | It is another app | No |
| Reading receipts with the camera | — | Low here | The receipt vault on the list does this | No |

## QA

- **Unit tests** (`npm test`, 95, the store adapter's fifteen among them): calendar days across a clock change and short months; every way a job comes due; the reminder plan (lead, day, follow-ups, time of day, a clock change, the pace of a car, folding, the cap); every action; reading back what was written and dropping what cannot be read; backups and the four things that can be wrong with a file; the spreadsheet's quoting; the service record; the wording.
- **The browser run** (`e2e/run.cjs`, 24 steps, clock fixed at 2026-11-12): first run with a home and with a car; marking done on an earlier date; edit, pause, skip; the odometer form (nothing, lower than the last, the pace); a one-off, search, filter, edit, delete; a fixed-date job with its own lead; reminders on and the plan read back; the free limit and that nothing is locked at it; Pro, a third thing, the service record; the spreadsheet and the backup read back from disk; deleting a job (history stays) and a thing (everything goes); erase, a wrong file refused, restore; a backup bigger than the free version on a phone that has not paid; very long names and numbers at the limits; units and currency; reload and deep links; 40 things, 400 jobs and 4,000 entries; dark mode and a 320-point phone. No console errors.
- **Not yet seen on an iPhone** (the web preview cannot show them): reminders arriving and being tapped, the permission question, the system date and time pickers, the PDF in the share sheet, a purchase in TestFlight's sandbox.

## Owner actions

1. **Create the app record** (once, about two minutes). WHAT: a new app named `Plainkeep: Home & Car Upkeep`, iOS, English (U.S.), bundle id `com.gamequarry.plainkeep`, SKU `plainkeep`. WHERE: App Store Connect > Apps > + > New App (register the bundle id first at developer.apple.com > Identifiers if it is not offered). WHEN: before the first TestFlight upload; the build signs and archives without it and only the upload fails.
2. **The purchase** (before release, not needed to try the app): Actions > "Store listing" > `plainkeep`, `apply` creates "Plainkeep Pro" at $6.99 from `store/plainkeep/listing.json` once the app record exists. Until then the Pro screen says Pro can't be bought, and Settings > Developer > "Pretend Pro is bought" shows the app with it.
