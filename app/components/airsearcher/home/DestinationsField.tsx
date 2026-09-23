"use client";

import Text from "@/framework/ui/iconText/Text";
import { MAX_AIRPORTS_PER_REQUEST } from "@/lib/airsearcher/config/constants";
import type { PlaceSuggestion } from "@/data/places";
import type { DestinationSelection } from "@/lib/airsearcher/types";
import DestinationCard from "./DestinationCard";
import PlaceSearchInput from "./PlaceSearchInput";

/**
 * Every destination being compared, added by typing into one search box.
 *
 * Flights to all of them come out of the same requests, so comparing several
 * cities is normally free; only enough airports to overflow one request costs
 * more, which the cost line under the panel already spells out.
 */
export default function DestinationsField({
  destinations,
  onChange,
  onOpenMap,
}: {
  destinations: DestinationSelection[];
  onChange: (next: DestinationSelection[]) => void;
  onOpenMap?: (cityId: string) => void;
}) {
  /**
   * Picking a place adds it. Picking one that is already listed merges into
   * it — an airport suggestion for a listed city adds that airport rather than
   * replacing the city's whole selection.
   */
  const add = (suggestion: PlaceSuggestion) => {
    const existing = destinations.find((place) => place.cityId === suggestion.cityId);
    if (!existing) {
      onChange([...destinations, { cityId: suggestion.cityId, airports: [...suggestion.airportCodes] }]);
      return;
    }
    const airports = [...new Set([...existing.airports, ...suggestion.airportCodes])];
    onChange(
      destinations.map((place) =>
        place.cityId === suggestion.cityId ? { ...place, airports } : place,
      ),
    );
  };

  const replace = (cityId: string, next: DestinationSelection) =>
    onChange(destinations.map((place) => (place.cityId === cityId ? next : place)));

  const airportCount = new Set(destinations.flatMap((place) => place.airports)).size;

  return (
    <div className="flex w-full flex-col gap-2">
      <PlaceSearchInput
        onPick={add}
        onOpenMap={onOpenMap}
        placeholder={destinations.length === 0 ? "Where to?" : "Add another destination…"}
      />

      {destinations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {destinations.map((destination) => (
            <DestinationCard
              key={destination.cityId}
              destination={destination}
              onChange={(next) => replace(destination.cityId, next)}
              onRemove={() =>
                onChange(destinations.filter((place) => place.cityId !== destination.cityId))
              }
              onOpenMap={onOpenMap}
            />
          ))}
        </div>
      )}

      {airportCount > MAX_AIRPORTS_PER_REQUEST - 1 && (
        <Text
          size="very small"
          value={`${airportCount} destination airports: more than ${MAX_AIRPORTS_PER_REQUEST - 1} fit in one request alongside the gathering airport, so each date is split into several searches. Remove a few airports to bring the cost back down.`}
          className="text-gray-500"
        />
      )}
    </div>
  );
}
