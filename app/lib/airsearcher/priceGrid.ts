/**
 * The departure × return price grid.
 *
 * Built only from data the search already holds: one cell per
 * departure/return pair the query allows, carrying the cheapest group total.
 * Pure — no React, no storage, no fetch.
 *
 * An open trip length can have far more pairs than the stored arrangements can
 * cover (every arrangement carries its flights, and browser storage is small),
 * so a search also stores `StoredPriceGrid`: the cheapest total per pair,
 * computed before the cap. The grid prefers the filtered arrangements and
 * falls back to that floor only for pairs the cap left with nothing stored.
 */

import { candidateDates, flexibleTripLength, returnDatesFor } from "@/lib/airsearcher/queryPlan";
import { daysBetween } from "@/lib/airsearcher/time";
import type { Arrangement, SearchQuery } from "@/lib/airsearcher/types";

export interface PriceGridCell {
  departureDate: string;
  returnDate: string;
  nights: number;
  /** Cheapest group total for this pair; null when nothing survives. */
  cheapest: number | null;
  /** How many arrangements sit in this cell. */
  count: number;
  /**
   * The price comes from the stored floor, not from a kept arrangement: the
   * filters were not applied to it and there are no flights to list.
   */
  unfiltered: boolean;
}

/** Cheapest group total per date pair, computed before the arrangement cap. */
export interface StoredPriceGrid {
  /** `${departureDate}|${returnDate}` -> cheapest total price. */
  cells: Record<string, number>;
}

export interface PriceGrid {
  /** Row headers, ascending. */
  departureDates: string[];
  /** Column headers, ascending — the union of every valid return date. */
  returnDates: string[];
  /** `${departureDate}|${returnDate}` -> cell. Only valid pairs are present. */
  cells: Map<string, PriceGridCell>;
  /** Cheapest cell in the whole grid, for the highlight and the legend. */
  best: PriceGridCell | null;
  /** Price at the 1/3 and 2/3 marks, for the three-step cell shading. */
  thresholds: { low: number; high: number } | null;
}

/** One departure/return combination, as the grid and the results page select it. */
export interface DatePair {
  departureDate: string;
  returnDate: string;
}

/** The key a pair is stored under in `PriceGrid.cells`. */
export function pairKey(departureDate: string, returnDate: string): string {
  return `${departureDate}|${returnDate}`;
}

/** The floor stored with a search: the cheapest total of every round-trip pair. */
export function cheapestPerPair(arrangements: Arrangement[]): StoredPriceGrid {
  const cells: Record<string, number> = {};
  for (const arrangement of arrangements) {
    if (!arrangement.returnDate) continue;
    const key = pairKey(arrangement.departureDate, arrangement.returnDate);
    const price = arrangement.totals.totalPrice;
    if (cells[key] === undefined || price < cells[key]) cells[key] = price;
  }
  return { cells };
}

const EMPTY_GRID: PriceGrid = {
  departureDates: [],
  returnDates: [],
  cells: new Map(),
  best: null,
  thresholds: null,
};

/**
 * Rows are the candidate departure dates, columns every return date any of
 * them allows. A (row, column) the query does not allow is absent from
 * `cells`; an allowed pair with no arrangement is present with `cheapest: null`,
 * so "not a trip" and "no result" stay distinguishable.
 *
 * `fallback.stored` is the unfiltered list the search kept. A pair with stored
 * arrangements that the filters removed is a genuine "no result"; only a pair
 * with none stored at all (the cap dropped it) takes its price from the floor.
 * Floor cells never count towards `best` or the shading thresholds.
 */
export function buildPriceGrid(
  query: SearchQuery,
  arrangements: Arrangement[],
  fallback?: { floor: StoredPriceGrid; stored: Arrangement[] },
): PriceGrid {
  if (!flexibleTripLength(query)) return EMPTY_GRID;

  const departureDates = candidateDates(query);
  const cells = new Map<string, PriceGridCell>();
  const columns = new Set<string>();

  for (const departureDate of departureDates) {
    for (const returnDate of returnDatesFor(query, departureDate)) {
      if (returnDate === null) continue;
      columns.add(returnDate);
      cells.set(pairKey(departureDate, returnDate), {
        departureDate,
        returnDate,
        nights: daysBetween(departureDate, returnDate),
        cheapest: null,
        count: 0,
        unfiltered: false,
      });
    }
  }

  for (const arrangement of arrangements) {
    if (!arrangement.returnDate) continue;
    const cell = cells.get(pairKey(arrangement.departureDate, arrangement.returnDate));
    if (!cell) continue;
    cell.count++;
    const price = arrangement.totals.totalPrice;
    if (cell.cheapest === null || price < cell.cheapest) cell.cheapest = price;
  }

  if (fallback) {
    const storedPairs = new Set(
      fallback.stored.map((a) => pairKey(a.departureDate, a.returnDate ?? "")),
    );
    for (const [key, cell] of cells) {
      const floor = fallback.floor.cells[key];
      if (cell.cheapest !== null || storedPairs.has(key) || floor === undefined) continue;
      cell.cheapest = floor;
      cell.unfiltered = true;
    }
  }

  let best: PriceGridCell | null = null;
  const prices: number[] = [];
  for (const cell of cells.values()) {
    if (cell.cheapest === null || cell.unfiltered) continue;
    prices.push(cell.cheapest);
    if (!best || cell.cheapest < best.cheapest!) best = cell;
  }

  // Terciles rather than a fixed percentage, so the shading stays readable
  // whether prices span 5% or 500%.
  prices.sort((a, b) => a - b);
  const thresholds =
    prices.length > 0
      ? {
          low: prices[Math.floor(prices.length / 3)],
          high: prices[Math.floor((2 * prices.length) / 3)],
        }
      : null;

  return {
    departureDates,
    returnDates: [...columns].sort(),
    cells,
    best,
    thresholds,
  };
}

/** Which third of the grid's prices a cell falls in; null when it has none. */
export function priceBand(
  cheapest: number | null,
  thresholds: PriceGrid["thresholds"],
): "low" | "mid" | "high" | null {
  if (cheapest === null || !thresholds) return null;
  if (cheapest < thresholds.low) return "low";
  if (cheapest < thresholds.high) return "mid";
  return "high";
}
