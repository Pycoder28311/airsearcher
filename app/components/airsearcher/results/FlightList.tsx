"use client";

import Text from "@/framework/ui/iconText/Text";
import { grayMid } from "@/config/theme";
import {
  journeyFlights,
  type Arrangement,
  type GroupLeg,
  type Journey,
  type NormalizedFlight,
} from "@/lib/airsearcher/types";
import FlightRow from "./FlightRow";

interface FlightEntry {
  key: string;
  heading: string;
  flight: NormalizedFlight;
}

/** One entry per flight of a journey, in the order the passengers fly them. */
function entriesOf(
  arrangement: Arrangement,
  leg: GroupLeg,
  journey: Journey,
): FlightEntry[] {
  const hub = arrangement.gatheringAirport;
  const destination = arrangement.destination.airport;
  const people = `${leg.passengers} passengers`;
  const far = journey.routing === "gather" ? hub : leg.origin;

  return journeyFlights(journey).map((flight) => {
    const isFeeder = flight === journey.feeder;
    const route =
      journey.direction === "outbound"
        ? isFeeder
          ? `${leg.origin} → ${hub}`
          : `${far} → ${destination}`
        : isFeeder
          ? `${hub} → ${leg.origin}`
          : `${destination} → ${far}`;

    return {
      key: `${leg.origin}-${journey.direction}-${isFeeder ? "feeder" : "main"}`,
      heading: `${route}${isFeeder ? " · feeder" : ""} · ${people}`,
      flight,
    };
  });
}

/**
 * Every individual flight in an arrangement, going flights first and returning
 * flights after, exactly as the brief requires.
 *
 * Within each direction a group's flights are listed in the order they are
 * flown: the feeder before the main flight going out, after it coming back.
 */
export function flightsOf(arrangement: Arrangement): {
  going: FlightEntry[];
  returning: FlightEntry[];
} {
  const going: FlightEntry[] = [];
  const returning: FlightEntry[] = [];

  for (const leg of arrangement.legs) {
    going.push(...entriesOf(arrangement, leg, leg.outbound));
    if (leg.return) returning.push(...entriesOf(arrangement, leg, leg.return));
  }

  return { going, returning };
}

function Section({ title, entries }: { title: string; entries: FlightEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Text size="small" value={title} className="font-semibold text-gray-900" />
      {entries.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-1">
          <Text size="very small" value={entry.heading} className="text-gray-500" />
          <FlightRow flight={entry.flight} />
        </div>
      ))}
    </div>
  );
}

export default function FlightList({ arrangement }: { arrangement: Arrangement }) {
  const { going, returning } = flightsOf(arrangement);

  return (
    <div className={`flex flex-col gap-4 border-t ${grayMid.border} pt-3`}>
      <Section title="Going flights" entries={going} />
      <Section title="Returning flights" entries={returning} />
    </div>
  );
}
