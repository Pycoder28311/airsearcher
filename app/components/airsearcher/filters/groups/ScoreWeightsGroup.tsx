"use client";

import Input from "@/framework/ui/input/Input";
import Text from "@/framework/ui/iconText/Text";
import type { FilterState } from "@/lib/airsearcher/config/filters";
import { rebalanceWeights, type RankingWeights } from "@/lib/airsearcher/config/ranking";

const SLIDERS: { key: keyof RankingWeights; label: string }[] = [
  { key: "stops", label: "Few stops" },
  { key: "price", label: "Cheap price" },
  { key: "hour", label: "Convenient hours" },
];

/**
 * How much stops, price and hours count in a result's score, as three linked
 * sliders: moving one shares what is left between the other two in the
 * proportion they had, so the three always add up to 100 %.
 */
export default function ScoreWeightsGroup({
  filters,
  onChange,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const { weights } = filters;

  return (
    <div className="flex flex-col gap-3">
      {SLIDERS.map(({ key, label }) => (
        <label key={key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <Text size="very small" value={label} className="text-gray-600" />
            <Text size="very small" value={`${weights[key]} %`} className="tabular-nums text-gray-900" />
          </div>
          <Input
            type="range"
            min={0}
            max={100}
            step={1}
            value={weights[key]}
            onChange={(event) =>
              onChange({
                ...filters,
                weights: rebalanceWeights(weights, key, Number(event.target.value)),
              })
            }
          />
        </label>
      ))}
    </div>
  );
}
