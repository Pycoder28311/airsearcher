"use client";

import { useMemo, useRef, useState } from "react";
import { CURL_MAX_PER_RUN } from "@/lib/airsearcher/config/curl";
import { waitForCollected } from "@/lib/airsearcher/collect/api";
import { cancelSearchTabs, onSearchTabEnded, openSearchTabs } from "@/lib/airsearcher/collect/openTabs"; // tab opener
import { sessionRequestsFor, type GeneratedJob } from "@/lib/airsearcher/curl/generated";
import { missingJobs, searchedIds, sentIds, type SearchExtension } from "@/lib/airsearcher/extend";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import type { FlightRecord, SearchQuery } from "@/lib/airsearcher/types";
import { finishRun, runSequence, type RowStatus } from "./curlRunner";

/**
 * The collect mode: the same searches as `useSessionRun`, but nothing is sent
 * to Google. The user opens each search's link in their own browser and clicks
 * "View more flights"; the collector extension passes the answer to the app,
 * and each row finishes when its answer arrives. The rest of the run — the row
 * statuses, merging into a saved search, saving — is shared with the other mode.
 */
export function useCollectRun(
  query: SearchQuery,
  onFinished: (entry: StoredSearch) => void,
  extension?: SearchExtension,
  /** tab opener: click "View more flights" in each tab and use the full list, instead of the first page only. */
  fullList = false,
) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Map<number, RowStatus>>(new Map());
  const [lastRecords, setLastRecords] = useState<FlightRecord[] | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  /** Rows whose first page has arrived while the full list has not. */
  const [firstReceived, setFirstReceived] = useState<Set<number>>(new Set());
  /** Rows the user chose to finish with only their first page. */
  const accepted = useRef<Set<number>>(new Set());
  /** tab opener: set when the extension opens the tabs, which collects each search's first page. */
  const firstPageOnly = useRef(false);
  /** tab opener: the extension is opening the tabs, so a first page without more is settled without asking. */
  const [viaExtension, setViaExtension] = useState(false);
  /** tab opener: rows whose tab was closed or got no answer. */
  const failedTabs = useRef<Set<number>>(new Set());
  const controller = useRef<AbortController | null>(null);

  const jobs: GeneratedJob[] = useMemo(
    () => (extension ? missingJobs(query, searchedIds(extension.records)) : sessionRequestsFor(query)),
    [query, extension],
  );
  const tooMany = jobs.length > CURL_MAX_PER_RUN;

  const stop = () => {
    cancelSearchTabs(); // tab opener
    controller.current?.abort();
  };

  /** Finishes a row with its first page, for a search that has no "View more flights". */
  const acceptFirst = (index: number) => {
    accepted.current.add(index);
  };

  const run = async () => {
    if (running || jobs.length === 0 || tooMany) return;
    setMessage(null);
    setStatuses(new Map());
    setFirstReceived(new Set());
    accepted.current = new Set();
    firstPageOnly.current = false; // tab opener
    setViaExtension(false); // tab opener
    failedTabs.current = new Set(); // tab opener

    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setStartedAt(Date.now());
    setFinishedAt(null);
    // The jobs are fixed for the run, even if the inputs change.
    const runQuery = query;

    // tab opener: the extension opens each search's page, collects it and closes it.
    const stopListening = onSearchTabEnded((type, index) => {
      if (type === "tab-failed") failedTabs.current.add(index);
      else accepted.current.add(index); // no more than the first page came: take it
    });
    const tabsOpening = openSearchTabs(jobs, fullList);

    try {
      if (await tabsOpening) {
        setViaExtension(true);
        firstPageOnly.current = !fullList;
      } else {
        setMessage("The collector extension didn't answer, so the searches aren't opening by themselves. Open each link yourself.");
      }
      const outcome = await runSequence(
        jobs.map((job, index) => ({
          id: index,
          label: job.label,
          // No wait and no retry: the user sets the pace, and nothing is refused.
          send: (signal: AbortSignal) =>
            waitForCollected(job.search, signal, {
              acceptFirst: () => firstPageOnly.current || accepted.current.has(index),
              onFirst: () => setFirstReceived((current) => (current.has(index) ? current : new Set(current).add(index))),
              failed: () => (failedTabs.current.has(index) ? "The tab was closed or Google didn't answer in time." : null), // tab opener
            }),
          delayMs: 0,
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
      stopListening(); // tab opener
      cancelSearchTabs(); // tab opener
      controller.current = null;
      setRunning(false);
      setFinishedAt(Date.now());
    }
  };

  return {
    jobs,
    pauses: 0,
    totalMs: 0,
    tooMany,
    statuses,
    running,
    message,
    lastRecords,
    startedAt,
    finishedAt,
    firstReceived,
    viaExtension,
    acceptFirst,
    run,
    stop,
  };
}
