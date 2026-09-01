/**
 * Building itineraries for ONE origin/destination pair.
 *
 * Ported from the reference project. The scoring arithmetic is NOT
 * reimplemented here — `priceIndex`, `legHourIndex` and `normalizeWeights` come
 * from `ranking.ts` unchanged, and are called identically whether an itinerary
 * has one flight or two.
 *
 * Group assembly across several origins is a separate concern; see
 * `grouping.ts`.
 */

import type {
  RankingPreferences,
  ResultLimits,
} from "@/lib/airsearcher/config/ranking";
import { DEFAULT_RESULT_LIMITS } from "@/lib/airsearcher/config/ranking";
import { legsOf, type Itinerary, type NormalizedFlight } from "@/lib/airsearcher/types";
import {
  compareNullable,
  legHourIndex,
  meanOf,
  normalizeWeights,
  priceIndex,
  type SortMode,
} from "@/lib/airsearcher/ranking";

export interface ScoredItinerary {
  itinerary: Itinerary;
  /** 0..1, higher is better. */
  score: number;
  priceIndex: number;
  hourIndex: number | null;
  outboundHourIndex: number | null;
  returnHourIndex: number | null;
  effectiveWeights: { price: number; hour: number };
}

/** Cheapest first; a missing price sorts last. */
function byPrice(a: NormalizedFlight, b: NormalizedFlight): number {
  return compareNullable(a.price, b.price, "asc");
}

/**
 * Builds the itineraries to rank: one per outbound flight when there is no
 * return list, or every outbound/return pair when there is.
 *
 * Each direction is capped first, keeping the cheapest, so the pair count stays
 * bounded (40 x 40 = 1,600 by default) however many flights come back.
 */
export function buildItineraries(
  outbound: NormalizedFlight[],
  returning: NormalizedFlight[] | null,
  limits: ResultLimits = DEFAULT_RESULT_LIMITS,
): Itinerary[] {
  const outboundPool = [...outbound].sort(byPrice).slice(0, limits.maxPerDirection);

  if (!returning || returning.length === 0) {
    return outboundPool.map((flight) => ({
      id: flight.id,
      outbound: flight,
      return: null,
      totalPrice: flight.price ?? 0,
    }));
  }

  const returnPool = [...returning].sort(byPrice).slice(0, limits.maxPerDirection);

  const pairs: Itinerary[] = [];
  for (const out of outboundPool) {
    for (const back of returnPool) {
      pairs.push({
        id: `${out.id}|${back.id}`,
        outbound: out,
        return: back,
        totalPrice: (out.price ?? 0) + (back.price ?? 0),
      });
    }
  }
  return pairs;
}

/**
 * Scores every itinerary. Input order is preserved; sorting is separate.
 *
 * A one-flight itinerary scores exactly as `scoreFlights` would score the same
 * flight — the two paths run the same arithmetic.
 */
export function scoreItineraries(
  itineraries: Itinerary[],
  preferences: RankingPreferences,
): ScoredItinerary[] {
  const prices = itineraries
    .map((it) => it.totalPrice)
    .filter((p) => Number.isFinite(p));

  const min = prices.length > 0 ? Math.min(...prices) : 0;
  const max = prices.length > 0 ? Math.max(...prices) : 0;

  const base = normalizeWeights(preferences.weights);
  const { departureArrivalRatio, curves } = preferences;

  return itineraries.map((itinerary) => {
    const outboundHourIndex = legHourIndex(
      itinerary.outbound.outbound,
      curves.outbound,
      departureArrivalRatio,
    );
    const returnHourIndex = itinerary.return
      ? legHourIndex(itinerary.return.outbound, curves.return, departureArrivalRatio)
      : null;

    const hourIndex = meanOf([outboundHourIndex, returnHourIndex]);
    const price = priceIndex(itinerary.totalPrice, min, max);

    // With no usable hour index the hour term would silently read as zero
    // convenience, which is a lie. Drop it and give price the full weight.
    const effectiveWeights = hourIndex === null ? { price: 1, hour: 0 } : base;

    return {
      itinerary,
      score: price * effectiveWeights.price + (hourIndex ?? 0) * effectiveWeights.hour,
      priceIndex: price,
      hourIndex,
      outboundHourIndex,
      returnHourIndex,
      effectiveWeights,
    };
  });
}

/** Returns a new array; never mutates the input. */
export function sortItineraries(
  scored: ScoredItinerary[],
  mode: SortMode,
): ScoredItinerary[] {
  const copy = [...scored];

  switch (mode) {
    case "price":
      return copy.sort((a, b) =>
        compareNullable(a.itinerary.totalPrice, b.itinerary.totalPrice, "asc"),
      );
    case "hour":
      return copy.sort((a, b) => compareNullable(a.hourIndex, b.hourIndex, "desc"));
    case "score":
      return copy.sort((a, b) => b.score - a.score);
    case "original":
    default:
      return copy;
  }
}

export interface SelectionResult {
  selected: ScoredItinerary[];
  /** How many were dropped by the per-outbound cap rather than the limit. */
  suppressed: number;
}

/**
 * Takes the first `limit` itineraries, allowing at most `maxPerOutbound` that
 * share an outbound flight.
 *
 * Without the cap one attractive outbound tends to fill the list paired with
 * near-identical returns, hiding genuinely different options. Applied to an
 * already-sorted list, so it respects whichever order the caller chose.
 */
export function selectTop(
  scored: ScoredItinerary[],
  limits: ResultLimits = DEFAULT_RESULT_LIMITS,
): SelectionResult {
  const perOutbound = new Map<string, number>();
  const selected: ScoredItinerary[] = [];
  let suppressed = 0;

  for (const entry of scored) {
    if (selected.length >= limits.limit) break;

    const key = entry.itinerary.outbound.id;
    const used = perOutbound.get(key) ?? 0;
    if (used >= limits.maxPerOutbound) {
      suppressed++;
      continue;
    }

    perOutbound.set(key, used + 1);
    selected.push(entry);
  }

  return { selected, suppressed };
}

/** Every airline name appearing in the given itineraries. */
export function airlinesIn(itineraries: Itinerary[]): string[] {
  const names = new Set<string>();
  for (const itinerary of itineraries) {
    for (const flight of legsOf(itinerary)) {
      if (flight.airline.name) names.add(flight.airline.name);
    }
  }
  return [...names].sort();
}
