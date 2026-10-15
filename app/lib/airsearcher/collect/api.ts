/**
 * The dashboard's side of `/api/airsearcher/collect`: it asks whether the
 * answer for one search has arrived from the user's own browser. The server
 * holds each ask open until something changes, so there is one request per
 * wait, not one per second. Nothing here contacts Google.
 */

import type { CurlRunResponse } from "@/lib/airsearcher/curl/api";
import { errorInfo } from "@/lib/airsearcher/curl/errors";
import type { GeneratedSearch } from "@/lib/airsearcher/curl/freq";

export const COLLECT_ROUTE = "/api/airsearcher/collect";

/** The pause before asking again after an error or an answer that came back at once. */
const RETRY_MS = 1000;

export type CollectPoll =
  | { state: "waiting" }
  /** Only the first page has arrived; "View more flights" has not been clicked. */
  | { state: "first" }
  | { state: "done"; response: CurlRunResponse };

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });
}

/**
 * Waits until the answer for `search` has arrived, then returns it in the same
 * shape as a request to Google would. `acceptFirst` is read on every ask, so
 * the row's "use first page" button can change it while waiting; `onFirst`
 * is told when the first page is in. `failed` gives up on the search, with
 * the reason, when it returns one (checked before each ask).
 */
export async function waitForCollected(
  search: GeneratedSearch,
  signal: AbortSignal,
  options: { acceptFirst: () => boolean; onFirst: () => void; failed?: () => string | null },
): Promise<CurlRunResponse> {
  const aborted = (): CurlRunResponse => ({ ok: false, error: errorInfo("aborted", "The run was stopped.") });
  let known: "waiting" | "first" = "waiting";
  while (!signal.aborted) {
    const reason = options.failed?.() ?? null;
    if (reason) return { ok: false, error: errorInfo("timeout", reason) };
    const asked = Date.now();
    const query = new URLSearchParams({
      from: search.from.join(","),
      to: search.to.join(","),
      date: search.date,
      acceptFirst: options.acceptFirst() ? "1" : "0",
      known,
    });
    try {
      const response = await fetch(`${COLLECT_ROUTE}?${query}`, { cache: "no-store", signal });
      const data = (await response.json().catch(() => null)) as CollectPoll | null;
      if (data?.state === "done") return data.response;
      if (data?.state === "first") {
        known = "first";
        options.onFirst();
      }
      // The server held this ask; one that came back at once isn't waited on again at once.
      if (Date.now() - asked > RETRY_MS) continue;
    } catch {
      if (signal.aborted) break;
      return {
        ok: false,
        error: errorInfo("not_available", "The local server couldn't be reached. Is “npm run dev” running?"),
      };
    }
    await pause(RETRY_MS, signal);
  }
  return aborted();
}
