"use client";

import { CURL_MIN_INTERVAL_MS } from "@/lib/airsearcher/config/curl";
import type { CurlRunResponse } from "@/lib/airsearcher/curl/api";
import { recordsFromCurlFlights } from "@/lib/airsearcher/curl/records";
import { runCurlSearch } from "@/lib/airsearcher/search";
import {
  loadFilters,
  loadPreferences,
  type CurlRequestCount,
  type StoredSearch,
} from "@/lib/airsearcher/storage";
import type { FlightRecord, NormalizedFlight, SearchQuery } from "@/lib/airsearcher/types";

export type RowStatus =
  | { kind: "idle" }
  | { kind: "pending"; expectedStart: number }
  | { kind: "running" }
  | { kind: "done"; flights: number; warnings: string[] }
  | { kind: "failed"; message: string }
  | { kind: "skipped"; message: string };

export interface SequenceJob<Id> {
  id: Id;
  /** "Row 2" or "ATH,SKG → LHR · 8 Oct · going", used in warnings. */
  label: string;
  send: (signal: AbortSignal) => Promise<CurlRunResponse>;
}

export interface SequenceOutcome {
  flights: NormalizedFlight[];
  warnings: string[];
  succeeded: number;
  /** Every request that was sent, in order, with the flights it read. */
  requests: CurlRequestCount[];
  /** Set when an error stopped the run early (not a user Stop). */
  stoppedBecause: string | null;
}

/**
 * When this page last saw a request to Google finish. Shared by both kinds of
 * run so the countdown stays honest when one follows the other; the server's
 * gate is what actually enforces the gap.
 */
let lastFinishedAt: number | null = null;

/**
 * Sends the jobs one at a time, strictly in order, reporting each one's status.
 * A `stopRun` error ends the run and marks the rest as not sent.
 */
export async function runSequence<Id>(
  jobs: SequenceJob<Id>[],
  signal: AbortSignal,
  onStatus: (id: Id, status: RowStatus) => void,
): Promise<SequenceOutcome> {
  const flights: NormalizedFlight[] = [];
  const warnings: string[] = [];
  let succeeded = 0;
  const requests: CurlRequestCount[] = [];

  for (const [position, job] of jobs.entries()) {
    const expectedStart = lastFinishedAt === null ? Date.now() : lastFinishedAt + CURL_MIN_INTERVAL_MS;
    onStatus(job.id, expectedStart > Date.now() ? { kind: "pending", expectedStart } : { kind: "running" });

    const response = await job.send(signal);
    lastFinishedAt = Date.now();

    if (response.ok) {
      succeeded++;
      flights.push(...response.flights);
      requests.push({ label: job.label, flights: response.flights.length });
      warnings.push(...response.warnings.map((w) => `${job.label}: ${w}`));
      if (response.flights.length === 0) {
        warnings.push(
          `${job.label} returned no flights. If Google shows flights for that search, its answer format may have changed.`,
        );
      }
      onStatus(job.id, { kind: "done", flights: response.flights.length, warnings: response.warnings });
      continue;
    }

    onStatus(job.id, { kind: "failed", message: response.error.message });
    if (response.error.code !== "aborted") {
      requests.push({ label: job.label, flights: 0, error: response.error.message });
    }
    if (response.error.stopRun) {
      const aborted = response.error.code === "aborted";
      for (const rest of jobs.slice(position + 1)) {
        onStatus(rest.id, { kind: "skipped", message: aborted ? "Stopped." : "Not sent: the run stopped." });
      }
      return { flights, warnings, succeeded, requests, stoppedBecause: aborted ? null : response.error.message };
    }
  }

  return { flights, warnings, succeeded, requests, stoppedBecause: null };
}

/**
 * Turns a finished run into a saved result, or explains why there is none.
 * Flights are filed under the routes of `query`; the rest are reported.
 */
export function finishRun(
  query: SearchQuery,
  outcome: SequenceOutcome,
):
  | { entry: StoredSearch; records: FlightRecord[] }
  | { message: string; records: FlightRecord[] | null } {
  if (outcome.succeeded === 0) {
    return {
      message: outcome.stoppedBecause
        ? `Run stopped: ${outcome.stoppedBecause}`
        : "No request succeeded, so nothing was saved.",
      records: null,
    };
  }

  const { records, ignored } = recordsFromCurlFlights(query, outcome.flights);
  const warnings = [
    ...outcome.warnings,
    ...ignored.map((r) => `Ignored ${r.flights} flights on ${r.route}: not a route of this search.`),
  ];
  if (outcome.stoppedBecause) warnings.unshift(`The run stopped early: ${outcome.stoppedBecause}`);

  if (records.every((record) => record.flights.length === 0)) {
    return {
      message:
        "None of the flights match a route of the current search. Check the destinations, departures and dates above.",
      records,
    };
  }

  const entry = runCurlSearch(
    query,
    loadFilters(),
    loadPreferences().ranking,
    records,
    warnings,
    outcome.requests,
  );
  return { entry, records };
}
