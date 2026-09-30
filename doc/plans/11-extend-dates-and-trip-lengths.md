# Phase 11 — Edit a Search's Dates and Combine Trip Lengths (branch `request`)

**Goal:** from a results page, the user can widen or narrow a finished
search's date range in a two-month calendar, and the app searches **only the
days not searched yet**, then combines them with the saved flights into the
same search. The Trip length filter becomes a **multi-select of 1–15 nights**;
lengths the saved flights can't answer lead to the same "search the missing
dates" flow. Outdated searches can't be extended, and **"outdated" now
depends on how soon the flights are** (section 6): 1 day for flights about a
month away, 12 hours for flights 1–2 weeks away, and so on.

**Depends on:** the Trip length filter (`tripLength.ts`, `TripLengthGroup.tsx`)
and the separate flight records (`db/records.ts`, `loadGatheredFlights`),
both already in the working tree.
**Blocks:** nothing.

---

## 0 — Decisions

Confirmed with the user:

| Question | Decision |
| --- | --- |
| "Always 15 days" | The Trip length filter always shows **1 to 15 nights** as buttons, whether or not the saved flights can answer them |
| A partly covered length (e.g. 5 nights: 16 of 18 days) | **Selectable at once**, showing the covered days; its note offers **"Search the missing days"**, which opens the calendar flow. The central modal is forced only for a length with **0** covered days |
| Starting the extra search | The home page opens **prefilled with only the missing searches** and the usual time estimate; the user presses **Run** |
| Saving | The new flights are **merged into the same search**: same id, same history card, one records key; the results page reopens on it |
| When a search is outdated | **Depends on how far away its flights are** (section 6), replacing the fixed 1 day. Example given: flights starting about a month later → outdated after **1 day**; flights 1–2 weeks later → after **12 hours** |

Defaults chosen in this plan (easy to change):

| Default | Why |
| --- | --- |
| **"Edit search" opens the calendar only for date-range Google Flights searches with saved flights** (`kind === "google-curl"`, `dateMode === "advanced"`, `gatheredFlightsOf(entry) > 0`). Exact-date and SerpApi/Travelpayouts searches keep today's link to the home page | Only those have per-day records that can be topped up and rebuilt |
| **"Outdated" = `isStale(entry)`**, the one freshness rule the app has, which section 6 makes depend on the travel date | The calendar doesn't open; a small modal says how old the prices are and offers "New search" (today's link home) |
| **Freshness is judged from the search's earliest departure day still in the future, measured against now** (not against the save time) | A search gets stricter as its flights get closer, which is how prices behave. The earliest day decides, because that's where prices move fastest |
| **Narrowing the range needs no search**: it filters the results by departure day on the results page and is not saved | Everything needed is already there; saving a smaller range would throw data away |
| **Days outside the old range are the only ones searched when widening**; the calendar marks already-searched days | "Search the dates he didn't search already" |
| **Hand-off to the home page by URL**: `/?extend=<searchId>&start=YYYY-MM-DD&end=YYYY-MM-DD&nights=5,10` | Survives a reload, needs no new storage key, and nothing about the user's Google session is involved |
| **Combined trip lengths are saved as a list**: new optional `SearchQuery.tripLengths?: number[]` (the searched length plus the added ones). `returnDatesFor` returns `departure + n` for each | A fixed length searches returns past the range end (7 nights from 28 Nov returns 5 Dec). The existing open length (`tripLengthRange`) keeps returns inside the window, so it can't express "5, 7 and 10 nights from these days" |
| **The merged search keeps its original `savedAt`** | Its age stays that of its oldest flights, so the 24 h rule stays honest. The run's own time goes into a new `extendedAt` (display only) |
| **Several selected lengths show as a union**, duplicates merged by `uniqueArrangements` | "Multiple select" |
| **The "N selected" pill** sits sticky at the top-right of the filter sidebar while two or more lengths are selected, and scrolls to the Trip length section when clicked | "A small element floating near the filter part" |
| **The 0-coverage modal uses the framework's `FixedModal`** (`@/framework/ui/context/FixedModal`); the calendar uses the app's wide `Dialog`, as `AdvancedCalendarModal` does | `instructions/ui-components.md` requires `FixedModal` for ordinary dialogs; `Dialog.tsx` exists because the calendar doesn't fit `max-w-md` |
| **Maximum range stays `MAX_ADVANCED_RANGE_DAYS` (45)** | Same limit as a new search |

---

## 1 — Risks and blockers

- **Run time.** Widening by 10 days at 7 nights is about 20 more searches
  (10 going, 10 return), plus feeder searches: 5–15 minutes with the pacing.
  The calendar shows the count and the estimate before anything runs.
- **Freshness mismatch.** Old flights may be up to 24 h old while the new
  ones are minutes old. The results mix both. This is accepted; the header
  keeps saying "Saved N hours ago" from the original run.
- **A run that crosses the 24 h line** finishes with a search that is already
  stale. It is still saved; the header shows the usual stale warning.
- **Google's 300-flight cap** applies to the new requests exactly as before.
- **Record size grows** with each extension (Brussels was 51 MB for 38 days).
  It stays within `STORAGE_MAX_VALUE_CHARS` (100 MB) for the 45-day maximum.
- **Records built for already-searched routes must not overwrite old ones.**
  `recordsFromCurlFlights(query, flights)` returns a record for *every*
  planned route, empty for those not sent. The merge must keep only the
  records of the routes this run searched (see 4.3).

---

## 2 — Architecture

```
Results page                                   Home page
─────────────                                  ─────────
"Edit search" ──► ExtendDatesModal ──narrow──► view range (page state, no search)
                     │ widen / add lengths
                     ▼
        /?extend=<id>&start&end&nights ──────► reads params → extended query
                                               missingJobs(query, searchedIds)
                                               banner "Adding N days to <label>"
                                               user presses Run (useSessionRun)
                                                     │ finishRun(…, extend)
                                                     ▼
                                               extendCurlSearch(old, query, new records)
                                               merge records → rebuild → saveSearch (same id)
                                                     │
Results page ◄──────────── /results?search=<id>&source=google-curl
```

The rebuild uses the existing pipeline: `poolFromRecords` → `buildSearchResult`
(`search.ts`), exactly as `runCurlSearch` does.

---

## 3 — Shared logic: `app/lib/airsearcher/extend.ts` (new)

Pure functions, covered by checks:

- `searchedIds(records: FlightRecord[]): Set<string>`: the `searchId`s the
  saved search already holds (record `id` is `searchId(search)`).
- `extendedQuery(entry, range, extraNights: number[]): SearchQuery`: the
  saved query with the new `dateRange`, and `tripLengths` = the searched
  length ∪ `extraNights` (sorted; omitted when only the searched length).
- `missingSearches(query, have): PlannedSearch[]`: `coveredByCache(planSearches(query), have).needed`
  (the helper already exists in `queryPlan.ts` and is unused today).
- `missingJobs(query, have): GeneratedJob[]`: the `sessionRequestsFor(query)`
  jobs that contain at least one missing route (same `date` and `direction`,
  its `from`/`to` inside the job's airport lists).
- `mergeRecords(old, fresh, sent: Set<string>): FlightRecord[]`: old records,
  plus fresh records whose id is in `sent` (a fresh record replaces an old one
  with the same id).
- `canExtend(entry, now): { ok: true } | { ok: false; reason: "stale" | "unsupported" }`.

`queryPlan.ts`: `returnDatesFor` gains the `tripLengths` case
(`tripLengths.map((n) => addDays(departureDate, n))`); `describeTripLength`
shows "5, 7, 10 nights". `types.ts`: `SearchQuery.tripLengths?: number[]`.
`searchKeyOf` must include it so a combined search never matches a plain one.

---

## 4 — Feature A: "Edit search" opens a date calendar

### 4.1 `ResultsHeader.tsx`
The "Edit search" link becomes a button with an `onEditDates` prop when
`canExtend` is ok; stale → opens the small "Prices are over a day old"
`FixedModal`; unsupported → today's `href="/"`.

### 4.2 `calendar/ExtendDatesModal.tsx` (new)
Built from the same parts as `AdvancedCalendarModal`: `Dialog`, two
`MonthGrid`s, and `extendRange` for clicks. Range only: no exclude or
prioritise modes, and no length inputs.

- `DayCell` / `DayState` gain `searched: boolean`: already-searched departure
  days get a subtle fill, so the user sees what exists.
- The footer shows live: "N new departure days · M searches · ~mm:ss"
  (`missingJobs` + `planSchedule`/`scheduleTotalMs` from `pacing.ts` with
  `BROWSER_SEARCH_ESTIMATE_MS`), or "No search needed" when only narrowing.
- Props: `entry`, `extraNights` (from feature B, default `[]`), `onNarrow(range)`
  and `onSearch(range)`.
- **Apply** narrows in place when the new range is inside the old one and no
  length was added; otherwise it navigates to the `/?extend=…` URL.

### 4.3 Home page (`app/page.tsx`, `CurlRequestsPanel.tsx`, `SessionCurlPanel.tsx`, `useSessionRun.ts`)
- `app/page.tsx` reads `extend/start/end/nights` after `storageReady()`,
  loads the entry (`findSearchById`), checks `canExtend` again, loads its
  records (`loadGatheredFlights`), and sets the query to `extendedQuery(...)`.
  It passes `extension = { entry, have: searchedIds(records) }` down.
- A banner above the run panel: "Adding dates to Venice + Florence: 22 new
  searches; 72 already done are reused" with "Cancel" (clears the params).
- `useSessionRun(query, onFinished, extension?)`: `jobs` become
  `missingJobs(query, extension.have)` when extending. Everything else
  (pacing, retry, statuses) is unchanged.
- `finishRun(query, outcome, extension?)` (`curlRunner.ts`) calls
  `extendCurlSearch` instead of `runCurlSearch` when extending.

### 4.4 `search.ts`: `extendCurlSearch(entry, query, freshRecords, sent, warnings, requests)`
Merges the records (`mergeRecords`), rebuilds with `buildSearchResult`,
and saves with the **same id** and original `savedAt`. The saved entry gets:
- the extended query and a new `label`;
- `extendedAt` set to now;
- requests and warnings with the new ones added after the old;
- `uniqueFlights` recounted.

`saveSearch` already replaces by id and writes the records key.

### 4.5 Results page narrowing (`app/results/page.tsx`)
New page state `viewRange`: when set, `allCities` keeps only arrangements
whose `departureDate` is inside it; `DateRangeView` gets the query with that
range; the toolbar's "Reset filters" clears it.

---

## 5 — Feature B: Trip length 1–15, multi-select

### 5.1 `tripLength.ts`
- `TRIP_LENGTH_BUTTONS = 15` in `lib/airsearcher/config/constants.ts`.
- `lengthOptions(query)` returns **all of 1–15**, each with `departures`
  (covered days, possibly empty) and `total`.
- `rebuildForLengths(query, preferences, records, nights[])` builds each
  length (cached per length in the page) and merges them with
  `uniqueArrangements`. The searched length reuses the stored arrangements.

### 5.2 `TripLengthGroup.tsx`
- Buttons 1–15 are toggles. Each shows one of three states: covered on every
  day, partly covered (a small dot), or no data (muted, dashed border).
- Clicking a length with data toggles it in `nights: number[]` (page state
  in `results/page.tsx`, replacing today's single `nights`).
- Clicking a length with no data opens the `FixedModal`: "No flights for N
  nights yet. A search for the missing dates must happen to combine the
  results." It has two buttons:
  - **Choose dates** opens `ExtendDatesModal` with `extraNights=[N]`.
  - **Cancel**.
- Partly covered selected lengths list "N nights: 16 of 18 days" and a
  **"Search the missing days"** link, which opens `ExtendDatesModal` with
  those lengths.

### 5.3 "N selected" pill (`FilterSidebar.tsx`)
When `nights.length >= 2`: a small sticky pill, "3 lengths selected", sits
at the top-right of the sidebar and scrolls to the Trip length section on
click. It is hidden while the sidebar is hidden (the toolbar count already
shows the result number).

### 5.4 Coverage after an extension
Once a search is saved with `tripLengths`, `lengthOptions` uses
`returnDatesFor` and so reports those lengths as fully covered; a search
extended for 10 nights shows 10 as a normal length from then on.

---

## 6 — Freshness depends on how soon the flights are

Today `isStale` (`lib/airsearcher/storage.ts`) calls a search outdated
24 hours after it was saved, whatever the travel date
(`RESULT_FRESHNESS_MS` in `lib/airsearcher/config/constants.ts`). Prices of
flights months away barely move in a day, while those of flights next week
move within hours. The limit becomes a table keyed on how many days remain
until the flights.

### 6.1 The table (`lib/airsearcher/config/constants.ts`)
Replaces `RESULT_FRESHNESS_MS` with `RESULT_FRESHNESS_BY_DAYS_AHEAD`, checked
from the top:

| Earliest departure is… | Outdated after |
| --- | --- |
| 90 days or more away | **5 days** |
| 31–89 days away | **2 days** |
| 15–30 days away (about a month) | **1 day** |
| 7–14 days away (1–2 weeks) | **12 hours** |
| 2–6 days away | **4 hours** |
| under 2 days away | **1 hour** |

Built from the rule-of-thumb table given in chat, taking the stricter end of
each range. Airlines don't publish these figures, so the numbers are easy to
tune in one place.

### 6.2 `isStale(entry, now)`, still the only place the rule is applied
- Find the earliest departure day of the search that is today or later:
  `candidateDates(entry.query)` (the departure days), or
  `query.departureDate` for exact dates.
- Days ahead = whole days from `now` to that day; the limit is that row of
  the table.
- Stale when `now − savedAt` > limit, or when every departure day has already
  passed. An unreadable `savedAt` is stale, as today.
- A new helper `freshnessLimitMs(entry, now)` returns the limit, so the
  messages can name it.

Everything that already uses `isStale` follows automatically:
- `pruneOutdatedResults` and `saveSearch` (removing outdated results);
- `findFreshByKey` (reusing a result);
- the history card and the results-page warnings;
- the extension rule in section 4.

A merged search (section 4.4) keeps its original `savedAt`, so it is judged
by its oldest flights.

### 6.3 Messages that say "a day"
These texts become relative, using `freshnessLimitMs` and a small
`formatDuration`-style label ("1 day", "12 hours"):
- `SearchHistoryCard.tsx`: "Results removed · older than a day" becomes
  "…older than 12 hours (flights within 2 weeks)".
- `ResultsHeader.tsx`: the stale warning.
- `app/results/page.tsx`: the two toasts and the "results were removed" line.
- `config/storage.ts` and `config/constants.ts` comments that mention one day.

### 6.4 Effect on saved searches
When the change first runs, searches for trips 3+ months away keep their
results up to 5 days. Near-term searches (under 2 weeks) lose theirs sooner
than today. Results already removed stay removed; nothing comes back.

---

## Testing

Offline checks in `app/lib/airsearcher/__checks__/run.ts`:
- `returnDatesFor` with `tripLengths` returns every length's return day;
  `describeTripLength` shows "5, 7, 10 nights".
- `missingSearches` / `missingJobs`:
  - widening 11–28 Nov to 11 Nov–2 Dec at 7 nights needs only the going days
    29 Nov–2 Dec and the return days 6–9 Dec (plus feeders), and nothing else;
  - narrowing needs none.
- `mergeRecords` keeps old records for routes not sent, and replaces the ones
  sent.
- `extendCurlSearch` keeps the id and `savedAt`. Rebuilding with no new
  records gives exactly the stored arrangements (the same check the Trip
  length rebuild passed: 191 = 191).
- `lengthOptions` returns 1–15 with the right covered days, including 0.

Storage checks (`__checks__/storage.ts`):
- Saving an extended search replaces the entry and its records key in place.
- **Freshness by travel date:**
  - a search saved 20 h ago for flights 30 days away is fresh;
  - saved 25 h ago, it is stale;
  - saved 13 h ago for flights 10 days away, it is stale;
  - saved 3 days ago for flights 4 months away, it is fresh;
  - a range whose earliest days have passed is judged by its first future day;
  - all days passed means stale.
- `pruneOutdatedResults` removes only what the new rule calls stale (update
  the existing "outdated searches keep their card" check, which assumes
  24 h).

In the browser (Firefox and Chromium, Playwright, the local database only):
- stale search → modal, no calendar;
- narrowing → fewer results, no navigation;
- widening → home page shows only the missing jobs, and the banner and
  estimate match;
- 0-coverage length → modal → calendar.

**No live Google run in testing** unless the user starts one; the extension
path is checked by feeding `extendCurlSearch` saved records.

---

## Task list

| # | Task | Files |
| --- | --- | --- |
| 1 | `tripLengths` in the query, returns per length, description, search key | `lib/airsearcher/types.ts`, `queryPlan.ts`, `search.ts` (`searchKeyOf`) |
| 2 | Pure extension helpers + checks | `lib/airsearcher/extend.ts` (new), `__checks__/run.ts` |
| 3 | `extendCurlSearch` + `finishRun` extension path + checks | `search.ts`, `components/airsearcher/home/curl/curlRunner.ts`, `storage.ts` (`extendedAt` on `StoredSearch`) |
| 4 | `useSessionRun` with only the missing jobs | `home/curl/useSessionRun.ts`, `SessionCurlPanel.tsx`, `CurlRequestsPanel.tsx` |
| 5 | Home page reads `?extend=…`, banner, cancel | `app/page.tsx`, new `home/ExtendBanner.tsx` |
| 6 | `DayCell` searched state + `ExtendDatesModal` | `calendar/DayCell.tsx`, `calendar/MonthGrid.tsx`, `calendar/ExtendDatesModal.tsx` (new) |
| 7 | "Edit search" button, stale `FixedModal`, narrowing view range | `results/ResultsHeader.tsx`, `app/results/page.tsx` |
| 8 | Trip length 1–15, three states, multi-select union, 0-coverage modal, "Search the missing days" | `lib/airsearcher/tripLength.ts`, `config/constants.ts` (lib), `filters/groups/TripLengthGroup.tsx`, `app/results/page.tsx` |
| 9 | "N lengths selected" sticky pill | `filters/FilterSidebar.tsx` |
| 10 | Freshness table + `isStale`/`freshnessLimitMs` by earliest future departure, with checks | `lib/airsearcher/config/constants.ts`, `lib/airsearcher/storage.ts`, `__checks__/storage.ts` |
| 11 | Relative "outdated" wording everywhere it says "a day" | `home/SearchHistoryCard.tsx`, `results/ResultsHeader.tsx`, `app/results/page.tsx`, `lib/airsearcher/config/storage.ts` (comment) |
| 12 | Browser pass (both engines), type check, lint, all checks | — |

Files **not** touched: `app/api/**` (no endpoint changes; the storage route
already reads/writes records keys), `app/config/**`, `app/framework/**`
(`FixedModal` is only used), `prisma/schema.prisma`.

## Open items

- None blocking. To confirm when implementing: the look of the three length
  states (dot for partial, dashed for no data) and the exact placement of the
  "N selected" pill. Both can be adjusted after a first screenshot.
