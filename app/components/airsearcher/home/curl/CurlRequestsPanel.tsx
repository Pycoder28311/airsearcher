"use client";

import { useEffect, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, colorSecondary, grayMid, radiusBig, shadow } from "@/config/theme";
import { CURL_MIN_INTERVAL_MS } from "@/lib/airsearcher/config/curl";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import type { SearchQuery } from "@/lib/airsearcher/types";
import CurlCoverage from "./CurlCoverage";
import CurlRow from "./CurlRow";
import SessionCurlPanel from "./SessionCurlPanel";
import { useCurlRun } from "./useCurlRun";

/**
 * Google Flights searches through pasted cURLs, run one at a time by the local
 * server.
 *
 * Main mode: one "session" cURL, with every search built from the inputs
 * above. Fallback: paste each search yourself and it runs exactly as copied.
 * Either way the flights are matched to the routes of the search above and
 * ranked by the same pipeline as every other source. Nothing here is saved:
 * the cURLs hold the user's Google session.
 */
export default function CurlRequestsPanel({
  query,
  disabled,
  onRunningChange,
  onFinished,
}: {
  query: SearchQuery;
  /** True while the main search is running. */
  disabled: boolean;
  onRunningChange: (running: boolean) => void;
  onFinished: (entry: StoredSearch) => void;
}) {
  const curl = useCurlRun(query, onFinished);
  const [sessionRunning, setSessionRunning] = useState(false);
  const busy = curl.running || sessionRunning;

  useEffect(() => {
    onRunningChange(busy);
  }, [busy, onRunningChange]);

  const seconds = Math.round(CURL_MIN_INTERVAL_MS / 1000);

  return (
    <section className={`flex flex-col gap-4 bg-white ${border} ${radiusBig} ${shadow} p-4 sm:p-5`}>
      <header className="flex flex-col gap-1">
        <Text size="medium" value="Google Flights cURLs" className="font-semibold text-gray-900" />
        <Text
          size="small"
          value={`Search Google Flights with your own browser session. Requests run one at a time, at least ${seconds} s apart. Pasted cURLs are never saved — they contain your Google session.`}
          className="max-w-prose text-gray-500"
        />
      </header>

      <SessionCurlPanel
        query={query}
        disabled={disabled || curl.running}
        onRunningChange={setSessionRunning}
        onFinished={onFinished}
      />

      <details className={`flex flex-col gap-3 border-t ${grayMid.border} pt-3`}>
        <summary className="cursor-pointer">
          <Text size="small" value="Or paste each one-way search yourself" className="font-medium text-gray-700" />
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <CurlCoverage query={query} records={curl.lastRecords} />

          <div className="flex flex-col gap-3">
            {curl.rows.map((row, index) => (
              <CurlRow
                key={row.id}
                row={row}
                index={index}
                check={curl.checks.get(row.id)}
                locked={curl.running}
                onChange={(text) => curl.editRow(row.id, text)}
                onRemove={() => curl.removeRow(row.id)}
              />
            ))}
          </div>

          {curl.message && (
            <Text size="small" icon="info" value={curl.message} className={colorSecondary.text} />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button styleType="tertiary-bordered" disabled={busy} onClick={curl.addRow}>
              <Text size="small" icon="plus" value="Add cURL" />
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {curl.running && (
                <Button styleType="secondary" onClick={curl.stop}>
                  <Text size="small" icon="close" value="Stop" />
                </Button>
              )}
              <Button styleType="primary" disabled={busy || disabled} onClick={curl.run}>
                <Text size="small" icon="search" value={curl.running ? "Running…" : "Run cURLs"} />
              </Button>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
