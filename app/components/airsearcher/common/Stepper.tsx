"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Input from "@/framework/ui/input/Input";

/** The − and + buttons: no background, a see-through one on hover. */
const STEP_BUTTON = "h-7 w-7 rounded-full! bg-transparent! p-0! text-gray-700 hover:bg-gray-400/30!";

/**
 * A minus/number/plus counter, used for passenger counts and trip length.
 * The number can also be typed; what's typed is clamped to min–max.
 */
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
  // What's being typed, kept while the field is edited so it can be empty for
  // a moment; the value itself only ever holds a whole number in range.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex w-fit items-center gap-0.5">
      <Button
        styleType="tertiary"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={STEP_BUTTON}
      >
        <span aria-hidden>−</span>
        <span className="sr-only">{label ? `One fewer ${label}` : "Decrease"}</span>
      </Button>

      <Input
        type="number"
        styleType="ghost"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft ?? String(value)}
        aria-label={label ? `Number of ${label}s` : "Value"}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const next = Number.parseInt(text, 10);
          if (Number.isFinite(next)) onChange(clamp(next));
        }}
        onBlur={() => setDraft(null)}
        onFocus={(event) => event.target.select()}
        // `!`: the field's own style is full width.
        className="w-11! px-1! py-1! text-center font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <Button
        styleType="tertiary"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={STEP_BUTTON}
      >
        <span aria-hidden>+</span>
        <span className="sr-only">{label ? `One more ${label}` : "Increase"}</span>
      </Button>
    </div>
  );
}
