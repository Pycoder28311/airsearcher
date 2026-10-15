import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { collectKey, explainRequest, putAnswer, takeAnswer, waitForChange } from "@/lib/airsearcher/collect/store";
import type { CollectPoll } from "@/lib/airsearcher/collect/api";
import type { CurlRunResponse } from "@/lib/airsearcher/curl/api";
import { asCurlError, errorInfo } from "@/lib/airsearcher/curl/errors";
import { parseShoppingResults } from "@/lib/airsearcher/curl/shopping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The answers the user's own browser caught, for the "collect" mode.
 *
 *   POST → { request, response }: the collector extension sends one
 *          GetShoppingResults answer with the search form it answered
 *   GET  ?from=A,B&to=C&date=2026-10-28[&acceptFirst=1][&known=first] → what
 *          has arrived for that search. It holds the request open until the
 *          state differs from `known` (waiting or first) or a wait runs out, so
 *          the dashboard asks once per wait, not every second
 *
 * No request to Google is made here. Local, single-user use only: it answers
 * only requests addressed to localhost.
 */

/** The largest answer accepted; Google's full lists are well under this. */
const MAX_BODY_CHARS = 8_000_000;

/** How long a GET holds while nothing has arrived, and once the first page is in. */
const HOLD_WAITING_MS = 25_000;
const HOLD_FIRST_MS = 3_000;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(request: Request): string {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function notLocal(request: Request): Response | null {
  if (process.env.NODE_ENV === "production" && process.env.AIRSEARCH_ENABLE_CURL !== "1") {
    return new Response(null, { status: 404 });
  }
  return LOCAL_HOSTS.has(hostnameOf(request)) ? null : reply({ ok: false, error: "Only on localhost." }, 403);
}

export async function POST(request: Request) {
  const blocked = notLocal(request);
  if (blocked) return blocked;

  let input: { request?: unknown; response?: unknown; debug?: unknown };
  try {
    input = ((await request.json()) ?? {}) as typeof input;
  } catch {
    return reply({ ok: false, error: "Invalid JSON." }, 400);
  }
  // A note from the extension about what it is doing, shown in the terminal.
  if (typeof input.debug === "string") {
    console.log(`[airsearcher/collect] extension: ${input.debug.replace(/[\r\n]+/g, " ").slice(0, 200)}`);
    return reply({ ok: true });
  }
  if (typeof input.request !== "string" || typeof input.response !== "string") {
    return reply({ ok: false, error: "Expected { request, response } strings." }, 400);
  }
  if (input.response.length > MAX_BODY_CHARS || input.request.length > MAX_BODY_CHARS) {
    return reply({ ok: false, error: "The answer is too large." }, 413);
  }

  const filed = putAnswer(input.request, input.response);
  if (!filed) {
    const why = explainRequest(input.request);
    console.warn(`[airsearcher/collect] rejected an answer: ${why}.`);
    return reply({ ok: false, error: `That isn't a flight search: ${why}.` }, 400);
  }
  return reply({ ok: true, list: filed.list });
}

export async function GET(request: Request) {
  const blocked = notLocal(request);
  if (blocked) return blocked;

  const params = new URL(request.url).searchParams;
  const list = (name: string) => (params.get(name) ?? "").split(",").filter(Boolean);
  const from = list("from");
  const to = list("to");
  const date = params.get("date");
  if (from.length === 0 || to.length === 0 || !date) {
    return reply({ ok: false, error: "Expected from, to and date." }, 400);
  }

  const key = collectKey(from, to, date);
  const acceptFirst = params.get("acceptFirst") === "1";
  const known = params.get("known") === "first" ? "first" : "waiting";
  let found = takeAnswer(key, acceptFirst);
  if (found.state === known) {
    await waitForChange(key, known === "first" ? HOLD_FIRST_MS : HOLD_WAITING_MS, request.signal);
    found = takeAnswer(key, acceptFirst);
  }
  if (found.state !== "done") return reply({ state: found.state } satisfies CollectPoll);

  // Read the answer like the cURL and browser routes do.
  let response: CurlRunResponse;
  try {
    const parsed = parseShoppingResults(found.body, { currency: CURRENCY, passengers: 1 });
    const warnings: string[] = [];
    if (found.list === "first") warnings.push("Only Google's first page was read.");
    if (parsed.unpriced > 0) warnings.push(`${parsed.unpriced} flights had no price.`);
    response = { ok: true, flights: parsed.flights, currency: CURRENCY, httpStatus: 200, waitedMs: 0, warnings };
  } catch (caught) {
    const error = asCurlError(caught);
    response = {
      ok: false,
      error: error ? error.toInfo() : errorInfo("unrecognised_response", "The caught answer couldn't be read."),
    };
  }
  return reply({ state: "done", response } satisfies CollectPoll);
}
