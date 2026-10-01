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
import {
  addDays,
  daysBetween,
  formatDate,
  isoDate,
  type DraftRange,
  type RangeField,
} from "@/lib/airsearcher/time";
import type { SearchQuery } from "@/lib/airsearcher/types";
import Dialog from "../common/Dialog";
import Stepper from "../common/Stepper";
import RangePicker from "./RangePicker";

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
  const [draftRange, setDraftRange] = useState<DraftRange>({
    start: query.dateRange?.start ?? null,
    end: query.dateRange?.end ?? null,
  });
  // As in Google Flights, the picker opens on the start.
  const [active, setActive] = useState<RangeField>("start");
  /** The range once both ends are chosen. */
  const range = useMemo(
    () => (draftRange.start && draftRange.end ? { start: draftRange.start, end: draftRange.end } : null),
    [draftRange],
  );
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Select date range"
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
        {/* Trip length, with the "unspecified length" switch on its right. */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
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
              <label className="flex cursor-pointer items-center gap-2 pb-1">
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

        </div>

        <RangePicker
          range={draftRange}
          onRangeChange={setDraftRange}
          active={active}
          onActiveChange={setActive}
          labels={{ start: "First departure day", end: "Last departure day" }}
          today={today}
          extraState={(iso) => ({ excluded: excluded.includes(iso), priority: priority[iso] ?? 0 })}
          paint={
            mode === "range"
              ? null
              : {
                  onClick: (iso) => {
                    setPainting(true);
                    paint(iso);
                  },
                  onEnter: (iso) => {
                    if (painting) paint(iso);
                  },
                }
          }
          onReset={() => {
            setDraftRange({ start: null, end: null });
            setActive("start");
          }}
        />

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

        {/* Quick range on the left, what a click on a day does on the right. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className={`flex flex-1 basis-full flex-wrap items-center gap-3 sm:basis-auto ${radius} border ${grayMid.border} p-3`}>
            <Text size="very small" value="Quick range" className="text-gray-500" />
            <Button
              styleType="tertiary"
              onClick={() => setDraftRange({ start: today, end: addDays(today, 29) })}
            >
              <Text size="very small" value="Next 30 days" />
            </Button>
            <Button
              styleType="tertiary"
              onClick={() => setDraftRange({ start: addDays(today, 30), end: addDays(today, 59) })}
            >
              <Text size="very small" value="The month after" />
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <Text size="very small" value="Clicking a day will…" className="text-gray-500" />
            <div className="flex gap-1">
              {MODES.map((option) => (
                <Button
                  key={option.value}
                  styleType={mode === option.value ? "secondary" : "tertiary"}
                  onClick={() => setMode(option.value)}
                >
                  <Text size="small" value={option.label} />
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
