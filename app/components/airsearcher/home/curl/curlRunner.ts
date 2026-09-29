"use client";

import { CURL_MIN_INTERVAL_MS } from "@/lib/airsearcher/config/curl";
import type { CurlRunResponse } from "@/lib/airsearcher/curl/api";
import type { CurlErrorInfo } from "@/lib/airsearcher/curl/errors";
import { recordsFromCurlFlights } from "@/lib/airsearcher/curl/records";
import { runCurlSearch } from "@/lib/airsearcher/search";
import {
  findSearchById,
  loadFilters,
  loadPreferences,
  type CurlRequestCount,
  type StoredSearch,
} from "@/lib/airsearcher/storage";
import type { FlightRecord, NormalizedFlight, SearchQuery } from "@/lib/airsearcher/types";

export type RowStatus =
  | { kind: "idle" }
  | {
      kind: "pending";
      expectedStart: number;
      /** A longer, planned pause. */
      pause?: boolean;
      /** Waiting to try again after Google refused the first try. */
      retry?: boolean;
    }
  | { kind: "running" }
  | { kind: "done"; flights: number; warnings: string[] }
  | { kind: "failed"; message: string }
  | { kind: "skipped"; message: string };

export interface SequenceJob<Id> {
  id: Id;
  /** "Row 2" or "ATH,SKG → LHR · 8 Oct · going", used in warnings. */
  label: string;
  send: (signal: AbortSignal) => Promise<CurlRunResponse>;
  /**
   * A planned wait before this job is sent, measured from when the previous
   * one finished. When set, it replaces the fixed CURL_MIN_INTERVAL_MS display.
   */
  delayMs?: number;
  /** Whether `delayMs` is one of the run's longer pauses. */
  pause?: boolean;
  /**
   * Whether a failed job gets one more try: how long to wait first, or null
   * for no retry. Asked at most once per job.
   */
  retryAfterMs?: (error: CurlErrorInfo) => number | null;
}

/** "Google refused this request (error [13,null,…])…" → "Google refused it (error 13)". */
function shortReason(error: CurlErrorInfo): string {
  const code = /error \[(\d+)/.exec(error.message)?.[1];
  return code ? `Google refused it (error ${code})` : error.message;
}

/** Waits `ms`, or less if the run is stopped; true when it was stopped. */
function waitUnlessStopped(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
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
    if (job.delayMs !== undefined && job.delayMs > 0) {
      // A planned wait: shown as a countdown, then the job goes.
      onStatus(job.id, { kind: "pending", expectedStart: Date.now() + job.delayMs, pause: job.pause });
      if (await waitUnlessStopped(job.delayMs, signal)) {
        for (const rest of jobs.slice(position)) onStatus(rest.id, { kind: "skipped", message: "Stopped." });
        return { flights, warnings, succeeded, requests, stoppedBecause: null };
      }
      onStatus(job.id, { kind: "running" });
    } else if (job.delayMs === undefined) {
      const expectedStart = lastFinishedAt === null ? Date.now() : lastFinishedAt + CURL_MIN_INTERVAL_MS;
      onStatus(job.id, expectedStart > Date.now() ? { kind: "pending", expectedStart } : { kind: "running" });
    } else {
      onStatus(job.id, { kind: "running" });
    }

    let response = await job.send(signal);
    lastFinishedAt = Date.now();

    // One more try after a wait, when the job asks for it. The first failure
    // is kept in the warnings either way, so the results say it happened.
    const retryMs = !response.ok && response.error.code !== "aborted" ? job.retryAfterMs?.(response.error) ?? null : null;
    if (!response.ok && retryMs !== null) {
      const first = shortReason(response.error);
      const seconds = Math.round(retryMs / 1000);
      onStatus(job.id, { kind: "pending", expectedStart: Date.now() + retryMs, retry: true });
      if (await waitUnlessStopped(retryMs, signal)) {
        warnings.push(`${job.label}: ${first}; the run was stopped before the retry.`);
        for (const rest of jobs.slice(position)) onStatus(rest.id, { kind: "skipped", message: "Stopped." });
        return { flights, warnings, succeeded, requests, stoppedBecause: null };
      }
      onStatus(job.id, { kind: "running" });
      response = await job.send(signal);
      lastFinishedAt = Date.now();
      warnings.push(
        response.ok
          ? `${job.label}: ${first}; it worked when retried ${seconds} s later.`
          : response.error.code === "aborted"
            ? `${job.label}: ${first}; the run was stopped during the retry.`
            : `${job.label}: ${first}; retried ${seconds} s later and failed again.`,
      );
    }

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
  // Never open a results page for a search that isn't stored.
  if (!findSearchById(entry.id)) {
    return {
      message: "The results couldn't be saved, so they can't be shown. Nothing was lost on Google's side; try the search again.",
      records,
    };
  }
  return { entry, records };
}
