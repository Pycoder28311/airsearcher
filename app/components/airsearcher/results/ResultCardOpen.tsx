"use client";

import type { ReactNode } from "react";
import type { Arrangement } from "@/lib/airsearcher/types";
import GroupList from "./GroupList";
import PriceHistograms from "./PriceHistograms";
import ResultCardClosed from "./ResultCardClosed";
import ScoreBar from "./ScoreBar";

/**
 * The expanded result: the closed summary, a card per group for each
 * direction, how its prices compare with the other results, and how its
 * score is made.
 */
export default function ResultCardOpen({
  arrangement,
  cheapestPrice,
  compareWith,
  controls,
  largeHeaders = false,
  beforePrice,
}: {
  arrangement: Arrangement;
  cheapestPrice: number;
  /** The listed results this one's prices are compared against. */
  compareWith: Arrangement[];
  /**
   * The card's Close / Float buttons, placed right under the route summary so
   * they sit exactly where Open / Float are on the closed card.
   */
  controls?: ReactNode;
  /** Exact-date searches: bigger DEP / RET headers. */
  largeHeaders?: boolean;
  /** Shown just left of the price (exact dates), such as the save button. */
  beforePrice?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ResultCardClosed arrangement={arrangement} largeHeaders={largeHeaders} beforePrice={beforePrice} />

      {controls}


      <GroupList arrangement={arrangement} />

      <PriceHistograms arrangement={arrangement} compareWith={compareWith} />

      {/* How the score is made, at the bottom. */}
      <ScoreBar arrangement={arrangement} cheapestPrice={cheapestPrice} />
    </div>
  );
}
