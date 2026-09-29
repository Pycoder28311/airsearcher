/**
 * A search's gathered flights, kept apart from the search itself.
 *
 * They are most of the saved data (tens of MB for a long date range) yet only
 * the "Gathered flight data" window reads them, so the searches list holds
 * just their count and each search's flights live under its own records key
 * (see `keys.ts`). Pure functions, shared by the browser, which splits a
 * search as it saves it, and the server, which split the searches saved
 * before this once.
 */

import type { StoredSearch } from "@/lib/airsearcher/storage";
import type { FlightRecord } from "@/lib/airsearcher/types";

/** What one records key holds: each provider's gathered flights for one search. */
export interface StoredRecords {
  records?: FlightRecord[];
  travelpayouts?: FlightRecord[];
  googleCurl?: FlightRecord[];
}

/** The flights a search shows as its data: its cURL run's, or SerpApi's. */
export function shownRecordsOf(kind: StoredSearch["kind"], stored: StoredRecords): FlightRecord[] {
  return (kind === "google-curl" ? stored.googleCurl : stored.records) ?? [];
}

export function countFlights(records: FlightRecord[]): number {
  return records.reduce((sum, record) => sum + record.flights.length, 0);
}

/**
 * Splits the gathered flights out of a search: the search as the list keeps
 * it, with their count in `gatheredFlights`, and the flights to store apart —
 * null when it holds none, which leaves the search as it was.
 */
export function splitRecords(entry: StoredSearch): {
  entry: StoredSearch;
  records: StoredRecords | null;
} {
  const records: StoredRecords = {
    records: entry.records,
    travelpayouts: entry.travelpayouts?.records,
    googleCurl: entry.googleCurl?.records,
  };
  if (!records.records && !records.travelpayouts && !records.googleCurl) {
    return { entry, records: null };
  }
  return {
    entry: {
      ...entry,
      gatheredFlights: countFlights(shownRecordsOf(entry.kind, records)),
      records: undefined,
      travelpayouts: entry.travelpayouts && { ...entry.travelpayouts, records: undefined },
      googleCurl: entry.googleCurl && { ...entry.googleCurl, records: undefined },
    },
    records,
  };
}
