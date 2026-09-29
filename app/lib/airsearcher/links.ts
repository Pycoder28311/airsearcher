/**
 * Links out to Google Flights.
 *
 * Built from what every stored flight already has — airports, days, airline
 * codes and flight numbers — so they cost no requests and work on results
 * saved before links existed. A flight is one ticket: its link opens that
 * ticket's booking page, with every flight in it (a ticket with its own stop
 * names both). Two tickets joined at the hub are two flights, so two links.
 * When a flight lacks what a booking link needs, the link opens its route on
 * its day instead, where the flight is listed.
 */

import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { airports, googleFlightsBookingUrl, type LinkFlight } from "@/lib/airsearcher/curl/googleLink";
import type { NormalizedFlight } from "@/lib/airsearcher/types";

/** "FR 7806" → { airline: "FR", number: "7806" }; null when it isn't one. */
function splitFlightNumber(flightNumber: string | null): { airline: string; number: string } | null {
  const match = /^([A-Z0-9]{2})\s*(\d{1,4})$/.exec(flightNumber?.trim() ?? "");
  return match ? { airline: match[1], number: match[2] } : null;
}

/** The ticket's flights as a booking link names them; null if any part is unknown. */
function linkFlightsOf(flight: NormalizedFlight): LinkFlight[] | null {
  const flights: LinkFlight[] = [];
  for (const segment of flight.outbound.segments) {
    const code = splitFlightNumber(segment.flightNumber);
    const from = segment.departure.airport;
    const to = segment.arrival.airport;
    const date = segment.departure.time?.slice(0, 10);
    if (!code || !from || !to || !date) return null;
    flights.push({ from, date, to, ...code });
  }
  return flights.length > 0 ? flights : null;
}

/**
 * Google Flights for this ticket: its booking page, or its route on its day
 * when the flights can't be named. Null when even the route is unknown.
 */
export function googleFlightsUrl(flight: NormalizedFlight): string | null {
  const segments = flight.outbound.segments;
  const from = segments[0]?.departure.airport;
  const to = segments[segments.length - 1]?.arrival.airport;
  const day = segments[0]?.departure.time?.slice(0, 10);
  if (!from || !to || !day) return null;

  const flights = linkFlightsOf(flight);
  if (flights) return googleFlightsBookingUrl({ from: airports([from]), to: airports([to]), date: day, flights });

  const params = new URLSearchParams({
    q: `Flights from ${from} to ${to} on ${day} one way`,
    curr: CURRENCY,
    hl: "en",
  });
  return `https://www.google.com/travel/flights?${params}`;
}
