/**
 * The keys the app saves, shared by the browser and the server.
 *
 * They are the exact localStorage keys used before SQLite, so the values move
 * over unchanged and `storage.ts` keeps reading the same JSON it always has.
 * The server refuses any other key.
 */

export const SEARCHES_KEY = "airsearcher:searches:v1";
export const FILTERS_KEY = "airsearcher:filters:v1";
export const PREFS_KEY = "airsearcher:prefs:v1";
/** The results saved with a result card's save icon (see `savedResults.ts`). */
export const SAVED_RESULTS_KEY = "airsearcher:saved-results:v1";

export const STORAGE_KEYS = [SEARCHES_KEY, FILTERS_KEY, PREFS_KEY, SAVED_RESULTS_KEY] as const;

export type StorageKey = (typeof STORAGE_KEYS)[number];

export function isStorageKey(value: unknown): value is StorageKey {
  return typeof value === "string" && (STORAGE_KEYS as readonly string[]).includes(value);
}

/**
 * Each search's gathered flights, under a key of their own: they are most of
 * the saved data, and only the "Gathered flight data" window reads them, so
 * they are fetched one search at a time when it opens — never with the rest.
 */
export const RECORDS_KEY_PREFIX = "airsearcher:records:v1:";

export type RecordsKey = `${typeof RECORDS_KEY_PREFIX}${string}`;

/** A search's records key. Search ids are letters, digits, "-" and "_". */
export function recordsKeyOf(searchId: string): RecordsKey {
  return `${RECORDS_KEY_PREFIX}${searchId}`;
}

export function isRecordsKey(value: unknown): value is RecordsKey {
  return (
    typeof value === "string" &&
    value.startsWith(RECORDS_KEY_PREFIX) &&
    /^[\w-]{1,100}$/.test(value.slice(RECORDS_KEY_PREFIX.length))
  );
}

/** Any key the server accepts a write for. */
export type AnyStorageKey = StorageKey | RecordsKey;

export const STORAGE_ROUTE = "/api/airsearcher/storage";

/** Every key with its saved JSON string, or null when nothing is saved. */
export type StorageValues = Record<StorageKey, string | null>;

/** `GET` answer of the storage route. */
export interface StorageSnapshot {
  values: StorageValues;
  /** Whether the one-time import from localStorage has already happened. */
  imported: boolean;
}
