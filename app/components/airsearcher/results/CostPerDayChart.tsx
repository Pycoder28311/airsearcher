"use client";

import { useState } from "react";
import Text from "@/framework/ui/iconText/Text";
import { border, colorMain, grayMid, radiusBig } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { formatPriceRange, groupPriceRange, type PriceRange } from "@/lib/airsearcher/grouping";
import { formatDate } from "@/lib/airsearcher/time";
import type { Arrangement } from "@/lib/airsearcher/types";

interface Day {
  date: string;
  /** Cheapest group total leaving that day; null when nothing does. Picks the day's cheapest result. */
  cheapest: number | null;
  /** That result's cheapest–priciest group per passenger — what the bar shows. */
  range: PriceRange | null;
  count: number;
}

/**
 * The cheapest result per departure day across a date range, one bar per
 * candidate date. Each bar spans what that result's cheapest group and its
 * priciest group pay per passenger, both directions and stops included, on a
 * shared scale from zero.
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
    const cheapestResult = onDay.reduce<Arrangement | null>(
      (best, a) => (!best || a.totals.totalPrice < best.totals.totalPrice ? a : best),
      null,
    );
    return {
      date,
      cheapest: cheapestResult?.totals.totalPrice ?? null,
      range: cheapestResult ? groupPriceRange(cheapestResult) : null,
      count: onDay.length,
    };
  });

  const prices = days.map((d) => d.cheapest).filter((p): p is number => p !== null);
  if (days.length === 0) return null;

  const max = Math.max(0, ...days.map((d) => d.range?.max ?? 0));
  const best = prices.length > 0 ? Math.min(...prices) : null;
  const bestIndex = days.findIndex((d) => d.cheapest === best);
  const bestRange = bestIndex >= 0 ? days[bestIndex].range : null;
  // Axis labels only at the ends and the middle — enough to place any bar.
  const ticks = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  const shown = hovered !== null ? days[hovered] : null;

  return (
    <section className={`flex flex-col gap-3 bg-white ${border} ${radiusBig} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text
          size="small"
          value="Cheapest result per departure day: cheapest–priciest group per passenger"
          className="font-semibold text-gray-900"
        />
        <Text
          size="very small"
          value={
            best === null
              ? "No day has results with the current filters"
              : `Cheapest ${bestRange ? formatPriceRange(bestRange, CURRENCY) : "—"} on ${formatDate(days[bestIndex].date)}`
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
                  : `cheapest result ${shown.range ? formatPriceRange(shown.range, CURRENCY) : "—"} per passenger · ${shown.count} result${shown.count === 1 ? "" : "s"}`
              }`}
              className="tabular-nums text-gray-700"
            />
          )}
        </div>

        {/* A price scale, so the floating bars read as from–to prices. */}
        <div className="flex gap-2">
          <div className="flex h-40 w-10 shrink-0 flex-col justify-between text-right">
            <Text size="very small" value={`${max}`} className="tabular-nums text-gray-400" />
            <Text size="very small" value={`${Math.round(max / 2)}`} className="tabular-nums text-gray-400" />
            <Text size="very small" value="0" className="tabular-nums text-gray-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div
              role="img"
              aria-label={`Cheapest result's group price range for each of ${days.length} departure days`}
              className={`flex h-40 items-end gap-0.5 border-b ${grayMid.border}`}
              onMouseLeave={() => setHovered(null)}
            >
              {days.map((day, index) => {
                const bottom = !day.range || max === 0 ? 0 : (day.range.min / max) * 100;
                const top = !day.range || max === 0 ? 0 : (day.range.max / max) * 100;
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
                        value={bestRange ? formatPriceRange(bestRange) : ""}
                        className="mb-0.5 whitespace-nowrap tabular-nums text-gray-900"
                      />
                    )}
                    {day.range === null ? (
                      <div className={`h-1 w-full rounded-t ${grayMid.bg}`} />
                    ) : (
                      // A floating bar from the cheapest group's price up to the priciest's.
                      <div className="relative w-full" style={{ height: `${top}%` }}>
                        <div
                          className={`absolute inset-x-0 top-0 rounded ${colorMain.bg} ${
                            hovered === index ? "opacity-100" : hovered === null ? "opacity-90" : "opacity-60"
                          }`}
                          style={{ height: `${Math.max(2, top > 0 ? ((top - bottom) / top) * 100 : 0)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative mt-1 ml-12 h-4">
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
        <caption>Cheapest result per departure day: cheapest and priciest group per passenger</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Cheapest group ({CURRENCY})</th>
            <th>Priciest group ({CURRENCY})</th>
            <th>Results</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{day.range?.min ?? "none"}</td>
              <td>{day.range?.max ?? "none"}</td>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
