/**
 * Running a search end to end.
 *
 * The browser calls the server-only AirSearcher route after confirmation. That
 * route owns the SerpApi key and returns the raw flight records that the rest
 * of this pipeline builds its route-keyed flight pool from.
 */

import { DEFAULT_RANKING_CONFIG, levelToWeight } from "@/lib/airsearcher/config/ranking";
import type { RankingPreferences } from "@/lib/airsearcher/config/ranking";
import type { FilterState } from "@/lib/airsearcher/config/filters";
import {
  buildArrangements,
  scoreArrangements,
  sortArrangements,
  type FlightPool,
} from "@/lib/airsearcher/grouping";
import {
  candidateDates,
  planSearches,
  returnDatesFor,
  searchId,
  type PlannedSearch,
} from "@/lib/airsearcher/queryPlan";
import { costOf } from "@/lib/airsearcher/quota";
import { searchKeyOf } from "@/lib/airsearcher/searchKey";
import { findFreshByKey, saveSearch, type StoredSearch } from "@/lib/airsearcher/storage";
import { poolFromRecords } from "@/lib/airsearcher/serpApi";
import { poolKey } from "@/lib/airsearcher/grouping";
import { cheapestPerPair, type StoredPriceGrid } from "@/lib/airsearcher/priceGrid";
import { cityById } from "@/data/places";
import type {
  Arrangement,
  FlightRecord,
  RoutingAllowance,
  SearchQuery,
} from "@/lib/airsearcher/types";

/** Most arrangements stored for one search, so saved searches fit in browser storage. */
const MAX_ARRANGEMENTS_PER_SEARCH = 300;

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

/**
 * Whether a query is answered by SerpApi. A date range multiplies the requests
 * by every candidate date, so ranges use Travelpayouts only unless SerpApi is
 * asked for as well.
 */
export function usesSerpApi(query: SearchQuery): boolean {
  return query.dateMode === "exact" || query.rangeWithSerpApi === true;
}

/** The SerpApi searches this query would need right now, after checking the cache. */
export function previewCost(query: SearchQuery, allow?: RoutingAllowance): {
  plan: PlannedSearch[];
  cost: number;
  cached: StoredSearch | null;
} {
  const cached = findFreshByKey(searchKeyOf(query));
  const plan = cached || !usesSerpApi(query) ? [] : planSearches(query, allow);
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
 * per candidate departure date and return date — then scores them all together so they can be
 * compared directly, whichever date or airport they belong to. Not capped.
 */
function rankEveryArrangement(
  query: SearchQuery,
  preferences: RankingPreferences,
  pool: FlightPool,
  allow: RoutingAllowance,
): Arrangement[] {
  const arrangements: Arrangement[] = [];

  for (const airport of query.destination.airports) {
    for (const departureDate of candidateDates(query)) {
      // An open trip length tries every return date; ranking picks the best.
      for (const returnDate of returnDatesFor(query, departureDate)) {
        arrangements.push(
          ...buildArrangements({
            origins: query.origins,
            gatheringAirport: query.gatheringAirport,
            destination: { cityId: query.destination.cityId, airport },
            pool,
            departureDate,
            returnDate,
            allow,
            sameAirline: query.sameAirline,
          }),
        );
      }
    }
  }

  return sortArrangements(
    scoreArrangements(arrangements, preferences.weights, preferences, query.priorityDates),
    "score",
  );
}

/** The cheapest arrangement for each value of `keyOf`, cheapest first. */
function cheapestBy(ranked: Arrangement[], keyOf: (a: Arrangement) => string): Arrangement[] {
  const cheapest = new Map<string, Arrangement>();
  for (const arrangement of ranked) {
    const current = cheapest.get(keyOf(arrangement));
    if (!current || arrangement.totals.totalPrice < current.totals.totalPrice) {
      cheapest.set(keyOf(arrangement), arrangement);
    }
  }
  return [...cheapest.values()].sort((a, b) => a.totals.totalPrice - b.totals.totalPrice);
}

/**
 * Every arrangement is stored in the browser with its flights, so only
 * MAX_ARRANGEMENTS_PER_SEARCH survive; the results page re-scores them.
 *
 * Kept in this order until the cap: the cheapest of each departure date (no
 * bar of the cost-per-day chart drops out), the cheapest of each
 * departure/return pair, cheapest pairs first, then the best-scoring rest.
 * With a fixed trip length the first two are the same set. An open length can
 * have more pairs than the cap; those the cap drops are covered by the stored
 * price floor (`cheapestPerPair`) instead.
 */
function keepWithinCap(ranked: Arrangement[]): Arrangement[] {
  const kept = new Set<Arrangement>(cheapestBy(ranked, (a) => a.departureDate));
  const tiers = [cheapestBy(ranked, (a) => `${a.departureDate}|${a.returnDate ?? ""}`), ranked];
  for (const tier of tiers) {
    for (const arrangement of tier) {
      if (kept.size >= MAX_ARRANGEMENTS_PER_SEARCH) break;
      kept.add(arrangement);
    }
  }
  return ranked.filter((arrangement) => kept.has(arrangement));
}

/** The arrangements a search stores, within the cap. */
export function buildAllArrangements(
  query: SearchQuery,
  preferences: RankingPreferences,
  pool: FlightPool,
  allow: RoutingAllowance = { direct: true, gather: true },
): Arrangement[] {
  return keepWithinCap(rankEveryArrangement(query, preferences, pool, allow));
}

/**
 * The arrangements a search stores, plus the cheapest total of every date
 * pair taken before the cap, so the price grid never shows a hole the cap made.
 */
export function buildSearchResult(
  query: SearchQuery,
  preferences: RankingPreferences,
  pool: FlightPool,
  allow: RoutingAllowance = { direct: true, gather: true },
): { arrangements: Arrangement[]; priceGrid: StoredPriceGrid } {
  const ranked = rankEveryArrangement(query, preferences, pool, allow);
  return { arrangements: keepWithinCap(ranked), priceGrid: cheapestPerPair(ranked) };
}

/**
 * Runs a search, reusing a fresh stored result when the query is identical.
 *
 * Reuse is the whole point of the freshness threshold: an unchanged search
 * within the window costs zero SerpApi requests.
 */
/**
 * Recovers per-route flight records from a flight pool.
 *
 * Only needed when the server sends a pool but no records. It is a fallback,
 * not the intended path: the pool has already merged routes that share a key.
 */
function recordsFromPool(plan: PlannedSearch[], pool: FlightPool): FlightRecord[] {
  return plan.map((search) => ({
    id: searchId(search),
    from: search.from,
    to: search.to,
    date: search.date,
    direction: search.direction,
    reason: search.reason,
    flights: pool[poolKey(search.from, search.to, search.date)] ?? [],
  }));
}

/**
 * Asks the server for the raw flights.
 *
 * Records are the wanted shape: they are what each request actually returned,
 * and the pool rebuilds from them for free. A server that only sends a pool is
 * still supported, with the records recovered from it as best they can be.
 */
async function requestFlightRecords(
  query: SearchQuery,
  allow: RoutingAllowance,
  plan: PlannedSearch[],
): Promise<{ records: FlightRecord[]; requestCount: number }> {
  const response = await fetch("/api/airsearcher/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, allow }),
  });
  const data = (await response.json().catch(() => null)) as {
    records?: FlightRecord[];
    pool?: FlightPool;
    requestCount?: number;
    requestsMade?: number;
    error?: string;
  } | null;

  const failed =
    !response.ok ||
    typeof data?.requestCount !== "number" ||
    (!data.records && !data.pool);

  if (failed) {
    throw new SearchRequestError(
      data?.error ?? "The live flight search failed.",
      typeof data?.requestsMade === "number" ? data.requestsMade : 0,
    );
  }

  return {
    records: data!.records ?? recordsFromPool(plan, data!.pool ?? {}),
    requestCount: data!.requestCount!,
  };
}

/** Asks the server for the same routes from Travelpayouts. Never throws. */
async function requestTravelpayoutsRecords(
  query: SearchQuery,
  allow: RoutingAllowance,
): Promise<{ records: FlightRecord[] } | { error: string }> {
  try {
    const response = await fetch("/api/airsearcher/travelpayouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, allow }),
    });
    const data = (await response.json().catch(() => null)) as {
      records?: FlightRecord[];
      error?: string;
    } | null;
    if (!response.ok || !Array.isArray(data?.records)) {
      return { error: data?.error ?? "The Travelpayouts search failed." };
    }
    return { records: data.records };
  } catch {
    return { error: "Travelpayouts could not be reached." };
  }
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

  // A date range is answered by Travelpayouts alone: no SerpApi requests.
  if (!usesSerpApi(query)) {
    const alternative = await requestTravelpayoutsRecords(query, allow);
    if ("error" in alternative) throw new SearchRequestError(alternative.error, 0);

    const built = buildSearchResult(
      query,
      withWeights,
      poolFromRecords(alternative.records),
      allow,
    );
    const entry: StoredSearch = {
      id: `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      label: labelFor(query),
      key,
      query,
      arrangements: [],
      travelpayouts: {
        records: alternative.records,
        arrangements: sortArrangements(built.arrangements, "score"),
        priceGrid: built.priceGrid,
      },
    };
    saveSearch(entry);
    return { entry, reused: false, requestCount: 0 };
  }

  const plan = planSearches(query, allow);
  const expectedCount = costOf(plan);
  // Started alongside SerpApi and never allowed to fail the search.
  const travelpayouts = requestTravelpayoutsRecords(query, allow);
  const live = await requestFlightRecords(query, allow, plan);
  if (live.requestCount !== expectedCount) {
    throw new SearchRequestError(
      `The server made ${live.requestCount} requests, but ${expectedCount} were confirmed.`,
      live.requestCount,
    );
  }

  // The pool is derived, never stored: it rebuilds from the records whenever
  // it is needed.
  const pool = poolFromRecords(live.records);

  const built = buildSearchResult(query, withWeights, pool, allow);
  const arrangements = sortArrangements(built.arrangements, "score");

  // Travelpayouts records go through exactly the same pool and grouping.
  const alternative = await travelpayouts;
  const travelpayoutsResult =
    "records" in alternative
      ? (() => {
          const fromTravelpayouts = buildSearchResult(
            query,
            withWeights,
            poolFromRecords(alternative.records),
            allow,
          );
          return {
            records: alternative.records,
            arrangements: sortArrangements(fromTravelpayouts.arrangements, "score"),
            priceGrid: fromTravelpayouts.priceGrid,
          };
        })()
      : { arrangements: [], error: alternative.error };

  const entry: StoredSearch = {
    id: `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    label: labelFor(query),
    key,
    query,
    arrangements,
    priceGrid: built.priceGrid,
    records: live.records,
    travelpayouts: travelpayoutsResult,
  };

  saveSearch(entry);

  return {
    entry,
    reused: false,
    requestCount: live.requestCount,
  };
}
