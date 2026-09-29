/**
 * Ranking defaults.
 *
 * Ported from the reference project (`serpAPItest/my-app/config/ranking.ts`)
 * unchanged, so AirSearcher weights flights exactly as that project does. The
 * addition is the stops weight, set with price and hours in the sidebar.
 *
 * Curves hold exactly 24 values, one per hour of the day, each 0..100, where
 * 100 means "ideal time to fly" and 0 means "avoid".
 */

/** Exactly 24 values, 0..100. Index = hour of day (0 = 00:00, 23 = 23:00). */
export type HourCurve = number[];

export interface RankingWeights {
  /** Relative importance of few stops. */
  stops: number;
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
  // The same split as DEFAULT_SCORE_WEIGHTS below.
  weights: {
    stops: 40,
    price: 30,
    hour: 30,
  },
  departureArrivalRatio: 0.65,
  curves: {
    outbound: DEFAULT_OUTBOUND_CURVE,
    return: DEFAULT_RETURN_CURVE,
  },
};

/* ── Score weights ──────────────────────────────────────────────────────────
 * Stops, price and hours share a result's score. The sidebar sets them with
 * three linked sliders that always add up to 100.
 */

/** Stops 40 %, price 30 %, hours 30 %. */
export const DEFAULT_SCORE_WEIGHTS: RankingWeights = { stops: 40, price: 30, hour: 30 };

/**
 * Moves one weight to `value` (0..100) and shares the rest between the other
 * two in the proportion they had, so the three still add up to 100. When both
 * others were 0 they split the rest evenly. Whole numbers only.
 */
export function rebalanceWeights(
  weights: RankingWeights,
  key: keyof RankingWeights,
  value: number,
): RankingWeights {
  const fixed = Math.min(Math.max(Math.round(value), 0), 100);
  const [a, b] = (["stops", "price", "hour"] as const).filter((k) => k !== key);
  const rest = 100 - fixed;
  const before = Math.max(weights[a], 0) + Math.max(weights[b], 0);
  const shareA = before === 0 ? rest / 2 : (rest * Math.max(weights[a], 0)) / before;
  const roundedA = Math.round(shareA);
  return { ...weights, [key]: fixed, [a]: roundedA, [b]: rest - roundedA };
}

/** Whether a stored value is three usable weights; older saves had levels instead. */
export function isRankingWeights(value: unknown): value is RankingWeights {
  const w = value as Partial<RankingWeights> | null;
  return (
    typeof w === "object" &&
    w !== null &&
    [w.stops, w.price, w.hour].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) &&
    (w.stops ?? 0) + (w.price ?? 0) + (w.hour ?? 0) > 0
  );
}

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
