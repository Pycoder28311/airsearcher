"use client";

import { useState } from "react";
import Text from "@/framework/ui/iconText/Text";
import { border, colorMain, grayMid, radiusBig } from "@/config/theme";
import { groupPriceRange, type PriceRange } from "@/lib/airsearcher/grouping";
import { parseIsoDate } from "@/lib/airsearcher/time";
import type { Arrangement } from "@/lib/airsearcher/types";

interface Day {
  date: string;
  /** Cheapest group total leaving that day; null when nothing does. Picks the day's cheapest result. */
  cheapest: number | null;
  /** That result's average price per person — the line. */
  average: number | null;
  /** That result's cheapest–priciest group per passenger — the band. */
  range: PriceRange | null;
  count: number;
}

/*
 * Drawn in the app's main blue (colorMain): a line for the average price per
 * person, and a pale band from what the cheapest person pays to the priciest.
 */
const LINE = "stroke-blue-500";
const BAND = "fill-blue-500/15";
const BAND_SWATCH = "bg-blue-500/15";
const DOT = "bg-blue-500";
const LABEL = colorMain.text;

/** Plot height in pixels; the axes are laid out around it. */
const PLOT_HEIGHT_PX = 176;

/** "Thu 22 Oct" */
function dayLabel(iso: string): string {
  const date = parseIsoDate(iso);
  return date
    ? date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : iso;
}

/** "22 Oct" */
function shortDate(iso: string): string {
  const date = parseIsoDate(iso);
  return date ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : iso;
}

const euros = (value: number) => `${Math.round(value)} €`;

/** A round price scale around the data: about four steps of 10, 20, 25, 50… euros. */
function scaleOf(low: number, high: number): { low: number; high: number; ticks: number[] } {
  const span = Math.max(high - low, 1);
  const step = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => span / s <= 4) ?? 1000;
  const from = Math.floor(low / step) * step;
  const to = Math.max(Math.ceil(high / step) * step, from + step);
  const ticks: number[] = [];
  for (let tick = from; tick <= to; tick += step) ticks.push(tick);
  return { low: from, high: to, ticks };
}

/**
 * The cheapest trip for each departure day across a date range, as a price
 * line. For each day it takes the cheapest result leaving then and shows what
 * its travellers pay: the line and its dots follow the average per person —
 * the group's total shared out, so the lowest dot is the cheapest day — and
 * the pale band spans the cheapest group to the priciest. Days with no result
 * leave a gap. The cheapest day is marked, hovering a day reads its
 * prices out above the plot, and a visually hidden table carries the same
 * numbers for screen readers.
 *
 * Built from the arrangements currently shown, so it follows the filters.
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
      average: cheapestResult?.totals.pricePerPassenger ?? null,
      range: cheapestResult ? groupPriceRange(cheapestResult) : null,
      count: onDay.length,
    };
  });
  if (days.length === 0) return null;

  const ranges = days.map((d) => d.range).filter((r): r is PriceRange => r !== null);
  const prices = days.map((d) => d.cheapest).filter((p): p is number => p !== null);
  const best = prices.length > 0 ? Math.min(...prices) : null;
  const bestIndex = days.findIndex((d) => d.cheapest === best);
  const bestDay = bestIndex >= 0 ? days[bestIndex] : null;

  const scale = scaleOf(
    ranges.length > 0 ? Math.min(...ranges.map((r) => r.min)) : 0,
    ranges.length > 0 ? Math.max(...ranges.map((r) => r.max)) : 100,
  );
  /** Horizontal centre of a day's column, in % of the plot width. */
  const xOf = (index: number) => ((index + 0.5) / days.length) * 100;
  /** Height of a price, in % of the plot from the top. */
  const yOf = (price: number) => (1 - (price - scale.low) / (scale.high - scale.low)) * 100;
  /** A point in the SVG, whose box is 1000 wide and 100 high. */
  const point = (index: number, price: number) => `${xOf(index) * 10},${yOf(price)}`;

  // Runs of consecutive days with a price; a day without one breaks the line.
  const runs: number[][] = [];
  days.forEach((day, index) => {
    if (!day.range) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === index - 1) last.push(index);
    else runs.push([index]);
  });

  // A date under roughly every sixth of the axis, always the first and last,
  // skipping one that would crowd the last.
  const every = Math.max(1, Math.ceil(days.length / 6));
  const dateTicks = days
    .map((_, index) => index)
    .filter((index) => index % every === 0 || index === days.length - 1)
    .filter((index, i, all) => i === all.length - 1 || days.length - 1 - index >= every / 2);

  const shown = hovered !== null ? days[hovered] : null;

  return (
    <section className={`flex flex-col gap-3 bg-white ${border} ${radiusBig} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text
          size="small"
          value="Cheapest trip for each departure day — price per person"
          className="font-semibold text-gray-900"
        />
        <Text
          size="very small"
          value={
            bestDay?.average != null
              ? `Cheapest: leave ${dayLabel(bestDay.date)}, ${euros(bestDay.average)} per person on average`
              : "No day has results with the current filters"
          }
          className="text-gray-500"
        />
      </div>

      {/* The hovered day, read out in words above the plot. */}
      <div className="flex h-5 items-center">
        {shown ? (
          <Text
            size="very small"
            value={
              shown.range && shown.average !== null
                ? `${dayLabel(shown.date)}: ${euros(shown.average)} per person on average${
                    shown.range.max > shown.range.min
                      ? ` (cheapest person ${euros(shown.range.min)}, priciest ${euros(shown.range.max)})`
                      : ", everyone the same"
                  } · ${shown.count} result${shown.count === 1 ? "" : "s"} that day`
                : `${dayLabel(shown.date)}: no results that day`
            }
            className="tabular-nums text-gray-700"
          />
        ) : (
          <Text size="very small" value="Point at a day to see its prices" className="text-gray-400" />
        )}
      </div>

      <div className="flex gap-2">
        {/* The price scale, in euros per person. */}
        <div className="relative w-12 shrink-0" style={{ height: PLOT_HEIGHT_PX }}>
          {scale.ticks.map((tick) => (
            <div key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${yOf(tick)}%` }}>
              <Text size="very small" value={euros(tick)} className="tabular-nums text-gray-400" />
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            role="img"
            aria-label={`Price per person of the cheapest trip for each of ${days.length} departure days`}
            className={`relative border-b ${grayMid.border}`}
            style={{ height: PLOT_HEIGHT_PX }}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Gridlines at each price on the scale. */}
            {scale.ticks.map((tick) => (
              <div
                key={tick}
                className={`absolute inset-x-0 border-t border-dashed ${grayMid.border}`}
                style={{ top: `${yOf(tick)}%` }}
              />
            ))}

            {/* The hovered day's guide line. */}
            {hovered !== null && (
              <div className={`absolute inset-y-0 w-px ${grayMid.bg}`} style={{ left: `${xOf(hovered)}%` }} />
            )}

            <svg
              viewBox="0 0 1000 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden
            >
              {runs.map((run) => (
                <g key={run[0]}>
                  {/* Band from the cheapest person's price up to the priciest's. */}
                  <polygon
                    className={BAND}
                    points={[
                      ...run.map((i) => point(i, days[i].range!.max)),
                      ...[...run].reverse().map((i) => point(i, days[i].range!.min)),
                    ].join(" ")}
                  />
                  <polyline
                    className={LINE}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    points={run.map((i) => point(i, days[i].average!)).join(" ")}
                  />
                </g>
              ))}
            </svg>

            {/* A dot on each day's price, kept round outside the stretched SVG. */}
            {days.map((day, index) =>
              day.average !== null ? (
                <div
                  key={day.date}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${DOT} ${
                    index === bestIndex
                      ? "h-3 w-3 ring-2 ring-white"
                      : hovered === index
                        ? "h-2.5 w-2.5"
                        : "h-1.5 w-1.5"
                  }`}
                  style={{ left: `${xOf(index)}%`, top: `${yOf(day.average)}%` }}
                />
              ) : null,
            )}

            {/* The cheapest day's price, written above its dot. */}
            {bestDay?.average != null && (
              <div
                className="absolute -translate-x-1/2 -translate-y-full pb-2"
                style={{ left: `${xOf(bestIndex)}%`, top: `${yOf(bestDay.average)}%` }}
              >
                <Text
                  size="very small"
                  value={euros(bestDay.average)}
                  className={`whitespace-nowrap rounded bg-white/90 px-1 font-semibold tabular-nums ${LABEL}`}
                />
              </div>
            )}

            {/* One hover target per day, the full height of the plot. */}
            <div className="absolute inset-0 flex">
              {days.map((day, index) => (
                <div key={day.date} className="h-full flex-1" onMouseEnter={() => setHovered(index)} />
              ))}
            </div>
          </div>

          <div className="relative mt-1 h-4">
            {dateTicks.map((index) => (
              <div
                key={days[index].date}
                className={`absolute ${
                  index === 0 ? "" : index === days.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
                }`}
                style={{ left: index === 0 ? 0 : index === days.length - 1 ? "100%" : `${xOf(index)}%` }}
              >
                <Text
                  size="very small"
                  value={shortDate(days[index].date)}
                  className="whitespace-nowrap text-gray-400"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What the marks mean. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pl-14">
        <span className="flex items-center gap-1.5">
          <span className={`h-0.5 w-5 ${DOT}`} />
          <Text size="very small" value="Average price per person" className="text-gray-500" />
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-3 w-5 rounded-sm ${BAND_SWATCH}`} />
          <Text size="very small" value="From the cheapest to the priciest person" className="text-gray-500" />
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-full ${DOT}`} />
          <Text size="very small" value="Cheapest day" className="text-gray-500" />
        </span>
      </div>

      {/* Hidden on the wrapper, not the table: Firefox draws a table's caption
          outside the table's box, so an sr-only table still showed its caption
          over the chart title. */}
      <div className="sr-only">
        <table>
          <caption>Price per person of the cheapest trip for each departure day</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Average per person (€)</th>
              <th>Cheapest person (€)</th>
              <th>Priciest person (€)</th>
              <th>Results</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td>{day.average ?? "none"}</td>
                <td>{day.range?.min ?? "none"}</td>
                <td>{day.range?.max ?? "none"}</td>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
