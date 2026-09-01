"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { colorMain, colorSecondary, grayMid, radius } from "@/config/theme";
import { AIRPORT_ZOOM_THRESHOLD } from "@/lib/airsearcher/config/constants";
import { airportByCode, cityById } from "@/data/places";
import {
  EMPTY_SELECTION,
  selectAllInCity,
  toggleAirport,
  type PlaceSelection,
} from "@/lib/airsearcher/mapSelection";
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

  const [selection, setSelection] = useState<PlaceSelection>(() =>
    startCity ? { cityId: startCity, airports: [...value.airports] } : EMPTY_SELECTION,
  );
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom: number } | null>(
    () =>
      startCityRecord
        ? {
            lat: startCityRecord.lat,
            lon: startCityRecord.lon,
            zoom: AIRPORT_ZOOM_THRESHOLD + 1,
          }
        : null,
  );

  const city = selection.cityId ? cityById(selection.cityId) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Choose destination on the map"
      subtitle={`Cities are always shown; airports appear from zoom ${AIRPORT_ZOOM_THRESHOLD}. Airports can only be combined within one city.`}
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
                value="Click a city, or zoom in and click individual airports."
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
          placeholder="Search a city or airport…"
          value={selection}
          onChange={(next) => {
            setSelection({ cityId: next.cityId, airports: next.airports });
            const found = next.cityId ? cityById(next.cityId) : null;
            if (found) {
              setFlyTarget({
                lat: found.lat,
                lon: found.lon,
                zoom: AIRPORT_ZOOM_THRESHOLD + 1,
              });
            }
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
