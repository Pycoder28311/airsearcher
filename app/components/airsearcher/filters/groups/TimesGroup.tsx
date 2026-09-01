"use client";

import { useRef } from "react";
import Text from "@/framework/ui/iconText/Text";
import type { FilterState, HourWindow } from "@/lib/airsearcher/config/filters";
import { formatHour } from "@/lib/airsearcher/time";
import DualRange from "../DualRange";

type WindowKey =
  | "outboundWindow"
  | "outboundArrivalWindow"
  | "returnWindow"
  | "returnArrivalWindow";

const ARRIVAL_OF: Partial<Record<WindowKey, WindowKey>> = {
  outboundWindow: "outboundArrivalWindow",
  returnWindow: "returnArrivalWindow",
};

/**
 * Departure and arrival windows, for each direction.
 *
 * The two are independently configurable, but changing a departure window moves
 * its arrival window to match **by default** — until the arrival window is
 * edited directly, after which it stops following. Which windows have been
 * touched is interaction memory, not a filter, so it lives here rather than in
 * FilterState.
 */
export default function TimesGroup({
  filters,
  onChange,
  isRoundTrip,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  isRoundTrip: boolean;
}) {
  const touched = useRef<Set<WindowKey>>(new Set());

  const setWindow = (key: WindowKey, value: HourWindow) => {
    const next: FilterState = { ...filters, [key]: value };

    const arrival = ARRIVAL_OF[key];
    if (arrival && !touched.current.has(arrival)) {
      next[arrival] = value;
    }
    if (!arrival) {
      // An arrival window edited directly stops mirroring its departure window.
      touched.current.add(key);
    }

    onChange(next);
  };

  const rows: { key: WindowKey; label: string; show: boolean }[] = [
    { key: "outboundWindow", label: "Going · departs", show: true },
    { key: "outboundArrivalWindow", label: "Going · lands", show: true },
    { key: "returnWindow", label: "Returning · departs", show: isRoundTrip },
    { key: "returnArrivalWindow", label: "Returning · lands", show: isRoundTrip },
  ];

  return (
    <div className="flex flex-col gap-3">
      {rows
        .filter((row) => row.show)
        .map((row) => (
          <div key={row.key} className="flex flex-col gap-1">
            <Text size="very small" value={row.label} className="text-gray-600" />
            <DualRange
              min={0}
              max={24}
              step={1}
              value={filters[row.key]}
              onChange={(next) => setWindow(row.key, next)}
              formatValue={formatHour}
              ariaLabel={row.label}
            />
          </div>
        ))}

      <Text
        size="very small"
        value="Changing a departure window moves its arrival window to match, until you set the arrival window yourself."
        className="text-gray-400"
      />
    </div>
  );
}
