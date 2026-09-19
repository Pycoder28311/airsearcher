# Phase 07 — Departure × Return Price Grid

**Goal:** a Google-Flights-style date grid on `/results` — departure dates down
the side, return dates across the top, the cheapest group total in every valid
cell — built **entirely from data the search already gathered**. No new API
call, no new planned search, no change to `app/api/`.

**Applies to:** advanced (date-range) searches where the trip length is left
open — `dateMode === "advanced"` and `tripLengthRange` set (the "Unspecified
trip length" tick in `AdvancedCalendarModal`). Every other search keeps the
current `CostPerDayChart`.

**Depends on:** 02 (arrangements), 04 (advanced calendar), 05 (results page),
06 (filter sidebar).
**Blocks:** nothing.

---

## 0 — Why this is free

`buildAllArrangements` (`app/lib/airsearcher/search.ts`) already loops
`candidateDates(query)` × `returnDatesFor(query, departureDate)` and builds an
`Arrangement` per pair. Every `Arrangement` carries `departureDate`,
`returnDate` and `totals.totalPrice`. `returnDatesFor` for an open trip length
returns every date inside the window between `min` and `max` nights, and
`planSearches` deduplicates route data per `(from, to, date, direction)` — which
is why an open length costs **zero extra requests** over a fixed one.

So the grid is a `groupBy` over arrangements already in `localStorage`:

```
cell(departureDate, returnDate) = min(totalPrice) over arrangements with that pair
```

Exactly the derivation `CostPerDayChart` does today, with one more key.

---

## 1 — The blocker to fix first: the 300-arrangement cap

`MAX_ARRANGEMENTS_PER_SEARCH = 300` in `app/lib/airsearcher/search.ts`. The
current "always keep" rule guarantees only **the cheapest per departure date**:

```ts
const cheapestPerDate = new Map<string, Arrangement>();
for (const arrangement of ranked) {
  const current = cheapestPerDate.get(arrangement.departureDate);
  ...
}
```

With a fixed length that is one arrangement per grid cell, so the chart never
loses a bar. With an **open** length there are many return dates per departure
date, and the pair count outruns the cap:

| Window | Nights | Pairs |
| --- | --- | --- |
| 30 days | 3–7 | ~145 |
| 45 days | 3–14 | ~490 |
| 45 days | 1–60 | ~990 |

Past 300, cells go blank **because of the cap, not because no flight exists** —
the grid would silently lie. Fix before building any UI.

### Task 1.1 — Guarantee the cheapest per date *pair*

In `buildAllArrangements`, key the always-keep map on the pair:

```ts
const key = (a: Arrangement) => `${a.departureDate}|${a.returnDate ?? ""}`;
const cheapestPerCell = new Map<string, Arrangement>();
for (const arrangement of ranked) {
  const current = cheapestPerCell.get(key(arrangement));
  if (!current || arrangement.totals.totalPrice < current.totals.totalPrice) {
    cheapestPerCell.set(key(arrangement), arrangement);
  }
}
```

Behaviour is unchanged for exact and fixed-length searches (one return date per
departure date makes the new key equivalent to the old one).

### Task 1.2 — Let the cap grow to fit the grid

A flat 300 can now be smaller than the guaranteed set. Make the cap the larger
of the constant and the cell count:

```ts
const cap = Math.max(MAX_ARRANGEMENTS_PER_SEARCH, cheapestPerCell.size);
```

The guaranteed set is added first, then the top-scoring rest up to `cap`.

**Storage note:** arrangements carry whole `NormalizedFlight` objects, so ~1000
of them is a large `localStorage` write. `saveSearch` is already defensive —
it sheds `records` and then drops entries rather than throwing (see
`app/lib/airsearcher/storage.ts`). Verify a worst-case search (45 days, 1–60
nights, 3 origins, 2 destination airports) still saves; if the browser refuses
the write, fall back to Task 1.3.

### Task 1.3 — Fallback only if 1.2 does not fit in storage

Store a compact summary next to the arrangements instead of keeping every cell
winner:

```ts
/** Cheapest group total per date pair, computed before the cap. */
interface StoredPriceGrid {
  /** `${departureDate}|${returnDate}` -> cheapest total price. */
  cells: Record<string, number>;
}
```

A few KB, immune to the cap. The grid then renders from `visible` arrangements
where it has them (so it follows the filters) and falls back to the stored
floor elsewhere, marking those cells as unfiltered with a muted style. Only
build this if 1.2 measurably fails — it adds a second source of truth.

---

## 2 — `app/lib/airsearcher/priceGrid.ts` (new, pure)

No React, no storage, no fetch. Mirrors how `queryPlan.ts` is written.

```ts
export interface PriceGridCell {
  departureDate: string;
  returnDate: string;
  nights: number;
  /** Cheapest group total for this pair; null when nothing survives. */
  cheapest: number | null;
  /** How many arrangements sit in this cell. */
  count: number;
}

export interface PriceGrid {
  /** Row headers, ascending. */
  departureDates: string[];
  /** Column headers, ascending — the union of every valid return date. */
  returnDates: string[];
  /** `${departureDate}|${returnDate}` -> cell. Only valid pairs are present. */
  cells: Map<string, PriceGridCell>;
  /** Cheapest cell in the whole grid, for the highlight and the legend. */
  best: PriceGridCell | null;
  /** Price at the 1/3 and 2/3 marks, for the three-step cell shading. */
  thresholds: { low: number; high: number } | null;
}

export function buildPriceGrid(
  query: SearchQuery,
  arrangements: Arrangement[],
): PriceGrid;
```

Rules:

- **Rows** = `candidateDates(query)`.
- **Columns** = the sorted union of `returnDatesFor(query, d)` across rows.
  These already respect `dateRange.end` and `excludedDates`.
- **Valid pair** = the return date appears in `returnDatesFor(query, d)`. Every
  other (row, column) is *invalid* and renders as an inert blank — that is what
  gives the grid its diagonal band, the same shape Google Flights shows.
- `cheapest` is `min(totals.totalPrice)`; `null` means valid-but-empty (no
  arrangement survives the filters, or none was found).
- `thresholds` come from the sorted list of non-null prices at indices
  `floor(n/3)` and `floor(2n/3)`. Terciles, not a fixed percentage, so the
  shading stays readable whether prices span 5% or 500%.
- `nights = daysBetween(departureDate, returnDate)` from `time.ts`.

`buildPriceGrid` must be cheap enough to run inside a `useMemo` on every filter
change: one pass over arrangements, one pass over pairs.

### Task 2.1 — Guard the degenerate cases

Return an empty grid (`departureDates: []`) when the query is not advanced,
not round-trip, or has no `tripLengthRange`. The page uses
`flexibleTripLength(query) !== null` from `queryPlan.ts` to decide whether to
render the grid at all, so `buildPriceGrid` only has to be safe, not clever.

---

## 3 — `app/components/airsearcher/results/PriceGridCell.tsx` (new)

One cell. Written the way `calendar/DayCell.tsx` is written: a `Button
styleType="tertiary"` carrying state classes with `!`, every colour from
`@/config/theme`.

```ts
interface CellState {
  /** Not a bookable pair — renders as an empty, non-interactive box. */
  invalid: boolean;
  /** Valid pair with no surviving result. */
  empty: boolean;
  cheapest: number | null;
  /** The single lowest price in the grid. */
  isBest: boolean;
  /** "low" | "mid" | "high" tercile, or null when empty. */
  band: "low" | "mid" | "high" | null;
  selected: boolean;
}
```

Styling, all from theme tokens:

| State | Look |
| --- | --- |
| `invalid` | `<td>` with no button, `grayLight.bg`, no text |
| `empty` | disabled button, `–`, `grayStrong.text` muted |
| `band: "low"` | `bg-blue-50! text-blue-900!` — mirrors `DayCell`'s in-range blue |
| `band: "mid"` | `bg-transparent!` |
| `band: "high"` | `bg-gray-50! text-gray-600!` |
| `isBest` | `colorMain.bg` filled, white text — the one obvious winner |
| `selected` | keeps its band colour, adds `ring-2 ${colorSecondary.ring}` |

Price is rendered bare and `tabular-nums`; the currency is stated once in the
panel header (`CURRENCY` from `config/constants.ts`), never repeated per cell.
`aria-label` on each button spells the cell out in full: *"Leave 14 Sep, return
17 Sep, 3 nights, from 940 EUR, 12 results"*.

---

## 4 — `app/components/airsearcher/results/PriceGrid.tsx` (new)

The table shell. Keep it under ~170 lines; anything bigger belongs in
`priceGrid.ts` or the cell.

```
<section>                         bg-white ${border} ${radiusBig} p-4
  header row     title + "Cheapest 940 EUR · 14 Sep → 17 Sep · 3 nights"
  hover line     fixed-height row, like CostPerDayChart's tooltip slot
  scroller       overflow-x-auto
    <table>
      <thead>   corner cell + one <th scope="col"> per return date
      <tbody>   one <th scope="row"> per departure date + PriceGridCell per column
  legend         cheapest / cheaper third / pricier third / no result
</section>
```

Props:

```ts
{
  grid: PriceGrid;
  selected: { departureDate: string; returnDate: string } | null;
  onSelect: (pair: { departureDate: string; returnDate: string } | null) => void;
}
```

### Task 4.1 — Make a 45-column table usable

- `overflow-x-auto` on the scroller; the table does **not** shrink to fit.
- Sticky row headers: `sticky left-0 z-10 bg-white` on every `<th scope="row">`
  and on the corner cell, so the departure date stays visible while scrolling
  sideways.
- Sticky column headers: `sticky top-0` inside the scroller.
- Fixed cell width (`w-16` compact, `sm:w-20`) and `table-fixed`, so column
  widths do not jump as prices change length.
- Headers show day + short month over a small weekday line (`formatDate` from
  `time.ts` for the full form in the `title`/`aria-label`).

### Task 4.2 — Hover read-out

A fixed-height line above the table, same pattern as `CostPerDayChart`, showing
the hovered cell in words. Avoids absolutely-positioned tooltips that would be
clipped by `overflow-x-auto`.

### Task 4.3 — Screen-reader path

The `<table>` is the accessible representation — real `<th scope="col">` /
`<th scope="row">` and a `<caption>` reading *"Cheapest group total for each
departure and return date"*. No `sr-only` duplicate table is needed here
(unlike the chart), because the grid already is one.

### Task 4.4 — Marginal minima (optional, do last)

A trailing column and a trailing row showing the cheapest price for that
departure date / return date across the whole band. Useful, cheap
(`Math.min` over the row or column), and skippable if it makes the table feel
crowded.

---

## 5 — `app/components/airsearcher/results/DateRangeView.tsx` (new)

A thin wrapper so `app/results/page.tsx` does not grow another branch. Owns one
piece of state: whether the range is shown as a **grid** or as the existing
**chart**.

```tsx
<DateRangeView
  query={entry.query}
  arrangements={visible}
  selectedPair={selectedPair}
  onSelectPair={setSelectedPair}
/>
```

- Open trip length → defaults to the grid, with a `Button styleType="tertiary"`
  pair to switch to `CostPerDayChart`.
- Fixed trip length, or one-way → renders `CostPerDayChart` only, exactly as
  today, and the toggle is not shown.
- The toggle choice lives in component state, not `StoredPreferences` — nothing
  here is worth persisting, and `savePreferences` is the user's filter/ranking
  store.

The grid is wide; the chart is not. On a phone the toggle is the escape hatch,
which is why it exists rather than a breakpoint that hides the grid outright.

---

## 6 — `app/results/page.tsx` changes

Small and contained.

### Task 6.1 — Pair selection state

```tsx
const [selectedPair, setSelectedPair] =
  useState<{ departureDate: string; returnDate: string } | null>(null);
```

**Page state only — never `FilterState`.** `FilterState` is written to
`localStorage` by `saveFilters` on every change; a date-pair selection is a
transient view of one result set and must not leak into the next search.

Clear it whenever the source tab flips (alongside the existing
`setOpenIds(new Set())`) and whenever `searchId` changes.

### Task 6.2 — Apply the selection

`visible` stays exactly as it is — the grid must keep showing every cell, so it
is built from the **unselected** `visible` list. The selection narrows only
what the card list renders:

```tsx
const selectedOnly = useMemo(
  () =>
    selectedPair
      ? visible.filter(
          (a) =>
            a.departureDate === selectedPair.departureDate &&
            a.returnDate === selectedPair.returnDate,
        )
      : visible,
  [visible, selectedPair],
);
```

`listed`, `allOpen`, the card `.map`, and `FloatingLayer`'s `arrangements` all
move to `selectedOnly`.

`cheapestPrice` keeps reading from `visible`, not `selectedOnly`. `ResultCard`
uses it to price a card relative to the best option available; re-basing it on
a single cell would make every card in that cell look like a bargain.

### Task 6.3 — Say the selection is on

A chip in the toolbar row (next to `SidebarToggle`) reading *"14 Sep → 17 Sep ·
3 nights"* with a clear `×`, styled like the excluded-date chips in
`AdvancedCalendarModal` but in `colorSecondary` to match the cell ring. Clicking
the selected cell again also clears it.

### Task 6.4 — Empty state for a selected pair

When `selectedOnly.length === 0` but `visible.length > 0`, the current
`explainEmpty` block is the wrong message — the filters are not the cause.
Show instead: *"No result for 14 Sep → 17 Sep with the current filters."* plus
a "Show all dates" button that clears the pair. The existing filter-reason
block stays for the `visible.length === 0` case.

---

## 7 — Source tabs and Travelpayouts

Nothing special. The grid is built from whichever arrangements the active
source tab feeds into `visible`, exactly like `CostPerDayChart`. Worth knowing
while testing: the Travelpayouts route fetches a whole **month** per route and
splits it back into days, so its grid is often denser than SerpApi's for the
same window.

---

## 8 — What this phase must not do

- **No new requests.** `planSearches`, `planRequestBatches`, `costOf` and both
  routes under `app/api/airsearcher/` are untouched. If a change here seems to
  need a request, it is the wrong change.
- **No config edits.** Every colour, radius, border and spacing comes from
  `@/config/theme`; every control is `Button` / `Text` / `Input` from
  `@/framework/ui/`. No new `styleType`.
- **No framework or `app/api/` edits.** See `instructions/permissions.md`.
- **No schema or Prisma work.** The feature is localStorage-only, like the rest
  of AirSearcher.
- **No change to ranking.** The grid is price-only by definition; `score`,
  `priorityDates` and `DATE_PRIORITY_BONUS` keep driving the card order below.

---

## 9 — Verification

### Task 9.1 — Logic checks

Add to `app/lib/airsearcher/__checks__/run.ts` (run with
`npx tsx app/lib/airsearcher/__checks__/run.ts`):

1. `buildPriceGrid` on a 10-day window, 2–4 nights: rows = candidate dates,
   columns = the union of return dates, and every present cell has
   `nights` within `[2, 4]`.
2. Invalid pairs are absent from `cells` — a 1-night and a 5-night pair both
   miss.
3. `cheapest` equals the minimum `totalPrice` for the pair, not the first or
   the best-scoring one.
4. A pair with no arrangements is a cell with `cheapest: null`, not a missing
   key — "valid but empty" and "not a trip" must stay distinguishable.
5. `best` is the global minimum and `thresholds.low <= thresholds.high`.
6. **Cap regression:** build a query producing > 300 pairs, run
   `buildAllArrangements`, assert every pair that has any arrangement survives
   the cap. This is the check that would have caught the Task 1 bug.
7. Existing assertions still pass — particularly the fixed-length ones, which
   must be unaffected by the new cap key.

### Task 9.2 — Manual QA

- Advanced search, 30-day window, unspecified length 3–7 nights, three Greek
  origins → grid appears above the cards, chart does not.
- Same search with a fixed 7 nights → chart appears, grid does not.
- One-way advanced search → chart appears, grid does not.
- Cheapest cell is the filled blue one, and its price matches the cheapest card
  when that cell is selected.
- Moving a filter (e.g. stops) rewrites the grid; a cell that loses every
  result becomes `–` rather than vanishing.
- Selecting a cell narrows the cards; the chip clears it; switching source tabs
  clears it.
- 45-day window: the table scrolls sideways with departure dates pinned, and
  the page itself does not scroll horizontally.
- Phone width: the grid scrolls inside its panel, the toggle falls back to the
  chart, and nothing overflows the viewport.

### Task 9.3 — Build

`npm run build` and the project's lint pass clean. Playwright specs, if any
cover `/results`, still pass.

---

## 10 — File summary

**New**

| File | Purpose |
| --- | --- |
| `app/lib/airsearcher/priceGrid.ts` | `PriceGrid` types + `buildPriceGrid`, pure |
| `app/components/airsearcher/results/PriceGrid.tsx` | The scrollable table |
| `app/components/airsearcher/results/PriceGridCell.tsx` | One cell and its states |
| `app/components/airsearcher/results/DateRangeView.tsx` | Grid/chart toggle wrapper |

**Modified**

| File | Change |
| --- | --- |
| `app/lib/airsearcher/search.ts` | Cap keyed on the date pair (Tasks 1.1–1.2) |
| `app/results/page.tsx` | `selectedPair` state, `selectedOnly` list, chip, empty state |
| `app/lib/airsearcher/__checks__/run.ts` | Grid and cap assertions |

**Untouched:** everything under `app/api/`, `app/framework/`, `app/config/`,
`prisma/`.
