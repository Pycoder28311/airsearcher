"use client";

import Text from "@/framework/ui/iconText/Text";
import { border, colorRed, grayLight, grayMid, radius } from "@/config/theme";
import type { CurlRequestCount } from "@/lib/airsearcher/storage";

/**
 * How many flights each Google request of a cURL run read, and the total.
 * The same flight often comes back from several requests (the first page is
 * part of "view more"), so the flights kept after merging are shown too.
 * A plain panel: the results page's "Show info" button decides whether it shows.
 */
export default function CurlRequestSummary({
  requests,
  uniqueFlights,
}: {
  requests: CurlRequestCount[];
  uniqueFlights?: number;
}) {
  const total = requests.reduce((sum, request) => sum + request.flights, 0);

  return (
    <div className={`${border} ${radius} ${grayLight.bg} px-3 py-2`}>
      <div>
        <Text
          size="small"
          icon="info"
          value={`Read ${total} flights from ${requests.length} Google request${requests.length === 1 ? "" : "s"}${
            uniqueFlights === undefined ? "" : ` · ${uniqueFlights} kept after merging duplicates`
          }`}
          className="text-gray-700"
        />
      </div>
      <ol className={`mt-2 flex flex-col border-t ${grayMid.border} pt-2`}>
        {requests.map((request, index) => (
          <li key={`${index}-${request.label}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-0.5">
            <Text size="very small" value={`${index + 1}. ${request.label}`} className="text-gray-600" />
            {request.error ? (
              <Text size="very small" value={`failed: ${request.error}`} className={colorRed.text} />
            ) : (
              <Text size="very small" value={`${request.flights} flights`} className="tabular-nums text-gray-800" />
            )}
          </li>
        ))}
        <li className={`mt-1 flex justify-between gap-4 border-t ${grayMid.border} pt-1`}>
          <Text size="very small" value="Total" className="font-semibold text-gray-800" />
          <Text size="very small" value={`${total} flights`} className="tabular-nums font-semibold text-gray-800" />
        </li>
      </ol>
    </div>
  );
}
