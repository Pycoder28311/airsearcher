"use client";

import { useEffect } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import type { AirportCode, OriginGroup } from "@/lib/airsearcher/types";
import Panel from "../common/Panel";
import DepartureAirportEditor from "./DepartureAirportEditor";

const POSITION = { side: "bottom", align: "start", offset: 6 } as const;

/**
 * The departure control.
 *
 * Deliberately NOT a standard flight-app origin input: the group leaves from
 * several airports at once, so this is a dropdown button summarising the whole
 * departure picture and opening the editor.
 */
export default function DepartureDropdown({
  origins,
  onChange,
  gatheringAirport,
  onGatheringChange,
}: {
  origins: OriginGroup[];
  onChange: (next: OriginGroup[]) => void;
  gatheringAirport: AirportCode;
  onGatheringChange: (next: AirportCode) => void;
}) {
  const modal = useAbsoluteModal<HTMLButtonElement>();

  const active = origins.filter((o) => o.passengers > 0);
  const passengers = active.reduce((sum, o) => sum + o.passengers, 0);
  const summary =
    active.length === 0
      ? "Add departure airports"
      : `${active.map((o) => o.airport).join(", ")} · ${passengers} passenger${
          passengers === 1 ? "" : "s"
        }`;

  const panel = (
    <Panel>
      <DepartureAirportEditor
        origins={origins}
        onChange={onChange}
        gatheringAirport={gatheringAirport}
        onGatheringChange={onGatheringChange}
      />
    </Panel>
  );

  // AbsoluteModal snapshots its content, so while the dropdown is open we
  // re-push a fresh panel whenever the airports change and keep it in sync.
  useEffect(() => {
    if (modal.isOpen) modal.open({ component: panel, ...POSITION });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origins, gatheringAirport]);

  return (
    <Button
      {...modal.triggerProps}
      styleType="tertiary"
      onClick={() => modal.toggle({ component: panel, ...POSITION })}
      className="h-14 w-full justify-between! gap-3"
    >
      <span className="flex min-w-0 flex-col items-start">
        <Text size="very small" value="Departing from" className="text-gray-500" />
        <Text size="small" value={summary} className="truncate font-medium text-gray-900" />
      </span>
      <Text
        icon={modal.isOpen ? "chevron-up" : "chevron-down"}
        size="small"
        className="shrink-0 text-gray-400"
      />
    </Button>
  );
}
