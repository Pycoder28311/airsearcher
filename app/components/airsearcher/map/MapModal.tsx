"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { colorMain, colorSecondary, grayMid, radius } from "@/config/theme";
import { AIRPORT_ZOOM_THRESHOLD } from "@/lib/airsearcher/config/constants";
import { airportByCode, airportsOfCity, cityById } from "@/data/places";
import {
  EMPTY_SELECTION,
  selectAllInCity,
  selectCity,
  toggleAirport,
  type PlaceSelection,
} from "@/lib/airsearcher/mapSelection";
import type { City } from "@/lib/airsearcher/types";
import type { FlyTarget } from "./MapCanvas";
import Dialog from "../common/Dialog";
import DestinationField from "../home/DestinationField";

// Leaflet reaches for `window` on import, so the canvas must never render on
// the server.
const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <Text size="small" value="Loading map…" className="text-gray-400" />
    </div>
  ),
});

/**
 * Where the map should go for a destination: framing the destination and all
 * of its airports, which for a rural place can lie a couple of hundred
 * kilometres away.
 */
function flyTargetFor(city: City): FlyTarget {
  const points = [
    [city.lat, city.lon] as [number, number],
    ...airportsOfCity(city.id).map((a) => [a.lat, a.lon] as [number, number]),
  ];
  return { lat: city.lat, lon: city.lon, zoom: AIRPORT_ZOOM_THRESHOLD + 1, bounds: points };
}

/**
 * Pick a destination city and its airports on a map.
 *
 * The search bar at the top is the very same `DestinationField` the main search
 * uses, at its `simple` size, so the interaction is identical in both places.
 *
 * Nothing is applied until Confirm — panning and exploring never silently
 * change the search.
 */
export default function MapModal({
  open,
  onClose,
  initialCityId,
  value,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  initialCityId?: string;
  value: { cityId: string | null; airports: string[] };
  onConfirm: (next: PlaceSelection) => void;
}) {
  // The caller remounts this on open (see the `key` it passes), so the initial
  // state below is always built from what the search currently holds.
  const startCity = initialCityId ?? value.cityId;
  const startCityRecord = startCity ? cityById(startCity) : null;

  // The search's own destination keeps the airports already ticked for it;
  // any other destination opens with all of its airports selected.
  const [selection, setSelection] = useState<PlaceSelection>(() => {
    if (!startCityRecord) return EMPTY_SELECTION;
    if (startCityRecord.id === value.cityId && value.airports.length > 0) {
      return { cityId: startCityRecord.id, airports: [...value.airports] };
    }
    return selectCity(startCityRecord);
  });
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(() =>
    startCityRecord ? flyTargetFor(startCityRecord) : null,
  );

  const city = selection.cityId ? cityById(selection.cityId) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Choose destination on the map"
      subtitle={`Cities are always shown; airports and rural places (UNESCO sites, national parks) appear from zoom ${AIRPORT_ZOOM_THRESHOLD}. Airports can only be combined within one destination.`}
      width="max-w-5xl"
      footer={
        <>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {city ? (
              <>
                <Text
                  size="small"
                  value={city.name}
                  className={`font-medium ${colorSecondary.text}`}
                />
                {selection.airports.map((code) => {
                  const airport = airportByCode(code);
                  return (
                    <Button
                      key={code}
                      styleType="tertiary"
                      onClick={() =>
                        airport && setSelection(toggleAirport(selection, airport))
                      }
                      className={`gap-1.5 border ${grayMid.border}`}
                    >
                      <Text size="very small" value={code} className={colorMain.text} />
                      <Text icon="close" size="very small" className="text-gray-400" />
                    </Button>
                  );
                })}
                {selection.airports.length < city.airportCodes.length && (
                  <Button
                    styleType="underline"
                    onClick={() => setSelection(selectAllInCity(selection, city))}
                  >
                    <Text size="very small" value="Select all airports" />
                  </Button>
                )}
              </>
            ) : (
              <Text
                size="very small"
                value="Click a city or place, or zoom in and click individual airports."
                className="text-gray-400"
              />
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            <Button styleType="tertiary" onClick={() => setSelection(EMPTY_SELECTION)}>
              Clear
            </Button>
            <Button
              styleType="primary"
              disabled={selection.airports.length === 0}
              onClick={() => onConfirm(selection)}
            >
              Confirm airports
            </Button>
          </div>
        </>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <DestinationField
          styleType="simple"
          placeholder="Search a city, place or airport…"
          value={selection}
          onChange={(next) => {
            setSelection({ cityId: next.cityId, airports: next.airports });
            const found = next.cityId ? cityById(next.cityId) : null;
            if (found) setFlyTarget(flyTargetFor(found));
          }}
        />

        <div
          className={`h-[55vh] min-h-72 w-full overflow-hidden ${radius} border ${grayMid.border}`}
        >
          <MapCanvas
            selection={selection}
            onSelectionChange={setSelection}
            flyTarget={flyTarget}
          />
        </div>
      </div>
    </Dialog>
  );
}
