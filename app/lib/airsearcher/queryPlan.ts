/**
 * Working out the route data a query needs.
 *
 * Nothing here touches the network. The plan lists the individual route legs
 * needed by the mock/result pool. `quota.ts` groups those legs into billable
 * requests: one combined airport request per candidate date and direction.
 *
 * Route data is deduplicated on (from, to, date, direction):
 *
 *   1. Feeder legs are shared across destinations. SKG->ATH on a given date is
 *      one search however many destinations are being compared.
 *   2. The main leg is shared across every gathering origin. Everyone who
 *      gathers flies the same ATH->DEST flight — one search, not one per origin.
 *   3. Comparing "direct" against "gather" costs nothing beyond the direct
 *      searches themselves; both arrangements come out of the same pool.
 */

import { addDays, eachDayInRange } from "@/lib/airsearcher/time";
import type {
  AirportCode,
  RoutingAllowance,
  SearchQuery,
} from "@/lib/airsearcher/types";

/** Why a search is in the plan — shown in the cost breakdown. */
export type { SearchReason } from "@/lib/airsearcher/types";
import type { SearchReason } from "@/lib/airsearcher/types";

export interface PlannedSearch {
  from: AirportCode;
  to: AirportCode;
  date: string;
  direction: "outbound" | "return";
  reason: SearchReason;
}

/**
 * One billable SerpApi request. All departure airports needed for the date are
 * sent together through the API's comma-separated `departure_id` parameter.
 */
export interface PlannedRequestBatch {
  direction: "outbound" | "return";
  departureId: string;
  arrivalId: string;
  date: string;
}

export function searchId(search: PlannedSearch): string {
  return `${search.from}-${search.to}-${search.date}-${search.direction}`;
}

/** Every departure date the query is asking about. */
export function candidateDates(query: SearchQuery): string[] {
  if (query.dateMode === "exact") {
    return query.departureDate ? [query.departureDate] : [];
  }

  if (!query.dateRange) return [];
  const excluded = new Set(query.excludedDates);
  return eachDayInRange(query.dateRange.start, query.dateRange.end).filter(
    (date) => !excluded.has(date),
  );
}

/** The return date paired with a given departure date, or null for one-way. */
export function returnDateFor(query: SearchQuery, departureDate: string): string | null {
  if (query.tripType === "one-way") return null;
  if (query.dateMode === "exact") return query.returnDate;
  if (query.tripDurationDays === null) return null;
  return addDays(departureDate, query.tripDurationDays);
}

/**
 * The deduplicated set of searches needed to evaluate every arrangement the
 * query allows, across every candidate date.
 *
 * An excluded date never reaches here — `candidateDates` drops it — so an
 * exclusion genuinely removes searches rather than merely hiding results.
 */
export function planSearches(
  query: SearchQuery,
  allow: RoutingAllowance = { direct: true, gather: true },
): PlannedSearch[] {
  const seen = new Set<string>();
  const plan: PlannedSearch[] = [];

  const push = (search: PlannedSearch) => {
    const id = searchId(search);
    if (seen.has(id)) return;
    seen.add(id);
    plan.push(search);
  };

  const hub = query.gatheringAirport;
  const active = query.origins.filter((o) => o.passengers > 0);
  const travelling = active.filter((o) => o.airport !== hub);
  const someoneGathers = allow.gather && travelling.length > 0;
  const hubInGroup = active.some((o) => o.airport === hub);

  for (const destination of query.destination.airports) {
    for (const departureDate of candidateDates(query)) {
      const returning = returnDateFor(query, departureDate);

      // The main leg out of the hub: needed whenever anyone gathers there, and
      // whenever the hub is itself one of the origins.
      if (someoneGathers || hubInGroup) {
        push({
          from: hub,
          to: destination,
          date: departureDate,
          direction: "outbound",
          reason: "main",
        });
        if (returning) {
          push({
            from: destination,
            to: hub,
            date: returning,
            direction: "return",
            reason: "main",
          });
        }
      }

      for (const origin of travelling) {
        if (allow.gather) {
          push({
            from: origin.airport,
            to: hub,
            date: departureDate,
            direction: "outbound",
            reason: "feeder",
          });
          if (returning) {
            push({
              from: hub,
              to: origin.airport,
              date: returning,
              direction: "return",
              reason: "feeder",
            });
          }
        }

        if (allow.direct) {
          push({
            from: origin.airport,
            to: destination,
            date: departureDate,
            direction: "outbound",
            reason: "direct",
          });
          if (returning) {
            push({
              from: destination,
              to: origin.airport,
              date: returning,
              direction: "return",
              reason: "direct",
            });
          }
        }
      }
    }
  }

  return plan;
}

/**
 * Batches route requirements into the SerpApi calls the live integration will
 * make. Google Flights accepts several departure airports in one
 * comma-separated `departure_id` and `arrival_id`. Each candidate date costs
 * one outbound request and, for round trips, one return request.
 */
export function planRequestBatches(plan: PlannedSearch[]): PlannedRequestBatch[] {
  const groups = new Map<
    string,
    {
      direction: PlannedSearch["direction"];
      date: string;
      departures: Set<AirportCode>;
      arrivals: Set<AirportCode>;
    }
  >();

  for (const search of plan) {
    const key = `${search.direction}-${search.date}`;
    const group = groups.get(key) ?? {
      direction: search.direction,
      date: search.date,
      departures: new Set<AirportCode>(),
      arrivals: new Set<AirportCode>(),
    };
    group.departures.add(search.from);
    group.arrivals.add(search.to);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.direction.localeCompare(b.direction))
    .map(({ direction, date, departures, arrivals }) => ({
      direction,
      departureId: [...departures].sort().join(","),
      arrivalId: [...arrivals].sort().join(","),
      date,
    }));
}

/**
 * Splits a plan into what a cached result already covers and what still has to
 * be fetched. `have` is the set of search ids a fresh cache entry holds.
 */
export function coveredByCache(
  plan: PlannedSearch[],
  have: Set<string>,
): { needed: PlannedSearch[]; reused: PlannedSearch[] } {
  const needed: PlannedSearch[] = [];
  const reused: PlannedSearch[] = [];
  for (const search of plan) {
    if (have.has(searchId(search))) reused.push(search);
    else needed.push(search);
  }
  return { needed, reused };
}
