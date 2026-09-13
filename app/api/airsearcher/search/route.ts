import { CURRENCY, MAX_ADVANCED_RANGE_DAYS } from "@/lib/airsearcher/config/constants";
import {
  planRequestBatches,
  planSearches,
} from "@/lib/airsearcher/queryPlan";
import { flightRecordsFromResponses } from "@/lib/airsearcher/serpApi";
import type { RoutingAllowance, SearchQuery } from "@/lib/airsearcher/types";

export const runtime = "nodejs";

const SERPAPI_URL = "https://serpapi.com/search.json";
const AIRPORT_CODE = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isQuery(value: unknown): value is SearchQuery {
  if (typeof value !== "object" || value === null) return false;
  const query = value as Partial<SearchQuery>;
  return (
    typeof query.destination === "object" &&
    query.destination !== null &&
    typeof query.destination.cityId === "string" &&
    Array.isArray(query.destination.airports) &&
    query.destination.airports.length > 0 &&
    query.destination.airports.every((code) => AIRPORT_CODE.test(code)) &&
    Array.isArray(query.origins) &&
    query.origins.length > 0 &&
    query.origins.every(
      (origin) =>
        typeof origin === "object" &&
        origin !== null &&
        AIRPORT_CODE.test(origin.airport) &&
        Number.isInteger(origin.passengers) &&
        origin.passengers >= 0,
    ) &&
    typeof query.gatheringAirport === "string" &&
    AIRPORT_CODE.test(query.gatheringAirport) &&
    (query.tripType === "one-way" || query.tripType === "round-trip") &&
    (query.dateMode === "exact" || query.dateMode === "advanced") &&
    (query.departureDate === null ||
      (typeof query.departureDate === "string" && ISO_DATE.test(query.departureDate))) &&
    (query.returnDate === null ||
      (typeof query.returnDate === "string" && ISO_DATE.test(query.returnDate))) &&
    Array.isArray(query.excludedDates) &&
    query.excludedDates.every((date) => typeof date === "string" && ISO_DATE.test(date))
  );
}

function allowanceOf(value: unknown): RoutingAllowance {
  if (typeof value !== "object" || value === null) return { direct: true, gather: true };
  const allow = value as Partial<RoutingAllowance>;
  return { direct: allow.direct !== false, gather: allow.gather !== false };
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null) return fallback;
  const error = (data as Record<string, unknown>).error;
  return typeof error === "string" ? error : fallback;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request.", requestsMade: 0 }, { status: 400 });
  }

  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  if (!isQuery(input.query)) {
    return Response.json({ error: "Invalid flight search query.", requestsMade: 0 }, { status: 400 });
  }

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "SERPAPI_API_KEY is not configured on the server.", requestsMade: 0 },
      { status: 503 },
    );
  }

  const allow = allowanceOf(input.allow);
  const plan = planSearches(input.query, allow);
  const batches = planRequestBatches(plan);
  const maximumBatches = MAX_ADVANCED_RANGE_DAYS * 2;
  if (batches.length === 0 || batches.length > maximumBatches) {
    return Response.json(
      { error: "The request count is outside the allowed search range.", requestsMade: 0 },
      { status: 400 },
    );
  }

  const responses = [];
  let requestsMade = 0;

  for (const batch of batches) {
    const params = new URLSearchParams({
      engine: "google_flights",
      type: "2",
      departure_id: batch.departureId,
      arrival_id: batch.arrivalId,
      outbound_date: batch.date,
      currency: CURRENCY,
      hl: "en",
      api_key: apiKey,
    });

    let response: Response;
    let data: unknown;
    // Count the attempt before fetch: a timeout can still have reached SerpApi
    // and consumed quota even though no response made it back to this server.
    requestsMade++;
    try {
      response = await fetch(`${SERPAPI_URL}?${params}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
      data = await response.json();
    } catch {
      return Response.json(
        { error: "SerpApi could not be reached.", requestsMade },
        { status: 502 },
      );
    }

    if (!response.ok || (typeof data === "object" && data !== null && "error" in data)) {
      return Response.json(
        { error: errorMessage(data, `SerpApi returned HTTP ${response.status}.`), requestsMade },
        { status: 502 },
      );
    }

    responses.push({ batch, data });
  }

  // Records rather than a pool: this is the raw data each request returned, and
  // the client derives the itinerary pool from it. Sending it this way is both
  // smaller on the wire and the only shape that can be stored without loss.
  return Response.json({
    records: flightRecordsFromResponses(plan, responses),
    requestCount: requestsMade,
  });
}
