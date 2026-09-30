/**
 * Extending a finished Google Flights search without redoing it.
 *
 * A search keeps every flight it gathered, filed per route and day (one
 * `FlightRecord` per planned search, its id `searchId(search)`). Widening the
 * date range or adding trip lengths needs only the routes and days those
 * records lack: they are searched, merged with the saved ones, and the search
 * is rebuilt and saved again under the same id.
 */

import { sessionRequestsFor, type GeneratedJob } from "@/lib/airsearcher/curl/generated";
import {
  coveredByCache,
  planSearches,
  searchId,
  tripLengthList,
  type PlannedSearch,
} from "@/lib/airsearcher/queryPlan";
import { gatheredFlightsOf, isStale, type StoredSearch } from "@/lib/airsearcher/storage";
import { mergedDestinations, type FlightRecord, type SearchQuery } from "@/lib/airsearcher/types";

/** A run that adds to a saved search instead of making a new one. */
export interface SearchExtension {
  entry: StoredSearch;
  /** The saved search's flights. */
  records: FlightRecord[];
}

/** The planned searches a saved search already holds, by `searchId`. */
export function searchedIds(records: FlightRecord[]): Set<string> {
  return new Set(records.map((record) => record.id));
}

/**
 * The saved search's query with a new date range and, when trip lengths are
 * added, every length it now covers: the ones it had plus the new ones.
 */
export function extendedQuery(
  query: SearchQuery,
  range: { start: string; end: string },
  extraNights: number[] = [],
): SearchQuery {
  const had = tripLengthList(query) ?? (query.tripDurationDays !== null ? [query.tripDurationDays] : []);
  const lengths = [...new Set([...had, ...extraNights])].sort((a, b) => a - b);
  const several = !query.tripLengthRange && lengths.length > 1;
  return {
    ...query,
    dateRange: range,
    // An open length already covers its own lengths; only fixed ones join a list.
    tripLengths: several ? lengths : query.tripLengths,
  };
}

/** The planned searches the saved records don't have yet. */
export function missingSearches(query: SearchQuery, have: Set<string>): PlannedSearch[] {
  return coveredByCache(planSearches(query), have).needed;
}

/** Whether a request covers a planned search: same day and way, both airports in its lists. */
function jobCovers(job: GeneratedJob, search: PlannedSearch): boolean {
  return (
    job.search.date === search.date &&
    job.direction === search.direction &&
    job.search.from.includes(search.from) &&
    job.search.to.includes(search.to)
  );
}

/** The requests a run must send to fill in what the saved search lacks. */
export function missingJobs(query: SearchQuery, have: Set<string>): GeneratedJob[] {
  const missing = missingSearches(query, have);
  return sessionRequestsFor(query).filter((job) => missing.some((search) => jobCovers(job, search)));
}

/** The planned searches the given requests cover, by `searchId`. */
export function sentIds(query: SearchQuery, jobs: GeneratedJob[]): Set<string> {
  const ids = new Set<string>();
  for (const search of planSearches(query)) {
    if (jobs.some((job) => jobCovers(job, search))) {
      ids.add(searchId(search));
    }
  }
  return ids;
}

/**
 * The saved records plus the fresh ones of the routes this run searched. A run
 * files a record for every route of the search, empty for those it never sent;
 * those must not replace the saved ones, so only `sent` routes are taken.
 */
export function mergeRecords(
  saved: FlightRecord[],
  fresh: FlightRecord[],
  sent: Set<string>,
): FlightRecord[] {
  const merged = new Map(saved.map((record) => [record.id, record]));
  for (const record of fresh) {
    if (sent.has(record.id)) merged.set(record.id, record);
  }
  return [...merged.values()];
}

export type ExtendCheck = { ok: true } | { ok: false; reason: "stale" | "unsupported" };

/**
 * Whether a saved search can be extended: a date-range Google Flights search
 * that still has its flights, and isn't outdated.
 */
export function canExtend(entry: StoredSearch, now: number = Date.now()): ExtendCheck {
  const supported =
    entry.kind === "google-curl" &&
    entry.query.dateMode === "advanced" &&
    entry.query.dateRange !== null &&
    !entry.resultsRemoved &&
    gatheredFlightsOf(entry) > 0;
  if (!supported) return { ok: false, reason: "unsupported" };
  if (isStale(entry, now)) return { ok: false, reason: "stale" };
  return { ok: true };
}

/* ── The hand-off from the results page to the home page ───────────────── */

/** What the home page needs to add dates or lengths to a saved search. */
export interface ExtendRequest {
  searchId: string;
  range: { start: string; end: string };
  /** Trip lengths to add, in nights; empty when only the dates change. */
  nights: number[];
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "/?extend=<id>&start=…&end=…&nights=5,10" */
export function extendUrl(request: ExtendRequest): string {
  const params = new URLSearchParams({
    extend: request.searchId,
    start: request.range.start,
    end: request.range.end,
  });
  if (request.nights.length > 0) params.set("nights", request.nights.join(","));
  return `/?${params}`;
}

/** Reads an `extendUrl` query string back; null when it isn't one or is malformed. */
export function parseExtendParams(search: string): ExtendRequest | null {
  const params = new URLSearchParams(search);
  const searchId = params.get("extend");
  const start = params.get("start");
  const end = params.get("end");
  if (!searchId || !start || !end || !ISO_DAY.test(start) || !ISO_DAY.test(end) || start > end) {
    return null;
  }
  const nights = (params.get("nights") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 60);
  return { searchId, range: { start, end }, nights };
}

/** The places a search flies between: destination cities and airports, and departure airports with passengers. */
function routeKeyOf(query: SearchQuery): string {
  const destinations = mergedDestinations(query)
    .map((place) => `${place.cityId}:${[...place.airports].sort().join(",")}`)
    .sort();
  const origins = query.origins
    .filter((origin) => origin.passengers > 0)
    .map((origin) => origin.airport)
    .sort();
  return `${destinations.join("+")}|${origins.join(",")}`;
}

/**
 * Whether a change makes a different search rather than more of the same: new
 * destinations or departure airports. Dates, trip lengths, one way or round
 * trip, the same-airline rule, the gathering airport and passenger counts all
 * keep adding to the saved search, with only what is missing searched.
 */
export function routesChanged(saved: SearchQuery, next: SearchQuery): boolean {
  return routeKeyOf(saved) !== routeKeyOf(next);
}
