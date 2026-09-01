"use client";

import { useEffect } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import { colorMain, grayLight } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import type { ArrangementSortMode } from "@/lib/airsearcher/grouping";
import Panel from "../common/Panel";

const OPTIONS: { value: ArrangementSortMode; label: string }[] = [
  { value: "score", label: "Best match" },
  { value: "price", label: "Cheapest first" },
  { value: "duration", label: "Shortest travel" },
  { value: "departure", label: "Earliest departure" },
];

const POSITION = { side: "bottom", align: "end", offset: 6 } as const;

/**
 * "Sorted by", as a dropdown rather than the reference project's row of
 * buttons.
 *
 * "Cheapest first" carries the actual cheapest total beside it, computed from
 * the currently filtered set — so it never advertises a price the filters have
 * already removed.
 */
export default function SortByDropdown({
  value,
  onChange,
  cheapestPrice,
}: {
  value: ArrangementSortMode;
  onChange: (next: ArrangementSortMode) => void;
  /** Cheapest total among the results that survive the current filters. */
  cheapestPrice: number | null;
}) {
  const modal = useAbsoluteModal<HTMLButtonElement>();
  const current = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0];

  const panel = (
    <Panel className="min-w-56 p-1">
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            styleType="tertiary"
            onClick={() => {
              onChange(option.value);
              modal.close();
            }}
            className={`w-full justify-between! gap-4 bg-transparent! ${grayLight.bgHover}`}
          >
            <Text
              size="small"
              value={option.label}
              className={selected ? colorMain.text : "text-gray-800"}
            />
            {option.value === "price" && cheapestPrice !== null && (
              <Text
                size="very small"
                value={`${cheapestPrice} ${CURRENCY}`}
                className="tabular-nums text-gray-500"
              />
            )}
          </Button>
        );
      })}
    </Panel>
  );

  // AbsoluteModal snapshots its content, so keep the open panel in step with
  // the tick and the live cheapest price.
  useEffect(() => {
    if (modal.isOpen) modal.open({ component: panel, ...POSITION });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, cheapestPrice]);

  return (
    <Button
      {...modal.triggerProps}
      styleType="tertiary"
      onClick={() => modal.toggle({ component: panel, ...POSITION })}
      className="gap-2"
    >
      <Text size="very small" value="Sorted by" className="text-gray-500" />
      <Text size="small" value={current.label} className="font-medium text-gray-900" />
      <Text
        icon={modal.isOpen ? "chevron-up" : "chevron-down"}
        size="small"
        className="text-gray-400"
      />
    </Button>
  );
}
