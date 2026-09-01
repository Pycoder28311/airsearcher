"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import {
  border,
  colorSecondary,
  grayLight,
  radiusBig,
  shadow,
} from "@/config/theme";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { formatAge, formatDate } from "@/lib/airsearcher/time";
import { isStale, type StoredSearch } from "@/lib/airsearcher/storage";
import { cityById } from "@/data/places";

/**
 * One past search, matching the Penpot history card: destination, dates, the
 * filters that were applied, the result count, and an "outdated" flag when the
 * results are older than the reusable window.
 */
export default function SearchHistoryCard({
  entry,
  now,
  onOpen,
  onRemove,
}: {
  entry: StoredSearch;
  /** Passed in so every card ages against the same instant. */
  now: number;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const stale = isStale(entry, now);
  const city = cityById(entry.query.destination.cityId);

  const dates =
    entry.query.dateMode === "exact"
      ? `${formatDate(entry.query.departureDate)}${
          entry.query.returnDate ? ` – ${formatDate(entry.query.returnDate)}` : ""
        }`
      : `${formatDate(entry.query.dateRange?.start ?? null)} – ${formatDate(
          entry.query.dateRange?.end ?? null,
        )}`;

  const origins = entry.query.origins
    .filter((o) => o.passengers > 0)
    .map((o) => `${o.airport} ${o.passengers}`)
    .join(" · ");

  const cheapest =
    entry.arrangements.length > 0
      ? Math.min(...entry.arrangements.map((a) => a.totals.totalPrice))
      : null;

  return (
    <article
      className={`flex flex-col gap-2 bg-white ${border} ${radiusBig} ${shadow} p-4 ${grayLight.bgHover}`}
    >
      <Text
        size="big"
        value={city?.name ?? entry.query.destination.cityId}
        className="font-semibold text-gray-900"
      />
      <Text size="medium" value={dates} className="text-gray-800" />

      <Text
        size="very small"
        value={origins || "No departures set"}
        className={colorSecondary.text}
      />
      <Text
        size="very small"
        value={`${entry.arrangements.length} result${
          entry.arrangements.length === 1 ? "" : "s"
        }${cheapest !== null ? ` · from ${cheapest} ${CURRENCY}` : ""}`}
        className="text-gray-500"
      />

      <Text
        size="very small"
        value={stale ? `Outdated · ${formatAge(entry.savedAt, now)}` : formatAge(entry.savedAt, now)}
        className={stale ? colorSecondary.text : "text-gray-400"}
      />

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button styleType="underline" onClick={() => onOpen(entry.id)}>
          <Text size="small" value="See more" icon="arrow-right" iconPosition="right" />
        </Button>
        <Button styleType="delete" onClick={() => onRemove(entry.id)} className="h-8 w-8 p-0!">
          <Text icon="trash" size="very small" />
          <span className="sr-only">Delete this search</span>
        </Button>
      </div>
    </article>
  );
}
