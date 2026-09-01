"use client";

import { useEffect } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAbsoluteModal } from "@/framework/ui/context/AppContext";
import { colorSecondary, grayLight } from "@/config/theme";
import {
  FILTER_SCOPE_OPTIONS,
  type FilterScope,
} from "@/lib/airsearcher/config/filters";
import Panel from "../common/Panel";

const POSITION = { side: "bottom", align: "end", offset: 4 } as const;

/**
 * Which flight a filter applies to: both, the going one, or the returning one.
 *
 * Rendered into a filter group's top-right slot, and only on a round trip — on
 * a one-way search there is only one flight, so the choice would be noise.
 */
export default function ScopeDropdown({
  value,
  onChange,
}: {
  value: FilterScope;
  onChange: (next: FilterScope) => void;
}) {
  const modal = useAbsoluteModal<HTMLButtonElement>();
  const current = FILTER_SCOPE_OPTIONS.find((o) => o.value === value) ?? FILTER_SCOPE_OPTIONS[0];

  const panel = (
    <Panel className="min-w-36 p-1">
      {FILTER_SCOPE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          styleType="tertiary"
          onClick={() => {
            onChange(option.value);
            modal.close();
          }}
          className={`w-full justify-start! bg-transparent! ${grayLight.bgHover}`}
        >
          <Text
            size="very small"
            value={option.label}
            className={option.value === value ? colorSecondary.text : "text-gray-800"}
          />
        </Button>
      ))}
    </Panel>
  );

  useEffect(() => {
    if (modal.isOpen) modal.open({ component: panel, ...POSITION });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Button
      {...modal.triggerProps}
      styleType="tertiary"
      onClick={(() => modal.toggle({ component: panel, ...POSITION })) as () => void}
      className="gap-1 px-2! py-1!"
    >
      <Text
        size="very small"
        value={current.label}
        className={value === "both" ? "text-gray-500" : colorSecondary.text}
      />
      <Text icon="chevron-down" size="very small" className="text-gray-400" />
    </Button>
  );
}
