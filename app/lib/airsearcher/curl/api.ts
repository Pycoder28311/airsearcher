/**
 * The contract between the browser and `/api/airsearcher/curl`, and the
 * browser's side of it.
 *
 * One cURL per call: the browser loops over the rows, which keeps each call
 * short, makes Stop immediate and shows progress per row. The server still
 * paces the calls itself, so nothing the browser does can make them burst.
 */

import { errorInfo, type CurlErrorInfo } from "@/lib/airsearcher/curl/errors";
import type { GeneratedSearch } from "@/lib/airsearcher/curl/freq";
import type { NormalizedFlight } from "@/lib/airsearcher/types";

export const CURL_ROUTE = "/api/airsearcher/curl";

export interface CurlRunRequest {
  curl: string;
  /**
   * When set, the cURL is only a session and this search is sent instead.
   * `index` is the search's position in the run (moves the request id on).
   */
  search?: GeneratedSearch;
  index?: number;
}

export type CurlRunResponse =
  | {
      ok: true;
      flights: NormalizedFlight[];
      currency: string;
      httpStatus: number;
      /** How long the server held this request back to keep the pace. */
      waitedMs: number;
      warnings: string[];
    }
  | { ok: false; error: CurlErrorInfo };

export async function requestCurlRun(
  curl: string,
  signal?: AbortSignal,
  generated?: { search: GeneratedSearch; index: number },
): Promise<CurlRunResponse> {
  let response: Response;
  try {
    response = await fetch(CURL_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ curl, ...generated } satisfies CurlRunRequest),
      signal,
    });
  } catch {
    if (signal?.aborted) return { ok: false, error: errorInfo("aborted", "The run was stopped.") };
    return {
      ok: false,
      error: errorInfo("not_available", "The local server couldn't be reached. Is “npm run dev” running?"),
    };
  }

  const data = (await response.json().catch(() => null)) as CurlRunResponse | null;
  if (data && typeof data === "object" && "ok" in data) return data;
  return {
    ok: false,
    error: errorInfo(
      "not_available",
      response.status === 404
        ? "The cURL runner is only available on the local development server."
        : `The local server answered with HTTP ${response.status}.`,
    ),
  };
}
