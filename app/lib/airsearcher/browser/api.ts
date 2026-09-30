/**
 * The browser's side of `/api/airsearcher/browser`: one search per call, like
 * the cURL runner, so each row shows its own progress and Stop is immediate.
 * The answer has the cURL runner's shape, so the rest of the run is shared.
 */

import { errorInfo } from "@/lib/airsearcher/curl/errors";
import type { CurlRunResponse } from "@/lib/airsearcher/curl/api";
import type { GeneratedSearch } from "@/lib/airsearcher/curl/freq";

export const BROWSER_ROUTE = "/api/airsearcher/browser";

export async function requestBrowserRun(
  search: GeneratedSearch,
  index: number,
  signal?: AbortSignal,
): Promise<CurlRunResponse> {
  let response: Response;
  try {
    response = await fetch(BROWSER_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search, index }),
      signal,
    });
  } catch (error) {
    if (!signal?.aborted) console.log(error);
    if (signal?.aborted) return { ok: false, error: errorInfo("aborted", "The run was stopped.") };
    return {
      ok: false,
      error: errorInfo("not_available", "The local server couldn't be reached. Is “npm run dev” running?"),
    };
  }

  const body = await response.text().catch(() => "");
  const data = (() => {
    try {
      return JSON.parse(body) as CurlRunResponse | null;
    } catch {
      return null;
    }
  })();
  // A failed search: the server's whole answer, as it came.
  if (!response.ok || !data || typeof data !== "object" || !("ok" in data) || !data.ok) {
    console.log(data ?? body);
  }
  if (data && typeof data === "object" && "ok" in data) return data;
  return {
    ok: false,
    error: errorInfo(
      "not_available",
      response.status === 404
        ? "The search browser is only available on the local development server."
        : `The local server answered with HTTP ${response.status}.`,
    ),
  };
}
