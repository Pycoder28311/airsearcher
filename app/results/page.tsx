"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAlert } from "@/framework/ui/useAlert";
import { colorSecondary, grayMid } from "@/config/theme";
import FilterSidebar from "@/components/airsearcher/filters/FilterSidebar";
import SidebarToggle from "@/components/airsearcher/common/SidebarToggle";
import CurlRequestSummary from "@/components/airsearcher/results/CurlRequestSummary";
import DateRangeView from "@/components/airsearcher/results/DateRangeView";
import { describePair } from "@/components/airsearcher/results/PriceGrid";
import FloatingLayer from "@/components/airsearcher/results/FloatingLayer";
import ResultList from "@/components/airsearcher/results/ResultList";
import ResultsHeader from "@/components/airsearcher/results/ResultsHeader";
import SortByDropdown from "@/components/airsearcher/results/SortByDropdown";
import { useFloatingWindows } from "@/components/airsearcher/results/useFloatingWindows";
import { CURRENCY } from "@/lib/airsearcher/config/constants";
import { anyGroupChanged, resetFilters, type FilterState } from "@/lib/airsearcher/config/filters";
import type { ArrangementSortMode } from "@/lib/airsearcher/grouping";
import {
  asOneWay,
  everyoneGetsHome,
  formatPriceRange,
  groupPriceRange,
  scoreArrangements,
  sortArrangements,
  uniqueArrangements,
} from "@/lib/airsearcher/grouping";
import { applyScopedFilters, explainEmpty } from "@/lib/airsearcher/filtering";
import { inPair, type DatePair } from "@/lib/airsearcher/priceGrid";
import { withWeekday } from "@/components/airsearcher/results/ResultCardClosed";
import { buildOpenJawArrangements, usesSerpApi, weightsOf } from "@/lib/airsearcher/search";
import {
  findSearchById,
  gatheredFlightsOf,
  staleReason,
  isStale,
  loadGatheredFlights,
  loadFilters,
  loadPreferences,
  saveFilters,
  savePreferences,
  type StoredPreferences,
  type StoredSearch,
} from "@/lib/airsearcher/storage";
import { flushStorage, storageError, storageReady } from "@/lib/airsearcher/storageClient";
import { daysBetween, formatDate } from "@/lib/airsearcher/time";
import {
  destinationsOf,
  returnPlaceOf,
  type Arrangement,
  type FlightRecord,
  type SearchQuery,
} from "@/lib/airsearcher/types";
import {
  lengthOptions,
  nightsOf,
  rebuildForLength,
  searchedLengths,
  withLength,
} from "@/lib/airsearcher/tripLength";
import { canExtend, extendUrl, searchedIds } from "@/lib/airsearcher/extend";
import {
  addSavedResult,
  loadSavedResults,
  removeSavedResult,
  savedResultId,
  type SavedResult,
} from "@/lib/airsearcher/savedResults";
import ExtendDatesModal from "@/components/airsearcher/calendar/ExtendDatesModal";
import { useApp } from "@/framework/ui/context/AppContext";
import { useRouter } from "next/navigation";
import { candidateDates, describeTripLength } from "@/lib/airsearcher/queryPlan";

/** Which API's results the page is showing. */
type ResultSource = "serpapi" | "travelpayouts" | "google-curl";

const SOURCES: { id: ResultSource; label: string }[] = [
  { id: "serpapi", label: "SerpApi" },
  { id: "travelpayouts", label: "Travelpayouts" },
  { id: "google-curl", label: "Google (cURL)" },
];

function isSource(value: string | null): value is ResultSource {
  return SOURCES.some((tab) => tab.id === value);
}

/**
 * The sources an entry has results for. A cURL entry has only its own; a
 * search without SerpApi has only Travelpayouts.
 */
function sourcesOf(entry: StoredSearch): ResultSource[] {
  if (entry.kind === "google-curl") return ["google-curl"];
  const sources: ResultSource[] = usesSerpApi(entry.query)
    ? ["serpapi", "travelpayouts"]
    : ["travelpayouts"];
  if (entry.googleCurl) sources.push("google-curl");
  return sources;
}

/** The chosen source when the entry has it, otherwise its first one. */
function activeSourceOf(entry: StoredSearch, chosen: ResultSource): ResultSource {
  const sources = sourcesOf(entry);
  return sources.includes(chosen) ? chosen : sources[0];
}

function arrangementsFor(entry: StoredSearch, source: ResultSource) {
  if (source === "serpapi") return entry.arrangements;
  if (source === "travelpayouts") return entry.travelpayouts?.arrangements ?? [];
  return entry.googleCurl?.arrangements ?? [];
}

function priceGridFor(entry: StoredSearch, source: ResultSource) {
  if (source === "serpapi") return entry.priceGrid;
  if (source === "travelpayouts") return entry.travelpayouts?.priceGrid;
  return entry.googleCurl?.priceGrid;
}

function ResultsView() {
  const params = useSearchParams();
  const { showAlert } = useAlert();
  const { openModal, closeModal } = useApp();
  const router = useRouter();
  const floating = useFloatingWindows();

  const searchId = params.get("search");
  const requestedSource = params.get("source");

  const [entry, setEntry] = useState<StoredSearch | null>(null);
  const [filters, setFilters] = useState<FilterState | null>(null);
  const [preferences, setPreferences] = useState<StoredPreferences | null>(null);
  const [sortMode, setSortMode] = useState<ArrangementSortMode>("score");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggleOpen = useCallback(
    (id: string) =>
      setOpenIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [setOpenIds],
  );
  // The per-request flight counts and "no price" notes stay hidden until asked for.
  const [showInfo, setShowInfo] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [now, setNow] = useState<number | null>(null);
  const [source, setSource] = useState<ResultSource>(
    isSource(requestedSource) ? requestedSource : "serpapi",
  );
  // Page state only, never FilterState: a date-pair pick is a view of this one
  // result set and must not leak into the next search.
  const [selectedPair, setSelectedPair] = useState<DatePair | null>(null);
  // On a multi-city search, the city to arrive in and the one to come home
  // from; null is any. Page state like the pair: city ids differ per search.
  const [arriveCity, setArriveCity] = useState<string | null>(null);
  const [leaveCity, setLeaveCity] = useState<string | null>(null);
  /** Open-jaw results built from the saved flights, for searches saved before they were. */
  const [openJaw, setOpenJaw] = useState<{ id: string; arrangements: Arrangement[] } | null>(null);
  const [buildingJaw, setBuildingJaw] = useState(false);
  // Trip lengths chosen in the sidebar, several at once; null is the search's own.
  const [nights, setNights] = useState<number[] | null>(null);
  /** Results rebuilt from the saved flights, per length, for one search. */
  const [rebuilt, setRebuilt] = useState<{ id: string; byLength: Map<number, Arrangement[]> } | null>(null);
  const [building, setBuilding] = useState(false);
  /** The saved flights, fetched once per search when first needed. */
  const [saved, setSaved] = useState<{ id: string; records: FlightRecord[] } | null>(null);
  /** The lengths asked for last, so an older rebuild never overwrites a newer one. */
  const latestLengths = useRef<number[] | null>(null);
  // Departure days narrowed inside what was searched; page state, never saved.
  const [viewRange, setViewRange] = useState<{ start: string; end: string } | null>(null);
  /** The "change dates" calendar while open, with the trip lengths it adds. */
  const [datesModal, setDatesModal] = useState<{ extraNights: number[] } | null>(null);
  /** The results saved for the Saved page, from every search. */
  const [savedResults, setSavedResults] = useState<SavedResult[]>([]);

  /* Reading saved data is exactly the "subscribe to an external system" case
     effects exist for: it is loaded from the local database once the page is
     in the browser, so this cannot happen any earlier. */
  useEffect(() => {
    let cancelled = false;
    void storageReady().then(() => {
      if (cancelled) return;
      if (storageError()) {
        showAlert(
          "Warning",
          "Saved searches couldn't be loaded from the local database. Is “npm run dev” running?",
          { durationMs: 8000 },
        );
      }
      const found = searchId ? findSearchById(searchId) : null;
      const prefs = loadPreferences();

      setEntry(found);
      setSavedResults(loadSavedResults());
      setFilters(loadFilters());
      setPreferences(prefs);
      setSidebarOpen(!prefs.sidebarCollapsed);
      setNow(Date.now());
      setSelectedPair(null);

      if (found && isStale(found)) {
        showAlert(
          "Warning",
          `These prices are ${staleReason(found)}. Run the search again from the home page for current prices.`,
          { durationMs: 8000 },
        );
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId]);

  const rangeSearch = entry?.query.dateMode === "advanced";
  const sources = entry ? sourcesOf(entry) : [];
  const activeSource = entry ? activeSourceOf(entry, source) : source;

  /** This search and tab's saved results, by result id. */
  const savedIds = useMemo(
    () =>
      new Set(
        savedResults
          .filter((item) => item.searchId === entry?.id && item.source === activeSource)
          .map((item) => item.arrangement.id),
      ),
    [savedResults, entry?.id, activeSource],
  );
  const toggleSaved = useCallback(
    (arrangement: Arrangement) => {
      if (!entry) return;
      const id = savedResultId(entry.id, activeSource, arrangement);
      const written = savedIds.has(arrangement.id)
        ? removeSavedResult(id)
        : addSavedResult({
            id,
            savedAt: new Date().toISOString(),
            foundAt: entry.savedAt,
            searchId: entry.id,
            searchLabel: entry.label,
            source: activeSource,
            arrangement,
          });
      if (!written) {
        showAlert("Warning", "The result couldn't be saved to the local database.", { durationMs: 6000 });
        return;
      }
      setSavedResults(loadSavedResults());
    },
    [entry, activeSource, savedIds, showAlert],
  );

  // "One way" in the sidebar shows a round-trip search's results without the way back.
  const oneWay = entry?.query.tripType === "round-trip" && filters?.type === "one-way";

  // Another length needs the saved flights, which only the search's own source has.
  const flightsSource: ResultSource = entry?.kind === "google-curl" ? "google-curl" : "serpapi";
  const lengths = useMemo(
    () =>
      entry && rangeSearch && activeSource === flightsSource && !oneWay && gatheredFlightsOf(entry) > 0
        ? lengthOptions(entry.query)
        : [],
    [entry, rangeSearch, activeSource, flightsSource, oneWay],
  );
  const searched = useMemo(() => (entry ? searchedLengths(entry.query) : []), [entry]);
  const extendCheck = entry ? canExtend(entry, now ?? undefined) : null;
  /** Whether "Edit search" opens the date calendar (or, when outdated, says why it can't). */
  const extendable = extendCheck !== null && (extendCheck.ok || extendCheck.reason === "stale");
  /** The chosen lengths, when they replace the search's own. */
  const chosenLengths = lengths.length > 0 ? nights : null;

  // The only thing the tab changes: which API's arrangements feed the pipeline.
  const allCities = useMemo(() => {
    if (!entry) return [];
    // Open jaws built from the saved flights join an older search's results.
    const stored = [
      ...arrangementsFor(entry, activeSource),
      ...(openJaw?.id === entry.id && activeSource === flightsSource ? openJaw.arrangements : []),
    ];
    // A length the search ran for comes from its saved results; any other was
    // rebuilt from its saved flights.
    const byLength = rebuilt?.id === entry.id ? rebuilt.byLength : null;
    const source = chosenLengths
      ? chosenLengths.flatMap((n) =>
          searched.includes(n) ? stored.filter((a) => nightsOf(a) === n) : (byLength?.get(n) ?? []),
        )
      : stored;
    // Searches saved before duplicates were removed can still hold them, and
    // older ones results where a group had no way home.
    let list = uniqueArrangements(source.filter(everyoneGetsHome));
    if (viewRange) {
      list = list.filter((a) => a.departureDate >= viewRange.start && a.departureDate <= viewRange.end);
    }
    return oneWay ? asOneWay(list) : list;
  }, [entry, activeSource, flightsSource, openJaw, oneWay, chosenLengths, searched, rebuilt, viewRange]);

  /** The destination cities with results, in the order the search named them. */
  const cities = useMemo(() => {
    const found = new Set(allCities.flatMap((a) => [a.destination.cityId, returnPlaceOf(a).cityId]));
    const named = entry ? destinationsOf(entry.query).map((d) => d.cityId) : [];
    return [...new Set([...named, ...found])].filter((id) => found.has(id));
  }, [allCities, entry]);
  // A city from another tab or source that has no results here means any.
  const activeArrive = arriveCity !== null && cities.includes(arriveCity) ? arriveCity : null;
  const activeLeave = leaveCity !== null && cities.includes(leaveCity) && !oneWay ? leaveCity : null;
  const anyCity = activeArrive !== null || activeLeave !== null;

  const arrangements = useMemo(
    () =>
      allCities.filter(
        (a) =>
          (activeArrive === null || a.destination.cityId === activeArrive) &&
          (activeLeave === null || returnPlaceOf(a).cityId === activeLeave),
      ),
    [allCities, activeArrive, activeLeave],
  );

  /**
   * The whole results pipeline: filter, re-score against the surviving set,
   * then sort. Scoring has to rerun after filtering because `priceIndex` is
   * relative — removing an option legitimately changes everyone's score.
   */
  const visible = useMemo(() => {
    if (!entry || !filters || !preferences) return [];
    const surviving = applyScopedFilters(arrangements, filters);
    const scored = scoreArrangements(
      surviving,
      weightsOf(filters),
      preferences.ranking,
      preferences.dates.priority,
    );
    return sortArrangements(scored, sortMode);
  }, [entry, arrangements, filters, preferences, sortMode]);

  // The grid is built from `visible`, so it keeps every cell; the pair only
  // narrows the cards.
  const selectedOnly = useMemo(
    () =>
      selectedPair
        ? visible.filter((a) => inPair(a, selectedPair))
        : visible,
    [visible, selectedPair],
  );

  // Stays on `visible`: re-basing on one cell would make its cards all look cheap.
  const cheapestPrice =
    visible.length > 0 ? Math.min(...visible.map((a) => a.totals.totalPrice)) : null;
  // Shown as the cheapest result's group range, never as a total.
  const cheapestResult = visible.find((a) => a.totals.totalPrice === cheapestPrice);
  const cheapestLabel = cheapestResult
    ? formatPriceRange(groupPriceRange(cheapestResult), CURRENCY)
    : null;

  const updateFilters = (next: FilterState) => {
    // A departure–return pair means nothing once the way back is dropped.
    if (next.type !== filters?.type) setSelectedPair(null);
    setFilters(next);
    saveFilters(next);
  };

  /** The saved flights of this search, fetched the first time they're needed. */
  const ensureSavedFlights = async (): Promise<FlightRecord[]> => {
    if (!entry) return [];
    if (saved?.id === entry.id) return saved.records;
    const records = await loadGatheredFlights(entry);
    setSaved({ id: entry.id, records });
    return records;
  };

  /**
   * Shows these trip lengths together. A length the search ran for uses its
   * saved results; any other is rebuilt once from the saved flights. None, or
   * exactly the search's own, goes back to the saved results.
   */
  const chooseLengths = async (next: number[] | null) => {
    if (!entry || !filters || !preferences) return;
    const sorted = next ? [...new Set(next)].sort((a, b) => a - b) : [];
    const own = sorted.length === 0 || (searched.length > 0 && sorted.join() === searched.join());
    const target = own ? null : sorted;
    latestLengths.current = target;
    setSelectedPair(null);
    setNights(target);
    const cache = rebuilt?.id === entry.id ? rebuilt.byLength : new Map<number, Arrangement[]>();
    const todo = (target ?? []).filter((n) => !searched.includes(n) && !cache.has(n));
    if (todo.length === 0) {
      setBuilding(false);
      return;
    }
    setBuilding(true);
    const records = await ensureSavedFlights();
    const byLength = new Map(cache);
    for (const n of todo) {
      // Lets "Building…" show, and a newer choice win, between the rebuilds.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (latestLengths.current !== target) return;
      byLength.set(n, rebuildForLength(entry.query, { ...preferences.ranking, weights: weightsOf(filters) }, records, n));
    }
    if (latestLengths.current !== target) return;
    setRebuilt({ id: entry.id, byLength });
    setBuilding(false);
  };

  const toggleLength = (n: number) => {
    const current = nights ?? searched;
    void chooseLengths(current.includes(n) ? current.filter((x: number) => x !== n) : [...current, n]);
  };

  /** Explains why the calendar can't open, with the way out. */
  const showCantExtend = (reason: "stale" | "unsupported") =>
    openModal(
      <div className="flex flex-col gap-4">
        <Text
          size="small"
          value={
            reason === "stale"
              ? "These prices are outdated, so dates can't be added to this search. Run a new search from the home page for current prices."
              : "Dates can only be added to a date-range Google Flights search that still has its flights. Run a new search from the home page."
          }
          className="text-gray-700"
        />
        <div className="flex justify-end gap-2">
          <Button styleType="tertiary" onClick={closeModal}>
            Close
          </Button>
          <Button styleType="primary" href="/">
            New search
          </Button>
        </div>
      </div>,
      reason === "stale" ? "Prices are outdated" : "Can't add dates",
    );

  /** Opens the "change dates" calendar, adding these trip lengths. */
  const openDates = (extraNights: number[] = []) => {
    if (!entry) return;
    const check = canExtend(entry);
    if (!check.ok) return showCantExtend(check.reason);
    setDatesModal({ extraNights });
    void ensureSavedFlights();
  };

  /** A length the saved flights can't answer on any day. */
  const askToSearch = (n: number) =>
    openModal(
      <div className="flex flex-col gap-4">
        <Text
          size="small"
          value={`There are no flights for ${n} night${n === 1 ? "" : "s"} yet: none of their return days were searched. A search for the missing dates must happen to combine the results.`}
          className="text-gray-700"
        />
        <div className="flex justify-end gap-2">
          <Button styleType="tertiary" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            styleType="primary"
            onClick={() => {
              closeModal();
              openDates([n]);
            }}
          >
            Choose dates
          </Button>
        </div>
      </div>,
      "A search is needed",
    );

  /** The search as the chart and grid show it: narrowed, at the chosen lengths, one way. */
  const viewQuery = (query: SearchQuery): SearchQuery => {
    let shown = viewRange ? { ...query, dateRange: viewRange } : query;
    if (chosenLengths) {
      shown = { ...withLength(shown, chosenLengths[0]), tripLengths: chosenLengths.length > 1 ? chosenLengths : null };
    }
    // Seen one way, there are no return dates to lay out a grid by.
    return oneWay ? { ...shown, tripType: "one-way", returnDate: null } : shown;
  };

  /**
   * Builds the open-jaw results of a search saved before they were built (it
   * has none stored), once, from its saved flights.
   */
  const ensureOpenJaw = async () => {
    if (!entry || !filters || !preferences || cities.length < 2 || oneWay) return;
    if (openJaw?.id === entry.id || activeSource !== flightsSource || gatheredFlightsOf(entry) === 0) return;
    if (arrangementsFor(entry, activeSource).some((a) => a.returnDestination)) return;
    setBuildingJaw(true);
    const records = await ensureSavedFlights();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const built = buildOpenJawArrangements(
      entry.query,
      { ...preferences.ranking, weights: weightsOf(filters) },
      records,
    );
    setOpenJaw({ id: entry.id, arrangements: built });
    setBuildingJaw(false);
  };

  /** The city to arrive in, or to come home from; null is any. */
  const chooseCity = (side: "arrive" | "leave", next: string | null) => {
    // A date pair picked for one city may have nothing in another.
    setSelectedPair(null);
    if (side === "arrive") setArriveCity(next);
    else setLeaveCity(next);
    // Picking cities is when trips that come home from elsewhere matter.
    if (next !== null) void ensureOpenJaw();
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

  if (entry.resultsRemoved) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Text size="medium" value={entry.label} className="font-semibold text-gray-900" />
        <Text
          size="small"
          value={`This search's results were removed: ${staleReason(entry, now ?? undefined)}. Run it again from the home page for current prices.`}
          className="text-gray-500"
        />
        <Button styleType="primary" href="/">
          Back to search
        </Button>
      </div>
    );
  }

  const reasons = visible.length === 0 ? explainEmpty(arrangements, filters) : [];
  /** The Google requests' flight counts and notes, for "Show info". */
  const curlInfo =
    activeSource === "google-curl" ? (
      <CurlRequestSummary
        requests={entry.googleCurl?.requests}
        uniqueFlights={entry.googleCurl?.uniqueFlights}
        warnings={entry.googleCurl?.warnings}
      />
    ) : undefined;

  const pairLabel = !selectedPair
    ? ""
    : selectedPair.returnDate === null
      ? `Leaving ${withWeekday(selectedPair.departureDate)}`
      : describePair(
          { ...selectedPair, returnDate: selectedPair.returnDate },
          daysBetween(selectedPair.departureDate, selectedPair.returnDate),
        );

  return (
    <div className="flex w-full gap-6">
      <FilterSidebar
        open={sidebarOpen}
        onClose={toggleSidebar}
        filters={filters}
        onChange={updateFilters}
        preferences={preferences}
        onPreferencesChange={updatePreferences}
        arrangements={arrangements}
        roundTripSearch={entry.query.tripType === "round-trip"}
        cities={cities}
        arriveCity={activeArrive}
        leaveCity={activeLeave}
        showLeave={entry.query.tripType === "round-trip" && !oneWay}
        buildingOpenJaw={buildingJaw}
        onArriveChange={(next) => chooseCity("arrive", next)}
        onLeaveChange={(next) => chooseCity("leave", next)}
        tripLength={
          lengths.length > 0
            ? {
                options: lengths,
                searched,
                searchedLabel: describeTripLength(entry.query) ?? "",
                value: chosenLengths,
                building,
                totalDays: candidateDates(entry.query).length,
                onToggle: toggleLength,
                onReset: () => void chooseLengths(null),
                onNoData: askToSearch,
                onSearchMissing: openDates,
              }
            : undefined
        }
      />

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <ResultsHeader
          entry={entry}
          now={now}
          stale={isStale(entry, now)}
          // The calendar where it can open; an outdated search explains why not.
          onEditDates={extendable ? () => openDates() : undefined}
        />

        {sources.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {SOURCES.filter((tab) => sources.includes(tab.id)).map((tab) => (
              <Button
                key={tab.id}
                styleType={activeSource === tab.id ? "primary" : "tertiary"}
                onClick={() => {
                  // Arrangement ids repeat across APIs, so open cards do not carry over.
                  setOpenIds(new Set());
                  setSelectedPair(null);
                  setSource(tab.id);
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        )}

        {/* A date range shows the info beside its grid and chart, in their place; exact dates here. */}
        {curlInfo && !rangeSearch && (
          <div className="flex flex-col gap-2">
            <div>
              <Button styleType={showInfo ? "primary" : "tertiary"} onClick={() => setShowInfo((v) => !v)}>
                <Text size="small" value={showInfo ? "Hide info" : "Show info"} />
              </Button>
            </div>
            {showInfo && curlInfo}
          </div>
        )}

        {activeSource === "travelpayouts" && !entry.travelpayouts && (
          <Text
            size="small"
            value="This search was saved before Travelpayouts results were collected. Run it again to get them."
            className="text-gray-500"
          />
        )}
        {activeSource === "travelpayouts" && entry.travelpayouts?.error && (
          <Text
            size="small"
            value={`Travelpayouts search failed: ${entry.travelpayouts.error}`}
            className="text-gray-500"
          />
        )}

        {rangeSearch && (
          <DateRangeView
            query={viewQuery(entry.query)}
            arrangements={visible}
            stored={arrangements}
            // The saved floor covers every city, so it only fits the whole search.
            floor={
              !anyCity && chosenLengths === null && viewRange === null
                ? priceGridFor(entry, activeSource)
                : undefined
            }
            selectedPair={selectedPair}
            onSelectPair={setSelectedPair}
            info={curlInfo}
          />
        )}

        <div
          className={`flex flex-wrap items-center gap-2 border-y ${grayMid.border} py-2`}
        >
          <SidebarToggle open={sidebarOpen} onToggle={toggleSidebar} filters={filters} />
          {/* Every result the list holds with the current filters (and date pair),
              not just the batch drawn so far. */}
          <Text
            size="small"
            value={`${selectedOnly.length} result${selectedOnly.length === 1 ? "" : "s"}`}
            className="tabular-nums text-gray-600"
          />
          {(anyGroupChanged(filters) || anyCity || nights !== null || viewRange !== null) && (
            <Button
              styleType="tertiary"
              onClick={() => {
                setArriveCity(null);
                setLeaveCity(null);
                void chooseLengths(null);
                setViewRange(null);
                updateFilters(resetFilters(filters));
              }}
            >
              <Text icon="reset" size="small" value="Reset filters" />
            </Button>
          )}
          {viewRange && (
            <Button
              styleType="tertiary"
              onClick={() => setViewRange(null)}
              className={`gap-1.5 border ${colorSecondary.border}`}
            >
              <Text
                size="very small"
                value={`Leaving ${formatDate(viewRange.start)} – ${formatDate(viewRange.end)}`}
                className={colorSecondary.text}
              />
              <Text icon="close" size="very small" className={colorSecondary.text} />
            </Button>
          )}
          {selectedPair && (
            <Button
              styleType="tertiary"
              onClick={() => setSelectedPair(null)}
              className={`gap-1.5 border ${colorSecondary.border}`}
            >
              <Text size="very small" value={pairLabel} className={colorSecondary.text} />
              <Text icon="close" size="very small" className={colorSecondary.text} />
            </Button>
          )}
          <div className="ml-auto">
            <SortByDropdown
              value={sortMode}
              onChange={setSortMode}
              cheapestLabel={cheapestLabel}
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
        ) : selectedOnly.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <Text
              size="small"
              value={`No result for ${pairLabel.split(" · ")[0]} with the current filters.`}
              className="text-gray-700"
            />
            <Button styleType="tertiary" onClick={() => setSelectedPair(null)}>
              Show all dates
            </Button>
          </div>
        ) : (
          <ResultList
            arrangements={selectedOnly}
            cheapestPrice={cheapestPrice}
            openIds={openIds}
            isFloating={floating.isFloating}
            showDateHeader={rangeSearch}
            onToggle={toggleOpen}
            onFloat={floating.open}
            onUnfloat={floating.close}
            savedIds={savedIds}
            onSave={toggleSaved}
          />
        )}
      </section>

      {datesModal && entry.query.dateRange && (
        <ExtendDatesModal
          open
          onClose={() => setDatesModal(null)}
          entry={entry}
          have={saved?.id === entry.id ? searchedIds(saved.records) : null}
          initialRange={viewRange ?? entry.query.dateRange}
          extraNights={datesModal.extraNights}
          onNarrow={(range) => {
            const full = entry.query.dateRange;
            setSelectedPair(null);
            setViewRange(full && range.start === full.start && range.end === full.end ? null : range);
            // Lengths added without a search are already covered: show them.
            if (datesModal.extraNights.length > 0) {
              void chooseLengths([...(nights ?? searched), ...datesModal.extraNights]);
            }
          }}
          onSearch={(range) =>
            void flushStorage().then(() =>
              router.push(extendUrl({ searchId: entry.id, range, nights: datesModal.extraNights })),
            )
          }
        />
      )}

      <FloatingLayer
        boxes={floating.boxes}
        arrangements={selectedOnly}
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
