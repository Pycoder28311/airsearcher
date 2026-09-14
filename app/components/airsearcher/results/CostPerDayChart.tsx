"use client";

import { useState } from "react";
import Text from "@/framework/ui/iconText/Text";
import { border, colorMain, grayMid, radiusBig } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { formatDate } from "@/lib/airsearcher/time";
import type { Arrangement } from "@/lib/airsearcher/types";

interface Day {
  date: string;
  /** Cheapest group total leaving that day; null when nothing does. */
  cheapest: number | null;
  count: number;
}

/**
 * Cheapest group total per departure day across a date range — one bar per
 * candidate date, from a zero baseline, so days compare by length.
 *
 * Built from the arrangements currently shown, so it follows the filters. Only
 * the cheapest day carries a direct label; every bar has a hover tooltip, and a
 * visually hidden table carries the same numbers for screen readers.
 */
export default function CostPerDayChart({
  dates,
  arrangements,
}: {
  dates: string[];
  arrangements: Arrangement[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const days: Day[] = dates.map((date) => {
    const onDay = arrangements.filter((a) => a.departureDate === date);
    return {
      date,
      cheapest: onDay.length > 0 ? Math.min(...onDay.map((a) => a.totals.totalPrice)) : null,
      count: onDay.length,
    };
  });

  const prices = days.map((d) => d.cheapest).filter((p): p is number => p !== null);
  if (days.length === 0) return null;

  const max = prices.length > 0 ? Math.max(...prices) : 0;
  const best = prices.length > 0 ? Math.min(...prices) : null;
  const bestIndex = days.findIndex((d) => d.cheapest === best);
  // Axis labels only at the ends and the middle — enough to place any bar.
  const ticks = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  const shown = hovered !== null ? days[hovered] : null;

  return (
    <section className={`flex flex-col gap-3 bg-white ${border} ${radiusBig} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text
          size="small"
          value="Cheapest group total per departure day"
          className="font-semibold text-gray-900"
        />
        <Text
          size="very small"
          value={
            best === null
              ? "No day has results with the current filters"
              : `Lowest ${best} ${CURRENCY} on ${formatDate(days[bestIndex].date)}`
          }
          className="text-gray-500"
        />
      </div>

      <div className="relative">
        {/* Tooltip for the hovered day, pinned above the plot. */}
        <div className="flex h-6 items-center">
          {shown && (
            <Text
              size="very small"
              value={`${formatDate(shown.date)} · ${
                shown.cheapest === null
                  ? "no results"
                  : `from ${shown.cheapest} ${CURRENCY} · ${shown.count} result${shown.count === 1 ? "" : "s"}`
              }`}
              className="tabular-nums text-gray-700"
            />
          )}
        </div>

        <div
          role="img"
          aria-label={`Cheapest group total for each of ${days.length} departure days`}
          className={`flex h-40 items-end gap-0.5 border-b ${grayMid.border}`}
          onMouseLeave={() => setHovered(null)}
        >
          {days.map((day, index) => {
            const height = day.cheapest === null || max === 0 ? 0 : (day.cheapest / max) * 100;
            return (
              // The whole column is the hit target, not just the bar.
              <div
                key={day.date}
                className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setHovered(index)}
              >
                {index === bestIndex && best !== null && (
                  <Text
                    size="very small"
                    value={`${best}`}
                    className="mb-0.5 whitespace-nowrap tabular-nums text-gray-900"
                  />
                )}
                {day.cheapest === null ? (
                  <div className={`h-1 w-full rounded-t ${grayMid.bg}`} />
                ) : (
                  <div
                    className={`w-full rounded-t ${colorMain.bg} ${
                      hovered === index ? "opacity-100" : hovered === null ? "opacity-90" : "opacity-60"
                    }`}
                    style={{ height: `${Math.max(2, height)}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="relative mt-1 h-4">
          {ticks.map((index) => (
            <Text
              key={days[index].date}
              size="very small"
              value={formatDate(days[index].date)}
              className={`absolute whitespace-nowrap text-gray-400 ${
                index === 0
                  ? "left-0"
                  : index === days.length - 1
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2"
              }`}
            />
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>Cheapest group total per departure day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Cheapest ({CURRENCY})</th>
            <th>Results</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{day.cheapest ?? "none"}</td>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
