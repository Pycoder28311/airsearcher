/**
 * The single place the rest of the app asks about airports and cities.
 *
 * The generated European destinations already cover Greece. The hand-kept
 * Greek list (the departure airports) only fills in an airport the generated
 * data lacks, so every departure airport can always be looked up.
 */

import type { Airport, AirportCode, City } from "@/lib/airsearcher/types";
import { GREEK_AIRPORTS, GREEK_CITIES } from "./greekAirports";
import { EUROPE_AIRPORTS, EUROPE_CITIES } from "./europeCities";

const generatedCodes = new Set(EUROPE_AIRPORTS.map((a) => a.code));
const missingGreek = GREEK_AIRPORTS.filter((a) => !generatedCodes.has(a.code));
const missingGreekCityIds = new Set(missingGreek.map((a) => a.cityId));

export const ALL_AIRPORTS: Airport[] = [...EUROPE_AIRPORTS, ...missingGreek];
export const ALL_CITIES: City[] = [
  ...EUROPE_CITIES,
  ...GREEK_CITIES.filter((c) => missingGreekCityIds.has(c.id)),
];

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

/** " · UNESCO site", " · National park", or "" for a city. */
function placeKindLabel(city: City): string {
  if (city.kind === "unesco") return " · UNESCO site";
  if (city.kind === "park") return " · National park";
  return "";
}

/** Whether a destination is a rural place rather than a city. */
export function isRuralPlace(city: City | null): boolean {
  return city?.kind === "unesco" || city?.kind === "park";
}

/** "1 h 40 min drive", or null when the drive time is not known. */
export function driveLabel(city: City | null, code: AirportCode): string | null {
  const minutes = city?.driveMinutes?.[code];
  if (minutes === undefined) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours > 0 ? `${hours} h ` : ""}${rest} min drive`;
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

  /**
   * How well a destination matches, lower first: the name starts with the
   * text, a word of it does, the text is inside it, only the country matches.
   * The list is long, so "par" must show Paris before a park containing "par".
   */
  const matchRank = (city: City): number | null => {
    if (needle === "") return 0;
    const name = city.name.toLowerCase();
    if (name.startsWith(needle)) return 0;
    if (name.split(/[\s,(/-]+/).some((word) => word.startsWith(needle))) return 1;
    if (name.includes(needle)) return 2;
    if (city.country.toLowerCase().includes(needle)) return 3;
    return null;
  };

  const cityMatches = ALL_CITIES.map((city, order) => ({ city, order, rank: matchRank(city) }))
    .filter((match): match is { city: City; order: number; rank: number } => match.rank !== null)
    // Cities before rural places at the same rank, then in the data's order,
    // which puts the best-connected cities first.
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(isRuralPlace(a.city)) - Number(isRuralPlace(b.city)) ||
        a.order - b.order,
    )
    .map<PlaceSuggestion>(({ city }) => ({
      kind: "city",
      id: city.id,
      label: city.name,
      sublabel: `${city.country}${placeKindLabel(city)} · ${city.airportCodes.length} ${
        isRuralPlace(city) ? "nearby " : ""
      }airport${city.airportCodes.length === 1 ? "" : "s"}`,
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
