/**
 * The searches the app builds from the top inputs when given a session cURL.
 *
 * They are exactly the SerpApi request batches: `planSearches` lists every
 * route the trip needs, `planRequestBatches` groups them into one request per
 * date and direction with up to MAX_AIRPORTS_PER_REQUEST airports per side.
 * The flights that come back are filed per route by `recordsFromCurlFlights`,
 * just as SerpApi batches are split by `flightRecordsFromResponses`.
 */

import { MAX_AIRPORTS_PER_REQUEST } from "@/lib/airsearcher/config/constants";
import { CurlError } from "@/lib/airsearcher/curl/errors";
import type { GeneratedSearch } from "@/lib/airsearcher/curl/freq";
import { planRequestBatches, planSearches } from "@/lib/airsearcher/queryPlan";
import { formatDate } from "@/lib/airsearcher/time";
import type { SearchQuery } from "@/lib/airsearcher/types";

export interface GeneratedJob {
  search: GeneratedSearch;
  direction: "outbound" | "return";
  /** "ATH,SKG → LHR,LGW · 8 Oct · going" */
  label: string;
}

export function generatedJobsFor(query: SearchQuery): GeneratedJob[] {
  return planRequestBatches(planSearches(query)).map((batch) => {
    const from = batch.departureId.split(",");
    const to = batch.arrivalId.split(",");
    return {
      search: { from, to, date: batch.date },
      direction: batch.direction,
      label: `${from.join(",")} → ${to.join(",")} · ${formatDate(batch.date)} · ${
        batch.direction === "outbound" ? "going" : "returning"
      }`,
    };
  });
}

const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks a search sent by the browser before the server builds a request
 * from it. `today` is "YYYY-MM-DD" in server-local time.
 */
export function validateSearch(value: unknown, today: string): GeneratedSearch {
  const bad = (why: string) => new CurlError("parse_error", `Invalid search: ${why}.`);
  if (typeof value !== "object" || value === null) throw bad("missing");
  const { from, to, date } = value as Partial<GeneratedSearch>;

  for (const [side, codes] of [["from", from], ["to", to]] as const) {
    if (!Array.isArray(codes) || codes.length === 0) throw bad(`no “${side}” airports`);
    if (codes.length > MAX_AIRPORTS_PER_REQUEST) throw bad(`more than ${MAX_AIRPORTS_PER_REQUEST} “${side}” airports`);
    if (!codes.every((code) => typeof code === "string" && IATA.test(code))) throw bad(`bad “${side}” airport code`);
  }
  if (from!.some((code) => to!.includes(code))) throw bad("an airport is on both sides");
  if (typeof date !== "string" || !ISO_DATE.test(date)) throw bad("bad date");
  if (date < today) throw bad("the date is in the past");

  return { from: [...from!], to: [...to!], date };
}
