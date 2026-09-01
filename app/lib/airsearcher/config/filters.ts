/**
 * Sidebar filter state.
 *
 * These are ABSOLUTE filters: an arrangement that fails one is removed from the
 * results, never merely penalised. Ordering is the separate concern of
 * `config/ranking.ts`.
 *
 * Ported from the reference project with the changes AirSearcher requires:
 * multi-city is gone, arrival-time windows sit alongside departure windows,
 * every scopable filter can target one direction, weights are five-level, and
 * the departure airports are editable from here.
 */

import type { AirportCode, OriginGroup, TripType } from "@/lib/airsearcher/types";
import {
  DEFAULT_GATHERING_AIRPORT,
  GREEK_ORIGIN_DEFAULTS,
} from "./constants";
import {
  DEFAULT_HOUR_LEVEL,
  DEFAULT_PRICE_LEVEL,
  type WeightLevel,
} from "./ranking";

export type StopOption = "non-stop" | "1" | "2" | "3+";
export type AirlineMode = "include" | "exclude";
export type TravelClass = "economy" | "premium_economy" | "business" | "first";

/** Which flight(s) a filter applies to. Only meaningful on a round trip. */
export type FilterScope = "both" | "going" | "returning";

/** The filters that can be pointed at one direction instead of the whole trip. */
export const SCOPABLE_FILTERS = [
  "stops",
  "price",
  "airlines",
  "times",
  "duration",
  "avoidAirports",
  "cabin",
] as const;

export type ScopableFilter = (typeof SCOPABLE_FILTERS)[number];

/** An hour window as [startHour, endHour], both 0..24. */
export type HourWindow = [number, number];

export interface FilterState {
  type: TripType;
  /** Empty means no restriction. */
  stops: StopOption[];
  priceRange: [number, number] | null;
  airlineMode: AirlineMode;
  /** Airline names as shown in results. */
  airlines: string[];

  /** When the outbound flight may leave. */
  outboundWindow: HourWindow;
  /** When the outbound flight may land. */
  outboundArrivalWindow: HourWindow;
  /** When the return flight may leave. */
  returnWindow: HourWindow;
  /** When the return flight may land. */
  returnArrivalWindow: HourWindow;

  maxDurationMinutes: number | null;
  /** [minMinutes, maxMinutes]. */
  layoverRange: [number, number] | null;
  /** Connecting airports the trip must avoid. */
  excludeAirports: AirportCode[];
  travelClass: TravelClass;
  lessEmissionsOnly: boolean;

  /** Per-filter direction targeting. Ignored on a one-way search. */
  scopes: Record<ScopableFilter, FilterScope>;

  /** Editable from the sidebar as well as the main search. */
  departureAirports: OriginGroup[];
  preferredGatheringAirport: AirportCode;

  /** Five-level weights feeding the ranking arithmetic. */
  priceWeight: WeightLevel;
  hourWeight: WeightLevel;
}

const DEFAULT_SCOPES: Record<ScopableFilter, FilterScope> = {
  stops: "both",
  price: "both",
  airlines: "both",
  times: "both",
  duration: "both",
  avoidAirports: "both",
  cabin: "both",
};

export const DEFAULT_FILTERS: FilterState = {
  type: "round-trip",
  stops: [],
  priceRange: null,
  airlineMode: "include",
  airlines: [],
  outboundWindow: [0, 24],
  outboundArrivalWindow: [0, 24],
  returnWindow: [0, 24],
  returnArrivalWindow: [0, 24],
  maxDurationMinutes: null,
  layoverRange: null,
  excludeAirports: [],
  travelClass: "economy",
  lessEmissionsOnly: false,
  scopes: { ...DEFAULT_SCOPES },
  departureAirports: GREEK_ORIGIN_DEFAULTS.map((airport, index) => ({
    airport,
    passengers: index === 0 ? 10 : 0,
  })),
  preferredGatheringAirport: DEFAULT_GATHERING_AIRPORT,
  priceWeight: DEFAULT_PRICE_LEVEL,
  hourWeight: DEFAULT_HOUR_LEVEL,
};

export const STOP_OPTIONS: { value: StopOption; label: string }[] = [
  { value: "non-stop", label: "Non-stop" },
  { value: "1", label: "1 stop" },
  { value: "2", label: "2 stops" },
  { value: "3+", label: "3+ stops" },
];

export const TRAVEL_CLASS_OPTIONS: { value: TravelClass; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium Economy" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];

/** Multi-city is deliberately absent — AirSearcher does not support it. */
export const TRIP_TYPE_OPTIONS: { value: TripType; label: string }[] = [
  { value: "round-trip", label: "Round trip" },
  { value: "one-way", label: "One way" },
];

export const FILTER_SCOPE_OPTIONS: { value: FilterScope; label: string }[] = [
  { value: "both", label: "Both flights" },
  { value: "going", label: "Going" },
  { value: "returning", label: "Returning" },
];

function windowIsDefault(w: HourWindow): boolean {
  return w[0] === 0 && w[1] === 24;
}

/** How many of the sidebar's filters are currently narrowing the results. */
export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.stops.length > 0) count++;
  if (filters.priceRange !== null) count++;
  if (filters.airlines.length > 0) count++;
  if (!windowIsDefault(filters.outboundWindow)) count++;
  if (!windowIsDefault(filters.outboundArrivalWindow)) count++;
  if (!windowIsDefault(filters.returnWindow)) count++;
  if (!windowIsDefault(filters.returnArrivalWindow)) count++;
  if (filters.maxDurationMinutes !== null) count++;
  if (filters.layoverRange !== null) count++;
  if (filters.excludeAirports.length > 0) count++;
  if (filters.travelClass !== "economy") count++;
  if (filters.lessEmissionsOnly) count++;
  return count;
}

/**
 * Restores every filter, scope and weight to its default while keeping the trip
 * type and the departure airports — those describe the search itself, not a
 * narrowing of its results, so resetting them would silently change the query.
 */
export function resetFilters(current: FilterState): FilterState {
  return {
    ...DEFAULT_FILTERS,
    type: current.type,
    departureAirports: current.departureAirports,
    preferredGatheringAirport: current.preferredGatheringAirport,
    scopes: { ...DEFAULT_SCOPES },
  };
}
