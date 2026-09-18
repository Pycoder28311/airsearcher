"use client";

import Button from "@/framework/ui/buttons/Button";
import Input from "@/framework/ui/input/Input";
import Text from "@/framework/ui/iconText/Text";
import { colorRed, grayMid, radius } from "@/config/theme";
import { MAX_ADVANCED_RANGE_DAYS } from "@/lib/airsearcher/config/constants";
import {
  candidateDates,
  describeTripLength,
  flexibleTripLength,
} from "@/lib/airsearcher/queryPlan";
import { daysBetween, formatDate } from "@/lib/airsearcher/time";
import type { SearchQuery } from "@/lib/airsearcher/types";

/** Whatever is wrong with the current dates, in one sentence, or null. */
export function dateError(query: SearchQuery): string | null {
  if (query.dateMode === "exact") {
    if (!query.departureDate) return "Choose a departure date";
    if (query.tripType === "round-trip") {
      if (!query.returnDate) return "Choose a return date";
      if (daysBetween(query.departureDate, query.returnDate) < 0) {
        return "The return date is before the departure date";
      }
    }
    return null;
  }

  if (!query.dateRange?.start || !query.dateRange?.end) {
    return "Choose the window the trip can start in";
  }
  const span = daysBetween(query.dateRange.start, query.dateRange.end);
  if (span < 0) return "The date range ends before it starts";
  if (span + 1 > MAX_ADVANCED_RANGE_DAYS) {
    return `Keep the range within ${MAX_ADVANCED_RANGE_DAYS} days`;
  }
  const flexible = flexibleTripLength(query);
  if (flexible) {
    if (flexible.min < 1 || flexible.max < flexible.min) {
      return "Set the shortest and longest trip in nights";
    }
    if (candidateDates(query).length === 0) {
      return "The window is too short for the shortest trip";
    }
    return null;
  }
  if (!query.tripDurationDays || query.tripDurationDays < 1) {
    return "Set how many nights the trip lasts";
  }
  return null;
}

/**
 * Exact dates, or a switch into the advanced range search.
 *
 * The advanced summary is rendered from the query itself, so it is already
 * correct the moment the calendar modal starts writing to it.
 */
export default function DateField({
  query,
  onChange,
  onOpenCalendar,
}: {
  query: SearchQuery;
  onChange: (next: Partial<SearchQuery>) => void;
  onOpenCalendar: () => void;
}) {
  const error = dateError(query);
  const advanced = query.dateMode === "advanced";

  const summary = advanced
    ? [
        query.dateRange
          ? `${formatDate(query.dateRange.start)} – ${formatDate(query.dateRange.end)}`
          : "No range chosen",
        describeTripLength(query),
        query.excludedDates.length > 0 ? `${query.excludedDates.length} excluded` : null,
        Object.keys(query.priorityDates).length > 0
          ? `${Object.keys(query.priorityDates).length} prioritised`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className={`flex flex-col gap-2 ${radius} border ${error ? colorRed.border : grayMid.border} p-3`}>
      <div className="flex items-center justify-between gap-2">
        <Text size="very small" value="Dates" className="text-gray-500" />
        <Button
          styleType="underline"
          onClick={() => onChange({ dateMode: advanced ? "exact" : "advanced" })}
        >
          <Text size="very small" value={advanced ? "Use exact dates" : "Advanced search"} />
        </Button>
      </div>

      {advanced ? (
        <Button styleType="tertiary" onClick={onOpenCalendar} className="w-full justify-start!">
          <Text
            icon="calendar"
            size="small"
            value={summary || "Configure the date search"}
            className="text-gray-900"
          />
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex flex-col gap-0.5">
            <Text size="very small" value="Departure" className="text-gray-500" />
            <Input
              type="date"
              styleType={error ? "error" : "outlined"}
              value={query.departureDate ?? ""}
              onChange={(event) => onChange({ departureDate: event.target.value || null })}
            />
          </label>

          {query.tripType === "round-trip" && (
            <label className="flex flex-col gap-0.5">
              <Text size="very small" value="Return" className="text-gray-500" />
              <Input
                type="date"
                styleType={error ? "error" : "outlined"}
                value={query.returnDate ?? ""}
                min={query.departureDate ?? undefined}
                onChange={(event) => onChange({ returnDate: event.target.value || null })}
              />
            </label>
          )}
        </div>
      )}

      {error && <Text size="very small" value={error} className={colorRed.text} />}
    </div>
  );
}
