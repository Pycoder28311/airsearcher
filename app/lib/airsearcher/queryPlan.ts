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

import { MAX_AIRPORTS_PER_REQUEST } from "@/lib/airsearcher/config/constants";
import { addDays, eachDayInRange } from "@/lib/airsearcher/time";
import { destinationAirports } from "@/lib/airsearcher/types";
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

/**
 * The open trip length of an advanced round trip, or null when the length is
 * fixed (or the question does not apply).
 */
export function flexibleTripLength(query: SearchQuery): { min: number; max: number } | null {
  if (query.dateMode !== "advanced" || query.tripType !== "round-trip") return null;
  return query.tripLengthRange ?? null;
}

/**
 * The several fixed lengths of an advanced round trip that was extended with
 * more of them, shortest first; null when it has one length or an open one.
 */
export function tripLengthList(query: SearchQuery): number[] | null {
  if (query.dateMode !== "advanced" || query.tripType !== "round-trip") return null;
  if (flexibleTripLength(query)) return null;
  const lengths = query.tripLengths?.filter((n) => Number.isInteger(n) && n > 0) ?? [];
  return lengths.length > 0 ? [...new Set(lengths)].sort((a, b) => a - b) : null;
}

/** "7 nights", "3–7 nights", "5, 7, 10 nights", or null when there is no length to show. */
export function describeTripLength(query: SearchQuery): string | null {
  const flexible = flexibleTripLength(query);
  if (flexible) return `${flexible.min}–${flexible.max} nights`;
  const list = tripLengthList(query);
  if (list) return `${list.join(", ")} night${list.length === 1 && list[0] === 1 ? "" : "s"}`;
  return query.tripDurationDays ? `${query.tripDurationDays} nights` : null;
}

/**
 * Every date a trip of open length may come back on: within the length range,
 * inside the date window, and never on an excluded date.
 */
function flexibleReturnDates(query: SearchQuery, departureDate: string): string[] {
  const flexible = flexibleTripLength(query);
  if (!flexible || !query.dateRange) return [];
  const excluded = new Set(query.excludedDates);
  const dates: string[] = [];
  for (let nights = flexible.min; nights <= flexible.max; nights++) {
    const date = addDays(departureDate, nights);
    if (date > query.dateRange.end) break;
    if (!excluded.has(date)) dates.push(date);
  }
  return dates;
}

/**
 * Every departure date the query is asking about. With an open trip length the
 * whole trip must fit in the window, so a date too late to come back from in
 * time is not a candidate.
 */
export function candidateDates(query: SearchQuery): string[] {
  if (query.dateMode === "exact") {
    return query.departureDate ? [query.departureDate] : [];
  }

  if (!query.dateRange) return [];
  const excluded = new Set(query.excludedDates);
  const flexible = flexibleTripLength(query) !== null;
  return eachDayInRange(query.dateRange.start, query.dateRange.end).filter(
    (date) =>
      !excluded.has(date) && (!flexible || flexibleReturnDates(query, date).length > 0),
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
 * Every return date worth pairing with a departure date: one for a fixed
 * length, several for an open one, and `[null]` for a one-way trip.
 *
 * An open length never costs extra requests: every return date lies inside the
 * window, and route data is deduplicated per date, so each day is searched at
 * most once in each direction however many trip lengths share it.
 */
export function returnDatesFor(query: SearchQuery, departureDate: string): (string | null)[] {
  if (flexibleTripLength(query)) return flexibleReturnDates(query, departureDate);
  const list = tripLengthList(query);
  if (list) return list.map((nights) => addDays(departureDate, nights));
  return [returnDateFor(query, departureDate)];
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

  // Several destinations share these searches: the airports simply join the
  // same lists, so comparing three cities costs what one city costs, as long
  // as they still fit in one request (see `planRequestBatches`).
  for (const destination of destinationAirports(query)) {
    for (const departureDate of candidateDates(query)) {
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
        }

        if (allow.direct) {
          push({
            from: origin.airport,
            to: destination,
            date: departureDate,
            direction: "outbound",
            reason: "direct",
          });
        }
      }

      for (const returning of returnDatesFor(query, departureDate)) {
        if (!returning) continue;

        if (someoneGathers || hubInGroup) {
          push({
            from: destination,
            to: hub,
            date: returning,
            direction: "return",
            reason: "main",
          });
        }

        for (const origin of travelling) {
          if (allow.gather) {
            push({
              from: hub,
              to: origin.airport,
              date: returning,
              direction: "return",
              reason: "feeder",
            });
          }

          if (allow.direct) {
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
 *
 * At most MAX_AIRPORTS_PER_REQUEST airports fit on each side of a request, so
 * enough destinations to overflow that split the date into several requests —
 * the only way adding a destination ever costs more. The split is by whole
 * airports, so every route the plan needs is still covered exactly once.
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
    .flatMap(({ direction, date, departures, arrivals }) =>
      chunk([...departures].sort()).flatMap((departureIds) =>
        chunk([...arrivals].sort()).map((arrivalIds) => ({
          direction,
          departureId: departureIds.join(","),
          arrivalId: arrivalIds.join(","),
          date,
        })),
      ),
    );
}

/** Airports split into groups of at most MAX_AIRPORTS_PER_REQUEST. */
function chunk(codes: AirportCode[]): AirportCode[][] {
  if (codes.length <= MAX_AIRPORTS_PER_REQUEST) return [codes];
  const chunks: AirportCode[][] = [];
  for (let i = 0; i < codes.length; i += MAX_AIRPORTS_PER_REQUEST) {
    chunks.push(codes.slice(i, i + MAX_AIRPORTS_PER_REQUEST));
  }
  return chunks;
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
