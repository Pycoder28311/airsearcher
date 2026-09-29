"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { grayLight, grayMid, radius } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { googleFlightsUrl } from "@/lib/airsearcher/links";
import { formatClock, formatDuration, minutesBetweenTimes } from "@/lib/airsearcher/time";
import {
  journeyFlights,
  type Arrangement,
  type GroupLeg,
  type Journey,
  type NormalizedFlight,
} from "@/lib/airsearcher/types";
import PriceTag from "./PriceTag";

const SYMBOL = CURRENCY === "EUR" ? "€" : CURRENCY;

/** What a group pays for one direction, every passenger and ticket included; null if unpriced. */
function directionPrice(journey: Journey, passengers: number): number | null {
  let perHead = 0;
  for (const flight of journeyFlights(journey)) {
    if (flight.price === null) return null;
    perHead += flight.price;
  }
  return perHead * passengers;
}

/**
 * One group in one direction: the airport and passengers, what the group pays
 * for that direction, and its flights and stops.
 */
function GroupCard({ leg, journey }: { leg: GroupLeg; journey: Journey | null }) {
  const people = `${leg.passengers} passenger${leg.passengers === 1 ? "" : "s"}`;

  if (!journey) {
    return (
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-1 ${radius} border ${grayMid.border} px-3 py-2`}>
        <Text size="small" value={leg.origin} className="font-semibold text-gray-900" />
        <Text size="very small" value={people} className="text-gray-400" />
        <Text size="very small" value="No flight found" className="text-gray-400" />
      </div>
    );
  }

  const flights = journeyFlights(journey);
  const total = directionPrice(journey, leg.passengers);

  return (
    <div className={`flex flex-col gap-2 ${radius} border ${grayMid.border} px-3 py-2`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Text size="small" value={leg.origin} className="font-semibold text-gray-900" />
        <Text size="very small" value={people} className="text-gray-400" />

        <div className="ml-auto flex flex-col items-end">
          <Text
            size="small"
            value={total === null ? "—" : `${Math.round(total)} ${SYMBOL}`}
            className="font-semibold tabular-nums text-gray-900"
          />
          {total !== null && leg.passengers > 1 && (
            <Text
              size="very small"
              value={`${Math.round(total / leg.passengers)} ${SYMBOL} each`}
              className="tabular-nums text-gray-400"
            />
          )}
        </div>
      </div>

      <FlightGrid flights={flights} />
    </div>
  );
}

/** One row of the flight grid: a plane ride, or the wait on the ground between two. */
type GridRow =
  | {
      kind: "flight";
      key: string;
      from: string;
      to: string;
      departs: string | null;
      arrives: string | null;
      minutes: number | null;
      flightNumber: string;
      /** The ticket's price, or null on a flight whose price came before. */
      price: string | null;
      /** Whether that price covers this and the next flights ("BOTH"). */
      both: boolean;
      /** Google Flights for the ticket, on its priced (first) segment only. */
      url: string | null;
    }
  | { kind: "stop"; key: string; airport: string; minutes: number | null };

/**
 * Every plane ride of the journey in order, with the stops between them. A
 * ticket with its own stop has one price for its segments: it goes on the
 * first flight marked "BOTH", and the next flight says it is included.
 */
function rowsOf(flights: NormalizedFlight[]): GridRow[] {
  const rows: GridRow[] = [];
  const segments = flights.flatMap((flight) =>
    flight.outbound.segments.map((segment, i) => ({ flight, segment, i })),
  );

  segments.forEach(({ flight, segment, i }, index) => {
    const count = flight.outbound.segments.length;
    const price =
      flight.price === null ? "—" : `${Math.round(flight.price)} ${SYMBOL}`;
    rows.push({
      kind: "flight",
      key: `${flight.id}-${i}`,
      from: segment.departure.airport ?? "—",
      to: segment.arrival.airport ?? "—",
      departs: segment.departure.time,
      arrives: segment.arrival.time,
      minutes:
        segment.durationMinutes ?? minutesBetweenTimes(segment.departure.time, segment.arrival.time),
      flightNumber: [segment.airline, segment.flightNumber].filter(Boolean).join(" · ") || "—",
      price: i === 0 ? price : null,
      both: i === 0 && count > 1,
      url: i === 0 ? googleFlightsUrl(flight) : null,
    });

    const next = segments[index + 1];
    if (next) {
      rows.push({
        kind: "stop",
        key: `${flight.id}-${i}-stop`,
        airport: segment.arrival.airport ?? "—",
        minutes: minutesBetweenTimes(segment.arrival.time, next.segment.departure.time),
      });
    }
  });

  return rows;
}

/**
 * The flights and stops of one journey side by side, in the order they are
 * flown. A flight is two lines — route, price, airline and a Google Flights
 * link; then its hours and flying time. A stop just says how long they wait
 * there; its start and end are the times of the flights either side.
 */
function FlightGrid({ flights }: { flights: NormalizedFlight[] }) {
  const rows = rowsOf(flights);

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {rows.map((row) =>
        row.kind === "flight" ? (
          <div
            key={row.key}
            className={`flex min-w-0 flex-1 basis-72 flex-col gap-0.5 ${radius} ${grayLight.bg} px-3 py-1.5`}
          >
            {/* Route, then its price, then the airline — and the link out. */}
            <div className="flex flex-wrap items-baseline gap-x-3">
              <Text size="small" value={`${row.from} → ${row.to}`} className="font-semibold text-gray-900" />
              {row.price !== null ? (
                <PriceTag price={row.price} both={row.both} />
              ) : (
                <Text size="very small" value="in the ticket before" className="whitespace-nowrap text-gray-400" />
              )}
              <Text size="very small" value={row.flightNumber} className="min-w-0 truncate text-gray-500" />
              {row.url && (
                // A new tab, so the results page stays open behind it.
                <Button
                  styleType="underline"
                  onClick={() => window.open(row.url!, "_blank", "noopener,noreferrer")}
                  className="ml-auto self-center"
                >
                  <Text size="very small" icon="external-link" />
                </Button>
              )}
            </div>
            {/* The hours, then how long it flies. */}
            <div className="flex flex-wrap items-baseline gap-x-3">
              <Text
                size="very small"
                value={`${formatClock(row.departs)} – ${formatClock(row.arrives)}`}
                className="tabular-nums text-gray-900"
              />
              <Text size="very small" value={formatDuration(row.minutes)} className="tabular-nums text-gray-500" />
            </div>
          </div>
        ) : (
          <div
            key={row.key}
            className={`flex shrink-0 flex-col items-center justify-center gap-0.5 ${radius} border border-dashed ${grayMid.border} px-3 py-2`}
          >
            <Text size="very small" value={`Stop ${row.airport}`} className="text-orange-600" />
            <Text
              size="very small"
              value={`${formatDuration(row.minutes)} waiting`}
              className="whitespace-nowrap tabular-nums text-gray-900"
            />
          </div>
        ),
      )}
    </div>
  );
}

function DirectionSection({
  title,
  legs,
  direction,
}: {
  title: string;
  legs: GroupLeg[];
  direction: "outbound" | "return";
}) {
  return (
    <div className="flex flex-col gap-2">
      <Text size="small" value={title} className="font-semibold text-gray-900" />
      {legs.map((leg) => (
        <GroupCard
          key={leg.origin}
          leg={leg}
          journey={direction === "outbound" ? leg.outbound : leg.return}
        />
      ))}
    </div>
  );
}

/**
 * The groups of an arrangement, going first and returning below: for each
 * group what it pays for that direction, and every flight and stop with its
 * times and price. A stop counts the same whether it
 * is inside a ticket or between two.
 */
export default function GroupList({ arrangement }: { arrangement: Arrangement }) {
  return (
    <section className={`flex flex-col gap-4 border-t ${grayMid.border} pt-3`}>
      <DirectionSection title="Going" legs={arrangement.legs} direction="outbound" />
      {arrangement.returnDate !== null && (
        <DirectionSection title="Returning" legs={arrangement.legs} direction="return" />
      )}
    </section>
  );
}
