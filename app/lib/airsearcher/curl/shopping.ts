/**
 * Reads flights out of a Google Flights GetShoppingResults response.
 *
 * The response uses Google's chunked RPC format:
 *
 *   )]}'
 *   <length>
 *   [["wrb.fr",null,"<the payload as a JSON string>", …], …]
 *   <length>
 *   […]
 *
 * The payload is undocumented positional arrays. The positions below come from
 * public reverse-engineering (e.g. the `fast-flights` project) and were
 * confirmed against live answers for direct flights; layovers are not yet
 * confirmed. Nothing here trusts them blindly:
 *
 *   - Flight lists are found by walking the whole payload for arrays shaped
 *     like a flight, not by fixed indices, so a list moving does not break it.
 *     Anything under payload[2] is "best", everything else "other".
 *   - Each flight item: item[0] = details, item[1][0][1] = price.
 *     details[0] airline code, [1] airline names, [2] segments, [3] from,
 *     [4] date [y,m,d], [5] time [h,m], [6] to, [7] date, [8] time,
 *     [9] minutes, [13] layovers, [22][7] CO2 grams, [22][3] CO2 % vs typical.
 *   - Each segment: [3] from code, [4] from name, [5] to name, [6] to code,
 *     [8] departs [h,m], [10] arrives [h,m], [11] minutes, [17] aircraft,
 *     [20] departure date, [21] arrival date, [22] [airline code, number, _,
 *     airline name].
 *
 * A response without any RPC payload is reported as unrecognised. One with a
 * payload but no flights comes back empty, and the UI warns that this can also
 * mean the format changed.
 */

import { CurlError } from "@/lib/airsearcher/curl/errors";
import type {
  AirportCode,
  NormalizedFlight,
  NormalizedLayover,
  NormalizedSegment,
} from "@/lib/airsearcher/types";

const IATA = /^[A-Z]{3}$/;

function arrayOf(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function airportOf(value: unknown): AirportCode | null {
  return typeof value === "string" && IATA.test(value) ? value : null;
}

/** [2026, 10, 8] + [7, 5] → "2026-10-08 07:05"; missing minutes count as 0. */
function timeOf(date: unknown, time: unknown): string | null {
  const d = arrayOf(date);
  const [year, month, day] = [numberOf(d?.[0]), numberOf(d?.[1]), numberOf(d?.[2])];
  if (year === null || month === null || day === null) return null;
  const t = arrayOf(time);
  const hours = numberOf(t?.[0]) ?? 0;
  const minutes = numberOf(t?.[1]) ?? 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}`;
}

/* ── The chunked envelope ────────────────────────────────────────────────── */

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Every RPC payload in the response, parsed. The length lines are ignored and
 * JSON lines are parsed as they complete, which tolerates the lengths being
 * counted in a different unit than JavaScript strings use.
 */
export function payloadsOf(body: string): unknown[] {
  const text = body.replace(/^\s*\)\]\}'\s*/, "");
  const payloads: unknown[] = [];
  const rpcErrors: string[] = [];
  let pending = "";

  for (const line of text.split("\n")) {
    if (!pending && !line.trimStart().startsWith("[")) continue;
    pending = pending ? `${pending}\n${line}` : line;
    const parsed = tryJson(pending);
    if (parsed === undefined) continue;
    pending = "";

    for (const entry of arrayOf(parsed) ?? []) {
      const envelope = arrayOf(entry);
      if (envelope?.[0] !== "wrb.fr") continue;
      const inner = typeof envelope[2] === "string" ? tryJson(envelope[2]) : undefined;
      if (inner === undefined || inner === null) {
        // Google's error code sits at [5], e.g. [13]; kept for the message.
        rpcErrors.push(JSON.stringify(envelope[5] ?? null));
      }
      else payloads.push(inner);
    }
  }

  if (payloads.length === 0) {
    throw new CurlError(
      rpcErrors.length > 0 ? "session_expired" : "unrecognised_response",
      rpcErrors.length > 0
        ? `Google refused this request (error ${rpcErrors[0]}). A changed request is usually refused; an unchanged one is refused once its session is about 30 minutes old — copy a fresh cURL.`
        : "Google's answer isn't in the expected format. It may have changed; the flights couldn't be read.",
    );
  }
  return payloads;
}

/* ── Flights ─────────────────────────────────────────────────────────────── */

function isSegment(value: unknown): value is unknown[] {
  const s = arrayOf(value);
  return s !== null && airportOf(s[3]) !== null && airportOf(s[6]) !== null;
}

/** Looks like one flight option: details with a segment list, plus a price block. */
function isFlightItem(value: unknown): boolean {
  const item = arrayOf(value);
  const details = arrayOf(item?.[0]);
  const segments = arrayOf(details?.[2]);
  return (
    item !== null &&
    details !== null &&
    segments !== null &&
    segments.length > 0 &&
    segments.every(isSegment) &&
    arrayOf(item[1]) !== null
  );
}

function segmentOf(value: unknown[]): NormalizedSegment {
  const flightInfo = arrayOf(value[22]);
  const code = stringOf(flightInfo?.[0]);
  const number = stringOf(flightInfo?.[1]) ?? (numberOf(flightInfo?.[1])?.toString() ?? null);
  return {
    flightNumber: code && number ? `${code} ${number}` : null,
    airline: stringOf(flightInfo?.[3]) ?? code,
    airlineLogo: null,
    airplane: stringOf(value[17]),
    travelClass: null,
    departure: {
      airport: airportOf(value[3]),
      airportName: stringOf(value[4]),
      time: timeOf(value[20], value[8]),
    },
    arrival: {
      airport: airportOf(value[6]),
      airportName: stringOf(value[5]),
      time: timeOf(value[21], value[10]),
    },
    durationMinutes: numberOf(value[11]),
  };
}

function layoverOf(value: unknown): NormalizedLayover | null {
  const layover = arrayOf(value);
  if (!layover) return null;
  return {
    airport: airportOf(layover[1]),
    airportName: stringOf(layover[4]) ?? stringOf(layover[2]),
    durationMinutes: numberOf(layover[0]),
    overnight: false,
  };
}

function priceOf(item: unknown[]): number | null {
  return numberOf(arrayOf(arrayOf(item[1])?.[0])?.[1]);
}

function flightOf(
  item: unknown[],
  category: NormalizedFlight["category"],
  index: number,
  currency: string,
  passengers: number,
): NormalizedFlight | null {
  const details = item[0] as unknown[];
  const segments = (details[2] as unknown[][]).map(segmentOf);
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first.departure.airport || !last.arrival.airport) return null;

  // Fill times from the whole-trip fields when a segment lacks its date.
  first.departure.time ??= timeOf(details[4], details[5]);
  last.arrival.time ??= timeOf(details[7], details[8]);

  const layovers = (arrayOf(details[13]) ?? [])
    .map(layoverOf)
    .filter((layover): layover is NormalizedLayover => layover !== null)
    // Google doesn't flag overnight stops; one is when the connection leaves
    // on a later date than the flight before it landed.
    .map((layover, index) => {
      const landed = segments[index]?.arrival.time?.slice(0, 10);
      const leaves = segments[index + 1]?.departure.time?.slice(0, 10);
      return { ...layover, overnight: Boolean(landed && leaves && leaves > landed) };
    });

  const names = (arrayOf(details[1]) ?? []).filter((n): n is string => typeof n === "string");
  const airlines = names.length > 0
    ? names
    : [...new Set(segments.map((s) => s.airline).filter((a): a is string => Boolean(a)))];

  const price = priceOf(item);
  const identity = segments
    .map((s) => s.flightNumber ?? `${s.departure.airport}-${s.arrival.airport}`)
    .join("+");

  return {
    id: `g-${first.departure.airport}-${last.arrival.airport}-${first.departure.time ?? "unknown"}-${identity}-${category}-${index}`,
    category,
    // Google quotes the search's whole party; the pipeline works per passenger.
    price: price === null ? null : Math.round((price / passengers) * 100) / 100,
    currency,
    airline: {
      name: airlines.length === 1 ? airlines[0] : airlines.length > 1 ? "Multiple airlines" : null,
      logo: null,
    },
    outbound: {
      segments,
      layovers,
      stops: Math.max(0, segments.length - 1),
      totalDurationMinutes: numberOf(details[9]),
    },
    return: null,
    carbonEmissionsGrams: numberOf(arrayOf(details[22])?.[7]),
    carbonDifferencePercent: numberOf(arrayOf(details[22])?.[3]),
    travelClass: null,
  };
}

/** Collects flight items, depth-first, without descending into a found one. */
function collectItems(value: unknown, out: unknown[][], depth = 0): void {
  if (depth > 12) return;
  const array = arrayOf(value);
  if (!array) return;
  if (isFlightItem(array)) {
    out.push(array);
    return;
  }
  for (const child of array) collectItems(child, out, depth + 1);
}

export interface ShoppingResult {
  flights: NormalizedFlight[];
  /** Items that looked like flights but had no price. */
  unpriced: number;
}

export function parseShoppingResults(
  body: string,
  options: { currency: string; passengers: number },
): ShoppingResult {
  // Google streams the list several times in one answer, each copy at least
  // as complete as the one before, so only the last list is read.
  let latest: { best: unknown[][]; other: unknown[][] } | null = null;
  for (const payload of payloadsOf(body)) {
    const sections = arrayOf(payload) ?? [];
    const best: unknown[][] = [];
    const other: unknown[][] = [];
    sections.forEach((section, index) => collectItems(section, index === 2 ? best : other));
    if (best.length + other.length > 0) latest = { best, other };
  }

  const flights: NormalizedFlight[] = [];
  let unpriced = 0;
  for (const [category, items] of [["best", latest?.best ?? []], ["other", latest?.other ?? []]] as const) {
    items.forEach((item, index) => {
      const flight = flightOf(item, category, index, options.currency, Math.max(1, options.passengers));
      if (!flight) return;
      if (flight.price === null) unpriced++;
      flights.push(flight);
    });
  }

  // Zero flights is reported as a warning by the caller, not an error: an
  // empty route is a real answer, and a format change would look the same.
  return { flights, unpriced };
}
