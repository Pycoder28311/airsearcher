"use client";

import Button from "@/framework/ui/buttons/Button";
import Input from "@/framework/ui/input/Input";
import Text from "@/framework/ui/iconText/Text";
import { colorMain, grayLight, grayMid, radius } from "@/config/theme";

export interface MultiSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  /** How many results carry this value, when the caller knows. */
  count?: number;
}

/**
 * A checkbox list with a Select all / Clear header.
 *
 * Used by the destination city's airport panel and by the sidebar's Avoid
 * airports filter, so the two behave identically.
 */
export default function MultiSelectList({
  options,
  selected,
  onChange,
  emptyMessage = "Nothing to choose from",
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyMessage?: string;
}) {
  const allSelected = options.length > 0 && options.every((o) => selected.includes(o.value));

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  if (options.length === 0) {
    return <Text size="small" value={emptyMessage} className="text-gray-400 italic" />;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center justify-between border-b ${grayMid.border} pb-1.5`}>
        <Text
          size="very small"
          value={`${selected.length} of ${options.length} selected`}
          className="text-gray-500"
        />
        <Button
          styleType="underline"
          onClick={() => onChange(allSelected ? [] : options.map((o) => o.value))}
        >
          <Text size="very small" value={allSelected ? "Clear all" : "Select all"} />
        </Button>
      </div>

      <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2.5 ${radius} px-2 py-1.5 ${
                checked ? grayLight.bg : ""
              } ${grayLight.bgHover}`}
            >
              <Input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(option.value)}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <Text
                  size="small"
                  value={option.label}
                  className={`truncate ${checked ? colorMain.text : "text-gray-800"}`}
                />
                {option.sublabel && (
                  <Text
                    size="very small"
                    value={option.sublabel}
                    className="truncate text-gray-400"
                  />
                )}
              </span>
              {option.count !== undefined && (
                <Text
                  size="very small"
                  value={option.count}
                  className="shrink-0 tabular-nums text-gray-400"
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
