"use client";

import Text from "@/framework/ui/iconText/Text";
import { isoDate } from "@/lib/airsearcher/time";
import DayCell, { type DayState } from "./DayCell";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * One month of days.
 *
 * Knows nothing about modes or selection rules — it asks the caller what state
 * each day is in and reports clicks back. That keeps the calendar's behaviour
 * in one place instead of spread across the grid.
 */
export default function MonthGrid({
  year,
  month,
  stateOf,
  onDayClick,
  onDayEnter,
}: {
  year: number;
  /** 0-based, as JavaScript months are. */
  month: number;
  stateOf: (iso: string) => DayState;
  onDayClick: (iso: string) => void;
  onDayEnter: (iso: string) => void;
}) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // JavaScript weeks start on Sunday; this calendar starts on Monday.
  const leadingBlanks = (first.getDay() + 6) % 7;

  return (
    <div className="flex flex-col gap-2">
      <Text
        size="small"
        value={first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        className="font-semibold text-gray-900"
      />

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label) => (
          <Text
            key={label}
            size="very small"
            value={label}
            className="justify-center text-gray-400"
          />
        ))}

        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const iso = isoDate(new Date(year, month, day));
          return (
            <DayCell
              key={iso}
              iso={iso}
              day={day}
              state={stateOf(iso)}
              onClick={onDayClick}
              onPointerEnter={onDayEnter}
            />
          );
        })}
      </div>
    </div>
  );
}
