"use client";

import { pacingConfig } from "@/config/pacingConfig";
import { useEffect, useRef, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import Input from "@/framework/ui/input/Input";
import { useApp } from "@/framework/ui/context/AppContext";
import { colorMain, colorSecondary, grayLight, grayMid, radius } from "@/config/theme";
import { CURL_MAX_PER_RUN } from "@/lib/airsearcher/config/curl";
import { airports, googleFlightsSearchUrl } from "@/lib/airsearcher/curl/googleLink";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import { destinationsOf, type SearchQuery } from "@/lib/airsearcher/types";
import InfoHint from "../../common/InfoHint";
import { dateError } from "../DateField";
import { RunStatus } from "./CurlRow";
import { useCollectRun } from "./useCollectRun";
import { useSessionRun } from "./useSessionRun";
import type { SearchExtension } from "@/lib/airsearcher/extend";

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

const { gap, pause, longBreak, retry } = pacingConfig;
const BROWSER_HELP = `Each search the trip needs is opened on Google Flights in a hidden browser on this computer, which clicks “View more flights” and reads the full list. Searches run one at a time, slowly and unevenly: ${gap.minSeconds}–${gap.maxSeconds} s apart at a pace that differs per run, with pauses of ${pause.minSeconds}–${pause.maxSeconds} s at random${
  longBreak.enabled
    ? ` and a break of ${longBreak.minSeconds}–${longBreak.maxSeconds} s every ${longBreak.everySearchesMin}–${longBreak.everySearchesMax} searches`
    : ""
}. A search Google refuses is tried again after ${retry.minSeconds}–${retry.maxSeconds} s; the run stops after ${retry.refusalsBeforeStop} refusals of the same search in a row. The browser is never signed in to Google.`;

const COLLECT_HELP =
  "Nothing is sent to Google by the app. The collector extension in your own browser opens each search in a tab, passes Google's answer to the app and closes the tab. By default it takes Google's first page and clicks nothing; with “Click View more flights in each tab” ticked it clicks that button and takes the full list. Without the extension, open each row's link (the arrow) yourself and click “View more flights”. Load the extension with npm run launch (see scripts/airsearcher/collector-extension/README.md).";

/** "1:05" — minutes and seconds. */
function clockOf(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The time line above the list: the planned total before a run, elapsed
 * against that total while it runs (ticking every second), and how long the
 * last run took once it ends.
 */
function RunTime({
  startedAt,
  finishedAt,
  running,
  totalMs,
  pauses,
}: {
  startedAt: number | null;
  finishedAt: number | null;
  running: boolean;
  totalMs: number;
  pauses: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const planned = `~${clockOf(totalMs)} total${pauses > 0 ? ` · ${pauses} longer pause${pauses === 1 ? "" : "s"}` : ""}`;
  const value =
    running && startedAt !== null
      ? `Elapsed ${clockOf(now - startedAt)} of ${planned}`
      : startedAt !== null && finishedAt !== null
        ? `Last run took ${clockOf(finishedAt - startedAt)} · next: ${planned}`
        : `Planned: ${planned}`;
  return <Text size="very small" icon="clock" value={value} className="tabular-nums text-gray-600" />;
}

/** Row background by status: finished rows stand out, failed ones in red. */
function rowTone(kind: string | undefined): string {
  if (kind === "done") return "bg-green-50";
  if (kind === "failed") return "bg-red-50";
  if (kind === "running" || kind === "pending") return grayLight.bg;
  return "";
}

/** "~45 s" or "~7 min" for a run's expected length. */
function durationOf(ms: number): string {
  const seconds = ms / 1000;
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
  extension,
}: {
  query: SearchQuery;
  /** True while another search or run is in progress. */
  disabled: boolean;
  onRunningChange: (running: boolean) => void;
  onFinished: (entry: StoredSearch) => void;
  /** Set when this run adds dates to a saved search. */
  extension?: SearchExtension;
}) {
  // Two ways to get each search's flights: the app's hidden browser asks Google,
  // or the user's own browser opens the search and the app only receives it.
  const [collectMode, setCollectMode] = useState(false);
  // Collect mode: click "View more flights" in each tab and use the full list (else the first page, no click).
  const [fullList, setFullList] = useState(false);
  const browserRun = useSessionRun(query, onFinished, extension);
  const collectRun = useCollectRun(query, onFinished, extension, fullList);
  const session = collectMode ? collectRun : browserRun;
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
    inputs ??
    (session.tooMany
      ? `This trip needs ${count} searches; the limit is ${CURL_MAX_PER_RUN}. Narrow the date range.`
      : null);

  const start = () => {
    if (collectMode || count <= 1) return void session.run();
    openModal(
      <div className="flex flex-col gap-4">
        <Text
          size="small"
          value={`This will run ${count} Google Flights searches, one at a time, taking ${durationOf(session.totalMs)}${
            session.pauses > 0 ? `, with ${session.pauses} longer pause${session.pauses === 1 ? "" : "s"}` : ""
          }.`}
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
      {/* "Google Flights" and what the trip needs on the left; the page's main action on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Text
              size="small"
              value={collectMode ? "Google Flights · from your browser" : "Google Flights"}
              className="font-medium text-gray-800"
            />
            <InfoHint
              text={collectMode ? COLLECT_HELP : BROWSER_HELP}
              label={collectMode ? "How the answers are collected" : "How Google Flights is searched"}
            />
          </div>
          {blocked ? (
            <Text size="very small" value={blocked} className="text-gray-500" />
          ) : (
            count > 0 && (
              <Text
                size="very small"
                value={
                  collectMode
                    ? `This trip needs ${count} search${count === 1 ? "" : "es"}: open each link, then click “View more flights”`
                    : `This trip needs ${count} search${count === 1 ? "" : "es"} (${durationOf(session.totalMs)})`
                }
                className="text-gray-500"
              />
            )
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button
            styleType="tertiary-bordered"
            disabled={session.running}
            onClick={() => setCollectMode((current) => !current)}
          >
            <Text size="very small" value={collectMode ? "Mode: my browser" : "Mode: hidden browser"} />
          </Button>
          {collectMode && (
            <label
              className={`flex h-9 items-center gap-2 ${radius} border px-3 select-none ${
                session.running ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              } ${fullList ? `${colorMain.border} bg-blue-50 text-blue-700` : "border-gray-300 text-gray-700"}`}
            >
              <Input
                type="checkbox"
                checked={fullList}
                disabled={session.running}
                onChange={() => setFullList((current) => !current)}
              />
              <Text size="very small" value="Click “View more flights” in each tab (full list)" />
            </label>
          )}
          <Button
            styleType="primary"
            disabled={session.running || disabled || count === 0 || blocked !== null}
            onClick={start}
            className="h-11 min-w-40 rounded-2xl! px-6!"
          >
            <Text
              size="medium"
              icon="search"
              value={
                collectMode
                  ? session.running ? "Collecting…" : "Start collecting"
                  : session.running ? "Searching…" : "Search"
              }
            />
          </Button>
          {session.running && (
            <Button styleType="secondary" onClick={session.stop} className="h-11 rounded-2xl! px-5!">
              <Text size="small" icon="close" value="Stop" />
            </Button>
          )}
        </div>
      </div>

      {count > 0 && !session.tooMany && (
        <div className="flex flex-col gap-1.5">
          {!collectMode && (
            <RunTime
              startedAt={session.startedAt}
              finishedAt={session.finishedAt}
              running={session.running}
              totalMs={session.totalMs}
              pauses={session.pauses}
            />
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
                  <div className="flex min-w-0 items-center gap-1">
                    <Text size="very small" value={job.label} className="text-gray-700" />
                    <Button
                      styleType="tertiary"
                      onClick={() =>
                        window.open(
                          googleFlightsSearchUrl({
                            from: airports(job.search.from),
                            to: airports(job.search.to),
                            date: job.search.date,
                          }),
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      className="h-6 w-6 shrink-0 p-0!"
                    >
                      <Text icon="external-link" size="very small" />
                      <span className="sr-only">Open {job.label} in Google Flights</span>
                    </Button>
                  </div>
                  {collectMode && status?.kind === "running" ? (
                    <div className="flex items-center gap-2">
                      <Text
                        size="very small"
                        icon="clock"
                        value={
                          collectRun.firstReceived.has(index)
                            ? collectRun.viaExtension
                              ? "First page received · waiting for the full list"
                              : "First page received · click “View more flights”"
                            : collectRun.viaExtension
                              ? "Waiting for the tab…"
                              : "Waiting for your browser…"
                        }
                        className={colorMain.text}
                      />
                      {collectRun.firstReceived.has(index) && !collectRun.viaExtension && (
                        <Button styleType="tertiary" onClick={() => collectRun.acceptFirst(index)}>
                          <Text size="very small" value="Use first page" />
                        </Button>
                      )}
                    </div>
                  ) : status && status.kind !== "idle" ? (
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

    </div>
  );
}
