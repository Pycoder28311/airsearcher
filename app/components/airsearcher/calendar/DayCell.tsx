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
}

/**
 * One day in the calendar grid.
 *
 * Every state is expressed with theme tokens, so exclusions read red, priority
 * reads orange with increasing strength, and the chosen range reads blue.
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
    ? "bg-blue-600! text-white!"
    : state.inRange
      ? "bg-blue-50! text-blue-900!"
      : "";

  // Exclusion wins over everything: it is the only state that removes a date.
  const stateClass = state.excluded
    ? "bg-transparent! text-red-600! line-through ring-1 ring-red-300"
    : priorityClass || rangeClass || "bg-transparent!";

  return (
    <Button
      styleType="tertiary"
      disabled={state.disabled}
      onClick={() => onClick(iso)}
      onHover={() => onPointerEnter(iso)}
      className={`h-9 w-full p-0! text-sm tabular-nums ${stateClass} ${
        state.isToday ? "ring-1 ring-gray-400" : ""
      }`}
    >
      {day}
    </Button>
  );
}
