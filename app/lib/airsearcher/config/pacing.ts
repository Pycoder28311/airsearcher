/**
 * Pacing between Google Flights searches in the hidden browser, planned in
 * the page before a run starts.
 *
 * Kept next to `constants.ts` rather than in `app/config/`, for the same
 * reason as `curl.ts`: these are behaviour, not the user's style metadata.
 */

/** Each search starts a random 5–12 s after the previous one finished. */
export const PACING_GAP_MIN_MS = 5_000;
export const PACING_GAP_MAX_MS = 12_000;

/**
 * On top, a few longer pauses at random places: their number is the searches
 * divided by a random whole number in this range, rounded up.
 */
export const PACING_PAUSE_DIVISOR_MIN = 5;
export const PACING_PAUSE_DIVISOR_MAX = 20;

/** Each longer pause lasts a random 20–90 s instead of the normal gap. */
export const PACING_PAUSE_MIN_MS = 20_000;
export const PACING_PAUSE_MAX_MS = 90_000;

/**
 * When Google refuses a search (its error 13), the run waits a random 40–80 s
 * and tries that search once more before giving up.
 */
export const PACING_RETRY_MIN_MS = 40_000;
export const PACING_RETRY_MAX_MS = 80_000;

/**
 * The server's floor: it never starts a search sooner than this after the
 * previous one, whatever the page asks. Equal to the shortest planned gap.
 */
export const PACING_SERVER_MIN_GAP_MS = PACING_GAP_MIN_MS;
