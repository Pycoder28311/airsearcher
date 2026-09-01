"use client";

import Text from "@/framework/ui/iconText/Text";
import { airportByCode } from "@/data/places";
import type { FilterState } from "@/lib/airsearcher/config/filters";
import MultiSelectList from "../../common/MultiSelectList";

/**
 * Connecting airports the trip must avoid.
 *
 * Upgraded from the reference project's plain list to a multi-select with a
 * Select all button, reusing the same list component as the destination city's
 * airport panel so the two behave alike.
 */
export default function AvoidAirportsGroup({
  filters,
  onChange,
  available,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  /** Connecting airports that actually appear in the current results. */
  available: string[];
}) {
  // Anything already excluded stays listed even if no result now connects
  // through it, so a choice can always be undone.
  const options = [...new Set([...available, ...filters.excludeAirports])]
    .sort()
    .map((code) => ({
      value: code,
      label: code,
      sublabel: airportByCode(code)?.name ?? "Connecting airport",
    }));

  return (
    <div className="flex flex-col gap-2">
      <Text
        size="very small"
        value="Ticked airports are avoided as connections."
        className="text-gray-400"
      />
      <MultiSelectList
        options={options}
        selected={filters.excludeAirports}
        onChange={(excludeAirports) => onChange({ ...filters, excludeAirports })}
        emptyMessage="No connecting airports in these results"
      />
    </div>
  );
}
