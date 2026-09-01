# Phase 05 — Results Page

**Goal:** `/results` — result cards with closed and open states, a "See Flights"
breakdown, an open/close-all control, a Sort-by dropdown, and draggable,
resizable floating result windows.

**Depends on:** 02 (arrangements), 03 (search flow and storage).
**Blocks:** 06 (the sidebar lives on this page).

**Before starting:** read the Penpot results board, including **both** the
closed and open card states. Card internals come from Penpot; this plan fixes
structure, state and behaviour.

---

## Task 5.1 — Page shell

`app/results/page.tsx`, a client component.

```
<main>
  <aside>   FilterSidebar        (phase 06 — render a placeholder for now)
  <section>
    <ResultsHeader />            back link, query summary, staleness notice
    <ResultsToolbar />           ExpandAllToggle + SortByDropdown
    <ResultList />               ResultCard per arrangement
  </section>
  <FloatingLayer />              portal for floated cards
</main>
```

Layout: sidebar `hidden lg:block w-72 shrink-0`, results fill the rest. Below
`lg:` the sidebar becomes an overlay opened by a toolbar button (phase 06 wires
it; leave the button in place now, disabled).

On mount:

1. Read `?search=<id>` from `useSearchParams`.
2. `loadSearches()`, find the entry. Missing entry means the user landed
   directly — show an empty state with a link back to `/`.
3. If `isStale(entry)`, fire the **top-right** `useAlert` warning: "These
   results are more than a day old and should be recalculated with SerpAPI."
   Results still render.

State the page owns: `arrangements`, `filters`, `preferences`, `sortMode`,
`openIds: Set<string>`, `floatingIds: Set<string>`. Everything else is derived.

---

## Task 5.2 — `ResultsHeader`

`app/components/airsearcher/results/ResultsHeader.tsx`.

Shows: destination city and selected airports, the origin groups with passenger
counts, the dates (or the advanced range summary), trip type, and how many
arrangements survived filtering out of how many exist. A `Button
styleType="underline"` back to `/` labelled "Edit search".

When stale, an inline chip in `colorSecondary` repeats the warning, so it is
still visible after the toast dismisses.

---

## Task 5.3 — `ExpandAllToggle`

`app/components/airsearcher/results/ExpandAllToggle.tsx`. Sits **above** the
results, per the instructions.

A single `Button` that flips every card at once. Label reflects what it will do:
"Open all" when at least one card is closed, "Close all" when all are open. It
sets or clears `openIds` wholesale; individual cards can still be toggled after.

Floated cards are unaffected — they are always in their open state.

---

## Task 5.4 — `SortByDropdown`

`app/components/airsearcher/results/SortByDropdown.tsx`. Replaces the reference
project's row of buttons with a **dropdown**, per the instructions.

A `Button` (showing the current option) opening an `AbsoluteModal`
(`side="bottom"`, `align="end"`, `matchAnchorWidth`).

Options, from `SortMode` plus the group-specific ones:

| Option | Order |
| --- | --- |
| Best match | descending `arrangement.score` (default) |
| Cheapest first | ascending `totals.totalPrice` |
| Shortest travel | ascending `totals.longestTravelMinutes` |
| Earliest departure | ascending `totals.earliestDeparture` |

**"Cheapest first" shows the price of the cheapest result next to the option** —
computed from the currently filtered set, formatted as a currency string, in
muted `size="very small"` text on the right of the row. Recompute it whenever
filters change, so it never shows a price the user cannot actually reach.

Sorting calls `sortArrangements` from `grouping.ts`.

---

## Task 5.5 — `ResultCard` — closed and open

`ResultCard.tsx` is a thin switch; the two states are separate files so neither
grows unwieldy.

**`ResultCardClosed.tsx`** — the summary row: total price, price per passenger,
longest travel time, a compact routing summary ("ATH direct · SKG+HER via ATH"),
departure date, and the score as a small bar. Plus three controls:

- expand chevron (`icon="chevron-down"`),
- a float button (task 5.7),
- the score badge.

**`ResultCardOpen.tsx`** — everything in the closed state plus:

- a per-origin breakdown table: origin, passengers, routing, feeder flight
  summary, main flight summary, subtotal;
- `ResultCharts` (task 5.6);
- a **"See Flights"** `Button styleType="tertiary"` (task 5.8).

Both take the same props and are presentational:

```tsx
type Props = {
  arrangement: Arrangement;
  cheapestPrice: number;      // for the relative price bar
  onToggle: () => void;
  onFloat: () => void;
  floating: boolean;          // dims and disables the in-list card
};
```

Card chrome (surface, border, radius, shadow, hover) comes from `theme.ts`.

---

## Task 5.6 — `ResultCharts`

`app/components/airsearcher/results/ResultCharts.tsx`. Whatever graphs the
Penpot open state specifies. Expect at least:

- a **price breakdown** bar per origin group, widths proportional to each
  group's share of the total;
- a **timeline** strip per origin showing departure to arrival across the day,
  with the gathering wait visible as a gap;
- the **score composition** — the price index and hour index as two small bars,
  so why a result ranks where it does is legible.

Hand-rolled inline SVG, no chart library. Colours from `theme.ts`
(`colorMain` for price, `colorSecondary` for time). Every chart needs a text
equivalent nearby — a bar alone is not an accessible number.

Wrap wide charts in an `overflow-x-auto` container so the page body never
scrolls horizontally.

---

## Task 5.7 — Floating result windows

Three files.

**`FloatingLayer.tsx`** — a fixed, full-viewport, `pointer-events-none` layer
rendering one `FloatingWindow` per id in `floatingIds`. Only rendered from `lg:`
up; below that the float button is hidden, since free positioning is meaningless
on a phone.

**`FloatingWindow.tsx`** — a `pointer-events-auto` panel with:

- a **drag handle** header (the card title bar) — pointer events, not HTML5
  drag: `pointerdown` captures the pointer and records the offset, `pointermove`
  updates position, `pointerup` releases. Use `setPointerCapture` so a fast drag
  cannot escape the handle;
- a **resize grip** in the bottom-right corner using the same pointer pattern,
  with sensible minimums (`MIN_FLOAT_WIDTH`, `MIN_FLOAT_HEIGHT` in
  `config/constants.ts`);
- the card's **open state** as its body, scrollable inside the window;
- an **"Undrag"** `Button` restoring the result to the list;
- a **z-order bump**: clicking anywhere in a window brings it to the front.

Position and size live in a `useFloatingWindows` hook
(`app/components/airsearcher/results/useFloatingWindows.ts`) holding
`Record<id, { x, y, w, h, z }>`. New windows cascade — each opens offset from
the last so they do not stack exactly.

Clamp positions to the viewport on drop and on window resize, so a window can
never be dragged fully off-screen and lost.

**Behaviour in the list:** once floated, the result's original list position
becomes **unclickable and inactive** — rendered at reduced opacity, all controls
disabled, with a muted "Floating" label and a single enabled "Bring back"
control. It is not removed from the list, so the ordering does not jump.

---

## Task 5.8 — `FlightList` and `FlightRow`

`FlightList.tsx` opens from "See Flights" in the open card. Render it in a
`FixedModal` on mobile and inline within the card on desktop — a nested modal
inside a floating window is a trap.

Contents: every individual flight object belonging to the arrangement, in this
order:

1. **Going flights** — feeder legs first, then the main outbound leg.
2. **Returning flights** — the main return leg, then any return feeders.

Group with a `size="small"` heading per section and per origin.

`FlightRow.tsx` — one flight: airline and number, aircraft, departure airport and
time, arrival airport and time, duration, stops, layover airports, and price.
Adapt the reference project's `FlightCard.tsx` for the field set; restyle with
`theme.ts` tokens.

---

## Task 5.9 — Filtering hookup

Even though the sidebar arrives in phase 06, wire the pipeline now so 06 is only
UI:

```
arrangements
  -> applyScopedFilters(filters)       // filtering.ts
  -> scoreArrangements(weights, prefs) // grouping.ts
  -> sortArrangements(sortMode)        // grouping.ts
  -> render
```

Memoise on `[arrangements, filters, preferences, sortMode]`. Scoring must rerun
when weights change — `priceIndex` is relative to the surviving set, so
filtering something out legitimately changes everyone's score.

When the filtered set is empty, render `explainEmpty`'s reason plus a "Reset all
filters" `Button` — the same action phase 06 puts at the sidebar's foot.

---

## Verification

- `npx tsc --noEmit` clean.
- Open/close all flips every card; individual toggles still work afterwards.
- "Cheapest first" shows the correct cheapest price, and it updates when a
  filter narrows the set.
- Float a card: the list entry dims and stops responding, the window drags and
  resizes, "Undrag" restores it, and two floated windows can sit side by side.
- Dragging a window towards the edge clamps rather than losing it.
- "See Flights" lists going flights before returning flights.
- Landing on `/results?search=<old id>` fires the top-right staleness alert.
- 320px to desktop: no horizontal page scroll; charts scroll inside their own
  containers; the float button is hidden below `lg:`.

---

## Checkpoint

Show the closed and open card states beside the Penpot board, and demo the
floating comparison with three windows. Confirm before phase 06.
