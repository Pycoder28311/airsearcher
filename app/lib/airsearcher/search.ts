/**
 * Running a search end to end.
 *
 * The browser calls the server-only AirSearcher route after confirmation. That
 * route owns the SerpApi key and returns the same route-keyed itinerary pool the
 * rest of this pipeline consumes.
 */

import { DEFAULT_RANKING_CONFIG, levelToWeight } from "@/lib/airsearcher/config/ranking";
import type { RankingPreferences } from "@/lib/airsearcher/config/ranking";
import type { FilterState } from "@/lib/airsearcher/config/filters";
import { buildArrangements, scoreArrangements, sortArrangements } from "@/lib/airsearcher/grouping";
import {
  candidateDates,
  planSearches,
  returnDateFor,
  type PlannedSearch,
} from "@/lib/airsearcher/queryPlan";
import { costOf } from "@/lib/airsearcher/quota";
import { searchKeyOf } from "@/lib/airsearcher/searchKey";
import { findFreshByKey, saveSearch, type StoredSearch } from "@/lib/airsearcher/storage";
import { cityById } from "@/data/places";
import type {
  Arrangement,
  Itinerary,
  RoutingAllowance,
  SearchQuery,
} from "@/lib/airsearcher/types";

export interface SearchOutcome {
  entry: StoredSearch;
  /** True when a fresh stored result was reused and nothing was "fetched". */
  reused: boolean;
  /** How many SerpApi requests this cost. Zero when reused. */
  requestCount: number;
}

export class SearchRequestError extends Error {
  constructor(
    message: string,
    readonly requestsMade: number,
  ) {
    super(message);
    this.name = "SearchRequestError";
  }
}

/** The searches this query would need right now, after checking the cache. */
export function previewCost(query: SearchQuery, allow?: RoutingAllowance): {
  plan: PlannedSearch[];
  cost: number;
  cached: StoredSearch | null;
} {
  const cached = findFreshByKey(searchKeyOf(query));
  const plan = cached ? [] : planSearches(query, allow);
  return { plan, cost: costOf(plan), cached };
}

/** A short human label for the history card, e.g. "London · 14 Sep 2026". */
function labelFor(query: SearchQuery): string {
  const city = cityById(query.destination.cityId);
  const date =
    query.dateMode === "exact"
      ? (query.departureDate ?? "")
      : `${query.dateRange?.start ?? ""} → ${query.dateRange?.end ?? ""}`;
  return `${city?.name ?? query.destination.cityId} · ${date}`;
}

/** Weights come from the sidebar's five-level scale, via the ported arithmetic. */
export function weightsOf(filters: FilterState) {
  return {
    price: levelToWeight(filters.priceWeight),
    hour: levelToWeight(filters.hourWeight),
  };
}

/**
 * Builds every arrangement the query allows — one set per destination airport
 * per candidate departure date — then scores them all together so they can be
 * compared directly, whichever date or airport they belong to.
 */
export function buildAllArrangements(
  query: SearchQuery,
  preferences: RankingPreferences,
  pool: Record<string, Itinerary[]>,
  allow: RoutingAllowance = { direct: true, gather: true },
): Arrangement[] {
  const arrangements: Arrangement[] = [];

  for (const airport of query.destination.airports) {
    for (const departureDate of candidateDates(query)) {
      arrangements.push(
        ...buildArrangements({
          origins: query.origins,
          gatheringAirport: query.gatheringAirport,
          destination: { cityId: query.destination.cityId, airport },
          pool,
          departureDate,
          returnDate: returnDateFor(query, departureDate),
          allow,
        }),
      );
    }
  }

  return scoreArrangements(
    arrangements,
    preferences.weights,
    preferences,
    query.priorityDates,
  );
}

/**
 * Runs a search, reusing a fresh stored result when the query is identical.
 *
 * Reuse is the whole point of the freshness threshold: an unchanged search
 * within the window costs zero SerpApi requests.
 */
async function requestLivePool(
  query: SearchQuery,
  allow: RoutingAllowance,
): Promise<{ pool: Record<string, Itinerary[]>; requestCount: number }> {
  const response = await fetch("/api/airsearcher/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, allow }),
  });
  const data = (await response.json().catch(() => null)) as {
    pool?: Record<string, Itinerary[]>;
    requestCount?: number;
    requestsMade?: number;
    error?: string;
  } | null;

  if (!response.ok || !data?.pool || typeof data.requestCount !== "number") {
    throw new SearchRequestError(
      data?.error ?? "The live flight search failed.",
      typeof data?.requestsMade === "number" ? data.requestsMade : 0,
    );
  }

  return { pool: data.pool, requestCount: data.requestCount };
}

export async function runSearch(
  query: SearchQuery,
  filters: FilterState,
  preferences: RankingPreferences = DEFAULT_RANKING_CONFIG,
  allow: RoutingAllowance = { direct: true, gather: true },
): Promise<SearchOutcome> {
  const key = searchKeyOf(query);

  const cached = findFreshByKey(key);
  if (cached) return { entry: cached, reused: true, requestCount: 0 };

  const withWeights: RankingPreferences = {
    ...preferences,
    weights: weightsOf(filters),
  };

  const expectedCount = costOf(planSearches(query, allow));
  const live = await requestLivePool(query, allow);
  if (live.requestCount !== expectedCount) {
    throw new SearchRequestError(
      `The server made ${live.requestCount} requests, but ${expectedCount} were confirmed.`,
      live.requestCount,
    );
  }

  const arrangements = sortArrangements(
    buildAllArrangements(query, withWeights, live.pool, allow),
    "score",
  );

  const entry: StoredSearch = {
    id: `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    label: labelFor(query),
    key,
    query,
    arrangements,
  };

  saveSearch(entry);

  return {
    entry,
    reused: false,
    requestCount: live.requestCount,
  };
}
