# Phase 04 — Advanced Date Calendar + Destination/Airport Map

**Goal:** the two big modals — an advanced date-range calendar with exclusions
and priorities, and a Leaflet map for picking destination cities and airports.

**Depends on:** 03 (both are opened from Home fields). **Blocks:** 06 (the
sidebar reuses the calendar).

**Before starting:** read the Penpot calendar and map boards.

---

## Part A — Advanced Date Calendar

### Task 4.1 — Dependency check

None. The calendar is hand-built from `theme.ts` tokens and framework
components; no date library is added. Date arithmetic goes in
`app/lib/airsearcher/time.ts`: `addDays`, `eachDayInRange`, `isoDate`,
`formatAge`, `daysBetween`. Keep them pure and small; no `Date` mutation.

### Task 4.2 — `AdvancedCalendarModal`

`app/components/airsearcher/calendar/AdvancedCalendarModal.tsx`, rendered inside
a `FixedModal` (centred dialog).

Body, top to bottom:

1. **`DurationPicker`** — trip duration in nights, an `Input type="number"` with
   `-` / `+` `Button`s. This is the fixed duration the instructions describe:
   the search sweeps departure dates and each candidate trip lasts this long.
2. **`MonthGrid`** — two months side by side on desktop, one on mobile, with
   prev/next `Button`s using `icon="arrow-left"` / `icon="arrow-right"`.
3. **Mode selector** — three `Button`s choosing what a click on a day does:
   *Set range* / *Exclude* / *Prioritise*. Selected one `styleType="secondary"`.
4. **`ExclusionList`** — the excluded dates as removable chips.
5. **Footer** — a live cost line ("18 candidate dates · N SerpApi requests" from
   `planSearches` + `describeCost`), a "Clear" `Button styleType="tertiary"` and
   an "Apply" `Button styleType="primary"`.

### Task 4.3 — `MonthGrid` and `DayCell`

`MonthGrid` renders one month: weekday headers, leading blanks, then `DayCell`s.
It knows nothing about modes — it takes `onDayClick(iso)` and a `dayState`
lookup.

`DayCell` states, all from theme tokens:

| State | Look |
| --- | --- |
| Outside the allowed window / past | muted, disabled |
| In the selected start range | `colorMain` tint |
| Range endpoint | solid `colorMain` fill |
| Excluded | strikethrough, `colorRed` border |
| Priority 1 / 2 / 3 | increasing `colorSecondary` (orange) intensity |
| Today | ring |

Priority is 1–3, cycling on repeated clicks in *Prioritise* mode and clearing on
the fourth. `PriorityPainter` is a small legend + drag handler letting the user
sweep across several days in one gesture — pointer down starts a paint, pointer
enter continues it, pointer up ends it.

### Task 4.4 — How priorities and exclusions affect results

Store them as `DatePreferences` (`{ excluded, priority }`) from phase 02, saved
via `savePreferences`. They act at two points, and **only** these two:

- **Exclusions are absolute.** `planSearches` never emits a search for an
  excluded departure date, and any candidate trip whose departure or return
  falls on an excluded date is dropped before scoring.
- **Priorities break ties in ordering.** After `scoreArrangements` produces its
  0..1 score, a small bonus of `priority * DATE_PRIORITY_BONUS` is added, with
  `DATE_PRIORITY_BONUS = 0.02` in `config/constants.ts`. Small on purpose: a
  preferred date should win between near-equal options, never override a much
  better one. Add the helper to `grouping.ts`, not to `ranking.ts` — the
  reference scoring stays untouched.

Document this in the modal itself as a one-line muted caption, so the effect is
not a mystery.

### Task 4.5 — Advanced-mode search flow

In advanced mode a search is N searches, one per candidate departure date:

1. `eachDayInRange(range)` minus `excludedDates` gives the candidate list.
2. For each candidate, the return date is `candidate + tripDurationDays`.
3. `planSearches` runs per candidate, then the whole set is deduplicated (feeder
   legs on shared dates collapse — this is where the biggest saving is).
4. Arrangements from every candidate date are pooled and sorted together by the
   same weighting logic, so the result list mixes dates. Each `Arrangement`
   carries its departure date so the card can show it.

---

## Part B — Destination and Airport Map

### Task 4.6 — Dependencies

Add `leaflet`, `react-leaflet` and `@types/leaflet` to `package.json` and
install. Import Leaflet's CSS in the map component only (a module-level
`import "leaflet/dist/leaflet.css"`), not in `globals.css`, so nothing else in
the project is affected.

Leaflet touches `window` on import, so `MapCanvas` must be loaded with
`next/dynamic` and `{ ssr: false }`. Everything else can render server-side.

Tiles: OpenStreetMap's standard tiles with the required attribution. Note in a
comment that this is fine for development and must be revisited before
production traffic.

### Task 4.7 — `MapModal`

`app/components/airsearcher/map/MapModal.tsx`, in a `FixedModal`. Full-viewport
on mobile, an inset dialog on desktop.

Layout:

```
[ MapSearchBar                                   ]  <- top
[                                                ]
[               MapCanvas                        ]
[                                                ]
[ MapSelectionBar: chips + Confirm button        ]  <- bottom
```

Opened from two places, both wired now:

- the **Map** control on a destination city row (phase 03's `onOpenMap`), and
- the city-airport panel, to pick airports geographically.

Props:

```tsx
type Props = {
  open: boolean;
  onClose: () => void;
  initialCityId?: string;
  value: { cityId: string | null; airports: AirportCode[] };
  onConfirm: (next: Props["value"]) => void;
};
```

Selection is confirmed explicitly — `onConfirm` fires only from the button, so
panning around never silently changes the search.

### Task 4.8 — `MapSearchBar`

Reuses **`DestinationField`** from phase 03 with `styleType="simple"`, exactly as
the instructions require ("the same interaction/design as the destination input
used in the main flight interface"). Do not write a second search component.

Selecting a suggestion flies the map to that city or airport
(`map.flyTo([lat, lon], zoom)`) and selects it.

### Task 4.9 — `MapCanvas`, `CityMarker`, `AirportMarker`

`MapCanvas` holds the `MapContainer`, the tile layer, and the marker layers. It
renders `europeCities` and `europeAirports` from `app/data/`.

Marker rules:

- **Cities** are always visible: a dot plus a label, larger and orange
  (`colorSecondary`) when selected.
- **Airports** are hidden below `AIRPORT_ZOOM_THRESHOLD` (in
  `config/constants.ts`, default 6) so a zoomed-out map is not cluttered.
  Subscribe to Leaflet's `zoomend` via `useMapEvents` and keep the current zoom
  in state.
- Both are rendered as `CircleMarker`s with theme colours, not image pins, so no
  icon asset is needed and no missing-icon problem arises.

Selection rules — the important part:

- Clicking a **city** selects the city and **all of its airports**.
- Clicking an **airport** selects that airport, and its city becomes the
  selected city.
- Multiple airports may be selected, but **only within one city**. Selecting an
  airport belonging to a different city **clears the previous city's airport
  selection entirely** and starts fresh with the new one.

Put this rule in one pure function so it is testable and cannot drift:

```ts
// app/lib/airsearcher/mapSelection.ts
export function toggleAirport(
  current: { cityId: string | null; airports: AirportCode[] },
  airport: Airport,
): { cityId: string; airports: AirportCode[] };

export function selectCity(city: City): { cityId: string; airports: AirportCode[] };
```

`MapCanvas` calls these and renders the result; it contains no selection logic
of its own.

### Task 4.10 — `MapSelectionBar`

Bottom bar showing the current selection as removable chips (city name, then one
chip per airport), plus:

- a **Select all airports in this city** `Button styleType="tertiary"`,
- a **Confirm** `Button styleType="primary"`, disabled when nothing is selected.

---

## Verification

- `npx tsc --noEmit` clean; `npm run build` succeeds (catches SSR problems with
  Leaflet — if the build fails on `window`, the dynamic import is wrong).
- Calendar: excluding a date removes it from the candidate list and lowers the
  displayed request count. Priority cycles 1 to 2 to 3 to none.
- Map: zooming out past the threshold hides airports; zooming in shows them.
- Map: select LHR, then select CDG — LHR is deselected and the selection is
  Paris only. Select LHR then LGW — both stay selected.
- Confirming in the map updates the destination field on Home.
- Map modal is usable at 320px width.
- `leaflet` CSS does not leak into other pages (check `/` and `/styleguide` look
  unchanged).

---

## Checkpoint

Demonstrate both modals against their Penpot boards. Confirm the priority
mechanism (small tie-break bonus, not an override) is what the user intended
before phase 06 exposes the same calendar in the sidebar.
