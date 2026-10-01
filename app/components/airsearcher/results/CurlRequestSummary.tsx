"use client";

import Text from "@/framework/ui/iconText/Text";
import { border, colorRed, grayLight, grayMid, radius } from "@/config/theme";
import type { CurlRequestCount } from "@/lib/airsearcher/storage";

/** "34 flights had no price." — the note the Google routes add per request. */
const NO_PRICE = /^(\d+) flights? had no price\.?$/;

interface Row extends CurlRequestCount {
  /** Flights this request returned without a price; 0 when it said nothing. */
  unpriced: number;
  /** Any other note the run left about this request. */
  notes: string[];
}

/**
 * Sorts the run's notes onto the requests they belong to. A note is saved as
 * "<request label>: <text>", so the label says which row it is; the "no price"
 * count becomes a number on that row, other notes go under it, and notes
 * about no request (such as a stopped run) are returned apart.
 */
function rowsOf(
  requests: CurlRequestCount[],
  warnings: string[],
): { rows: Row[]; general: string[] } {
  const rows: Row[] = requests.map((request) => ({ ...request, unpriced: 0, notes: [] }));
  // The first request with a label takes its notes, should two ever share one.
  const byLabel = new Map<string, Row>();
  for (const row of rows) if (!byLabel.has(row.label)) byLabel.set(row.label, row);

  const general: string[] = [];
  for (const warning of warnings) {
    const split = warning.indexOf(": ");
    const row = split > 0 ? byLabel.get(warning.slice(0, split)) : undefined;
    if (!row) {
      general.push(warning);
      continue;
    }
    const text = warning.slice(split + 2);
    const unpriced = NO_PRICE.exec(text);
    if (unpriced) row.unpriced += Number(unpriced[1]);
    else row.notes.push(text);
  }
  return { rows, general };
}

/**
 * Everything "Show info" tells about a cURL run, in one panel: how many
 * flights each Google request read and how many of them had no price, then
 * the total. The same flight often comes back from several requests (the
 * first page is part of "view more"), so the flights kept after merging are
 * shown too. Without per-request counts (older searches) only the notes show.
 */
export default function CurlRequestSummary({
  requests,
  uniqueFlights,
  warnings = [],
}: {
  requests: CurlRequestCount[] | undefined;
  uniqueFlights?: number;
  warnings?: string[];
}) {
  const { rows, general } = rowsOf(requests ?? [], warnings);
  const total = rows.reduce((sum, row) => sum + row.flights, 0);
  const unpriced = rows.reduce((sum, row) => sum + row.unpriced, 0);

  return (
    <div className={`${border} ${radius} ${grayLight.bg} px-3 py-2`}>
      <Text
        size="small"
        icon="info"
        value={
          requests
            ? `Read ${total} flights from ${rows.length} Google request${rows.length === 1 ? "" : "s"}${
                uniqueFlights === undefined ? "" : ` · ${uniqueFlights} kept after merging duplicates`
              }${unpriced > 0 ? ` · ${unpriced} had no price` : ""}`
            : "This search was saved before the flights read per Google request were recorded. Run it again to see them."
        }
        className="text-gray-700"
      />

      {requests && (
        <Text
          size="very small"
          value="Flights with no price are ones with stops that Google lists at the end of its “Best match” order. They are left out of the results, and while they are fewer than 35% of a request's flights they don't change them."
          className="mt-1 block text-gray-500"
        />
      )}

      {requests && (
        <ol className={`mt-2 grid grid-cols-[1fr_auto_auto] gap-x-4 border-t ${grayMid.border} pt-2`}>
          <li className="contents">
            <Text size="very small" value="Request" className="text-gray-400" />
            <Text size="very small" value="Flights" className="text-right text-gray-400" />
            <Text size="very small" value="No price" className="text-right text-gray-400" />
          </li>
          {rows.map((row, index) => (
            <li key={`${index}-${row.label}`} className="contents">
              <div className="py-0.5">
                <Text size="very small" value={`${index + 1}. ${row.label}`} className="text-gray-600" />
                {row.notes.map((note) => (
                  <Text key={note} size="very small" value={note} className="block pl-4 text-gray-500" />
                ))}
                {/* Under the label, so a long message wraps there instead of stretching the number columns. */}
                {row.error && <Text size="very small" value={row.error} className={`block pl-4 ${colorRed.text}`} />}
              </div>
              {row.error ? (
                <Text size="very small" value="failed" className={`col-span-2 py-0.5 text-right ${colorRed.text}`} />
              ) : (
                <>
                  <Text size="very small" value={`${row.flights}`} className="py-0.5 text-right tabular-nums text-gray-800" />
                  <Text
                    size="very small"
                    value={row.unpriced > 0 ? `${row.unpriced}` : "–"}
                    className="py-0.5 text-right tabular-nums text-gray-500"
                  />
                </>
              )}
            </li>
          ))}
          <li className={`contents`}>
            <Text size="very small" value="Total" className={`mt-1 border-t ${grayMid.border} pt-1 font-semibold text-gray-800`} />
            <Text
              size="very small"
              value={`${total}`}
              className={`mt-1 border-t ${grayMid.border} pt-1 text-right tabular-nums font-semibold text-gray-800`}
            />
            <Text
              size="very small"
              value={`${unpriced}`}
              className={`mt-1 border-t ${grayMid.border} pt-1 text-right tabular-nums font-semibold text-gray-800`}
            />
          </li>
        </ol>
      )}

      {general.length > 0 && (
        <div className={`mt-2 flex flex-col gap-1 border-t ${grayMid.border} pt-2`}>
          {general.map((note) => (
            <Text key={note} size="very small" value={note} className="text-gray-500" />
          ))}
        </div>
      )}
    </div>
  );
}
