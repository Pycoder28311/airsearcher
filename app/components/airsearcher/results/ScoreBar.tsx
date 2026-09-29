"use client";

import Text from "@/framework/ui/iconText/Text";
import { grayMid, radius } from "@/config/theme";
import type { Arrangement } from "@/lib/airsearcher/types";

interface Part {
  label: string;
  /** 0..1, or null when it could not be measured. */
  index: number | null;
  weight: number;
  how: string;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const points = (value: number) => (value * 100).toFixed(1);

/**
 * The score, with a bar for how close the price is to the cheapest listed, and
 * underneath how the score is made: each part's own score, its weight, and the
 * points it adds. Open state only.
 */
export default function ScoreBar({
  arrangement,
  cheapestPrice,
}: {
  arrangement: Arrangement;
  /** Cheapest total in the current result set, for the relative price bar. */
  cheapestPrice: number;
}) {
  const ratio = cheapestPrice > 0 ? cheapestPrice / arrangement.totals.totalPrice : 1;
  const { indices, breakdown } = arrangement;

  const parts: Part[] = breakdown
    ? [
        {
          label: "No stops",
          index: indices.stops,
          weight: breakdown.weights.stops,
          how: "Fewest stops among the listed results scores 100, the most 0. A stop inside a ticket and one between tickets count the same.",
        },
        {
          label: "Price",
          index: indices.price,
          weight: breakdown.weights.price,
          how: "The cheapest listed total scores 100, the dearest 0.",
        },
        {
          label: "Hours",
          index: indices.hour,
          weight: breakdown.weights.hour,
          how:
            indices.hour === null
              ? "No usable flight times, so price takes this weight."
              : "How well each group's take-off and landing times fit your hour preferences, weighted by passengers.",
        },
      ]
    : [];
  const sum =
    parts.reduce((total, part) => total + (part.index ?? 0) * part.weight, 0) +
    (breakdown?.bonus ?? 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-600"
            style={{ width: `${Math.max(4, Math.min(100, ratio * 100))}%` }}
          />
        </div>
        <Text
          size="very small"
          value={`Score ${Math.round(arrangement.score * 100)}/100`}
          className="shrink-0 tabular-nums text-gray-500"
        />
      </div>

      {breakdown && (
        <div className={`flex flex-col ${radius} border ${grayMid.border} px-3 py-2`}>
          <Text
            size="very small"
            value="How the score is made: each part's score × its weight, added up"
            className="pb-1 font-semibold text-gray-700"
          />

          <div className="grid grid-cols-[auto_auto_auto_auto_1fr] items-baseline gap-x-4 gap-y-1">
            {["Part", "Score", "Weight", "Points", ""].map((heading, i) => (
              <Text
                key={`h-${i}`}
                size="very small"
                value={heading}
                className={`text-gray-400 ${i > 0 && i < 4 ? "justify-self-end" : ""}`}
              />
            ))}

            {parts.map((part) => (
              <div key={part.label} className="contents">
                <Text size="very small" value={part.label} className="text-gray-900" />
                <Text
                  size="very small"
                  value={part.index === null ? "—" : Math.round(part.index * 100)}
                  className="justify-self-end tabular-nums text-gray-900"
                />
                <Text
                  size="very small"
                  value={`× ${pct(part.weight)}`}
                  className="justify-self-end tabular-nums text-gray-500"
                />
                <Text
                  size="very small"
                  value={`= ${points((part.index ?? 0) * part.weight)}`}
                  className="justify-self-end tabular-nums text-gray-900"
                />
                <Text size="very small" value={part.how} className="text-gray-400" />
              </div>
            ))}

            {breakdown.bonus > 0 && (
              <div className="contents">
                <Text size="very small" value="Priority date" className="text-gray-900" />
                <span />
                <span />
                <Text
                  size="very small"
                  value={`+ ${points(breakdown.bonus)}`}
                  className="justify-self-end tabular-nums text-gray-900"
                />
                <Text
                  size="very small"
                  value="A small bonus for a departure date you marked as preferred."
                  className="text-gray-400"
                />
              </div>
            )}

            <div className={`col-span-5 border-t ${grayMid.border}`} />
            <div className="contents">
              <Text size="very small" value="Total" className="font-semibold text-gray-900" />
              <span />
              <span />
              <Text
                size="very small"
                value={`= ${points(sum)}`}
                className="justify-self-end font-semibold tabular-nums text-gray-900"
              />
              <Text
                size="very small"
                value={
                  sum > 1
                    ? `Capped at 100 → score ${Math.round(arrangement.score * 100)}`
                    : `Rounded → score ${Math.round(arrangement.score * 100)}`
                }
                className="text-gray-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
