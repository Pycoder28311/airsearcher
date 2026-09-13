/**
 * Every shape AirSearcher works with.
 *
 * The flight shapes are deliberately identical to the normalized SerpApi shapes
 * used by the reference project, so a later phase can swap mock data for a real
 * API response without touching anything downstream.
 */

/* ── Places ──────────────────────────────────────────────────────────────── */

/** IATA airport code, e.g. "ATH". */
export type AirportCode = string;

export interface Airport {
  code: AirportCode;
  name: string;
  /** Id of the city this airport serves — see `City.id`. */
  cityId: string;
  lat: number;
  lon: number;
  country: string;
}

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  airportCodes: AirportCode[];
}

/* ── Flights (mirrors the normalized SerpApi shape) ──────────────────────── */

export type FlightCategory = "best" | "other";

export interface NormalizedEndpoint {
  airport: AirportCode | null;
  airportName: string | null;
  /** Local time as "YYYY-MM-DD HH:MM". */
  time: string | null;
}

export interface NormalizedSegment {
  flightNumber: string | null;
  airline: string | null;
  airlineLogo: string | null;
  airplane: string | null;
  travelClass: string | null;
  departure: NormalizedEndpoint;
  arrival: NormalizedEndpoint;
  durationMinutes: number | null;
}

export interface NormalizedLayover {
  airport: AirportCode | null;
  airportName: string | null;
  durationMinutes: number | null;
  overnight: boolean;
}

export interface NormalizedLeg {
  segments: NormalizedSegment[];
  layovers: NormalizedLayover[];
  stops: number;
  totalDurationMinutes: number | null;
}

export interface NormalizedFlight {
  id: string;
  category: FlightCategory;
  price: number | null;
  currency: string;
  airline: { name: string | null; logo: string | null };
  outbound: NormalizedLeg;
  /** null in one-way mode. */
  return: NormalizedLeg | null;
  carbonEmissionsGrams: number | null;
  /** Negative is better than typical for the route; null when unknown. */
  carbonDifferencePercent: number | null;
  travelClass: string | null;
}

/**
 * One bookable option for a single origin/destination pair: a flight in one-way
 * mode, or an outbound/return pair in round-trip mode. Filtering and ranking
 * both operate on this unit.
 */
export interface Itinerary {
  id: string;
  outbound: NormalizedFlight;
  /** null in one-way mode. */
  return: NormalizedFlight | null;
  /**
   * Outbound fare plus return fare. Approximate for pairs — the sum of two
   * one-way fares is not a bookable round-trip fare.
   */
  totalPrice: number;
}

/** Both flights of an itinerary, skipping the return when there is none. */
export function legsOf(itinerary: Itinerary): NormalizedFlight[] {
  return itinerary.return
    ? [itinerary.outbound, itinerary.return]
    : [itinerary.outbound];
}

/* ── The group ───────────────────────────────────────────────────────────── */

/** How many passengers set off from one airport. */
export interface OriginGroup {
  airport: AirportCode;
  passengers: number;
}

/**
 * How one origin group reaches the destination.
 *   direct — straight from their own airport
 *   gather — fly to the gathering airport first, then on with everyone else
 */
export type Routing = "direct" | "gather";

/** One origin group's complete journey within an arrangement. */
export interface GroupLeg {
  origin: AirportCode;
  routing: Routing;
  /** origin -> gathering airport. null for direct legs and for the gathering origin itself. */
  feeder: Itinerary | null;
  /** The flight that actually reaches the destination. */
  main: Itinerary;
  passengers: number;
}

/**
 * ONE RESULT: a complete plan for the whole group — who flies direct, who
 * gathers first, and on which flights.
 */
export interface Arrangement {
  id: string;
  destination: { cityId: string; airport: AirportCode };
  gatheringAirport: AirportCode;
  /** The departure date this arrangement is built around. */
  departureDate: string;
  returnDate: string | null;
  legs: GroupLeg[];
  totals: ArrangementTotals;
  /** 0..1, higher is better. */
  score: number;
  indices: { price: number; hour: number | null };
}

export interface ArrangementTotals {
  /** Summed across every passenger, feeders included. */
  totalPrice: number;
  pricePerPassenger: number;
  passengers: number;
  /** Door-to-destination minutes for the group that travels longest. */
  longestTravelMinutes: number;
  earliestDeparture: string | null;
  latestArrival: string | null;
  /** How many passengers route via the gathering airport. */
  gatheringCount: number;
  /** Distinct airlines appearing anywhere in the arrangement. */
  airlines: string[];
}

/* ── The query ───────────────────────────────────────────────────────────── */

export type TripType = "round-trip" | "one-way";
export type DateMode = "exact" | "advanced";

export interface SearchQuery {
  destination: { cityId: string; airports: AirportCode[] };
  origins: OriginGroup[];
  gatheringAirport: AirportCode;
  tripType: TripType;
  dateMode: DateMode;
  /** Exact mode. */
  departureDate: string | null;
  /** Exact mode, round trip only. */
  returnDate: string | null;
  /** Advanced mode: the window the trip may start in. */
  dateRange: { start: string; end: string } | null;
  /** Advanced mode: fixed trip length in nights. */
  tripDurationDays: number | null;
  /** ISO dates that must never be used. */
  excludedDates: string[];
  /** ISO date -> 1..3. Higher breaks ties in favour of that date. */
  priorityDates: Record<string, number>;
}

/** Which routings the search is allowed to consider. */
export interface RoutingAllowance {
  direct: boolean;
  gather: boolean;
}

/* ── Raw gathered data ──────────────────────────────────────────────────── */

/**
 * Why a search was made — carried through to the stored data so the history can
 * say what each bucket of flights was for.
 *
 * Defined here rather than in `queryPlan` so the stored shapes do not depend on
 * the planner.
 */
export type SearchReason = "main" | "feeder" | "direct";

/**
 * Everything one search returned for one route, before any pairing, filtering
 * or ranking.
 *
 * One record is one billable request's worth of flights for a single route, so
 * the raw data can be read back exactly as it arrived. Flights are stored, not
 * itineraries: an itinerary pool is the cartesian product of outbound and
 * return flights (up to 40 x 40 per route), so persisting it would explode,
 * while itineraries rebuild from flights for free.
 */
export interface FlightRecord {
  /** `${from}-${to}-${date}-${direction}`. */
  id: string;
  from: AirportCode;
  to: AirportCode;
  date: string;
  direction: "outbound" | "return";
  reason: SearchReason;
  flights: NormalizedFlight[];
}
