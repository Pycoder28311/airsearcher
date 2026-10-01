"use client";

import { useMemo, useState, type ReactNode } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { buildPriceGrid, buildPriceLine, type DatePair, type StoredPriceGrid } from "@/lib/airsearcher/priceGrid";
import PriceLine from "./PriceLine";
import { candidateDates, flexibleTripLength } from "@/lib/airsearcher/queryPlan";
import type { Arrangement, SearchQuery } from "@/lib/airsearcher/types";
import CityChoice from "../common/CityChoice";
import CostPerDayChart from "./CostPerDayChart";
import PriceGrid from "./PriceGrid";

/**
 * How a date-range search shows its prices.
 *
 * An open trip length gets the departure × return grid, with a switch back to
 * the per-day chart — the grid is wide, and on a phone the chart is the escape
 * hatch. A fixed length or a one-way trip gets the chart alone, as before.
 * On a search with several destination cities, a switch shows one city's
 * prices or all of them, without touching the result list below.
 * The choices are view state only; nothing here is persisted.
 */
export default function DateRangeView({
  query,
  arrangements,
  stored,
  floor,
  selectedPair,
  onSelectPair,
  info,
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
  /** What "Show info" shows, in place of the grid or chart; absent hides the button. */
  info?: ReactNode;
}) {
  const openLength = flexibleTripLength(query) !== null;
  // An open length starts on its grid; a fixed one on the per-day chart, its row a click away.
  const [view, setView] = useState<"grid" | "chart" | "info">(openLength ? "grid" : "chart");
  const [city, setCity] = useState<string | null>(null);

  // The cities with results, in the order they first appear.
  const cities = useMemo(
    () => [...new Set(stored.map((a) => a.destination.cityId))],
    [stored],
  );
  const activeCity = city !== null && cities.includes(city) ? city : null;
  const inCity = useMemo(() => {
    const pick = (list: Arrangement[]) =>
      activeCity ? list.filter((a) => a.destination.cityId === activeCity) : list;
    return { arrangements: pick(arrangements), stored: pick(stored) };
  }, [activeCity, arrangements, stored]);

  const grid = useMemo(
    () =>
      openLength
        ? buildPriceGrid(
            query,
            inCity.arrangements,
            // The saved floor covers every city, so it only fits all of them.
            floor && activeCity === null ? { floor, stored: inCity.stored } : undefined,
          )
        : null,
    [openLength, query, inCity, floor, activeCity],
  );

  // A fixed length has one return per day: its grid is a single row, the cheapest per departure day.
  const line = useMemo(
    () =>
      openLength
        ? null
        : buildPriceLine(
            query,
            inCity.arrangements,
            floor && activeCity === null ? { floor, stored: inCity.stored } : undefined,
          ),
    [openLength, query, inCity, floor, activeCity],
  );

  const chart = <CostPerDayChart dates={candidateDates(query)} arrangements={inCity.arrangements} />;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {(grid || line || info) && (
          <>
            <Button styleType={view === "grid" ? "primary" : "tertiary"} onClick={() => setView("grid")}>
              Date grid
            </Button>
            <Button styleType={view === "chart" ? "primary" : "tertiary"} onClick={() => setView("chart")}>
              Per-day chart
            </Button>
            {info && (
              <Button styleType={view === "info" ? "primary" : "tertiary"} onClick={() => setView("info")}>
                Show info
              </Button>
            )}
          </>
        )}
        {cities.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <Text size="very small" value="Arriving in" className="text-gray-500" />
            <CityChoice cities={cities} value={activeCity} onChange={setCity} size="very small" />
          </div>
        )}
      </div>
      {view === "info" && info ? (
        info
      ) : view === "chart" ? (
        chart
      ) : grid ? (
        <PriceGrid grid={grid} selected={selectedPair} onSelect={onSelectPair} />
      ) : line ? (
        <PriceLine line={line} selected={selectedPair} onSelect={onSelectPair} />
      ) : (
        chart
      )}
    </div>
  );
}
