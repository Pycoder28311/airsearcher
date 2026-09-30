"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { cityName } from "@/data/places";

/**
 * "All · Venice · Florence": one destination city of a multi-city search, or
 * all of them. Null means all.
 */
export default function CityChoice({
  cities,
  value,
  onChange,
  size = "small",
}: {
  /** City ids, in the order the search named them. */
  cities: string[];
  value: string | null;
  onChange: (city: string | null) => void;
  size?: "small" | "very small";
}) {
  const options: { id: string | null; label: string }[] = [
    { id: null, label: "All" },
    ...cities.map((id) => ({ id, label: cityName(id) })),
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <Button
          key={option.id ?? "all"}
          styleType={value === option.id ? "secondary" : "tertiary"}
          onClick={() => onChange(option.id)}
          className={size === "very small" ? "px-2! py-1!" : ""}
        >
          <Text size={size} value={option.label} />
        </Button>
      ))}
    </div>
  );
}
