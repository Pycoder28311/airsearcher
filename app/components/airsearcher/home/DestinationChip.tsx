"use client";

import { useRef } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import { colorRed, colorSecondary, grayMid, grayStrong, radius } from "@/config/theme";
import { airportByCode, cityById } from "@/data/places";
import type { DestinationSelection } from "@/lib/airsearcher/types";
import Panel from "../common/Panel";
import CityAirportPanel from "./CityAirportPanel";

/** How long the panel waits before closing, so the mouse can reach it. */
const CLOSE_DELAY_MS = 200;

/** The panel of an airport chip: the place it belongs to, and the map. */
function AirportPlacePanel({
  cityId,
  onOpenMap,
  onClose,
}: {
  cityId: string;
  onOpenMap?: (cityId: string) => void;
  onClose: () => void;
}) {
  const city = cityById(cityId);
  return (
    <Panel className="flex min-w-48 items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col">
        <Text size="small" value={city?.name ?? cityId} className="truncate font-semibold text-gray-900" />
        <Text size="very small" value={city?.country ?? ""} className="truncate text-gray-500" />
      </span>
      {onOpenMap && (
        <Button
          styleType="tertiary"
          onClick={() => {
            onClose();
            onOpenMap(cityId);
          }}
          className="shrink-0"
        >
          <Text size="very small" value="Map" />
        </Button>
      )}
    </Panel>
  );
}

/**
 * One chosen destination, shown as a chip inside the destination box.
 *
 * A city chip shows the city's name; its panel lists the airports, and ticks
 * apply at once. An airport chip (fully rounded) shows a plane and the code; its
 * panel names the place it belongs to, with a Map button. With a mouse the
 * panel opens on hover and stays open while the pointer moves onto it; on
 * touch screens a tap opens and closes it.
 */
export default function DestinationChip({
  destination,
  flash,
  selected = false,
  onChange,
  onRemove,
  onOpenMap,
}: {
  destination: DestinationSelection;
  /** Briefly pops, when something was added to it or it was added again. */
  flash: boolean;
  /** Marked for removal: one more Backspace in the box removes it. */
  selected?: boolean;
  onChange: (next: DestinationSelection) => void;
  onRemove: () => void;
  onOpenMap?: (cityId: string) => void;
}) {
  const panel = useAbsoluteModal<HTMLDivElement>();
  const pointerType = useRef<string>("mouse");

  const isAirport = destination.kind === "airport";
  const city = cityById(destination.cityId);
  const code = destination.airports[0];
  const label = isAirport ? code : (city?.name ?? destination.cityId);
  const noAirports = !isAirport && destination.airports.length === 0;

  const panelArgs = () => ({
    side: "bottom" as const,
    align: "start" as const,
    offset: 4,
    closeOnLeave: true,
    component: isAirport ? (
      <AirportPlacePanel cityId={destination.cityId} onOpenMap={onOpenMap} onClose={panel.close} />
    ) : (
      <CityAirportPanel
        live
        cityId={destination.cityId}
        initialSelection={destination.airports}
        onApply={(airports) => onChange({ ...destination, airports })}
        onOpenMap={(cityId) => {
          panel.close();
          onOpenMap?.(cityId);
        }}
        onClose={panel.close}
      />
    ),
  });

  // One border colour at a time: two in the class list would fight.
  const borderColor = flash
    ? colorSecondary.border
    : selected
      ? grayStrong.border
      : noAirports
        ? colorRed.border
        : "border-transparent";
  const tone = noAirports
    ? `bg-white ${colorRed.text}`
    : selected
      ? "bg-gray-300 text-gray-900"
      : `${grayMid.bg} ${grayMid.bgHover} text-gray-900`;

  return (
    <div
      {...panel.triggerProps}
      onPointerEnter={(event) => {
        pointerType.current = event.pointerType;
        if (event.pointerType !== "mouse") return;
        if (panel.isOpen) panel.cancelClose();
        else panel.open(panelArgs());
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") panel.closeSoon(CLOSE_DELAY_MS);
      }}
      title={
        isAirport
          ? (airportByCode(code)?.name ?? code)
          : noAirports
            ? "No airports selected"
            : destination.airports.join(", ")
      }
      className={`flex max-w-full shrink-0 items-center gap-1 py-1 pr-1 pl-3 transition-all duration-200 ${
        isAirport ? "rounded-full" : radius
      } border ${borderColor} ${tone} ${flash ? "scale-110" : ""}`}
    >
      <Button
        styleType="tertiary"
        onClick={() => {
          // With a mouse the panel follows hover; a tap toggles it.
          if (pointerType.current !== "mouse") panel.toggle(panelArgs());
        }}
        className="min-w-0 gap-1 bg-transparent! p-0! hover:bg-transparent!"
      >
        {isAirport && <Text icon="plane" size="very small" className="shrink-0 text-gray-500" />}
        <Text size="small" value={label} className="truncate" />
      </Button>
      <Button
        styleType="tertiary"
        onClick={() => {
          panel.close();
          onRemove();
        }}
        // `!` on the hover too: the plain `bg-transparent!` would otherwise win.
        className="h-6 w-6 shrink-0 rounded-full! bg-transparent! p-0! hover:bg-gray-400/30!"
      >
        <Text icon="close" size="small" className="text-gray-600" />
        <span className="sr-only">Remove {label}</span>
      </Button>
    </div>
  );
}
