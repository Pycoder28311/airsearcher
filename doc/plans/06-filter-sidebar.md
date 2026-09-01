# Phase 06 — Filter Sidebar

**Goal:** the collapsible filter sidebar on `/results`, following the
`serpAPItest` project's design and functionality with the specific changes the
instructions list.

**Depends on:** 05. **Blocks:** nothing — this is the last phase.

**Reference:** `serpAPItest/my-app/app/search/components/FilterSidebar.tsx`,
`FilterGroup.tsx`, `DualRange.tsx`, `PriceHistogram.tsx`, and
`app/flights/components/RankingPanel.tsx` / `HourCurveEditor.tsx`. Read them
first. The reference sidebar is one 355-line file — **do not** copy that shape.
Split it as described below.

---

## Task 6.1 — Structure

`app/components/airsearcher/filters/`:

| File | Contents |
| --- | --- |
| `FilterSidebar.tsx` | Composition only: header, the group list, footer. No filter logic. |
| `FilterGroup.tsx` | Collapsible titled section with a survivor count and an optional top-right slot |
| `ScopeDropdown.tsx` | Both flights / Going / Returning, for the top-right slot |
| `groups/TripTypeGroup.tsx` | |
| `groups/StopsGroup.tsx` | |
| `groups/PriceGroup.tsx` | histogram + range + weight |
| `groups/HourPreferencesGroup.tsx` | curves + hour weight + calendar access |
| `groups/AirlinesGroup.tsx` | |
| `groups/TimesGroup.tsx` | departure and arrival windows |
| `groups/DurationGroup.tsx` | duration + layovers |
| `groups/AvoidAirportsGroup.tsx` | multi-select + Select All |
| `groups/DepartureAirportsGroup.tsx` | reuses phase 03's editor |
| `groups/CabinGroup.tsx` | |
| `groups/EmissionsGroup.tsx` | |
| `DualRange.tsx` | ported from the reference |
| `PriceHistogram.tsx` | ported from the reference |
| `HourCurveEditor.tsx` | ported from the reference |

Every group takes the same prop shape and stays under about 120 lines:

```tsx
type GroupProps = {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  counts: Record<string, number>;
  isRoundTrip: boolean;
};
```

---

## Task 6.2 — `FilterGroup` with a scope slot

Port the reference `FilterGroup` — collapsible, title, survivor count — and add
a `topRight?: React.ReactNode` slot rendered on the header's right.

Restyle with `theme.ts` tokens (the reference uses `border-black/15` literals and
dark-mode variants; neither applies here). The chevron becomes
`<Text icon="chevron-down" />` rotating on open.

---

## Task 6.3 — `ScopeDropdown` (round-trip only)

`ScopeDropdown.tsx`: a small `Button` opening an `AbsoluteModal` with three
options — **Both flights**, **Going**, **Returning** — writing to
`filters.scopes[key]`.

Rendered into `FilterGroup`'s `topRight` slot **only when the trip type is
round trip**. On a one-way search the slot is empty and every filter implicitly
applies to the single direction.

Which groups get one: the `SCOPABLE_FILTERS` list from phase 02 — stops, price,
airlines, times, duration, avoid airports, cabin. Trip type, departure airports,
hour preferences and emissions do not (they are inherently whole-trip).

The button face shows the current scope in `size="very small"`, so a
non-default scope is visible without opening the dropdown.

---

## Task 6.4 — Group-by-group specification

**Trip type** — Round trip / One way. **Multi-city is removed**, both from the
UI and from the `TripType` union (done in phase 02).

**Stops** — as the reference: non-stop / 1 / 2 / 3+, multi-select with counts.

**Price** — `PriceHistogram` over the surviving arrangements' total prices, a
`DualRange` for min and max, **plus a `WeightSelector`** (task 6.6) for how much
price matters.

**Hour preferences** — moved **above Airlines**, per the instructions. Contains
the `HourCurveEditor` (outbound curve, and the return curve when the results
carry return legs), the hour `WeightSelector`, and a **"Advanced dates"**
`Button` opening phase 04's `AdvancedCalendarModal`. Editing exclusions or
priorities here re-filters and re-sorts the existing results immediately — no
new search, since the dates are already in the result pool.

The reference's **"Departure vs Arrival weight"** control is **removed
entirely**. `departureArrivalRatio` keeps its default from
`config/ranking.ts` and is no longer exposed.

**Airlines** — include/exclude mode plus a multi-select of the airlines present
in the current results (`airlinesIn`).

**Times** — the reference has departure windows only. Add **arrival windows**
alongside them:

- Outbound departure window, outbound arrival window.
- Return departure window, return arrival window (round trip only).
- Each a `DualRange` over 0–24 with `HH:00` labels.

**Coupling rule from the instructions:** the two are independently configurable,
but changing one moves the other to the corresponding value **by default**.
Implement as: when the user drags a departure window and the matching arrival
window is still at its default (or has never been touched), mirror the change
into it. Once the user edits an arrival window directly, it is marked "touched"
and stops following. Track this with a `touched: Set<string>` in the group's
local state, not in `FilterState` — it is interaction memory, not a filter.

**Duration and layovers** — as the reference: max duration and a layover range.

**Avoid airports** — upgraded from the reference's plain list to a
**multi-select with a Select All button**, reusing `MultiSelectList` and
`SelectAllRow` from phase 03. Options are the connecting airports appearing in
the current results (`connectingAirports`), plus any already excluded.

**Departure airports** — new group. Reuses phase 03's
`DepartureAirportEditor.tsx` **verbatim**: add airports, remove airports, edit
passenger counts, and choose which airport is the group's preferred **gathering
airport**. Changing the gathering airport re-runs `buildArrangements` against the
existing pool — no new search unless a newly added airport has no cached
flights, in which case show the request cost and require confirmation before
searching.

**Cabin** — travel class radio group, as the reference.

**Emissions** — "less emissions only" checkbox, as the reference.

---

## Task 6.5 — Header and footer

**Header:** "Filters" plus an active-filter count badge in `colorMain`, from
`countActiveFilters`.

**Footer:** a **"Reset All Filters"** `Button styleType="tertiary-bordered"`
spanning the width, calling `resetFilters(filters)` from phase 02 — restoring
`DEFAULT_FILTERS` while preserving the trip type. Disabled when nothing is
active. It also clears every `scopes` entry back to `"both"` and both weights
back to their defaults.

Keep the reference's honest caption near the top: filters remove options, they
never reorder. Weights reorder; filters exclude. Saying so prevents a whole
class of confusion.

---

## Task 6.6 — `WeightSelector`

`app/components/airsearcher/common/WeightSelector.tsx`.

Five segmented `Button`s from `WEIGHT_LEVELS`: **None · A little · Mid · Much ·
Completely**. Selected is `styleType="secondary"`, the rest `tertiary`. On
mobile they wrap; from `sm:` they sit in one row.

```tsx
type Props = { label: string; value: WeightLevel; onChange: (next: WeightLevel) => void };
```

The value maps through `levelToWeight` into `normalizeWeights({ price, hour })`,
so the reference weighting arithmetic is untouched — only the input is
five-level instead of a slider.

Used twice: Price and Hours.

---

## Task 6.7 — Collapsible sidebar

`app/components/airsearcher/common/SidebarToggle.tsx` plus state on the results
page.

- **Desktop (`lg:` and up):** the sidebar collapses to a narrow rail with a
  chevron and the active-filter count. Expanding restores it. Width animates via
  a transition on `w-*`, and the results column reflows.
- **Below `lg:`:** the sidebar is hidden by default and opens as a full-height
  overlay from the left, with a backdrop and a close `Button icon="close"`.
  Enable the toolbar button phase 05 left disabled.

**Collapsing must not touch results or filter values** — it is purely
presentational. Keep the open/closed flag in its own `useState` on the page,
never inside `FilterState`, and never unmount the sidebar (hide it), so
in-progress group expansion state survives a collapse.

Persist the collapsed flag under `airsearcher:prefs:v1` via `savePreferences`, so
the user's choice survives a reload.

---

## Verification

- `npx tsc --noEmit` clean.
- Multi-city appears nowhere — grep the whole `app/` tree for `multi-city` and
  `multiCity`.
- Hour preferences renders above Airlines.
- Departure vs Arrival weight appears nowhere.
- Scope dropdowns appear on the seven scopable groups when round trip, and on
  none when one way. Setting "Going" on Stops filters only the outbound leg —
  verify with a result whose return leg would otherwise be excluded.
- Dragging a departure window moves the untouched arrival window; after editing
  the arrival window directly, it stops following.
- Avoid airports: Select All ticks every option; the count badge updates.
- Departure airports: changing the gathering airport re-ranks without a new
  search.
- Reset All Filters returns everything to defaults including scopes and weights,
  and keeps the trip type.
- Collapse and expand the sidebar: the result list and every filter value are
  unchanged; the collapsed state survives a reload.
- No file in the sidebar exceeds roughly 120 lines except `FilterSidebar.tsx`
  (composition) and the ported `DualRange` / `HourCurveEditor`.

---

## Final checklist for the whole project

Run `instructions/checklist.md` against the finished work:

- [ ] Every colour, spacing, shadow and radius comes from `theme.ts` or a
      component config — grep the new files for hand-written `bg-`, `text-`,
      `border-`, `rounded-`, `shadow-` classes.
- [ ] Every button, text element, input, search box, alert and modal uses the
      framework component with a valid named style type.
- [ ] No style type was invented; anything missing was raised with the user.
- [ ] Layout is responsive, mobile-first, verified from 320px up.
- [ ] The only config file edited is `app/config/theme.ts` (phase 01).
- [ ] No protected path was edited: `app/framework/**`, `app/api/**`,
      `app/auth/**`, `prisma/**` are untouched — confirm with
      `git status` and `git diff --stat`.
- [ ] `Navbar.tsx` and `Footer.tsx` are untouched.
- [ ] No `fetch` to SerpAPI or `/api/**` anywhere in `app/components/airsearcher/**`
      or `app/lib/airsearcher/**`.
- [ ] `localStorage` appears only in `app/lib/airsearcher/storage.ts`.
- [ ] `npm run build` succeeds.
