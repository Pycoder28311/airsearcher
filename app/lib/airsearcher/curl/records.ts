/**
 * Files the flights from the cURL runs under the routes the search needs.
 *
 * Every flight is attributed by its own first departure airport, last arrival
 * airport and departure date — the same rule `flightRecordsFromResponses` uses
 * for SerpApi. That matters because a Google search is often city to city
 * ("Athens → London"), so one cURL can fill several routes (ATH→LHR, ATH→LGW,
 * …) at once. Direction and reason come from the planned route, never from the
 * cURL, so the pipeline downstream cannot tell these records from SerpApi's.
 */

import { uniqueFlights } from "@/lib/airsearcher/grouping";
import { planSearches, searchId, type PlannedSearch } from "@/lib/airsearcher/queryPlan";
import type { FlightRecord, NormalizedFlight, SearchQuery } from "@/lib/airsearcher/types";

function routeKey(from: string, to: string, date: string): string {
  return `${from}-${to}-${date}`;
}

function routeOf(flight: NormalizedFlight): { from: string; to: string; date: string } | null {
  const segments = flight.outbound.segments;
  const from = segments[0]?.departure.airport;
  const to = segments[segments.length - 1]?.arrival.airport;
  const date = segments[0]?.departure.time?.slice(0, 10);
  return from && to && date ? { from, to, date } : null;
}

export interface CurlRecords {
  records: FlightRecord[];
  /** Flights that belong to no route of this search, grouped by route. */
  ignored: { route: string; flights: number }[];
}

export function recordsFromCurlFlights(
  query: SearchQuery,
  flights: NormalizedFlight[],
): CurlRecords {
  const plan = planSearches(query);
  const byRoute = new Map<string, PlannedSearch>();
  for (const search of plan) byRoute.set(routeKey(search.from, search.to, search.date), search);

  const matched = new Map<string, NormalizedFlight[]>();
  const ignored = new Map<string, number>();

  for (const flight of flights) {
    const route = routeOf(flight);
    const planned = route ? byRoute.get(routeKey(route.from, route.to, route.date)) : undefined;
    if (!planned) {
      const label = route ? `${route.from}→${route.to} ${route.date}` : "unknown route";
      ignored.set(label, (ignored.get(label) ?? 0) + 1);
      continue;
    }
    const id = searchId(planned);
    matched.set(id, [...(matched.get(id) ?? []), flight]);
  }

  return {
    records: plan.map((search) => ({
      id: searchId(search),
      from: search.from,
      to: search.to,
      date: search.date,
      direction: search.direction,
      reason: search.reason,
      // Several cURLs can return the same flight; keep one, the cheapest.
      flights: uniqueFlights(matched.get(searchId(search)) ?? []),
    })),
    ignored: [...ignored.entries()].map(([route, count]) => ({ route, flights: count })),
  };
}
