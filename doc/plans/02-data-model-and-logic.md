# Phase 02 — Data Model, Ported Logic, Mock Data

**Goal:** stand up `app/lib/airsearcher/` and `app/data/` — the types, the
ported scoring and filtering logic, the group-arrangement builder, the query
planner, the localStorage layer, and enough mock data that the Home and Results
pages have something real-shaped to render.

**Depends on:** nothing. **Blocks:** 03, 05, 06.

**Nothing in this phase renders.** It is pure TypeScript, unit-testable, no
React, no network.

**Reference:** `c:/Users/kopot/Desktop/Dimitris/CODING/WORKING-ON/serpAPItest/my-app`.
Read `lib/ranking.ts`, `lib/filtering.ts`, `lib/combinations.ts`,
`lib/serpapi-flights.ts`, `lib/quota.ts`, `lib/saved-searches.ts`,
`config/ranking.ts` and `config/filters.ts` before writing anything. Their
arithmetic is the specification — do not re-derive it.

---

## Task 2.1 — `app/lib/airsearcher/types.ts`

Copy the normalized flight shapes from the reference's `lib/serpapi-flights.ts`:
`NormalizedEndpoint`, `NormalizedSegment`, `NormalizedLayover`, `NormalizedLeg`,
`NormalizedFlight`, `Itinerary`, `FlightCategory`, `SearchMode`. Keep field
names identical so a later real-API phase drops straight in.

Add the airsearcher-specific types from spec section 5: `AirportCode`,
`Airport`, `City`, `OriginGroup`, `Routing`, `GroupLeg`, `Arrangement`.

Add the search-query type:

```ts
export interface SearchQuery {
  destination: { cityId: string; airports: AirportCode[] };
  origins: OriginGroup[];
  gatheringAirport: AirportCode;
  tripType: "round-trip" | "one-way";
  dateMode: "exact" | "advanced";
  departureDate: string | null;          // exact mode
  returnDate: string | null;             // exact mode, round trip only
  dateRange: { start: string; end: string } | null;  // advanced mode
  tripDurationDays: number | null;                   // advanced mode
  excludedDates: string[];
  priorityDates: string[];
}
```

Every type gets a one-line doc comment. No behaviour in this file.

---

## Task 2.2 — `app/lib/airsearcher/config/`

Three files, all plain `const` exports. These are airsearcher's tunables — they
live here, **not** in `app/config/`, which belongs to the user.

**`constants.ts`**

```ts
export const RESULT_FRESHNESS_MS = 24 * 60 * 60 * 1000;
export const MAX_SAVED_SEARCHES = 10;
export const DEFAULT_GATHERING_AIRPORT = "ATH";
export const GREEK_ORIGIN_DEFAULTS = ["ATH", "SKG", "HER"] as const;
export const MAX_ADVANCED_RANGE_DAYS = 45;
export const AIRPORT_ZOOM_THRESHOLD = 6;   // Leaflet zoom below which airports hide
```

Each gets a doc comment saying what changing it does. `RESULT_FRESHNESS_MS` is
the one-day threshold the instructions require to be adjustable — no other file
may express 24 hours.

**`ranking.ts`** — copy `HourCurve`, `RankingWeights`, `ResultLimits`,
`RankingPreferences`, `DEFAULT_OUTBOUND_CURVE`, `DEFAULT_RETURN_CURVE`,
`DEFAULT_RESULT_LIMITS`, `DEFAULT_RANKING_CONFIG` from the reference's
`config/ranking.ts` **unchanged**, then add the five-level weight scale:

```ts
export const WEIGHT_LEVELS = ["none", "a little", "mid", "much", "completely"] as const;
export type WeightLevel = (typeof WEIGHT_LEVELS)[number];
export const WEIGHT_VALUES: Record<WeightLevel, number> = {
  none: 0, "a little": 25, mid: 50, much: 75, completely: 100,
};
export function levelToWeight(level: WeightLevel): number;
export function weightToLevel(value: number): WeightLevel;  // nearest level
```

Keep `departureArrivalRatio: 0.65` in `DEFAULT_RANKING_CONFIG`. It is used but
no longer user-editable (its filter control is removed per the instructions).

Also add the date-preference shape used by the advanced calendar:

```ts
export interface DatePreferences {
  excluded: string[];                    // ISO dates that must not be used
  priority: Record<string, number>;      // ISO date -> 1..3, higher wins ties
}
```

**`filters.ts`** — start from the reference's `config/filters.ts`, then apply the
instruction changes:

- Drop `"multi-city"` from `TripType` and from `TRIP_TYPE_OPTIONS`, and drop the
  `supported` flag (every remaining option is supported).
- Add `arrivalWindow` fields mirroring the outbound/return time windows:
  `outboundArrivalWindow`, `returnArrivalWindow`, both `[number, number]`.
- Add a per-filter scope so a filter can target one direction:

  ```ts
  export type FilterScope = "both" | "going" | "returning";
  export const SCOPABLE_FILTERS = ["stops", "price", "airlines", "times",
    "duration", "avoidAirports", "cabin"] as const;
  export type ScopableFilter = (typeof SCOPABLE_FILTERS)[number];
  ```

  and `scopes: Record<ScopableFilter, FilterScope>` on `FilterState`, all
  defaulting to `"both"`.
- Add `departureAirports: OriginGroup[]` and `preferredGatheringAirport: AirportCode`
  to `FilterState` (the new Departure Airports filter).
- Replace the numeric price/hour weights in the sidebar with
  `priceWeight: WeightLevel` and `hourWeight: WeightLevel`.
- Keep `excludeAirports: string[]` (now multi-select with Select All — a UI
  change only).
- Export `DEFAULT_FILTERS` with every new field defaulted, and update
  `countActiveFilters` to count the new fields.
- Export `resetFilters(current: FilterState): FilterState` returning
  `DEFAULT_FILTERS` while preserving `type` — backing the "Reset All Filters"
  button.

---

## Task 2.3 — `app/lib/airsearcher/ranking.ts`

Copy the reference `lib/ranking.ts` **verbatim** apart from import paths:
`parseFlightHour`, `hourValue`, `legHourIndex`, `priceIndex`, `normalizeWeights`,
`scoreFlights`, `sortFlights`, `SortMode`, `ScoredFlight`.

Do not change the arithmetic. Do not "improve" it. It is the reference
specification for how flights are weighted.

---

## Task 2.4 — `app/lib/airsearcher/filtering.ts`

Copy the reference `lib/filtering.ts`, then extend for scope:

- Every `matchesX` predicate keeps its existing signature and behaviour.
- Add a wrapper `applyScopedFilters(itineraries, filters)` which, for each
  scopable filter, applies the predicate to the outbound leg only, the return
  leg only, or both, according to `filters.scopes[key]`.
- `matchesTimeWindow` is called twice per direction: once against the departure
  time with the departure window, once against the arrival time with the arrival
  window.
- Keep `countsFor` and `explainEmpty` — the sidebar shows per-value survivor
  counts and an empty-state reason.

---

## Task 2.5 — `app/lib/airsearcher/combinations.ts`

Copy the reference `lib/combinations.ts` (`buildItineraries`, `scoreItineraries`,
`sortItineraries`, `selectTop`, `airlinesIn`). It pairs outbound and return
flights, caps each direction to keep the pair count bounded, and caps how many
results may share one outbound.

This operates on a **single origin/destination pair**. Group assembly is the
next file's job — keep the two separate.

---

## Task 2.6 — `app/lib/airsearcher/grouping.ts` (new logic)

The one genuinely new module. It turns per-pair itineraries into whole-group
`Arrangement`s.

```ts
/** Every routing combination: each non-gathering origin is direct or gathers. */
export function enumerateRoutings(
  origins: OriginGroup[],
  gatheringAirport: AirportCode,
  allow: { direct: boolean; gather: boolean },
): Record<AirportCode, Routing>[];

/** Assembles one arrangement per routing, picking the best itinerary per leg. */
export function buildArrangements(args: {
  origins: OriginGroup[];
  gatheringAirport: AirportCode;
  destination: { cityId: string; airport: AirportCode };
  /** Itineraries keyed by `${from}-${to}` — the shared pool. */
  pool: Record<string, Itinerary[]>;
  preferences: RankingPreferences;
}): Arrangement[];

/** Passenger-weighted scoring across the group (spec section 6). */
export function scoreArrangements(
  arrangements: Arrangement[],
  weights: RankingWeights,
  preferences: RankingPreferences,
): Arrangement[];

export function sortArrangements(list: Arrangement[], mode: SortMode): Arrangement[];
```

Rules:

- The origin equal to `gatheringAirport` is always `"direct"` — it is already
  there. `enumerateRoutings` must not emit a routing that sends Athens to Athens.
- A `"gather"` leg is only valid if the feeder arrives at the gathering airport
  **before** the main flight departs, with a configurable minimum connection
  buffer. Add `MIN_GATHER_BUFFER_MINUTES = 90` to `config/constants.ts` and
  reject invalid combinations rather than scoring them badly.
- `feeder` is `null` for direct legs and for the gathering origin itself.
- `totals.totalPrice` sums `itinerary.price * passengers` across every leg,
  counting the feeder where present.
- Scoring calls `priceIndex`, `legHourIndex` and `normalizeWeights` from
  `ranking.ts` — never its own arithmetic.

Write unit tests for this module (see task 2.10); it is the only place where new
logic can be wrong.

---

## Task 2.7 — `app/lib/airsearcher/queryPlan.ts` + `quota.ts`

**`queryPlan.ts`**

```ts
export interface PlannedSearch {
  from: AirportCode; to: AirportCode; date: string;
  direction: "outbound" | "return";
  /** Why this search exists — shown in the cost breakdown UI. */
  reason: "main" | "feeder" | "direct";
}

/** Deduplicated set of searches needed to evaluate every arrangement. */
export function planSearches(query: SearchQuery, allow: { direct; gather }): PlannedSearch[];

/** Which planned searches are already covered by fresh stored results. */
export function coveredByCache(plan: PlannedSearch[], key: string): {
  needed: PlannedSearch[]; reused: PlannedSearch[];
};
```

Deduplication is on `${from}-${to}-${date}-${direction}` — this is what makes
feeder legs shared across destinations and the main leg shared across all
gathering origins (spec section 7). In advanced date mode the plan is produced
per candidate departure date, then deduplicated across the whole range.

**`quota.ts`** — copy the reference `lib/quota.ts` shape:

```ts
export function costOf(plan: PlannedSearch[]): number;   // = plan.length
export function needsConfirmation(cost: number): boolean; // cost > 1
export function describeCost(cost: number): string;
/** Grouped breakdown for the confirmation dialog. */
export function explainCost(plan: PlannedSearch[]): { reason; count }[];
```

Pure functions. No network, no React.

---

## Task 2.8 — `app/lib/airsearcher/storage.ts` + `searchKey.ts`

**`searchKey.ts`** — `searchKeyOf(query: SearchQuery): string`. Canonicalises
the query: sort origin airports, sort destination airports, normalise dates to
`YYYY-MM-DD`, drop fields that do not affect which flights exist (passenger
counts *do* affect price totals, so they stay). Same inputs must always produce
the same key, in any field order.

**`storage.ts`** — the only module touching `localStorage`. Follow the
reference's `saved-searches.ts` discipline exactly: a private `getStorage()` that
returns `null` when `window` is absent or access throws; a `readJson` that
returns `null` on parse failure; every public read returning a safe default.

```ts
export interface StoredSearch {
  id: string; savedAt: string; label: string;
  key: string;                 // from searchKeyOf
  query: SearchQuery;
  arrangements: Arrangement[];
}

export function loadSearches(): StoredSearch[];
export function saveSearch(entry: StoredSearch): void;   // trims to MAX_SAVED_SEARCHES
export function removeSearch(id: string): void;
export function findFreshByKey(key: string, now?: number): StoredSearch | null;
export function isStale(entry: StoredSearch, now?: number): boolean;

export function loadFilters(): FilterState;
export function saveFilters(next: FilterState): void;
export function loadPreferences(): RankingPreferences & { dates: DatePreferences };
export function savePreferences(next: ...): void;
```

`isStale` and `findFreshByKey` both compare against `RESULT_FRESHNESS_MS`.
Nothing else in the codebase computes staleness.

---

## Task 2.9 — `app/data/`

**`greekAirports.ts`** — every Greek commercial airport as `Airport` records
(code, name, city, lat, lon). At minimum: ATH, SKG, HER, CHQ, RHO, JTR, JMK,
CFU, KGS, ZTH, PVK, KLX, VOL, SMI, MJT, JSI, EFL, KVA, AXD, LRS, GPA, LXS, AOK,
KSO, JKH, PAS, MLO, JNX, KIT, SKU, HEW. Note the source of the coordinates in a
comment.

**`europeCities.ts`** and **`europeAirports.ts`** — sample data for the map,
explicitly marked as placeholder to be replaced later. Around 25–30 European
cities, each with 1–3 airports, so the "multiple airports per city" and
"airports hide when zoomed out" behaviours are both exercised. Must include at
least one multi-airport city each for London (LHR/LGW/STN/LTN), Paris
(CDG/ORY/BVA), Milan (MXP/LIN/BGY), Rome (FCO/CIA) and Berlin (BER).

**`mockFlights.ts`** — deterministic mock flight generator producing
`NormalizedFlight[]` for any `(from, to, date)`. Seed from the arguments so the
same route always yields the same flights and the UI is stable across reloads.
Adapt the reference's `lib/mock-data.ts` rather than inventing a new shape.
Produce a realistic spread: 8–20 flights per route, a mix of non-stop and
1-stop, prices spread across a believable range, departures across the day.

Export `mockPool(plan: PlannedSearch[]): Record<string, Itinerary[]>` so
`buildArrangements` can be fed without any network.

---

## Task 2.10 — Tests

The project uses Playwright, not a unit-test runner. Rather than adding one, put
the logic checks in `app/lib/airsearcher/__checks__/` as plain functions and
call them from a temporary script run with `npx tsx`, or — preferred — confirm
with the user whether to add `vitest`.

Whichever route, cover at minimum:

- `hourValue` interpolates and wraps 23 to 0 (copy the reference's cases).
- `priceIndex` returns 1 for every flight when all prices are equal.
- `enumerateRoutings` never routes the gathering airport to itself and produces
  `2^(n-1)` routings for `n` origins when both modes are allowed.
- `buildArrangements` rejects a gather leg whose feeder lands inside
  `MIN_GATHER_BUFFER_MINUTES` of the main departure.
- `scoreArrangements` weights by passenger count: an arrangement whose bad hours
  affect 2 passengers must outscore one where they affect 20.
- `planSearches` deduplicates: three origins all gathering in Athens produce
  **one** `ATH→DEST` search, not three.
- `searchKeyOf` is order-independent.
- `storage.ts` returns safe defaults when `localStorage` throws.

---

## Verification

- `npx tsc --noEmit` clean.
- The checks above all pass.
- Grep confirms `localStorage` appears in exactly one file (`storage.ts`).
- Grep confirms `86400000` / `24 * 60 * 60` appears in exactly one file
  (`config/constants.ts`).
- No React import anywhere in `app/lib/airsearcher/`.

---

## Checkpoint

Report to the user: the request count `planSearches` produces for a realistic
query (3 origins, 1 destination, round trip, exact dates — expect 8 with both
routing modes allowed) and the same in advanced mode over a 14-day range. This
is the number the whole SerpAPI-minimisation requirement turns on; confirm it
looks right before building UI on top of it.
