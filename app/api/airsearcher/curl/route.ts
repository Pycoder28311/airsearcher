import {
  CURL_JITTER_MS,
  CURL_MAX_COMMAND_BYTES,
  CURL_MAX_PER_HOUR,
  CURL_MAX_PER_RUN,
  CURL_MAX_RESPONSE_BYTES,
  CURL_MIN_INTERVAL_MS,
  CURL_RATE_LIMIT_COOLDOWN_MS,
  CURL_REQID_STEP,
  CURL_TIMEOUT_MS,
} from "@/lib/airsearcher/config/curl";
import type { CurlRunResponse } from "@/lib/airsearcher/curl/api";
import { buildCurlArgs, withRequestId } from "@/lib/airsearcher/curl/args";
import { rewriteSearch } from "@/lib/airsearcher/curl/freq";
import { validateSearch } from "@/lib/airsearcher/curl/generated";
import { createHourlyCap, type HourlyCap } from "@/lib/airsearcher/curl/server/hourlyCap";
import { isoDate } from "@/lib/airsearcher/time";
import { checkResponse } from "@/lib/airsearcher/curl/classify";
import { CurlError, errorInfo } from "@/lib/airsearcher/curl/errors";
import { abortableSleep, createGate, type Gate } from "@/lib/airsearcher/curl/server/gate";
import { runCurl } from "@/lib/airsearcher/curl/server/run";
import { parseShoppingResults } from "@/lib/airsearcher/curl/shopping";
import { prepareCurl } from "@/lib/airsearcher/curl/validate";
import { CURRENCY } from "@/lib/airsearcher/config/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs one pasted Google Flights cURL with the local curl binary.
 *
 * Local, single-user use only: the route does not exist in production unless
 * explicitly enabled, and it only answers requests addressed to localhost.
 * The pasted text holds the user's Google session, so it is never logged and
 * never echoed back — errors describe the problem, not the input.
 */

// Kept on globalThis so a dev-server hot reload doesn't reset the pacing.
const globalGate = globalThis as typeof globalThis & {
  __airsearcherCurlGate?: Gate;
  __airsearcherCurlHourlyCap?: HourlyCap;
};
const gate = (globalGate.__airsearcherCurlGate ??= createGate({
  minIntervalMs: CURL_MIN_INTERVAL_MS,
  jitterMs: CURL_JITTER_MS,
  coolDownMs: CURL_RATE_LIMIT_COOLDOWN_MS,
  now: Date.now,
  sleep: abortableSleep,
  random: Math.random,
}));
const hourlyCap = (globalGate.__airsearcherCurlHourlyCap ??= createHourlyCap({
  max: CURL_MAX_PER_HOUR,
  windowMs: 60 * 60 * 1000,
  now: Date.now,
}));

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function reply(body: CurlRunResponse, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(error: CurlError, status: number): Response {
  return reply({ ok: false, error: error.toInfo() }, status);
}

function hostnameOf(request: Request): string {
  const host = request.headers.get("host") ?? "";
  // "[::1]:3000" → "[::1]", "localhost:3000" → "localhost"
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.AIRSEARCH_ENABLE_CURL !== "1") {
    return new Response(null, { status: 404 });
  }
  if (!LOCAL_HOSTS.has(hostnameOf(request))) {
    return reply(
      { ok: false, error: errorInfo("not_available", "The cURL runner only answers on localhost.") },
      403,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(new CurlError("parse_error", "Invalid JSON request."), 400);
  }
  const input = (body ?? {}) as { curl?: unknown; search?: unknown; index?: unknown };
  const curl = input.curl;
  if (typeof curl !== "string") return fail(new CurlError("empty", "No cURL was sent."), 400);
  if (curl.length > CURL_MAX_COMMAND_BYTES) {
    return fail(new CurlError("parse_error", "The cURL is too long."), 413);
  }

  try {
    // Validated again here: the server never trusts the browser's check.
    // With a `search`, the cURL is only a session: its search is replaced by
    // one built from the app's inputs, and that is what gets sent.
    const generated = input.search !== undefined;
    const base = prepareCurl(curl, { mode: generated ? "template" : "search" });
    let prepared = base;
    if (generated) {
      const search = validateSearch(input.search, isoDate(new Date()));
      const index =
        typeof input.index === "number" && Number.isInteger(input.index) && input.index >= 0 && input.index < CURL_MAX_PER_RUN
          ? input.index
          : 0;
      prepared = {
        ...base,
        url: withRequestId(base.url, index, CURL_REQID_STEP),
        body: rewriteSearch(base.body, search),
        search: { tripType: "one-way", passengers: 1, legs: [{ from: search.from, to: search.to, date: search.date }] },
      };
    }
    const args = buildCurlArgs(prepared, {
      timeoutMs: CURL_TIMEOUT_MS,
      maxBytes: CURL_MAX_RESPONSE_BYTES,
    });

    const { value: output, waitedMs } = await gate.run(
      async () => {
        // Counted when it is actually sent, so waiting in line costs nothing.
        if (generated) hourlyCap.take();
        return runCurl(args, {
          timeoutMs: CURL_TIMEOUT_MS,
          maxBytes: CURL_MAX_RESPONSE_BYTES,
          signal: request.signal,
        });
      },
      request.signal,
    );

    try {
      checkResponse(output);
    } catch (error) {
      if (error instanceof CurlError && error.code === "rate_limited") gate.startCoolDown();
      throw error;
    }

    const parsed = parseShoppingResults(output.body, {
      currency: prepared.currency ?? CURRENCY,
      passengers: prepared.search?.passengers ?? 1,
    });

    const warnings = [...prepared.warnings];
    if (prepared.currency && prepared.currency !== CURRENCY) {
      warnings.push(`Prices are in ${prepared.currency}, while the rest of the app shows ${CURRENCY}.`);
    }
    if (parsed.unpriced > 0) warnings.push(`${parsed.unpriced} flights had no price.`);

    return reply({
      ok: true,
      flights: parsed.flights,
      currency: prepared.currency ?? CURRENCY,
      httpStatus: output.httpStatus,
      waitedMs,
      warnings,
    });
  } catch (error) {
    if (error instanceof CurlError) {
      const status =
        error.code === "curl_missing" ? 503
          : error.code === "rate_limited" || error.code === "cooling_down" ? 429
            : error.code === "aborted" ? 499
              : ["network", "timeout", "session_expired", "http_error", "unrecognised_response", "too_large"]
                  .includes(error.code) ? 502
                : 400;
      return fail(error, status);
    }
    // Deliberately generic: an unexpected error must not leak the input.
    console.error("[airsearcher/curl] unexpected failure:", error instanceof Error ? error.name : "unknown");
    return fail(new CurlError("network", "The cURL couldn't be run."), 500);
  }
}
