/**
 * Great-circle distance, and the one place that uses it: picking the airport
 * the whole group should gather at.
 */

import { airportByCode } from "@/data/places";
import type { AirportCode, OriginGroup } from "@/lib/airsearcher/types";

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Kilometres between two points on the globe. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Kilometres between two airports; null when either code is unknown. */
export function distanceBetweenAirports(
  from: AirportCode,
  to: AirportCode,
): number | null {
  const a = airportByCode(from);
  const b = airportByCode(to);
  if (!a || !b) return null;
  return haversineKm(a, b);
}

export interface GatheringCandidate {
  airport: AirportCode;
  /** Passengers who would already be at this airport. */
  alreadyThere: number;
  /** Total passenger-kilometres everyone else would have to fly to reach it. */
  feederPassengerKm: number;
}

/**
 * Ranks the group's own airports as possible gathering points.
 *
 * The measure is passenger-kilometres: how far everyone who is not already
 * there would collectively have to travel to reach it. Fewest wins, which
 * naturally favours whichever airport most of the group already departs from.
 */
export function rankGatheringAirports(origins: OriginGroup[]): GatheringCandidate[] {
  const active = origins.filter((o) => o.passengers > 0);

  return active
    .map((candidate) => {
      let feederPassengerKm = 0;
      for (const other of active) {
        if (other.airport === candidate.airport) continue;
        const km = distanceBetweenAirports(other.airport, candidate.airport);
        // An unknown airport should not look free, so treat it as far away.
        feederPassengerKm += (km ?? 2000) * other.passengers;
      }
      const alreadyThere =
        active.find((o) => o.airport === candidate.airport)?.passengers ?? 0;
      return { airport: candidate.airport, alreadyThere, feederPassengerKm };
    })
    .sort((a, b) => a.feederPassengerKm - b.feederPassengerKm);
}

/** The single best gathering airport for the group, or null when there is none. */
export function bestGatheringAirport(origins: OriginGroup[]): AirportCode | null {
  return rankGatheringAirports(origins)[0]?.airport ?? null;
}
