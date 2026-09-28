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

export const STORAGE_KEYS = [SEARCHES_KEY, FILTERS_KEY, PREFS_KEY] as const;

export type StorageKey = (typeof STORAGE_KEYS)[number];

export function isStorageKey(value: unknown): value is StorageKey {
  return typeof value === "string" && (STORAGE_KEYS as readonly string[]).includes(value);
}

export const STORAGE_ROUTE = "/api/airsearcher/storage";

/** Every key with its saved JSON string, or null when nothing is saved. */
export type StorageValues = Record<StorageKey, string | null>;

/** `GET` answer of the storage route. */
export interface StorageSnapshot {
  values: StorageValues;
  /** Whether the one-time import from localStorage has already happened. */
  imported: boolean;
}
