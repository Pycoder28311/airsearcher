"use client";

import Button from "@/framework/ui/buttons/Button";
import Input from "@/framework/ui/input/Input";
import Text from "@/framework/ui/iconText/Text";
import { colorRed } from "@/config/theme";
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

  // Boxes dressed like the destination search box: its border, shadow, height
  // and corners, written out with `!` (Tailwind can't see one appended to a
  // token). Side by side they share one border, with no gap between them.
  const box = `relative flex h-14 min-w-0 flex-1 flex-col justify-center bg-white px-4 shadow-md border ${
    error ? colorRed.border : "border-gray-300"
  } focus-within:z-10 focus-within:border-blue-500`;

  return (
    <div className="flex flex-col">
      {advanced ? (
        <Button
          styleType="tertiary"
          onClick={onOpenCalendar}
          className={`${box} items-start! rounded-2xl! bg-white! hover:border-gray-400`}
        >
          <Text size="very small" value="Date range" className="text-gray-500" />
          <Text
            size="small"
            value={summary || "Configure the date search"}
            className="w-full truncate font-medium text-gray-900"
          />
        </Button>
      ) : (
        <div className="flex">
          <label className={`${box} ${query.tripType === "round-trip" ? "rounded-l-2xl" : "rounded-2xl"}`}>
            <Text size="very small" value="Departure" className="text-gray-500" />
            <Input
              type="date"
              styleType="ghost"
              value={query.departureDate ?? ""}
              onChange={(event) => onChange({ departureDate: event.target.value || null })}
              className="h-6 border-0! bg-transparent! p-0! font-medium hover:bg-transparent!"
            />
          </label>

          {query.tripType === "round-trip" && (
            <label className={`${box} -ml-px rounded-r-2xl`}>
              <Text size="very small" value="Return" className="text-gray-500" />
              <Input
                type="date"
                styleType="ghost"
                value={query.returnDate ?? ""}
                min={query.departureDate ?? undefined}
                onChange={(event) => onChange({ returnDate: event.target.value || null })}
                className="h-6 border-0! bg-transparent! p-0! font-medium hover:bg-transparent!"
              />
            </label>
          )}
        </div>
      )}

      {/* A tab hanging from the boxes' bottom edge, as wide as their straight part (inset by their 16px corners): gray, rounded below, no gap above. */}
      <Button
        styleType="tertiary"
        onClick={() => {
          onChange({ dateMode: advanced ? "exact" : "advanced" });
          // Switching to a range opens its calendar straight away.
          if (!advanced) onOpenCalendar();
        }}
        className="-mt-px mx-4 rounded-t-none! rounded-b-xl! border border-t-0 border-gray-300 bg-gray-200! px-6! py-1! hover:bg-gray-300!"
      >
        <Text size="very small" value={advanced ? "Select exact dates" : "Select date range"} className="text-gray-700" />
      </Button>

      {error && <Text size="very small" value={error} className={`px-1 ${colorRed.text}`} />}
    </div>
  );
}
