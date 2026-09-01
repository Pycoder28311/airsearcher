/**
 * The canonical identity of a search.
 *
 * Two queries that would produce the same flights must produce the same key,
 * whatever order their fields happen to be in — that is what lets a repeat
 * search reuse stored results instead of spending SerpApi requests.
 *
 * Passenger counts are part of the key: they do not change which flights exist,
 * but they do change the group totals and therefore the ranking, so a stored
 * result computed for a different headcount is not reusable.
 */

import type { SearchQuery } from "@/lib/airsearcher/types";

function sorted(values: readonly string[]): string[] {
  return [...values].map((v) => v.trim().toUpperCase()).sort();
}

export function searchKeyOf(query: SearchQuery): string {
  const origins = [...query.origins]
    .filter((o) => o.passengers > 0)
    .map((o) => `${o.airport.trim().toUpperCase()}:${o.passengers}`)
    .sort()
    .join(",");

  const destinations = sorted(query.destination.airports).join(",");

  const dates =
    query.dateMode === "exact"
      ? `exact:${query.departureDate ?? ""}:${query.returnDate ?? ""}`
      : [
          "advanced",
          query.dateRange?.start ?? "",
          query.dateRange?.end ?? "",
          query.tripDurationDays ?? "",
          sorted(query.excludedDates).join("|"),
        ].join(":");

  return [
    `city=${query.destination.cityId}`,
    `dest=${destinations}`,
    `from=${origins}`,
    `hub=${query.gatheringAirport.trim().toUpperCase()}`,
    `trip=${query.tripType}`,
    `dates=${dates}`,
  ].join(";");
}
