"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, colorMain, radius } from "@/config/theme";
import {
  daysBetween,
  parseIsoDate,
  pickRangeDay,
  shiftRangeField,
  type DraftRange,
  type RangeField,
} from "@/lib/airsearcher/time";
import type { DayState } from "./DayCell";
import MonthGrid from "./MonthGrid";

/** "Sat 24 Oct": a field's date, short enough for two side by side. */
function fieldDate(iso: string | null): string {
  const date = iso ? parseIsoDate(iso) : null;
  if (!date) return "Choose a day";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

interface Month {
  year: number;
  month: number;
}

function monthOfIso(iso: string): Month {
  const date = parseIsoDate(iso) ?? new Date();
  return { year: date.getFullYear(), month: date.getMonth() };
}

function addMonths(view: Month, count: number): Month {
  const date = new Date(view.year, view.month + count, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

const monthIndex = (view: Month) => view.year * 12 + view.month;

/** One end of the range: its date in a box, with a day back and a day on either side. */
function RangeFieldBox({
  label,
  value,
  active,
  onActivate,
  onShift,
}: {
  label: string;
  value: string | null;
  active: boolean;
  onActivate: () => void;
  onShift: (days: number) => void;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center bg-white ${radius} border ${
        active ? `${colorMain.border} ring-1 ring-blue-500` : "border-gray-300"
      }`}
    >
      <Button styleType="tertiary" onClick={onActivate} className="min-w-0 flex-1 justify-start! bg-transparent! px-3! py-1.5!">
        <div className="flex min-w-0 flex-col items-start">
          <Text size="very small" value={label} className={active ? colorMain.text : "text-gray-500"} />
          <Text size="small" value={fieldDate(value)} className="font-semibold whitespace-nowrap text-gray-900" />
        </div>
      </Button>
      {value && (
        <div className="flex shrink-0 items-center pr-1">
          <Button styleType="tertiary" onClick={() => onShift(-1)} className="bg-transparent! p-1.5!">
            <Text icon="arrow-left" size="very small" />
            <span className="sr-only">A day earlier</span>
          </Button>
          <Button styleType="tertiary" onClick={() => onShift(1)} className="bg-transparent! p-1.5!">
            <Text icon="arrow-right" size="very small" />
            <span className="sr-only">A day later</span>
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Picks a date range in two months side by side, the way Google Flights' date
 * picker works:
 *
 *   - Two fields on top, the active one outlined. The first click sets the
 *     start and moves on to the end; while the end is being chosen, the band
 *     follows the pointer from the start to the day under it.
 *   - Clicking a field chooses which end the next click sets. A new start
 *     keeps the range's length; a day before the start, while choosing the
 *     end, starts the range there instead.
 *   - Each field's arrows move it a day: the start moves the whole range, the
 *     end only itself.
 *
 * With `paint` set, a click on a day goes there instead (excluding or
 * favouring days) and the range only shows.
 */
export default function RangePicker({
  range,
  onRangeChange,
  active,
  onActiveChange,
  labels,
  today,
  extraState,
  paint,
  onReset,
}: {
  range: DraftRange;
  onRangeChange: (next: DraftRange) => void;
  active: RangeField;
  onActiveChange: (field: RangeField) => void;
  labels: { start: string; end: string };
  /** Days before it can't be picked. */
  today: string;
  /** More state per day, such as exclusions or days already searched. */
  extraState?: (iso: string) => Partial<DayState>;
  paint?: { onClick: (iso: string) => void; onEnter: (iso: string) => void } | null;
  onReset?: () => void;
}) {
  const [view, setView] = useState<Month>(() => monthOfIso(range.start ?? today));
  const [hover, setHover] = useState<string | null>(null);
  const firstMonth = monthOfIso(today);

  // A range set from outside (a quick range) is brought into view, during
  // render so the old months are never drawn first. A day clicked here is
  // already in view, so the months never jump under the pointer.
  const [shownStart, setShownStart] = useState(range.start);
  if (shownStart !== range.start) {
    setShownStart(range.start);
    if (range.start) {
      const target = monthIndex(monthOfIso(range.start));
      if (target < monthIndex(view) || target > monthIndex(view) + 1) setView(monthOfIso(range.start));
    }
  }

  /** Brings a day into the two months shown, when an arrow moves it out. */
  const showDay = (iso: string | null) => {
    if (!iso) return;
    const target = monthIndex(monthOfIso(iso));
    if (target < monthIndex(view)) setView(monthOfIso(iso));
    else if (target > monthIndex(view) + 1) setView(addMonths(monthOfIso(iso), -1));
  };

  const pick = (iso: string) => {
    if (paint) {
      paint.onClick(iso);
      return;
    }
    const next = pickRangeDay(range, active, iso);
    onRangeChange(next.range);
    onActiveChange(next.active);
  };

  const shift = (field: RangeField, days: number) => {
    const next = shiftRangeField(range, field, days, today);
    onRangeChange(next);
    showDay(field === "start" ? next.start : next.end);
  };

  // While the end is being chosen, the band runs from the start to the day under the pointer.
  const previewing =
    !paint && active === "end" && range.start !== null && hover !== null && hover >= range.start && hover !== range.end;
  const bandStart = range.start;
  const bandEnd = previewing ? hover : range.end;

  const stateOf = (iso: string): DayState => {
    const inBand = bandStart !== null && bandEnd !== null && iso >= bandStart && iso <= bandEnd;
    return {
      disabled: iso < today,
      inRange: inBand,
      isEndpoint: iso === range.start || (!previewing && iso === range.end),
      previewEnd: previewing && iso === hover && hover !== range.start,
      bandLeft: inBand && iso > bandStart!,
      bandRight: inBand && iso < bandEnd!,
      excluded: false,
      priority: 0,
      isToday: iso === today,
      ...extraState?.(iso),
    };
  };

  const span = range.start && range.end ? daysBetween(range.start, range.end) + 1 : null;
  const second = addMonths(view, 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 basis-80 gap-2">
          <RangeFieldBox
            label={labels.start}
            value={range.start}
            active={!paint && active === "start"}
            onActivate={() => onActiveChange("start")}
            onShift={(days) => shift("start", days)}
          />
          <RangeFieldBox
            label={labels.end}
            value={range.end}
            active={!paint && active === "end"}
            onActivate={() => onActiveChange("end")}
            onShift={(days) => shift("end", days)}
          />
        </div>
        <div className="flex items-center gap-2">
          {span !== null && (
            <Text size="very small" value={`${span} day${span === 1 ? "" : "s"}`} className="tabular-nums text-gray-500" />
          )}
          {onReset && (
            <Button styleType="tertiary" onClick={onReset}>
              <Text size="small" value="Reset" />
            </Button>
          )}
        </div>
      </div>

      <Text
        size="very small"
        value={
          paint
            ? "Click or drag over days to mark them."
            : active === "start"
              ? `Choose the ${labels.start.toLowerCase()}.`
              : range.start
                ? `Choose the ${labels.end.toLowerCase()}, or a day before ${fieldDate(range.start)} to start there.`
                : `Choose the ${labels.start.toLowerCase()}.`
        }
        className="text-gray-500"
      />

      <div className={`relative ${border} ${radius} p-3`}>
        <div className="absolute inset-x-2 top-2 flex justify-between">
          <Button
            styleType="tertiary"
            disabled={monthIndex(view) <= monthIndex(firstMonth)}
            onClick={() => setView((current) => addMonths(current, -1))}
            className="rounded-full! p-2!"
          >
            <Text icon="arrow-left" size="small" />
            <span className="sr-only">Previous month</span>
          </Button>
          <Button
            styleType="tertiary"
            onClick={() => setView((current) => addMonths(current, 1))}
            className="rounded-full! p-2!"
          >
            <Text icon="arrow-right" size="small" />
            <span className="sr-only">Next month</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-8 pt-1 sm:grid-cols-2">
          {[view, second].map((month, index) => (
            <div key={index} className={index === 1 ? "hidden sm:block" : ""}>
              <MonthGrid
                year={month.year}
                month={month.month}
                stateOf={stateOf}
                onDayClick={pick}
                onDayEnter={(iso) => {
                  setHover(iso);
                  paint?.onEnter(iso);
                }}
                onLeave={() => setHover(null)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
