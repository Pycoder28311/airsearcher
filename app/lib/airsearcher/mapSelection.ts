/**
 * The map's selection rule, in one testable place.
 *
 * The rule: airports may be multi-selected, but only within a single
 * destination. Picking an airport the selected destination does not list
 * clears its selection entirely and starts fresh — so the selection can never
 * describe a journey to two different places at once.
 *
 * `MapCanvas` calls these and renders the result; it holds no selection logic
 * of its own.
 */

import { cityById } from "@/data/places";
import type { Airport, AirportCode, City } from "@/lib/airsearcher/types";

export interface PlaceSelection {
  cityId: string | null;
  airports: AirportCode[];
}

export const EMPTY_SELECTION: PlaceSelection = { cityId: null, airports: [] };

/** Selecting a city means selecting every airport it has. */
export function selectCity(city: City): PlaceSelection {
  return { cityId: city.id, airports: [...city.airportCodes] };
}

/**
 * Whether an airport is one of the selected destination's own airports. A
 * rural place lists airports that belong to nearby cities, so its airports are
 * read from the destination rather than from each airport's city.
 */
function servesSelection(current: PlaceSelection, airport: Airport): boolean {
  if (!current.cityId) return false;
  if (current.cityId === airport.cityId) return true;
  return cityById(current.cityId)?.airportCodes.includes(airport.code) ?? false;
}

/**
 * Toggles one airport.
 *
 * One of the selected destination's airports: adds or removes it, but never
 * leaves the destination selected with no airports — deselecting the last one
 * clears the selection outright.
 * Any other airport: discards the old destination's airports and selects this
 * one alone, under its own city.
 */
export function toggleAirport(
  current: PlaceSelection,
  airport: Airport,
): PlaceSelection {
  if (!servesSelection(current, airport)) {
    return { cityId: airport.cityId, airports: [airport.code] };
  }

  const has = current.airports.includes(airport.code);
  const airports = has
    ? current.airports.filter((code) => code !== airport.code)
    : [...current.airports, airport.code];

  if (airports.length === 0) return EMPTY_SELECTION;
  return { cityId: current.cityId, airports };
}

/** Whether an airport is part of the current selection. */
export function isAirportSelected(
  selection: PlaceSelection,
  code: AirportCode,
): boolean {
  return selection.airports.includes(code);
}

/** A city counts as selected only when every one of its airports is. */
export function isCityFullySelected(
  selection: PlaceSelection,
  city: City,
): boolean {
  return (
    selection.cityId === city.id &&
    city.airportCodes.every((code) => selection.airports.includes(code))
  );
}

/** Selects every airport of the currently selected city. */
export function selectAllInCity(
  selection: PlaceSelection,
  city: City,
): PlaceSelection {
  if (selection.cityId !== city.id) return selectCity(city);
  return { cityId: city.id, airports: [...city.airportCodes] };
}
