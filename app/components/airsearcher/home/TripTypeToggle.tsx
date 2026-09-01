"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { TRIP_TYPE_OPTIONS } from "@/lib/airsearcher/config/filters";
import type { TripType } from "@/lib/airsearcher/types";

/**
 * Round trip or one way. This is also the "include return flights or one-way
 * only" switch the brief asks for — they are the same decision, so there is one
 * control rather than two that can disagree.
 *
 * Multi-city is deliberately absent.
 */
export default function TripTypeToggle({
  value,
  onChange,
}: {
  value: TripType;
  onChange: (next: TripType) => void;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Trip type">
      {TRIP_TYPE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          styleType={value === option.value ? "secondary" : "tertiary"}
          onClick={() => onChange(option.value)}
        >
          <Text size="small" value={option.label} />
        </Button>
      ))}
    </div>
  );
}
