"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Input from "@/framework/ui/input/Input";
import Text from "@/framework/ui/iconText/Text";
import { colorRed, colorSecondary, grayMid, radius } from "@/config/theme";
import {
  DEFAULT_TRIP_LENGTH_RANGE,
  MAX_ADVANCED_RANGE_DAYS,
} from "@/lib/airsearcher/config/constants";
import { candidateDates, planSearches } from "@/lib/airsearcher/queryPlan";
import { costOf, describeCost } from "@/lib/airsearcher/quota";
import { addDays, daysBetween, formatDate, isoDate, parseIsoDate } from "@/lib/airsearcher/time";
import type { SearchQuery } from "@/lib/airsearcher/types";
import Dialog from "../common/Dialog";
import Stepper from "../common/Stepper";
import type { DayState } from "./DayCell";
import MonthGrid from "./MonthGrid";

/** What a click on a day does. */
type PaintMode = "range" | "exclude" | "prioritise";

const MODES: { value: PaintMode; label: string }[] = [
  { value: "range", label: "Set range" },
  { value: "exclude", label: "Exclude" },
  { value: "prioritise", label: "Prioritise" },
];

/**
 * The advanced date search: a window the trip may start in, a fixed trip
 * length (or an open one, where the whole trip must fit in the window), dates
 * to avoid, and dates to favour.
 *
 * Exclusions are absolute — an excluded date is never searched, so removing one
 * genuinely lowers the number of searches, which the footer shows live. Priorities
 * only break ties between near-equal results.
 *
 * Everything is edited on a working copy; nothing is applied until Apply. The
 * caller remounts this on open (see the `key` it passes), so the working copy
 * always starts from what is actually stored rather than a stale draft.
 */
export default function AdvancedCalendarModal({
  open,
  onClose,
  query,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  query: SearchQuery;
  onApply: (next: Partial<SearchQuery>) => void;
}) {
  const today = isoDate(new Date());

  const [mode, setMode] = useState<PaintMode>("range");
  const [range, setRange] = useState(query.dateRange);
  const [duration, setDuration] = useState(query.tripDurationDays ?? 7);
  /** Whether the trip length is left open; the range survives unticking. */
  const [flexible, setFlexible] = useState(Boolean(query.tripLengthRange));
  const [lengthRange, setLengthRange] = useState<{ min: number; max: number }>(
    query.tripLengthRange ?? DEFAULT_TRIP_LENGTH_RANGE,
  );
  const roundTrip = query.tripType === "round-trip";
  const [excluded, setExcluded] = useState<string[]>(query.excludedDates);
  const [priority, setPriority] = useState<Record<string, number>>(query.priorityDates);
  /** Set while the pointer is down, so a drag can paint several days. */
  const [painting, setPainting] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    if (!painting) return;
    const stop = () => setPainting(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [painting]);

  const span = range ? daysBetween(range.start, range.end) + 1 : 0;
  const tooLong = span > MAX_ADVANCED_RANGE_DAYS;

  const draft: SearchQuery = useMemo(
    () => ({
      ...query,
      dateMode: "advanced",
      dateRange: range,
      tripDurationDays: duration,
      tripLengthRange: flexible ? lengthRange : null,
      excludedDates: excluded,
      priorityDates: priority,
    }),
    [query, range, duration, flexible, lengthRange, excluded, priority],
  );

  const dates = candidateDates(draft);
  const sources = draft.rangeWithSerpApi
    ? `Travelpayouts + ${describeCost(costOf(planSearches(draft)))}`
    : `Travelpayouts only, ${describeCost(0)}`;

  const paint = (iso: string) => {
    if (mode === "exclude") {
      setExcluded((current) =>
        current.includes(iso) ? current.filter((d) => d !== iso) : [...current, iso],
      );
      return;
    }
    if (mode === "prioritise") {
      setPriority((current) => {
        const next = { ...current };
        const level = (current[iso] ?? 0) + 1;
        if (level > 3) delete next[iso];
        else next[iso] = level;
        return next;
      });
    }
  };

  const clickDay = (iso: string) => {
    if (mode === "range") {
      if (anchor === null) {
        setAnchor(iso);
        setRange({ start: iso, end: iso });
      } else {
        const start = anchor <= iso ? anchor : iso;
        const end = anchor <= iso ? iso : anchor;
        setRange({ start, end });
        setAnchor(null);
      }
      return;
    }
    setPainting(true);
    paint(iso);
  };

  const enterDay = (iso: string) => {
    if (painting && mode !== "range") paint(iso);
  };

  const stateOf = (iso: string): DayState => ({
    disabled: iso < today,
    inRange: range !== null && iso >= range.start && iso <= range.end,
    isEndpoint: range !== null && (iso === range.start || iso === range.end),
    excluded: excluded.includes(iso),
    priority: priority[iso] ?? 0,
    isToday: iso === today,
  });

  const base = parseIsoDate(range?.start ?? today) ?? new Date();
  const monthOf = (offset: number) => {
    const date = new Date(base.getFullYear(), base.getMonth() + monthOffset + offset, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Advanced date search"
      subtitle="Search a window of departure dates for a trip of fixed or open length."
      width="max-w-3xl"
      footer={
        <>
          <div className="flex flex-col">
            <Text
              size="very small"
              value={`${dates.length} candidate date${dates.length === 1 ? "" : "s"} · ${sources}`}
              className={tooLong ? colorRed.text : "text-gray-500"}
            />
            {tooLong && (
              <Text
                size="very small"
                value={`Keep the range within ${MAX_ADVANCED_RANGE_DAYS} days`}
                className={colorRed.text}
              />
            )}
          </div>
          <div className="flex gap-2">
            <Button
              styleType="tertiary"
              onClick={() => {
                setExcluded([]);
                setPriority({});
                setAnchor(null);
              }}
            >
              Clear marks
            </Button>
            <Button
              styleType="primary"
              disabled={range === null || tooLong || dates.length === 0}
              onClick={() => {
                onApply({
                  dateMode: "advanced",
                  dateRange: range,
                  tripDurationDays: duration,
                  tripLengthRange: flexible ? lengthRange : null,
                  excludedDates: excluded,
                  priorityDates: priority,
                });
                onClose();
              }}
            >
              Apply
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            {roundTrip && flexible ? (
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1">
                  <Text size="very small" value="Shortest trip (nights)" className="text-gray-500" />
                  <Stepper
                    value={lengthRange.min}
                    onChange={(min) => setLengthRange((current) => ({ ...current, min }))}
                    min={1}
                    max={lengthRange.max}
                    label="night"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <Text size="very small" value="Longest trip (nights)" className="text-gray-500" />
                  <Stepper
                    value={lengthRange.max}
                    onChange={(max) => setLengthRange((current) => ({ ...current, max }))}
                    min={lengthRange.min}
                    max={60}
                    label="night"
                  />
                </label>
              </div>
            ) : (
              <label className="flex flex-col gap-1">
                <Text size="very small" value="Trip length (nights)" className="text-gray-500" />
                <Stepper value={duration} onChange={setDuration} min={1} max={60} label="night" />
              </label>
            )}
            {roundTrip && (
              <label className="flex cursor-pointer items-center gap-2">
                <Input
                  type="checkbox"
                  checked={flexible}
                  onChange={() => setFlexible((current) => !current)}
                />
                <Text
                  size="small"
                  value="Unspecified trip length — find the best trip"
                  className="text-gray-800"
                />
              </label>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Text size="very small" value="Clicking a day will…" className="text-gray-500" />
            <div className="flex gap-1">
              {MODES.map((option) => (
                <Button
                  key={option.value}
                  styleType={mode === option.value ? "secondary" : "tertiary"}
                  onClick={() => {
                    setMode(option.value);
                    setAnchor(null);
                  }}
                >
                  <Text size="small" value={option.label} />
                </Button>
              ))}
            </div>
          </div>
        </div>

        {roundTrip && flexible && (
          <Text
            size="very small"
            value="With an unspecified length the whole trip, return included, stays inside the range. Every day is still searched at most once each way, so this adds no SerpApi requests."
            className="max-w-prose text-gray-400"
          />
        )}

        <Text
          size="very small"
          value="Excluded dates are never searched, so removing them lowers the request count. Prioritised dates only break ties between results that score almost the same."
          className="max-w-prose text-gray-400"
        />

        <div className="flex items-center justify-between gap-2">
          <Button styleType="tertiary" onClick={() => setMonthOffset((m) => m - 1)}>
            <Text icon="arrow-left" size="small" />
            <span className="sr-only">Previous month</span>
          </Button>
          <Text
            size="very small"
            value={
              range ? `${formatDate(range.start)} – ${formatDate(range.end)}` : "No range chosen"
            }
            className="text-gray-600"
          />
          <Button styleType="tertiary" onClick={() => setMonthOffset((m) => m + 1)}>
            <Text icon="arrow-right" size="small" />
            <span className="sr-only">Next month</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {[0, 1].map((offset) => {
            const { year, month } = monthOf(offset);
            return (
              <div key={offset} className={offset === 1 ? "hidden sm:block" : ""}>
                <MonthGrid
                  year={year}
                  month={month}
                  stateOf={stateOf}
                  onDayClick={clickDay}
                  onDayEnter={enterDay}
                />
              </div>
            );
          })}
        </div>

        {excluded.length > 0 && (
          <div className="flex flex-col gap-2">
            <Text size="small" value="Excluded dates" className="font-medium text-gray-900" />
            <div className="flex flex-wrap gap-1.5">
              {[...excluded].sort().map((iso) => (
                <Button
                  key={iso}
                  styleType="tertiary"
                  onClick={() => setExcluded((c) => c.filter((d) => d !== iso))}
                  className={`gap-1.5 border ${colorRed.border}`}
                >
                  <Text size="very small" value={formatDate(iso)} className={colorRed.text} />
                  <Text icon="close" size="very small" className={colorRed.text} />
                </Button>
              ))}
            </div>
          </div>
        )}

        {Object.keys(priority).length > 0 && (
          <div className="flex flex-col gap-2">
            <Text size="small" value="Preferred dates" className="font-medium text-gray-900" />
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(priority)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([iso, level]) => (
                  <Button
                    key={iso}
                    styleType="tertiary"
                    onClick={() =>
                      setPriority((current) => {
                        const next = { ...current };
                        delete next[iso];
                        return next;
                      })
                    }
                    className={`gap-1.5 border ${colorSecondary.border}`}
                  >
                    <Text
                      size="very small"
                      value={`${formatDate(iso)} · ${"★".repeat(level)}`}
                      className={colorSecondary.text}
                    />
                  </Button>
                ))}
            </div>
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-3 ${radius} border ${grayMid.border} p-3`}>
          <Text size="very small" value="Quick range" className="text-gray-500" />
          <Button
            styleType="tertiary"
            onClick={() => setRange({ start: today, end: addDays(today, 29) })}
          >
            <Text size="very small" value="Next 30 days" />
          </Button>
          <Button
            styleType="tertiary"
            onClick={() =>
              setRange({ start: addDays(today, 30), end: addDays(today, 59) })
            }
          >
            <Text size="very small" value="The month after" />
          </Button>
        </div>

        <label className="flex flex-col gap-1">
          <Text size="very small" value="Or type the window" className="text-gray-500" />
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              value={range?.start ?? ""}
              onChange={(event) =>
                setRange({
                  start: event.target.value,
                  end: range?.end ?? event.target.value,
                })
              }
            />
            <Input
              type="date"
              value={range?.end ?? ""}
              min={range?.start}
              onChange={(event) =>
                setRange({ start: range?.start ?? event.target.value, end: event.target.value })
              }
            />
          </div>
        </label>
      </div>
    </Dialog>
  );
}
