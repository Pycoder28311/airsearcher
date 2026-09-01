"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { airportsOfCity, cityById } from "@/data/places";
import type { AirportCode } from "@/lib/airsearcher/types";
import MultiSelectList from "../common/MultiSelectList";
import Panel from "../common/Panel";

/**
 * The right-side panel opened by the arrow beside a destination city.
 *
 * Holds its own working copy so the list stays live inside the anchored modal,
 * which snapshots whatever it was handed. Nothing is applied until Done.
 * Every airport starts selected, as the brief requires.
 */
export default function CityAirportPanel({
  cityId,
  initialSelection,
  onApply,
  onOpenMap,
  onClose,
}: {
  cityId: string;
  initialSelection: AirportCode[];
  onApply: (airports: AirportCode[]) => void;
  onOpenMap?: (cityId: string) => void;
  onClose: () => void;
}) {
  const city = cityById(cityId);
  const airports = airportsOfCity(cityId);

  const [selected, setSelected] = useState<AirportCode[]>(
    initialSelection.length > 0 ? initialSelection : airports.map((a) => a.code),
  );

  return (
    <Panel className="w-72">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <Text
              size="small"
              value={city?.name ?? cityId}
              className="font-semibold text-gray-900"
            />
            <Text size="very small" value={city?.country ?? ""} className="text-gray-500" />
          </div>
          {onOpenMap && (
            <Button styleType="tertiary" onClick={() => onOpenMap(cityId)}>
              <Text size="very small" value="Map" />
            </Button>
          )}
        </div>

        <MultiSelectList
          options={airports.map((airport) => ({
            value: airport.code,
            label: airport.code,
            sublabel: airport.name,
          }))}
          selected={selected}
          onChange={setSelected}
          emptyMessage="No airports listed for this city"
        />

        <div className="flex justify-end gap-2">
          <Button styleType="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            styleType="primary"
            disabled={selected.length === 0}
            onClick={() => {
              onApply(selected);
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </Panel>
  );
}
