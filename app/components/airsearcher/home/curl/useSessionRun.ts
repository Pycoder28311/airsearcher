"use client";

import { useMemo, useRef, useState } from "react";
import { CURL_MAX_PER_RUN } from "@/lib/airsearcher/config/curl";
import { requestCurlRun } from "@/lib/airsearcher/curl/api";
import { CurlError } from "@/lib/airsearcher/curl/errors";
import { sessionRequestsFor, type GeneratedJob } from "@/lib/airsearcher/curl/generated";
import { prepareCurl } from "@/lib/airsearcher/curl/validate";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import type { FlightRecord, SearchQuery } from "@/lib/airsearcher/types";
import { finishRun, runSequence, type RowStatus } from "./curlRunner";

/** The session cURL, checked without sending anything. */
export type SessionCheck =
  | { kind: "empty" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

function checkSession(text: string): SessionCheck {
  if (!text.trim()) return { kind: "empty" };
  try {
    prepareCurl(text, { mode: "template" });
    return { kind: "valid" };
  } catch (error) {
    return {
      kind: "invalid",
      message: error instanceof CurlError ? error.message : "This cURL couldn't be read.",
    };
  }
}

/**
 * The main mode: one pasted cURL used only as a session. Every search is built
 * from the top inputs — the same request batches SerpApi would use — and sent
 * one at a time, each as Google's full "View more flights" list. The cURL lives in React state only, never in storage.
 */
export function useSessionRun(query: SearchQuery, onFinished: (entry: StoredSearch) => void) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Map<number, RowStatus>>(new Map());
  const [lastRecords, setLastRecords] = useState<FlightRecord[] | null>(null);
  /** When the current or last run started and finished, for the elapsed time. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  const check = useMemo(() => checkSession(text), [text]);
  const jobs: GeneratedJob[] = useMemo(() => sessionRequestsFor(query), [query]);
  const tooMany = jobs.length > CURL_MAX_PER_RUN;

  const edit = (next: string) => {
    setText(next);
    setMessage(null);
    setStatuses(new Map());
  };

  const stop = () => controller.current?.abort();

  /** Runs every job. The caller has already confirmed the count. */
  const run = async () => {
    if (running || check.kind !== "valid" || jobs.length === 0 || tooMany) return;
    setMessage(null);
    setStatuses(new Map());

    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setStartedAt(Date.now());
    setFinishedAt(null);
    // The jobs and session are fixed for the run, even if the inputs change.
    const session = text;
    const runQuery = query;

    try {
      const outcome = await runSequence(
        jobs.map((job, index) => ({
          id: index,
          label: job.label,
          send: (signal: AbortSignal) => requestCurlRun(session, signal, { search: job.search, index }),
        })),
        abort.signal,
        (id, status) => setStatuses((current) => new Map(current).set(id, status)),
      );
      if (abort.signal.aborted) return setMessage("Stopped. No results were saved.");

      const result = finishRun(runQuery, outcome);
      setLastRecords(result.records);
      if ("entry" in result) onFinished(result.entry);
      else setMessage(result.message);
    } finally {
      controller.current = null;
      setRunning(false);
      setFinishedAt(Date.now());
    }
  };

  return {
    text,
    edit,
    check,
    jobs,
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
