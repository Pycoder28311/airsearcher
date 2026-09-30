"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import type { LengthOption } from "@/lib/airsearcher/tripLength";

export interface TripLengthProps {
  /** 1 to 15 nights, each with the departure days the saved flights answer. */
  options: LengthOption[];
  /** The fixed lengths the search was run for; empty for an open length. */
  searched: number[];
  /** "7 nights", "4–8 nights". */
  searchedLabel: string;
  /** The lengths chosen here, or null for the search's own. */
  value: number[] | null;
  building: boolean;
  /** Departure days the search covered. */
  totalDays: number;
  /** Adds or removes one length. */
  onToggle: (nights: number) => void;
  /** Back to the search's own lengths. */
  onReset: () => void;
  /** A length the saved flights can't answer on any day. */
  onNoData: (nights: number) => void;
  /** Search the days the chosen lengths lack. */
  onSearchMissing: (nights: number[]) => void;
}

/** How much of a length the saved flights answer. */
function coverageOf(option: LengthOption, totalDays: number): "full" | "partial" | "none" {
  if (option.departures.length === 0) return "none";
  return option.departures.length >= totalDays ? "full" : "partial";
}

const COVERAGE_CLASS = {
  full: "",
  // A dot in the corner: some departure days lack their return.
  partial: "relative after:absolute after:top-0.5 after:right-0.5 after:h-1.5 after:w-1.5 after:rounded-full after:bg-orange-400",
  // No saved flights: muted, dashed, and it asks for a search when clicked.
  none: "border border-dashed border-gray-300 text-gray-400!",
} as const;

/**
 * Trip lengths for a finished search, 1 to 15 nights, several at once. A
 * length is rebuilt from the flights already gathered, so it covers only the
 * departure days whose return day was searched too: every day, some (a dot),
 * or none (dashed), which asks for the missing dates to be searched.
 */
export default function TripLengthGroup({
  options,
  searched,
  searchedLabel,
  value,
  building,
  totalDays,
  onToggle,
  onReset,
  onNoData,
  onSearchMissing,
}: TripLengthProps) {
  const selected = value ?? searched;
  const chosen = options.filter((option) => value?.includes(option.nights));
  const partial = chosen.filter((option) => coverageOf(option, totalDays) === "partial");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {/* An open-length search has no single length to go back to. */}
        {searched.length === 0 && (
          <Button styleType={value === null ? "secondary" : "tertiary"} onClick={onReset} className="px-2! py-1!">
            <Text size="very small" value={`All ${searchedLabel}`} />
          </Button>
        )}
        {options.map((option) => {
          const coverage = coverageOf(option, totalDays);
          const on = selected.includes(option.nights);
          return (
            <Button
              key={option.nights}
              styleType={on ? "secondary" : "tertiary"}
              onClick={() => (coverage === "none" && !on ? onNoData(option.nights) : onToggle(option.nights))}
              className={`min-w-8 px-2! py-1! ${COVERAGE_CLASS[coverage]}`}
            >
              <Text size="very small" value={`${option.nights}`} className="tabular-nums" />
            </Button>
          );
        })}
      </div>

      <Text
        size="very small"
        value={
          building
            ? "Building the results from the flights already found…"
            : value === null
              ? `As searched: ${searchedLabel}. Pick more lengths to see them together; a dot means some days lack their return, dashed means none were searched.`
              : `${chosen.map((option) => option.nights).join(", ")} night${
                  chosen.length === 1 && chosen[0]?.nights === 1 ? "" : "s"
                } selected${
                  partial.length > 0
                    ? ` · ${partial
                        .map((option) => `${option.nights}: ${option.departures.length} of ${totalDays} days`)
                        .join(", ")}`
                    : ""
                }.`
        }
        className="text-gray-500"
      />

      {!building && partial.length > 0 && (
        <Button
          styleType="underline"
          onClick={() => onSearchMissing(partial.map((option) => option.nights))}
          className="self-start"
        >
          <Text size="very small" value="Search the missing days" />
        </Button>
      )}
    </div>
  );
}
