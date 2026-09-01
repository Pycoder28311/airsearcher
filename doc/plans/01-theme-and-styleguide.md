# Phase 01 — Theme + Style Guide

**Goal:** retune `app/config/theme.ts` to a light Notion-gray palette with blue
and orange accents, then build `/styleguide`, a page showing every variation of
every reusable component so the result can be reviewed at a glance.

**Depends on:** nothing. **Blocks:** 03, 04, 05, 06 (they consume the tokens).

**Permission note:** this is the only phase that edits a file in `app/config/`,
and it edits **`theme.ts` only**. No other config file is touched.

---

## Task 1.1 — Retune `app/config/theme.ts`

Edit in place; keep every exported name, type and shape identical so nothing
downstream breaks. Only class-name strings change.

**Grays — the Notion neutral scale.** Notion's surfaces are warm, low-contrast
neutrals. Tailwind's `stone` family is the closest match, but the theme's
comment block explains that `gray-*` utilities are what `globals.css` re-maps
per theme. Since we committed to a light-only look, keep the token *names* on
the gray scale and shift which step each token uses so the page reads lighter
and warmer:

| Token | Now | Target role |
| --- | --- | --- |
| `grayLight` | `bg-gray-100` | Page and card surfaces. Slightly lighter: `bg-gray-50`, hover `bg-gray-100`, active `bg-gray-200` |
| `grayMid` | `bg-gray-300` | Borders and dividers. Softer: `border-gray-200`, hover `border-gray-300` |
| `grayStrong` | `bg-gray-600` | Muted body text and strong elements. Keep `text-gray-600`, hover `text-gray-700` |

`border` becomes `border border-gray-200` (Notion borders are very light).
`shadow` stays `shadow-sm` — Notion is flat.

**Accents.**

- `colorMain` stays blue but drops a step for a calmer surface: `bg-blue-600`
  fill, `text-blue-600` text, `focus-visible:ring-blue-500`, `focus:border-blue-500`,
  `focus:ring-2 focus:ring-blue-500/25`.
- `colorSecondary` changes from green to **orange**: `bg-orange-500`,
  `hover:bg-orange-600`, `active:bg-orange-700`, `text-orange-600`,
  `border-orange-500`, `focus-visible:ring-orange-500`,
  `focus:border-orange-500`, `focus:ring-2 focus:ring-orange-500/25`.
- `colorPrimaries` (solid neutral fill for `secondary` buttons) softens from
  `bg-gray-800` to `bg-gray-900` text-white with `hover:bg-black` — Notion's
  primary action is near-black.
- `colorRed` unchanged.

**Update the file's doc comment.** The header currently describes multi-theme
behaviour via `next-themes`. Replace that section with a short note that the
project now commits to a single light palette, that gray tokens are still
written as literal `gray-*` classes so Tailwind's scanner picks them up, and
that the `next-themes` classes in `globals.css` are no longer targeted. Do not
edit `globals.css`.

**Verify:** `npx tsc --noEmit` passes and every class name is a complete literal
string (never built by interpolation), so Tailwind generates the CSS.

---

## Task 1.2 — Confirm the two `buttonConfig.ts` literals

`buttonConfig.ts` is not editable in this phase. Two hard-coded colours survive
the retune:

1. `primary.base` contains `shadow-[0_4px_0_0_#1d4ed8]` — a blue-700 drop
   shadow. Still blue, still correct. **No action.**
2. `nav.hover` and `nav.active` contain `after:bg-green-500` — the nav underline
   stays **green** while the rest of the app moves to orange.

Do not change either. Record the mismatch in the phase notes and ask the user
whether to make the one-line `nav` edit. If they approve, change both
occurrences of `after:bg-green-500` to `after:bg-orange-500`. Default: leave it.

---

## Task 1.3 — Style-guide page shell

Create `app/styleguide/page.tsx` as a client component. It renders a standalone
page (no `AppShell`, no `Navbar`) with:

- A sticky page header: `<Text size="big" value="AirSearcher style guide" />`
  and a one-line subtitle in `size="small"`.
- A vertical stack of `<Section>` blocks, one per config file.

Create `app/components/airsearcher/common/StyleGuideSection.tsx`:

```tsx
type Props = { title: string; source: string; children: React.ReactNode };
```

Renders a titled block with the config file path shown in `size="very small"`
muted text, on a `grayLight.bg` card with `radiusBig` and `border` from the
theme. Every visual value comes from `theme.ts` — no literals.

Create `app/components/airsearcher/common/VariantRow.tsx`:

```tsx
type Props = { label: string; children: React.ReactNode };
```

A labelled row: the variant name on the left (`size="small"`, muted), the live
component on the right. Wraps on mobile, side-by-side from `sm:`.

Keep both files small — layout only, no config knowledge.

---

## Task 1.4 — Button section

One `VariantRow` per entry in `BUTTON_VARIANTS`, imported from
`@/config/buttonConfig` so the list can never drift from the config:

```tsx
import { BUTTON_VARIANTS } from "@/config/buttonConfig";
```

For each variant show four states side by side so hover/active/disabled are all
reviewable:

- default
- disabled (`disabled`)
- with a left icon (`<Text icon="check" value="Label" size="small" />` as the child)
- as a link (`href="#"`)

Note in a caption that hover and `:active` states must be checked by mousing
over, since they cannot be rendered statically.

---

## Task 1.5 — Text section

One `VariantRow` per entry in `TEXT_SIZES` (`@/config/textConfig`), each showing:

- text only
- `icon="star"` with `iconPosition="left"`
- `icon="arrow-right"` with `iconPosition="right"`

Below it, an icon grid: every key of `ICONS` from `@/config/iconConfig` rendered
at `size="small"` with its name beneath, in a
`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3` layout. This doubles as
the reference for which icon names exist (see open item 2 in the spec).

---

## Task 1.6 — Input section

One `VariantRow` per entry in `INPUT_STYLE_TYPES` (`@/config/inputConfig`),
each rendered with a placeholder and a filled value.

Then a second block for `INPUT_TYPES` and `CONTROL_INPUT_TYPES` from
`@/config/inputTypeConfig`: one `Input` per native type (`text`, `number`,
`date`, `checkbox`, `radio`, `color`, `range`, `file`, …), so the control styles
can be compared. Read the config to get the exact list rather than typing it
out.

---

## Task 1.7 — Search input section

One `VariantRow` per entry in `SEARCH_INPUT_TYPES` (`simple`, `BigSearch`),
each shown three ways:

- with the search icon (`searchIcon`)
- without it
- with a `leftButton` (a `<Button styleType="tertiary">` acting as a filter chip)

---

## Task 1.8 — Alerts and modals section

- Four buttons that fire `useAlert` with each `AlertType`, so the toast styling
  can be reviewed live.
- A button opening an `AbsoluteModal` anchored below it (`side="bottom"`,
  `align="start"`, `matchAnchorWidth`) containing a short list — this is the
  exact pattern the departure dropdown and sort-by dropdown will use.
- A button opening a `FixedModal` with a small dialog body — the pattern the
  calendar and map modals will use.

Keep each demo's body trivial. This section exists to prove the framework
primitives behave with the new theme, not to prototype airsearcher UI.

---

## Task 1.9 — Colour-token swatches

A final section rendering the raw theme tokens so the palette itself can be
judged: a swatch grid for `colorMain`, `colorSecondary`, `colorPrimaries`,
`colorRed`, `grayLight`, `grayMid`, `grayStrong` — each showing its `bg` fill,
its `text` colour on white, and its `border`.

Import the tokens from `@/config/theme` and render them; do not retype the class
strings.

---

## Verification

- `npx tsc --noEmit` clean.
- `npm run dev`, open `/styleguide`, and check every section renders.
- Resize from 320px to desktop: no horizontal scroll, no overlapping labels.
- No file outside `app/config/theme.ts`, `app/styleguide/`, and
  `app/components/airsearcher/common/` was modified.
- Grep the new files for stray literals — no `bg-`, `text-`, `border-`,
  `rounded-`, or `shadow-` class written by hand where a theme token exists.
  (Layout utilities such as `flex`, `grid`, `gap-*`, `p-*` are fine.)

---

## Checkpoint

Show the user `/styleguide`. Ask specifically:

1. Is the gray/orange/blue balance right, or should orange be more or less
   prominent?
2. Should the `nav` button underline change from green to orange (open item 1)?
3. Are any variants missing that airsearcher will need — and if so, should they
   be added to the configs?

Do not start phase 03 before this is answered; phases 03–06 assume these tokens
are final.
