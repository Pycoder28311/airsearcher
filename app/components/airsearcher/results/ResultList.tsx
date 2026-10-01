"use client";

import { memo, useEffect, useRef, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { RESULTS_BATCH_SIZE } from "@/lib/airsearcher/config/constants";
import type { Arrangement } from "@/lib/airsearcher/types";
import ResultCard from "./ResultCard";

/** What a closed card compares against: nothing, and always the same nothing. */
const NO_COMPARISON: Arrangement[] = [];

/**
 * Whether two results draw the same card. Every filter change re-scores the
 * set, which copies each result even when its flights and score stay put, so
 * the copies are compared by what they hold rather than by identity.
 */
function sameResult(a: Arrangement, b: Arrangement): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.legs === b.legs &&
      a.totals === b.totals &&
      a.score === b.score &&
      JSON.stringify([a.indices, a.breakdown]) === JSON.stringify([b.indices, b.breakdown]))
  );
}

type RowProps = {
  arrangement: Arrangement;
  cheapestPrice: number;
  compareWith: Arrangement[];
  open: boolean;
  floating: boolean;
  showDateHeader: boolean;
  onToggle: (id: string) => void;
  onFloat: (id: string) => void;
  onUnfloat: (id: string) => void;
  saved: boolean;
  onSave: (arrangement: Arrangement) => void;
};

function sameRow(prev: RowProps, next: RowProps): boolean {
  return (
    sameResult(prev.arrangement, next.arrangement) &&
    prev.cheapestPrice === next.cheapestPrice &&
    prev.compareWith === next.compareWith &&
    prev.open === next.open &&
    prev.floating === next.floating &&
    prev.showDateHeader === next.showDateHeader &&
    prev.onToggle === next.onToggle &&
    prev.onFloat === next.onFloat &&
    prev.onUnfloat === next.onUnfloat &&
    prev.saved === next.saved &&
    prev.onSave === next.onSave
  );
}

/**
 * One card, redrawn only when what it shows changes. The callbacks take the
 * card's id so the list can pass the same functions to every card.
 */
const ResultRow = memo(function ResultRow({
  arrangement,
  cheapestPrice,
  compareWith,
  open,
  floating,
  showDateHeader,
  onToggle,
  onFloat,
  onUnfloat,
  saved,
  onSave,
}: RowProps) {
  return (
    <ResultCard
      arrangement={arrangement}
      cheapestPrice={cheapestPrice}
      compareWith={compareWith}
      open={open}
      floating={floating}
      showDateHeader={showDateHeader}
      onToggle={() => onToggle(arrangement.id)}
      onFloat={() => onFloat(arrangement.id)}
      onUnfloat={() => onUnfloat(arrangement.id)}
      saved={saved}
      onSave={() => onSave(arrangement)}
    />
  );
}, sameRow);

/**
 * The result cards, drawn in batches: the first RESULTS_BATCH_SIZE, then the
 * next batch whenever the end of the list scrolls into view (or "Show more" is
 * pressed). Sorting and filtering still cover every result; only the drawing
 * waits. A new list — another sort or filter — starts again from one batch.
 *
 * Memoised so the cards are only redrawn when what they show changes: the page
 * re-renders whenever the app context does — every dropdown that opens or
 * closes — and a filter change that leaves a card as it was shouldn't redraw
 * it either.
 */
function ResultList({
  arrangements,
  cheapestPrice,
  openIds,
  isFloating,
  showDateHeader,
  onToggle,
  onFloat,
  onUnfloat,
  savedIds,
  onSave,
}: {
  arrangements: Arrangement[];
  cheapestPrice: number | null;
  openIds: Set<string>;
  isFloating: (id: string) => boolean;
  showDateHeader: boolean;
  onToggle: (id: string) => void;
  onFloat: (id: string) => void;
  onUnfloat: (id: string) => void;
  /** Ids of the results on the Saved page's saved list. */
  savedIds: Set<string>;
  /** Saves a result, or removes it when saved. */
  onSave: (arrangement: Arrangement) => void;
}) {
  const [shown, setShown] = useState(RESULTS_BATCH_SIZE);
  // Back to one batch when the list itself changes, set during render so the
  // long list is never drawn first.
  const [listed, setListed] = useState(arrangements);
  if (listed !== arrangements) {
    setListed(arrangements);
    setShown(RESULTS_BATCH_SIZE);
  }

  const visible = arrangements.slice(0, shown);
  const remaining = arrangements.length - visible.length;

  /* The marker under the last card: an IntersectionObserver is the browser
     system this effect subscribes to, adding a batch when it comes near. */
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const marker = end.current;
    if (!marker || remaining === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown((current) => current + RESULTS_BATCH_SIZE);
        }
      },
      // Starts the next batch a screen early, so scrolling rarely meets the end.
      { rootMargin: "0px 0px 100% 0px" },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [remaining, shown]);

  return (
    <div className="flex flex-col gap-4">
      {visible.map((arrangement) => {
        const open = openIds.has(arrangement.id);
        return (
          <ResultRow
            key={arrangement.id}
            arrangement={arrangement}
            cheapestPrice={cheapestPrice ?? arrangement.totals.totalPrice}
            // Only an open card compares itself with the others listed.
            compareWith={open ? arrangements : NO_COMPARISON}
            open={open}
            floating={isFloating(arrangement.id)}
            showDateHeader={showDateHeader}
            onToggle={onToggle}
            onFloat={onFloat}
            onUnfloat={onUnfloat}
            saved={savedIds.has(arrangement.id)}
            onSave={onSave}
          />
        );
      })}

      {remaining > 0 && (
        <div ref={end} className="flex items-center justify-center gap-3 py-2">
          <Text
            size="very small"
            value={`Showing ${visible.length} of ${arrangements.length}`}
            className="tabular-nums text-gray-500"
          />
          <Button
            styleType="tertiary"
            onClick={() => setShown((current) => current + RESULTS_BATCH_SIZE)}
          >
            <Text size="small" value="Show more" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default memo(ResultList);
