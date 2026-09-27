"use client";

import Text from "@/framework/ui/iconText/Text";
import { border, grayMid, radius } from "@/config/theme";
import { planSearches, searchId } from "@/lib/airsearcher/queryPlan";
import { formatDate } from "@/lib/airsearcher/time";
import type { FlightRecord, SearchQuery } from "@/lib/airsearcher/types";

const REASONS = { main: "main", feeder: "to/from hub", direct: "direct" } as const;

/**
 * The one-way searches the current query needs, so the user knows exactly
 * which Google Flights searches to copy. After a run, each shows how many
 * flights it received.
 */
export default function CurlCoverage({
  query,
  records,
}: {
  query: SearchQuery;
  /** Records from the last run, or null before any run. */
  records: FlightRecord[] | null;
}) {
  const plan = planSearches(query);
  if (plan.length === 0) {
    return (
      <Text
        size="very small"
        value="Choose a destination and dates above to see which searches to copy."
        className="text-gray-500"
      />
    );
  }

  const received = new Map(records?.map((record) => [record.id, record.flights.length]) ?? []);

  return (
    <details className={`${border} ${radius} bg-white`}>
      <summary className="cursor-pointer px-3 py-2">
        <Text
          size="very small"
          value={`Searches this trip needs: ${plan.length} one-way route${plan.length === 1 ? "" : "s"}${
            records ? ` · ${[...received.values()].filter((n) => n > 0).length} covered` : ""
          }`}
          className="font-medium text-gray-700"
        />
      </summary>
      <ul className={`max-h-64 overflow-y-auto border-t ${grayMid.border} px-3 py-2`}>
        {plan.map((search) => {
          const count = received.get(searchId(search));
          return (
            <li key={searchId(search)} className="flex flex-wrap items-center justify-between gap-2 py-0.5">
              <Text
                size="very small"
                value={`${search.from} → ${search.to} · ${formatDate(search.date)} · ${
                  search.direction === "outbound" ? "going" : "returning"
                }, ${REASONS[search.reason]}`}
                className="text-gray-700"
              />
              <Text
                size="very small"
                value={count === undefined ? "—" : count > 0 ? `${count} flights` : "none"}
                className={count ? "text-gray-700" : "text-gray-400"}
              />
            </li>
          );
        })}
      </ul>
    </details>
  );
}
