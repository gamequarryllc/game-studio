# Market research: the road to the studio's $200/month running cost

**Last updated:** 2026-11-09 (refresh weekly; the daily backstop does it when this date is more than 7 days old)

**App list addendum:** 2026-11-11, home inventory only (the section "The app list" at the end). On 2026-11-11 the owner put nine utility apps ahead of game work (STUDIO.md, "Apps"), which overrides bet 7 below. The next weekly refresh covers the other eight apps, the pay-once numbers and the per-app math.

Every money figure below that is ours is an **estimate**. Nothing the studio has actually earned is ever written in this repo. Figures from other people are labelled with their source and age; many come from vendor blogs and are marked as such.

## Summary

- **Nothing from the studio is live on the App Store yet.** Three games are at first playable. The blocker is not game quality; it is that there is no iOS build, no real ad or purchase code, and no store listing. Shipping work outranks new games until the first one is in review.
- **Monetization is not the hard part. Getting installs is.** At realistic numbers a free game of ours is worth roughly **$0.03 to $0.34 per install** (base case about $0.09). The target needs roughly **2,500 installs a month across the catalog** in the base case. A new indie app with no marketing typically gets **under 100 installs in its first month** (two 2026 postmortems). So discovery work (store name and keywords, screenshots, short videos, a featuring nomination) is worth more than any tuning of ad placement.
- **Our games are short (30 to 60 minutes with an ending).** That caps what one install can earn, because a player is active for two or three days, not months. More installs, more games in the catalog and a reason to come back (a second map, as the reference game has) all push the same way.
- **The same genre sells much better on Steam than on mobile.** Short, cheap incremental games are a proven Steam niche in 2025 and 2026, and one developer who launched the same idle game on both made about fifty times more on Steam than on mobile in the first month. This is a pitch for the owner (it needs a Steam account and a fee), not something to build unasked.

## The $200 math

**Target.** $200/month running cost + the Apple Developer Program fee ($99/year = $8.25/month) = **$208.25/month net**, about $6.94 a day.

**What we keep.**
- In-app purchases: Apple takes 15% under the App Store Small Business Program (under $1M proceeds a year). Enrolment is a form the account holder fills in; it is **not automatic**. Without it Apple's standard rate applies. We keep 85%.
- Ads: paid by the ad network, not through Apple, so Apple's commission does not apply. The eCPM figures below are already what the publisher receives.

**Inputs (US, iOS).**

| Input | Published figures | What we assume (low / base / high) |
|---|---|---|
| Rewarded video eCPM | $19.63 (2026, MAF via Playio); $24.39 (Q2 2024, Tenjin); about $17.3 (Q4 2024, Appodeal); $10 to $30 (2026, MonetizeMore estimate) | $8 / $10 / $18. A new, small app on one network, with some players outside the US, earns well under the published averages. |
| Interstitial eCPM | $9.64 (2026, MAF via Playio); $3 to $8 (2026, MonetizeMore estimate); $5 to $8 tier 1 (2025, Playwire) | $4 / $5 / $9 |
| Rewarded views per daily player | 25 to 50% of players watch, 3 to 8 a day each; a good target is 30% watching 4 a day = 1.2 per daily player (Kongregate, own games, older data) | 0.6 / 1.2 / 2.0 |
| Interstitials per daily player | Our own rule: natural breaks only, at most one every 4 minutes | 0.5 / 1.0 / 1.5 |
| Days a player stays active | No source for short games with an ending. Industry: day-1 retention about 22 to 26%, day-7 under 4 to 10% (2026, GameAnalytics via Playio; unsourced vendor figure) | 1.5 / 2.5 / 4 |
| Share of installs that ever buy | 1.0% median, 2.3% top quartile, download to paid in gaming (RevenueCat 2026, subscription-app dataset) | 0.5% / 1.0% / 2.3% |
| Spend per buyer (before Apple's cut) | $7.26 at day 90 in casual games (AppsFlyer, Jan 2025 to Mar 2026, global) | $4 / $5 / $7.26 |

**Result (estimates).**

| Case | Ads per daily player | Ads per install | Purchases per install (after Apple) | **Total per install** | Installs a month for the target | Per day | Daily players at any time |
|---|---|---|---|---|---|---|---|
| Low | $0.007 | $0.010 | $0.017 | **$0.027** | about 7,700 | 255 | about 380 |
| Base | $0.017 | $0.043 | $0.043 | **$0.085** | about 2,450 | 82 | about 200 |
| High | $0.050 | $0.198 | $0.142 | **$0.34** | about 610 | 20 | about 80 |

Sanity checks from real games: Card Crawl Adventure (free, no paid marketing, 2022) made roughly $2,000 from 55,000 first-month downloads after an Apple feature, about **$0.036 per download**, close to our low case. Published ads-only revenue per daily player for casual games is $0.01 to $0.05 (Playio, 2026, vendor ranges), which brackets our base case.

**Per game.** With five games live, the base case needs about **16 installs a day per game** (about 40 daily players each). With one game live it needs all 82 a day. Ten installs a day across the whole catalog, which is already more than an unmarketed indie app usually gets, is worth about $26 a month in the base case.

**Timing.** Even after launch, money arrives late: Apple pays out some weeks after each month ends, and ad networks hold earnings until a minimum balance is reached (both from general knowledge, not checked this week; confirm before planning around them).

## Best bets, ranked by expected dollars per month per hour of work and how soon they pay

1. **Ship the three first-playable games on iOS, free, with real rewarded ads and the Remove Ads purchase.**
   Soonest money and almost all the work is already done. Estimate: $5 to $60 a month per game with no discovery work, a few times that with it. Blocked on: the iOS build pipeline, real ad and purchase code behind the existing provider interface, store assets, and the owner's App Store Connect steps.
   Sources: the math above; AppsFlyer and RevenueCat 2026.

2. **Discovery, at no cost.** It multiplies every other bet, because installs are the constraint.
   - *Search.* Apple indexes the app name (30 characters), subtitle (30), the hidden keyword field (100 characters, comma-separated, no spaces, no repeats of words already in the name or subtitle) and the category. Promotional text is not indexed. One new utility got 90.6% of its downloads from App Store search (2026 postmortem), so the name and subtitle must contain the words people type ("digging game", "idle", "incremental", "burn", "destroy").
   - *The first three screenshots* are what search results show (or an app preview video: up to 3, up to 30 seconds each, autoplaying muted). They must show the satisfying moment in the first frame: fire taking a whole hillside, the drill breaking through a layer.
   - *Featuring nomination.* Free, in App Store Connect. Apple asks for at least two weeks' notice and suggests up to three months. It says it looks at design, uniqueness, controls, sound, performance and the product page; there is no checklist. One free indie game got 55,000 downloads in a month from a feature (2022). Nominate every launch.
   - *Short videos* (TikTok, Shorts, Reels). Our games are made of exactly the clips these feeds like (things burning, draining, collapsing). Advice that held up: the point of the clip must be clear in the first second or two, and captions are expected. One idle-game developer drew 1.1M views from 132 Shorts in 2025. The data here is thin and mostly anecdotal. Posting needs the owner's accounts; the studio can produce the clips.
   - *Cross-promotion* between our own games (a "more from Game Quarry" shelf on the ending screen) costs nothing once two games are live.

3. **Get Melt a Glacier through review first.** It is on the business's Apple account and its publish branch already has real ads (AdMob), purchases (RevenueCat), a TestFlight build and a launch checklist, so it is the fastest first dollar. What it still needs is the owner's side: the AdMob and RevenueCat ids, the in-app products and the store listing. Its repo is worked on in another conversation and is not ours to change; the studio games reuse its ad and purchase stack (see STUDIO.md, "App Store pipeline").

4. **A reason to come back.** A second, larger map after the ending (as the reference game does) or a harder replay raises the days a player stays, and ads per install scale with it. Worth one work block per game once it is live, not before.

5. **Pitch to the owner: sell the same games on Steam for $2.99 to $4.99.** Not started; needs the owner.
   - *Why.* Short incremental games are a proven niche there: A Game About Digging A Hole sold over a million copies at EUR 4.99 (2025). Several small incremental launches were reported at $70K to $720K in their first two months (2025, unsourced newsletter figures). Tiny Terraces, an idle game from a solo developer, grossed $26,799 on Steam in its first month and made $346 on mobile in the same period (2025, the developer's own numbers). The mobile port of A Game About Digging A Hole, sold as a paid app, shows only about 8.9K installs after 15 months (third-party estimate).
   - *Caution.* 63% of the 5,971 games released on Steam in the first quarter of 2026 had fewer than 10 reviews. Most games sell almost nothing; the genre helps but does not guarantee anything.
   - *Rough money (estimate).* At $3.99 the studio keeps about $2.30 to $2.80 a copy, so the target is about 75 to 90 copies a month.
   - *Needs from the owner.* A Steamworks account with tax and bank details, and $100 per game (not refundable; recouped once the game passes $1,000 in revenue). Godot already exports to Windows, macOS and Linux, so the build work is small.

6. **Paid-upfront on iOS ($1.99 to $2.99, no ads).** Honest and simple, but paid mobile games get very few installs unless the name is already known (see the digging game above). Test on one game at most, after the free versions are live.

7. **A non-game subscription or utility app.** Not now. RevenueCat's 2026 data: a year after launch the middle half of subscription apps earn $16 to $429 a month and only about 17% reach $1,000 a month within two years. A utility lives on search demand that has to be found first, and it would restart the studio's pipeline from zero. Revisit once two games are live and earning, with a specific search term in hand.

## What this means for our queue

- **No new game starts until the first game is in App Review.** Five are in flight already. Free builder slots go to the shipping list first: iOS pipeline, real ads and purchases, store assets, then discovery assets (screenshots, preview clips).
- **Finish order (unchanged at the top):** Burn Down a Forest (polish pass done, closest to ready), Dig to the Core (the theme with the clearest proven demand), Burn a Cardboard City, then Drain an Ocean and Eat a Giant Cake.
- **Queued games, reordered by how different they are from what we already have and how well the idea shows in a three-second clip:** Dust a Haunted House (cleaning is a proven "satisfying" theme and nothing in the catalog is like it), Unbury a Pyramid, Erase a Mountain, then Thaw a Frozen Planet and Defrost a Freezer last (both are melting games like the reference game, so they add the least and carry the most "similar app" review risk; either could be a map inside an existing game instead).
- **Store names.** Keep the plain "verb a thing" names; they say what the game is in the search result. Put the genre words in the subtitle and keyword field.

## Gaps this week

- App Store top charts and keyword competition could not be read from here (Apple's chart endpoints refuse automated fetching). Next refresh: try a chart-tracking site, and ask the owner for a look at App Store Connect search terms once a game is live.
- No good source for rewarded-ad views per player in short games with an ending, or for install-to-buyer rates in idle games. Our own numbers will replace these estimates within a month of the first launch.
- Short-video results for mobile games are anecdotal and mostly older than 2023.

## Sources (with the age of the data)

Primary:
- Apple, App Store Small Business Program (15%, enrolment required): https://developer.apple.com/app-store/small-business-program/ (current page, 2026)
- Apple, Developer Program fee ($99 a year): https://developer.apple.com/programs/whats-included/ (current page, 2026)
- Apple, Getting featured (nominations, lead times): https://developer.apple.com/app-store/getting-featured/ (current page, 2026)
- Apple, App Store search (what is indexed): https://developer.apple.com/app-store/search/ and product page limits: https://developer.apple.com/app-store/product-page/ (current pages)
- Valve, Steam Direct fee: https://partner.steamgames.com/doc/gettingstarted/appfee (current page)
- RevenueCat, State of Subscription Apps 2026, gaming: https://www.revenuecat.com/state-of-subscription-apps-2026-gaming (2025 data; subscription apps only)
- Sensor Tower, State of Gaming press release: https://sensortower.com/press/press-release-sensor-tower-state-of-gaming-gaming-drove-52-billion-downloads-82b-iap-revenue-on-mobile-and-12b-premium-revenue-on-steam (Feb 2026; 2025 data: mobile game purchases $82B, up 1%)

Secondary and vendor (treat ranges as rough):
- Playio, mobile game eCPM benchmarks 2026: https://blog.playio.co/mobile-game-ecpm-benchmarks-2026 and rewarded ad benchmarks: https://blog.playio.co/rewarded-ad-benchmarks-2026 (2026 posts citing Tenjin Q2 2024, Appodeal Q4 2024, MAF 2026, Playwire 2025)
- Playio, ARPDAU benchmarks: https://blog.playio.co/arpdau-benchmarks-mobile-games (Sep 2026; ranges with no stated method)
- MonetizeMore, app ad revenue: https://www.monetizemore.com/blog/how-much-ad-revenue-can-apps-generate/ (Jan 2026; labelled estimates)
- AppsFlyer app monetization 2026, via GameDev Reports: https://gamedevreports.substack.com/p/appsflyer-app-monetization-in-2026 (Jun 2026; Jan 2025 to Mar 2026 data; sponsored post)
- Sensor Tower mobile game ad monetization, via GameDev Reports: https://gamedevreports.substack.com/p/sensor-tower-mobile-game-ad-monetization (Jul 2026; 84% of game downloads are ad-supported)
- RevenueCat 2026 coverage: https://ppc.land/the-app-middle-class-is-dying-and-revenuecats-data-shows-exactly-how-fast/ (Mar 2026)
- Kongregate, best practices for in-game ads: https://blog.kongregate.com/best-practices-in-game-ads (undated, older; its own games)
- GameAnalytics idle benchmarks, via WN Hub: https://wnhub.io/news/marketing/item-3203 (Dec 2020, stale: idle games 5.3 sessions a day, 8-minute sessions, top-quartile day-1 retention 39%)
- How To Market A Game, Q1 2026 Steam releases: https://howtomarketagame.com/2026/05/14/2026-q1-games/ (May 2026)
- AppMagic, idle games on Steam 2026: https://appmagic.rocks/blog/idle-steam-games-2026 (Apr 2026; third-party estimates; most idle titles priced $3 to $15)
- GameDev Report newsletter, incremental games on Steam: https://gamedevreport.beehiiv.com/p/indie-dev-makes-4-mil-then-goes-broke-and-hottest-new-genre-on-steam (Aug 2025; no stated method)
- GameDiscoverCo, TikTok advice and the Card Crawl Adventure figures: https://newsletter.gamediscover.co/p/tiktok-practical-advice-for-big-discovery (Oct 2022)

Real numbers from individual developers:
- Tiny Terraces first month, Steam and mobile: https://www.gamepressure.com/newsroom/how-much-can-you-earn-as-an-indie-dev-tiny-terraces-creator-share/zb889b (Nov 2025)
- GravityShot, a Godot mobile game with no marketing (under 50 downloads, $0.10): https://gamedo-live.pages.dev/news/gravityshot-postmortem-shipping-mobile-game-godot (May 2026; Google Play only)
- A new iOS utility's first month (82 to 97 downloads, nothing earned, 90.6% from search): https://habitdoom-website.pages.dev/blog/what-82-ios-downloads-taught-me (Mar 2026)
- A Game About Digging A Hole: PC sales https://www.gamesmarket.global/collaboration-rokaplay-and-headup-are-bringing-a-game-about-digging-a-hole-to-mobile-74f2648bba44de84f8617e203450bec0/ (Jul 2025) and mobile estimate https://appgoblin.info/apps/6744608603 (Oct 2026)

## The app list (addendum, 2026-11-11)

The owner's nine no-server utility apps come first (STUDIO.md, "Apps"). This section is filled in app by app as each one is built; the full weekly refresh adds the rest. Everything here is from one short research pass, mostly third-party pages, and is marked where it is weak.

### 1. Home inventory (`plainproof`; named Plainproof by the owner on 2026-11-11, working name was Roomfile)

**Competitors and what they charge** (third-party pages, checked 2026-11-11; the App Store's own pages and search could not be reached from the workspace):

| App | Model | Price | Free tier | Where the data lives |
|---|---|---|---|---|
| Home Contents | One-time unlock | $5.99 | 25 items, 1 property | On the device, with iCloud |
| Nest Egg | One-time, plus add-ons | $6.99 base | not verified | On the device, with backup options |
| Under My Roof | Subscription | $34.99 a year | 10 items | On the device, with iCloud |
| Everspruce | Subscription | $44.99 to $49.99 a year | 50 entries | Cloud backup |
| Itemtopia | Subscription | $79.99 a year | not verified | Cloud service |
| Sortly | Subscription | $4.99 a month or $47.99 a year | Free plan, sync is paid | Cloud |
| Encircle | Free | | | Has a web side; account not verified |

Sources: a comparison page published by another inventory app, so read it with care (https://stuffolio-site.pages.dev/compare, September 2026), and an insurance broker's round-up (https://www.insuramatch.com/blog/best-home-inventory-apps, undated).

**What people complain about** (aggregated App Store reviews, pages from September 2026):

- An inventory lost when a free app turned subscription-only, with no warning and no export; several reviewers asking for a one-time price, one saying they would "100% be a paying customer" for it (https://justuseapp.com/en/app/1393940808/everspruce-home-inventory/reviews).
- Recurring fees of about $25 to $48 a year felt wrong for a tool used mainly once, at set-up; a migration from the older app that could not read the data; slowness and crashes (https://justuseapp.com/en/app/1524335878/under-my-roof-home-inventory/reviews).
- No complaints were found about exports being locked behind a paywall, which may only mean the search was short.

**What this means for the app.**

- **Price: $5.99 once. Free limit: 20 items, with every feature** (the research suggested 25, the one pay-once competitor's number; the owner set 20 on 2026-11-11). It matches the one pay-once competitor with a free tier and sits under the other, and the loudest complaint in the category is the thing this app does not do. Nothing a person has added is ever locked, and the backup is a plain file they keep: the opposite of the lost-inventory story.
- **Store text leads with the three things reviewers ask for:** pay once, no account, your data stays yours. Draft in `store/plainproof/listing.json`.
- **Search terms** (no volume data was found; this is a guess to be replaced by App Store Connect's own numbers after launch): "home inventory" is the main term and the crowded one, so it is in the name; "insurance" and "belongings" are in the subtitle; the keyword field covers household, contents, claim, renters, homeowners, moving, possessions, serial, receipt, valuables.
- **Name:** the owner chose "Plainproof" on 2026-11-11 (the working name was Roomfile). Apple accepted "Plainproof: Home Inventory" when the app record was created, so the name is free on the App Store.
- **Privacy label:** RevenueCat's guide says an app that uses it must declare Purchase History ("Purchases"), not linked to the person when ids are anonymous (https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy). So an app with RevenueCat is "Data not linked to you: Purchases", not "Data Not Collected". This applies to all nine apps and is the owner's call.

**The math (estimate).** At $5.99 the studio keeps about $5.09 a sale under the Small Business Program (15%). The target of $208.25 a month is about 41 sales a month from this app alone, or about 5 a month from each of nine apps. No published conversion rate for pay-once utilities was found; if 2% to 5% of people who install it buy (an assumption, not a source), 41 sales need roughly 800 to 2,000 installs a month, which a new app does not get from search on its own (see "Summary"). The apps earn their keep as a catalog, and each one needs its own search terms to bring its own installs.

