"use client";

import Text from "@/framework/ui/iconText/Text";
import { grayMid } from "@/config/theme";
import type { Arrangement, NormalizedFlight } from "@/lib/airsearcher/types";
import FlightRow from "./FlightRow";

interface FlightEntry {
  key: string;
  heading: string;
  flight: NormalizedFlight;
}

/**
 * Every individual flight in an arrangement, going flights first and returning
 * flights after, exactly as the brief requires.
 *
 * Within the going flights the feeder legs come before the main flight, because
 * that is the order the passengers actually fly them.
 */
export function flightsOf(arrangement: Arrangement): {
  going: FlightEntry[];
  returning: FlightEntry[];
} {
  const going: FlightEntry[] = [];
  const returning: FlightEntry[] = [];

  for (const leg of arrangement.legs) {
    if (leg.feeder) {
      going.push({
        key: `${leg.origin}-feeder-out`,
        heading: `${leg.origin} → ${arrangement.gatheringAirport} · feeder · ${leg.passengers} passengers`,
        flight: leg.feeder.outbound,
      });
    }
    going.push({
      key: `${leg.origin}-main-out`,
      heading: `${leg.routing === "gather" ? arrangement.gatheringAirport : leg.origin} → ${
        arrangement.destination.airport
      } · ${leg.passengers} passengers`,
      flight: leg.main.outbound,
    });

    if (leg.main.return) {
      returning.push({
        key: `${leg.origin}-main-back`,
        heading: `${arrangement.destination.airport} → ${
          leg.routing === "gather" ? arrangement.gatheringAirport : leg.origin
        } · ${leg.passengers} passengers`,
        flight: leg.main.return,
      });
    }
    if (leg.feeder?.return) {
      returning.push({
        key: `${leg.origin}-feeder-back`,
        heading: `${arrangement.gatheringAirport} → ${leg.origin} · feeder · ${leg.passengers} passengers`,
        flight: leg.feeder.return,
      });
    }
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
