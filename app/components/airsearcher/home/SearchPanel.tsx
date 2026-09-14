"use client";

import Button from "@/framework/ui/buttons/Button";
import Input from "@/framework/ui/input/Input";
import Text from "@/framework/ui/iconText/Text";
import { useApp } from "@/framework/ui/context/AppContext";
import { border, colorSecondary, grayMid, radiusBig, shadow } from "@/config/theme";
import { describeCost, explainCost, needsConfirmation } from "@/lib/airsearcher/quota";
import { previewCost, usesSerpApi } from "@/lib/airsearcher/search";
import type { SearchQuery } from "@/lib/airsearcher/types";
import DateField, { dateError } from "./DateField";
import DepartureDropdown from "./DepartureDropdown";
import DestinationField from "./DestinationField";
import TripTypeToggle from "./TripTypeToggle";

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
}: {
  query: SearchQuery;
  onChange: (next: Partial<SearchQuery>) => void;
  onSearch: () => void | Promise<void>;
  searching: boolean;
  onOpenCalendar: () => void;
  onOpenMap: (cityId: string) => void;
}) {
  const { openModal, closeModal } = useApp();

  const { plan, cost, cached } = previewCost(query);
  const invalid =
    dateError(query) ??
    (query.destination.airports.length === 0 ? "Choose a destination" : null) ??
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
      <TripTypeToggle
        value={query.tripType}
        onChange={(tripType) =>
          onChange({ tripType, returnDate: tripType === "one-way" ? null : query.returnDate })
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-4">
          <DepartureDropdown
            origins={query.origins}
            onChange={(origins) => onChange({ origins })}
            gatheringAirport={query.gatheringAirport}
            onGatheringChange={(gatheringAirport) => onChange({ gatheringAirport })}
          />
        </div>

        <div className="md:col-span-8">
          <DestinationField
            value={query.destination}
            onChange={(destination) =>
              onChange({
                destination: {
                  cityId: destination.cityId ?? query.destination.cityId,
                  airports: destination.airports,
                },
              })
            }
            onOpenMap={onOpenMap}
          />
        </div>
      </div>

      <DateField query={query} onChange={onChange} onOpenCalendar={onOpenCalendar} />

      <label className="flex cursor-pointer items-center gap-2">
        <Input
          type="checkbox"
          checked={query.sameAirline === true}
          onChange={() => onChange({ sameAirline: !query.sameAirline })}
        />
        <Text size="small" value="Same airline for all flights" className="text-gray-800" />
      </label>

      {query.dateMode === "advanced" && (
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
    </section>
  );
}
