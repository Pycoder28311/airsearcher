/**
 * Behaviour of the hidden browser that runs Google Flights searches.
 *
 * Kept next to `constants.ts` rather than in `app/config/`, for the same
 * reason as `curl.ts`: these are behaviour, not the user's style metadata.
 * The pacing between searches is in `pacing.ts`; the cool-down and per-run
 * limit stay in `curl.ts`.
 */

/**
 * The browser's own profile folder — its cookies (e.g. the consent choice),
 * never the user's real browser. Relative to the project folder, unless
 * `AIRSEARCH_BROWSER_PROFILE` says otherwise. Under `data/`, so git ignores it.
 */
export const BROWSER_PROFILE_DIR = "data/browser-profile";

/** Longest wait for the search page to load, consent included. */
export const BROWSER_PAGE_TIMEOUT_MS = 45_000;

/** Longest wait for Google's flight list after the page or a click asked for it. */
export const BROWSER_RESULTS_TIMEOUT_MS = 30_000;

/** The browser closes after this long without a search, to free memory. */
export const BROWSER_IDLE_CLOSE_MS = 5 * 60 * 1000;

/** Rough time one search takes in the browser (page, results, "View more"), for estimates. */
export const BROWSER_SEARCH_ESTIMATE_MS = 12_000;
