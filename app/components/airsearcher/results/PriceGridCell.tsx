"use client";

import Button from "@/framework/ui/buttons/Button";
import { grayLight, grayStrong } from "@/config/theme";

export interface CellState {
  /** Not a bookable pair — renders as an empty, non-interactive box. */
  invalid: boolean;
  /** Valid pair with no surviving result. */
  empty: boolean;
  /** Price from the stored floor: filters not applied, no flights to list. */
  unfiltered: boolean;
  cheapest: number | null;
  /** The single lowest price in the grid. */
  isBest: boolean;
  /** "low" | "mid" | "high" tercile, or null when empty. */
  band: "low" | "mid" | "high" | null;
  selected: boolean;
}

/**
 * One cell of the price grid.
 *
 * Written like `calendar/DayCell`: a tertiary Button whose state classes carry
 * `!`, so they win over the variant's own background. The price is bare — the
 * currency is stated once in the panel header — and `label` spells the cell
 * out in full for screen readers.
 */
export default function PriceGridCell({
  state,
  label,
  onClick,
  onHover,
}: {
  state: CellState;
  label: string;
  onClick: () => void;
  onHover: () => void;
}) {
  if (state.invalid) {
    return <td className={`h-9 p-0.5 ${grayLight.bg}`} aria-hidden onMouseEnter={onHover} />;
  }

  // Literal classes: Tailwind cannot see an `!` appended to a token at runtime.
  // They mirror colorMain (blue-600) and DayCell's in-range blue.
  const bandClass = state.isBest
    ? "bg-blue-600! text-white!"
    : state.band === "low"
      ? "bg-blue-50! text-blue-900!"
      : state.band === "high"
        ? "bg-gray-50! text-gray-600!"
        : "bg-transparent!";

  return (
    <td className="h-9 p-0.5" onMouseEnter={onHover}>
      <Button
        styleType="tertiary"
        disabled={state.empty || state.unfiltered}
        onClick={onClick}
        onHover={onHover}
        className={`h-8 w-full p-0! text-xs tabular-nums ${
          state.empty
            ? `bg-transparent! ${grayStrong.text} opacity-50`
            : state.unfiltered
              ? "bg-transparent! text-gray-400! italic"
              : bandClass
        } ${
          // colorSecondary.ring only shows on focus; a selection must show always.
          state.selected ? "ring-2 ring-orange-500" : ""
        }`}
      >
        <span aria-hidden>{state.empty ? "–" : state.cheapest}</span>
        <span className="sr-only">{label}</span>
      </Button>
    </td>
  );
}
