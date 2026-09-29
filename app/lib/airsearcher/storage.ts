/**
 * The only module that reads and writes the app's saved data.
 *
 * The data lives in a local SQLite file (see `storageClient.ts`), under the
 * same keys and in the same JSON the app kept in localStorage before, so
 * everything below reads it exactly as it always has.
 *
 * Everything here is defensive: storage can be absent (server render, or not
 * loaded yet), unreachable, full, or hold a blob written by an older version of
 * this code. None of those may break the page, so every path degrades to "no
 * saved data" rather than throwing.
 */

import {
  MAX_SAVED_SEARCHES,
  RESULT_FRESHNESS_MS,
} from "@/lib/airsearcher/config/constants";
import {
  DEFAULT_DATE_PREFERENCES,
  DEFAULT_RANKING_CONFIG,
  isRankingWeights,
  type DatePreferences,
  type RankingPreferences,
} from "@/lib/airsearcher/config/ranking";
import {
  DEFAULT_FILTERS,
  type FilterState,
} from "@/lib/airsearcher/config/filters";
import {
  FILTERS_KEY,
  PREFS_KEY,
  recordsKeyOf,
  SEARCHES_KEY,
  type StorageKey,
} from "@/lib/airsearcher/db/keys";
import {
  countFlights,
  shownRecordsOf,
  splitRecords,
  type StoredRecords,
} from "@/lib/airsearcher/db/records";
import {
  fetchRecordsItem,
  getItem,
  setItem,
  setRecordsItem,
} from "@/lib/airsearcher/storageClient";
import { destinationsOf } from "@/lib/airsearcher/types";
import type {
  Arrangement,
  FlightRecord,
  GroupLeg,
  NormalizedFlight,
  Routing,
  SearchQuery,
} from "@/lib/airsearcher/types";
import type { StoredPriceGrid } from "@/lib/airsearcher/priceGrid";

export interface StoredSearch {
  id: string;
  /** ISO timestamp of when the results were computed. */
  savedAt: string;
  label: string;
  /** Canonical key from `searchKeyOf`, used to match a repeat search. */
  key: string;
  query: SearchQuery;
  arrangements: Arrangement[];
  /**
   * Cheapest total per departure/return pair, taken before the arrangement
   * cap. A few KB; absent on entries saved before the price grid existed.
   */
  priceGrid?: StoredPriceGrid;
  /**
   * Every flight the search gathered, one record per route.
   *
   * Only on a search being built: saving moves every provider's records to
   * the search's own records key (see `db/records.ts`), read back with
   * `loadGatheredFlights`, and leaves their count in `gatheredFlights`.
   */
  records?: FlightRecord[];
  /**
   * How many flights the search's records hold — the number the history card
   * shows without loading them. Absent when none were kept.
   */
  gatheredFlights?: number;
  /**
   * The same search answered from Travelpayouts, built by the same pipeline.
   * Absent on entries saved before it existed; `error` is set when the call
   * failed, so the SerpApi results are never lost because of it.
   */
  travelpayouts?: {
    arrangements: Arrangement[];
    priceGrid?: StoredPriceGrid;
    records?: FlightRecord[];
    error?: string;
  };
  /**
   * What made this entry. Absent means a normal search (SerpApi and/or
   * Travelpayouts); "google-curl" means it was built only from pasted Google
   * Flights cURLs.
   */
  kind?: "google-curl";
  /**
   * Set once the results were removed because the search was outdated (older
   * than RESULT_FRESHNESS_MS). The entry itself — query, dates, label — stays
   * in the history; only arrangements, raw flights and price grids go.
   */
  resultsRemoved?: boolean;
  /**
   * Flights from pasted Google Flights cURLs, built by the same pipeline.
   * Flight data only — the cURLs themselves hold the user's session and are
   * never stored.
   */
  googleCurl?: {
    arrangements: Arrangement[];
    priceGrid?: StoredPriceGrid;
    records?: FlightRecord[];
    /** Rows with no flights, flights that matched no route, and similar. */
    warnings?: string[];
    /**
     * How many flights each request returned, in the order sent, and how many
     * distinct flights the routes kept once duplicates were merged. Absent on
     * entries saved before it was recorded.
     */
    requests?: CurlRequestCount[];
    uniqueFlights?: number;
  };
}

/** One request of a cURL run: what it was and how many flights it read. */
export interface CurlRequestCount {
  label: string;
  flights: number;
  /** Set when the request failed; `flights` is then 0. */
  error?: string;
}

/** Ranking preferences plus the calendar's date rules, stored together. */
export interface StoredPreferences {
  ranking: RankingPreferences;
  dates: DatePreferences;
  /** Whether the results sidebar is collapsed. Presentation only. */
  sidebarCollapsed: boolean;
}

export const DEFAULT_PREFERENCES: StoredPreferences = {
  ranking: DEFAULT_RANKING_CONFIG,
  dates: DEFAULT_DATE_PREFERENCES,
  sidebarCollapsed: false,
};

/* ── Storage access ──────────────────────────────────────────────────────── */

function readJson(key: StorageKey): unknown {
  const raw = getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Returns false when the write did not happen, so callers can shed weight. */
function writeJson(key: StorageKey, value: unknown): boolean {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return false;
  }
  // Refused when over the size budget or when storage is unavailable.
  return setItem(key, text);
}

/* ── Searches ────────────────────────────────────────────────────────────── */

function isStoredSearch(value: unknown): value is StoredSearch {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<StoredSearch>;
  return (
    typeof entry.id === "string" &&
    typeof entry.savedAt === "string" &&
    typeof entry.key === "string" &&
    typeof entry.query === "object" &&
    entry.query !== null &&
    Array.isArray(entry.arrangements)
  );
}

/**
 * The leg shape saved before each direction was routed separately: one routing
 * for the whole trip, with the feeder and main flights stored as
 * outbound/return pairs.
 */
interface LegacyLeg {
  origin: string;
  routing: Routing;
  feeder: { outbound: NormalizedFlight; return: NormalizedFlight | null } | null;
  main: { outbound: NormalizedFlight; return: NormalizedFlight | null };
  passengers: number;
}

function isLegacyLeg(leg: unknown): leg is LegacyLeg {
  const value = leg as Partial<LegacyLeg> | null;
  return typeof value?.main?.outbound === "object" && !("outbound" in value);
}

/**
 * Rewrites a legacy leg into the per-direction shape without changing a single
 * flight, so an old search still shows exactly what it showed when it was saved.
 */
function upgradeLeg(leg: LegacyLeg): GroupLeg {
  return {
    origin: leg.origin,
    passengers: leg.passengers,
    outbound: {
      direction: "outbound",
      routing: leg.routing,
      feeder: leg.feeder?.outbound ?? null,
      main: leg.main.outbound,
    },
    return: leg.main.return
      ? {
          direction: "return",
          routing: leg.routing,
          feeder: leg.feeder?.return ?? null,
          main: leg.main.return,
        }
      : null,
  };
}

function upgradeEntry(entry: StoredSearch): StoredSearch {
  return {
    ...entry,
    // Searches saved before several destinations were allowed hold one.
    query: {
      ...entry.query,
      destinations: destinationsOf(entry.query),
    },
    arrangements: entry.arrangements.map((arrangement) => ({
      ...arrangement,
      legs: (arrangement.legs as unknown[]).map((leg) =>
        isLegacyLeg(leg) ? upgradeLeg(leg) : (leg as GroupLeg),
      ),
    })),
  };
}

/** Newest first. Unreadable or malformed entries are silently dropped. */
export function loadSearches(): StoredSearch[] {
  const raw = readJson(SEARCHES_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isStoredSearch)
    .map(upgradeEntry)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Adds or replaces an entry, keeping at most MAX_SAVED_SEARCHES.
 *
 * Its gathered flights are written to the search's own records key and only
 * their count stays in the list, which then holds little beyond the
 * arrangements the results page needs. If the flights are refused (too large)
 * the search is still saved, just without them.
 */
export function saveSearch(entry: StoredSearch): void {
  const now = Date.now();
  const split = splitRecords(entry);
  let saved = split.entry;
  if (
    split.records &&
    !setRecordsItem(recordsKeyOf(entry.id), JSON.stringify(split.records))
  ) {
    saved = { ...saved, gatheredFlights: undefined };
  }

  const others = loadSearches().filter((e) => e.id !== entry.id);
  const outdated = others.filter((e) => isStale(e, now) && !e.resultsRemoved);
  const next = [saved, ...others.map((e) => (outdated.includes(e) ? withoutResults(e) : e))];
  const kept = next.slice(0, MAX_SAVED_SEARCHES);

  if (!writeJson(SEARCHES_KEY, kept)) return;
  for (const gone of [...outdated, ...next.slice(MAX_SAVED_SEARCHES)]) removeRecords(gone.id);
}

/** Deletes a search's gathered flights. */
function removeRecords(id: string): void {
  setRecordsItem(recordsKeyOf(id), null);
}

/**
 * Every flight a search gathered, grouped by request, as its data window shows
 * them: fetched on demand from the search's records key. Empty when none were
 * kept or they couldn't be read.
 */
export async function loadGatheredFlights(entry: StoredSearch): Promise<FlightRecord[]> {
  // A search from before the records moved out that still holds its own.
  const inline = shownRecordsOf(entry.kind, {
    records: entry.records,
    googleCurl: entry.googleCurl?.records,
  });
  if (inline.length > 0) return inline;
  if (!entry.gatheredFlights) return [];

  const raw = await fetchRecordsItem(recordsKeyOf(entry.id));
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as StoredRecords;
    return shownRecordsOf(entry.kind, stored);
  } catch {
    return [];
  }
}

/** How many flights a search gathered, without loading them. */
export function gatheredFlightsOf(entry: StoredSearch): number {
  return (
    entry.gatheredFlights ??
    countFlights(
      shownRecordsOf(entry.kind, { records: entry.records, googleCurl: entry.googleCurl?.records }),
    )
  );
}

/**
 * An outdated entry reduced to what the history card needs: its query, dates
 * and label stay; every result goes. The request summary is a few numbers, so
 * it stays too.
 */
function withoutResults(entry: StoredSearch): StoredSearch {
  if (entry.resultsRemoved) return entry;
  return {
    ...entry,
    arrangements: [],
    records: undefined,
    gatheredFlights: undefined,
    priceGrid: undefined,
    travelpayouts: entry.travelpayouts && { arrangements: [], error: entry.travelpayouts.error },
    googleCurl: entry.googleCurl && {
      arrangements: [],
      requests: entry.googleCurl.requests,
      uniqueFlights: entry.googleCurl.uniqueFlights,
      warnings: entry.googleCurl.warnings,
    },
    resultsRemoved: true,
  };
}

/**
 * Removes the results of every outdated search, keeping the entries. Called
 * when the home page opens; saving a search does the same for the others.
 * Returns how many searches were cleaned (0 when nothing had to change).
 */
export function pruneOutdatedResults(now: number = Date.now()): number {
  const all = loadSearches();
  const outdated = all.filter((entry) => isStale(entry, now) && !entry.resultsRemoved);
  if (outdated.length === 0) return 0;
  const written = writeJson(
    SEARCHES_KEY,
    all.map((entry) => (outdated.includes(entry) ? withoutResults(entry) : entry)),
  );
  if (!written) return 0;
  for (const entry of outdated) removeRecords(entry.id);
  return outdated.length;
}

export function removeSearch(id: string): void {
  const written = writeJson(
    SEARCHES_KEY,
    loadSearches().filter((entry) => entry.id !== id),
  );
  if (written) removeRecords(id);
}

export function findSearchById(id: string): StoredSearch | null {
  return loadSearches().find((entry) => entry.id === id) ?? null;
}

/**
 * Whether an entry is old enough that its results should be recalculated.
 * This is the ONLY place the freshness threshold is applied.
 */
export function isStale(entry: StoredSearch, now: number = Date.now()): boolean {
  const savedAt = new Date(entry.savedAt).getTime();
  if (Number.isNaN(savedAt)) return true;
  return now - savedAt > RESULT_FRESHNESS_MS;
}

/**
 * A stored result for exactly this query that is still fresh — the one case
 * where a search costs zero SerpApi requests.
 */
export function findFreshByKey(
  key: string,
  now: number = Date.now(),
): StoredSearch | null {
  return (
    loadSearches().find((entry) => entry.key === key && !isStale(entry, now)) ?? null
  );
}

/* ── Filters ─────────────────────────────────────────────────────────────── */

export function loadFilters(): FilterState {
  const raw = readJson(FILTERS_KEY);
  if (typeof raw !== "object" || raw === null) return DEFAULT_FILTERS;
  // Merge over the defaults so a blob from an older version gains new fields
  // instead of leaving them undefined.
  return {
    ...DEFAULT_FILTERS,
    ...(raw as Partial<FilterState>),
    scopes: {
      ...DEFAULT_FILTERS.scopes,
      ...((raw as Partial<FilterState>).scopes ?? {}),
    },
    // Saves from before the sliders held two five-level choices instead.
    weights: isRankingWeights((raw as Partial<FilterState>).weights)
      ? (raw as FilterState).weights
      : DEFAULT_FILTERS.weights,
  };
}

export function saveFilters(next: FilterState): void {
  writeJson(FILTERS_KEY, next);
}

/* ── Preferences ─────────────────────────────────────────────────────────── */

export function loadPreferences(): StoredPreferences {
  const raw = readJson(PREFS_KEY);
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFERENCES;

  const stored = raw as Partial<StoredPreferences>;
  const curves = stored.ranking?.curves;
  const curvesUsable =
    Array.isArray(curves?.outbound) &&
    curves.outbound.length === 24 &&
    Array.isArray(curves?.return) &&
    curves.return.length === 24;

  return {
    ranking: curvesUsable
      ? { ...DEFAULT_RANKING_CONFIG, ...stored.ranking }
      : DEFAULT_RANKING_CONFIG,
    dates: {
      excluded: Array.isArray(stored.dates?.excluded) ? stored.dates.excluded : [],
      priority:
        typeof stored.dates?.priority === "object" && stored.dates.priority !== null
          ? stored.dates.priority
          : {},
    },
    sidebarCollapsed: stored.sidebarCollapsed === true,
  };
}

export function savePreferences(next: StoredPreferences): void {
  writeJson(PREFS_KEY, next);
}
