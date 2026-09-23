"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { colorSecondary, grayLight, radius } from "@/config/theme";
import { describeTripLength } from "@/lib/airsearcher/queryPlan";
import { formatAge, formatDate } from "@/lib/airsearcher/time";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import { cityName } from "@/data/places";
import { destinationsOf } from "@/lib/airsearcher/types";

/**
 * What was searched, how much of it survives the filters, and — when the stored
 * results have aged past the reusable window — a standing warning that outlives
 * the toast.
 */
export default function ResultsHeader({
  entry,
  now,
  shown,
  total,
  stale,
}: {
  entry: StoredSearch;
  now: number;
  shown: number;
  total: number;
  stale: boolean;
}) {
  const { query } = entry;
  const destinations = destinationsOf(query);

  const dates =
    query.dateMode === "exact"
      ? `${formatDate(query.departureDate)}${
          query.returnDate ? ` – ${formatDate(query.returnDate)}` : ""
        }`
      : [
          `${formatDate(query.dateRange?.start ?? null)} – ${formatDate(query.dateRange?.end ?? null)}`,
          describeTripLength(query),
        ]
          .filter(Boolean)
          .join(" · ");

  const origins = query.origins
    .filter((o) => o.passengers > 0)
    .map((o) => `${o.airport} ${o.passengers}`)
    .join(" · ");

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Text
          size="big"
          value={destinations.map((place) => cityName(place.cityId)).join(" + ")}
          className="font-semibold text-gray-900"
        />
        <Text
          size="small"
          value={destinations
            .map((place) =>
              destinations.length === 1
                ? place.airports.join(", ")
                : `${cityName(place.cityId)}: ${place.airports.join(", ")}`,
            )
            .join(" · ")}
          className="text-gray-500"
        />
        <Button styleType="underline" href="/" className="ml-auto">
          <Text size="small" value="Edit search" />
        </Button>
      </div>

      <Text size="small" value={dates} className="text-gray-700" />
      <Text
        size="very small"
        value={`${origins} · ${query.tripType === "round-trip" ? "Round trip" : "One way"} · gathering at ${query.gatheringAirport}`}
        className="text-gray-500"
      />

      <Text
        size="very small"
        value={`Showing ${shown} of ${total} arrangement${total === 1 ? "" : "s"} · saved ${formatAge(entry.savedAt, now)}`}
        className="text-gray-400"
      />

      {stale && (
        <div className={`${radius} ${grayLight.bg} border ${colorSecondary.border} px-3 py-2`}>
          <Text
            size="very small"
            icon="alert"
            value="These results are more than a day old and should be recalculated with SerpApi."
            className={colorSecondary.text}
          />
        </div>
      )}
    </header>
  );
}
