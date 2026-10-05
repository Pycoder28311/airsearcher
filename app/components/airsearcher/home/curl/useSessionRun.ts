"use client";

import { useMemo, useRef, useState } from "react";
import { BROWSER_SEARCH_ESTIMATE_MS } from "@/lib/airsearcher/config/browser";
import { CURL_MAX_PER_RUN } from "@/lib/airsearcher/config/curl";
import { requestBrowserRun } from "@/lib/airsearcher/browser/api";
import { sessionRequestsFor, type GeneratedJob } from "@/lib/airsearcher/curl/generated";
import { planSchedule, retryDelayMs, scheduleTotalMs, type RunSchedule } from "@/lib/airsearcher/pacing";
import { PACING_RETRIES } from "@/lib/airsearcher/config/pacing";
import { missingJobs, searchedIds, sentIds, type SearchExtension } from "@/lib/airsearcher/extend";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import type { FlightRecord, SearchQuery } from "@/lib/airsearcher/types";
import { finishRun, runSequence, type RowStatus } from "./curlRunner";

/**
 * The main mode: every search the trip needs is built from the top inputs —
 * the same request batches SerpApi would use — and run one at a time in the
 * server's hidden browser, which opens the search on Google Flights and reads
 * its full "View more flights" list. No cURL is needed.
 *
 * With an `extension`, only the searches the saved search lacks are sent, and
 * the new flights are merged into it (see `extend.ts`).
 */
export function useSessionRun(
  query: SearchQuery,
  onFinished: (entry: StoredSearch) => void,
  extension?: SearchExtension,
) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Map<number, RowStatus>>(new Map());
  const [lastRecords, setLastRecords] = useState<FlightRecord[] | null>(null);
  /** When the current or last run started and finished, for the elapsed time. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  const jobs: GeneratedJob[] = useMemo(
    () => (extension ? missingJobs(query, searchedIds(extension.records)) : sessionRequestsFor(query)),
    [query, extension],
  );
  const tooMany = jobs.length > CURL_MAX_PER_RUN;

  // The run's waits are drawn ahead, so the total time can be shown before it
  // starts. A new draw whenever the number of searches changes, and after
  // every run, so no two runs are paced alike.
  const [plan, setPlan] = useState<{ count: number; schedule: RunSchedule }>(() => ({
    count: jobs.length,
    schedule: planSchedule(jobs.length),
  }));
  if (plan.count !== jobs.length && !running) {
    setPlan({ count: jobs.length, schedule: planSchedule(jobs.length) });
  }
  const schedule = plan.schedule;
  const totalMs = scheduleTotalMs(schedule, BROWSER_SEARCH_ESTIMATE_MS);

  const stop = () => controller.current?.abort();

  /** Runs every job. The caller has already confirmed the count. */
  const run = async () => {
    if (running || jobs.length === 0 || tooMany) return;
    setMessage(null);
    setStatuses(new Map());

    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setStartedAt(Date.now());
    setFinishedAt(null);
    // The jobs are fixed for the run, even if the inputs change.
    const runQuery = query;

    try {
      const outcome = await runSequence(
        jobs.map((job, index) => ({
          id: index,
          label: job.label,
          send: (signal: AbortSignal) => requestBrowserRun(job.search, index, signal),
          delayMs: schedule.delaysMs[index] ?? 0,
          pause: schedule.pauseAt.has(index),
          // Google refusing its own page's request (error 13) is often
          // passing: try that search again after a random wait, as many
          // times as the pacing config allows before the run stops.
          retryAfterMs: (error) => (error.code === "session_expired" ? retryDelayMs() : null),
          maxRetries: PACING_RETRIES,
        })),
        abort.signal,
        (id, status) => setStatuses((current) => new Map(current).set(id, status)),
      );
      if (abort.signal.aborted) return setMessage("Stopped. No results were saved.");

      const result = finishRun(
        runQuery,
        outcome,
        extension && { ...extension, sent: sentIds(runQuery, jobs) },
      );
      setLastRecords(result.records);
      if ("entry" in result) onFinished(result.entry);
      else setMessage(result.message);
    } finally {
      controller.current = null;
      setRunning(false);
      setFinishedAt(Date.now());
      setPlan({ count: jobs.length, schedule: planSchedule(jobs.length) });
    }
  };

  return {
    jobs,
    /** How many longer pauses this run has, and its expected total length. */
    pauses: schedule.pauseAt.size,
    totalMs,
    tooMany,
    statuses,
    running,
    message,
    lastRecords,
    startedAt,
    finishedAt,
    run,
    stop,
  };
}
