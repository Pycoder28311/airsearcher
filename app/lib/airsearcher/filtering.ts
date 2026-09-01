/**
 * Absolute filters over already-built arrangements.
 *
 * These REMOVE arrangements that do not match. They never re-weight or
 * re-order — that is the separate job of `ranking.ts` and `grouping.ts`.
 * Nothing here fetches, so every filter is free.
 *
 * Ported from the reference project, with one addition: every predicate takes a
 * `FilterScope`, so a filter can be pointed at the going flight, the returning
 * flight, or both. An arrangement passes only when every itinerary in it — every
 * origin group's feeder and main flight — passes.
 */

import { legsOf, type Arrangement, type Itinerary, type NormalizedFlight } from "@/lib/airsearcher/types";
import { parseFlightHour } from "@/lib/airsearcher/ranking";
import type {
  FilterScope,
  FilterState,
  HourWindow,
  StopOption,
} from "@/lib/airsearcher/config/filters";

/* ── Scope ───────────────────────────────────────────────────────────────── */

/**
 * The flights a scoped filter looks at. "going" is the outbound flight,
 * "returning" the return; on a one-way itinerary both non-"going" scopes still
 * fall back to what exists, so a scope can never silently match nothing.
 */
export function flightsInScope(
  itinerary: Itinerary,
  scope: FilterScope,
): NormalizedFlight[] {
  if (scope === "going") return [itinerary.outbound];
  if (scope === "returning") return itinerary.return ? [itinerary.return] : [];
  return legsOf(itinerary);
}

/** Every itinerary an arrangement is built from: each leg's feeder and main. */
export function itinerariesOf(arrangement: Arrangement): Itinerary[] {
  const list: Itinerary[] = [];
  for (const leg of arrangement.legs) {
    if (leg.feeder) list.push(leg.feeder);
    list.push(leg.main);
  }
  return list;
}

/* ── Predicates, one per filter ──────────────────────────────────────────── */

/** Which stop bucket a flight falls into. */
export function stopBucket(stops: number): StopOption {
  if (stops <= 0) return "non-stop";
  if (stops === 1) return "1";
  if (stops === 2) return "2";
  return "3+";
}

/** Every in-scope flight must fall in one of the selected buckets. */
export function matchesStops(
  itinerary: Itinerary,
  selected: StopOption[],
  scope: FilterScope = "both",
): boolean {
  if (selected.length === 0) return true;
  return flightsInScope(itinerary, scope).every((flight) =>
    selected.includes(stopBucket(flight.outbound.stops)),
  );
}

export function matchesPrice(
  itinerary: Itinerary,
  range: [number, number] | null,
): boolean {
  if (range === null) return true;
  return itinerary.totalPrice >= range[0] && itinerary.totalPrice <= range[1];
}

/**
 * Include: at least one in-scope flight is flown by a selected airline.
 * Exclude: none is.
 */
export function matchesAirlines(
  itinerary: Itinerary,
  mode: "include" | "exclude",
  selected: string[],
  scope: FilterScope = "both",
): boolean {
  if (selected.length === 0) return true;
  const names = flightsInScope(itinerary, scope).map((f) => f.airline.name);
  const hit = names.some((n) => n !== null && selected.includes(n));
  return mode === "include" ? hit : !hit;
}

/** The hour a flight leaves, from its first segment. */
function departureHour(flight: NormalizedFlight): number | null {
  return parseFlightHour(flight.outbound.segments[0]?.departure.time);
}

/** The hour a flight lands, from its last segment. */
function arrivalHour(flight: NormalizedFlight): number | null {
  const segments = flight.outbound.segments;
  return parseFlightHour(segments[segments.length - 1]?.arrival.time);
}

/**
 * A window of [0, 24] means no restriction. A flight with an unreadable time is
 * kept rather than silently dropped — an absent time is not evidence of a bad
 * one.
 */
export function matchesTimeWindow(
  flight: NormalizedFlight | null,
  window: HourWindow,
  which: "departure" | "arrival" = "departure",
): boolean {
  if (!flight) return true;
  if (window[0] <= 0 && window[1] >= 24) return true;

  const hour = which === "departure" ? departureHour(flight) : arrivalHour(flight);
  if (hour === null) return true;
  return hour >= window[0] && hour <= window[1];
}

/** Every in-scope flight must be within the limit. */
export function matchesMaxDuration(
  itinerary: Itinerary,
  maxMinutes: number | null,
  scope: FilterScope = "both",
): boolean {
  if (maxMinutes === null) return true;
  return flightsInScope(itinerary, scope).every((flight) => {
    const total = flight.outbound.totalDurationMinutes;
    return total === null || total <= maxMinutes;
  });
}

/** Every layover on every in-scope flight must sit inside the range. */
export function matchesLayover(
  itinerary: Itinerary,
  range: [number, number] | null,
  scope: FilterScope = "both",
): boolean {
  if (range === null) return true;
  return flightsInScope(itinerary, scope).every((flight) =>
    flight.outbound.layovers.every((l) => {
      if (l.durationMinutes === null) return true;
      return l.durationMinutes >= range[0] && l.durationMinutes <= range[1];
    }),
  );
}

/** Airports an itinerary connects through, excluding origin and destination. */
export function connectingAirports(
  itinerary: Itinerary,
  scope: FilterScope = "both",
): string[] {
  const codes = new Set<string>();
  for (const flight of flightsInScope(itinerary, scope)) {
    for (const l of flight.outbound.layovers) {
      if (l.airport) codes.add(l.airport);
    }
    // Fall back to segment boundaries when layovers are absent.
    const segments = flight.outbound.segments;
    for (let i = 0; i < segments.length - 1; i++) {
      const code = segments[i].arrival.airport;
      if (code) codes.add(code);
    }
  }
  return [...codes];
}

export function avoidsAirports(
  itinerary: Itinerary,
  excluded: string[],
  scope: FilterScope = "both",
): boolean {
  if (excluded.length === 0) return true;
  const upper = excluded.map((c) => c.toUpperCase());
  return !connectingAirports(itinerary, scope).some((code) =>
    upper.includes(code.toUpperCase()),
  );
}

const TRAVEL_CLASS_LABELS: Record<string, string> = {
  economy: "economy",
  premium_economy: "premium economy",
  business: "business",
  first: "first",
};

/** Every segment of every in-scope flight must be in the requested cabin. */
export function matchesTravelClass(
  itinerary: Itinerary,
  travelClass: string,
  scope: FilterScope = "both",
): boolean {
  const wanted = TRAVEL_CLASS_LABELS[travelClass] ?? travelClass;
  return flightsInScope(itinerary, scope).every((flight) =>
    flight.outbound.segments.every((s) => {
      if (!s.travelClass) return true;
      return s.travelClass.toLowerCase() === wanted;
    }),
  );
}

/** At or below what is typical for the route, on every flight. */
export function matchesEmissions(
  itinerary: Itinerary,
  lessOnly: boolean,
): boolean {
  if (!lessOnly) return true;
  return legsOf(itinerary).every((flight) => {
    const diff = flight.carbonDifferencePercent;
    return diff === null || diff <= 0;
  });
}

/* ── Composition ─────────────────────────────────────────────────────────── */

/** Filter groups, so counts can exclude the group being counted. */
export type FilterGroupKey =
  | "stops"
  | "price"
  | "airlines"
  | "times"
  | "duration"
  | "layover"
  | "airports"
  | "travelClass"
  | "emissions";

function itineraryPasses(
  itinerary: Itinerary,
  filters: FilterState,
  skip?: FilterGroupKey,
): boolean {
  const s = filters.scopes;

  // Price is deliberately absent: it is judged once on the group total in
  // `arrangementPasses`, never per itinerary.
  if (skip !== "stops" && !matchesStops(itinerary, filters.stops, s.stops)) {
    return false;
  }
  if (
    skip !== "airlines" &&
    !matchesAirlines(itinerary, filters.airlineMode, filters.airlines, s.airlines)
  ) {
    return false;
  }
  if (skip !== "times") {
    const going = s.times !== "returning";
    const returning = s.times !== "going";
    if (going) {
      if (!matchesTimeWindow(itinerary.outbound, filters.outboundWindow, "departure")) {
        return false;
      }
      if (
        !matchesTimeWindow(itinerary.outbound, filters.outboundArrivalWindow, "arrival")
      ) {
        return false;
      }
    }
    if (returning) {
      if (!matchesTimeWindow(itinerary.return, filters.returnWindow, "departure")) {
        return false;
      }
      if (
        !matchesTimeWindow(itinerary.return, filters.returnArrivalWindow, "arrival")
      ) {
        return false;
      }
    }
  }
  if (
    skip !== "duration" &&
    !matchesMaxDuration(itinerary, filters.maxDurationMinutes, s.duration)
  ) {
    return false;
  }
  if (
    skip !== "layover" &&
    !matchesLayover(itinerary, filters.layoverRange, s.duration)
  ) {
    return false;
  }
  if (
    skip !== "airports" &&
    !avoidsAirports(itinerary, filters.excludeAirports, s.avoidAirports)
  ) {
    return false;
  }
  if (
    skip !== "travelClass" &&
    !matchesTravelClass(itinerary, filters.travelClass, s.cabin)
  ) {
    return false;
  }
  if (
    skip !== "emissions" &&
    !matchesEmissions(itinerary, filters.lessEmissionsOnly)
  ) {
    return false;
  }
  return true;
}

/**
 * An arrangement survives only when every itinerary it is built from survives.
 * Price is the exception: it is judged on the group total, not per itinerary,
 * because a filter on price means what the whole group pays.
 */
function arrangementPasses(
  arrangement: Arrangement,
  filters: FilterState,
  skip?: FilterGroupKey,
): boolean {
  if (skip !== "price" && filters.priceRange !== null) {
    const [min, max] = filters.priceRange;
    const total = arrangement.totals.totalPrice;
    if (total < min || total > max) return false;
  }

  return itinerariesOf(arrangement).every((it) => itineraryPasses(it, filters, skip));
}

/** Returns a new array holding only the arrangements that pass every filter. */
export function applyScopedFilters(
  arrangements: Arrangement[],
  filters: FilterState,
): Arrangement[] {
  return arrangements.filter((a) => arrangementPasses(a, filters));
}

/**
 * How many arrangements each filter value would leave, counted against the
 * other active filters but ignoring its own group.
 *
 * This is what makes a zero count honest: it means nothing would survive if you
 * ticked this, not that nothing exists.
 */
export function countsFor(
  arrangements: Arrangement[],
  filters: FilterState,
): Record<string, number> {
  const counts: Record<string, number> = {};

  const withoutStops = arrangements.filter((a) => arrangementPasses(a, filters, "stops"));
  for (const bucket of ["non-stop", "1", "2", "3+"] as StopOption[]) {
    counts[`stops:${bucket}`] = withoutStops.filter((a) =>
      itinerariesOf(a).every((it) => matchesStops(it, [bucket], filters.scopes.stops)),
    ).length;
  }

  const withoutAirlines = arrangements.filter((a) =>
    arrangementPasses(a, filters, "airlines"),
  );
  for (const name of airlinesIn(arrangements)) {
    counts[`airline:${name}`] = withoutAirlines.filter((a) =>
      itinerariesOf(a).some((it) =>
        matchesAirlines(it, filters.airlineMode, [name], filters.scopes.airlines),
      ),
    ).length;
  }

  const withoutClass = arrangements.filter((a) =>
    arrangementPasses(a, filters, "travelClass"),
  );
  for (const cabin of Object.keys(TRAVEL_CLASS_LABELS)) {
    counts[`class:${cabin}`] = withoutClass.filter((a) =>
      itinerariesOf(a).every((it) => matchesTravelClass(it, cabin, filters.scopes.cabin)),
    ).length;
  }

  counts["emissions:less"] = arrangements
    .filter((a) => arrangementPasses(a, filters, "emissions"))
    .filter((a) => itinerariesOf(a).every((it) => matchesEmissions(it, true))).length;

  return counts;
}

/** Every airline name appearing anywhere in the given arrangements. */
export function airlinesIn(arrangements: Arrangement[]): string[] {
  const names = new Set<string>();
  for (const arrangement of arrangements) {
    for (const name of arrangement.totals.airlines) names.add(name);
  }
  return [...names].sort();
}

/** Every connecting airport appearing anywhere in the given arrangements. */
export function connectingAirportsIn(arrangements: Arrangement[]): string[] {
  const codes = new Set<string>();
  for (const arrangement of arrangements) {
    for (const itinerary of itinerariesOf(arrangement)) {
      for (const code of connectingAirports(itinerary)) codes.add(code);
    }
  }
  return [...codes].sort();
}

export interface EmptyReason {
  group: FilterGroupKey;
  label: string;
  /** How many results clearing this one filter would bring back. */
  wouldRestore: number;
}

/**
 * Which filters are responsible when nothing survives — each entry names a
 * filter whose removal alone would bring results back, most effective first.
 */
export function explainEmpty(
  arrangements: Arrangement[],
  filters: FilterState,
): EmptyReason[] {
  if (arrangements.length === 0) return [];

  const isDefaultWindow = (w: HourWindow) => w[0] === 0 && w[1] === 24;

  const groups: { group: FilterGroupKey; label: string; active: boolean }[] = [
    { group: "stops", label: "Stops", active: filters.stops.length > 0 },
    { group: "price", label: "Price", active: filters.priceRange !== null },
    { group: "airlines", label: "Airlines", active: filters.airlines.length > 0 },
    {
      group: "times",
      label: "Departure & arrival times",
      active:
        !isDefaultWindow(filters.outboundWindow) ||
        !isDefaultWindow(filters.outboundArrivalWindow) ||
        !isDefaultWindow(filters.returnWindow) ||
        !isDefaultWindow(filters.returnArrivalWindow),
    },
    {
      group: "duration",
      label: "Max duration",
      active: filters.maxDurationMinutes !== null,
    },
    {
      group: "layover",
      label: "Layover duration",
      active: filters.layoverRange !== null,
    },
    {
      group: "airports",
      label: "Avoided airports",
      active: filters.excludeAirports.length > 0,
    },
    {
      group: "travelClass",
      label: "Travel class",
      active: filters.travelClass !== "economy",
    },
    {
      group: "emissions",
      label: "Less emissions only",
      active: filters.lessEmissionsOnly,
    },
  ];

  return groups
    .filter((g) => g.active)
    .map((g) => ({
      group: g.group,
      label: g.label,
      wouldRestore: arrangements.filter((a) => arrangementPasses(a, filters, g.group))
        .length,
    }))
    .filter((g) => g.wouldRestore > 0)
    .sort((a, b) => b.wouldRestore - a.wouldRestore);
}
