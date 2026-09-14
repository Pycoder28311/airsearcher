import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { poolKey, uniqueFlights, type FlightPool } from "@/lib/airsearcher/grouping";
import {
  searchId,
  type PlannedRequestBatch,
  type PlannedSearch,
} from "@/lib/airsearcher/queryPlan";
import type {
  AirportCode,
  FlightRecord,
  NormalizedEndpoint,
  NormalizedFlight,
  NormalizedLayover,
  NormalizedLeg,
  NormalizedSegment,
} from "@/lib/airsearcher/types";

type JsonObject = Record<string, unknown>;

export interface SerpApiBatchResponse {
  batch: PlannedRequestBatch;
  data: unknown;
}

function objectOf(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function endpointOf(value: unknown): NormalizedEndpoint {
  const endpoint = objectOf(value);
  return {
    airport: stringOf(endpoint?.id) as AirportCode | null,
    airportName: stringOf(endpoint?.name),
    time: stringOf(endpoint?.time),
  };
}

function segmentOf(value: unknown): NormalizedSegment | null {
  const segment = objectOf(value);
  if (!segment) return null;

  const departure = endpointOf(segment.departure_airport);
  const arrival = endpointOf(segment.arrival_airport);
  if (!departure.airport || !arrival.airport) return null;

  return {
    flightNumber: stringOf(segment.flight_number),
    airline: stringOf(segment.airline),
    airlineLogo: stringOf(segment.airline_logo),
    airplane: stringOf(segment.airplane),
    travelClass: stringOf(segment.travel_class),
    departure,
    arrival,
    durationMinutes: numberOf(segment.duration),
  };
}

function layoverOf(value: unknown): NormalizedLayover | null {
  const layover = objectOf(value);
  if (!layover) return null;
  return {
    airport: stringOf(layover.id) as AirportCode | null,
    airportName: stringOf(layover.name),
    durationMinutes: numberOf(layover.duration),
    overnight: layover.overnight === true,
  };
}

function flightOf(
  value: unknown,
  category: NormalizedFlight["category"],
  index: number,
): NormalizedFlight | null {
  const option = objectOf(value);
  if (!option || !Array.isArray(option.flights)) return null;

  const segments = option.flights
    .map(segmentOf)
    .filter((segment): segment is NormalizedSegment => segment !== null);
  if (segments.length === 0) return null;

  const layovers = Array.isArray(option.layovers)
    ? option.layovers
        .map(layoverOf)
        .filter((layover): layover is NormalizedLayover => layover !== null)
    : [];
  const airlines = [...new Set(segments.map((segment) => segment.airline).filter(Boolean))];
  const carbon = objectOf(option.carbon_emissions);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const identity = segments
    .map((segment) => segment.flightNumber ?? `${segment.departure.airport}-${segment.arrival.airport}`)
    .join("+");

  const outbound: NormalizedLeg = {
    segments,
    layovers,
    stops: Math.max(0, segments.length - 1),
    totalDurationMinutes: numberOf(option.total_duration),
  };

  return {
    id: `${first.departure.airport}-${last.arrival.airport}-${first.departure.time ?? "unknown"}-${identity}-${category}-${index}`,
    category,
    price: numberOf(option.price),
    currency: CURRENCY,
    airline: {
      name: airlines.length === 1 ? airlines[0] : airlines.length > 1 ? "Multiple airlines" : null,
      logo: stringOf(option.airline_logo) ?? first.airlineLogo,
    },
    outbound,
    return: null,
    carbonEmissionsGrams: numberOf(carbon?.this_flight),
    carbonDifferencePercent: numberOf(carbon?.difference_percent),
    travelClass: first.travelClass,
  };
}

/** Normalizes one Google Flights response without trusting its JSON shape. */
export function normalizeSerpApiResponse(data: unknown): NormalizedFlight[] {
  const response = objectOf(data);
  if (!response) return [];

  const normalized: NormalizedFlight[] = [];
  const sections: Array<["best" | "other", unknown]> = [
    ["best", response.best_flights],
    ["other", response.other_flights],
  ];

  for (const [category, section] of sections) {
    if (!Array.isArray(section)) continue;
    section.forEach((value, index) => {
      const flight = flightOf(value, category, index);
      if (flight) normalized.push(flight);
    });
  }

  return normalized;
}

/**
 * Splits the merged batch responses back into one record per planned route.
 *
 * A single request can carry several routes at once (the comma-separated
 * `departure_id` / `arrival_id` batching), so every flight is attributed to a
 * route by its own first departure and last arrival airport. Anything that
 * matches no planned route is dropped rather than guessed at.
 *
 * This is the raw data, exactly as it arrived: no pairing, no filtering, no
 * ranking. Everything downstream is derived from it.
 */
export function flightRecordsFromResponses(
  plan: PlannedSearch[],
  responses: SerpApiBatchResponse[],
): FlightRecord[] {
  const flightsBySearch = new Map<string, NormalizedFlight[]>();

  for (const { batch, data } of responses) {
    const routes = plan.filter(
      (search) => search.direction === batch.direction && search.date === batch.date,
    );

    for (const flight of normalizeSerpApiResponse(data)) {
      const segments = flight.outbound.segments;
      const from = segments[0]?.departure.airport;
      const to = segments[segments.length - 1]?.arrival.airport;
      if (!from || !to) continue;

      const route = routes.find((search) => search.from === from && search.to === to);
      if (!route) continue;

      const id = searchId(route);
      flightsBySearch.set(id, [...(flightsBySearch.get(id) ?? []), flight]);
    }
  }

  return plan.map((search) => ({
    id: searchId(search),
    from: search.from,
    to: search.to,
    date: search.date,
    direction: search.direction,
    reason: search.reason,
    // The same flight can come back more than once; keep one, the cheapest.
    flights: uniqueFlights(flightsBySearch.get(searchId(search)) ?? []),
  }));
}

/**
 * Rebuilds the route-keyed flight pool from stored records.
 *
 * Every record keeps its own route and date, so a return is only ever matched
 * to flights from its own return date. The pool never has to be stored — it is
 * regenerated from the records whenever it is needed.
 */
export function poolFromRecords(records: FlightRecord[]): FlightPool {
  const pool: FlightPool = {};

  for (const record of records) {
    const key = poolKey(record.from, record.to, record.date);
    pool[key] = [...(pool[key] ?? []), ...record.flights];
  }

  // Records saved earlier can still hold duplicates, so they are removed here too.
  for (const key of Object.keys(pool)) pool[key] = uniqueFlights(pool[key]);
  return pool;
}

/** Builds the route-keyed flight pool straight from the API batches. */
export function livePoolFromResponses(
  plan: PlannedSearch[],
  responses: SerpApiBatchResponse[],
): FlightPool {
  return poolFromRecords(flightRecordsFromResponses(plan, responses));
}
