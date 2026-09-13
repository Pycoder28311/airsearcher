"use client";

import Text from "@/framework/ui/iconText/Text";
import { colorMain, grayMid, radius } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { describeRouting } from "@/lib/airsearcher/grouping";
import { formatClock, formatDate, formatDuration } from "@/lib/airsearcher/time";
import { journeyFlights, type Arrangement, type GroupLeg } from "@/lib/airsearcher/types";

/** The DEP / RET summary block of the Penpot closed card. */
function DirectionSummary({
  label,
  legs,
  direction,
  date,
}: {
  label: string;
  legs: GroupLeg[];
  direction: "outbound" | "return";
  date: string | null;
}) {
  const journeys = legs
    .map((leg) => (direction === "outbound" ? leg.outbound : leg.return))
    .filter((journey) => journey !== null);

  if (journeys.length === 0) return null;

  const flown = journeys.map(journeyFlights);
  const airlines = [
    ...new Set(flown.flat().map((f) => f.airline.name).filter(Boolean)),
  ];

  // Each group's journey in the order it is flown: "SKG → ATH → BER" going out
  // via the hub, "BER → ATH → SKG" coming back the same way.
  const routes = [
    ...new Set(
      flown.map((flights) => {
        const stops = [
          flights[0].outbound.segments[0]?.departure.airport,
          ...flights.map((f) => f.outbound.segments[f.outbound.segments.length - 1]?.arrival.airport),
        ];
        return stops.filter(Boolean).join(" → ");
      }),
    ),
  ].filter(Boolean);

  const first = flown[0];
  const firstSegment = first[0].outbound.segments[0];
  const lastFlight = first[first.length - 1];
  const lastSegment = lastFlight.outbound.segments[lastFlight.outbound.segments.length - 1];

  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1 ${radius} p-2`}>
      <div className="flex items-center gap-2">
        <Text
          size="very small"
          value={label}
          className={`font-semibold ${colorMain.text}`}
        />
        <Text size="very small" value={formatDate(date)} className="text-gray-500" />
        <Text
          size="very small"
          value={`${formatClock(firstSegment?.departure.time)} – ${formatClock(
            lastSegment?.arrival.time,
          )}`}
          className="ml-auto tabular-nums text-gray-500"
        />
      </div>

      <Text
        size="small"
        value={routes.join(", ")}
        className="truncate text-gray-900"
      />
      <Text
        size="very small"
        value={airlines.join(", ") || "—"}
        className="truncate text-gray-500"
      />
    </div>
  );
}

/**
 * The collapsed result: what the whole group pays, how it splits, and how long
 * the longest journey takes — the Penpot closed state.
 */
export default function ResultCardClosed({
  arrangement,
  cheapestPrice,
}: {
  arrangement: Arrangement;
  /** Cheapest total in the current result set, for the relative price bar. */
  cheapestPrice: number;
}) {
  const { totals } = arrangement;
  const ratio = cheapestPrice > 0 ? cheapestPrice / totals.totalPrice : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Text
          size="big"
          value={`${totals.totalPrice} ${CURRENCY}`}
          className="font-semibold text-gray-900"
        />
        <Text
          size="very small"
          value={`${totals.pricePerPassenger} ${CURRENCY} per passenger · ${totals.passengers} travelling`}
          className="text-gray-500"
        />
        <Text
          size="very small"
          value={`Longest journey ${formatDuration(totals.longestTravelMinutes)}`}
          className="ml-auto text-gray-500"
        />
      </div>

      <Text
        size="small"
        value={describeRouting(arrangement)}
        className="text-gray-700"
      />

      <div className={`flex flex-col gap-2 border-t ${grayMid.border} pt-2 sm:flex-row`}>
        <DirectionSummary
          label="DEP"
          legs={arrangement.legs}
          direction="outbound"
          date={arrangement.departureDate}
        />
        <DirectionSummary
          label="RET"
          legs={arrangement.legs}
          direction="return"
          date={arrangement.returnDate}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-600"
            style={{ width: `${Math.max(4, Math.min(100, ratio * 100))}%` }}
          />
        </div>
        <Text
          size="very small"
          value={`Score ${Math.round(arrangement.score * 100)}`}
          className="shrink-0 tabular-nums text-gray-500"
        />
      </div>
    </div>
  );
}
