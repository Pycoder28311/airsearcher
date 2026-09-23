"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import { border, colorMain, grayLight, radius } from "@/config/theme";
import { cityById, isRuralPlace } from "@/data/places";
import type { DestinationSelection } from "@/lib/airsearcher/types";
import CityAirportPanel from "./CityAirportPanel";

/**
 * One chosen destination, below the search box: its name, the airports being
 * searched, and controls to change them, open the map, or drop it.
 *
 * Its own component because each card owns an anchored airport panel, and a
 * hook cannot live inside a list callback.
 */
export default function DestinationCard({
  destination,
  onChange,
  onRemove,
  onOpenMap,
}: {
  destination: DestinationSelection;
  onChange: (next: DestinationSelection) => void;
  onRemove: () => void;
  onOpenMap?: (cityId: string) => void;
}) {
  const airportPanel = useAbsoluteModal<HTMLDivElement>();
  const city = cityById(destination.cityId);
  const rural = isRuralPlace(city);

  return (
    <div
      className={`flex min-w-0 items-center gap-2 bg-white ${border} ${radius} py-1.5 pr-1.5 pl-2.5`}
    >
      <Text icon={rural ? "star" : "home"} size="very small" className="shrink-0 text-gray-400" />

      <span className="flex min-w-0 flex-col">
        <Text
          size="very small"
          value={city?.name ?? destination.cityId}
          className="truncate font-medium text-gray-900"
        />
        <Text
          size="very small"
          value={
            destination.airports.length > 0
              ? destination.airports.join(", ")
              : "No airports selected"
          }
          className={`truncate ${destination.airports.length > 0 ? colorMain.text : "text-red-600"}`}
        />
      </span>

      <div {...airportPanel.triggerProps} className="shrink-0">
        <Button
          styleType="tertiary"
          onClick={() =>
            airportPanel.open({
              side: "bottom",
              align: "start",
              offset: 8,
              component: (
                <CityAirportPanel
                  cityId={destination.cityId}
                  initialSelection={destination.airports}
                  onApply={(airports) => onChange({ cityId: destination.cityId, airports })}
                  onOpenMap={onOpenMap}
                  onClose={airportPanel.close}
                />
              ),
            })
          }
          className={`shrink-0 ${grayLight.bgHover}`}
        >
          <Text size="very small" value="Airports" />
        </Button>
      </div>

      {onOpenMap && (
        <Button
          styleType="tertiary"
          onClick={() => onOpenMap(destination.cityId)}
          className="shrink-0"
        >
          <Text size="very small" value="Map" />
        </Button>
      )}

      <Button styleType="tertiary" onClick={onRemove} className="shrink-0">
        <Text icon="close" size="very small" className="text-gray-400" />
        <span className="sr-only">Remove {city?.name ?? destination.cityId}</span>
      </Button>
    </div>
  );
}
