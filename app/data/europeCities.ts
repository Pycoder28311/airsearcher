/**
 * European destinations for the map and the destination search: every city
 * with a scheduled airport, plus UNESCO World Heritage sites and national parks
 * with the airports within driving range of them.
 *
 * GENERATED DATA — do not edit europeDestinations.generated.json by hand.
 * Rebuild it with `node scripts/airsearcher/build-destinations.mjs`; hand
 * corrections to a place's airports go in
 * scripts/airsearcher/destination-overrides.json.
 */

import type { Airport, City } from "@/lib/airsearcher/types";
import generated from "./europeDestinations.generated.json";

export const EUROPE_CITIES: City[] = generated.cities as City[];

export const EUROPE_AIRPORTS: Airport[] = generated.airports as Airport[];

export const EUROPE_AIRPORTS_BY_CODE: Record<string, Airport> = Object.fromEntries(
  EUROPE_AIRPORTS.map((airport) => [airport.code, airport]),
);

export const EUROPE_CITIES_BY_ID: Record<string, City> = Object.fromEntries(
  EUROPE_CITIES.map((city) => [city.id, city]),
);
