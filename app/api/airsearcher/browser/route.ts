import {
  CURL_MAX_PER_RUN,
  CURL_RATE_LIMIT_COOLDOWN_MS,
} from "@/lib/airsearcher/config/curl";
import { PACING_SERVER_MIN_GAP_MS } from "@/lib/airsearcher/config/pacing";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import type { CurlRunResponse } from "@/lib/airsearcher/curl/api";
import { asCurlError, CurlError, errorInfo } from "@/lib/airsearcher/curl/errors";
import { validateSearch } from "@/lib/airsearcher/curl/generated";
import { abortableSleep, createGate, type Gate } from "@/lib/airsearcher/curl/server/gate";
import { parseShoppingResults } from "@/lib/airsearcher/curl/shopping";
import { searchInBrowser } from "@/lib/airsearcher/browser/searchInBrowser";
import { isoDate } from "@/lib/airsearcher/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs one Google Flights search in the hidden browser and returns its
 * flights, in the same shape as the cURL route.
 *
 * Local, single-user use only: it does not exist in production unless
 * explicitly enabled, and it only answers requests addressed to localhost.
 * The page plans the random gaps and longer pauses of a run; this gate is the
 * server's floor under them (never sooner than PACING_SERVER_MIN_GAP_MS after
 * the previous search) and holds the captcha cool-down. The only count limit
 * is CURL_MAX_PER_RUN searches per run; there is no hourly cap.
 */

const globalGate = globalThis as typeof globalThis & {
  __airsearcherBrowserGate?: Gate;
};
const gate = (globalGate.__airsearcherBrowserGate ??= createGate({
  minIntervalMs: PACING_SERVER_MIN_GAP_MS,
  jitterMs: 0,
  coolDownMs: CURL_RATE_LIMIT_COOLDOWN_MS,
  now: Date.now,
  sleep: abortableSleep,
  random: Math.random,
}));


const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(request: Request): string {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

function reply(body: CurlRunResponse, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.AIRSEARCH_ENABLE_CURL !== "1") {
    return new Response(null, { status: 404 });
  }
  if (!LOCAL_HOSTS.has(hostnameOf(request))) {
    return reply({ ok: false, error: errorInfo("not_available", "The search browser only answers on localhost.") }, 403);
  }

  let input: { search?: unknown; index?: unknown };
  try {
    input = ((await request.json()) ?? {}) as typeof input;
  } catch {
    return reply({ ok: false, error: errorInfo("parse_error", "Invalid JSON request.") }, 400);
  }

  try {
    const search = validateSearch(input.search, isoDate(new Date()));
    if (typeof input.index === "number" && input.index >= CURL_MAX_PER_RUN) {
      throw new CurlError("too_many", `At most ${CURL_MAX_PER_RUN} searches per run.`);
    }

    const { value: answer, waitedMs } = await gate.run(
      () => searchInBrowser(search, request.signal),
      request.signal,
    );

    const parsed = parseShoppingResults(answer.body, { currency: CURRENCY, passengers: 1 });
    const warnings: string[] = [];
    if (answer.list === "first") warnings.push("Google showed no “View more flights”, so only its first page was read.");
    if (parsed.unpriced > 0) warnings.push(`${parsed.unpriced} flights had no price.`);

    return reply({
      ok: true,
      flights: parsed.flights,
      currency: CURRENCY,
      httpStatus: answer.httpStatus,
      waitedMs,
      warnings,
    });
  } catch (caught) {
    const error = asCurlError(caught);
    if (error) {
      if (error.code === "rate_limited") gate.startCoolDown();
      const status =
        error.code === "browser_missing" ? 503
          : error.code === "rate_limited" || error.code === "cooling_down" ? 429
            : error.code === "aborted" ? 499
              : ["network", "timeout", "session_expired", "unrecognised_response"].includes(error.code) ? 502
                : 400;
      return reply({ ok: false, error: error.toInfo() }, status);
    }
    console.error("[airsearcher/browser] unexpected failure:", caught instanceof Error ? caught.name : "unknown");
    return reply({ ok: false, error: errorInfo("network", "The search couldn't be run.") }, 500);
  }
}
