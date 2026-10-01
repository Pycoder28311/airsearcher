"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { colorSecondary, grayLight, radius } from "@/config/theme";
import { isSavedResultOutdated, savedResultOutdatedReason, type SavedResult } from "@/lib/airsearcher/savedResults";
import { formatAge } from "@/lib/airsearcher/time";
import type { Arrangement } from "@/lib/airsearcher/types";
import ResultCard from "../results/ResultCard";

/**
 * A saved result on the Saved page: the results page's card, with where it
 * came from above it and, once its prices are too old, why they are outdated.
 */
export default function SavedResultCard({
  result,
  now,
  cheapestPrice,
  compareWith,
  open,
  searchUrl,
  onToggle,
  onRemove,
}: {
  result: SavedResult;
  now: number;
  /** The cheapest saved result for the same destination, for the open card's comparison. */
  cheapestPrice: number;
  compareWith: Arrangement[];
  open: boolean;
  /** Its search's results page, while that search still has its results. */
  searchUrl: string | null;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const outdated = isSavedResultOutdated(result, now);

  const notice = (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Text
          size="very small"
          value={`${result.searchLabel} · prices found ${formatAge(result.foundAt, now)}`}
          className="text-gray-500"
        />
        {searchUrl && (
          <Button styleType="underline" href={searchUrl}>
            <Text size="very small" value="Open search" />
          </Button>
        )}
      </div>
      {outdated && (
        <div className={`${radius} ${grayLight.bg} border ${colorSecondary.border} px-3 py-1.5`}>
          <Text
            size="very small"
            icon="alert"
            value={`Outdated. ${savedResultOutdatedReason(result, now)}; search again for current prices.`}
            className={colorSecondary.text}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className={outdated ? "opacity-75" : ""}>
      <ResultCard
        arrangement={result.arrangement}
        cheapestPrice={cheapestPrice}
        compareWith={compareWith}
        open={open}
        floating={false}
        showDateHeader
        onToggle={onToggle}
        saved
        onSave={onRemove}
        notice={notice}
      />
    </div>
  );
}
