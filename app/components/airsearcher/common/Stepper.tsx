"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";

/** A minus/value/plus counter, used for passenger counts and trip length. */
export default function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className="flex items-center gap-2">
      <Button
        styleType="tertiary"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="h-8 w-8 p-0!"
      >
        <span aria-hidden>−</span>
        <span className="sr-only">{label ? `One fewer ${label}` : "Decrease"}</span>
      </Button>

      <Text
        size="small"
        value={value}
        className="w-8 justify-center font-medium tabular-nums text-gray-900"
      />

      <Button
        styleType="tertiary"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="h-8 w-8 p-0!"
      >
        <span aria-hidden>+</span>
        <span className="sr-only">{label ? `One more ${label}` : "Increase"}</span>
      </Button>
    </div>
  );
}
