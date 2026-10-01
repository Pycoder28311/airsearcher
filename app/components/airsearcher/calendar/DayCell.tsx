"use client";

import Button from "@/framework/ui/buttons/Button";

export interface DayState {
  /** Outside the selectable window, or already in the past. */
  disabled: boolean;
  inRange: boolean;
  isEndpoint: boolean;
  excluded: boolean;
  /** 0 = none, 1..3 = increasing preference. */
  priority: number;
  isToday: boolean;
  /** A departure day a saved search already covers (the "change dates" calendar). */
  searched?: boolean;
  /** The range's band reaches the left or right edge of this day, joining it to its neighbours. */
  bandLeft?: boolean;
  bandRight?: boolean;
  /** The day under the pointer that would end the range: an outlined circle. */
  previewEnd?: boolean;
}

/**
 * One day in the calendar grid.
 *
 * Range ends are filled circles joined by a light band through the days
 * between, drawn edge to edge so the range reads as one shape, as in Google
 * Flights. Exclusions read red and priority orange with increasing strength.
 */
export default function DayCell({
  iso,
  day,
  state,
  onClick,
  onPointerEnter,
}: {
  iso: string;
  day: number;
  state: DayState;
  onClick: (iso: string) => void;
  onPointerEnter: (iso: string) => void;
}) {
  // `!` throughout: the tertiary variant paints its own background, and these
  // states must win over it whatever order the generated CSS ends up in.
  const priorityClass =
    state.priority >= 3
      ? "bg-orange-500! text-white!"
      : state.priority === 2
        ? "bg-orange-200! text-orange-900!"
        : state.priority === 1
          ? "bg-orange-100! text-orange-800!"
          : "";

  const rangeClass = state.isEndpoint
    ? "bg-blue-600! text-white! font-semibold"
    : state.previewEnd
      ? "bg-white! text-blue-900! ring-2! ring-blue-600!"
      : state.inRange
        ? "bg-transparent! text-blue-900!"
        : "";

  // Exclusion wins over everything: it is the only state that removes a date.
  const stateClass = state.excluded
    ? "bg-transparent! text-red-600! line-through ring-1 ring-red-300"
    : priorityClass || rangeClass || "bg-transparent! hover:bg-gray-100!";

  return (
    <div className="relative flex h-10 items-center justify-center">
      {state.bandLeft && <span aria-hidden className="absolute inset-y-0.5 left-0 w-1/2 bg-blue-50" />}
      {state.bandRight && <span aria-hidden className="absolute inset-y-0.5 right-0 w-1/2 bg-blue-50" />}
      <Button
        styleType="tertiary"
        disabled={state.disabled}
        onClick={() => onClick(iso)}
        onHover={() => onPointerEnter(iso)}
        className={`relative h-9 w-9 rounded-full! p-0! text-sm tabular-nums transition-none! ${stateClass} ${
          state.isToday && !state.isEndpoint ? "ring-1 ring-gray-400" : ""
        } ${state.searched ? "underline decoration-orange-500 decoration-2 underline-offset-4" : ""}`}
      >
        {day}
      </Button>
    </div>
  );
}
