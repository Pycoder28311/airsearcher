# AirSearcher — Design Spec (UI-only phase)

Status: approved 2026-08-31. Source requirements: `doc/plans/instructions.md`.

---

## 1. Purpose

AirSearcher organises **group** air travel from Greece to a chosen destination.
The group departs from up to three Greek airports (Athens, Thessaloniki,
Heraklion — extensible), and the app decides whether each non-Athens group
should fly **direct** to the destination or **gather in Athens first** and fly
out with everyone else.

This phase builds the **frontend only**. No backend, no authentication, no live
SerpAPI. Existing backend/auth code is left untouched and simply unused.

---

## 2. Decisions taken (from the brainstorming round)

| Question | Decision |
| --- | --- |
| Component gallery vs Home page | Gallery gets its own third route `/styleguide`; Home stays the flight search |
| Config editing | **`app/config/theme.ts` only.** No other config file is edited without a fresh explicit request |
| Design source | Penpot is the reference; connect the Penpot MCP plugin before phases 03–06 |
| Map | **Leaflet + react-leaflet** (new dependency) |
| Reference logic | Port the pure logic from `serpAPItest/my-app` (ranking, filtering, combinations, quota, storage) with mock data |
| Code location | `app/components/airsearcher/**`, `app/lib/airsearcher/**`, `app/data/**` |
| Theme look | Light-only Notion gray palette; blue + orange accents |
| Page chrome | Standalone pages. `Navbar.tsx` / `Footer.tsx` are **not** touched |
| Result model | One result = one **whole-group arrangement** |

---

## 3. Routes

| Route | File | Contents |
| --- | --- | --- |
| `/` | `app/page.tsx` | Search panel + history of previous searches |
| `/results` | `app/results/page.tsx` | Filter sidebar + result cards + floating result layer |
| `/styleguide` | `app/styleguide/page.tsx` | Every variation of every reusable component |

`app/page.tsx` currently renders an empty `<main>`; it is replaced. No other
existing route is modified.

---

## 4. File layout

```
app/components/airsearcher/
  home/       SearchPanel  DestinationField  DepartureDropdown  DateField
              TripTypeToggle  PassengerCounts  SearchHistoryList  SearchHistoryCard
  calendar/   AdvancedCalendarModal  MonthGrid  DayCell  DurationPicker
              ExclusionList  PriorityPainter
  map/        MapModal  MapCanvas  CityMarker  AirportMarker  MapSearchBar
              MapSelectionBar
  results/    ResultsHeader  SortByDropdown  ExpandAllToggle  ResultCard
              ResultCardClosed  ResultCardOpen  ResultCharts  FlightList
              FlightRow  FloatingLayer  FloatingWindow
  filters/    FilterSidebar  FilterGroup  ScopeDropdown  + one file per group
  common/     Chip  Stepper  MultiSelectList  SelectAllRow  WeightSelector
              CollapsibleSection  SidebarToggle

app/lib/airsearcher/
  config/     constants.ts  ranking.ts  filters.ts   <- airsearcher's OWN tunables
  types.ts  ranking.ts  filtering.ts  combinations.ts  grouping.ts
  quota.ts  queryPlan.ts  storage.ts  searchKey.ts  mockSearch.ts  time.ts

app/data/
  greekAirports.ts  europeCities.ts  europeAirports.ts  mockFlights.ts
```

**Why `app/lib/airsearcher/config/` and not `app/config/`:** `app/config/` is the
user's own style/UI-metadata folder and is off-limits except for `theme.ts`.
AirSearcher's tunable constants (freshness threshold, weight levels, default
ranking curves, default filter state) therefore live under
`app/lib/airsearcher/config/`. They are still `const` exports in one place,
satisfying the "must not be hardcoded" requirement.

No file in `app/framework/**`, `app/api/**`, `app/auth/**` or `prisma/` is
modified in any phase.

---

## 5. Domain model

All types live in `app/lib/airsearcher/types.ts`. Flight shapes are adapted from
`serpAPItest/my-app/lib/serpapi-flights.ts` so a later real API phase is a drop-in.

```ts
type AirportCode = string;              // "ATH" | "SKG" | "HER" | ...

interface Airport  { code; name; cityId; lat; lon; country }
interface City     { id; name; country; lat; lon; airportCodes: AirportCode[] }

interface OriginGroup { airport: AirportCode; passengers: number }

/** How one origin group reaches the destination. */
type Routing = "direct" | "gather";     // gather = fly to the gathering airport first

interface GroupLeg {
  origin: AirportCode;
  routing: Routing;
  feeder: Itinerary | null;             // origin -> gathering airport (null when direct)
  main: Itinerary;                      // origin|gathering -> destination
  passengers: number;
}

/** ONE RESULT = one complete plan for the whole group. */
interface Arrangement {
  id: string;
  destination: { cityId: string; airport: AirportCode };
  gatheringAirport: AirportCode;        // "ATH" by default
  legs: GroupLeg[];                     // one per origin group
  totals: {
    totalPrice: number;                 // summed over all passengers
    pricePerPassenger: number;
    longestTravelMinutes: number;
    earliestDeparture: string;
    latestArrival: string;
    gatheringCount: number;             // passengers routed via the gathering airport
  };
  score: number;                        // 0..1, see section 6
  indices: { price: number; hour: number };
}
```

`Itinerary`, `NormalizedFlight`, `NormalizedLeg` and `NormalizedSegment` are
copied from the reference project unchanged in shape.

---

## 6. Scoring — reuse, do not reinvent

The reference weighting logic (`serpAPItest/my-app/lib/ranking.ts`) is ported
**verbatim in arithmetic**:

- `parseFlightHour`, `hourValue` (24-point curve, linear interpolation, wraps 23 to 0)
- `legHourIndex` (blend of departure and arrival value)
- `priceIndex` (cheapest in the set = 1, dearest = 0, equal prices all = 1)
- `normalizeWeights` (price/hour weights need not sum to 1)

The **only** addition is aggregation across the group:

```
arrangement.priceIndex = priceIndex(totals.totalPrice, minTotal, maxTotal)
arrangement.hourIndex  = sum(legHourIndex(leg) * leg.passengers) / sum(leg.passengers)
arrangement.score      = w.price * priceIndex + w.hour * hourIndex
```

A passenger-weighted mean, nothing else. `departureArrivalRatio` from the
reference config is kept and used inside `legHourIndex`.

**Removed per instructions:** the "Departure vs Arrival weight" *filter control*
is gone from the UI. The underlying `departureArrivalRatio` constant stays in
`app/lib/airsearcher/config/ranking.ts` at its default (0.65) — it is simply no
longer user-editable.

**Five-level weights** replace the numeric sliders for Price and Hours:

```ts
export const WEIGHT_LEVELS = ["none", "a little", "mid", "much", "completely"] as const;
export const WEIGHT_VALUES: Record<WeightLevel, number> = {
  none: 0, "a little": 25, mid: 50, much: 75, completely: 100,
};
```

These feed straight into `normalizeWeights({ price, hour })`, so the existing
arithmetic is untouched.

---

## 7. SerpAPI-minimisation strategy (designed now, wired in a later phase)

`app/lib/airsearcher/queryPlan.ts` turns a form state into a **deduplicated list
of searches**, and `quota.ts` prices it. Nothing calls the network in this phase;
the plan is computed and shown so the cost is visible before it is ever spent.

The saving comes from three reuses:

1. **Feeder legs are shared across destinations.** `SKG→ATH` and `HER→ATH` on a
   given date are one search each, regardless of how many destinations or
   arrangements are evaluated.
2. **The main leg is shared across all gathering origins.** Every origin that
   gathers in Athens flies the same `ATH→DEST` flight — one search, not one per
   origin.
3. **The direct-vs-gather comparison costs nothing extra** beyond the direct
   searches themselves. Both arrangements are assembled from the same result pool.

```
requests = size of the deduplicated set of (from, to, date, direction) where:
    ATH -> DEST                       always (main leg)
    O   -> ATH    per non-ATH origin  only when "gather" is allowed
    O   -> DEST   per non-ATH origin  only when "direct" is allowed
  x 2 when round trip
  x N when advanced date search spans N candidate departure dates
```

`quota.ts` exposes `costOf(plan)`, `needsConfirmation(cost)` and
`describeCost(cost)`, following the reference module. Any action costing more
than one request must be confirmed with the exact count shown.

**Result reuse:** before planning any search, `searchKey.ts` canonicalises the
form state into a stable key. If `storage.ts` holds a stored result under that
key whose age is under `RESULT_FRESHNESS_MS`, it is reused and **zero** requests
are planned.

---

## 8. Persistence

`app/lib/airsearcher/storage.ts` is the **only** module that touches
`localStorage`. It mirrors the defensive discipline of the reference
`saved-searches.ts`: storage may be absent (SSR), blocked (private mode), full,
or hold a blob from an older version — every path degrades to "no saved data",
never a thrown error.

| Key | Holds |
| --- | --- |
| `airsearcher:searches:v1` | Search history: query, arrangements, `savedAt` |
| `airsearcher:filters:v1` | Last-used filter state |
| `airsearcher:prefs:v1` | Ranking preferences (weights, curves, date priorities) |

Constants in `app/lib/airsearcher/config/constants.ts`:

```ts
/** How long a stored result stays reusable before a re-search is needed. */
export const RESULT_FRESHNESS_MS = 24 * 60 * 60 * 1000;
export const MAX_SAVED_SEARCHES = 10;
export const DEFAULT_GATHERING_AIRPORT = "ATH";
export const GREEK_ORIGIN_DEFAULTS = ["ATH", "SKG", "HER"] as const;
```

`RESULT_FRESHNESS_MS` is the one-day threshold the instructions require to be a
changeable const. Nothing else may hard-code 24 hours.

**Staleness alert:** opening a history entry older than `RESULT_FRESHNESS_MS`
raises a **top-right** notification via `useAlert` (`@/framework/ui/useAlert`)
saying the results need recalculating with SerpAPI. The results still render;
the alert only warns.

---

## 9. Theme

Only `app/config/theme.ts` changes. Light-only Notion palette:

- **Grays** — retuned to a warm Notion-like neutral scale for surfaces, borders
  and muted text. `grayLight` / `grayMid` / `grayStrong` keep their existing
  shape (`bg`, `bgHover`, `bgActive`, `text`, `border`, `borderHover`).
- **`colorMain`** — blue (primary accent, focus rings, links).
- **`colorSecondary`** — green becomes **orange** (secondary accent, highlights,
  selected states).
- **`colorPrimaries`**, **`colorRed`** — unchanged in role; grays retuned.
- `radius`, `radiusBig`, padding, `border`, `shadow` — unchanged.

Because every other config file imports its classes from `theme.ts`, all
components re-colour automatically with no further edits.

**Known limits (see Open items):** `buttonConfig.ts` hard-codes a blue
`#1d4ed8` drop-shadow on `primary` (harmless — still blue) and
`after:bg-green-500` on the `nav` variant (**will stay green**).

---

## 10. Component reuse rules

Per `instructions/ui-components.md`, every element that maps to a framework
component must use it — no raw `<button>`, `<input>`, or ad-hoc styled text:

| Need | Component | Style types available |
| --- | --- | --- |
| Button | `@/framework/ui/buttons/Button` | `primary` `secondary` `tertiary` `tertiary-bordered` `underline` `delete` `nav` |
| Text / label / icon | `@/framework/ui/iconText/Text` | `very small` `small` `medium` `big` `large` |
| Input | `@/framework/ui/input/Input` | `outlined` `filled` `underline` `ghost` `pill` `error` |
| Search box | `@/framework/ui/searchInput/SearchInput` | `simple` `BigSearch` |
| Alert / toast | `@/framework/ui/useAlert` | — |
| Anchored popover | `@/framework/ui/context/AbsoluteModal` | — |
| Centred dialog | `@/framework/ui/context/FixedModal` | — |

Mapping to airsearcher UI:

- Departure dropdown, destination suggestions, sort-by dropdown, per-filter
  scope dropdown, destination-arrow airport panel → **`AbsoluteModal`**
  (`side` / `align` / `matchAnchorWidth`).
- Advanced calendar, map modal → **`FixedModal`**.
- Stale-result warning → **`useAlert`**, positioned top-right.
- Destination field and the map's search bar → **`SearchInput`**, same
  interaction in both places (one shared `DestinationField` used twice).

Anything not covered by a framework component (result cards, map canvas,
calendar grid, floating windows) is built in `app/components/airsearcher/**`
using `theme.ts` tokens only — no literal colours, radii, or shadows.

---

## 11. Responsiveness

Mobile-first throughout, per `instructions/examples.md`:

- Search panel: stacked fields on mobile, single row from `md:`.
- Results: sidebar becomes a full-screen overlay below `lg:`; closed cards go
  `grid-cols-1` to `lg:grid-cols-2`.
- Floating/draggable result windows are **desktop-only** (`lg:` and up); below
  that the "float" button is hidden, since free positioning is meaningless on a
  phone.
- Map modal is full-viewport on mobile, an inset dialog on desktop.

---

## 12. Phase plans

| # | File | Depends on |
| --- | --- | --- |
| 01 | `01-theme-and-styleguide.md` | — |
| 02 | `02-data-model-and-logic.md` | — |
| 03 | `03-home-search.md` | 01, 02 |
| 04 | `04-calendar-and-map.md` | 03 |
| 05 | `05-results-page.md` | 02, 03 |
| 06 | `06-filter-sidebar.md` | 05 |

01 and 02 are independent and can run in either order or in parallel.

---

## 13. Open items — need a decision before the phase that hits them

1. **`buttonConfig.ts` nav underline stays green.** Changing it is a one-line
   edit (`after:bg-green-500` to an orange or blue token). Needs explicit
   permission. *Default if unanswered: leave it green.* (Phase 01)
2. **Missing icons.** `iconConfig.ts` already has `arrow-right`, `chevron-down`,
   `chevron-up`, `calendar`, `clock`, `search`, `close`, `plus`, `trash`,
   `check`, `settings`, `info`, `alert` — all needed and present. It does
   **not** have: `plane`, `map-pin`, `filter`, `move` (drag handle),
   `maximize`. Adding them is a config edit needing permission. *Default if
   unanswered: use existing icons only and label those controls with text.*
   (Phases 03–05)
3. **Penpot must be connected** before phases 03–06 so layouts come from the
   real boards rather than invented ones. The MCP currently reports no connected
   instance for this token.
4. **Leaflet dependency** — `leaflet`, `react-leaflet` and `@types/leaflet` are
   added to `package.json` in phase 04. Approved in principle; the install
   happens in that phase.

---

## 14. Explicitly out of scope this phase

- Any `fetch` to SerpAPI or to `app/api/**`.
- Any use of `useTable`, `DataForm`, Prisma, or authentication.
- Any change to `prisma/schema.prisma` or `app/framework/types/`.
- Multi-city trip type (removed per instructions).
- Editing `Navbar.tsx` or `Footer.tsx`.
