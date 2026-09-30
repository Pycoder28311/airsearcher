/**
 * Turning per-route flights into whole-group arrangements.
 *
 * This is the one genuinely new module: everything else is ported. It decides
 * which origin groups fly direct and which gather at a hub first, assembles a
 * complete plan for the whole group, and scores it.
 *
 * The scoring arithmetic is NOT reinvented — `priceIndex` and `legHourIndex`
 * come from `ranking.ts` unchanged. The additions are a passenger-weighted
 * mean across the origin groups, a stop index that counts a change between
 * tickets the same as one inside a ticket, and a stops weight beside price
 * and hours.
 */

import {
  DATE_PRIORITY_BONUS,
  MIN_GATHER_BUFFER_MINUTES,
  STOP_SCORES,
} from "@/lib/airsearcher/config/constants";
import type { FilterScope } from "@/lib/airsearcher/config/filters";
import { journeyAsLeg, journeyMinutes, journeyStopCount } from "@/lib/airsearcher/journeyStops";
import type {
  RankingPreferences,
  RankingWeights,
} from "@/lib/airsearcher/config/ranking";
import {
  legHourIndex,
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
 * Whether every group can get home: on a round trip each has a way back, and
 * a group coming back through the hub has its feeder home. The hub's own group
 * needs no feeder. One-way arrangements always pass.
 */
export function everyoneGetsHome(arrangement: Arrangement): boolean {
  if (arrangement.returnDate === null) return true;
  return arrangement.legs.every(
    (leg) =>
      leg.return !== null &&
      (leg.return.routing !== "gather" || leg.origin === arrangement.gatheringAirport || leg.return.feeder !== null),
  );
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

/**
 * What one passenger of a group pays: every flight in both directions, or
 * only the going or the returning ones when a filter's scope says so.
 */
export function pricePerHeadOf(leg: GroupLeg, scope: FilterScope = "both"): number {
  const flights =
    scope === "going"
      ? journeyFlights(leg.outbound)
      : scope === "returning"
        ? leg.return
          ? journeyFlights(leg.return)
          : []
        : legFlights(leg);
  return flights.reduce((sum, flight) => sum + (flight.price ?? 0), 0);
}

/**
 * The results of a round-trip search seen as one-way trips: each keeps only
 * its going flights, with its prices and totals worked out again without the
 * way back. Results that fly out the same way merge into one — the cheapest
 * way out among them, as `uniqueArrangements` keeps — so each outbound plan
 * appears once. They are still only the ways out that made the round-trip
 * results, not a fresh one-way search.
 */
export function asOneWay(arrangements: Arrangement[]): Arrangement[] {
  return uniqueArrangements(
    arrangements.map((arrangement) => {
      if (arrangement.returnDate === null && arrangement.legs.every((leg) => !leg.return)) {
        return arrangement;
      }
      const legs = arrangement.legs.map((leg) => ({ ...leg, return: null }));
      return {
        ...arrangement,
        // Without the way back there is no second city to come home from.
        returnDestination: undefined,
        returnDate: null,
        legs,
        totals: totalsOf(legs, arrangement.gatheringAirport),
      };
    }),
  );
}

/** Cheapest and priciest per-passenger price across a result's groups. */
export interface PriceRange {
  min: number;
  max: number;
}

/**
 * What the cheapest group and the priciest group each pay per passenger, both
 * directions and every ticket of a stop included — shown instead of the sum
 * over everyone, which no single traveller pays.
 */
export function groupPriceRange(arrangement: Arrangement, scope: FilterScope = "both"): PriceRange {
  const prices = arrangement.legs.map((leg) => pricePerHeadOf(leg, scope));
  if (prices.length === 0) return { min: 0, max: 0 };
  return { min: Math.round(Math.min(...prices)), max: Math.round(Math.max(...prices)) };
}

/** "188–292", or one number when every group pays the same. */
export function formatPriceRange(range: PriceRange, currency?: string): string {
  const numbers = range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
  return currency ? `${numbers} ${currency}` : numbers;
}

/**
 * Door-to-destination minutes for a group's way out, feeder wait included —
 * flying times plus waits, so a time-zone change does not shorten it.
 */
function travelMinutesOf(leg: GroupLeg): number {
  return journeyMinutes(journeyFlights(leg.outbound)) ?? 0;
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
  /**
   * Open jaw: the airport the way back leaves from, when it isn't the
   * destination (into Venice, home from Florence). Absent means the same one.
   */
  returnFrom?: { cityId: string; airport: AirportCode };
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
 * not connect — produces nothing. On a round trip the same holds for the way
 * back: every group must get home, so a group with no flight back, or landing
 * at the hub with no feeder home that connects, drops the arrangement.
 */
export function buildArrangements(args: BuildArrangementsArgs): Arrangement[] {
  if (args.sameAirline) return buildSameAirlineArrangements(args);

  const { origins, gatheringAirport: hub, destination, pool, allow } = args;
  const active = origins.filter((o) => o.passengers > 0);
  if (active.length === 0) return [];

  const date = args.departureDate;
  const returnDate = args.returnDate;
  const dest = destination.airport;
  // Open jaw: the way back leaves from another airport.
  const back = args.returnFrom?.airport ?? dest;
  const openJaw = back !== dest && returnDate !== null ? args.returnFrom : undefined;
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
    const backs = gathering && returnDate ? topFlights(pool[poolKey(back, hub, returnDate)]) : [];
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
            else if (!gathers) options = topFlights(pool[poolKey(back, airport, returnDate)]).map((f) => direct("return", f));
            else if (mainBack) {
              // Coming back the main flight lands first; a feeder leaving too
              // soon after it cannot be caught.
              options = topFlights(pool[poolKey(hub, airport, returnDate)])
                .filter((feeder) => flightsConnect(mainBack, feeder))
                .map((feeder) => ({ direction: "return", routing: "gather", feeder, main: mainBack }));
            } else options = [];
            // A group that cannot get home rules the arrangement out.
            if (options.length === 0) return [];
            backsFor = options;
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
          const id = `${openJaw ? `${dest}>${back}` : dest}:${date}:${shape}:${shortHash(flights)}`;
          if (candidates.has(id)) continue;

          candidates.set(id, {
            id,
            destination,
            ...(openJaw ? { returnDestination: openJaw } : {}),
            gatheringAirport: hub,
            departureDate: date,
            returnDate,
            legs,
            totals: totalsOf(legs, hub),
            score: 0,
            indices: { price: 0, hour: null, stops: 0 },
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

    // Each direction is judged as one journey — first take-off, last landing —
    // so a change of plane scores the same inside a ticket or between two.
    for (const journey of leg.return ? [leg.outbound, leg.return] : [leg.outbound]) {
      const curve = journey.direction === "outbound" ? curves.outbound : curves.return;
      const whole = journeyAsLeg(journeyFlights(journey));
      const value = whole ? legHourIndex(whole, curve, departureArrivalRatio) : null;
      if (value !== null) values.push(value);
    }

    if (values.length === 0) continue;
    const legIndex = values.reduce((sum, v) => sum + v, 0) / values.length;
    weighted += legIndex * leg.passengers;
    weight += leg.passengers;
  }

  return weight > 0 ? weighted / weight : null;
}

/**
 * How close the group is to flying non-stop, before comparing with the other
 * results: each journey scored by `STOP_SCORES` and weighted by the passengers
 * on it. 1 is everyone non-stop both ways.
 */
function groupStopQuality(legs: GroupLeg[]): number {
  let weighted = 0;
  let weight = 0;

  for (const leg of legs) {
    const journeys = leg.return ? [leg.outbound, leg.return] : [leg.outbound];
    for (const journey of journeys) {
      const stops = journeyStopCount(journeyFlights(journey));
      weighted += (STOP_SCORES[stops] ?? 0) * leg.passengers;
      weight += leg.passengers;
    }
  }

  return weight > 0 ? weighted / weight : 1;
}

/**
 * Scores every arrangement relative to the others.
 *
 * `priceIndex` is relative to the current set, exactly as in the reference
 * project: filtering something out legitimately changes everyone's score.
 * Stops, price and hours each take their share of `weights` (scaled to add up
 * to 1). Priority dates add a small bonus so a favoured date wins between
 * near-equal options without dragging a clearly worse one to the top.
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

  const stopsWeight = Math.max(weights.stops, 0);
  const priceWeight = Math.max(weights.price, 0);
  const hourWeight = Math.max(weights.hour, 0);
  const total = stopsWeight + priceWeight + hourWeight;
  // All three at 0 would divide by zero: an even split keeps the ranking meaningful.
  const share =
    total === 0
      ? { stops: 1 / 3, price: 1 / 3, hour: 1 / 3 }
      : { stops: stopsWeight / total, price: priceWeight / total, hour: hourWeight / total };

  // Like price, stops are judged against the rest of the set: the fewest stops
  // here score 1 and the most 0, so a stop always costs a lot of score.
  const quality = arrangements.map((a) => groupStopQuality(a.legs));
  const best = quality.length > 0 ? Math.max(...quality) : 1;
  const worst = quality.length > 0 ? Math.min(...quality) : 1;

  return arrangements.map((arrangement, i) => {
    const hourIndex = groupHourIndex(arrangement.legs, preferences);
    const price = priceIndex(arrangement.totals.totalPrice, min, max);
    const stops = best > worst ? (quality[i] - worst) / (best - worst) : 1;

    // With no usable hour index the hour term would read as zero convenience,
    // which is a lie. Drop it and give its share to price.
    const effective =
      hourIndex === null
        ? { stops: share.stops, price: share.price + share.hour, hour: 0 }
        : share;

    const priority = priorityDates[arrangement.departureDate] ?? 0;
    const bonus = Math.max(0, Math.min(3, priority)) * DATE_PRIORITY_BONUS;

    const applied = effective;
    const score =
      stops * applied.stops + price * applied.price + (hourIndex ?? 0) * applied.hour + bonus;

    return {
      ...arrangement,
      score: Math.min(score, 1),
      indices: { price, hour: hourIndex, stops },
      breakdown: { weights: applied, bonus },
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
