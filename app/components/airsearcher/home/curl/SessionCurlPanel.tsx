"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useApp } from "@/framework/ui/context/AppContext";
import { colorRed, colorSecondary, grayLight, grayMid, radius } from "@/config/theme";
import {
  CURL_JITTER_MS,
  CURL_MAX_PER_RUN,
  CURL_MIN_INTERVAL_MS,
} from "@/lib/airsearcher/config/curl";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import { destinationsOf, type SearchQuery } from "@/lib/airsearcher/types";
import InfoHint from "../../common/InfoHint";
import { dateError } from "../DateField";
import { curlTextareaClass, RunStatus } from "./CurlRow";
import { useSessionRun } from "./useSessionRun";

/** What stops the top inputs from making a search — same rules as SearchPanel. */
function inputsError(query: SearchQuery): string | null {
  const destinations = destinationsOf(query);
  return (
    dateError(query) ??
    (destinations.length === 0 || destinations.some((place) => place.airports.length === 0)
      ? "Choose a destination above"
      : null) ??
    (query.origins.every((o) => o.passengers === 0) ? "Add at least one passenger above" : null)
  );
}

const SESSION_HELP =
  "Open any Google Flights search with DevTools on the Network tab, right-click the newest GetShoppingResults request → Copy Value → Copy as cURL, and paste it here. Every search this trip needs is built from the inputs above and sent one at a time, at least 10 s apart. The cURL is never saved.";

/** "1:05" — minutes and seconds. */
function clockOf(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Time since the run started, ticking while it runs and frozen once it ends. */
function Elapsed({ startedAt, finishedAt }: { startedAt: number; finishedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (finishedAt !== null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [finishedAt]);
  const ms = (finishedAt ?? now) - startedAt;
  return (
    <Text
      size="very small"
      icon="clock"
      value={`${finishedAt === null ? "Elapsed" : "Took"} ${clockOf(ms)}`}
      className="tabular-nums text-gray-600"
    />
  );
}

/** Row background by status: finished rows stand out, failed ones in red. */
function rowTone(kind: string | undefined): string {
  if (kind === "done") return "bg-green-50";
  if (kind === "failed") return "bg-red-50";
  if (kind === "running" || kind === "pending") return grayLight.bg;
  return "";
}

/** "~2 min" for n requests: the first goes at once, each next one after the gap. */
function durationOf(requests: number): string {
  const seconds = Math.max(0, requests - 1) * ((CURL_MIN_INTERVAL_MS + CURL_JITTER_MS / 2) / 1000);
  return seconds < 60 ? `~${Math.max(5, Math.round(seconds))} s` : `~${Math.ceil(seconds / 60)} min`;
}

/**
 * One cURL used only as a Google session. The searches themselves — airports,
 * dates, direction, date range — are built from the top inputs, so the cURL
 * can come from any Google Flights search. Each is sent once, as the full
 * "View more flights" list, without the cURL's cookies.
 */
export default function SessionCurlPanel({
  query,
  disabled,
  onRunningChange,
  onFinished,
}: {
  query: SearchQuery;
  /** True while another search or run is in progress. */
  disabled: boolean;
  onRunningChange: (running: boolean) => void;
  onFinished: (entry: StoredSearch) => void;
}) {
  const session = useSessionRun(query, onFinished);
  const { openModal, closeModal } = useApp();
  const listRef = useRef<HTMLUListElement | null>(null);

  // Keep the request being worked on in view: when one finishes, scroll the
  // list to the next one still to go.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !session.running) return;
    const next = session.jobs.findIndex((_, index) => {
      const kind = session.statuses.get(index)?.kind;
      return kind === undefined || kind === "idle" || kind === "pending" || kind === "running";
    });
    const row = next === -1 ? null : (list.children[next] as HTMLElement | undefined);
    if (row) list.scrollTo({ top: Math.max(0, row.offsetTop - list.clientHeight / 3), behavior: "smooth" });
  }, [session.statuses, session.running, session.jobs]);

  useEffect(() => {
    onRunningChange(session.running);
  }, [session.running, onRunningChange]);

  const inputs = inputsError(query);
  const count = session.jobs.length;
  const blocked =
    session.check.kind === "invalid"
      ? session.check.message
      : session.check.kind === "empty"
        ? null
        : inputs ??
          (session.tooMany
            ? `This trip needs ${count} requests; the limit is ${CURL_MAX_PER_RUN}. Narrow the date range.`
            : null);

  const start = () => {
    if (count <= 1) return void session.run();
    openModal(
      <div className="flex flex-col gap-4">
        <Text
          size="small"
          value={`This search will send ${count} requests to Google Flights, one at a time, taking ${durationOf(count)}.`}
          className="text-gray-700"
        />
        <div className="flex flex-col gap-1">
          {(["outbound", "return"] as const).map((direction) => {
            const n = session.jobs.filter((job) => job.direction === direction).length;
            return n === 0 ? null : (
              <div key={direction} className="flex items-center justify-between gap-4">
                <Text
                  size="very small"
                  value={direction === "outbound" ? "Combined outbound searches" : "Combined return searches"}
                  className="text-gray-500"
                />
                <Text size="very small" value={n} className="tabular-nums text-gray-700" />
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button styleType="tertiary" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            styleType="primary"
            onClick={() => {
              closeModal();
              void session.run();
            }}
          >
            Search anyway
          </Button>
        </div>
      </div>,
      "Confirm Google requests",
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={`flex flex-col gap-2 ${grayLight.bg} ${radius} p-3`}>
        <div className="flex items-center gap-1">
          <Text size="small" value="Session cURL" className="font-medium text-gray-800" />
          <InfoHint text={SESSION_HELP} label="How to copy the session cURL" />
        </div>
        <textarea
          value={session.text}
          onChange={(event) => session.edit(event.target.value)}
          readOnly={session.running}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste any Google Flights GetShoppingResults request copied as cURL."
          aria-label="Session cURL"
          className={curlTextareaClass(session.check.kind === "invalid", session.running)}
        />
        {session.check.kind === "empty" && (
          <Text
            size="very small"
            value="Any search works — airports, dates and passengers come from the inputs above. Its cookies are removed, so the searches are sent without your Google login."
            className="text-gray-400"
          />
        )}
        {blocked && <Text size="very small" icon="alert" value={blocked} className={colorRed.text} />}
        {session.check.kind === "valid" && !blocked && (
          <Text
            size="very small"
            icon="check"
            value={`Session ready · this trip needs ${count} Google request${count === 1 ? "" : "s"} (${durationOf(count)})`}
            className="text-gray-700"
          />
        )}
      </div>

      {count > 0 && !session.tooMany && (
        <div className="flex flex-col gap-1.5">
          {session.startedAt !== null && (
            <Elapsed startedAt={session.startedAt} finishedAt={session.finishedAt} />
          )}
          <ul
            ref={listRef}
            className={`relative flex max-h-72 flex-col gap-0.5 overflow-y-auto border ${grayMid.border} ${radius} bg-white p-1`}
          >
            {session.jobs.map((job, index) => {
              const status = session.statuses.get(index);
              return (
                <li
                  key={job.label}
                  className={`flex flex-wrap items-center justify-between gap-2 ${radius} px-2 py-1 transition-colors ${rowTone(status?.kind)}`}
                >
                  <Text size="very small" value={job.label} className="text-gray-700" />
                  {status && status.kind !== "idle" ? (
                    <RunStatus status={status} />
                  ) : (
                    <Text size="very small" value="—" className="text-gray-400" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {session.message && (
        <Text size="small" icon="info" value={session.message} className={colorSecondary.text} />
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {session.running && (
          <Button styleType="secondary" onClick={session.stop}>
            <Text size="small" icon="close" value="Stop" />
          </Button>
        )}
        <Button
          styleType="primary"
          disabled={session.running || disabled || session.check.kind !== "valid" || blocked !== null}
          onClick={start}
        >
          <Text size="small" icon="search" value={session.running ? "Searching…" : "Search with Google"} />
        </Button>
      </div>
    </div>
  );
}
