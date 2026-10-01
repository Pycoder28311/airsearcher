"use client";

import type { ReactNode } from "react";
import Button from "@/framework/ui/buttons/Button";
import Input from "@/framework/ui/input/Input";
import Text from "@/framework/ui/iconText/Text";
import { useApp } from "@/framework/ui/context/AppContext";
import { border, colorMain, colorSecondary, grayMid, radius, radiusBig, shadow } from "@/config/theme";
import { describeCost, explainCost, needsConfirmation } from "@/lib/airsearcher/quota";
import { previewCost, usesSerpApi } from "@/lib/airsearcher/search";
import { destinationsOf } from "@/lib/airsearcher/types";
import type { SearchQuery } from "@/lib/airsearcher/types";
import DateField, { dateError } from "./DateField";
import DepartureDropdown from "./DepartureDropdown";
import DestinationsField from "./DestinationsField";
import TripTypeToggle from "./TripTypeToggle";

/**
 * The SerpApi search: its date-range checkbox, cost line and Search button.
 * Hidden while the Google session cURL is the only way to search; the code,
 * the confirmation and `onSearch` all stay as they are.
 */
const SHOW_SERPAPI_SEARCH = false;

/**
 * The main search interface: trip type, departures, destination, dates, and the
 * cost of running it.
 *
 * The cost line is the visible half of the SerpApi-minimisation requirement —
 * it is computed from the deduplicated query plan, and a reusable stored result
 * makes it read zero.
 */
export default function SearchPanel({
  query,
  onChange,
  onSearch,
  searching,
  onOpenCalendar,
  onOpenMap,
  children,
}: {
  query: SearchQuery;
  onChange: (next: Partial<SearchQuery>) => void;
  onSearch: () => void | Promise<void>;
  searching: boolean;
  onOpenCalendar: () => void;
  onOpenMap: (cityId: string) => void;
  /** Shown at the bottom of the same card: the Google session cURL. */
  children?: ReactNode;
}) {
  const { openModal, closeModal } = useApp();

  const { plan, cost, cached } = previewCost(query);
  const destinations = destinationsOf(query);
  const invalid =
    dateError(query) ??
    (destinations.length === 0 || destinations.some((place) => place.airports.length === 0)
      ? "Choose a destination"
      : null) ??
    (query.origins.every((o) => o.passengers === 0)
      ? "Add at least one passenger"
      : null);

  const start = () => {
    if (invalid || searching) return;
    if (!cached && needsConfirmation(cost)) {
      openModal(
        <div className="flex flex-col gap-4">
          <Text
            size="small"
            value={`This search will use ${describeCost(cost)}.`}
            className="text-gray-700"
          />
          <div className="flex flex-col gap-1">
            {explainCost(plan).map((line) => (
              <div key={line.reason} className="flex items-center justify-between gap-4">
                <Text size="very small" value={line.label} className="text-gray-500" />
                <Text
                  size="very small"
                  value={line.count}
                  className="tabular-nums text-gray-700"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button styleType="tertiary" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              styleType="primary"
              disabled={searching}
              onClick={() => {
                closeModal();
                onSearch();
              }}
            >
              Search anyway
            </Button>
          </div>
        </div>,
        "Confirm search cost",
      );
      return;
    }
    onSearch();
  };

  return (
    <section className={`flex flex-col gap-4 bg-white ${border} ${radiusBig} ${shadow} p-4 sm:p-6`}>
      <div className="flex flex-wrap items-center gap-1">
        <TripTypeToggle
          value={query.tripType}
          onChange={(tripType) =>
            onChange({ tripType, returnDate: tripType === "one-way" ? null : query.returnDate })
          }
        />
        {/* Shaped like the trip type buttons beside it, and blue when on, so the choice reads at a glance. */}
        <label
          className={`flex cursor-pointer h-9 items-center gap-2 ${radius} border px-4 transition-colors select-none ${
            query.sameAirline
              ? `${colorMain.border} bg-blue-50 text-blue-700`
              : "border-gray-300 text-gray-700 hover:border-gray-400"
          }`}
        >
          <Input
            type="checkbox"
            checked={query.sameAirline === true}
            onChange={() => onChange({ sameAirline: !query.sameAirline })}
          />
          <Text size="small" icon="plane" value="Same airline for all flights" className="font-medium" />
        </label>
      </div>

      {/* Departure, destination and dates on one row from `lg` up. */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-12">
        <div className="md:col-span-4 lg:col-span-3">
          <DepartureDropdown
            origins={query.origins}
            onChange={(origins) => onChange({ origins })}
            gatheringAirport={query.gatheringAirport}
            onGatheringChange={(gatheringAirport) => onChange({ gatheringAirport })}
          />
        </div>

        <div className="md:col-span-8 lg:col-span-5">
          <DestinationsField
            destinations={destinations}
            onChange={(next) => onChange({ destinations: next })}
            onOpenMap={onOpenMap}
          />
        </div>

        <div className="md:col-span-12 lg:col-span-4">
          <DateField query={query} onChange={onChange} onOpenCalendar={onOpenCalendar} />
        </div>
      </div>

      {SHOW_SERPAPI_SEARCH && query.dateMode === "advanced" && (
        <label className="flex cursor-pointer items-center gap-2">
          <Input
            type="checkbox"
            checked={query.rangeWithSerpApi === true}
            onChange={() => onChange({ rangeWithSerpApi: !query.rangeWithSerpApi })}
          />
          <Text
            size="small"
            value="Also search SerpApi for this date range"
            className="text-gray-800"
          />
        </label>
      )}

      {SHOW_SERPAPI_SEARCH && (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-t ${grayMid.border} pt-4`}
      >
        <Text
          size="very small"
          value={
            cached
              ? "Reusing saved results — 0 SerpApi requests"
              : usesSerpApi(query)
                ? `This search will use ${describeCost(cost)}`
                : "Date ranges are searched with Travelpayouts only — 0 SerpApi requests"
          }
          className={cached ? colorSecondary.text : "text-gray-500"}
        />

        <Button styleType="primary" disabled={invalid !== null || searching} onClick={start}>
          <Text
            icon="search"
            size="small"
            value={searching ? "Searching…" : cached ? "Open results" : "Search"}
          />
        </Button>
      </div>
      )}

      {children}
    </section>
  );
}
