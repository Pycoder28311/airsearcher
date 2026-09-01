"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { WEIGHT_LEVELS, type WeightLevel } from "@/lib/airsearcher/config/ranking";

/**
 * The five-level weight scale: None · A little · Mid · Much · Completely.
 *
 * The chosen level maps to the same 0..100 number the ported `normalizeWeights`
 * already consumes, so only the input changed — never the arithmetic.
 */
export default function WeightSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WeightLevel;
  onChange: (next: WeightLevel) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Text size="very small" value={label} className="text-gray-600" />
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {WEIGHT_LEVELS.map((level) => (
          <Button
            key={level}
            styleType={level === value ? "secondary" : "tertiary"}
            onClick={() => onChange(level)}
            className="px-2! py-1!"
          >
            <Text size="very small" value={level} />
          </Button>
        ))}
      </div>
    </div>
  );
}
