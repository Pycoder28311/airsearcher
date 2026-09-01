/**
 * Deterministic stand-in for SerpApi.
 *
 * Every flight is derived from a seed built out of (from, to, date), so the
 * same route always yields the same flights: the UI is stable across reloads,
 * results can be compared, and nothing depends on the network.
 *
 * The shapes produced here are exactly the shapes a real response normalises
 * to, so replacing this module with a live fetch later changes nothing
 * downstream.
 */

import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { DEFAULT_RESULT_LIMITS } from "@/lib/airsearcher/config/ranking";
import { buildItineraries } from "@/lib/airsearcher/combinations";
import { poolKey } from "@/lib/airsearcher/grouping";
import { distanceBetweenAirports } from "@/lib/airsearcher/geo";
import { airportByCode } from "@/data/places";
import type { PlannedSearch } from "@/lib/airsearcher/queryPlan";
import type {
  AirportCode,
  Itinerary,
  NormalizedFlight,
  NormalizedLeg,
  NormalizedSegment,
} from "@/lib/airsearcher/types";

/* ── Deterministic randomness ────────────────────────────────────────────── */

/** FNV-1a: small, fast, and stable across runs and platforms. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A seeded generator yielding the same sequence for the same seed. */
function makeRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length) % list.length];
}

/* ── Mock airline roster ─────────────────────────────────────────────────── */

const AIRLINES = [
  { name: "Aegean Airlines", code: "A3" },
  { name: "Olympic Air", code: "OA" },
  { name: "Sky Express", code: "GQ" },
  { name: "Ryanair", code: "FR" },
  { name: "Wizz Air", code: "W6" },
  { name: "Lufthansa", code: "LH" },
  { name: "Air France", code: "AF" },
  { name: "KLM", code: "KL" },
  { name: "ITA Airways", code: "AZ" },
  { name: "British Airways", code: "BA" },
] as const;

/** Airports a connecting mock flight may route through. */
const HUBS: AirportCode[] = ["FRA", "MUC", "VIE", "AMS", "CDG", "FCO", "IST", "ZRH"];

/* ── Building blocks ─────────────────────────────────────────────────────── */

function clockTime(date: string, minutesFromMidnight: number): string {
  const dayOffset = Math.floor(minutesFromMidnight / 1440);
  const withinDay = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const hours = String(Math.floor(withinDay / 60)).padStart(2, "0");
  const minutes = String(Math.round(withinDay % 60)).padStart(2, "0");

  if (dayOffset === 0) return `${date} ${hours}:${minutes}`;

  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + dayOffset);
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d} ${hours}:${minutes}`;
}

/** Rough block time from great-circle distance, plus taxi and climb overhead. */
function flightMinutes(from: AirportCode, to: AirportCode): number {
  const km = distanceBetweenAirports(from, to) ?? 1200;
  return Math.round(35 + (km / 800) * 60);
}

function segment(
  from: AirportCode,
  to: AirportCode,
  departDate: string,
  departMinutes: number,
  durationMinutes: number,
  airline: (typeof AIRLINES)[number],
  flightNumber: string,
  travelClass: string,
): NormalizedSegment {
  const fromAirport = airportByCode(from);
  const toAirport = airportByCode(to);

  return {
    flightNumber,
    airline: airline.name,
    airlineLogo: null,
    airplane: null,
    travelClass,
    departure: {
      airport: from,
      airportName: fromAirport?.name ?? from,
      time: clockTime(departDate, departMinutes),
    },
    arrival: {
      airport: to,
      airportName: toAirport?.name ?? to,
      time: clockTime(departDate, departMinutes + durationMinutes),
    },
    durationMinutes,
  };
}

function buildLeg(
  random: () => number,
  from: AirportCode,
  to: AirportCode,
  date: string,
  departMinutes: number,
  stops: 0 | 1,
  airline: (typeof AIRLINES)[number],
  travelClass: string,
): NormalizedLeg {
  const flightNumber = `${airline.code}${100 + Math.floor(random() * 899)}`;

  if (stops === 0) {
    const duration = flightMinutes(from, to);
    return {
      segments: [
        segment(from, to, date, departMinutes, duration, airline, flightNumber, travelClass),
      ],
      layovers: [],
      stops: 0,
      totalDurationMinutes: duration,
    };
  }

  const hub = pick(
    random,
    HUBS.filter((code) => code !== from && code !== to),
  );
  const firstDuration = flightMinutes(from, hub);
  const layoverMinutes = 55 + Math.floor(random() * 190);
  const secondStart = departMinutes + firstDuration + layoverMinutes;
  const secondDuration = flightMinutes(hub, to);
  const hubAirport = airportByCode(hub);

  return {
    segments: [
      segment(from, hub, date, departMinutes, firstDuration, airline, flightNumber, travelClass),
      segment(
        hub,
        to,
        date,
        secondStart,
        secondDuration,
        airline,
        `${airline.code}${100 + Math.floor(random() * 899)}`,
        travelClass,
      ),
    ],
    layovers: [
      {
        airport: hub,
        airportName: hubAirport?.name ?? hub,
        durationMinutes: layoverMinutes,
        overnight: layoverMinutes > 360,
      },
    ],
    stops: 1,
    totalDurationMinutes: firstDuration + layoverMinutes + secondDuration,
  };
}

/**
 * The flights a single (from, to, date) search would return: 8 to 16 options
 * spread across the day, a realistic mix of non-stop and one-stop, and prices
 * that scale with distance.
 */
export function mockFlightsFor(
  from: AirportCode,
  to: AirportCode,
  date: string,
  travelClass = "economy",
): NormalizedFlight[] {
  const random = makeRandom(hashString(`${from}|${to}|${date}`));
  const count = 8 + Math.floor(random() * 9);
  const km = distanceBetweenAirports(from, to) ?? 1200;
  const basePrice = 38 + km * 0.055;

  const flights: NormalizedFlight[] = [];
  for (let i = 0; i < count; i++) {
    // Spread departures across the day rather than clustering them randomly.
    const departMinutes = Math.round(
      (i / count) * 17 * 60 + 5 * 60 + random() * 45,
    );
    const stops: 0 | 1 = random() < 0.62 ? 0 : 1;
    const airline = pick(random, AIRLINES);

    const leg = buildLeg(random, from, to, date, departMinutes, stops, airline, travelClass);

    // One-stop fares undercut non-stops; awkward hours are cheaper again.
    const stopDiscount = stops === 1 ? 0.82 : 1;
    const hourPenalty = departMinutes < 420 || departMinutes > 1260 ? 0.85 : 1;
    const spread = 0.75 + random() * 0.6;
    const price = Math.round(basePrice * stopDiscount * hourPenalty * spread);

    flights.push({
      id: `${from}-${to}-${date}-${i}`,
      category: i < 3 ? "best" : "other",
      price,
      currency: CURRENCY,
      airline: { name: airline.name, logo: null },
      outbound: leg,
      return: null,
      carbonEmissionsGrams: Math.round(km * 95 * (stops === 1 ? 1.25 : 1)),
      carbonDifferencePercent: Math.round((random() - 0.55) * 30),
      travelClass,
    });
  }

  return flights;
}

/**
 * Builds the shared itinerary pool a set of planned searches would produce.
 *
 * Return searches are matched to their outbound counterpart by route, so a
 * round trip becomes paired itineraries exactly as the real pipeline will
 * produce them. This is the function that stands in for the whole network layer.
 */
export function mockPool(
  plan: PlannedSearch[],
  travelClass = "economy",
): Record<string, Itinerary[]> {
  const outbound = plan.filter((s) => s.direction === "outbound");
  const returning = plan.filter((s) => s.direction === "return");

  const pool: Record<string, Itinerary[]> = {};

  for (const search of outbound) {
    const going = mockFlightsFor(search.from, search.to, search.date, travelClass);

    // The matching return search is the same route reversed.
    const back = returning.find(
      (r) => r.from === search.to && r.to === search.from,
    );
    const coming = back
      ? mockFlightsFor(back.from, back.to, back.date, travelClass)
      : null;

    const key = poolKey(search.from, search.to, search.date);
    const itineraries = buildItineraries(going, coming, DEFAULT_RESULT_LIMITS);

    pool[key] = itineraries;
  }

  return pool;
}
