/**
 * Turning per-route flights into whole-group arrangements.
 *
 * This is the one genuinely new module: everything else is ported. It decides
 * which origin groups fly direct and which gather at a hub first, assembles a
 * complete plan for the whole group, and scores it.
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

/** The airline name a flight gets when its segments are on different airlines. */
export const MULTIPLE_AIRLINES = "Multiple airlines";

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
  /** null on a one-way trip; otherwise the same as `outbound`. */
  return: Routing | null;
}

/**
 * Every routing combination worth evaluating.
 *
 * The gathering airport's own group is always "direct" — it is already there,
 * so routing it through itself is meaningless and never emitted. Each other
 * origin picks one mode for the whole trip, so with `n` origins and both modes
 * allowed this yields 2^(n-1) routings.
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

  const choices: LegRouting[] = modes.map((mode) => ({
    outbound: mode,
    return: roundTrip ? mode : null,
  }));

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

/**
 * What a flight physically is: its segments' flight numbers and departure
 * times. Providers can return the same flight several times under different
 * ids (Google lists some in both "best" and "other"), so this — not the id — is
 * what identifies a duplicate.
 */
export function flightKey(flight: NormalizedFlight): string {
  return segmentKeys([flight]).join("+");
}

function segmentKeys(flights: NormalizedFlight[]): string[] {
  return flights.flatMap((flight) =>
    flight.outbound.segments.map(
      (s) =>
        `${s.flightNumber ?? `${s.departure.airport}-${s.arrival.airport}`}@${s.departure.time ?? ""}`,
    ),
  );
}

/** One copy of each flight, the cheapest where copies differ in price. */
export function uniqueFlights(flights: NormalizedFlight[]): NormalizedFlight[] {
  const byKey = new Map<string, NormalizedFlight>();
  for (const flight of cheapestFirst(flights)) {
    const key = flightKey(flight);
    if (!byKey.has(key)) byKey.set(key, flight);
  }
  return [...byKey.values()];
}

/**
 * One copy of each arrangement that flies the same segments for every group.
 * The same two flights can be one ticket with a stop or two separate tickets
 * via the hub; only the cheaper is kept, the single ticket on a tie.
 */
export function uniqueArrangements(arrangements: Arrangement[]): Arrangement[] {
  const tickets = (a: Arrangement) => a.legs.reduce((n, leg) => n + legFlights(leg).length, 0);
  const signature = (a: Arrangement) =>
    `${a.destination.airport}|${a.departureDate}|${[...a.legs]
      .sort((x, y) => x.origin.localeCompare(y.origin))
      .map((leg) => {
        const back = leg.return ? segmentKeys(journeyFlights(leg.return)).join("+") : "";
        return `${leg.origin}:${segmentKeys(journeyFlights(leg.outbound)).join("+")}/${back}`;
      })
      .join(";")}`;

  const kept = new Map<string, Arrangement>();
  for (const arrangement of arrangements) {
    const key = signature(arrangement);
    const current = kept.get(key);
    const better =
      !current ||
      arrangement.totals.totalPrice < current.totals.totalPrice ||
      (arrangement.totals.totalPrice === current.totals.totalPrice &&
        tickets(arrangement) < tickets(current));
    if (better) kept.set(key, arrangement);
  }
  // Keep the original order among the survivors.
  const survivors = new Set(kept.values());
  return arrangements.filter((a) => survivors.has(a));
}

/** Cheapest first; a missing price sorts last. Returns a new array. */
export function cheapestFirst(flights: NormalizedFlight[]): NormalizedFlight[] {
  return [...flights].sort((a, b) => compareNullable(a.price, b.price, "asc"));
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
  /** Only arrangements where every flight is on one airline. */
  sameAirline?: boolean;
}

/**
 * Arrangements flown entirely by one airline: the normal assembly run once per
 * airline on a pool holding only that airline's flights. A flight shared
 * between airlines ("Multiple airlines", or no name) never qualifies.
 */
function buildSameAirlineArrangements(args: BuildArrangementsArgs): Arrangement[] {
  const airlines = new Set<string>();
  for (const flights of Object.values(args.pool)) {
    for (const flight of flights) {
      if (flight.airline.name && flight.airline.name !== MULTIPLE_AIRLINES) {
        airlines.add(flight.airline.name);
      }
    }
  }

  return [...airlines].flatMap((airline) => {
    const pool: FlightPool = {};
    for (const [key, flights] of Object.entries(args.pool)) {
      pool[key] = flights.filter((flight) => flight.airline.name === airline);
    }
    // The airline is part of the id: two airlines can share the same routing.
    return buildArrangements({ ...args, pool, sameAirline: false }).map((arrangement) => ({
      ...arrangement,
      id: `${arrangement.id}:${airline}`,
    }));
  });
}

/** Cheapest flights considered per hop; every connecting combination of them is tried. */
export const OPTIONS_PER_HOP = 5;

/** Most arrangements kept per routing, per destination airport and date — cheapest first. */
export const ARRANGEMENTS_PER_ROUTING = 10;

/** The cheapest few distinct flights of a route; empty when the route has none. */
function topFlights(list: NormalizedFlight[] | undefined): NormalizedFlight[] {
  return uniqueFlights(list ?? []).slice(0, OPTIONS_PER_HOP);
}

/** FNV-1a, so an arrangement id can name its flights without growing unbounded. */
function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Arrangements for every viable routing, trying the cheapest few flights on
 * each hop rather than only the cheapest one — so a feeder that misses the
 * cheapest hub flight can still catch a later one, and more than one option per
 * routing reaches the results. Ranking decides the order.
 *
 * Everyone who gathers shares one hub flight each way, and so does the hub's
 * own group. A way out that cannot be flown — no flights, or a feeder that does
 * not connect — produces nothing. The way back is best-effort: a group with no
 * return flights keeps a null return, and return hops are not checked for
 * connection.
 */
export function buildArrangements(args: BuildArrangementsArgs): Arrangement[] {
  if (args.sameAirline) return buildSameAirlineArrangements(args);

  const { origins, gatheringAirport: hub, destination, pool, allow } = args;
  const active = origins.filter((o) => o.passengers > 0);
  if (active.length === 0) return [];

  const date = args.departureDate;
  const returnDate = args.returnDate;
  const dest = destination.airport;
  const direct = (direction: Journey["direction"], main: NormalizedFlight): Journey => ({
    direction,
    routing: "direct",
    feeder: null,
    main,
  });

  const arrangements: Arrangement[] = [];

  for (const routing of enumerateRoutings(active, hub, allow, returnDate !== null)) {
    const modeOf = (airport: AirportCode) => routing[airport]?.outbound ?? "direct";
    const gathering = active.some((o) => o.airport !== hub && modeOf(o.airport) === "gather");

    // The shared hub flights; without anyone gathering there is nothing to share.
    const mainsOut: (NormalizedFlight | null)[] = gathering
      ? topFlights(pool[poolKey(hub, dest, date)])
      : [null];
    if (mainsOut.length === 0) continue;
    const backs = gathering && returnDate ? topFlights(pool[poolKey(dest, hub, returnDate)]) : [];
    const mainsBack: (NormalizedFlight | null)[] = backs.length > 0 ? backs : [null];

    const candidates = new Map<string, Arrangement>();

    for (const mainOut of mainsOut) {
      for (const mainBack of mainsBack) {
        /** Every way one group can fly this routing with these hub flights. */
        const legOptions = (origin: OriginGroup): GroupLeg[] => {
          const airport = origin.airport;
          const gathers = airport !== hub && modeOf(airport) === "gather";

          let outs: Journey[];
          if (airport === hub && mainOut) outs = [direct("outbound", mainOut)];
          else if (!gathers) outs = topFlights(pool[poolKey(airport, dest, date)]).map((f) => direct("outbound", f));
          else {
            outs = topFlights(pool[poolKey(airport, hub, date)])
              .filter((feeder) => flightsConnect(feeder, mainOut!))
              .map((feeder) => ({ direction: "outbound", routing: "gather", feeder, main: mainOut! }));
          }

          let backsFor: (Journey | null)[] = [null];
          if (returnDate) {
            let options: Journey[];
            if (airport === hub && gathering) options = mainBack ? [direct("return", mainBack)] : [];
            else if (!gathers) options = topFlights(pool[poolKey(dest, airport, returnDate)]).map((f) => direct("return", f));
            else if (mainBack) {
              const feeders = topFlights(pool[poolKey(hub, airport, returnDate)]);
              options = (feeders.length > 0 ? feeders : [null]).map((feeder) => ({
                direction: "return",
                routing: "gather",
                feeder,
                main: mainBack,
              }));
            } else options = [];
            if (options.length > 0) backsFor = options;
          }

          return outs.flatMap((outbound) =>
            backsFor.map((back) => ({
              origin: airport,
              outbound,
              return: back,
              passengers: origin.passengers,
            })),
          );
        };

        // Group by group, keeping only the cheapest partial plans so the
        // combinations stay bounded however many groups there are.
        let partials: { legs: GroupLeg[]; price: number }[] = [{ legs: [], price: 0 }];
        for (const origin of active) {
          const options = legOptions(origin);
          partials = partials
            .flatMap((partial) =>
              options.map((leg) => ({
                legs: [...partial.legs, leg],
                price: partial.price + pricePerHeadOf(leg) * leg.passengers,
              })),
            )
            .sort((a, b) => a.price - b.price)
            .slice(0, ARRANGEMENTS_PER_ROUTING);
          if (partials.length === 0) break;
        }

        for (const { legs } of partials) {
          const shape = legs
            .map((l) => `${l.origin}${l.outbound.routing === "gather" ? ">" : "-"}`)
            .join("");
          const flights = legs.flatMap(legFlights).map(flightKey).join("|");
          const id = `${dest}:${date}:${shape}:${shortHash(flights)}`;
          if (candidates.has(id)) continue;

          candidates.set(id, {
            id,
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
      }
    }

    arrangements.push(
      ...[...candidates.values()]
        .sort((a, b) => a.totals.totalPrice - b.totals.totalPrice)
        .slice(0, ARRANGEMENTS_PER_ROUTING),
    );
  }

  return uniqueArrangements(arrangements);
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
