"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import SearchInput from "@/framework/ui/searchInput/SearchInput";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import { colorMain, grayLight, radius } from "@/config/theme";
import { cityById, isRuralPlace, searchPlaces, type PlaceSuggestion } from "@/data/places";
import type { AirportCode } from "@/lib/airsearcher/types";
import Panel from "../common/Panel";
import CityAirportPanel from "./CityAirportPanel";

export interface DestinationValue {
  cityId: string | null;
  airports: AirportCode[];
}

/**
 * Google-Flights-style destination picker.
 *
 * Deliberately reusable: the map modal's search bar is this same component with
 * `styleType="simple"`, so the two behave identically as the brief requires.
 *
 * Each city row carries an arrow on its right that opens the airport panel, and
 * a Map control. Both stop propagation so they never also pick the row.
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
  const suggestions = useAbsoluteModal<HTMLDivElement>();
  const airportPanel = useAbsoluteModal<HTMLDivElement>();
  const [query, setQuery] = useState("");

  const city = value.cityId ? cityById(value.cityId) : null;
  const summary = city
    ? `${city.name} · ${value.airports.length} airport${value.airports.length === 1 ? "" : "s"}`
    : "";

  const choose = (suggestion: PlaceSuggestion) => {
    onChange({ cityId: suggestion.cityId, airports: [...suggestion.airportCodes] });
    setQuery("");
    suggestions.close();
  };

  const openAirportPanel = (cityId: string) => {
    suggestions.close();
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

  /**
   * Self-contained so it keeps its own list state inside the anchored modal,
   * which snapshots whatever it is handed rather than re-rendering it.
   */
  const SuggestionList = ({ text }: { text: string }) => (
    <Panel className="max-h-80 w-full min-w-72 overflow-y-auto p-1.5">
      {searchPlaces(text).length === 0 ? (
        <Text
          size="small"
          value="No matching city or airport"
          className="px-2 py-3 text-gray-400 italic"
        />
      ) : (
        searchPlaces(text).map((suggestion) => (
          <div
            key={`${suggestion.kind}-${suggestion.id}`}
            className={`flex items-center gap-2 ${radius} ${grayLight.bgHover}`}
          >
            <Button
              styleType="tertiary"
              onClick={() => choose(suggestion)}
              className="min-w-0 flex-1 justify-start! gap-2 bg-transparent! px-2! py-2! text-left hover:bg-transparent!"
            >
            <Text
              icon={
                suggestion.kind === "airport"
                  ? "arrow-right"
                  : isRuralPlace(cityById(suggestion.cityId))
                    ? "star"
                    : "home"
              }
              size="small"
              className="shrink-0 text-gray-400"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <Text size="small" value={suggestion.label} className="truncate text-gray-900" />
              <Text
                size="very small"
                value={suggestion.sublabel}
                className="truncate text-gray-400"
              />
            </span>
            </Button>

            {suggestion.kind === "city" && (
              <>
                {onOpenMap && (
                  <Button
                    styleType="tertiary"
                    onClick={() => {
                      suggestions.close();
                      onOpenMap(suggestion.cityId);
                    }}
                    className="shrink-0"
                  >
                    <Text size="very small" value="Map" />
                  </Button>
                )}
                <Button
                  styleType="tertiary"
                  onClick={() => openAirportPanel(suggestion.cityId)}
                  className="shrink-0"
                >
                  <Text icon="arrow-right" size="small" />
                  <span className="sr-only">Choose airports in {suggestion.label}</span>
                </Button>
              </>
            )}
          </div>
        ))
      )}
    </Panel>
  );

  const showSuggestions = (text: string) => {
    suggestions.open({
      component: <SuggestionList text={text} />,
      side: "bottom",
      align: "start",
      offset: 6,
      matchAnchorWidth: styleType === "BigSearch",
    });
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <div {...suggestions.triggerProps} className="w-full">
        <SearchInput
          styleType={styleType}
          placeholder={placeholder}
          value={query}
          onClick={() => showSuggestions(query)}
          onType={(text) => {
            setQuery(text);
            showSuggestions(text);
          }}
        />
      </div>

      {city && (
        <div
          {...airportPanel.triggerProps}
          className="flex items-center gap-2 self-start"
        >
          <Text size="very small" value={summary} className={colorMain.text} />
          <Button styleType="underline" onClick={() => openAirportPanel(city.id)}>
            <Text size="very small" value="Edit airports" />
          </Button>
        </div>
      )}
    </div>
  );
}
