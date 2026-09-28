/**
 * Reads the search out of a GetShoppingResults request body.
 *
 * The body is form-encoded `f.req=<JSON>&at=<token>`, where the JSON is
 * `[null, "<search as a JSON string>"]`. The search is Google's undocumented
 * positional array. Only what is needed is read, and every access is guarded:
 * if the shape is not recognised the result is `null`, never an exception.
 *
 * Positions used (from public reverse-engineering, checked defensively):
 *   search[1][2]  — trip type: 1 round trip, 2 one-way, 3 multi-city
 *   search[1][6]  — passengers: [adults, children, infants on lap, in seat]
 *   search[1][13] — the legs; each holds its places and an ISO date
 */

import { CurlError } from "@/lib/airsearcher/curl/errors";

export interface DecodedSearch {
  tripType: "round-trip" | "one-way" | "multi-city" | null;
  /** Total passengers the prices are quoted for; 1 when unknown. */
  passengers: number;
  legs: { from: string[]; to: string[]; date: string | null }[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** An IATA code or a Google Knowledge Graph place id such as "/m/04jpl". */
const PLACE = /^([A-Z]{3}|\/[mg]\/[\w-]+)$/;

function strings(value: unknown, match: RegExp, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (match.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) strings(item, match, out);
  }
  return out;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** The raw `f.req` value, or null when the body has none. */
export function freqOf(body: string | null): string | null {
  if (!body) return null;
  try {
    return new URLSearchParams(body).get("f.req");
  } catch {
    return null;
  }
}

export function decodeSearch(body: string | null): DecodedSearch | null {
  const freq = freqOf(body);
  if (!freq) return null;

  const outer = parseJson(freq);
  if (!Array.isArray(outer) || typeof outer[1] !== "string") return null;
  const search = parseJson(outer[1]);
  if (!Array.isArray(search) || !Array.isArray(search[1])) return null;
  const settings = search[1] as unknown[];

  const tripCode = settings[2];
  const tripType =
    tripCode === 1 ? "round-trip" : tripCode === 2 ? "one-way" : tripCode === 3 ? "multi-city" : null;

  const counts = Array.isArray(settings[6]) ? settings[6] : [];
  const total = counts
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0)
    .reduce((sum, n) => sum + n, 0);

  const rawLegs = Array.isArray(settings[13]) ? settings[13] : [];
  const legs = rawLegs
    .filter((leg): leg is unknown[] => Array.isArray(leg))
    .map((leg) => ({
      from: strings(leg[0], PLACE),
      to: strings(leg[1], PLACE),
      date: strings(leg, ISO_DATE)[0] ?? null,
    }))
    .filter((leg) => leg.from.length > 0 || leg.to.length > 0 || leg.date !== null);

  if (tripType === null && legs.length === 0) return null;
  return { tripType, passengers: total > 0 ? total : 1, legs };
}

/** "ATH → /m/04jpl · 2026-10-08" — a short, secret-free label for a row. */
export function describeSearch(search: DecodedSearch): string {
  const leg = search.legs[0];
  const route = leg ? `${leg.from.join(",") || "?"} → ${leg.to.join(",") || "?"}` : "unknown route";
  const date = leg?.date ? ` · ${leg.date}` : "";
  const kind = {
    "one-way": "One-way",
    "round-trip": "Round trip",
    "multi-city": "Multi-city",
  }[search.tripType ?? "one-way"];
  if (search.tripType === null) return `Unknown trip · ${route}${date}`;
  return `${kind} · ${route}${date}`;
}

/* ── Building a search from the app's own inputs ────────────────────────── */

/** One search the app builds: several airports per side, one date, one way. */
export interface GeneratedSearch {
  from: string[];
  to: string[];
  date: string;
  /**
   * "first": the first page, as a new search in the browser returns it.
   * "all": the full list, as "View more flights" returns it. Default "all".
   */
  list?: FlightList;
}

export type FlightList = "first" | "all";

/** `search[3]`: 0 for the first page, 1 for "View more flights". */
const LIST_FLAG: Record<FlightList, number> = { first: 0, all: 1 };

/** Place type Google uses for an airport code; 4/5 are its city ids. */
const AIRPORT_PLACE = 0;

/**
 * A neutral one-way search, in the exact shape the browser sends, with every
 * setting at its default: any number of stops, economy, 1 adult, no airline or
 * time filters. Nothing is copied from the template's search, so filters that
 * were on when the cURL was copied never carry over. The head is empty, as in
 * the browser's own "View more flights" request: no search token is needed,
 * for either list.
 */
function neutralSearch(search: GeneratedSearch): unknown[] {
  const leg = [
    [search.from.map((code) => [code, AIRPORT_PLACE])],
    [search.to.map((code) => [code, AIRPORT_PLACE])],
    null, // departure/arrival time windows: none
    0, // stops: any
    null, // airlines: any
    null,
    search.date,
    null, null, null, null, null, null, null,
    3,
  ];
  const settings = [
    null, null,
    2, // one-way
    null,
    [],
    1, // economy
    [1, 0, 0, 0], // 1 adult
    null, null, null, null, null, null,
    [leg],
    null, null, null,
    1,
  ];
  return [[], settings, 0, LIST_FLAG[search.list ?? "all"], 0, 1];
}

/**
 * The template's form body with its search replaced by `search`. The `at=`
 * token is removed: it belongs to the signed-in session, and the request is
 * sent without cookies (see `prepareCurl`), which Google accepts for a changed
 * search while it refuses the same change signed in.
 */
export function rewriteSearch(body: string | null, search: GeneratedSearch): string {
  const unusable = () =>
    new CurlError(
      "template_unrecognised",
      "This cURL can't be used as a session — copy a GetShoppingResults request.",
    );

  const freq = freqOf(body);
  if (!body || !freq) throw unusable();
  const outer = parseJson(freq);
  if (!Array.isArray(outer) || typeof outer[1] !== "string") throw unusable();
  const original = parseJson(outer[1]);
  if (!Array.isArray(original) || !Array.isArray(original[1])) throw unusable();

  const params = new URLSearchParams(body);
  params.set("f.req", JSON.stringify([outer[0] ?? null, JSON.stringify(neutralSearch(search))]));
  params.delete("at");
  // URLSearchParams encodes spaces as "+"; the browser sends none, so this is safe.
  return `${params.toString()}&`;
}
