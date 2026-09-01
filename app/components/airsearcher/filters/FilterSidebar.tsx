"use client";

import { useMemo, useState } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, colorMain, grayMid, radiusBig } from "@/config/theme";
import {
  countActiveFilters,
  resetFilters,
  type FilterScope,
  type FilterState,
  type ScopableFilter,
} from "@/lib/airsearcher/config/filters";
import {
  airlinesIn,
  connectingAirportsIn,
  countsFor,
} from "@/lib/airsearcher/filtering";
import type { StoredPreferences } from "@/lib/airsearcher/storage";
import type { Arrangement, SearchQuery } from "@/lib/airsearcher/types";
import AdvancedCalendarModal from "../calendar/AdvancedCalendarModal";
import FilterGroup from "./FilterGroup";
import ScopeDropdown from "./ScopeDropdown";
import {
  AirlinesGroup,
  CabinGroup,
  DurationGroup,
  EmissionsGroup,
  PriceGroup,
  StopsGroup,
  TripTypeGroup,
} from "./groups/BasicGroups";
import AvoidAirportsGroup from "./groups/AvoidAirportsGroup";
import DepartureAirportsGroup from "./groups/DepartureAirportsGroup";
import HourPreferencesGroup from "./groups/HourPreferencesGroup";
import TimesGroup from "./groups/TimesGroup";

/**
 * The filter sidebar.
 *
 * Composition only — every group lives in its own file. Filters remove results;
 * weights reorder them. Saying so plainly at the top prevents a whole class of
 * confusion about why a change did or did not move something.
 *
 * Hidden rather than unmounted when collapsed, so a group left expanded is
 * still expanded when the sidebar comes back.
 */
export default function FilterSidebar({
  open,
  onClose,
  filters,
  onChange,
  preferences,
  onPreferencesChange,
  arrangements,
  query,
}: {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onChange: (next: FilterState) => void;
  preferences: StoredPreferences;
  onPreferencesChange: (next: StoredPreferences) => void;
  arrangements: Arrangement[];
  query: SearchQuery;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isRoundTrip = filters.type === "round-trip";
  const activeCount = countActiveFilters(filters);

  const counts = useMemo(() => countsFor(arrangements, filters), [arrangements, filters]);
  const airlines = useMemo(() => airlinesIn(arrangements), [arrangements]);
  const connections = useMemo(() => connectingAirportsIn(arrangements), [arrangements]);
  const prices = useMemo(
    () => arrangements.map((a) => a.totals.totalPrice),
    [arrangements],
  );
  const knownAirports = useMemo(
    () => [...new Set(arrangements.flatMap((a) => a.legs.map((l) => l.origin)))],
    [arrangements],
  );

  /** The scope dropdown, shown only when there is a return flight to scope to. */
  const scope = (key: ScopableFilter) =>
    isRoundTrip ? (
      <ScopeDropdown
        value={filters.scopes[key]}
        onChange={(next: FilterScope) =>
          onChange({ ...filters, scopes: { ...filters.scopes, [key]: next } })
        }
      />
    ) : undefined;

  const groupProps = { filters, onChange, counts };

  return (
    <>
      <aside
        className={`${
          open ? "block" : "hidden"
        } fixed inset-0 z-50 overflow-y-auto bg-white p-4 lg:static lg:z-auto lg:block lg:w-72 lg:shrink-0 lg:overflow-visible lg:bg-transparent lg:p-0 ${
          open ? "" : "lg:hidden"
        }`}
      >
        <div className={`flex flex-col bg-white ${border} ${radiusBig} p-4`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Text size="medium" value="Filters" className="font-semibold text-gray-900" />
              {activeCount > 0 && (
                <Text
                  size="very small"
                  value={`${activeCount} active`}
                  className={`rounded-full bg-blue-50 px-2 py-0.5 ${colorMain.text}`}
                />
              )}
            </div>
            <Button styleType="tertiary" onClick={onClose} className="lg:hidden">
              <Text icon="close" size="small" />
              <span className="sr-only">Hide filters</span>
            </Button>
          </div>

          <Text
            size="very small"
            value="Filters remove arrangements that do not match. They never reorder — that is what the weights do."
            className="mt-1 mb-1 text-gray-400"
          />

          <FilterGroup title="Trip type" defaultOpen>
            <TripTypeGroup {...groupProps} />
          </FilterGroup>

          <FilterGroup title="Departure airports">
            <DepartureAirportsGroup
              filters={filters}
              onChange={onChange}
              knownAirports={knownAirports}
            />
          </FilterGroup>

          <FilterGroup title="Stops" defaultOpen topRight={scope("stops")}>
            <StopsGroup {...groupProps} />
          </FilterGroup>

          <FilterGroup title="Price" defaultOpen topRight={scope("price")}>
            <PriceGroup {...groupProps} prices={prices} />
          </FilterGroup>

          {/* Hour preferences sits above Airlines, as the brief requires. */}
          <FilterGroup title="Hour preferences">
            <HourPreferencesGroup
              filters={filters}
              onChange={onChange}
              preferences={preferences}
              onPreferencesChange={onPreferencesChange}
              isRoundTrip={isRoundTrip}
              onOpenCalendar={() => setCalendarOpen(true)}
            />
          </FilterGroup>

          <FilterGroup
            title="Airlines"
            count={filters.airlines.length || undefined}
            topRight={scope("airlines")}
          >
            <AirlinesGroup {...groupProps} airlines={airlines} />
          </FilterGroup>

          <FilterGroup title="Departure & arrival times" topRight={scope("times")}>
            <TimesGroup filters={filters} onChange={onChange} isRoundTrip={isRoundTrip} />
          </FilterGroup>

          <FilterGroup title="Duration & layovers" topRight={scope("duration")}>
            <DurationGroup {...groupProps} />
          </FilterGroup>

          <FilterGroup
            title="Avoid airports"
            count={filters.excludeAirports.length || undefined}
            topRight={scope("avoidAirports")}
          >
            <AvoidAirportsGroup
              filters={filters}
              onChange={onChange}
              available={connections}
            />
          </FilterGroup>

          <FilterGroup title="Cabin" topRight={scope("cabin")}>
            <CabinGroup {...groupProps} />
          </FilterGroup>

          <FilterGroup title="Emissions">
            <EmissionsGroup {...groupProps} />
          </FilterGroup>

          <div className={`mt-3 border-t ${grayMid.border} pt-3`}>
            <Button
              styleType="tertiary-bordered"
              disabled={activeCount === 0}
              onClick={() => onChange(resetFilters(filters))}
              className="w-full"
            >
              <Text size="small" value="Reset all filters" />
            </Button>
          </div>
        </div>
      </aside>

      <AdvancedCalendarModal
        // Remounting on open gives the modal a fresh working copy of the dates.
        key={calendarOpen ? "calendar-open" : "calendar-closed"}
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        query={{
          ...query,
          excludedDates: preferences.dates.excluded,
          priorityDates: preferences.dates.priority,
        }}
        onApply={(next) =>
          onPreferencesChange({
            ...preferences,
            dates: {
              excluded: next.excludedDates ?? preferences.dates.excluded,
              priority: next.priorityDates ?? preferences.dates.priority,
            },
          })
        }
      />
    </>
  );
}
