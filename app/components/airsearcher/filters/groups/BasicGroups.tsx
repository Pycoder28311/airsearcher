"use client";

import Button from "@/framework/ui/buttons/Button";
import Input from "@/framework/ui/input/Input";
import Text from "@/framework/ui/iconText/Text";
import { colorMain } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import {
  STOP_OPTIONS,
  TRAVEL_CLASS_OPTIONS,
  TRIP_TYPE_OPTIONS,
  type FilterState,
  type StopOption,
  type TravelClass,
} from "@/lib/airsearcher/config/filters";
import { formatDuration } from "@/lib/airsearcher/time";
import DualRange from "../DualRange";
import PriceHistogram from "../PriceHistogram";
import WeightSelector from "../../common/WeightSelector";

export interface GroupProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  counts: Record<string, number>;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item];
}

/** Round trip or one way. Multi-city is deliberately gone. */
export function TripTypeGroup({ filters, onChange }: GroupProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {TRIP_TYPE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          styleType={filters.type === option.value ? "secondary" : "tertiary"}
          onClick={() =>
            onChange({
              ...filters,
              type: option.value,
              // A one-way search has no return flight to scope a filter onto.
              scopes:
                option.value === "one-way"
                  ? Object.fromEntries(
                      Object.keys(filters.scopes).map((key) => [key, "both"]),
                    ) as FilterState["scopes"]
                  : filters.scopes,
            })
          }
        >
          <Text size="small" value={option.label} />
        </Button>
      ))}
    </div>
  );
}

export function StopsGroup({ filters, onChange, counts }: GroupProps) {
  return (
    <div className="flex flex-col gap-1">
      {STOP_OPTIONS.map((option) => {
        const checked = filters.stops.includes(option.value);
        return (
          <label key={option.value} className="flex cursor-pointer items-center gap-2">
            <Input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange({ ...filters, stops: toggle<StopOption>(filters.stops, option.value) })
              }
            />
            <Text
              size="small"
              value={option.label}
              className={checked ? colorMain.text : "text-gray-800"}
            />
            <Text
              size="very small"
              value={counts[`stops:${option.value}`] ?? 0}
              className="ml-auto tabular-nums text-gray-400"
            />
          </label>
        );
      })}
    </div>
  );
}

export function PriceGroup({
  filters,
  onChange,
  prices,
}: GroupProps & { prices: number[] }) {
  const min = prices.length > 0 ? Math.floor(Math.min(...prices)) : 0;
  const max = prices.length > 0 ? Math.ceil(Math.max(...prices)) : 1000;
  const range = filters.priceRange ?? [min, max];

  return (
    <div className="flex flex-col gap-3">
      <PriceHistogram prices={prices} range={filters.priceRange} />

      <DualRange
        min={min}
        max={max}
        step={Math.max(1, Math.round((max - min) / 100))}
        value={[Math.max(min, range[0]), Math.min(max, range[1])]}
        onChange={(next) => onChange({ ...filters, priceRange: next })}
        formatValue={(v) => `${v} ${CURRENCY}`}
        ariaLabel="Total group price"
      />

      {filters.priceRange !== null && (
        <Button
          styleType="underline"
          onClick={() => onChange({ ...filters, priceRange: null })}
        >
          <Text size="very small" value="Clear price range" />
        </Button>
      )}

      <WeightSelector
        label="How much does a cheap total matter?"
        value={filters.priceWeight}
        onChange={(priceWeight) => onChange({ ...filters, priceWeight })}
      />
    </div>
  );
}

export function AirlinesGroup({
  filters,
  onChange,
  counts,
  airlines,
}: GroupProps & { airlines: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {(["include", "exclude"] as const).map((mode) => (
          <Button
            key={mode}
            styleType={filters.airlineMode === mode ? "secondary" : "tertiary"}
            onClick={() => onChange({ ...filters, airlineMode: mode })}
            className="px-2! py-1!"
          >
            <Text size="very small" value={mode === "include" ? "Only these" : "Not these"} />
          </Button>
        ))}
      </div>

      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {airlines.length === 0 ? (
          <Text
            size="very small"
            value="No airlines in these results"
            className="text-gray-400 italic"
          />
        ) : (
          airlines.map((name) => {
            const checked = filters.airlines.includes(name);
            return (
              <label key={name} className="flex cursor-pointer items-center gap-2">
                <Input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({ ...filters, airlines: toggle(filters.airlines, name) })
                  }
                />
                <Text
                  size="small"
                  value={name}
                  className={`truncate ${checked ? colorMain.text : "text-gray-800"}`}
                />
                <Text
                  size="very small"
                  value={counts[`airline:${name}`] ?? 0}
                  className="ml-auto shrink-0 tabular-nums text-gray-400"
                />
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

export function DurationGroup({ filters, onChange }: GroupProps) {
  const layover = filters.layoverRange ?? [0, 600];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Text size="very small" value="Longest acceptable flight" className="text-gray-600" />
        <DualRange
          min={60}
          max={1440}
          step={15}
          value={[60, filters.maxDurationMinutes ?? 1440]}
          onChange={(next) =>
            onChange({ ...filters, maxDurationMinutes: next[1] >= 1440 ? null : next[1] })
          }
          formatValue={formatDuration}
          ariaLabel="Maximum flight duration"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Text size="very small" value="Layover length" className="text-gray-600" />
        <DualRange
          min={0}
          max={600}
          step={15}
          value={layover}
          onChange={(next) => onChange({ ...filters, layoverRange: next })}
          formatValue={formatDuration}
          ariaLabel="Layover duration"
        />
        {filters.layoverRange !== null && (
          <Button
            styleType="underline"
            onClick={() => onChange({ ...filters, layoverRange: null })}
          >
            <Text size="very small" value="Clear layover range" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function CabinGroup({ filters, onChange, counts }: GroupProps) {
  return (
    <div className="flex flex-col gap-1">
      {TRAVEL_CLASS_OPTIONS.map((option) => (
        <label key={option.value} className="flex cursor-pointer items-center gap-2">
          <Input
            type="radio"
            name="travel-class"
            checked={filters.travelClass === option.value}
            onChange={() =>
              onChange({ ...filters, travelClass: option.value as TravelClass })
            }
          />
          <Text
            size="small"
            value={option.label}
            className={filters.travelClass === option.value ? colorMain.text : "text-gray-800"}
          />
          <Text
            size="very small"
            value={counts[`class:${option.value}`] ?? 0}
            className="ml-auto tabular-nums text-gray-400"
          />
        </label>
      ))}
    </div>
  );
}

export function EmissionsGroup({ filters, onChange, counts }: GroupProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <Input
        type="checkbox"
        checked={filters.lessEmissionsOnly}
        onChange={() =>
          onChange({ ...filters, lessEmissionsOnly: !filters.lessEmissionsOnly })
        }
      />
      <Text
        size="small"
        value="Less emissions than typical"
        className={filters.lessEmissionsOnly ? colorMain.text : "text-gray-800"}
      />
      <Text
        size="very small"
        value={counts["emissions:less"] ?? 0}
        className="ml-auto tabular-nums text-gray-400"
      />
    </label>
  );
}
