"use client";

import Text from "@/framework/ui/iconText/Text";
import { grayLight, grayMid, radius } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { formatClock, formatDate, formatDuration } from "@/lib/airsearcher/time";
import type { NormalizedFlight } from "@/lib/airsearcher/types";

/**
 * One individual flight, matching the Penpot flight row: airline, route, date,
 * times, duration and price, with the layover airports spelled out.
 */
export default function FlightRow({ flight }: { flight: NormalizedFlight }) {
  const segments = flight.outbound.segments;
  const first = segments[0];
  const last = segments[segments.length - 1];

  const stops =
    flight.outbound.stops === 0
      ? "Non-stop"
      : `${flight.outbound.stops} stop${flight.outbound.stops === 1 ? "" : "s"} · ${flight.outbound.layovers
          .map((l) => l.airport)
          .filter(Boolean)
          .join(", ")}`;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${radius} border ${grayMid.border} ${grayLight.bgHover} px-3 py-2`}
    >
      <div className="flex min-w-28 flex-col">
        <Text
          size="small"
          value={flight.airline.name ?? "—"}
          className="font-medium text-gray-900"
        />
        <Text
          size="very small"
          value={first?.flightNumber ?? ""}
          className="text-gray-400"
        />
      </div>

      <div className="flex min-w-32 flex-col">
        <Text
          size="small"
          value={`${first?.departure.airport ?? "—"} → ${last?.arrival.airport ?? "—"}`}
          className="text-gray-900"
        />
        <Text
          size="very small"
          value={formatDate((first?.departure.time ?? "").slice(0, 10) || null)}
          className="text-gray-400"
        />
      </div>

      <div className="flex min-w-24 flex-col">
        <Text
          size="small"
          value={`${formatClock(first?.departure.time)} – ${formatClock(last?.arrival.time)}`}
          className="tabular-nums text-gray-900"
        />
        <Text
          size="very small"
          value={formatDuration(flight.outbound.totalDurationMinutes)}
          className="text-gray-400"
        />
      </div>

      <Text size="very small" value={stops} className="min-w-32 flex-1 text-gray-500" />

      <Text
        size="small"
        value={flight.price === null ? "—" : `${flight.price} ${CURRENCY}`}
        className="ml-auto font-semibold tabular-nums text-gray-900"
      />
    </div>
  );
}
