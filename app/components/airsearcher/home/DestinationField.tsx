"use client";

import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import { colorMain } from "@/config/theme";
import { cityById, type PlaceSuggestion } from "@/data/places";
import type { AirportCode } from "@/lib/airsearcher/types";
import CityAirportPanel from "./CityAirportPanel";
import PlaceSearchInput from "./PlaceSearchInput";

export interface DestinationValue {
  cityId: string | null;
  airports: AirportCode[];
}

/**
 * Picks one destination and its airports.
 *
 * Used by the map modal, whose selection is a single place at a time. The home
 * page compares several destinations and uses `DestinationsField` instead;
 * both share `PlaceSearchInput`, so searching behaves identically in all three.
 */
export default function DestinationField({
  value,
  onChange,
  onOpenMap,
  styleType = "BigSearch",
  placeholder = "Where to?",
}: {
  value: DestinationValue;
  onChange: (next: DestinationValue) => void;
  onOpenMap?: (cityId: string) => void;
  styleType?: "simple" | "BigSearch";
  placeholder?: string;
}) {
  const airportPanel = useAbsoluteModal<HTMLDivElement>();

  const city = value.cityId ? cityById(value.cityId) : null;
  const summary = city
    ? `${city.name} · ${value.airports.length} airport${value.airports.length === 1 ? "" : "s"}`
    : "";

  const choose = (suggestion: PlaceSuggestion) =>
    onChange({ cityId: suggestion.cityId, airports: [...suggestion.airportCodes] });

  const openAirportPanel = (cityId: string) => {
    airportPanel.open({
      side: "right",
      align: "start",
      offset: 8,
      component: (
        <CityAirportPanel
          cityId={cityId}
          initialSelection={value.cityId === cityId ? value.airports : []}
          onApply={(airports) => onChange({ cityId, airports })}
          onOpenMap={onOpenMap}
          onClose={airportPanel.close}
        />
      ),
    });
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <PlaceSearchInput
        onPick={choose}
        onOpenMap={onOpenMap}
        onOpenAirports={openAirportPanel}
        styleType={styleType}
        placeholder={placeholder}
      />

      {/* The airports themselves are listed and ticked below the map. */}
      {city && (
        <div {...airportPanel.triggerProps} className="self-start">
          <Text size="very small" value={summary} className={colorMain.text} />
        </div>
      )}
    </div>
  );
}
