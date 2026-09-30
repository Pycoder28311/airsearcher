"use client";

import { useMemo, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { colorRed } from "@/config/theme";
import { BROWSER_SEARCH_ESTIMATE_MS } from "@/lib/airsearcher/config/browser";
import { MAX_ADVANCED_RANGE_DAYS } from "@/lib/airsearcher/config/constants";
import { extendedQuery, missingJobs } from "@/lib/airsearcher/extend";
import { planSchedule, scheduleTotalMs } from "@/lib/airsearcher/pacing";
import { candidateDates } from "@/lib/airsearcher/queryPlan";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import {
  daysBetween,
  extendRange,
  formatDate,
  formatDuration,
  isoDate,
  parseIsoDate,
} from "@/lib/airsearcher/time";
import Dialog from "../common/Dialog";
import type { DayState } from "./DayCell";
import MonthGrid from "./MonthGrid";

/** No trip lengths added; one shared list, so the memos below stay put. */
const NO_NIGHTS: number[] = [];

/**
 * Changes a finished search's date range in two months side by side, like the
 * advanced search calendar but for the range only. Days the search already
 * covers are underlined. Narrowing needs no search and applies at once;
 * widening, or adding trip lengths (`extraNights`), needs the days the saved
 * flights lack, which the footer counts and times before anything is sent.
 *
 * The caller remounts it on open, so it always starts from the current range.
 */
export default function ExtendDatesModal({
  open,
  onClose,
  entry,
  have,
  initialRange,
  extraNights = NO_NIGHTS,
  onNarrow,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  entry: StoredSearch;
  /** The planned searches the saved flights cover; null while they load. */
  have: Set<string> | null;
  initialRange: { start: string; end: string };
  /** Trip lengths to add, in nights. */
  extraNights?: number[];
  /** Shows the results for a range inside what was searched; nothing is searched. */
  onNarrow: (range: { start: string; end: string }) => void;
  /** Goes to search what the saved flights lack. */
  onSearch: (range: { start: string; end: string }) => void;
}) {
  const today = isoDate(new Date());
  const [range, setRange] = useState(initialRange);
  const [monthOffset, setMonthOffset] = useState(0);

  const searchedDays = useMemo(() => new Set(candidateDates(entry.query)), [entry.query]);
  const query = useMemo(() => extendedQuery(entry.query, range, extraNights), [entry.query, range, extraNights]);
  const jobs = useMemo(() => (have ? missingJobs(query, have) : null), [query, have]);
  const newDays = candidateDates(query).filter((day) => !searchedDays.has(day)).length;
  // A fresh draw per count, like the home page's estimate.
  const estimate = useMemo(
    () => (jobs && jobs.length > 0 ? scheduleTotalMs(planSchedule(jobs.length), BROWSER_SEARCH_ESTIMATE_MS) : 0),
    [jobs],
  );

  const span = daysBetween(range.start, range.end) + 1;
  const tooLong = span > MAX_ADVANCED_RANGE_DAYS;
  const needsSearch = jobs !== null && jobs.length > 0;

  const stateOf = (iso: string): DayState => ({
    disabled: iso < today,
    inRange: iso >= range.start && iso <= range.end,
    isEndpoint: iso === range.start || iso === range.end,
    excluded: false,
    priority: 0,
    isToday: iso === today,
    searched: searchedDays.has(iso),
  });

  const base = parseIsoDate(range.start) ?? new Date();
  const monthOf = (offset: number) => {
    const date = new Date(base.getFullYear(), base.getMonth() + monthOffset + offset, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  };

  const summary =
    jobs === null
      ? "Checking which days were already searched…"
      : needsSearch
        ? `${newDays > 0 ? `${newDays} new departure day${newDays === 1 ? "" : "s"} · ` : ""}${jobs.length} new search${
            jobs.length === 1 ? "" : "es"
          } · about ${formatDuration(Math.round(estimate / 60_000))}`
        : "No search needed: every day is already covered.";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change dates"
      subtitle="Underlined days are already searched. Widen the range to search only the new days, or narrow it to show fewer results."
      width="max-w-3xl"
      footer={
        <>
          <div className="flex flex-col">
            <Text size="very small" value={summary} className={tooLong ? colorRed.text : "text-gray-500"} />
            {tooLong && (
              <Text
                size="very small"
                value={`Keep the range within ${MAX_ADVANCED_RANGE_DAYS} days`}
                className={colorRed.text}
              />
            )}
          </div>
          <Button
            styleType="primary"
            disabled={jobs === null || tooLong}
            onClick={() => {
              if (needsSearch) onSearch(range);
              else onNarrow(range);
              onClose();
            }}
          >
            {needsSearch ? "Search the new days" : "Apply"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-2">
          <Button styleType="tertiary" onClick={() => setMonthOffset((m) => m - 1)}>
            <Text icon="arrow-left" size="small" />
            <span className="sr-only">Previous month</span>
          </Button>
          <Text
            size="very small"
            value={`${formatDate(range.start)} – ${formatDate(range.end)} · ${span} day${span === 1 ? "" : "s"}${
              extraNights.length > 0 ? ` · adding ${extraNights.join(", ")} nights` : ""
            }`}
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
                  onDayClick={(iso) => setRange((current) => extendRange(current, iso))}
                  onDayEnter={() => {}}
                />
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
