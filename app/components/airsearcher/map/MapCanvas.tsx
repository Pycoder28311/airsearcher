"use client";

import "leaflet/dist/leaflet.css";

import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useState } from "react";
import { AIRPORT_ZOOM_THRESHOLD } from "@/lib/airsearcher/config/constants";
import { ALL_CITIES, ALL_AIRPORTS, cityById, driveLabel, isRuralPlace } from "@/data/places";
import {
  isAirportSelected,
  selectCity,
  toggleAirport,
  type PlaceSelection,
} from "@/lib/airsearcher/mapSelection";
import type { Airport } from "@/lib/airsearcher/types";

/** Theme colours as literals: Leaflet paints SVG attributes, not CSS classes. */
const COLORS = {
  city: "#6B7280",
  citySelected: "#F97316",
  airport: "#9CA3AF",
  airportSelected: "#2563EB",
  link: "#F97316",
  place: "#059669",
};

/** Keeps the parent informed of the current zoom so airports can hide. */
function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  return null;
}

/**
 * Where the map should go. With `bounds`, the view frames all of those points
 * (a destination and its airports), zooming no closer than `zoom`.
 */
export interface FlyTarget {
  lat: number;
  lon: number;
  zoom: number;
  bounds?: [number, number][];
}

/** Flies to a place when the search bar picks one. */
function FlyTo({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.bounds && target.bounds.length > 1) {
      map.flyToBounds(target.bounds, { padding: [40, 40], maxZoom: target.zoom });
    } else {
      map.flyTo([target.lat, target.lon], target.zoom);
    }
  }, [target, map]);
  return null;
}

/**
 * The map itself.
 *
 * Selection rules live in `lib/airsearcher/mapSelection.ts`; this component
 * calls them and renders the result, so the "one city at a time" rule cannot
 * drift between the map and the rest of the app.
 *
 * Airports and rural places vanish below AIRPORT_ZOOM_THRESHOLD so a
 * zoomed-out map stays readable — except the selected destination and its
 * airports, which always show. The selected city's airports are joined by
 * lines; a selected rural place has a line out to each of its airports.
 */
export default function MapCanvas({
  selection,
  onSelectionChange,
  flyTarget,
}: {
  selection: PlaceSelection;
  onSelectionChange: (next: PlaceSelection) => void;
  flyTarget: FlyTarget | null;
}) {
  const [zoom, setZoom] = useState(5);
  const showAirports = zoom >= AIRPORT_ZOOM_THRESHOLD;

  const selectedCity = selection.cityId ? cityById(selection.cityId) : null;
  const selectedAirports = selection.airports
    .map((code) => ALL_AIRPORTS.find((a) => a.code === code))
    .filter((a): a is Airport => a !== undefined);

  return (
    <MapContainer
      center={[48, 12]}
      zoom={5}
      scrollWheelZoom
      // Canvas draws the thousand-plus destination dots far faster than SVG.
      preferCanvas
      className="h-full w-full"
      style={{ background: "#F9FAFB" }}
    >
      <TileLayer
        // OpenStreetMap's public tiles: fine for development. Revisit before
        // this ever serves production traffic.
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      <ZoomWatcher onZoom={setZoom} />
      <FlyTo target={flyTarget} />

      {/* Lines joining the airports currently chosen for one city. */}
      {selectedAirports.length > 1 && selectedCity && !isRuralPlace(selectedCity) && (
        <Polyline
          positions={selectedAirports.map((a) => [a.lat, a.lon] as [number, number])}
          pathOptions={{ color: COLORS.link, weight: 2, dashArray: "4 4" }}
        />
      )}

      {/* A rural place: a line out to each airport chosen for it. */}
      {selectedCity &&
        isRuralPlace(selectedCity) &&
        selectedAirports.map((airport) => (
          <Polyline
            key={`link-${airport.code}`}
            positions={[
              [selectedCity.lat, selectedCity.lon],
              [airport.lat, airport.lon],
            ]}
            pathOptions={{ color: COLORS.link, weight: 2, dashArray: "4 4" }}
          />
        ))}

      {ALL_CITIES.map((city) => {
        const isSelected = selection.cityId === city.id;
        const rural = isRuralPlace(city);
        // Rural places would bury the cities on a zoomed-out map.
        if (rural && !showAirports && !isSelected) return null;
        return (
          <CircleMarker
            key={city.id}
            center={[city.lat, city.lon]}
            radius={isSelected ? 9 : rural ? 5 : 6}
            pathOptions={{
              color: isSelected ? COLORS.citySelected : rural ? COLORS.place : COLORS.city,
              fillColor: isSelected ? COLORS.citySelected : rural ? COLORS.place : COLORS.city,
              fillOpacity: isSelected ? 0.9 : 0.55,
              weight: 2,
            }}
            eventHandlers={{ click: () => onSelectionChange(selectCity(city)) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {city.name} · {city.airportCodes.length} {rural ? "nearby " : ""}airport
              {city.airportCodes.length === 1 ? "" : "s"}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {ALL_AIRPORTS.map((airport) => {
        const isSelected = isAirportSelected(selection, airport.code);
        // The chosen destination's airports stay visible at every zoom.
        if (!showAirports && !isSelected) return null;
        return (
          <CircleMarker
            key={airport.code}
            center={[airport.lat, airport.lon]}
            radius={isSelected ? 7 : 4}
            pathOptions={{
              color: isSelected ? COLORS.airportSelected : COLORS.airport,
              fillColor: isSelected ? COLORS.airportSelected : COLORS.airport,
              fillOpacity: isSelected ? 0.95 : 0.6,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onSelectionChange(toggleAirport(selection, airport)),
            }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              {airport.code} · {airport.name}
              {driveLabel(selectedCity, airport.code) &&
                ` · ${driveLabel(selectedCity, airport.code)}`}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
