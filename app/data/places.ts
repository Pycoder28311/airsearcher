/**
 * The single place the rest of the app asks about airports and cities.
 *
 * Greek origins and European destinations are stored separately (one is real
 * reference data, the other is replaceable sample data), but every consumer
 * wants them merged, so the merging happens once, here.
 */

import type { Airport, AirportCode, City } from "@/lib/airsearcher/types";
import { GREEK_AIRPORTS, GREEK_CITIES } from "./greekAirports";
import { EUROPE_AIRPORTS, EUROPE_CITIES } from "./europeCities";

export const ALL_AIRPORTS: Airport[] = [...GREEK_AIRPORTS, ...EUROPE_AIRPORTS];
export const ALL_CITIES: City[] = [...GREEK_CITIES, ...EUROPE_CITIES];

const AIRPORTS_BY_CODE = new Map(ALL_AIRPORTS.map((a) => [a.code, a]));
const CITIES_BY_ID = new Map(ALL_CITIES.map((c) => [c.id, c]));

export function airportByCode(code: AirportCode): Airport | null {
  return AIRPORTS_BY_CODE.get(code.toUpperCase()) ?? null;
}

export function cityById(id: string): City | null {
  return CITIES_BY_ID.get(id) ?? null;
}

export function airportsOfCity(cityId: string): Airport[] {
  const city = cityById(cityId);
  if (!city) return [];
  return city.airportCodes
    .map((code) => airportByCode(code))
    .filter((a): a is Airport => a !== null);
}

export function cityOfAirport(code: AirportCode): City | null {
  const airport = airportByCode(code);
  return airport ? cityById(airport.cityId) : null;
}

/** Display label for an airport code, falling back to the bare code. */
export function airportLabel(code: AirportCode): string {
  const airport = airportByCode(code);
  return airport ? `${airport.code} · ${airport.name}` : code;
}

export interface PlaceSuggestion {
  kind: "city" | "airport";
  id: string;
  label: string;
  sublabel: string;
  cityId: string;
  airportCodes: AirportCode[];
}

/**
 * Cities and airports matching a free-text query, cities first.
 *
 * An empty query returns the first `limit` cities, so the dropdown has
 * something useful to show before anyone types.
 */
export function searchPlaces(query: string, limit = 8): PlaceSuggestion[] {
  const needle = query.trim().toLowerCase();

  const cityMatches = ALL_CITIES.filter(
    (city) =>
      needle === "" ||
      city.name.toLowerCase().includes(needle) ||
      city.country.toLowerCase().includes(needle),
  ).map<PlaceSuggestion>((city) => ({
    kind: "city",
    id: city.id,
    label: city.name,
    sublabel: `${city.country} · ${city.airportCodes.length} airport${
      city.airportCodes.length === 1 ? "" : "s"
    }`,
    cityId: city.id,
    airportCodes: city.airportCodes,
  }));

  const airportMatches =
    needle === ""
      ? []
      : ALL_AIRPORTS.filter(
          (airport) =>
            airport.code.toLowerCase() === needle ||
            airport.name.toLowerCase().includes(needle),
        ).map<PlaceSuggestion>((airport) => ({
          kind: "airport",
          id: airport.code,
          label: `${airport.code} · ${airport.name}`,
          sublabel: airport.country,
          cityId: airport.cityId,
          airportCodes: [airport.code],
        }));

  return [...cityMatches, ...airportMatches].slice(0, limit);
}
