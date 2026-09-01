# Phase 03 — Home Page: Search Panel + History

**Goal:** replace `app/page.tsx` with the flight-search interface and the
history of previous searches.

**Depends on:** 01 (theme tokens), 02 (types, storage, query planner).
**Blocks:** 04, 05.

**Before starting:** connect the Penpot MCP plugin and read the Home board.
Run `penpotUtils.getPages()` then `penpotUtils.shapeStructure(page.root, 3)`,
and `export_shape` the Home board to look at it. Layout, spacing and ordering
come from Penpot; this plan fixes structure and behaviour only. If Penpot is
still unreachable, stop and ask the user rather than inventing a layout.

---

## Task 3.1 — Page shell

`app/page.tsx` — a client component. Current contents (an empty `<main>` and an
unused `Link` import) are deleted.

Structure:

```
<main>                                        centred column, max-w, responsive padding
  <header>            product name + one-line subtitle (Text size big / small)
  <SearchPanel />     the main search interface
  <SearchHistoryList /> previous searches, BELOW the inputs (per instructions)
</main>
```

No `AppShell`, no `Navbar`, no `Footer`. All spacing and surfaces from
`theme.ts`.

The page owns the `SearchQuery` state and passes it down. It loads the last
filter state and preferences from `storage.ts` on mount inside a `useEffect`
(never during render — `localStorage` is unavailable during SSR).

---

## Task 3.2 — `SearchPanel`

`app/components/airsearcher/home/SearchPanel.tsx`. Google-Flights-like: a single
bordered card (`radiusBig`, `border`, `shadow` from the theme) holding a row of
fields that stacks on mobile.

Contents, left to right:

1. `TripTypeToggle` — Round trip / One way. Two `Button`s, the selected one
   `styleType="secondary"`, the other `tertiary`. **No multi-city.** Also the
   place where the instructions' "include return flights or one-way only"
   option lives — it is the same control.
2. `DepartureDropdown` — see 3.4.
3. `DestinationField` — see 3.3.
4. `DateField` — see 3.5.
5. A `Button styleType="primary"` labelled "Search".

Below the row, a cost line: "This search will use N SerpApi requests", computed
live from `planSearches` + `describeCost`. When `needsConfirmation(cost)` the
Search button opens a `FixedModal` showing `explainCost`'s breakdown and
requires confirmation. When a fresh cached result matches
(`findFreshByKey(searchKeyOf(query))`) the line instead reads "Reusing saved
results — 0 requests" and Search navigates straight to `/results`.

Keep this file to composition and state wiring. Every field is its own file.

---

## Task 3.3 — `DestinationField`

`app/components/airsearcher/home/DestinationField.tsx`.

Uses `SearchInput` (`styleType="BigSearch"` on the Home panel) with an
`AbsoluteModal` suggestion list anchored below (`side="bottom"`, `align="start"`,
`matchAnchorWidth`, `closeOnOutsideClick`).

Behaviour:

- Typing filters `europeCities` and `europeAirports` by name, code and country.
- Suggestions show cities first, then airports, each with its country as muted
  `size="very small"` text.
- Selecting a **city** selects all of its airports by default.
- Each city row carries an **arrow on its right side**
  (`<Text icon="arrow-right" />` inside a `Button styleType="tertiary"`).
  Clicking the arrow — not the row — opens the **right-side airport panel**
  (task 3.6). Stop propagation so the arrow never also selects the row.
- A "Map" affordance on each city row opens the map modal (phase 04). Wire the
  callback prop now (`onOpenMap(cityId)`); leave it unimplemented until 04.

Props are explicit and it holds no global state:

```tsx
type Props = {
  value: { cityId: string | null; airports: AirportCode[] };
  onChange: (next: Props["value"]) => void;
  onOpenMap?: (cityId: string) => void;
  styleType?: "simple" | "BigSearch";
};
```

The `styleType` prop matters: phase 04's map search bar reuses this exact
component with `styleType="simple"`, as the instructions require.

---

## Task 3.4 — `DepartureDropdown`

`app/components/airsearcher/home/DepartureDropdown.tsx`.

**Not** a standard flight-app departure input. A `Button` that opens an
`AbsoluteModal` panel containing:

- One row per selected origin airport: the airport name and code, a `Stepper`
  for passenger count, and a delete `Button styleType="delete"` with
  `icon="trash"`.
- Defaults to Athens, Thessaloniki and Heraklion (`GREEK_ORIGIN_DEFAULTS`), each
  starting at 0 passengers except Athens.
- An "Add airport" row: a `SearchInput styleType="simple"` filtering
  `greekAirports` and excluding already-added ones.
- A **"Best gathering airport"** button that picks the preferred airport for the
  whole group. Implementation: choose the origin with the most passengers, then
  break ties by total feeder distance using the airports' lat/lon (a plain
  haversine helper in `app/lib/airsearcher/time.ts` or a new `geo.ts`). Show the
  chosen airport highlighted with `colorSecondary` (orange) and a "gathering"
  label. It is a suggestion — the user can override by clicking any row.

The button face summarises the state: "3 airports · 24 passengers".

The dropdown body is extracted to `DepartureAirportEditor.tsx` because phase 06
reuses it verbatim inside the filter sidebar's Departure Airports filter. Do not
duplicate it there.

---

## Task 3.5 — `DateField`

`app/components/airsearcher/home/DateField.tsx`.

Two modes, switched by a small toggle inside the field:

- **Exact** — a departure `Input type="date"` and, when round trip, a return
  `Input type="date"`.
- **Advanced** — a read-only summary ("1–30 Sep · 7 nights · 3 excluded") and a
  `Button icon="calendar"` that opens the advanced calendar modal.

In this phase the advanced button opens nothing; it takes an `onOpenCalendar`
callback that phase 04 fills in. The summary text is rendered from
`query.dateRange`, `query.tripDurationDays` and `query.excludedDates`, so it
works as soon as 04 lands.

Validate: return date after departure date; advanced range no longer than
`MAX_ADVANCED_RANGE_DAYS`. Invalid state renders the field with
`styleType="error"` and disables Search.

---

## Task 3.6 — Airport panel (right-side modal)

`app/components/airsearcher/home/CityAirportPanel.tsx`.

Opened by the arrow on a destination city. An `AbsoluteModal` with `side="right"`
(the instructions call it a right-side modal), containing:

- The city name as a header.
- A `MultiSelectList` of that city's airports — checkbox rows with code, name
  and a muted distance-from-centre line if available.
- A `SelectAllRow` with a **Select All** button.
- **All airports selected by default** when the panel first opens for a city.

`MultiSelectList` and `SelectAllRow` go in
`app/components/airsearcher/common/` — phase 06's Avoid Airports filter reuses
both.

---

## Task 3.7 — `SearchHistoryList`

`app/components/airsearcher/home/SearchHistoryList.tsx` +
`SearchHistoryCard.tsx`. Rendered **below** the search panel, matching the
Penpot board.

- Reads `loadSearches()` in a mount effect.
- One card per stored search: destination, origins summary, dates, result count,
  best price, and a relative "saved 3 hours ago" line from a `formatAge` helper
  in `app/lib/airsearcher/time.ts`.
- A card whose entry `isStale()` shows an orange (`colorSecondary`) "Needs
  recalculating" chip.
- Clicking a card navigates to `/results?search=<id>`. The Results page loads
  that entry from storage.
- If the entry is stale, the **Results page** — not the Home page — raises the
  top-right `useAlert` warning on mount. Keep the alert at the destination so it
  is visible next to the results it refers to.
- A delete `Button styleType="delete"` per card calling `removeSearch(id)`.
- Empty state: a short muted line, no card grid.

Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.

---

## Task 3.8 — Wiring Search

On Search:

1. Build the `SearchQuery` from the panel state.
2. `const key = searchKeyOf(query)`.
3. `const cached = findFreshByKey(key)` — if found, navigate to
   `/results?search=${cached.id}` and stop. Zero requests.
4. Otherwise build the arrangements from the **mock pool** (phase 02's
   `mockPool(planSearches(query))`), score and sort them, `saveSearch(...)`, and
   navigate to the new entry.

There is no network call anywhere in this phase. The mock pool stands in for
SerpAPI, and the code path is the one the real API will later slot into.

---

## Verification

- `npx tsc --noEmit` clean.
- `/` renders; every control works; state survives a reload via storage.
- Searching twice with identical inputs shows "Reusing saved results — 0
  requests" the second time.
- Changing one passenger count changes the search key and forces a fresh search.
- No raw `<button>`, `<input>` or `<a>` in the new components — `Button`,
  `Input`, `SearchInput`, `Text` throughout.
- Responsive from 320px: fields stack, dropdown panels stay on screen, history
  grid reflows.
- No file outside `app/page.tsx`, `app/components/airsearcher/**` and
  `app/lib/airsearcher/**` modified.

---

## Checkpoint

Show the user the Home page beside the Penpot Home board. Confirm field order,
the departure dropdown's contents, and that the history section sits where the
board puts it, before moving on.
