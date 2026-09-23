"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import SearchInput from "@/framework/ui/searchInput/SearchInput";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import { grayLight, radius } from "@/config/theme";
import { cityById, isRuralPlace, searchPlaces, type PlaceSuggestion } from "@/data/places";
import Panel from "../common/Panel";

/**
 * The search box that suggests cities, rural places and airports.
 *
 * Shared so every place picker in the app behaves identically: the single
 * destination field, the multi-destination field on the home page, and the
 * search bar inside the map modal. Each city row carries a Map control and an
 * arrow that opens the airport panel; both stop at their own handler so they
 * never also pick the row.
 */
export default function PlaceSearchInput({
  onPick,
  onOpenMap,
  onOpenAirports,
  styleType = "BigSearch",
  placeholder = "Where to?",
}: {
  onPick: (suggestion: PlaceSuggestion) => void;
  onOpenMap?: (cityId: string) => void;
  onOpenAirports?: (cityId: string) => void;
  styleType?: "simple" | "BigSearch";
  placeholder?: string;
}) {
  const suggestions = useAbsoluteModal<HTMLDivElement>();
  const [query, setQuery] = useState("");

  const choose = (suggestion: PlaceSuggestion) => {
    onPick(suggestion);
    setQuery("");
    suggestions.close();
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
                {onOpenAirports && (
                  <Button
                    styleType="tertiary"
                    onClick={() => {
                      suggestions.close();
                      onOpenAirports(suggestion.cityId);
                    }}
                    className="shrink-0"
                  >
                    <Text icon="arrow-right" size="small" />
                    <span className="sr-only">Choose airports in {suggestion.label}</span>
                  </Button>
                )}
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
  );
}
