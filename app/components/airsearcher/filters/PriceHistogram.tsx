"use client";

import Text from "@/framework/ui/iconText/Text";
import { CURRENCY } from "@/lib/airsearcher/config/constants";

const BUCKETS = 16;

/**
 * Where the group totals actually sit, so the price range slider is set against
 * the real spread rather than guessed at. Bars inside the chosen range are
 * blue; the rest are grey.
 */
export default function PriceHistogram({
  prices,
  range,
}: {
  prices: number[];
  range: [number, number] | null;
}) {
  if (prices.length === 0) {
    return (
      <Text size="very small" value="No prices to chart" className="text-gray-400 italic" />
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const width = Math.max(1, max - min);

  const counts = new Array<number>(BUCKETS).fill(0);
  for (const price of prices) {
    const index = Math.min(BUCKETS - 1, Math.floor(((price - min) / width) * BUCKETS));
    counts[index]++;
  }
  const tallest = Math.max(...counts);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-12 items-end gap-px">
        {counts.map((count, index) => {
          const bucketStart = min + (index / BUCKETS) * width;
          const bucketEnd = min + ((index + 1) / BUCKETS) * width;
          const inRange =
            range === null || (bucketEnd >= range[0] && bucketStart <= range[1]);

          return (
            <div
              key={index}
              style={{ height: `${Math.max(4, (count / tallest) * 100)}%` }}
              className={`flex-1 rounded-t-sm ${inRange ? "bg-blue-500/70" : "bg-gray-200"}`}
              title={`${Math.round(bucketStart)}–${Math.round(bucketEnd)} ${CURRENCY}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between">
        <Text
          size="very small"
          value={`${Math.round(min)} ${CURRENCY}`}
          className="tabular-nums text-gray-400"
        />
        <Text
          size="very small"
          value={`${Math.round(max)} ${CURRENCY}`}
          className="tabular-nums text-gray-400"
        />
      </div>
    </div>
  );
}
