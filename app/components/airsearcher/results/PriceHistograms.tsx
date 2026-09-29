"use client";

import Text from "@/framework/ui/iconText/Text";
import { grayMid } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { flightKey } from "@/lib/airsearcher/grouping";
import { journeyFlights, type Arrangement, type Journey } from "@/lib/airsearcher/types";

/**
 * Theme colours as literals, like the other result charts. The current
 * result's column is the full price blue; every other column the pale step of
 * the same hue, so the one that matters stands out without a second colour.
 */
const PRICE = "#2563EB";
const PRICE_MUTED = "#BFDBFE";
const GRID = "#E5E7EB";

const SYMBOL = CURRENCY === "EUR" ? "€" : CURRENCY;

/** Column widths tried in order; the first giving at most MAX_BINS columns wins. */
const STEPS = [5, 10, 20, 25, 50, 100, 200, 500, 1000];
const MAX_BINS = 12;

type Direction = "outbound" | "return";

/** What one passenger pays for a journey, both tickets of a stop included; null if unpriced. */
function journeyPrice(journey: Journey): number | null {
  let total = 0;
  for (const flight of journeyFlights(journey)) {
    if (flight.price === null) return null;
    total += flight.price;
  }
  return total;
}

function journeyOf(arrangement: Arrangement, origin: string, direction: Direction): Journey | null {
  const leg = arrangement.legs.find((l) => l.origin === origin);
  if (!leg) return null;
  return direction === "outbound" ? leg.outbound : leg.return;
}

/**
 * Every distinct way this city can fly this direction across the listed
 * results, priced per passenger. The same flights reached by several results
 * count once.
 */
function optionPrices(
  arrangements: Arrangement[],
  origin: string,
  direction: Direction,
): number[] {
  const byFlights = new Map<string, number>();
  for (const arrangement of arrangements) {
    const journey = journeyOf(arrangement, origin, direction);
    if (!journey) continue;
    const price = journeyPrice(journey);
    if (price === null) continue;
    byFlights.set(journeyFlights(journey).map(flightKey).join("+"), price);
  }
  return [...byFlights.values()];
}

interface Bin {
  from: number;
  to: number;
  count: number;
}

function binsOf(prices: number[]): { bins: Bin[]; step: number } {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const step =
    STEPS.find((s) => Math.floor(max / s) - Math.floor(min / s) + 1 <= MAX_BINS) ??
    STEPS[STEPS.length - 1];
  const start = Math.floor(min / step) * step;
  const count = Math.floor(max / step) - Math.floor(min / step) + 1;

  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({
    from: start + i * step,
    to: start + (i + 1) * step,
    count: 0,
  }));
  for (const price of prices) {
    bins[Math.min(count - 1, Math.floor((price - start) / step))].count++;
  }
  return { bins, step };
}

/** One city's histogram: share of options (y) per price column (x). */
function CityHistogram({
  origin,
  prices,
  current,
}: {
  origin: string;
  prices: number[];
  current: number;
}) {
  const all = prices.includes(current) ? prices : [...prices, current];
  const { bins, step } = binsOf(all);
  const total = all.length;
  const tallest = Math.max(...bins.map((b) => b.count));
  const currentBin = bins.findIndex((b) => current >= b.from && current < b.to);
  const dearer = all.filter((p) => p > current).length;
  const beats = Math.round((dearer / Math.max(1, total - 1)) * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Text size="small" value={origin} className="font-semibold text-gray-900" />
        <Text
          size="very small"
          value={
            total > 1
              ? `This result ${Math.round(current)} ${SYMBOL} · cheaper than ${beats}% of ${total - 1} others`
              : `This result ${Math.round(current)} ${SYMBOL} · the only option`
          }
          className="tabular-nums text-gray-500"
        />
      </div>

      <div className="flex gap-1.5">
        {/* Y axis: share of this city's options, top gridline labelled. */}
        <div className="flex h-20 w-8 shrink-0 flex-col justify-between text-right">
          <Text
            size="very small"
            value={`${Math.round((tallest / total) * 100)}%`}
            className="tabular-nums text-gray-400"
          />
          <Text size="very small" value="0%" className="tabular-nums text-gray-400" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="relative flex h-20 items-end gap-0.5 border-b"
            style={{ borderColor: GRID, backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px)` }}
          >
            {bins.map((bin, i) => {
              const share = bin.count / total;
              const isCurrent = i === currentBin;
              return (
                <div
                  key={bin.from}
                  className="group relative flex h-full min-w-0 flex-1 items-end"
                  title={`${bin.from}–${bin.to} ${SYMBOL}: ${Math.round(share * 100)}% (${bin.count} of ${total})${
                    isCurrent ? " · this result" : ""
                  }`}
                >
                  {bin.count > 0 && (
                    <div
                      className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
                      style={{
                        height: `${(bin.count / tallest) * 100}%`,
                        background: isCurrent ? PRICE : PRICE_MUTED,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* The current result's column is marked under the axis as well as by colour. */}
          <div className="flex gap-0.5">
            {bins.map((bin, i) => (
              <div key={bin.from} className="flex min-w-0 flex-1 justify-center">
                {i === currentBin && (
                  <Text size="very small" value="▲" className="leading-none text-gray-700" />
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Text
              size="very small"
              value={`${bins[0].from} ${SYMBOL}`}
              className="tabular-nums text-gray-400"
            />
            <Text
              size="very small"
              value={`each column ${step} ${SYMBOL}`}
              className="text-gray-400"
            />
            <Text
              size="very small"
              value={`${bins[bins.length - 1].to} ${SYMBOL}`}
              className="tabular-nums text-gray-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DirectionColumn({
  title,
  arrangement,
  compareWith,
  direction,
}: {
  title: string;
  arrangement: Arrangement;
  compareWith: Arrangement[];
  direction: Direction;
}) {
  const cities = arrangement.legs.flatMap((leg) => {
    const journey = direction === "outbound" ? leg.outbound : leg.return;
    const current = journey ? journeyPrice(journey) : null;
    if (current === null) return [];
    return [{ origin: leg.origin, current, prices: optionPrices(compareWith, leg.origin, direction) }];
  });
  if (cities.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Text size="small" value={title} className="font-semibold text-gray-900" />
      {cities.map((city) => (
        <CityHistogram key={city.origin} {...city} />
      ))}
    </div>
  );
}

/**
 * How this result's price per passenger compares, city by city: going on the
 * left, returning on the right. Each column is a price range; its height is
 * the share of that city's options in the listed results that fall in it. A
 * journey with a stop is priced as its tickets together.
 */
export default function PriceHistograms({
  arrangement,
  compareWith,
}: {
  arrangement: Arrangement;
  compareWith: Arrangement[];
}) {
  // One-way (or no priced way back): the going charts take the full width.
  const hasReturn = arrangement.legs.some((leg) => leg.return && journeyPrice(leg.return) !== null);

  return (
    <section className={`flex flex-col gap-3 border-t ${grayMid.border} pt-3`}>
      <Text
        size="small"
        value="Price per passenger against the other results"
        className="font-semibold text-gray-900"
      />
      <div className={`grid grid-cols-1 gap-6 ${hasReturn ? "md:grid-cols-2" : ""}`}>
        <DirectionColumn
          title="Going"
          arrangement={arrangement}
          compareWith={compareWith}
          direction="outbound"
        />
        {hasReturn && (
          <DirectionColumn
            title="Returning"
            arrangement={arrangement}
            compareWith={compareWith}
            direction="return"
          />
        )}
      </div>
    </section>
  );
}
