"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/framework/ui/buttons/Button";
import SearchInput from "@/framework/ui/searchInput/SearchInput";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import { grayLight, radius } from "@/config/theme";
import { cityById, isRuralPlace, searchPlaces, type PlaceSuggestion } from "@/data/places";
import Panel from "../common/Panel";

/** Two Backspaces in an empty box within this time remove the last chip. */
const DOUBLE_BACKSPACE_MS = 2000;

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
  leftContent,
  className = "",
  onRemoveLast,
  onArmRemoveLast,
}: {
  onPick: (suggestion: PlaceSuggestion) => void;
  onOpenMap?: (cityId: string) => void;
  onOpenAirports?: (cityId: string) => void;
  styleType?: "simple" | "BigSearch";
  placeholder?: string;
  /** Shown inside the box, before the text: the chosen places, as chips. */
  leftContent?: ReactNode;
  className?: string;
  /**
   * Backspace in an empty box: the first press arms, a second within
   * DOUBLE_BACKSPACE_MS calls this, and from then on every press does, until
   * the box is clicked or typed in again.
   */
  onRemoveLast?: () => void;
  /** True while armed, so the chip that would go can be highlighted. */
  onArmRemoveLast?: (armed: boolean) => void;
}) {
  const suggestions = useAbsoluteModal<HTMLDivElement>();
  const [query, setQuery] = useState("");

  // Backspace state: when the first press happened, and whether removing is
  // unlocked (every press removes). Refs: they never change what's drawn.
  const armedAt = useRef<number | null>(null);
  const unlocked = useRef(false);
  const disarmTimer = useRef<number | null>(null);

  const setArmed = (at: number | null) => {
    armedAt.current = at;
    if (disarmTimer.current !== null) window.clearTimeout(disarmTimer.current);
    disarmTimer.current =
      at === null ? null : window.setTimeout(() => setArmed(null), DOUBLE_BACKSPACE_MS);
    onArmRemoveLast?.(at !== null);
  };

  /** Back to needing two presses: after a click in the box, or typing. */
  const resetBackspace = () => {
    unlocked.current = false;
    if (armedAt.current !== null) setArmed(null);
  };

  useEffect(
    () => () => {
      if (disarmTimer.current !== null) window.clearTimeout(disarmTimer.current);
    },
    [],
  );

  const backspace = () => {
    if (!onRemoveLast) return;
    if (unlocked.current) return onRemoveLast();
    const now = Date.now();
    if (armedAt.current !== null && now - armedAt.current <= DOUBLE_BACKSPACE_MS) {
      setArmed(null);
      unlocked.current = true;
      onRemoveLast();
      return;
    }
    setArmed(now);
  };

  const choose = (suggestion: PlaceSuggestion) => {
    onPick(suggestion);
    setQuery("");
    suggestions.close();
  };

  /** Adds the top suggestion for what's typed, as Enter does. */
  const pickFirst = (): boolean => {
    if (query.trim() === "") return false;
    const first = searchPlaces(query)[0];
    if (!first) return false;
    choose(first);
    return true;
  };

  // A click anywhere outside the box and its suggestion list, with something
  // typed, adds the top suggestion too. Listening on the document (not blur)
  // means a click on a suggestion is never mistaken for a click outside.
  const latestPickFirst = useRef(pickFirst);
  useEffect(() => {
    latestPickFirst.current = pickFirst;
  });
  const typing = query.trim() !== "";
  useEffect(() => {
    if (!typing) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (suggestions.triggerRef.current?.contains(target)) return;
      if (target.closest("[data-absolute-modal]")) return;
      latestPickFirst.current();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [typing, suggestions.triggerRef]);


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
    <div
      {...suggestions.triggerProps}
      className="w-full"
      // Enter or Space picks the first suggestion, the one at the top of the
      // list. Caught here because the framework's SearchInput has no key hook.
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).tagName === "INPUT") resetBackspace();
      }}
      onKeyDown={(event) => {
        if (event.key === "Backspace" && query === "") return backspace();
        // Enter and Space both add the top suggestion. Space means a name is
        // typed one word at a time ("york" finds New York), never with a space.
        if ((event.key !== "Enter" && event.key !== " ") || event.nativeEvent.isComposing) return;
        // A Space with nothing typed would only put a blank in the box.
        if (pickFirst() || event.key === " ") event.preventDefault();
      }}
    >
      <SearchInput
        styleType={styleType}
        placeholder={placeholder}
        leftButton={leftContent}
        className={className}
        value={query}
        onClick={() => showSuggestions(query)}
        onType={(text) => {
          if (text !== "") resetBackspace();
          setQuery(text);
          showSuggestions(text);
        }}
      />
    </div>
  );
}
