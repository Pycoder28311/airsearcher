import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { planSearches, searchId } from "@/lib/airsearcher/queryPlan";
import {
  TRAVELPAYOUTS_URL,
  normalizeTravelpayoutsResponse,
} from "@/lib/airsearcher/travelpayouts";
import type {
  FlightRecord,
  NormalizedFlight,
  RoutingAllowance,
  SearchQuery,
} from "@/lib/airsearcher/types";

export const runtime = "nodejs";

const AIRPORT_CODE = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Routes fetched at once — Travelpayouts rate-limits per token. */
const CONCURRENCY = 4;

function isQuery(value: unknown): value is SearchQuery {
  if (typeof value !== "object" || value === null) return false;
  const query = value as Partial<SearchQuery>;
  return (
    typeof query.destination === "object" &&
    query.destination !== null &&
    Array.isArray(query.destination.airports) &&
    query.destination.airports.length > 0 &&
    query.destination.airports.every((code) => AIRPORT_CODE.test(code)) &&
    Array.isArray(query.origins) &&
    query.origins.length > 0 &&
    query.origins.every(
      (origin) => AIRPORT_CODE.test(origin?.airport) && Number.isInteger(origin?.passengers),
    ) &&
    typeof query.gatheringAirport === "string" &&
    AIRPORT_CODE.test(query.gatheringAirport) &&
    (query.tripType === "one-way" || query.tripType === "round-trip") &&
    (query.dateMode === "exact" || query.dateMode === "advanced") &&
    Array.isArray(query.excludedDates) &&
    query.excludedDates.every((date) => ISO_DATE.test(date))
  );
}

function allowanceOf(value: unknown): RoutingAllowance {
  if (typeof value !== "object" || value === null) return { direct: true, gather: true };
  const allow = value as Partial<RoutingAllowance>;
  return { direct: allow.direct !== false, gather: allow.gather !== false };
}

/** One Travelpayouts call: a route on one day, or across a whole month. */
interface RouteRequest {
  from: string;
  to: string;
  /** "YYYY-MM-DD" for one day, "YYYY-MM" for a month. */
  period: string;
}

/** Every option Travelpayouts has for one route and period. */
async function fetchRoute(route: RouteRequest, token: string): Promise<NormalizedFlight[]> {
  const params = new URLSearchParams({
    origin: route.from,
    destination: route.to,
    departure_at: route.period,
    one_way: "true",
    direct: "false",
    sorting: "price",
    // A month covers many days, so it needs room for all of them.
    limit: route.period.length === 7 ? "1000" : "30",
    currency: CURRENCY.toLowerCase(),
    token,
  });

  const response = await fetch(`${TRAVELPAYOUTS_URL}?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const data: unknown = await response.json();
  if (!response.ok || (data as { success?: unknown })?.success === false) {
    const error = (data as { error?: unknown })?.error;
    throw new Error(typeof error === "string" ? error : `Travelpayouts returned HTTP ${response.status}.`);
  }

  return normalizeTravelpayoutsResponse(data, route.from, route.to);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  if (!isQuery(input.query)) {
    return Response.json({ error: "Invalid flight search query." }, { status: 400 });
  }

  const token = process.env.TRAVELPAYOUT;
  if (!token) {
    return Response.json(
      { error: "TRAVELPAYOUT is not configured on the server." },
      { status: 503 },
    );
  }

  // The same routes SerpApi is asked for, so both tabs are built from the same plan.
  const plan = planSearches(input.query, allowanceOf(input.allow));

  // A date range asks for each route once per month rather than once per day,
  // which keeps a long range to a handful of calls.
  const byMonth = input.query.dateMode === "advanced";
  const requests = new Map<string, RouteRequest>();
  for (const search of plan) {
    const period = byMonth ? search.date.slice(0, 7) : search.date;
    requests.set(`${search.from}-${search.to}-${period}`, { from: search.from, to: search.to, period });
  }

  const flightsByRequest = new Map<string, NormalizedFlight[]>();
  let failures = 0;
  let firstError: string | null = null;
  const list = [...requests.entries()];
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    await Promise.all(
      list.slice(i, i + CONCURRENCY).map(async ([key, route]) => {
        try {
          flightsByRequest.set(key, await fetchRoute(route, token));
        } catch (error) {
          // One failed route leaves that route empty instead of failing everything.
          failures++;
          firstError ??= error instanceof Error ? error.message : "Travelpayouts could not be reached.";
          flightsByRequest.set(key, []);
        }
      }),
    );
  }

  if (list.length > 0 && failures === list.length) {
    return Response.json({ error: firstError }, { status: 502 });
  }

  const records: FlightRecord[] = plan.map((search) => {
    const period = byMonth ? search.date.slice(0, 7) : search.date;
    const flights = flightsByRequest.get(`${search.from}-${search.to}-${period}`) ?? [];
    return {
      id: searchId(search),
      from: search.from,
      to: search.to,
      date: search.date,
      direction: search.direction,
      reason: search.reason,
      // A month's results are split back into the days they leave on.
      flights: flights.filter((f) => f.outbound.segments[0]?.departure.time?.startsWith(search.date)),
    };
  });

  return Response.json({ records, requestCount: list.length });
}
