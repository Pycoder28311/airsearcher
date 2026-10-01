"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, grayLight, grayMid, grayStrong, radiusBig } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { formatPriceRange } from "@/lib/airsearcher/grouping";
import {
  priceBand,
  type DatePair,
  type PriceLine as Line,
  type PriceLineCell as Cell,
} from "@/lib/airsearcher/priceGrid";
import { formatDate, parseIsoDate } from "@/lib/airsearcher/time";

const short = (iso: string, options: Intl.DateTimeFormatOptions) =>
  parseIsoDate(iso)?.toLocaleDateString("en-GB", options) ?? iso;

function describeCell(cell: Cell): string {
  if (cell.cheapest === null) return `Leave ${formatDate(cell.departureDate)}: no result`;
  const range = cell.range ? formatPriceRange(cell.range, CURRENCY) : "price range not stored";
  const back = cell.returnDate ? `, back ${formatDate(cell.returnDate)}` : "";
  return cell.unfiltered
    ? `Leave ${formatDate(cell.departureDate)}${back}: cheapest ${range} per passenger before filters, flights not kept`
    : `Leave ${formatDate(cell.departureDate)}${back}: cheapest ${range} per passenger, ${cell.count} result${
        cell.count === 1 ? "" : "s"
      } leaving that day`;
}

/**
 * The date grid of a fixed-length search: one row, a cell per departure day
 * with its cheapest result's price range per passenger and the day it comes
 * back, shaded like the grid. Clicking a day shows only the results leaving
 * that day; clicking it again shows them all.
 */
export default function PriceLine({
  line,
  selected,
  onSelect,
}: {
  line: Line;
  selected: DatePair | null;
  onSelect: (pair: DatePair | null) => void;
}) {
  const [hovered, setHovered] = useState<Cell | null>(null);
  const { best } = line;

  return (
    <section className={`flex min-w-0 flex-col gap-3 bg-white ${border} ${radiusBig} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text
          size="small"
          value={`Cheapest result for each departure day: cheapest–priciest group per passenger (${CURRENCY})`}
          className="font-semibold text-gray-900"
        />
        <Text
          size="very small"
          value={
            best
              ? `Cheapest ${best.range ? formatPriceRange(best.range, CURRENCY) : "—"} · leave ${short(best.departureDate, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}`
              : "No day has results with the current filters"
          }
          className="text-gray-500"
        />
      </div>

      <div className="flex h-5 items-center">
        {hovered && <Text size="very small" value={describeCell(hovered)} className="tabular-nums text-gray-700" />}
      </div>

      <div
        className={`overflow-x-auto border ${grayMid.border} rounded-lg`}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="flex w-max gap-0.5 p-1">
          {line.cells.map((cell) => {
            const isSelected = selected?.departureDate === cell.departureDate && selected.returnDate === null;
            const band = priceBand(cell.cheapest, line.thresholds);
            const empty = cell.cheapest === null;
            const tone = empty
              ? `bg-transparent! ${grayStrong.text} opacity-50`
              : cell.unfiltered
                ? "bg-transparent! text-gray-400! italic"
                : cell === best
                  ? "bg-blue-600! text-white!"
                  : band === "low"
                    ? "bg-blue-50! text-blue-900!"
                    : band === "high"
                      ? "bg-gray-50! text-gray-600!"
                      : "bg-transparent!";
            return (
              <div
                key={cell.departureDate}
                className="flex w-16 flex-col items-center gap-1 sm:w-20"
                onMouseEnter={() => setHovered(cell)}
              >
                <span className="flex flex-col items-center text-xs leading-tight">
                  <span className="whitespace-nowrap text-gray-700">
                    {short(cell.departureDate, { day: "numeric", month: "short" })}
                  </span>
                  <span className="text-[10px] text-gray-400">{short(cell.departureDate, { weekday: "short" })}</span>
                </span>
                <Button
                  styleType="tertiary"
                  disabled={empty || cell.unfiltered}
                  onClick={() => onSelect(isSelected ? null : { departureDate: cell.departureDate, returnDate: null })}
                  className={`h-9 w-full p-0! text-xs tabular-nums ${tone} ${isSelected ? "ring-2 ring-orange-500" : ""}`}
                >
                  <span aria-hidden>{empty ? "–" : cell.range ? formatPriceRange(cell.range) : "·"}</span>
                  <span className="sr-only">{describeCell(cell)}</span>
                </Button>
                <span className="h-3 text-[10px] whitespace-nowrap text-gray-400">
                  {cell.returnDate ? `→ ${short(cell.returnDate, { day: "numeric", month: "short" })}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {[
          { swatch: "bg-blue-600", label: "Cheapest" },
          { swatch: "bg-blue-50", label: "Cheaper third" },
          { swatch: "bg-white", label: "Middle third" },
          { swatch: grayLight.bg, label: "Pricier third" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-sm border ${grayMid.border} ${item.swatch}`} />
            <Text size="very small" value={item.label} className="text-gray-500" />
          </span>
        ))}
        <Text size="very small" value="– no result · → the day back" className="text-gray-500" />
      </div>
    </section>
  );
}
