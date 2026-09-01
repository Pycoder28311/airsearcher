/**
 * Ranking defaults.
 *
 * Ported from the reference project (`serpAPItest/my-app/config/ranking.ts`)
 * unchanged, so AirSearcher weights flights exactly as that project does. The
 * only addition is the five-level weight scale the filter sidebar exposes.
 *
 * Curves hold exactly 24 values, one per hour of the day, each 0..100, where
 * 100 means "ideal time to fly" and 0 means "avoid".
 */

/** Exactly 24 values, 0..100. Index = hour of day (0 = 00:00, 23 = 23:00). */
export type HourCurve = number[];

export interface RankingWeights {
  /** Relative importance of a cheap price. */
  price: number;
  /** Relative importance of convenient hours. */
  hour: number;
}

/** How many results to show, and how varied they must be. */
export interface ResultLimits {
  /** Maximum itineraries displayed. */
  limit: number;
  /** Most itineraries allowed to share one outbound flight. */
  maxPerOutbound: number;
  /** Flights taken per direction before pairing, bounding the combinations. */
  maxPerDirection: number;
}

export const DEFAULT_RESULT_LIMITS: ResultLimits = {
  limit: 20,
  maxPerOutbound: 2,
  maxPerDirection: 40,
};

export interface RankingPreferences {
  /** Need not sum to 1 — the scorer normalises them. */
  weights: RankingWeights;
  /**
   * Share of the hour index given to the departure time; the remainder goes to
   * the arrival time. 1 = departure only, 0 = arrival only.
   *
   * No longer user-editable: the reference project's "Departure vs Arrival
   * weight" control was removed from the sidebar, but the arithmetic still
   * needs a value, so it stays fixed at the default below.
   */
  departureArrivalRatio: number;
  curves: {
    outbound: HourCurve;
    return: HourCurve;
  };
}

/**
 * Outbound: nobody enjoys a 03:00 check-in. Preference climbs steeply through
 * the early morning, peaks 09:00-10:00, then tapers across the afternoon and
 * falls away in the late evening.
 */
const DEFAULT_OUTBOUND_CURVE: HourCurve = [
  10, 5, 5, 8, 15, 30, 55, 75, 90, 100, 100, 95, 85, 80, 75, 70, 65, 60, 55, 45,
  35, 25, 18, 12,
];

/**
 * Return: a later departure home preserves the last day of the trip, so the
 * peak sits in the mid-afternoon and only drops off once flights get late.
 */
const DEFAULT_RETURN_CURVE: HourCurve = [
  8, 5, 5, 6, 10, 20, 35, 50, 60, 70, 80, 88, 92, 95, 98, 100, 100, 95, 90, 82,
  70, 55, 35, 18,
];

export const DEFAULT_RANKING_CONFIG: RankingPreferences = {
  weights: {
    price: 60,
    hour: 40,
  },
  departureArrivalRatio: 0.65,
  curves: {
    outbound: DEFAULT_OUTBOUND_CURVE,
    return: DEFAULT_RETURN_CURVE,
  },
};

/* ── Five-level weights ──────────────────────────────────────────────────────
 * The sidebar exposes weights as five named levels rather than a slider. They
 * map onto the same 0..100 numbers `normalizeWeights` already consumes, so the
 * ported arithmetic is untouched — only the input changes.
 */

export const WEIGHT_LEVELS = [
  "none",
  "a little",
  "mid",
  "much",
  "completely",
] as const;

export type WeightLevel = (typeof WEIGHT_LEVELS)[number];

export const WEIGHT_VALUES: Record<WeightLevel, number> = {
  none: 0,
  "a little": 25,
  mid: 50,
  much: 75,
  completely: 100,
};

export function levelToWeight(level: WeightLevel): number {
  return WEIGHT_VALUES[level];
}

/** Nearest level to a raw 0..100 weight, for migrating stored numeric values. */
export function weightToLevel(value: number): WeightLevel {
  let best: WeightLevel = "mid";
  let bestDistance = Infinity;
  for (const level of WEIGHT_LEVELS) {
    const distance = Math.abs(WEIGHT_VALUES[level] - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = level;
    }
  }
  return best;
}

/** Level defaults matching DEFAULT_RANKING_CONFIG's 60/40 split. */
export const DEFAULT_PRICE_LEVEL: WeightLevel = "much";
export const DEFAULT_HOUR_LEVEL: WeightLevel = "mid";

/* ── Date preferences ───────────────────────────────────────────────────── */

/**
 * Set by the advanced calendar. Exclusions are absolute — an excluded date is
 * never searched. Priorities only break ties, via DATE_PRIORITY_BONUS.
 */
export interface DatePreferences {
  excluded: string[];
  /** ISO date -> 1..3. */
  priority: Record<string, number>;
}

export const DEFAULT_DATE_PREFERENCES: DatePreferences = {
  excluded: [],
  priority: {},
};
