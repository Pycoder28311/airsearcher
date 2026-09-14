/**
 * Links out to Google Flights.
 *
 * Built from what every stored flight already has — its airports and departure
 * day — so they cost no requests and work on results saved before links existed.
 * Google Flights has no stable link to one specific flight without a paid
 * booking lookup, so the link opens that route on that day, where the flight is
 * listed.
 */

import { CURRENCY } from "@/lib/airsearcher/config/constants";
import type { NormalizedFlight } from "@/lib/airsearcher/types";

/** Google Flights for the flight's route and departure day; null when either is unknown. */
export function googleFlightsUrl(flight: NormalizedFlight): string | null {
  const segments = flight.outbound.segments;
  const from = segments[0]?.departure.airport;
  const to = segments[segments.length - 1]?.arrival.airport;
  const day = segments[0]?.departure.time?.slice(0, 10);
  if (!from || !to || !day) return null;

  const params = new URLSearchParams({
    q: `Flights from ${from} to ${to} on ${day} one way`,
    curr: CURRENCY,
    hl: "en",
  });
  return `https://www.google.com/travel/flights?${params}`;
}
