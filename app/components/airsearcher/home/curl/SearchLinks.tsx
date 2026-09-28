"use client";

import { useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, grayMid, radius } from "@/config/theme";
import { generatedJobsFor } from "@/lib/airsearcher/curl/generated";
import { airports, googleFlightsSearchUrl } from "@/lib/airsearcher/curl/googleLink";
import type { SearchQuery } from "@/lib/airsearcher/types";

/** How long the "Copied" confirmation stays on a row. */
const COPIED_MS = 2000;

/**
 * Puts text on the clipboard. The Clipboard API needs a secure page, which
 * localhost is; where it's unavailable, the text is shown to copy by hand.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy the link:", text);
    return false;
  }
}

/**
 * The Google Flights searches the trip above needs, each with a link that
 * opens exactly that search: one-way, 1 adult, economy, the batch's airports
 * and date. Opening one runs it in the user's own browser, which is the only
 * way Google reliably accepts a search.
 */
export default function SearchLinks({ query }: { query: SearchQuery }) {
  const [copied, setCopied] = useState<string | null>(null);
  const jobs = generatedJobsFor(query);

  if (jobs.length === 0) {
    return (
      <Text
        size="very small"
        value="Choose a destination, departures and dates above to see the searches to open."
        className="text-gray-500"
      />
    );
  }

  const copy = async (label: string, url: string) => {
    if (!(await copyText(url))) return;
    setCopied(label);
    setTimeout(() => setCopied((current) => (current === label ? null : current)), COPIED_MS);
  };

  return (
    <ol className={`flex flex-col ${border} ${radius} bg-white`}>
      {jobs.map((job, index) => {
        const url = googleFlightsSearchUrl({
          from: airports(job.search.from),
          to: airports(job.search.to),
          date: job.search.date,
        });
        return (
          <li
            key={job.label}
            className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${
              index > 0 ? `border-t ${grayMid.border}` : ""
            }`}
          >
            <Text size="very small" value={`${index + 1}. ${job.label}`} className="text-gray-700" />
            <div className="flex flex-wrap items-center gap-2">
              <Button styleType="tertiary" onClick={() => copy(job.label, url)}>
                {copied === job.label ? (
                  <Text size="very small" icon="check" value="Copied" />
                ) : (
                  <Text size="very small" value="Copy link" />
                )}
              </Button>
              <Button
                styleType="tertiary-bordered"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              >
                <Text size="very small" icon="arrow-right" iconPosition="right" value="Open in Google Flights" />
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
