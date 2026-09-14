/**
 * Travelpayouts (Aviasales Data API) → the normalized flight shape.
 *
 * This is the only Travelpayouts-specific logic: it turns one response into
 * `NormalizedFlight`s, after which the pool, grouping, scoring and filtering
 * are exactly the code the SerpApi results use.
 *
 * Travelpayouts sends one fare per option with a departure time, a duration and
 * a transfer count — no per-segment breakdown. Each option therefore becomes a
 * single segment from origin to destination, with `stops` taken from the
 * transfer count.
 */

import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { airportByCode } from "@/data/places";
import type { AirportCode, NormalizedFlight } from "@/lib/airsearcher/types";

export const TRAVELPAYOUTS_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

type JsonObject = Record<string, unknown>;

/**
 * Every country in the airport data sits in one time zone, so the country is
 * enough to express an arrival in the destination's local time — the same
 * convention SerpApi uses, which the connection checks rely on.
 */
const COUNTRY_TIME_ZONES: Record<string, string> = {
  Greece: "Europe/Athens",
  Italy: "Europe/Rome",
  Spain: "Europe/Madrid",
  Germany: "Europe/Berlin",
  "United Kingdom": "Europe/London",
  Sweden: "Europe/Stockholm",
  France: "Europe/Paris",
  "Türkiye": "Europe/Istanbul",
  Poland: "Europe/Warsaw",
  Norway: "Europe/Oslo",
  Belgium: "Europe/Brussels",
  Switzerland: "Europe/Zurich",
  Serbia: "Europe/Belgrade",
  Romania: "Europe/Bucharest",
  Portugal: "Europe/Lisbon",
  Netherlands: "Europe/Amsterdam",
  Ireland: "Europe/Dublin",
  Hungary: "Europe/Budapest",
  Finland: "Europe/Helsinki",
  Denmark: "Europe/Copenhagen",
  Czechia: "Europe/Prague",
  Croatia: "Europe/Zagreb",
  Bulgaria: "Europe/Sofia",
  Austria: "Europe/Vienna",
};

function objectOf(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** "2026-09-27T09:55:00+03:00" → "2026-09-27 09:55", the local clock as sent. */
function localClock(iso: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[1]} ${match[2]}` : null;
}

/** An instant as "YYYY-MM-DD HH:MM" on the wall clock at the given airport. */
function clockAt(instant: number, airport: AirportCode, fallbackIso: string): string | null {
  const country = airportByCode(airport)?.country;
  const timeZone = country ? COUNTRY_TIME_ZONES[country] : undefined;

  if (!timeZone) {
    // Unknown zone: keep the departure's own offset rather than inventing one.
    const offset = /([+-]\d{2}):?(\d{2})$/.exec(fallbackIso);
    const minutes = offset
      ? Math.sign(Number(offset[1])) * (Math.abs(Number(offset[1])) * 60 + Number(offset[2]))
      : 0;
    return new Date(instant + minutes * 60_000).toISOString().slice(0, 16).replace("T", " ");
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function flightOf(
  value: unknown,
  from: AirportCode,
  to: AirportCode,
  index: number,
): NormalizedFlight | null {
  const option = objectOf(value);
  if (!option) return null;

  // Anything for a different airport of the same city is not this route.
  const origin = stringOf(option.origin_airport) ?? stringOf(option.origin);
  const destination = stringOf(option.destination_airport) ?? stringOf(option.destination);
  if (origin !== from || destination !== to) return null;

  const departsIso = stringOf(option.departure_at);
  const departs = departsIso ? localClock(departsIso) : null;
  if (!departsIso || !departs) return null;

  const duration = numberOf(option.duration_to) ?? numberOf(option.duration);
  const departedAt = Date.parse(departsIso);
  const lands =
    duration !== null && Number.isFinite(departedAt)
      ? clockAt(departedAt + duration * 60_000, to, departsIso)
      : null;

  const airline = stringOf(option.airline);
  const number = option.flight_number;
  const flightNumber =
    airline && (typeof number === "string" || typeof number === "number")
      ? `${airline} ${number}`
      : null;
  const stops = Math.max(0, numberOf(option.transfers) ?? 0);

  return {
    id: `${from}-${to}-${departs}-${flightNumber ?? "unknown"}-travelpayouts-${index}`,
    category: "best",
    price: numberOf(option.price),
    currency: CURRENCY,
    airline: { name: airline, logo: null },
    outbound: {
      segments: [
        {
          flightNumber,
          airline,
          airlineLogo: null,
          airplane: null,
          travelClass: null,
          departure: { airport: from, airportName: airportByCode(from)?.name ?? null, time: departs },
          arrival: { airport: to, airportName: airportByCode(to)?.name ?? null, time: lands },
          durationMinutes: duration,
        },
      ],
      layovers: [],
      stops,
      totalDurationMinutes: duration,
    },
    return: null,
    carbonEmissionsGrams: null,
    carbonDifferencePercent: null,
    travelClass: null,
  };
}

/** Normalizes one Travelpayouts response for one route without trusting its JSON shape. */
export function normalizeTravelpayoutsResponse(
  data: unknown,
  from: AirportCode,
  to: AirportCode,
): NormalizedFlight[] {
  const list = objectOf(data)?.data;
  if (!Array.isArray(list)) return [];

  const flights: NormalizedFlight[] = [];
  list.forEach((value, index) => {
    const flight = flightOf(value, from, to, index);
    if (flight) flights.push(flight);
  });
  return flights;
}
