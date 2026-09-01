/**
 * The only module that touches localStorage.
 *
 * Everything here is defensive: storage can be absent (server render), blocked
 * (private mode), full, or hold a blob written by an older version of this
 * code. None of those may break the page, so every path degrades to "no saved
 * data" rather than throwing.
 */

import {
  MAX_SAVED_SEARCHES,
  RESULT_FRESHNESS_MS,
} from "@/lib/airsearcher/config/constants";
import {
  DEFAULT_DATE_PREFERENCES,
  DEFAULT_RANKING_CONFIG,
  type DatePreferences,
  type RankingPreferences,
} from "@/lib/airsearcher/config/ranking";
import {
  DEFAULT_FILTERS,
  type FilterState,
} from "@/lib/airsearcher/config/filters";
import type { Arrangement, SearchQuery } from "@/lib/airsearcher/types";

const SEARCHES_KEY = "airsearcher:searches:v1";
const FILTERS_KEY = "airsearcher:filters:v1";
const PREFS_KEY = "airsearcher:prefs:v1";

export interface StoredSearch {
  id: string;
  /** ISO timestamp of when the results were computed. */
  savedAt: string;
  label: string;
  /** Canonical key from `searchKeyOf`, used to match a repeat search. */
  key: string;
  query: SearchQuery;
  arrangements: Arrangement[];
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

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Accessing localStorage throws outright in some blocked configurations.
    return null;
  }
}

function readJson(key: string): unknown {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage blocked — losing a cache write is acceptable.
  }
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

/** Newest first. Unreadable or malformed entries are silently dropped. */
export function loadSearches(): StoredSearch[] {
  const raw = readJson(SEARCHES_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isStoredSearch)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Adds or replaces an entry, keeping at most MAX_SAVED_SEARCHES. */
export function saveSearch(entry: StoredSearch): void {
  const existing = loadSearches().filter((e) => e.id !== entry.id);
  const next = [entry, ...existing].slice(0, MAX_SAVED_SEARCHES);
  writeJson(SEARCHES_KEY, next);
}

export function removeSearch(id: string): void {
  writeJson(
    SEARCHES_KEY,
    loadSearches().filter((entry) => entry.id !== id),
  );
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
