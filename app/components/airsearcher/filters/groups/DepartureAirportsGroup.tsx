"use client";

import Text from "@/framework/ui/iconText/Text";
import type { FilterState } from "@/lib/airsearcher/config/filters";
import DepartureAirportEditor from "../../home/DepartureAirportEditor";

/**
 * The departure airports, editable from the sidebar.
 *
 * This is the very same editor the home page's departure dropdown uses, so the
 * two can never disagree about what "add an airport" means.
 *
 * Changing the gathering airport re-ranks the arrangements already in hand.
 * Adding an airport that has no cached flights would need a fresh search, which
 * is why that case says so instead of quietly spending requests.
 */
export default function DepartureAirportsGroup({
  filters,
  onChange,
  knownAirports,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  /** Airports the stored results actually cover. */
  knownAirports: string[];
}) {
  const unknown = filters.departureAirports
    .filter((o) => o.passengers > 0 && !knownAirports.includes(o.airport))
    .map((o) => o.airport);

  return (
    <div className="flex flex-col gap-2">
      <DepartureAirportEditor
        origins={filters.departureAirports}
        onChange={(departureAirports) => onChange({ ...filters, departureAirports })}
        gatheringAirport={filters.preferredGatheringAirport}
        onGatheringChange={(preferredGatheringAirport) =>
          onChange({ ...filters, preferredGatheringAirport })
        }
      />

      {unknown.length > 0 && (
        <Text
          size="very small"
          value={`These results hold no flights for ${unknown.join(", ")}. Run the search again from the home page to include them.`}
          className="text-orange-600"
        />
      )}
    </div>
  );
}
