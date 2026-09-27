/**
 * A rolling cap on generated searches per hour. Server-only.
 *
 * Pasted per-search cURLs don't count: this guards only the searches the app
 * builds itself, which are the ones the user never ran in a browser.
 */

import { CurlError } from "@/lib/airsearcher/curl/errors";

export interface HourlyCap {
  /** Throws when the cap is reached; otherwise records one request. */
  take(): void;
  remaining(): number;
}

export function createHourlyCap(options: { max: number; windowMs: number; now: () => number }): HourlyCap {
  let stamps: number[] = [];
  const prune = () => {
    const since = options.now() - options.windowMs;
    stamps = stamps.filter((stamp) => stamp > since);
  };

  return {
    take() {
      prune();
      if (stamps.length >= options.max) {
        const wait = stamps[0] + options.windowMs - options.now();
        throw new CurlError(
          "cooling_down",
          `The limit of ${options.max} generated searches per hour is reached. Try again in ${Math.ceil(wait / 60_000)} min.`,
        );
      }
      stamps.push(options.now());
    },
    remaining() {
      prune();
      return Math.max(0, options.max - stamps.length);
    },
  };
}
