"use client";

import { useEffect, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { colorSecondary, grayMid } from "@/config/theme";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import type { SearchQuery } from "@/lib/airsearcher/types";
import CurlCoverage from "./CurlCoverage";
import CurlRow from "./CurlRow";
import SearchLinks from "./SearchLinks";
import SessionCurlPanel from "./SessionCurlPanel";
import { useCurlRun } from "./useCurlRun";

/**
 * The per-search manual flow (open each link, paste each cURL). Hidden: the
 * one-session-cURL flow above replaces it. Its code and hooks are kept.
 */
const SHOW_MANUAL = false;

/**
 * Google Flights searches through the user's own browser.
 *
 * Main: one pasted cURL; every search the trip needs is built from the inputs
 * above and sent without its cookies, which Google accepts for a changed
 * search (it refuses the same change signed in).
 *
 * Manual, folded: open each search (links built from the inputs), paste each
 * one's cURL, and the app sends them unchanged.
 * Nothing here is saved — the cURLs hold the user's Google session.
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

  return (
    // Sits inside the search card, under the search inputs; the instructions
    // live behind the info icon next to "Session cURL".
    <div className={`flex flex-col gap-4 border-t ${grayMid.border} pt-4`}>
      <div className="flex flex-col gap-3">
        <SessionCurlPanel
          query={query}
          disabled={disabled || curl.running}
          onRunningChange={setSessionRunning}
          onFinished={onFinished}
        />
      </div>

      {SHOW_MANUAL && (
      <details className={`border-t ${grayMid.border} pt-3`}>
        <summary className="cursor-pointer">
          <Text size="small" value="Manual: open and paste each search" className="font-medium text-gray-700" />
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Text size="small" value="1. Open each search" className="font-medium text-gray-800" />
            <Text
              size="very small"
              value="Each link opens one search in Google Flights. Keep DevTools open on the Network tab, filtered to GetShoppingResults."
              className="text-gray-500"
            />
            <SearchLinks query={query} />
          </div>

          <div className={`flex flex-col gap-4 border-t ${grayMid.border} pt-4`}>
            <div className="flex flex-col gap-1">
              <Text size="small" value="2. Paste each search's cURL" className="font-medium text-gray-800" />
              <Text
                size="very small"
                value="In DevTools, right-click the newest GetShoppingResults request → Copy Value → Copy as cURL, and paste it in a box below. These are sent unchanged, with their cookies."
                className="text-gray-500"
              />
            </div>

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
        </div>
      </details>
      )}
    </div>
  );
}
