"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { colorSecondary, grayLight, radius } from "@/config/theme";
import { describeTripLength } from "@/lib/airsearcher/queryPlan";
import { formatAge, formatDate } from "@/lib/airsearcher/time";
import { staleReason, type StoredSearch } from "@/lib/airsearcher/storage";
import { cityName } from "@/data/places";
import { mergedDestinations } from "@/lib/airsearcher/types";

/**
 * What was searched, how much of it survives the filters, and — when the stored
 * results have aged past the reusable window — a standing warning that outlives
 * the toast.
 */
export default function ResultsHeader({
  entry,
  now,
  stale,
  onEditDates,
}: {
  entry: StoredSearch;
  now: number;
  stale: boolean;
  /** Opens the "change dates" calendar; absent where the search can't be extended. */
  onEditDates?: () => void;
}) {
  const { query } = entry;
  const destinations = mergedDestinations(query);

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
        {/* Opens the date calendar where the search can be extended; otherwise the home page. */}
        {onEditDates ? (
          <Button styleType="underline" onClick={onEditDates} className="ml-auto">
            <Text size="small" value="Edit search" />
          </Button>
        ) : (
          <Button styleType="underline" href="/" className="ml-auto">
            <Text size="small" value="Edit search" />
          </Button>
        )}
      </div>

      {/* Under the city: where it lands and when, then who flies and how old the prices are. */}
      <div className="-mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Text
          size="small"
          value={`Airports: ${destinations
            .map((place) =>
              destinations.length === 1
                ? place.airports.join(", ")
                : `${place.airports.join(", ")} (${cityName(place.cityId)})`,
            )
            .join(" · ")}`}
          className="text-gray-500"
        />
        <Text size="small" value="·" className="text-gray-300" />
        <Text size="small" value={dates} className="text-gray-700" />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Text
          size="very small"
          value={`${origins} · ${query.tripType === "round-trip" ? "Round trip" : "One way"} · gathering at ${query.gatheringAirport}`}
          className="text-gray-500"
        />
        <Text size="very small" value="·" className="text-gray-300" />
        <Text size="very small" value={`Saved ${formatAge(entry.savedAt, now)}`} className="text-gray-400" />
      </div>

      {stale && (
        <div className={`${radius} ${grayLight.bg} border ${colorSecondary.border} px-3 py-2`}>
          <Text
            size="very small"
            icon="alert"
            value={`These prices are ${staleReason(entry, now)}. Run the search again for current prices.`}
            className={colorSecondary.text}
          />
        </div>
      )}
    </header>
  );
}
