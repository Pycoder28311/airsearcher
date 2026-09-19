"use client";

import { useMemo, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import { buildPriceGrid, type DatePair, type StoredPriceGrid } from "@/lib/airsearcher/priceGrid";
import { candidateDates, flexibleTripLength } from "@/lib/airsearcher/queryPlan";
import type { Arrangement, SearchQuery } from "@/lib/airsearcher/types";
import CostPerDayChart from "./CostPerDayChart";
import PriceGrid from "./PriceGrid";

/**
 * How a date-range search shows its prices.
 *
 * An open trip length gets the departure × return grid, with a switch back to
 * the per-day chart — the grid is wide, and on a phone the chart is the escape
 * hatch. A fixed length or a one-way trip gets the chart alone, as before.
 * The choice is view state only; nothing here is persisted.
 */
export default function DateRangeView({
  query,
  arrangements,
  stored,
  floor,
  selectedPair,
  onSelectPair,
}: {
  query: SearchQuery;
  /** What the filters let through. */
  arrangements: Arrangement[];
  /** Everything the search kept, before the filters. */
  stored: Arrangement[];
  /** The cheapest total per pair from before the cap, when the entry has one. */
  floor: StoredPriceGrid | undefined;
  selectedPair: DatePair | null;
  onSelectPair: (pair: DatePair | null) => void;
}) {
  const [view, setView] = useState<"grid" | "chart">("grid");
  const openLength = flexibleTripLength(query) !== null;
  const grid = useMemo(
    () =>
      openLength
        ? buildPriceGrid(query, arrangements, floor ? { floor, stored } : undefined)
        : null,
    [openLength, query, arrangements, floor, stored],
  );

  const chart = <CostPerDayChart dates={candidateDates(query)} arrangements={arrangements} />;
  if (!grid) return chart;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button styleType={view === "grid" ? "primary" : "tertiary"} onClick={() => setView("grid")}>
          Date grid
        </Button>
        <Button styleType={view === "chart" ? "primary" : "tertiary"} onClick={() => setView("chart")}>
          Per-day chart
        </Button>
      </div>
      {view === "grid" ? (
        <PriceGrid grid={grid} selected={selectedPair} onSelect={onSelectPair} />
      ) : (
        chart
      )}
    </div>
  );
}
