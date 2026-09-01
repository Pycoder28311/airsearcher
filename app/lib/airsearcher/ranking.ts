/**
 * Pure scoring.
 *
 * Ported unchanged from the reference project (`serpAPItest/my-app/lib/ranking.ts`)
 * apart from import paths: this is the weighting logic AirSearcher is required
 * to reuse rather than reinvent. No React, no storage, no network — everything
 * is a function of its arguments, so it can be re-run cheaply on every change.
 */

import type {
  HourCurve,
  RankingPreferences,
  RankingWeights,
} from "@/lib/airsearcher/config/ranking";
import type { NormalizedFlight, NormalizedLeg } from "@/lib/airsearcher/types";

/** Flight times arrive as "YYYY-MM-DD HH:MM". */
const FLIGHT_TIME_RE = /(\d{1,2}):(\d{2})\s*$/;

/**
 * Extracts a fractional hour (0 <= h < 24) from a flight time string.
 * Returns null when the value is missing or does not contain a valid time.
 */
export function parseFlightHour(time: string | null | undefined): number | null {
  if (typeof time !== "string") return null;
  const match = FLIGHT_TIME_RE.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;

  return hours + minutes / 60;
}

function isValidCurve(curve: HourCurve): boolean {
  return Array.isArray(curve) && curve.length === 24;
}

/**
 * Reads a curve at the given time, interpolating between the two adjacent
 * hour bars so 08:30 lands halfway between bar 8 and bar 9. Bar 23
 * interpolates round to bar 0. Returns 0..1, or null if the time or the curve
 * is unusable.
 */
export function hourValue(
  curve: HourCurve,
  time: string | null | undefined,
): number | null {
  if (!isValidCurve(curve)) return null;

  const fractionalHour = parseFlightHour(time);
  if (fractionalHour === null) return null;

  const lowerHour = Math.floor(fractionalHour);
  const upperHour = (lowerHour + 1) % 24;
  const fraction = fractionalHour - lowerHour;

  const interpolated =
    curve[lowerHour] * (1 - fraction) + curve[upperHour] * fraction;

  return interpolated / 100;
}

/**
 * Convenience index for one leg: a blend of when it leaves and when it lands.
 * `departureArrivalRatio` is the share given to departure (1 = departure only,
 * 0 = arrival only). If only one of the two times is usable it takes the full
 * weight. Returns 0..1, or null if neither time is usable.
 */
export function legHourIndex(
  leg: NormalizedLeg,
  curve: HourCurve,
  departureArrivalRatio: number,
): number | null {
  const first = leg.segments[0];
  const last = leg.segments[leg.segments.length - 1];
  if (!first || !last) return null;

  const departureValue = hourValue(curve, first.departure.time);
  const arrivalValue = hourValue(curve, last.arrival.time);

  if (departureValue === null && arrivalValue === null) return null;
  if (arrivalValue === null) return departureValue;
  if (departureValue === null) return arrivalValue;

  const ratio = Math.min(Math.max(departureArrivalRatio, 0), 1);
  return departureValue * ratio + arrivalValue * (1 - ratio);
}

/**
 * Price as a 0..1 index relative to the current result set: the cheapest
 * scores 1, the dearest 0. When everything costs the same they all score 1 —
 * nothing is penalised for a spread that does not exist. A missing price
 * scores 0.
 */
export function priceIndex(
  price: number | null,
  min: number,
  max: number,
): number {
  if (price === null || !Number.isFinite(price)) return 0;
  if (!(max > min)) return 1;

  const normalized = (max - price) / (max - min);
  return Math.min(Math.max(normalized, 0), 1);
}

export interface ScoredFlight {
  flight: NormalizedFlight;
  /** 0..1, higher is better. */
  score: number;
  priceIndex: number;
  /** null when no leg had a usable time. */
  hourIndex: number | null;
  outboundHourIndex: number | null;
  returnHourIndex: number | null;
  missingPrice: boolean;
  /** The weights actually applied, after any renormalisation. */
  effectiveWeights: { price: number; hour: number };
}

export type SortMode = "score" | "price" | "hour" | "original";

/**
 * Scales the configured weights so they sum to 1. Negative values are treated
 * as zero; if that leaves nothing, an even split is used so the ranking stays
 * meaningful instead of dividing by zero.
 */
export function normalizeWeights(weights: RankingWeights): {
  price: number;
  hour: number;
} {
  const price = Math.max(weights.price, 0);
  const hour = Math.max(weights.hour, 0);
  const total = price + hour;

  if (total === 0) return { price: 0.5, hour: 0.5 };
  return { price: price / total, hour: hour / total };
}

export function meanOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

/**
 * Scores every flight against the given preferences. Input order is preserved;
 * sorting is a separate step.
 */
export function scoreFlights(
  flights: NormalizedFlight[],
  preferences: RankingPreferences,
): ScoredFlight[] {
  const prices = flights
    .map((f) => f.price)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));

  const min = prices.length > 0 ? Math.min(...prices) : 0;
  const max = prices.length > 0 ? Math.max(...prices) : 0;

  const base = normalizeWeights(preferences.weights);
  const { departureArrivalRatio, curves } = preferences;

  return flights.map((flight) => {
    const outboundHourIndex = legHourIndex(
      flight.outbound,
      curves.outbound,
      departureArrivalRatio,
    );
    const returnHourIndex = flight.return
      ? legHourIndex(flight.return, curves.return, departureArrivalRatio)
      : null;

    const hourIndex = meanOf([outboundHourIndex, returnHourIndex]);
    const price = priceIndex(flight.price, min, max);

    // With no usable hour index the hour term would silently read as zero
    // convenience, which is a lie. Drop it and give price the full weight.
    const effectiveWeights = hourIndex === null ? { price: 1, hour: 0 } : base;

    const score =
      price * effectiveWeights.price + (hourIndex ?? 0) * effectiveWeights.hour;

    return {
      flight,
      score,
      priceIndex: price,
      hourIndex,
      outboundHourIndex,
      returnHourIndex,
      missingPrice: flight.price === null,
      effectiveWeights,
    };
  });
}

/** Nulls always sort last, whichever direction the mode runs in. */
export function compareNullable(
  a: number | null,
  b: number | null,
  direction: "asc" | "desc",
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

/** Returns a new array; never mutates the input. */
export function sortFlights(
  scored: ScoredFlight[],
  mode: SortMode,
): ScoredFlight[] {
  const copy = [...scored];

  switch (mode) {
    case "price":
      return copy.sort((a, b) =>
        compareNullable(a.flight.price, b.flight.price, "asc"),
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
