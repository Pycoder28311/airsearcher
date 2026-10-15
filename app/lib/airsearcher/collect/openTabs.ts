/**
 * OPTIONAL — asks the collector extension to open each search's Google Flights
 * page in the user's browser when collecting starts, one tab at a time: it
 * collects Google's first page, closes the tab, and a few seconds later opens
 * the next. Separate on purpose: to remove it, delete this file and the lines marked
 * "tab opener" in `useCollectRun.ts` (plus the extension's opener files).
 *
 * The page talks to the extension through `window.postMessage`; the
 * extension's relay on this page answers when it has heard. Without the
 * extension nothing answers and the links are opened by hand, as before.
 */

import type { GeneratedJob } from "@/lib/airsearcher/curl/generated";
import { airports, googleFlightsSearchUrl } from "@/lib/airsearcher/curl/googleLink";

/** The wait between a tab closing and the next one opening, in milliseconds. */
export const TAB_DELAY_MS = 3000;
/** Each wait is drawn at random within this much either side of TAB_DELAY_MS (3 s ± 1 s). */
export const TAB_DELAY_JITTER_MS = 1000;

/** How long to wait for the extension to say it heard the request. */
const ANSWER_WAIT_MS = 1500;

export function searchUrlOf(job: GeneratedJob): string {
  return googleFlightsSearchUrl({
    from: airports(job.search.from),
    to: airports(job.search.to),
    date: job.search.date,
  });
}

/**
 * Starts opening `jobs`' searches, one tab at a time. With `fullList` the
 * extension also clicks "View more flights" in each tab and waits for the full
 * list; without it, only Google's first page is collected and nothing is
 * clicked. True when the extension answered.
 */
export function openSearchTabs(jobs: GeneratedJob[], fullList: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (heard: boolean) => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(heard);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; reply?: { ok?: boolean } } | null;
      if (event.source === window && data?.source === "airsearch-extension" && data.type === "open-tabs") {
        finish(data.reply?.ok === true);
      }
    };
    const timer = setTimeout(() => finish(false), ANSWER_WAIT_MS);
    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: "airsearch-dashboard", type: "open-tabs", urls: jobs.map(searchUrlOf), delayMs: TAB_DELAY_MS, jitterMs: TAB_DELAY_JITTER_MS, fullList },
      "*",
    );
  });
}

/**
 * Calls `handler` with the index of a search whose tab ended without the answer
 * wanted: "tab-failed" (closed by hand, or no answer in time) or "tab-first-only"
 * (the full list never came, so the first page is the result). Returns how to stop listening.
 */
export function onSearchTabEnded(handler: (type: "tab-failed" | "tab-first-only", index: number) => void): () => void {
  const listener = (event: MessageEvent) => {
    const data = event.data as { source?: string; type?: string; index?: unknown } | null;
    if (
      event.source === window &&
      data?.source === "airsearch-extension" &&
      (data.type === "tab-failed" || data.type === "tab-first-only") &&
      typeof data.index === "number"
    ) {
      handler(data.type, data.index);
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/** Stops the run's tabs: those not opened yet, and the one being waited on. */
export function cancelSearchTabs(): void {
  window.postMessage({ source: "airsearch-dashboard", type: "cancel-tabs" }, "*");
}
