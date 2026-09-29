"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Text from "@/framework/ui/iconText/Text";
import { useAlert } from "@/framework/ui/useAlert";
import SearchPanel from "@/components/airsearcher/home/SearchPanel";
import SearchHistoryList from "@/components/airsearcher/home/SearchHistoryList";
import CurlRequestsPanel from "@/components/airsearcher/home/curl/CurlRequestsPanel";
import AdvancedCalendarModal from "@/components/airsearcher/calendar/AdvancedCalendarModal";
import MapModal from "@/components/airsearcher/map/MapModal";
import {
  DEFAULT_GATHERING_AIRPORT,
  DEFAULT_PASSENGERS_PER_ORIGIN,
  GREEK_ORIGIN_DEFAULTS,
} from "@/lib/airsearcher/config/constants";
import {
  loadFilters,
  loadPreferences,
  loadSearches,
  pruneOutdatedResults,
  removeSearch,
  savePreferences,
  type StoredSearch,
} from "@/lib/airsearcher/storage";
import { flushStorage, storageError, storageReady } from "@/lib/airsearcher/storageClient";
import { runSearch, SearchRequestError, usesSerpApi } from "@/lib/airsearcher/search";
import { addDays, isoDate } from "@/lib/airsearcher/time";
import type { DestinationSelection, SearchQuery } from "@/lib/airsearcher/types";

/** A sensible starting query: one passenger from each Greek airport, a fortnight away. */
function initialQuery(): SearchQuery {
  const departure = addDays(isoDate(new Date()), 14);
  return {
    destinations: [],
    origins: GREEK_ORIGIN_DEFAULTS.map((airport) => ({
      airport,
      passengers: DEFAULT_PASSENGERS_PER_ORIGIN,
    })),
    gatheringAirport: DEFAULT_GATHERING_AIRPORT,
    tripType: "round-trip",
    dateMode: "exact",
    departureDate: departure,
    returnDate: addDays(departure, 7),
    dateRange: { start: departure, end: addDays(departure, 20) },
    tripDurationDays: 7,
    excludedDates: [],
    priorityDates: {},
    sameAirline: true,
  };
}

export default function HomePage() {
  const router = useRouter();
  const { showAlert } = useAlert();

  const [query, setQuery] = useState<SearchQuery>(initialQuery);
  const [history, setHistory] = useState<StoredSearch[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [mapCityId, setMapCityId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  /** True while pasted cURLs are running; the main search waits for them. */
  const [curlRunning, setCurlRunning] = useState(false);
  /**
   * localStorage is unavailable during the server render, so the parts that
   * depend on it only render once mounted — otherwise the cost line would
   * hydrate with a different value than it rendered with.
   */
  const [now, setNow] = useState<number | null>(null);

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
          "Saved searches and settings couldn't be loaded from the local database. Is “npm run dev” running? Changes won't be saved until the page is reloaded.",
          { durationMs: 8000 },
        );
      }
      // Outdated searches keep their card; their results are removed.
      pruneOutdatedResults();
      setHistory(loadSearches());
      setNow(Date.now());
      // Coming from the navbar's History link: the list only exists once the
      // saved data has loaded, so the browser couldn't scroll to it earlier.
      if (window.location.hash === "#history") {
        window.requestAnimationFrame(() => document.getElementById("history")?.scrollIntoView());
      }

      // Carry the calendar's saved exclusions and priorities into a new search.
      const prefs = loadPreferences();
      setQuery((current) => ({
        ...current,
        excludedDates: prefs.dates.excluded,
        priorityDates: prefs.dates.priority,
      }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (next: Partial<SearchQuery>) =>
    setQuery((current) => ({ ...current, ...next }));

  /**
   * Adds the destination the map confirmed, or replaces the city it edited.
   * Airports added on their own are separate chips and stay as they are.
   */
  const upsertDestination = (next: DestinationSelection) =>
    setQuery((current) => {
      const isCity = (place: DestinationSelection) =>
        place.kind !== "airport" && place.cityId === next.cityId;
      const known = current.destinations.some(isCity);
      return {
        ...current,
        destinations: known
          ? current.destinations.map((place) => (isCity(place) ? next : place))
          : [...current.destinations, next],
      };
    });

  const search = async () => {
    if (searching || curlRunning) return;
    setSearching(true);
    try {
      const filters = loadFilters();
      const preferences = loadPreferences();
      const outcome = await runSearch(query, filters, preferences.ranking);

      setHistory(loadSearches());
      showAlert(
        "Success",
        outcome.reused
          ? "Reused saved results — no SerpApi requests spent."
          : !usesSerpApi(query)
            ? `Found ${outcome.entry.travelpayouts?.arrangements.length ?? 0} arrangements with Travelpayouts.`
            : `Found ${outcome.entry.arrangements.length} arrangements using ${outcome.requestCount} SerpApi requests.`,
      );
      await flushStorage();
      router.push(`/results?search=${outcome.entry.id}`);
    } catch (error) {
      const requestsMade = error instanceof SearchRequestError ? error.requestsMade : 0;
      const attempted =
        requestsMade > 0
          ? ` ${requestsMade} request${requestsMade === 1 ? " was" : "s were"} attempted.`
          : "";
      showAlert(
        "Error",
        `${error instanceof Error ? error.message : "The live flight search failed."}${attempted}`,
        { durationMs: 7000 },
      );
    } finally {
      setSearching(false);
    }
  };

  const openCurlResult = useCallback(
    async (entry: StoredSearch) => {
      setHistory(loadSearches());
      const found = entry.googleCurl?.arrangements.length ?? 0;
      showAlert("Success", `Built ${found} arrangements from Google Flights.`);
      await flushStorage();
      router.push(`/results?search=${entry.id}&source=google-curl`);
    },
    [router, showAlert],
  );

  const remove = (id: string) => {
    removeSearch(id);
    setHistory(loadSearches());
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <Text size="large" value="AirSearcher" className="font-semibold text-gray-900" />
        <Text
          size="small"
          value="Find the best way for a group leaving Greece from several airports to reach one destination together."
          className="max-w-prose text-gray-500"
        />
      </header>

      {now === null ? (
        <Text size="small" value="Loading…" className="text-gray-400" />
      ) : (
        <>
          <SearchPanel
            query={query}
            onChange={update}
            onSearch={search}
            searching={searching || curlRunning}
            onOpenCalendar={() => setCalendarOpen(true)}
            onOpenMap={setMapCityId}
          >
            <CurlRequestsPanel
              query={query}
              disabled={searching}
              onRunningChange={setCurlRunning}
              onFinished={openCurlResult}
            />
          </SearchPanel>

          {/* The navbar's History link lands here. */}
          <div id="history" className="scroll-mt-20">
            <SearchHistoryList
              entries={history}
              now={now}
              onOpen={(id) => void flushStorage().then(() => router.push(`/results?search=${id}`))}
              onRemove={remove}
            />
          </div>
        </>
      )}

      <AdvancedCalendarModal
        // Remounting on open gives the modal a fresh working copy of the query.
        key={calendarOpen ? "calendar-open" : "calendar-closed"}
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        query={query}
        onApply={(next) => {
          update(next);
          const prefs = loadPreferences();
          savePreferences({
            ...prefs,
            dates: {
              excluded: next.excludedDates ?? query.excludedDates,
              priority: next.priorityDates ?? query.priorityDates,
            },
          });
        }}
      />

      <MapModal
        // Remounting on open seeds the map from the destination being edited.
        key={mapCityId ?? "map-closed"}
        open={mapCityId !== null}
        onClose={() => setMapCityId(null)}
        initialCityId={mapCityId ?? undefined}
        value={
          query.destinations.find(
            (place) => place.kind !== "airport" && place.cityId === mapCityId,
          ) ?? {
            cityId: mapCityId,
            airports: [],
          }
        }
        onConfirm={(destination) => {
          if (destination.cityId) {
            upsertDestination({
              cityId: destination.cityId,
              airports: destination.airports,
            });
          }
          setMapCityId(null);
        }}
      />
    </div>
  );
}
