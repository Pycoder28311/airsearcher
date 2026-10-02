/**
 * Pacing between Google Flights searches in the hidden browser, planned in
 * the page before a run starts.
 *
 * The values live in `app/config/pacingConfig.ts`, in seconds and minutes,
 * so they are easy to edit; this file only turns them into the milliseconds
 * and names the code uses.
 */

import { pacingConfig } from "@/config/pacingConfig";

const SECOND = 1_000;

/** The normal wait before each search, skewed towards its short end by this power. */
export const PACING_GAP_MIN_MS = pacingConfig.gap.minSeconds * SECOND;
export const PACING_GAP_MAX_MS = pacingConfig.gap.maxSeconds * SECOND;
export const PACING_GAP_SKEW = pacingConfig.gap.skew;

/** Each run's factor on every normal gap. */
export const PACING_TEMPO_MIN = pacingConfig.tempo.min;
export const PACING_TEMPO_MAX = pacingConfig.tempo.max;

/** Short pauses: searches ÷ a random divisor in this range, rounded up, each this long. */
export const PACING_PAUSE_DIVISOR_MIN = pacingConfig.pause.everySearchesMin;
export const PACING_PAUSE_DIVISOR_MAX = pacingConfig.pause.everySearchesMax;
export const PACING_PAUSE_MIN_MS = pacingConfig.pause.minSeconds * SECOND;
export const PACING_PAUSE_MAX_MS = pacingConfig.pause.maxSeconds * SECOND;

/** Long breaks: after every so many searches, each this long; none when switched off. */
export const PACING_BREAKS_ENABLED = pacingConfig.longBreak.enabled;
export const PACING_BREAK_EVERY_MIN = pacingConfig.longBreak.everySearchesMin;
export const PACING_BREAK_EVERY_MAX = pacingConfig.longBreak.everySearchesMax;
export const PACING_BREAK_MIN_MS = pacingConfig.longBreak.minSeconds * SECOND;
export const PACING_BREAK_MAX_MS = pacingConfig.longBreak.maxSeconds * SECOND;

/** The wait before retrying a search Google refused. */
export const PACING_RETRY_MIN_MS = pacingConfig.retry.minSeconds * SECOND;
export const PACING_RETRY_MAX_MS = pacingConfig.retry.maxSeconds * SECOND;

/**
 * The server's floor: it never starts a search sooner than this after the
 * previous one, whatever the page asks. The shortest gap at the briskest tempo.
 */
export const PACING_SERVER_MIN_GAP_MS = PACING_GAP_MIN_MS * PACING_TEMPO_MIN;
