/**
 * The waits of one run, planned before it starts so the page can show the
 * total time. Three layers, all random, so no two runs share a rhythm:
 *
 *   - a normal gap before every search but the first, mostly short with a
 *     long tail, scaled by the run's own tempo;
 *   - short pauses at random places instead of some gaps;
 *   - long breaks after every so many searches.
 *
 * The ranges are in `app/config/pacingConfig.ts`.
 *
 * Pure: `random` is injected, so the checks can pin it.
 */

import {
  PACING_BREAKS_ENABLED,
  PACING_BREAK_EVERY_MAX,
  PACING_BREAK_EVERY_MIN,
  PACING_BREAK_MAX_MS,
  PACING_BREAK_MIN_MS,
  PACING_GAP_MAX_MS,
  PACING_GAP_MIN_MS,
  PACING_GAP_SKEW,
  PACING_PAUSE_DIVISOR_MAX,
  PACING_PAUSE_DIVISOR_MIN,
  PACING_PAUSE_MAX_MS,
  PACING_PAUSE_MIN_MS,
  PACING_RETRY_MAX_MS,
  PACING_RETRY_MIN_MS,
  PACING_TEMPO_MAX,
  PACING_TEMPO_MIN,
} from "@/lib/airsearcher/config/pacing";

export interface RunSchedule {
  /** Wait before each search, in order; the first is always 0. */
  delaysMs: number[];
  /** Which searches start after a longer wait: a short pause or a long break. */
  pauseAt: Set<number>;
  /** Which of those are long breaks. */
  breakAt: Set<number>;
  /** The divisor drawn for this run (searches ÷ divisor = short pauses). */
  divisor: number;
  /** This run's tempo: the factor on every normal gap. */
  tempo: number;
}

/** A whole number from min to max, both included. */
function wholeBetween(min: number, max: number, random: () => number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function planSchedule(count: number, random: () => number = Math.random): RunSchedule {
  const tempo = PACING_TEMPO_MIN + random() * (PACING_TEMPO_MAX - PACING_TEMPO_MIN);

  // Long breaks: after every so many searches, each interval drawn anew.
  const breakAt = new Set<number>();
  for (
    let at = wholeBetween(PACING_BREAK_EVERY_MIN, PACING_BREAK_EVERY_MAX, random);
    PACING_BREAKS_ENABLED && at < count;
    at += wholeBetween(PACING_BREAK_EVERY_MIN, PACING_BREAK_EVERY_MAX, random)
  ) {
    breakAt.add(at);
  }

  const divisor = wholeBetween(PACING_PAUSE_DIVISOR_MIN, PACING_PAUSE_DIVISOR_MAX, random);
  // Short pauses go in the gaps (searches 1 … count − 1) a break doesn't take.
  const places = Array.from({ length: Math.max(0, count - 1) }, (_, i) => i + 1).filter((i) => !breakAt.has(i));
  const pauses = Math.min(places.length, Math.ceil(count / divisor));
  for (let i = places.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [places[i], places[j]] = [places[j], places[i]];
  }
  const shortAt = new Set(places.slice(0, pauses));

  const delaysMs = Array.from({ length: count }, (_, index) => {
    if (index === 0) return 0;
    if (breakAt.has(index)) return wholeBetween(PACING_BREAK_MIN_MS, PACING_BREAK_MAX_MS, random);
    if (shortAt.has(index)) return wholeBetween(PACING_PAUSE_MIN_MS, PACING_PAUSE_MAX_MS, random);
    // Mostly near the short end, now and then much longer.
    const gap = PACING_GAP_MIN_MS + (PACING_GAP_MAX_MS - PACING_GAP_MIN_MS) * random() ** PACING_GAP_SKEW;
    return Math.round(gap * tempo);
  });

  return { delaysMs, pauseAt: new Set([...shortAt, ...breakAt]), breakAt, divisor, tempo };
}

/** The wait before retrying a search Google refused: a random 3–6 minutes. */
export function retryDelayMs(random: () => number = Math.random): number {
  return wholeBetween(PACING_RETRY_MIN_MS, PACING_RETRY_MAX_MS, random);
}

/** The run's expected length: every wait plus `searchMs`, a typical search, each. */
export function scheduleTotalMs(schedule: RunSchedule, searchMs: number): number {
  const waits = schedule.delaysMs.reduce((sum, ms) => sum + ms, 0);
  return waits + schedule.delaysMs.length * searchMs;
}
