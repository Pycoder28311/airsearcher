"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAlert } from "@/framework/ui/useAlert";
import { border, colorSecondary, radiusBig } from "@/config/theme";
import SavedResultCard from "@/components/airsearcher/saved/SavedResultCard";
import { cityName } from "@/data/places";
import {
  isSavedResultOutdated,
  loadSavedResults,
  removeSavedResult,
  type SavedResult,
} from "@/lib/airsearcher/savedResults";
import { findSearchById } from "@/lib/airsearcher/storage";
import { storageError, storageReady } from "@/lib/airsearcher/storageClient";

/** The saved results for one destination, cheapest first within each departure day. */
interface DestinationSection {
  cityId: string;
  name: string;
  results: SavedResult[];
  outdated: number;
  cheapest: number;
}

function sectionId(cityId: string): string {
  return `saved-${cityId}`;
}

/** Saved results grouped by the city they fly into, sections in name order. */
function sectionsOf(results: SavedResult[], now: number): DestinationSection[] {
  const byCity = new Map<string, SavedResult[]>();
  for (const result of results) {
    const cityId = result.arrangement.destination.cityId;
    byCity.set(cityId, [...(byCity.get(cityId) ?? []), result]);
  }
  return [...byCity.entries()]
    .map(([cityId, list]) => ({
      cityId,
      name: cityName(cityId),
      results: [...list].sort(
        (a, b) =>
          a.arrangement.departureDate.localeCompare(b.arrangement.departureDate) ||
          a.arrangement.totals.totalPrice - b.arrangement.totals.totalPrice,
      ),
      outdated: list.filter((result) => isSavedResultOutdated(result, now)).length,
      cheapest: Math.min(...list.map((result) => result.arrangement.totals.totalPrice)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The results saved with a card's save icon, in one section per destination,
 * with the destinations listed alongside to jump between them. Outdated ones
 * stay, marked, until removed.
 */
export default function SavedPage() {
  const { showAlert } = useAlert();
  const [results, setResults] = useState<SavedResult[] | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  /* The saved data lives in the local database, loaded once the page is in
     the browser: what this effect waits for. */
  useEffect(() => {
    let cancelled = false;
    void storageReady().then(() => {
      if (cancelled) return;
      if (storageError()) {
        showAlert("Warning", "Saved results couldn't be loaded from the local database. Is “npm run dev” running?", {
          durationMs: 8000,
        });
      }
      setResults(loadSavedResults());
      setNow(Date.now());
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections = useMemo(() => (results && now !== null ? sectionsOf(results, now) : []), [results, now]);

  /** Each search's results page, while the search still has its results. */
  const searchUrls = useMemo(() => {
    const urls = new Map<string, string | null>();
    for (const result of results ?? []) {
      if (urls.has(result.searchId)) continue;
      const search = findSearchById(result.searchId);
      urls.set(
        result.searchId,
        search && !search.resultsRemoved ? `/results?search=${search.id}&source=${result.source}` : null,
      );
    }
    return urls;
  }, [results]);

  const remove = (id: string) => {
    if (!removeSavedResult(id)) {
      showAlert("Warning", "The result couldn't be removed from the local database.", { durationMs: 6000 });
      return;
    }
    setResults(loadSavedResults());
  };

  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (results === null || now === null) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <Text size="small" value="Loading saved results…" className="text-gray-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <Text size="large" value="Saved" className="font-semibold text-gray-900" />
        <Text
          size="small"
          value={
            results.length === 0
              ? "Nothing saved yet."
              : `${results.length} result${results.length === 1 ? "" : "s"} for ${sections.length} destination${
                  sections.length === 1 ? "" : "s"
                }. Save more with the star on any result.`
          }
          className="text-gray-500"
        />
      </header>

      {results.length === 0 ? (
        <div>
          <Button styleType="primary" href="/">
            <Text size="small" icon="search" value="Start a search" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <aside className={`bg-white ${border} ${radiusBig} p-3 lg:sticky lg:top-20 lg:w-60 lg:shrink-0`}>
            <Text size="small" value="Destinations" className="mb-2 px-1 font-semibold text-gray-900" />
            <nav className="flex flex-wrap gap-1 lg:flex-col">
              {sections.map((section) => (
                <Button
                  key={section.cityId}
                  styleType="tertiary"
                  onClick={() =>
                    document
                      .getElementById(sectionId(section.cityId))
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="justify-between gap-3 lg:w-full"
                >
                  <Text size="small" value={section.name} />
                  <Text
                    size="very small"
                    value={`${section.results.length}${section.outdated > 0 ? ` · ${section.outdated} outdated` : ""}`}
                    className={`tabular-nums ${section.outdated > 0 ? colorSecondary.text : "text-gray-500"}`}
                  />
                </Button>
              ))}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-8">
            {sections.map((section) => (
              <section key={section.cityId} id={sectionId(section.cityId)} className="flex scroll-mt-24 flex-col gap-3">
                <div className="flex items-baseline gap-2">
                  <Text size="big" value={section.name} className="font-semibold text-gray-900" />
                  <Text
                    size="small"
                    value={`${section.results.length} saved`}
                    className="tabular-nums text-gray-500"
                  />
                </div>
                <div className="flex flex-col gap-4">
                  {section.results.map((result) => (
                    <SavedResultCard
                      key={result.id}
                      result={result}
                      now={now}
                      cheapestPrice={section.cheapest}
                      compareWith={section.results.map((item) => item.arrangement)}
                      open={openIds.has(result.id)}
                      searchUrl={searchUrls.get(result.searchId) ?? null}
                      onToggle={() => toggle(result.id)}
                      onRemove={() => remove(result.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
