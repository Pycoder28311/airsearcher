"use client";

import Text from "@/framework/ui/iconText/Text";
import type { StoredSearch } from "@/lib/airsearcher/storage";
import SearchHistoryCard from "./SearchHistoryCard";

/**
 * Previous searches, below the main inputs as the Penpot board places them.
 * Opening one goes to its stored results.
 */
export default function SearchHistoryList({
  entries,
  now,
  onOpen,
  onRemove,
}: {
  entries: StoredSearch[];
  now: number;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <Text size="medium" value="History" className="font-semibold text-gray-900" />

      {entries.length === 0 ? (
        <Text
          size="small"
          value="Nothing searched yet. Your past searches will appear here and can be reopened without spending another SerpApi request."
          className="max-w-prose text-gray-400"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <SearchHistoryCard
              key={entry.id}
              entry={entry}
              now={now}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </section>
  );
}
