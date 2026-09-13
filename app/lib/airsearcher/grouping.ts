/**
 * Turning per-route flights into whole-group arrangements.
 *
 * This is the one genuinely new module: everything else is ported. It decides
 * which origin groups fly direct and which gather at a hub first — separately
 * for the way out and the way back — assembles a complete plan for the whole
 * group, and scores it.
 *
 * The scoring arithmetic is NOT reinvented — `priceIndex`, `legHourIndex` and
 * `normalizeWeights` come from `ranking.ts` unchanged. The only addition is a
 * passenger-weighted mean across the origin groups.
 */

import {
  DATE_PRIORITY_BONUS,
  MIN_GATHER_BUFFER_MINUTES,
} from "@/lib/airsearcher/config/constants";
import type {
  RankingPreferences,
  RankingWeights,
} from "@/lib/airsearcher/config/ranking";
import {
  legHourIndex,
  normalizeWeights,
  priceIndex,
  compareNullable,
} from "@/lib/airsearcher/ranking";
import { minutesBetweenTimes } from "@/lib/airsearcher/time";
import {
  journeyFlights,
  legFlights,
  type AirportCode,
  type Arrangement,
  type ArrangementTotals,
  type GroupLeg,
  type Journey,
  type NormalizedFlight,
  type OriginGroup,
  type Routing,
  type RoutingAllowance,
} from "@/lib/airsearcher/types";

/** How arrangements can be ordered on the results page. */
export type ArrangementSortMode =
  | "score"
  | "price"
  | "duration"
  | "departure";

/**
 * Flights keyed by `poolKey(from, to, date)`, cheapest first.
 *
 * Direction is not part of the key: a flight from A to B on a date is the same
 * flight whether a group takes it going out or coming back.
 */
export type FlightPool = Record<string, NormalizedFlight[]>;

/* ── Routings ────────────────────────────────────────────────────────────── */

/** How one origin group travels in each direction. */
export interface LegRouting {
  outbound: Routing;
  /** null on a one-way trip. */
  return: Routing | null;
}

/**
 * Every routing combination worth evaluating.
 *
 * The gathering airport's own group is always "direct" — it is already there,
 * so routing it through itself is meaningless and never emitted. Each other
 * origin picks a mode per direction, so with `n` origins and both modes allowed
 * this yields 2^(n-1) routings one-way and 4^(n-1) round trip.
 */
export function enumerateRoutings(
  origins: OriginGroup[],
  gatheringAirport: AirportCode,
  allow: RoutingAllowance,
  roundTrip = false,
): Record<AirportCode, LegRouting>[] {
  const travelling = origins.filter(
    (o) => o.airport !== gatheringAirport && o.passengers > 0,
  );

  const modes: Routing[] = [];
  if (allow.direct) modes.push("direct");
  if (allow.gather) modes.push("gather");
  if (modes.length === 0) return [];

  const choices: LegRouting[] = [];
  for (const outbound of modes) {
    if (!roundTrip) {
      choices.push({ outbound, return: null });
      continue;
    }
    for (const back of modes) choices.push({ outbound, return: back });
  }

  let routings: Record<AirportCode, LegRouting>[] = [{}];
  for (const origin of travelling) {
    const next: Record<AirportCode, LegRouting>[] = [];
    for (const partial of routings) {
      for (const choice of choices) {
        next.push({ ...partial, [origin.airport]: choice });
      }
    }
    routings = next;
  }

  // The gathering origin, when it is in the group, is always already there.
  const atHub = origins.find((o) => o.airport === gatheringAirport && o.passengers > 0);
  if (atHub) {
    const home: LegRouting = { outbound: "direct", return: roundTrip ? "direct" : null };
    routings = routings.map((r) => ({ ...r, [gatheringAirport]: home }));
  }

  return routings;
}

/* ── Assembly ────────────────────────────────────────────────────────────── */

/**
 * Key into the shared flight pool.
 *
 * The date is part of the key: in advanced mode one route is searched on many
 * candidate dates, and an arrangement must only ever be assembled from flights
 * that actually leave on its own dates.
 */
export function poolKey(from: AirportCode, to: AirportCode, date: string): string {
  return `${from}-${to}-${date}`;
}

/** Cheapest first; a missing price sorts last. Returns a new array. */
export function cheapestFirst(flights: NormalizedFlight[]): NormalizedFlight[] {
  return [...flights].sort((a, b) => compareNullable(a.price, b.price, "asc"));
}

/** Cheapest flight in a list; null when the list is empty. */
function cheapest(list: NormalizedFlight[] | undefined): NormalizedFlight | null {
  if (!list || list.length === 0) return null;
  return cheapestFirst(list)[0];
}

/** When a flight leaves, as a full "YYYY-MM-DD HH:MM" string. */
function departureTimeOf(flight: NormalizedFlight): string | null {
  return flight.outbound.segments[0]?.departure.time ?? null;
}

/** When a flight lands, as a full "YYYY-MM-DD HH:MM" string. */
function arrivalTimeOf(flight: NormalizedFlight): string | null {
  const segments = flight.outbound.segments;
  return segments[segments.length - 1]?.arrival.time ?? null;
}

/**
 * Whether two separately booked flights connect: the first must land at least
 * MIN_GATHER_BUFFER_MINUTES before the second leaves. Anything tighter is not a
 * connection anyone would book, so it is rejected outright rather than scored
 * badly. Going out the feeder comes first; coming back the main flight does.
 *
 * An unreadable time is treated as connecting — an absent time is not evidence
 * of a bad one.
 */
export function flightsConnect(first: NormalizedFlight, second: NormalizedFlight): boolean {
  const gap = minutesBetweenTimes(arrivalTimeOf(first), departureTimeOf(second));
  if (gap === null) return true;
  return gap >= MIN_GATHER_BUFFER_MINUTES;
}

/** When a journey's first flight leaves. */
export function journeyDeparture(journey: Journey): string | null {
  return departureTimeOf(journeyFlights(journey)[0]);
}

/** When a journey's last flight lands. */
export function journeyArrival(journey: Journey): string | null {
  const flights = journeyFlights(journey);
  return arrivalTimeOf(flights[flights.length - 1]);
}

/** What one passenger of a group pays, every flight in both directions. */
export function pricePerHeadOf(leg: GroupLeg): number {
  return legFlights(leg).reduce((sum, flight) => sum + (flight.price ?? 0), 0);
}

/** Door-to-destination minutes for a group's way out, feeder wait included. */
function travelMinutesOf(leg: GroupLeg): number {
  const span = minutesBetweenTimes(
    journeyDeparture(leg.outbound),
    journeyArrival(leg.outbound),
  );
  if (span !== null && span > 0) return span;

  // Fall back to the flights' own durations when the clock times are unusable.
  return journeyFlights(leg.outbound).reduce(
    (sum, flight) => sum + (flight.outbound.totalDurationMinutes ?? 0),
    0,
  );
}

function totalsOf(legs: GroupLeg[], gatheringAirport: AirportCode): ArrangementTotals {
  let totalPrice = 0;
  let passengers = 0;
  let gatheringCount = 0;
  let longestTravelMinutes = 0;
  const airlines = new Set<string>();
  const departures: string[] = [];
  const arrivals: string[] = [];

  for (const leg of legs) {
    passengers += leg.passengers;
    const gathers =
      leg.outbound.routing === "gather" || leg.return?.routing === "gather";
    if (gathers && leg.origin !== gatheringAirport) {
      gatheringCount += leg.passengers;
    }

    totalPrice += pricePerHeadOf(leg) * leg.passengers;

    longestTravelMinutes = Math.max(longestTravelMinutes, travelMinutesOf(leg));

    for (const flight of legFlights(leg)) {
      if (flight.airline.name) airlines.add(flight.airline.name);
    }

    const departure = journeyDeparture(leg.outbound);
    if (departure) departures.push(departure);
    const arrival = journeyArrival(leg.outbound);
    if (arrival) arrivals.push(arrival);
  }

  return {
    totalPrice: Math.round(totalPrice),
    pricePerPassenger: passengers > 0 ? Math.round(totalPrice / passengers) : 0,
    passengers,
    longestTravelMinutes,
    earliestDeparture: departures.length > 0 ? departures.sort()[0] : null,
    latestArrival: arrivals.length > 0 ? arrivals.sort()[arrivals.length - 1] : null,
    gatheringCount,
    airlines: [...airlines].sort(),
  };
}

export interface BuildArrangementsArgs {
  origins: OriginGroup[];
  gatheringAirport: AirportCode;
  destination: { cityId: string; airport: AirportCode };
  /** The shared, deduplicated flight pool. */
  pool: FlightPool;
  departureDate: string;
  /** null for a one-way trip. */
  returnDate: string | null;
  allow: RoutingAllowance;
}

/**
 * One arrangement per viable routing, each picking the cheapest usable flight
 * for every hop. A routing that cannot be flown produces no arrangement at all
 * rather than a bad one — no flights in the pool, a gather hop that does not
 * connect, or, on a round trip, any group without a way back.
 */
export function buildArrangements(args: BuildArrangementsArgs): Arrangement[] {
  const { origins, gatheringAirport: hub, destination, pool, allow } = args;
  const active = origins.filter((o) => o.passengers > 0);
  if (active.length === 0) return [];

  const date = args.departureDate;
  const returnDate = args.returnDate;
  const dest = destination.airport;

  // Everyone who gathers shares the same hub flight in each direction.
  const mainOut = cheapest(pool[poolKey(hub, dest, date)]);
  const mainBack = returnDate ? cheapest(pool[poolKey(dest, hub, returnDate)]) : null;

  // A group's options depend only on its own airport, so each is worked out once
  // and shared by every routing that uses it.
  const journeys = new Map<string, Journey | null>();
  const journeyFor = (
    origin: AirportCode,
    direction: Journey["direction"],
    routing: Routing,
  ): Journey | null => {
    const id = `${origin}|${direction}|${routing}`;
    if (journeys.has(id)) return journeys.get(id)!;

    let journey: Journey | null = null;
    if (direction === "outbound") {
      if (routing === "direct" || origin === hub) {
        const main = cheapest(pool[poolKey(origin, dest, date)]);
        if (main) journey = { direction, routing: "direct", feeder: null, main };
      } else {
        const feeder = cheapest(pool[poolKey(origin, hub, date)]);
        if (feeder && mainOut && flightsConnect(feeder, mainOut)) {
          journey = { direction, routing, feeder, main: mainOut };
        }
      }
    } else if (returnDate) {
      if (routing === "direct" || origin === hub) {
        const main = cheapest(pool[poolKey(dest, origin, returnDate)]);
        if (main) journey = { direction, routing: "direct", feeder: null, main };
      } else {
        const feeder = cheapest(pool[poolKey(hub, origin, returnDate)]);
        if (feeder && mainBack && flightsConnect(mainBack, feeder)) {
          journey = { direction, routing, feeder, main: mainBack };
        }
      }
    }

    journeys.set(id, journey);
    return journey;
  };

  const arrangements: Arrangement[] = [];

  for (const routing of enumerateRoutings(active, hub, allow, returnDate !== null)) {
    const legs: GroupLeg[] = [];
    let viable = true;

    for (const origin of active) {
      const mode = routing[origin.airport] ?? { outbound: "direct", return: null };

      const outbound = journeyFor(origin.airport, "outbound", mode.outbound);
      const back = returnDate
        ? journeyFor(origin.airport, "return", mode.return ?? "direct")
        : null;
      if (!outbound || (returnDate && !back)) {
        viable = false;
        break;
      }

      legs.push({
        origin: origin.airport,
        outbound,
        return: back,
        passengers: origin.passengers,
      });
    }

    if (!viable || legs.length === 0) continue;

    const symbol = (journey: Journey | null) =>
      journey === null ? "" : journey.routing === "gather" ? ">" : "-";

    arrangements.push({
      id: `${dest}:${date}:${legs
        .map((l) => `${l.origin}${symbol(l.outbound)}${symbol(l.return)}`)
        .join("")}`,
      destination,
      gatheringAirport: hub,
      departureDate: date,
      returnDate,
      legs,
      totals: totalsOf(legs, hub),
      score: 0,
      indices: { price: 0, hour: null },
    });
  }

  return arrangements;
}

/* ── Scoring ─────────────────────────────────────────────────────────────── */

/**
 * The group's hour index: each origin group's convenience, weighted by how many
 * people it affects. Bad hours for two passengers must not cost as much as bad
 * hours for twenty.
 */
function groupHourIndex(
  legs: GroupLeg[],
  preferences: RankingPreferences,
): number | null {
  const { curves, departureArrivalRatio } = preferences;
  let weighted = 0;
  let weight = 0;

  for (const leg of legs) {
    const values: number[] = [];

    for (const journey of leg.return ? [leg.outbound, leg.return] : [leg.outbound]) {
      const curve = journey.direction === "outbound" ? curves.outbound : curves.return;
      for (const flight of journeyFlights(journey)) {
        const value = legHourIndex(flight.outbound, curve, departureArrivalRatio);
        if (value !== null) values.push(value);
      }
    }

    if (values.length === 0) continue;
    const legIndex = values.reduce((sum, v) => sum + v, 0) / values.length;
    weighted += legIndex * leg.passengers;
    weight += leg.passengers;
  }

  return weight > 0 ? weighted / weight : null;
}

/**
 * Scores every arrangement relative to the others.
 *
 * `priceIndex` is relative to the current set, exactly as in the reference
 * project: filtering something out legitimately changes everyone's score.
 * Priority dates add a small bonus so a favoured date wins between near-equal
 * options without dragging a clearly worse one to the top.
 */
export function scoreArrangements(
  arrangements: Arrangement[],
  weights: RankingWeights,
  preferences: RankingPreferences,
  priorityDates: Record<string, number> = {},
): Arrangement[] {
  const totals = arrangements.map((a) => a.totals.totalPrice).filter(Number.isFinite);
  const min = totals.length > 0 ? Math.min(...totals) : 0;
  const max = totals.length > 0 ? Math.max(...totals) : 0;

  const base = normalizeWeights(weights);

  return arrangements.map((arrangement) => {
    const hourIndex = groupHourIndex(arrangement.legs, preferences);
    const price = priceIndex(arrangement.totals.totalPrice, min, max);

    // With no usable hour index the hour term would read as zero convenience,
    // which is a lie. Drop it and give price the full weight.
    const effective = hourIndex === null ? { price: 1, hour: 0 } : base;

    const priority = priorityDates[arrangement.departureDate] ?? 0;
    const bonus = Math.max(0, Math.min(3, priority)) * DATE_PRIORITY_BONUS;

    const score =
      price * effective.price + (hourIndex ?? 0) * effective.hour + bonus;

    return {
      ...arrangement,
      score: Math.min(score, 1),
      indices: { price, hour: hourIndex },
    };
  });
}

/** Returns a new array; never mutates the input. */
export function sortArrangements(
  arrangements: Arrangement[],
  mode: ArrangementSortMode,
): Arrangement[] {
  const copy = [...arrangements];

  switch (mode) {
    case "price":
      return copy.sort((a, b) => a.totals.totalPrice - b.totals.totalPrice);
    case "duration":
      return copy.sort(
        (a, b) => a.totals.longestTravelMinutes - b.totals.longestTravelMinutes,
      );
    case "departure":
      return copy.sort((a, b) =>
        (a.totals.earliestDeparture ?? "").localeCompare(
          b.totals.earliestDeparture ?? "",
        ),
      );
    case "score":
    default:
      return copy.sort((a, b) => compareNullable(a.score, b.score, "desc"));
  }
}

/**
 * How one group travels, e.g. "direct", "via ATH", or "direct out, via ATH back"
 * when the two directions differ.
 */
export function routingLabel(leg: GroupLeg, gatheringAirport: AirportCode): string {
  const label = (routing: Routing) =>
    routing === "gather" ? `via ${gatheringAirport}` : "direct";
  if (!leg.return || leg.return.routing === leg.outbound.routing) {
    return label(leg.outbound.routing);
  }
  return `${label(leg.outbound.routing)} out, ${label(leg.return.routing)} back`;
}

/** A short human summary of who flies how, e.g. "ATH direct · SKG, HER via ATH". */
export function describeRouting(arrangement: Arrangement): string {
  const byLabel = new Map<string, AirportCode[]>();
  for (const leg of arrangement.legs) {
    const label = routingLabel(leg, arrangement.gatheringAirport);
    byLabel.set(label, [...(byLabel.get(label) ?? []), leg.origin]);
  }
  return [...byLabel.entries()]
    .map(([label, origins]) => `${origins.join(", ")} ${label}`)
    .join(" · ");
}
