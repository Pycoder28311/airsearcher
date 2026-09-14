"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { grayLight, grayMid, radius } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { googleFlightsUrl } from "@/lib/airsearcher/links";
import { formatClock, formatDate, formatDuration } from "@/lib/airsearcher/time";
import { airportLabel } from "@/data/places";
import { stopAirportsOf, type NormalizedFlight } from "@/lib/airsearcher/types";

/**
 * One individual flight, matching the Penpot flight row: airline, route, date,
 * times, duration and price, with the layover airports spelled out.
 */
export default function FlightRow({ flight }: { flight: NormalizedFlight }) {
  const segments = flight.outbound.segments;
  const first = segments[0];
  const last = segments[segments.length - 1];

  const googleUrl = googleFlightsUrl(flight);
  const count = flight.outbound.stops;
  const where = stopAirportsOf(flight);
  // A layover's duration is shown beside its airport when the provider sends it.
  const described = where.map((code) => {
    const minutes = flight.outbound.layovers.find((l) => l.airport === code)?.durationMinutes;
    return `${airportLabel(code)}${minutes ? ` (${formatDuration(minutes)})` : ""}`;
  });
  const stops =
    count === 0
      ? "Non-stop"
      : `${count} stop${count === 1 ? "" : "s"} · ${
          described.length > 0 ? described.join(", ") : "stop airport not given by the provider"
        }`;

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

      {googleUrl && (
        // A new tab, so the results page stays open behind it.
        <Button
          styleType="underline"
          onClick={() => window.open(googleUrl, "_blank", "noopener,noreferrer")}
        >
          <Text size="very small" value="Google Flights" />
        </Button>
      )}
    </div>
  );
}
