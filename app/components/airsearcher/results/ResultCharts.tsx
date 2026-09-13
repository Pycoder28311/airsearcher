"use client";

import Text from "@/framework/ui/iconText/Text";
import { grayMid, radius } from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { formatClock, formatDuration, minutesBetweenTimes } from "@/lib/airsearcher/time";
import {
  journeyArrival,
  journeyDeparture,
  pricePerHeadOf,
} from "@/lib/airsearcher/grouping";
import type { Arrangement, GroupLeg } from "@/lib/airsearcher/types";

/**
 * Theme colours as literals: SVG paints `fill` attributes, not CSS classes.
 * Blue is price, orange is time — the same pairing the rest of the app uses.
 */
const PRICE = "#2563EB";
const TIME = "#F97316";
const TRACK = "#E5E7EB";

function legStart(leg: GroupLeg): string | null {
  return journeyDeparture(leg.outbound);
}

function legEnd(leg: GroupLeg): string | null {
  return journeyArrival(leg.outbound);
}

function gathers(leg: GroupLeg): boolean {
  return leg.outbound.routing === "gather" || leg.return?.routing === "gather";
}

/**
 * The graphs of the open result state.
 *
 * Every bar carries its number in text beside it — a bar on its own is a shape,
 * not a value anybody can read off.
 */
export default function ResultCharts({ arrangement }: { arrangement: Arrangement }) {
  const perLeg = arrangement.legs.map((leg) => ({
    leg,
    subtotal: pricePerHeadOf(leg) * leg.passengers,
    minutes: minutesBetweenTimes(legStart(leg), legEnd(leg)),
  }));

  const maxSubtotal = Math.max(1, ...perLeg.map((p) => p.subtotal));
  const maxMinutes = Math.max(1, ...perLeg.map((p) => p.minutes ?? 0));

  return (
    <div className="flex flex-col gap-5">
      {/* Price split per origin group. */}
      <section className="flex flex-col gap-2">
        <Text
          size="small"
          value="What each group costs"
          className="font-semibold text-gray-900"
        />
        <div className="flex flex-col gap-1.5">
          {perLeg.map(({ leg, subtotal }) => (
            <div key={`price-${leg.origin}`} className="flex items-center gap-3">
              <Text
                size="very small"
                value={`${leg.origin} · ${leg.passengers}p`}
                className="w-20 shrink-0 text-gray-500"
              />
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: TRACK }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (subtotal / maxSubtotal) * 100)}%`,
                    background: PRICE,
                  }}
                />
              </div>
              <Text
                size="very small"
                value={`${Math.round(subtotal)} ${CURRENCY}`}
                className="w-24 shrink-0 text-right tabular-nums text-gray-700"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Door-to-destination time per origin group. */}
      <section className="flex flex-col gap-2">
        <Text
          size="small"
          value="How long each group travels"
          className="font-semibold text-gray-900"
        />
        <div className="flex flex-col gap-1.5">
          {perLeg.map(({ leg, minutes }) => (
            <div key={`time-${leg.origin}`} className="flex items-center gap-3">
              <Text
                size="very small"
                value={`${leg.origin}${gathers(leg) ? " ↷" : ""}`}
                className="w-20 shrink-0 text-gray-500"
              />
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: TRACK }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, ((minutes ?? 0) / maxMinutes) * 100)}%`,
                    background: TIME,
                  }}
                />
              </div>
              <Text
                size="very small"
                value={formatDuration(minutes)}
                className="w-24 shrink-0 text-right tabular-nums text-gray-700"
              />
            </div>
          ))}
        </div>

        <div className={`flex flex-col gap-1 ${radius} border ${grayMid.border} p-2`}>
          {perLeg.map(({ leg }) => (
            <Text
              key={`clock-${leg.origin}`}
              size="very small"
              value={`${leg.origin} ${formatClock(legStart(leg))} → ${arrangement.destination.airport} ${formatClock(
                legEnd(leg),
              )}${leg.outbound.feeder ? ` (via ${arrangement.gatheringAirport})` : ""}`}
              className="tabular-nums text-gray-500"
            />
          ))}
        </div>
      </section>

      {/* Why it ranks where it does. */}
      <section className="flex flex-col gap-2">
        <Text
          size="small"
          value="Why it ranks here"
          className="font-semibold text-gray-900"
        />
        {[
          { label: "Price", value: arrangement.indices.price, color: PRICE },
          { label: "Hours", value: arrangement.indices.hour, color: TIME },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <Text
              size="very small"
              value={row.label}
              className="w-20 shrink-0 text-gray-500"
            />
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: TRACK }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, (row.value ?? 0) * 100)}%`,
                  background: row.color,
                }}
              />
            </div>
            <Text
              size="very small"
              value={row.value === null ? "n/a" : `${Math.round(row.value * 100)}%`}
              className="w-24 shrink-0 text-right tabular-nums text-gray-700"
            />
          </div>
        ))}
      </section>
    </div>
  );
}
