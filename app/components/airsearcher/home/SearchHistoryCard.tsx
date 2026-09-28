"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import {
  border,
  colorSecondary,
  grayLight,
  radiusBig,
  shadow,
} from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { describeTripLength } from "@/lib/airsearcher/queryPlan";
import { daysBetween, formatAge, formatDate } from "@/lib/airsearcher/time";
import { isStale, type StoredSearch } from "@/lib/airsearcher/storage";
import { cityName } from "@/data/places";
import { mergedDestinations, type SearchQuery } from "@/lib/airsearcher/types";
import { useState } from "react";
import FlightDataDialog from "./FlightDataDialog";

/** "7 nights" or "3–7 nights" for a round trip; null for one-way. */
function tripLengthOf(query: SearchQuery): string | null {
  if (query.tripType !== "round-trip") return null;
  if (query.dateMode === "exact") {
    if (!query.departureDate || !query.returnDate) return null;
    const nights = daysBetween(query.departureDate, query.returnDate);
    return nights >= 0 ? `${nights} night${nights === 1 ? "" : "s"}` : null;
  }
  return describeTripLength(query);
}

/**
 * One past search, matching the Penpot history card: destination, dates, the
 * filters that were applied, the result count, and an "outdated" flag when the
 * results are older than the reusable window.
 */
export default function SearchHistoryCard({
  entry,
  now,
  onOpen,
  onRemove,
}: {
  entry: StoredSearch;
  /** Passed in so every card ages against the same instant. */
  now: number;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [dataOpen, setDataOpen] = useState(false);

  const stale = isStale(entry, now);
  const destinations = mergedDestinations(entry.query)
    .map((place) => cityName(place.cityId))
    .join(" + ");

  const curlOnly = entry.kind === "google-curl";
  const arrangements = curlOnly ? (entry.googleCurl?.arrangements ?? []) : entry.arrangements;
  const gathered = ((curlOnly ? entry.googleCurl?.records : entry.records) ?? []).reduce(
    (sum, record) => sum + record.flights.length,
    0,
  );

  const dates =
    entry.query.dateMode === "exact"
      ? `${formatDate(entry.query.departureDate)}${
          entry.query.returnDate ? ` – ${formatDate(entry.query.returnDate)}` : ""
        }`
      : `${formatDate(entry.query.dateRange?.start ?? null)} – ${formatDate(
          entry.query.dateRange?.end ?? null,
        )}`;

  const origins = entry.query.origins
    .filter((o) => o.passengers > 0)
    .map((o) => o.airport)
    .join(" · ");
  const tripLength = tripLengthOf(entry.query);
  const age = formatAge(entry.savedAt, now);

  const cheapest =
    arrangements.length > 0
      ? Math.min(...arrangements.map((a) => a.totals.totalPrice))
      : null;

  return (
    <article
      className={`flex flex-col gap-2 bg-white ${border} ${radiusBig} ${shadow} p-4 ${grayLight.bgHover}`}
    >
      {/* Destination and how long ago on the left, delete on the right. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <Text size="big" value={destinations} className="font-semibold text-gray-900" />
          <Text
            size="very small"
            value={stale ? `Outdated · ${age}` : age}
            className={stale ? colorSecondary.text : "text-gray-400"}
          />
        </div>
        <Button
          styleType="delete"
          onClick={() => onRemove(entry.id)}
          className="h-8 w-8 shrink-0 p-0!"
        >
          <Text icon="trash" size="very small" />
          <span className="sr-only">Delete this search</span>
        </Button>
      </div>

      <Text size="medium" value={dates} className="text-gray-800" />
      {tripLength && <Text size="small" value={tripLength} className="text-gray-600" />}

      <Text
        size="very small"
        value={origins || "No departures set"}
        className={colorSecondary.text}
      />
      <Text
        size="very small"
        value={`${arrangements.length} result${arrangements.length === 1 ? "" : "s"}${
          cheapest !== null ? ` · from ${cheapest} ${CURRENCY}` : ""
        }`}
        className="text-gray-500"
      />

      {/* See data only when there is raw data; See more always bottom right. */}
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
        {gathered > 0 && (
          <Button styleType="tertiary" onClick={() => setDataOpen(true)} className="mr-auto">
            <Text size="very small" value={`See data · ${gathered}`} />
          </Button>
        )}
        <Button styleType="underline" onClick={() => onOpen(entry.id)}>
          <Text size="small" value="See more" icon="chevron-right" iconPosition="right" />
        </Button>
      </div>

      <FlightDataDialog
        // Remounting on open keeps the dialog's scroll position from leaking
        // between the cards that share this component.
        key={dataOpen ? "data-open" : "data-closed"}
        entry={entry}
        open={dataOpen}
        onClose={() => setDataOpen(false)}
      />
    </article>
  );
}
