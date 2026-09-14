"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Text from "@/framework/ui/iconText/Text";
import { useAlert } from "@/framework/ui/useAlert";
import SearchPanel from "@/components/airsearcher/home/SearchPanel";
import SearchHistoryList from "@/components/airsearcher/home/SearchHistoryList";
import AdvancedCalendarModal from "@/components/airsearcher/calendar/AdvancedCalendarModal";
import MapModal from "@/components/airsearcher/map/MapModal";
import { DEFAULT_GATHERING_AIRPORT, GREEK_ORIGIN_DEFAULTS } from "@/lib/airsearcher/config/constants";
import { loadFilters, loadPreferences, loadSearches, removeSearch, savePreferences, type StoredSearch } from "@/lib/airsearcher/storage";
import { runSearch, SearchRequestError, usesSerpApi } from "@/lib/airsearcher/search";
import { addDays, isoDate } from "@/lib/airsearcher/time";
import type { SearchQuery } from "@/lib/airsearcher/types";

/** A sensible starting query: one passenger from each Greek airport, a fortnight away. */
function initialQuery(): SearchQuery {
  const departure = addDays(isoDate(new Date()), 14);
  return {
    destination: { cityId: "", airports: [] },
    origins: GREEK_ORIGIN_DEFAULTS.map((airport) => ({ airport, passengers: 1 })),
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
  /**
   * localStorage is unavailable during the server render, so the parts that
   * depend on it only render once mounted — otherwise the cost line would
   * hydrate with a different value than it rendered with.
   */
  const [now, setNow] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect --
     Reading browser storage is exactly the "subscribe to an external system"
     case effects exist for: localStorage does not exist during the server
     render, so this cannot happen any earlier without a hydration mismatch. */
  useEffect(() => {
    setHistory(loadSearches());
    setNow(Date.now());

    // Carry the calendar's saved exclusions and priorities into a new search.
    const prefs = loadPreferences();
    setQuery((current) => ({
      ...current,
      excludedDates: prefs.dates.excluded,
      priorityDates: prefs.dates.priority,
    }));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const update = (next: Partial<SearchQuery>) =>
    setQuery((current) => ({ ...current, ...next }));

  const search = async () => {
    if (searching) return;
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
            searching={searching}
            onOpenCalendar={() => setCalendarOpen(true)}
            onOpenMap={setMapCityId}
          />

          <SearchHistoryList
            entries={history}
            now={now}
            onOpen={(id) => router.push(`/results?search=${id}`)}
            onRemove={remove}
          />
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
        // Remounting on open seeds the map from the current destination.
        key={mapCityId ?? "map-closed"}
        open={mapCityId !== null}
        onClose={() => setMapCityId(null)}
        initialCityId={mapCityId ?? undefined}
        value={query.destination}
        onConfirm={(destination) => {
          update({
            destination: {
              cityId: destination.cityId ?? query.destination.cityId,
              airports: destination.airports,
            },
          });
          setMapCityId(null);
        }}
      />
    </div>
  );
}
