/**
 * Changing a finished search's trip length without searching again.
 *
 * A search fetched going flights for its departure days and return flights
 * only for the return days its length needed: with 7 nights over 11–28 Nov,
 * returns for 18 Nov – 5 Dec. Another length works wherever both of its days
 * were searched — 5 nights from 13 Nov on, 10 nights up to 25 Nov — so the
 * results are rebuilt from the flights already gathered, for those days only.
 */

import { TRIP_LENGTH_BUTTONS } from "@/lib/airsearcher/config/constants";
import { addDays, daysBetween } from "@/lib/airsearcher/time";
import {
  candidateDates,
  flexibleTripLength,
  returnDatesFor,
  tripLengthList,
} from "@/lib/airsearcher/queryPlan";
import { poolFromRecords } from "@/lib/airsearcher/serpApi";
import { buildAllArrangements } from "@/lib/airsearcher/search";
import type { RankingPreferences } from "@/lib/airsearcher/config/ranking";
import type { Arrangement, FlightRecord, SearchQuery } from "@/lib/airsearcher/types";

export interface LengthOption {
  nights: number;
  /** The departure days whose return day, this many nights later, was searched; may be empty. */
  departures: string[];
}

/**
 * Every trip length from 1 to TRIP_LENGTH_BUTTONS nights, shortest first, with
 * the departure days the searched days can answer for it: all of them, some,
 * or none (those need more dates searched). Empty for a one-way search.
 */
export function lengthOptions(query: SearchQuery): LengthOption[] {
  if (query.tripType !== "round-trip") return [];
  const departures = candidateDates(query);
  const returns = new Set(
    departures.flatMap((date) => returnDatesFor(query, date)).filter((d): d is string => d !== null),
  );
  return Array.from({ length: TRIP_LENGTH_BUTTONS }, (_, i) => {
    const nights = i + 1;
    return { nights, departures: departures.filter((date) => returns.has(addDays(date, nights))) };
  });
}

/** The fixed lengths a search was run for; empty for an open length. */
export function searchedLengths(query: SearchQuery): number[] {
  if (query.tripType !== "round-trip" || flexibleTripLength(query)) return [];
  const list = tripLengthList(query);
  if (list) return list;
  if (query.dateMode === "exact") {
    return query.departureDate && query.returnDate ? [daysBetween(query.departureDate, query.returnDate)] : [];
  }
  return query.tripDurationDays !== null ? [query.tripDurationDays] : [];
}

/** How many nights a result stays, or null one way. */
export function nightsOf(arrangement: Arrangement): number | null {
  return arrangement.returnDate ? daysBetween(arrangement.departureDate, arrangement.returnDate) : null;
}

/** The search itself, set to one fixed length. */
export function withLength(query: SearchQuery, nights: number): SearchQuery {
  return { ...query, tripDurationDays: nights, tripLengthRange: null, tripLengths: null };
}

/**
 * The results for another trip length, built from the search's saved flights
 * the way the search built its own. Departure days whose return day was never
 * searched find no flights home and so produce nothing.
 */
export function rebuildForLength(
  query: SearchQuery,
  preferences: RankingPreferences,
  records: FlightRecord[],
  nights: number,
): Arrangement[] {
  return buildAllArrangements(withLength(query, nights), preferences, poolFromRecords(records));
}
