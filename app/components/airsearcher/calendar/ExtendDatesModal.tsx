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
  formatDuration,
  isoDate,
  type DraftRange,
  type RangeField,
} from "@/lib/airsearcher/time";
import Dialog from "../common/Dialog";
import RangePicker from "./RangePicker";

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
  const [draftRange, setDraftRange] = useState<DraftRange>(initialRange);
  const [active, setActive] = useState<RangeField>("start");
  /** The range being shown: while its end is still to be chosen, the start day alone. */
  const range = useMemo(
    () => ({
      start: draftRange.start ?? initialRange.start,
      end: draftRange.end ?? draftRange.start ?? initialRange.end,
    }),
    [draftRange, initialRange],
  );
  const complete = draftRange.start !== null && draftRange.end !== null;

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
            disabled={jobs === null || tooLong || !complete}
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
        <RangePicker
          range={draftRange}
          onRangeChange={setDraftRange}
          active={active}
          onActiveChange={setActive}
          labels={{ start: "First departure day", end: "Last departure day" }}
          today={today}
          extraState={(iso) => ({ searched: searchedDays.has(iso) })}
          onReset={() => {
            setDraftRange(initialRange);
            setActive("start");
          }}
        />
        {extraNights.length > 0 && (
          <Text size="very small" value={`Adding ${extraNights.join(", ")} nights`} className="text-gray-600" />
        )}
      </div>
    </Dialog>
  );
}
