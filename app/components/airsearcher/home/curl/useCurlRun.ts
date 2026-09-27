"use client";

import { useMemo, useRef, useState } from "react";
import { CURL_MAX_PER_RUN } from "@/lib/airsearcher/config/curl";
import { requestCurlRun } from "@/lib/airsearcher/curl/api";
import { CurlError } from "@/lib/airsearcher/curl/errors";
import { describeSearch } from "@/lib/airsearcher/curl/freq";
import { prepareCurl, type PreparedCurl } from "@/lib/airsearcher/curl/validate";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import type { FlightRecord, SearchQuery } from "@/lib/airsearcher/types";
import { finishRun, runSequence, type RowStatus } from "./curlRunner";

export type { RowStatus } from "./curlRunner";

export interface CurlRowState {
  id: number;
  text: string;
  status: RowStatus;
}

/** A row's text, checked without sending anything. */
export type RowCheck =
  | { kind: "empty" }
  | { kind: "valid"; prepared: PreparedCurl; label: string }
  | { kind: "invalid"; message: string };

function checkRow(text: string): RowCheck {
  if (!text.trim()) return { kind: "empty" };
  try {
    const prepared = prepareCurl(text);
    return {
      kind: "valid",
      prepared,
      label: prepared.search ? describeSearch(prepared.search) : "Search couldn't be read",
    };
  } catch (error) {
    return {
      kind: "invalid",
      message: error instanceof CurlError ? error.message : "This cURL couldn't be read.",
    };
  }
}

/**
 * The fallback mode: one pasted cURL per search, each run exactly as copied.
 *
 * Rows live in React state only — never in browser storage, because they hold
 * the user's Google session.
 */
export function useCurlRun(query: SearchQuery, onFinished: (entry: StoredSearch) => void) {
  const nextId = useRef(1);
  const [rows, setRows] = useState<CurlRowState[]>(() => [
    { id: 0, text: "", status: { kind: "idle" } },
  ]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRecords, setLastRecords] = useState<FlightRecord[] | null>(null);
  const controller = useRef<AbortController | null>(null);

  const checks = useMemo(() => new Map(rows.map((row) => [row.id, checkRow(row.text)])), [rows]);

  const setStatus = (id: number, status: RowStatus) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));

  const addRow = () =>
    setRows((current) => [...current, { id: nextId.current++, text: "", status: { kind: "idle" } }]);

  const removeRow = (id: number) =>
    setRows((current) =>
      current.length === 1
        ? [{ ...current[0], text: "", status: { kind: "idle" } }]
        : current.filter((row) => row.id !== id),
    );

  const editRow = (id: number, text: string) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, text, status: { kind: "idle" } } : row)),
    );

  const stop = () => controller.current?.abort();

  const run = async () => {
    if (running) return;
    setMessage(null);

    const filled = rows.filter((row) => checks.get(row.id)?.kind !== "empty");
    if (filled.length === 0) return setMessage("Paste at least one cURL first.");
    if (filled.some((row) => checks.get(row.id)?.kind === "invalid")) {
      return setMessage("Fix or remove the rows marked in red first. Nothing was sent.");
    }
    if (filled.length > CURL_MAX_PER_RUN) {
      return setMessage(`At most ${CURL_MAX_PER_RUN} cURLs per run. Nothing was sent.`);
    }

    // The same search pasted twice is sent once.
    const seen = new Map<string, number>();
    const toSend: CurlRowState[] = [];
    for (const [index, row] of filled.entries()) {
      const check = checks.get(row.id);
      if (check?.kind !== "valid") continue;
      const first = seen.get(check.prepared.fingerprint);
      if (first !== undefined) {
        setStatus(row.id, { kind: "skipped", message: `Same search as row ${first + 1}; sent once.` });
        continue;
      }
      seen.set(check.prepared.fingerprint, index);
      toSend.push(row);
    }

    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    for (const row of toSend) setStatus(row.id, { kind: "idle" });

    try {
      const outcome = await runSequence(
        toSend.map((row) => ({
          id: row.id,
          label: `Row ${rows.indexOf(row) + 1}`,
          send: (signal: AbortSignal) => requestCurlRun(row.text, signal),
        })),
        abort.signal,
        setStatus,
      );
      if (abort.signal.aborted) return setMessage("Stopped. No results were saved.");

      const result = finishRun(query, outcome);
      setLastRecords(result.records);
      if ("entry" in result) onFinished(result.entry);
      else setMessage(result.message);
    } finally {
      controller.current = null;
      setRunning(false);
    }
  };

  return { rows, checks, running, message, lastRecords, addRow, removeRow, editRow, run, stop };
}
