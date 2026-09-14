"use client";

import Text from "@/framework/ui/iconText/Text";
import { uniqueFlights } from "@/lib/airsearcher/grouping";
import { grayLight, grayMid, radius } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { formatClock, formatDate, formatDuration } from "@/lib/airsearcher/time";
import { stopAirportsOf, type FlightRecord, type NormalizedFlight } from "@/lib/airsearcher/types";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import Dialog from "../common/Dialog";

const REASON_LABELS: Record<FlightRecord["reason"], string> = {
  main: "main leg",
  feeder: "feeder",
  direct: "direct",
};

const COLUMNS = [
  "Airline",
  "Flight",
  "From",
  "Depart",
  "To",
  "Arrive",
  "Duration",
  "Stops",
  "Via",
  "Price",
];

function cells(flight: NormalizedFlight): string[] {
  const segments = flight.outbound.segments;
  const first = segments[0];
  const last = segments[segments.length - 1];

  return [
    flight.airline.name ?? "—",
    first?.flightNumber ?? "—",
    first?.departure.airport ?? "—",
    formatClock(first?.departure.time),
    last?.arrival.airport ?? "—",
    formatClock(last?.arrival.time),
    formatDuration(flight.outbound.totalDurationMinutes),
    String(flight.outbound.stops),
    stopAirportsOf(flight).join(", ") || "—",
    flight.price === null ? "—" : `${flight.price} ${CURRENCY}`,
  ];
}

/** One request's worth of flights, exactly as it came back. */
function RecordBlock({ record }: { record: FlightRecord }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <Text
          size="small"
          value={`${record.from} → ${record.to}`}
          className="font-semibold text-gray-900"
        />
        <Text
          size="very small"
          value={`${formatDate(record.date)} · ${record.direction} · ${REASON_LABELS[record.reason]}`}
          className="text-gray-500"
        />
        <Text
          size="very small"
          value={`${record.flights.length} flight${record.flights.length === 1 ? "" : "s"}`}
          className="ml-auto tabular-nums text-gray-400"
        />
      </div>

      {record.flights.length === 0 ? (
        <Text
          size="very small"
          value="This request returned nothing for this route."
          className="text-gray-400 italic"
        />
      ) : (
        <div className={`overflow-x-auto ${radius} border ${grayMid.border}`}>
          <table className="w-full border-collapse text-left font-mono text-xs whitespace-nowrap">
            <thead className={grayLight.bg}>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} className="px-2 py-1.5 font-medium text-gray-500">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.flights.map((flight) => (
                <tr key={flight.id} className={`border-t ${grayMid.border}`}>
                  {cells(flight).map((cell, index) => (
                    <td key={index} className="px-2 py-1 text-gray-800 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Every flight this search gathered, grouped by the request that returned it.
 *
 * Deliberately plain: this is the raw data view, not a designed result. It
 * exists so nothing that was paid for is invisible.
 */
export default function FlightDataDialog({
  entry,
  open,
  onClose,
}: {
  entry: StoredSearch;
  open: boolean;
  onClose: () => void;
}) {
  // Searches saved before duplicates were removed can still hold them.
  const records = (entry.records ?? []).map((record) => ({
    ...record,
    flights: uniqueFlights(record.flights),
  }));
  const totalFlights = records.reduce((sum, record) => sum + record.flights.length, 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Gathered flight data"
      subtitle={`${entry.label} · ${records.length} request${
        records.length === 1 ? "" : "s"
      } · ${totalFlights} flight${totalFlights === 1 ? "" : "s"}`}
      width="max-w-6xl"
    >
      {records.length === 0 ? (
        <Text
          size="small"
          value="No raw data was kept for this search. Either it was saved before raw data was stored, or the browser had no room for it and kept the results only."
          className="max-w-prose text-gray-500"
        />
      ) : (
        <div className="flex flex-col gap-5">
          {records.map((record) => (
            <RecordBlock key={record.id} record={record} />
          ))}
        </div>
      )}
    </Dialog>
  );
}
