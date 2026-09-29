/**
 * The waits of one run, planned before it starts so the page can show the
 * total time: a random normal gap before every search but the first, and a
 * few longer pauses at random places instead of some of those gaps.
 *
 * Pure: `random` is injected, so the checks can pin it.
 */

import {
  PACING_GAP_MAX_MS,
  PACING_GAP_MIN_MS,
  PACING_PAUSE_DIVISOR_MAX,
  PACING_PAUSE_DIVISOR_MIN,
  PACING_PAUSE_MAX_MS,
  PACING_PAUSE_MIN_MS,
  PACING_RETRY_MAX_MS,
  PACING_RETRY_MIN_MS,
} from "@/lib/airsearcher/config/pacing";

export interface RunSchedule {
  /** Wait before each search, in order; the first is always 0. */
  delaysMs: number[];
  /** Which searches start after a longer pause. */
  pauseAt: Set<number>;
  /** The divisor drawn for this run (searches ÷ divisor = pauses). */
  divisor: number;
}

/** A whole number from min to max, both included. */
function wholeBetween(min: number, max: number, random: () => number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function planSchedule(count: number, random: () => number = Math.random): RunSchedule {
  const divisor = wholeBetween(PACING_PAUSE_DIVISOR_MIN, PACING_PAUSE_DIVISOR_MAX, random);
  // Pauses only fit between searches, so there are at most count − 1 of them.
  const pauses = Math.min(Math.max(0, count - 1), Math.ceil(count / divisor));

  // Random distinct places among the gaps (searches 1 … count − 1).
  const places = Array.from({ length: Math.max(0, count - 1) }, (_, i) => i + 1);
  for (let i = places.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [places[i], places[j]] = [places[j], places[i]];
  }
  const pauseAt = new Set(places.slice(0, pauses));

  const delaysMs = Array.from({ length: count }, (_, index) => {
    if (index === 0) return 0;
    return pauseAt.has(index)
      ? wholeBetween(PACING_PAUSE_MIN_MS, PACING_PAUSE_MAX_MS, random)
      : wholeBetween(PACING_GAP_MIN_MS, PACING_GAP_MAX_MS, random);
  });

  return { delaysMs, pauseAt, divisor };
}

/** The wait before retrying a search Google refused: a random 40–80 s. */
export function retryDelayMs(random: () => number = Math.random): number {
  return wholeBetween(PACING_RETRY_MIN_MS, PACING_RETRY_MAX_MS, random);
}

/** The run's expected length: every wait plus `searchMs`, a typical search, each. */
export function scheduleTotalMs(schedule: RunSchedule, searchMs: number): number {
  const waits = schedule.delaysMs.reduce((sum, ms) => sum + ms, 0);
  return waits + schedule.delaysMs.length * searchMs;
}
