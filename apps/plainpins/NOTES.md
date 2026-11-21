# Plainpins: notes

A map of everywhere you have been. The owner asked for it on 2026-11-20: pins on places visited, real photos from the camera roll, when, what you did and who was there, all kept on the phone, on an interactive map or globe, and good-looking enough to show friends. "Plainpins" is a working name.

## Art direction: the field atlas

The app should feel like a well-made atlas with your own notes in it, not like a dashboard.

- **Paper and ink.** Warm chart paper by day (`#F3EEE2`), the same chart by lamplight at night (`#14110D`, warm, not navy). One vermilion (`#D2432A`) for the pin and for everything that can be pressed.
- **Lettering.** Instrument Serif for the names of places and screen titles; the system font for everything you read or tap; a text serif (New York on an iPhone) for the story; small spaced capitals for what a map prints in its margins (a legend, a section label); a monospace only for coordinates.
- **Photos are prints**: a white edge, a small corner, a slight tilt where they are fanned.
- **Kinds of place are legend inks**: each kind has a color and a symbol, used on its pin, its tag and its filter.
- **The map leads.** The first tab is the map with a small legend card (the count of places, towns and countries), three round controls and a strip of place cards along the bottom. Flicking the cards flies the map; tapping a pin brings its card up.
- Copy is short and plain: "Nowhere yet", "Somewhere on Earth", "Put the pin here".

It must not share a visible template with the other studio apps (App Review guideline 4.3): the plumbing is Plainkeep's, the look is its own.

## How it works

- **Map.** Apple Maps through `expo-maps` (`AppleMaps.View`), with realistic elevation, so zooming out gives Apple's globe. Pins are Apple's balloons in the kind's color with its SF Symbol. Chosen over a custom 3D globe because it is the map people already trust, it has streets and search, and it costs nothing to run. The browser preview cannot use it, so `WorldMap.web.tsx` draws a plain orthographic globe (coastlines only).
- **Adding a place.** Tap +, move the map under the centre pin (or "Where I am", or "Find a place"), "Put the pin here". The town and country are filled in from Apple's geocoder and can be edited. Then photos, name, kind, date (or first and last day), who was there (names used before are offered), the story.
- **Photos** are copied into the app's folder, resized to 2048 points on the long side. The library is not changed. A sweep at launch removes copies no place uses.
- **Storage.** One JSON document plus the photo files, all in the app's folder. Backup is one file with the photos inside; restore replaces everything after a confirmation.
- **Places tab.** Every place by year, with search (name, town, person, story) and filters by favorite and kind.
- **Sample map** (Settings > Developer, in playtest builds and the preview): 44 real places with made-up visits, people and drawn pictures, most around one home area, some along the lakeshore, some far away so the globe has something to show. A 9-place starter is there too. Loading it replaces what is on the map after a confirmation. The owner chose real place names for it; that one file (`src/domain/sample.ts`) is the only place they may appear.

## Money

The owner's rule: the app is completely usable free; Pro is for convenience and extra use. His "20 locations" was an example, not a decision.

- **Free:** 25 places, 6 photos on each, and every feature: the globe, search, people, stories, filters, backup and restore.
- **Pro (one payment, $6.99 by default):** as many places as you like, 40 photos on each, and the satellite globe.

Why this split:
- A limit on places is the only gate that does not take a feature away. 25 is enough to pin every trip of a couple of years and judge the app properly; the people who pass it are the ones getting real use from it.
- 6 photos tells the story of a place; 40 is for people who want the whole album there. Storage is theirs, so the cap is about use, not cost.
- The satellite globe is pure looks. The street map and its globe are free.
- Backup is never Pro: people's memories must not be held hostage.
- Nothing already added is ever locked. Over the limit, everything stays, opens and can be edited; only adding more asks for Pro. A restored backup may hold more than the free limit.
- Not gated, on purpose: number of people, story length, kinds of place, dark mode, search.

Pro is one non-consumable (`com.gamequarry.plainpins.pro`) bought straight from the App Store with `expo-iap`, as Plainkeep and Plainproof do, so no purchase service sees anything. Restore is on the Pro screen and in Settings.

## Use cases and feature ideas

Who would use it: someone keeping a private record of trips; a couple or family logging weekends close to home; a person filling in a "where I've been" map to show friends; someone moving a shoebox of old trip photos onto a map.

Competing apps found in a short search (store pages only, 2026-11-21): Pin Traveler, Travel Pins, Polarsteps, Everpin, Pinbox, Wanderlust. Most lean on accounts, sharing or subscriptions; the opening here is private, pay-once and good-looking. Their reviews were not read in depth; do that before launch.

| Idea | For whom | Value | Effort | Decision | Free or Pro |
| --- | --- | --- | --- | --- | --- |
| Move a pin without deleting the place | everyone | high | small | next | free |
| Use a photo's own location and date to make the pin | shoebox mover | high | medium | later, after the first phone test | free |
| Trips (group places) | trip keepers | medium | medium | on hold (owner) | Pro, probably |
| Stats page (countries, farthest, busiest year) | show-off map | medium | small | on hold (owner) | free basics |
| Timeline replay across the globe | show-off map | high wow | medium | on hold (owner) | Pro |
| Share cards (a picture of a place or the whole map) | show-off map | high | medium | on hold (owner) | free, Pro styles |
| Home Screen widget ("on this day") | everyone | medium | medium | later | Pro |
| Cluster pins that overlap when zoomed out | heavy users | medium | medium | later; see how Apple's map handles it on the phone | free |
| iCloud sync | multi-device | medium | large | no for now: breaks "nothing leaves the phone" simplicity | |

## QA

- 59 unit tests: limits and Pro gating, adding, editing and deleting, the backup round trip, parsing damaged files, dates, selectors, the sample map.
- Browser run (`e2e/run.cjs`): 27 steps at an iPhone 17 size in light and an iPhone SE size in dark, from a fresh install through a full map, the free limit, Pro locked and unlocked, backup, erase and restore, with no console errors.
- The iPhone bundle exports (`npm run export:ios`), which compiles the native twins.
- **Critic review 1 (almost).** Fixed: the dark-mode kind tag was unreadable; switches had an off-color knob; dark pins had black centers; the "Add" photo tile was cut off (it now leads the row); the kinds of place were a five-row cloud (now one row that leads with the chosen kind); the Pro screen said "You have 0" and kept the free comparisons after buying; the Places heading wrapped.
- **Critic review 2 (almost).** Fixed: dark mode was a cold navy unlike the light look (now warm); the story was set in the display serif (now a text serif); list lines were small capitals (now sentence case); filled buttons in dark mode keep the deeper vermilion; one awkward heading on the sample page.
- Left from the critics, for the next round: the welcome picture is a simpler globe than the real one; margins differ a little between screens (20 and 16 points); the place page's "Show on the map" could be a small map; the Pro screen once bought is plain; pins in many colors against a two-color identity (kept for now: the color is how a kind is told apart on the map).

Known gaps and bugs:
- The real map has only been compiled, not seen. Pins, the globe, selection and camera moves on Apple Maps need the owner's first TestFlight pass.
- Sample coordinates were written from memory and may be off by a few blocks.
- A photo added and then removed while editing a place stays on disk until the next launch sweeps it.
- A pin cannot be moved yet (delete and add again).
- The browser preview shows no streets and cannot search.

## Owner actions

1. **Create the app record.** WHAT: App Store Connect > Apps > + > New App: platform iOS, any name (for example `Plainpins: Travel Pin Map`), language English (U.S.), bundle id `com.gamequarry.plainpins`, SKU `plainpins`. If the bundle id is not offered, register it first at developer.apple.com > Account > Certificates, IDs & Profiles > Identifiers (App ID, explicit, no extra capabilities). WHEN: before the first TestFlight upload can succeed. WHERE: appstoreconnect.apple.com.
2. **Choose the name.** WHEN: before the store listing; the test build can keep the working name. Ideas are in `store/plainpins/listing.json`.
3. **Create the Pro product.** WHAT: a non-consumable in-app purchase with product id `com.gamequarry.plainpins.pro`, $6.99 (or the price he prefers). WHEN: before testing a real purchase; until then use Settings > Developer > "Pretend Pro is bought". WHERE: App Store Connect > the app > In-App Purchases.
