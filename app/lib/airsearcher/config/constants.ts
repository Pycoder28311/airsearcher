/**
 * AirSearcher's tunable constants.
 *
 * These live here rather than in `app/config/` because that folder holds the
 * project's style and UI metadata and is owned by the user. Everything below is
 * behaviour, not appearance.
 *
 * Nothing else in the codebase may hard-code these values — change them here.
 */

/**
 * How long a stored result stays reusable before the app says it needs
 * recalculating with SerpApi. This is the "one day" threshold; raise or lower
 * it here and every staleness check follows.
 */
export const RESULT_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/** How many searches the history keeps before dropping the oldest. */
export const MAX_SAVED_SEARCHES = 10;

/** Where the group gathers by default when passengers route through one hub. */
export const DEFAULT_GATHERING_AIRPORT = "ATH";

/** The three Greek airports the departure dropdown starts with. */
export const GREEK_ORIGIN_DEFAULTS = ["ATH", "SKG", "HER"] as const;

/** How many passengers each departure airport starts with. */
export const DEFAULT_PASSENGERS_PER_ORIGIN = 9;

/** The nights an unspecified-length trip may last, until the user changes them. */
export const DEFAULT_TRIP_LENGTH_RANGE = { min: 3, max: 7 } as const;

/**
 * Longest window the advanced date search may span. Each extra day is another
 * set of SerpApi searches, so this is a cost guard as much as a UI limit.
 */
export const MAX_ADVANCED_RANGE_DAYS = 45;

/**
 * Leaflet zoom below which airport markers are hidden, so a zoomed-out map
 * shows cities only and does not turn into a wall of dots.
 */
export const AIRPORT_ZOOM_THRESHOLD = 6;

/**
 * Minimum gap between a feeder landing at the gathering airport and the main
 * flight leaving it. Anything tighter is not a connection anyone would book, so
 * such arrangements are rejected rather than scored badly.
 */
export const MIN_GATHER_BUFFER_MINUTES = 90;

/**
 * Score bonus per priority level (1..3) on a preferred departure date.
 * Deliberately small: a favoured date should win between near-equal options,
 * never drag a clearly worse one to the top.
 */
export const DATE_PRIORITY_BONUS = 0.02;

/** Smallest a floating result window may be dragged down to, in pixels. */
export const MIN_FLOAT_WIDTH = 320;
export const MIN_FLOAT_HEIGHT = 240;

/** Size a floating window opens at, and how far each new one cascades. */
export const DEFAULT_FLOAT_WIDTH = 460;
export const DEFAULT_FLOAT_HEIGHT = 420;
export const FLOAT_CASCADE_OFFSET = 28;

/** Currency the mock data quotes prices in. */
export const CURRENCY = "EUR";
