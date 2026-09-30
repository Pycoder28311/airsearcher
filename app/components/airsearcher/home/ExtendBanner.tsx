"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, colorSecondary, radius } from "@/config/theme";
import { sessionRequestsFor } from "@/lib/airsearcher/curl/generated";
import { missingJobs, searchedIds, type SearchExtension } from "@/lib/airsearcher/extend";
import { describeTripLength } from "@/lib/airsearcher/queryPlan";
import { formatDate } from "@/lib/airsearcher/time";
import type { SearchQuery } from "@/lib/airsearcher/types";

/**
 * Above the search while it adds dates or trip lengths to a saved search: what
 * is added, how many searches that takes, and how many saved ones are reused.
 * The run itself is started with the usual button below; when nothing new is
 * needed, the search is updated from its saved flights instead.
 */
export default function ExtendBanner({
  extension,
  query,
  onCancel,
  onUpdateFromSaved,
}: {
  extension: SearchExtension;
  query: SearchQuery;
  onCancel: () => void;
  /** Rebuilds the saved search from its own flights, when nothing new is needed. */
  onUpdateFromSaved: () => void;
}) {
  const needed = missingJobs(query, searchedIds(extension.records)).length;
  const reused = sessionRequestsFor(query).length - needed;
  const range = query.dateRange;

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${border} ${radius} bg-orange-50 px-4 py-3`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text
          size="small"
          value={`Adding to “${extension.entry.label}”`}
          className={`font-semibold ${colorSecondary.text}`}
        />
        <Text
          size="very small"
          value={`${range ? `${formatDate(range.start)} – ${formatDate(range.end)}` : ""}${
            describeTripLength(query) ? ` · ${describeTripLength(query)}` : ""
          } · ${
            needed === 0
              ? "nothing new to search: the flights already found cover it"
              : `${needed} new search${needed === 1 ? "" : "es"}, ${reused} already done reused. Press Run below; the new flights are added to that search`
          }.`}
          className="text-gray-600"
        />
      </div>
      {needed === 0 && (
        <Button styleType="primary" onClick={onUpdateFromSaved}>
          <Text size="small" value="Update from saved flights" />
        </Button>
      )}
      <Button styleType="tertiary" onClick={onCancel}>
        <Text size="small" icon="close" value="Cancel" />
      </Button>
    </div>
  );
}
