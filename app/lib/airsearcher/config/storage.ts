/**
 * Behaviour of the local SQLite storage that replaced localStorage.
 *
 * Kept next to `constants.ts` rather than in `app/config/`, for the same
 * reason: that folder is the user's style and UI metadata, and these are
 * behaviour.
 */

/**
 * Largest value one key may hold, in UTF-16 code units — the unit localStorage
 * counts in. localStorage refuses writes above ~5 MB, and `saveSearch` relies
 * on that refusal to shed raw flight records from older searches; keeping the
 * same budget keeps that behaviour, and keeps each page load small.
 */
export const STORAGE_MAX_VALUE_CHARS = 5 * 1024 * 1024;

/** Waits between retries of a failed write; the last one repeats. */
export const STORAGE_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

/** How long `flushStorage` waits for pending writes before giving up. */
export const STORAGE_FLUSH_TIMEOUT_MS = 10_000;

/**
 * Where the database file lives, relative to the project folder, unless
 * `AIRSEARCH_DB_PATH` says otherwise.
 */
export const STORAGE_DEFAULT_DB_PATH = "data/airsearch.sqlite";
