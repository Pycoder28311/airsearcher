/**
 * Behaviour of the Google Flights cURL runner.
 *
 * Kept next to `constants.ts` rather than in `app/config/`, for the same
 * reason: that folder is the user's style and UI metadata, and these are
 * behaviour. Nothing else in the codebase may hard-code these values.
 */

/**
 * Minimum gap between two requests to Google, measured from when the previous
 * one finished. This is what keeps the traffic looking like a person clicking,
 * not a bot. Never set it lower than a person could plausibly click.
 */
export const CURL_MIN_INTERVAL_MS = 10_000;

/**
 * Random extra wait added on top of the minimum (0..this), so the gaps are not
 * metronomic. Added, never subtracted: the gap is always at least the minimum.
 * Set to 0 for exactly CURL_MIN_INTERVAL_MS.
 */
export const CURL_JITTER_MS = 3_000;

/**
 * After Google answers with a rate limit or a captcha, the runner refuses every
 * request for this long. Retrying straight away is exactly what a bot does.
 */
export const CURL_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

/** How long one request may take before curl gives up. */
export const CURL_TIMEOUT_MS = 30_000;

/**
 * Most requests one run may send — pasted cURLs, or searches built from one
 * session cURL (each search is two: first page and view more). A guard against
 * a wide date range quietly turning into a flood of requests.
 */
export const CURL_MAX_PER_RUN = 200;

/** Largest response body accepted from curl. */
export const CURL_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Largest pasted cURL command the route accepts. */
export const CURL_MAX_COMMAND_BYTES = 64 * 1024;

/** The only URL prefix a request will ever be sent to. */
export const CURL_ALLOWED_URL_PREFIX =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/";

/** The RPC that returns the flight list of a search. */
export const CURL_SHOPPING_RPC = "GetShoppingResults";

/**
 * Most searches the app may BUILD from a session cURL in any rolling hour.
 * Only generated searches count; pasted per-search cURLs keep their own rules.
 * The only published figure (uncited) puts long-term safe rates at roughly
 * 3–100+ requests an hour, so this stays well inside it.
 */
export const CURL_MAX_PER_HOUR = 60;

/** How far the URL's `_reqid` moves per generated request, as the browser does. */
export const CURL_REQID_STEP = 100_000;
