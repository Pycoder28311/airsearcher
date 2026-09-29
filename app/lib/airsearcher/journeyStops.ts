/**
 * One direction of one group's trip, looked at as the traveller sees it.
 *
 * A stop can come from two places: Google selling one ticket with a change of
 * plane (SKG → MUC → FCO), or the combination algorithm joining two tickets at
 * the hub (SKG → ATH, then ATH → FCO). To the traveller both are the same —
 * land, wait, board again — so everything that judges stops, waits, connecting
 * airports or door-to-door time goes through here and counts them alike.
 *
 * Every function takes the flights of one direction in the order they are
 * flown, exactly as `journeyFlights` returns them.
 */

import { minutesBetweenTimes } from "@/lib/airsearcher/time";
import type { AirportCode, NormalizedFlight, NormalizedLeg } from "@/lib/airsearcher/types";

/** One place the traveller lands and boards again. */
export interface JourneyConnection {
  airport: AirportCode | null;
  /** Wait on the ground; null when the times are unusable. */
  minutes: number | null;
}

/** Stops in one direction: those inside each ticket plus one per ticket change. */
export function journeyStopCount(flights: NormalizedFlight[]): number {
  if (flights.length === 0) return 0;
  const inside = flights.reduce((sum, flight) => sum + Math.max(0, flight.outbound.stops), 0);
  return inside + flights.length - 1;
}

/**
 * Every stop in one direction, in order: a ticket's own layovers (or, when the
 * provider sent none, its segment boundaries) and each change between tickets.
 */
export function journeyConnections(flights: NormalizedFlight[]): JourneyConnection[] {
  const connections: JourneyConnection[] = [];

  flights.forEach((flight, i) => {
    const { segments, layovers } = flight.outbound;
    if (layovers.length > 0) {
      for (const l of layovers) connections.push({ airport: l.airport, minutes: l.durationMinutes });
    } else {
      for (let s = 0; s < segments.length - 1; s++) {
        connections.push({
          airport: segments[s].arrival.airport,
          minutes: minutesBetweenTimes(segments[s].arrival.time, segments[s + 1].departure.time),
        });
      }
    }

    const next = flights[i + 1];
    if (next) {
      const landed = segments[segments.length - 1];
      connections.push({
        airport: landed?.arrival.airport ?? null,
        minutes: minutesBetweenTimes(
          landed?.arrival.time,
          next.outbound.segments[0]?.departure.time,
        ),
      });
    }
  });

  return connections;
}

/**
 * Door-to-door minutes for one direction: every segment's flying time plus
 * every wait on the ground. Built from durations rather than the first and
 * last clock times, because those are local — Athens to Rome would otherwise
 * lose the hour between the two time zones. Waits are fine to take from the
 * clock, since both ends of a wait are at the same airport.
 *
 * Falls back to the clock span when a segment has no duration, and returns
 * null when neither works.
 */
export function journeyMinutes(flights: NormalizedFlight[]): number | null {
  if (flights.length === 0) return null;
  const segments = flights.flatMap((f) => f.outbound.segments);

  const flying = segments.map(
    (s) => s.durationMinutes ?? null,
  );
  const waits = segments.slice(0, -1).map((s, i) =>
    minutesBetweenTimes(s.arrival.time, segments[i + 1].departure.time),
  );
  if (flying.every((m) => m !== null) && waits.every((m) => m !== null)) {
    return [...flying, ...waits].reduce<number>((sum, m) => sum + (m ?? 0), 0);
  }

  const span = minutesBetweenTimes(
    segments[0]?.departure.time,
    segments[segments.length - 1]?.arrival.time,
  );
  return span !== null && span > 0 ? span : null;
}

/**
 * The direction as one leg: every segment from the first take-off to the last
 * landing, so anything judging a leg's hours sees the whole journey the same
 * way whether it was one ticket or several.
 */
export function journeyAsLeg(flights: NormalizedFlight[]): NormalizedLeg | null {
  if (flights.length === 0) return null;
  const connections = journeyConnections(flights);
  return {
    segments: flights.flatMap((f) => f.outbound.segments),
    layovers: connections.map((c) => ({
      airport: c.airport,
      airportName: null,
      durationMinutes: c.minutes,
      overnight: false,
    })),
    stops: journeyStopCount(flights),
    totalDurationMinutes: journeyMinutes(flights),
  };
}
