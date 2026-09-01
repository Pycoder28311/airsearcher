/**
 * Turning per-pair itineraries into whole-group arrangements.
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
  legsOf,
  type AirportCode,
  type Arrangement,
  type ArrangementTotals,
  type GroupLeg,
  type Itinerary,
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

/* ── Routings ────────────────────────────────────────────────────────────── */

/**
 * Every routing combination worth evaluating.
 *
 * The gathering airport's own group is always "direct" — it is already there,
 * so routing it through itself is meaningless and never emitted. With `n`
 * origins and both modes allowed this yields 2^(n-1) routings.
 */
export function enumerateRoutings(
  origins: OriginGroup[],
  gatheringAirport: AirportCode,
  allow: RoutingAllowance,
): Record<AirportCode, Routing>[] {
  const travelling = origins.filter(
    (o) => o.airport !== gatheringAirport && o.passengers > 0,
  );

  const modes: Routing[] = [];
  if (allow.direct) modes.push("direct");
  if (allow.gather) modes.push("gather");
  if (modes.length === 0) return [];

  let routings: Record<AirportCode, Routing>[] = [{}];
  for (const origin of travelling) {
    const next: Record<AirportCode, Routing>[] = [];
    for (const partial of routings) {
      for (const mode of modes) {
        next.push({ ...partial, [origin.airport]: mode });
      }
    }
    routings = next;
  }

  // The gathering origin, when it is in the group, is always already there.
  const atHub = origins.find((o) => o.airport === gatheringAirport && o.passengers > 0);
  if (atHub) {
    routings = routings.map((r) => ({ ...r, [gatheringAirport]: "direct" as Routing }));
  }

  return routings;
}

/* ── Assembly ────────────────────────────────────────────────────────────── */

/**
 * Key into the shared itinerary pool.
 *
 * The date is part of the key: in advanced mode one route is searched on many
 * candidate departure dates, and an arrangement must only ever be assembled
 * from flights that actually leave on its own date.
 */
export function poolKey(from: AirportCode, to: AirportCode, date: string): string {
  return `${from}-${to}-${date}`;
}

/** Cheapest itinerary in a list; null when the list is empty. */
function cheapest(list: Itinerary[] | undefined): Itinerary | null {
  if (!list || list.length === 0) return null;
  return [...list].sort((a, b) => a.totalPrice - b.totalPrice)[0];
}

/** When a flight leaves, as a full "YYYY-MM-DD HH:MM" string. */
function departureTimeOf(itinerary: Itinerary): string | null {
  return itinerary.outbound.outbound.segments[0]?.departure.time ?? null;
}

/** When a flight lands, as a full "YYYY-MM-DD HH:MM" string. */
function arrivalTimeOf(itinerary: Itinerary): string | null {
  const segments = itinerary.outbound.outbound.segments;
  return segments[segments.length - 1]?.arrival.time ?? null;
}

/**
 * Whether a feeder actually connects to the main flight: it must land at the
 * gathering airport at least MIN_GATHER_BUFFER_MINUTES before the main flight
 * leaves. Anything tighter is not a connection anyone would book, so it is
 * rejected outright rather than scored badly.
 *
 * An unreadable time is treated as connecting — an absent time is not evidence
 * of a bad one.
 */
export function feederConnects(feeder: Itinerary, main: Itinerary): boolean {
  const gap = minutesBetweenTimes(arrivalTimeOf(feeder), departureTimeOf(main));
  if (gap === null) return true;
  return gap >= MIN_GATHER_BUFFER_MINUTES;
}

/** Door-to-destination minutes for one group leg, feeder wait included. */
function travelMinutesOf(leg: GroupLeg): number {
  const start = leg.feeder ? departureTimeOf(leg.feeder) : departureTimeOf(leg.main);
  const end = arrivalTimeOf(leg.main);
  const span = minutesBetweenTimes(start, end);
  if (span !== null && span > 0) return span;

  // Fall back to the flights' own durations when the clock times are unusable.
  const feederMinutes = leg.feeder?.outbound.outbound.totalDurationMinutes ?? 0;
  const mainMinutes = leg.main.outbound.outbound.totalDurationMinutes ?? 0;
  return feederMinutes + mainMinutes;
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
    if (leg.routing === "gather" && leg.origin !== gatheringAirport) {
      gatheringCount += leg.passengers;
    }

    const perHead = (leg.feeder?.totalPrice ?? 0) + leg.main.totalPrice;
    totalPrice += perHead * leg.passengers;

    longestTravelMinutes = Math.max(longestTravelMinutes, travelMinutesOf(leg));

    for (const itinerary of leg.feeder ? [leg.feeder, leg.main] : [leg.main]) {
      for (const flight of legsOf(itinerary)) {
        if (flight.airline.name) airlines.add(flight.airline.name);
      }
    }

    const departure = leg.feeder ? departureTimeOf(leg.feeder) : departureTimeOf(leg.main);
    if (departure) departures.push(departure);
    const arrival = arrivalTimeOf(leg.main);
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
  /** Itineraries keyed by `poolKey(from, to, date)` — the shared, deduplicated pool. */
  pool: Record<string, Itinerary[]>;
  departureDate: string;
  returnDate: string | null;
  allow: RoutingAllowance;
}

/**
 * One arrangement per viable routing, each picking the cheapest usable
 * itinerary for every leg. A routing that cannot be flown — no flights in the
 * pool, or a feeder that does not connect — produces no arrangement at all
 * rather than a bad one.
 */
export function buildArrangements(args: BuildArrangementsArgs): Arrangement[] {
  const { origins, gatheringAirport, destination, pool, allow } = args;
  const active = origins.filter((o) => o.passengers > 0);
  if (active.length === 0) return [];

  const date = args.departureDate;
  const mainFromHub = cheapest(pool[poolKey(gatheringAirport, destination.airport, date)]);
  const arrangements: Arrangement[] = [];

  for (const routing of enumerateRoutings(active, gatheringAirport, allow)) {
    const legs: GroupLeg[] = [];
    let viable = true;

    for (const origin of active) {
      const mode = routing[origin.airport] ?? "direct";

      if (mode === "gather" && origin.airport !== gatheringAirport) {
        const feeder = cheapest(pool[poolKey(origin.airport, gatheringAirport, date)]);
        if (!feeder || !mainFromHub || !feederConnects(feeder, mainFromHub)) {
          viable = false;
          break;
        }
        legs.push({
          origin: origin.airport,
          routing: "gather",
          feeder,
          main: mainFromHub,
          passengers: origin.passengers,
        });
        continue;
      }

      const direct = cheapest(pool[poolKey(origin.airport, destination.airport, date)]);
      if (!direct) {
        viable = false;
        break;
      }
      legs.push({
        origin: origin.airport,
        routing: "direct",
        feeder: null,
        main: direct,
        passengers: origin.passengers,
      });
    }

    if (!viable || legs.length === 0) continue;

    arrangements.push({
      id: `${destination.airport}:${date}:${legs
        .map((l) => `${l.origin}${l.routing === "gather" ? ">" : "-"}`)
        .join("")}`,
      destination,
      gatheringAirport,
      departureDate: date,
      returnDate: args.returnDate,
      legs,
      totals: totalsOf(legs, gatheringAirport),
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
    const itineraries = leg.feeder ? [leg.feeder, leg.main] : [leg.main];
    const values: number[] = [];

    for (const itinerary of itineraries) {
      const out = legHourIndex(
        itinerary.outbound.outbound,
        curves.outbound,
        departureArrivalRatio,
      );
      if (out !== null) values.push(out);

      if (itinerary.return) {
        const back = legHourIndex(
          itinerary.return.outbound,
          curves.return,
          departureArrivalRatio,
        );
        if (back !== null) values.push(back);
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

/** A short human summary of who flies how, e.g. "ATH direct · SKG, HER via ATH". */
export function describeRouting(arrangement: Arrangement): string {
  const direct = arrangement.legs
    .filter((l) => l.routing === "direct")
    .map((l) => l.origin);
  const gathering = arrangement.legs
    .filter((l) => l.routing === "gather")
    .map((l) => l.origin);

  const parts: string[] = [];
  if (direct.length > 0) parts.push(`${direct.join(", ")} direct`);
  if (gathering.length > 0) {
    parts.push(`${gathering.join(", ")} via ${arrangement.gatheringAirport}`);
  }
  return parts.join(" · ");
}
