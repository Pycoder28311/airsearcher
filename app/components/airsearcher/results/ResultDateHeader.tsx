"use client";

import type { ReactNode } from "react";
import Text from "@/framework/ui/iconText/Text";
import { grayMid } from "@/config/theme";
import { journeyArrival, journeyDeparture } from "@/lib/airsearcher/grouping";
import { formatClock, parseFlightTime } from "@/lib/airsearcher/time";
import type { Arrangement, Journey } from "@/lib/airsearcher/types";
import { priceRangeOf, withWeekday } from "./ResultCardClosed";
import { PRICE_TEXT } from "./PriceTag";

/** The earliest or latest of some flight times, or null when none parse. */
function extremeOf(times: (string | null)[], pick: "first" | "last"): string | null {
  const sorted = times
    .map((time) => ({ time, at: parseFlightTime(time)?.getTime() }))
    .filter((t): t is { time: string; at: number } => t.at !== undefined)
    .sort((a, b) => a.at - b.at);
  const hit = pick === "first" ? sorted[0] : sorted[sorted.length - 1];
  return hit?.time ?? null;
}

/** "07:40 – 12:55": the day's first take-off to its last landing, over every group. */
function hoursOf(journeys: Journey[]): string | null {
  const first = extremeOf(journeys.map(journeyDeparture), "first");
  const last = extremeOf(journeys.map(journeyArrival), "last");
  return first && last ? `${formatClock(first)} – ${formatClock(last)}` : null;
}

/** One date of the trip, with the hours its flights span. */
function DateWithHours({ date, hours }: { date: string; hours: string | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <Text size="small" value={withWeekday(date)} className="font-semibold text-gray-900" />
      {hours && <Text size="very small" value={hours} className="tabular-nums text-gray-500" />}
    </div>
  );
}

/**
 * Header for results of a date-range search, where the dates differ from card
 * to card: the trip's dates side by side, each with the hours from the day's
 * earliest flight to its latest, and the result's price range top right.
 */
export default function ResultDateHeader({
  arrangement,
  beforePrice,
}: {
  arrangement: Arrangement;
  /** Shown just left of the price, such as the save button. */
  beforePrice?: ReactNode;
}) {
  const outbound = arrangement.legs.map((leg) => leg.outbound);
  const back = arrangement.legs.flatMap((leg) => (leg.return ? [leg.return] : []));

  return (
    <div className={`flex flex-wrap items-baseline gap-x-8 gap-y-1 border-b ${grayMid.border} pb-2`}>
      <DateWithHours date={arrangement.departureDate} hours={hoursOf(outbound)} />
      {arrangement.returnDate && <DateWithHours date={arrangement.returnDate} hours={hoursOf(back)} />}
      <div className="ml-auto flex items-center gap-2 self-center">
        {beforePrice}
        <Text
          size="small"
          value={priceRangeOf(arrangement)}
          className={`whitespace-nowrap font-semibold tabular-nums ${PRICE_TEXT}`}
        />
      </div>
    </div>
  );
}
