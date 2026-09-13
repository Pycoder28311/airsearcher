"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { grayLight, grayMid, radius } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import {
  journeyArrival,
  journeyDeparture,
  pricePerHeadOf,
  routingLabel,
} from "@/lib/airsearcher/grouping";
import { formatDuration, minutesBetweenTimes } from "@/lib/airsearcher/time";
import type { Arrangement } from "@/lib/airsearcher/types";
import FlightList from "./FlightList";
import ResultCardClosed from "./ResultCardClosed";
import ResultCharts from "./ResultCharts";

/**
 * The expanded result: the closed summary, a per-origin breakdown, the graphs,
 * and the full flight list behind "See Flights".
 */
export default function ResultCardOpen({
  arrangement,
  cheapestPrice,
}: {
  arrangement: Arrangement;
  cheapestPrice: number;
}) {
  const [showFlights, setShowFlights] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <ResultCardClosed arrangement={arrangement} cheapestPrice={cheapestPrice} />

      {/* Per-origin breakdown. */}
      <div className={`overflow-x-auto ${radius} border ${grayMid.border}`}>
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead className={grayLight.bg}>
            <tr>
              {["Origin", "Passengers", "Routing", "Journey", "Subtotal"].map((heading) => (
                <th key={heading} className="px-3 py-2">
                  <Text size="very small" value={heading} className="text-gray-500" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {arrangement.legs.map((leg) => {
              const start = journeyDeparture(leg.outbound);
              const end = journeyArrival(leg.outbound);
              const subtotal = pricePerHeadOf(leg) * leg.passengers;
              const routing = routingLabel(leg, arrangement.gatheringAirport);

              return (
                <tr key={leg.origin} className={`border-t ${grayMid.border}`}>
                  <td className="px-3 py-2">
                    <Text
                      size="small"
                      value={leg.origin}
                      className="font-medium text-gray-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Text
                      size="small"
                      value={leg.passengers}
                      className="tabular-nums text-gray-700"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Text
                      size="very small"
                      value={routing.charAt(0).toUpperCase() + routing.slice(1)}
                      className="text-gray-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Text
                      size="very small"
                      value={formatDuration(minutesBetweenTimes(start, end))}
                      className="tabular-nums text-gray-600"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Text
                      size="small"
                      value={`${Math.round(subtotal)} ${CURRENCY}`}
                      className="tabular-nums text-gray-900"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ResultCharts arrangement={arrangement} />

      <div>
        <Button styleType="tertiary" onClick={() => setShowFlights((v) => !v)}>
          <Text
            icon={showFlights ? "chevron-up" : "chevron-down"}
            iconPosition="right"
            size="small"
            value={showFlights ? "Hide flights" : "See Flights"}
          />
        </Button>
      </div>

      {showFlights && <FlightList arrangement={arrangement} />}
    </div>
  );
}
