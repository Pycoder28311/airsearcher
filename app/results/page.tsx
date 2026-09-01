"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAlert } from "@/framework/ui/useAlert";
import { grayMid } from "@/config/theme";
import FilterSidebar from "@/components/airsearcher/filters/FilterSidebar";
import SidebarToggle from "@/components/airsearcher/common/SidebarToggle";
import ExpandAllToggle from "@/components/airsearcher/results/ExpandAllToggle";
import FloatingLayer from "@/components/airsearcher/results/FloatingLayer";
import ResultCard from "@/components/airsearcher/results/ResultCard";
import ResultsHeader from "@/components/airsearcher/results/ResultsHeader";
import SortByDropdown from "@/components/airsearcher/results/SortByDropdown";
import { useFloatingWindows } from "@/components/airsearcher/results/useFloatingWindows";
import { resetFilters, type FilterState } from "@/lib/airsearcher/config/filters";
import type { ArrangementSortMode } from "@/lib/airsearcher/grouping";
import { scoreArrangements, sortArrangements } from "@/lib/airsearcher/grouping";
import { applyScopedFilters, explainEmpty } from "@/lib/airsearcher/filtering";
import { weightsOf } from "@/lib/airsearcher/search";
import {
  findSearchById,
  isStale,
  loadFilters,
  loadPreferences,
  saveFilters,
  savePreferences,
  type StoredPreferences,
  type StoredSearch,
} from "@/lib/airsearcher/storage";

function ResultsView() {
  const params = useSearchParams();
  const { showAlert } = useAlert();
  const floating = useFloatingWindows();

  const searchId = params.get("search");

  const [entry, setEntry] = useState<StoredSearch | null>(null);
  const [filters, setFilters] = useState<FilterState | null>(null);
  const [preferences, setPreferences] = useState<StoredPreferences | null>(null);
  const [sortMode, setSortMode] = useState<ArrangementSortMode>("score");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [now, setNow] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect --
     Reading browser storage is exactly the "subscribe to an external system"
     case effects exist for: localStorage does not exist during the server
     render, so this cannot happen any earlier without a hydration mismatch. */
  useEffect(() => {
    const found = searchId ? findSearchById(searchId) : null;
    const prefs = loadPreferences();

    setEntry(found);
    setFilters(loadFilters());
    setPreferences(prefs);
    setSidebarOpen(!prefs.sidebarCollapsed);
    setNow(Date.now());

    if (found && isStale(found)) {
      showAlert(
        "Warning",
        "These results are more than a day old and should be recalculated with SerpApi.",
        { durationMs: 8000 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * The whole results pipeline: filter, re-score against the surviving set,
   * then sort. Scoring has to rerun after filtering because `priceIndex` is
   * relative — removing an option legitimately changes everyone's score.
   */
  const visible = useMemo(() => {
    if (!entry || !filters || !preferences) return [];
    const surviving = applyScopedFilters(entry.arrangements, filters);
    const scored = scoreArrangements(
      surviving,
      weightsOf(filters),
      preferences.ranking,
      preferences.dates.priority,
    );
    return sortArrangements(scored, sortMode);
  }, [entry, filters, preferences, sortMode]);

  const cheapestPrice =
    visible.length > 0 ? Math.min(...visible.map((a) => a.totals.totalPrice)) : null;

  const updateFilters = (next: FilterState) => {
    setFilters(next);
    saveFilters(next);
  };

  const updatePreferences = (next: StoredPreferences) => {
    setPreferences(next);
    savePreferences(next);
  };

  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    // Presentation only — it must never touch the results or the filter values.
    if (preferences) updatePreferences({ ...preferences, sidebarCollapsed: !next });
  };

  if (now === null) {
    return <Text size="small" value="Loading…" className="text-gray-400" />;
  }

  if (!entry || !filters || !preferences) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Text size="medium" value="No results to show" className="font-semibold text-gray-900" />
        <Text
          size="small"
          value="This search is not in your history any more. Start a new one from the home page."
          className="text-gray-500"
        />
        <Button styleType="primary" href="/">
          Back to search
        </Button>
      </div>
    );
  }

  const listed = visible.filter((a) => !floating.isFloating(a.id));
  const allOpen = listed.length > 0 && listed.every((a) => openIds.has(a.id));
  const reasons = visible.length === 0 ? explainEmpty(entry.arrangements, filters) : [];

  return (
    <div className="flex w-full gap-6">
      <FilterSidebar
        open={sidebarOpen}
        onClose={toggleSidebar}
        filters={filters}
        onChange={updateFilters}
        preferences={preferences}
        onPreferencesChange={updatePreferences}
        arrangements={entry.arrangements}
        query={entry.query}
      />

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <ResultsHeader
          entry={entry}
          now={now}
          shown={visible.length}
          total={entry.arrangements.length}
          stale={isStale(entry, now)}
        />

        <div
          className={`flex flex-wrap items-center gap-2 border-y ${grayMid.border} py-2`}
        >
          <SidebarToggle open={sidebarOpen} onToggle={toggleSidebar} filters={filters} />
          <ExpandAllToggle
            allOpen={allOpen}
            disabled={listed.length === 0}
            onToggleAll={(open) =>
              setOpenIds(open ? new Set(listed.map((a) => a.id)) : new Set())
            }
          />
          <div className="ml-auto">
            <SortByDropdown
              value={sortMode}
              onChange={setSortMode}
              cheapestPrice={cheapestPrice}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <Text
              size="small"
              value="No arrangement survives the current filters."
              className="text-gray-700"
            />
            {reasons.map((reason) => (
              <Text
                key={reason.group}
                size="very small"
                value={`Clearing "${reason.label}" alone would bring back ${reason.wouldRestore} result${
                  reason.wouldRestore === 1 ? "" : "s"
                }.`}
                className="text-gray-500"
              />
            ))}
            <Button styleType="tertiary" onClick={() => updateFilters(resetFilters(filters))}>
              Reset all filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map((arrangement) => (
              <ResultCard
                key={arrangement.id}
                arrangement={arrangement}
                cheapestPrice={cheapestPrice ?? arrangement.totals.totalPrice}
                open={openIds.has(arrangement.id)}
                floating={floating.isFloating(arrangement.id)}
                onToggle={() =>
                  setOpenIds((current) => {
                    const next = new Set(current);
                    if (next.has(arrangement.id)) next.delete(arrangement.id);
                    else next.add(arrangement.id);
                    return next;
                  })
                }
                onFloat={() => floating.open(arrangement.id)}
                onUnfloat={() => floating.close(arrangement.id)}
              />
            ))}
          </div>
        )}
      </section>

      <FloatingLayer
        boxes={floating.boxes}
        arrangements={visible}
        cheapestPrice={cheapestPrice ?? 0}
        onMove={floating.move}
        onResize={floating.resize}
        onFocus={floating.bringToFront}
        onClose={floating.close}
      />
    </div>
  );
}

export default function ResultsPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-8 sm:px-6">
      <Suspense fallback={<Text size="small" value="Loading…" className="text-gray-400" />}>
        <ResultsView />
      </Suspense>
    </div>
  );
}
