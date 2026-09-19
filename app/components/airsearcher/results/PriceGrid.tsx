"use client";

import { useState } from "react";
import Text from "@/framework/ui/iconText/Text";
import { border, grayLight, grayMid, radiusBig } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import {
  pairKey,
  priceBand,
  type DatePair,
  type PriceGrid as Grid,
  type PriceGridCell as Cell,
} from "@/lib/airsearcher/priceGrid";
import { formatDate, parseIsoDate } from "@/lib/airsearcher/time";
import PriceGridCell from "./PriceGridCell";

/** "14 Sep" over "Mon", for a narrow header. */
function DateHeading({ iso }: { iso: string }) {
  const date = parseIsoDate(iso);
  return (
    <span className="flex flex-col items-center leading-tight" title={formatDate(iso)}>
      <span className="whitespace-nowrap text-gray-700">
        {date?.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
      </span>
      <span className="text-[10px] text-gray-400">
        {date?.toLocaleDateString("en-GB", { weekday: "short" })}
      </span>
    </span>
  );
}

/** "14 Sep → 17 Sep · 3 nights". */
export function describePair(pair: DatePair, nights: number): string {
  const short = (iso: string) =>
    parseIsoDate(iso)?.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) ?? iso;
  return `${short(pair.departureDate)} → ${short(pair.returnDate)} · ${nights} night${
    nights === 1 ? "" : "s"
  }`;
}

function describeCell(cell: Cell): string {
  const results = `${cell.count} result${cell.count === 1 ? "" : "s"}`;
  const price =
    cell.cheapest === null
      ? "no result"
      : cell.unfiltered
        ? `from ${cell.cheapest} ${CURRENCY} before filters, flights not kept`
        : `from ${cell.cheapest} ${CURRENCY}, ${results}`;
  return `Leave ${formatDate(cell.departureDate)}, return ${formatDate(cell.returnDate)}, ${
    cell.nights
  } night${cell.nights === 1 ? "" : "s"}, ${price}`;
}

/** Cheapest filtered price among cells, or null. */
function minOf(cells: (Cell | undefined)[]): number | null {
  const prices = cells
    .filter((c) => c && !c.unfiltered)
    .map((c) => c?.cheapest)
    .filter((p): p is number => typeof p === "number");
  return prices.length > 0 ? Math.min(...prices) : null;
}

const STICKY_ROW = `sticky left-0 z-10 bg-white`;
const COLUMN = "w-16 sm:w-20";

/**
 * Departure dates down the side, return dates across the top, the cheapest
 * group total in every allowed pair. Scrolls inside its own panel with both
 * headers pinned; the hovered cell is read out in a fixed line above the table
 * so no tooltip is clipped by the scroller.
 */
export default function PriceGrid({
  grid,
  selected,
  onSelect,
}: {
  grid: Grid;
  selected: DatePair | null;
  onSelect: (pair: DatePair | null) => void;
}) {
  const [hovered, setHovered] = useState<Cell | null>(null);
  const { best } = grid;
  const hasFloorCells = [...grid.cells.values()].some((cell) => cell.unfiltered);

  return (
    <section className={`flex min-w-0 flex-col gap-3 bg-white ${border} ${radiusBig} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text
          size="small"
          value={`Cheapest group total by departure and return date (${CURRENCY})`}
          className="font-semibold text-gray-900"
        />
        <Text
          size="very small"
          value={
            best
              ? `Cheapest ${best.cheapest} ${CURRENCY} · ${describePair(best, best.nights)}`
              : "No date pair has results with the current filters"
          }
          className="text-gray-500"
        />
      </div>

      <div className="flex h-5 items-center">
        {hovered && (
          <Text size="very small" value={describeCell(hovered)} className="tabular-nums text-gray-700" />
        )}
      </div>

      <div
        className={`max-h-[28rem] overflow-auto border ${grayMid.border} rounded-lg`}
        onMouseLeave={() => setHovered(null)}
      >
        <table className="w-max table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">Cheapest group total for each departure and return date</caption>
          <thead>
            <tr>
              <th scope="col" className={`${STICKY_ROW} top-0 z-20 ${COLUMN} p-1 text-left text-gray-400`}>
                <span className="text-[10px] font-normal">Leave ↓ Return →</span>
              </th>
              {grid.returnDates.map((iso) => (
                <th key={iso} scope="col" className={`sticky top-0 z-10 bg-white ${COLUMN} p-1 font-normal`}>
                  <DateHeading iso={iso} />
                </th>
              ))}
              <th scope="col" className={`sticky top-0 z-10 ${grayLight.bg} ${COLUMN} p-1 font-medium text-gray-600`}>
                Best
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.departureDates.map((departureDate) => {
              const rowCells = grid.returnDates.map((r) => grid.cells.get(pairKey(departureDate, r)));
              const rowBest = minOf(rowCells);
              return (
                <tr key={departureDate}>
                  <th scope="row" className={`${STICKY_ROW} p-1 font-normal`}>
                    <DateHeading iso={departureDate} />
                  </th>
                  {grid.returnDates.map((returnDate, index) => {
                    const cell = rowCells[index];
                    const isSelected =
                      selected?.departureDate === departureDate && selected?.returnDate === returnDate;
                    return (
                      <PriceGridCell
                        key={returnDate}
                        label={cell ? describeCell(cell) : ""}
                        state={{
                          invalid: !cell,
                          empty: cell?.cheapest === null,
                          unfiltered: cell?.unfiltered ?? false,
                          cheapest: cell?.cheapest ?? null,
                          isBest: !!cell && cell === best,
                          band: priceBand(cell?.cheapest ?? null, grid.thresholds),
                          selected: isSelected,
                        }}
                        onHover={() => setHovered(cell ?? null)}
                        // Clicking the selected cell again clears the selection.
                        onClick={() => onSelect(isSelected ? null : { departureDate, returnDate })}
                      />
                    );
                  })}
                  <td className={`p-1 text-center tabular-nums text-gray-600 ${grayLight.bg}`}>
                    {rowBest ?? "–"}
                  </td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className={`${STICKY_ROW} p-1 text-left font-medium text-gray-600`}>
                Best
              </th>
              {grid.returnDates.map((returnDate) => (
                <td key={returnDate} className={`p-1 text-center tabular-nums text-gray-600 ${grayLight.bg}`}>
                  {minOf(grid.departureDates.map((d) => grid.cells.get(pairKey(d, returnDate)))) ?? "–"}
                </td>
              ))}
              <td className={grayLight.bg} />
            </tr>
          </tbody>
        </table>
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
        <Text
          size="very small"
          value="– no result · blank: not a trip"
          className="text-gray-500"
        />
        {hasFloorCells && (
          <Text
            size="very small"
            value="Grey italic: cheapest before filters; too many dates to keep those flights"
            className="italic text-gray-400"
          />
        )}
      </div>
    </section>
  );
}
