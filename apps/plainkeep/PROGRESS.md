# Plainkeep: progress

Kept current after every finished item, so a run that is cut off can be picked up from here.

## Done

- Project in `apps/plainkeep/` (Expo 58, the same plumbing as Plainproof; bundle id `com.gamequarry.plainkeep`).
- The logic, with 96 unit tests (`npm test`).
- Every screen; icon and launch mark (`art/`).
- The end-to-end browser run (`e2e/run.cjs`, 24 steps, no console errors).
- The feature pass (NOTES.md, "Use cases and feature ideas"); its "build now" items are built.
- Store screenshots (`store/plainkeep/screenshots/`, made by `e2e/store-shots.cjs`).
- Critic review 4 (verdict: almost, "nothing is broken at the standard iPhone width") and its fixes: no hanging separator dot on a job line; a thing's card says "when was it last done?"; narrow phones keep the important words; the listing names the Reminders switch as the app does; "or 1 year"; shared reminders say how each job stands; numbers in names sort as numbers; the icon is a checked tag.
- Critic review 3 (verdict: almost, "nothing looks broken") and its fixes: American wording throughout; "days over" under a late figure; odometers moved to the foot of a thing's card; one line a job in Upcoming reminders, and mileage reminders worded as the estimates they are; a plus in the Jobs and Log headings instead of blue rows; a flat icon with an even rule; the empty tabs without the small picture; the service record without the orphan "Entries" fact.
- Critic review 2 (verdict: almost) and its fixes: job lines that hold up at 320 points (no rule on lists, short units, a name that shortens before a date does); large titles no longer clip their descenders; a thing's counts each in their own colour; a reminders offer that can be put away; "weeks left" on a job's card; a Pro screen with a picture of the record and two reasons; the service record without repeats; an icon with one idea.
- Critic review 1 (verdict: almost) and its fixes: one 30-day "Coming up" window so the list is always in order; "Not logged yet" instead of made-up first dates; dates never cut off by a long name; years on dates in another year; counts on a thing's card; deletes moved into Edit; a clearer schedule choice in the job form; the service record restyled; Pro's button pinned; a bolder icon; dark-mode contrast; one word for each idea.
- Store listing draft (`store/plainkeep/listing.json`), README, NOTES.
- CI: the web preview builds and the unsigned iPhone check build passes.

## In progress

- The first TestFlight upload (see NOTES.md, "Owner actions": it needs the app record).

## Next

1. On a phone: reminders arriving, the permission question, the PDF, a sandbox purchase.
