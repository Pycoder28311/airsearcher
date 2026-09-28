"use client";

import { useEffect, useRef, useState } from "react";
import Text from "@/framework/ui/iconText/Text";
import { useAlert } from "@/framework/ui/useAlert";
import { MAX_AIRPORTS_PER_REQUEST } from "@/lib/airsearcher/config/constants";
import { cityName, type PlaceSuggestion } from "@/data/places";
import type { DestinationSelection } from "@/lib/airsearcher/types";
import DestinationChip from "./DestinationChip";
import PlaceSearchInput from "./PlaceSearchInput";

/** How long a chip stays highlighted after something was added to it. */
const FLASH_MS = 1200;

/** How long the alert saying what happened stays up. */
const ALERT_MS = 3000;

/** A chip's identity: a city by its id, an airport added on its own by its code. */
function chipKey(place: DestinationSelection): string {
  return place.kind === "airport" ? `airport:${place.airports[0]}` : `city:${place.cityId}`;
}

/**
 * Every destination being compared, as chips inside one search box.
 *
 * An airport of a city that's already listed goes inside that city's chip; an
 * airport whose city isn't listed is its own chip. The search joins entries of
 * the same city anyway (`mergedDestinations`), so nothing is searched twice.
 *
 * Flights to all of them come out of the same requests, so comparing several
 * places is normally free; only enough airports to overflow one request costs
 * more, which the note below spells out.
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
  const [flashKey, setFlashKey] = useState<string | null>(null);
  /** The last chip, marked after one Backspace: the next one removes it. */
  const [lastArmed, setLastArmed] = useState(false);
  const { showAlert } = useAlert();

  // A chip's panel is handed its callbacks when it opens, so they must read the
  // list as it is now, not as it was then.
  const latest = useRef(destinations);
  useEffect(() => {
    latest.current = destinations;
  }, [destinations]);

  useEffect(() => {
    if (!flashKey) return;
    const timer = window.setTimeout(() => setFlashKey(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashKey]);

  /** Highlights a chip and says why in the top-right alert. */
  const point = (place: DestinationSelection, type: "Success" | "Warning", message: string) => {
    setFlashKey(chipKey(place));
    showAlert(type, message, { durationMs: ALERT_MS });
  };

  /**
   * A city is added once; adding it takes in any of its airports that were
   * added on their own. An airport of a city already listed goes inside that
   * city. Any other airport becomes its own chip.
   */
  const add = (suggestion: PlaceSuggestion) => {
    const current = latest.current;
    const cityChip = current.find((p) => p.kind !== "airport" && p.cityId === suggestion.cityId);
    const name = cityName(suggestion.cityId);

    if (suggestion.kind === "city") {
      if (cityChip) return point(cityChip, "Warning", `${name} is already in your destinations.`);
      const absorbed = current.filter((p) => p.kind === "airport" && p.cityId === suggestion.cityId);
      const city: DestinationSelection = {
        cityId: suggestion.cityId,
        airports: [...new Set([...suggestion.airportCodes, ...absorbed.flatMap((p) => p.airports)])],
      };
      onChange([...current.filter((p) => !absorbed.includes(p)), city]);
      if (absorbed.length > 0) {
        const codes = absorbed.map((p) => p.airports[0]).join(", ");
        point(city, "Success", `${codes} moved into ${name}.`);
      }
      return;
    }

    const code = suggestion.airportCodes[0];
    if (cityChip) {
      if (cityChip.airports.includes(code)) {
        return point(cityChip, "Warning", `${code} is already in ${name}.`);
      }
      const merged = { ...cityChip, airports: [...cityChip.airports, code] };
      onChange(current.map((p) => (p === cityChip ? merged : p)));
      return point(merged, "Success", `${code} added to ${name}.`);
    }
    const same = current.find((p) => p.kind === "airport" && p.airports[0] === code);
    if (same) return point(same, "Warning", `${code} is already in your destinations.`);
    onChange([...current, { cityId: suggestion.cityId, airports: [code], kind: "airport" }]);
  };

  const replace = (key: string, next: DestinationSelection) =>
    onChange(latest.current.map((place) => (chipKey(place) === key ? next : place)));

  const remove = (key: string) =>
    onChange(latest.current.filter((place) => chipKey(place) !== key));

  const removeLast = () => {
    if (latest.current.length > 0) onChange(latest.current.slice(0, -1));
  };

  const airportCount = new Set(destinations.flatMap((place) => place.airports)).size;

  const chips = destinations.map((destination, index) => {
    const key = chipKey(destination);
    return (
      <DestinationChip
        key={key}
        destination={destination}
        flash={flashKey === key}
        selected={lastArmed && index === destinations.length - 1}
        onChange={(next) => replace(key, next)}
        onRemove={() => remove(key)}
        onOpenMap={onOpenMap}
      />
    );
  });

  return (
    <div className="flex w-full flex-col gap-2">
      <PlaceSearchInput
        onPick={add}
        onOpenMap={onOpenMap}
        placeholder={destinations.length === 0 ? "Where to?" : "Add more"}
        leftContent={chips.length > 0 ? chips : undefined}
        onRemoveLast={removeLast}
        onArmRemoveLast={setLastArmed}
        // Chips wrap onto more rows; the text box keeps enough room to type.
        className="h-auto! min-h-14 flex-wrap gap-1.5! py-2 [&>input]:min-w-28"
      />

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
