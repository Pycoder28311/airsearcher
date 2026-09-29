"use client";

import { useMemo } from "react";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, colorMain, radiusBig } from "@/config/theme";
import {
  countActiveFilters,
  groupChanged,
  resetGroup,
  type ResettableGroup,
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
import type { Arrangement } from "@/lib/airsearcher/types";
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
import HourPreferencesGroup from "./groups/HourPreferencesGroup";
import ScoreWeightsGroup from "./groups/ScoreWeightsGroup";
import { DEFAULT_RANKING_CONFIG } from "@/lib/airsearcher/config/ranking";
import TimesGroup from "./groups/TimesGroup";
import { pricePerHeadOf } from "@/lib/airsearcher/grouping";

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
  roundTripSearch,
}: {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onChange: (next: FilterState) => void;
  preferences: StoredPreferences;
  onPreferencesChange: (next: StoredPreferences) => void;
  arrangements: Arrangement[];
  /** Whether the search found ways back; a one-way search has nothing to switch between. */
  roundTripSearch: boolean;
}) {
  // Return-only controls need a way back: a round-trip search, not shown one way.
  const isRoundTrip = roundTripSearch && filters.type === "round-trip";
  const activeCount = countActiveFilters(filters);

  const counts = useMemo(() => countsFor(arrangements, filters), [arrangements, filters]);
  const airlines = useMemo(() => airlinesIn(arrangements), [arrangements]);
  const connections = useMemo(() => connectingAirportsIn(arrangements), [arrangements]);
  const priceScope = filters.scopes.price;
  const prices = useMemo(
    // Every group's per-passenger price over the scoped flights, which is what the price range filters on.
    () =>
      arrangements.flatMap((a) =>
        a.legs.map((leg) => Math.round(pricePerHeadOf(leg, priceScope))),
      ),
    [arrangements, priceScope],
  );

  /** The scope dropdown, shown only when there is a return flight to scope to. */
  const scope = (key: ScopableFilter) =>
    isRoundTrip ? (
      <ScopeDropdown
        value={filters.scopes[key]}
        onChange={(next: FilterScope) =>
          onChange({
            ...filters,
            scopes: { ...filters.scopes, [key]: next },
            // A price range set on other flights' prices would no longer fit.
            ...(key === "price" && next !== filters.scopes.price ? { priceRange: null } : {}),
          })
        }
      />
    ) : undefined;

  /** A section's reset, offered only while it differs from its defaults. */
  const reset = (group: ResettableGroup) =>
    groupChanged(filters, group) ? () => onChange(resetGroup(filters, group)) : undefined;
  const curvesChanged =
    JSON.stringify(preferences.ranking.curves) !== JSON.stringify(DEFAULT_RANKING_CONFIG.curves);

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

          <FilterGroup title="What matters most" defaultOpen onReset={reset("weights")}>
            <ScoreWeightsGroup filters={filters} onChange={onChange} />
          </FilterGroup>

          {roundTripSearch && (
            <FilterGroup title="Trip type" defaultOpen>
              <TripTypeGroup {...groupProps} />
            </FilterGroup>
          )}

          <FilterGroup title="Stops" defaultOpen topRight={scope("stops")} onReset={reset("stops")}>
            <StopsGroup {...groupProps} />
          </FilterGroup>

          <FilterGroup title="Price" defaultOpen topRight={scope("price")} onReset={reset("price")}>
            <PriceGroup {...groupProps} prices={prices} />
          </FilterGroup>

          <FilterGroup
            title="Airlines"
            count={filters.airlines.length || undefined}
            topRight={scope("airlines")}
            onReset={reset("airlines")}
          >
            <AirlinesGroup {...groupProps} airlines={airlines} />
          </FilterGroup>

          <FilterGroup title="Departure & arrival times" topRight={scope("times")} onReset={reset("times")}>
            <TimesGroup filters={filters} onChange={onChange} isRoundTrip={isRoundTrip} />
          </FilterGroup>

          <FilterGroup title="Duration & layovers" topRight={scope("duration")} onReset={reset("duration")}>
            <DurationGroup {...groupProps} />
          </FilterGroup>

          <FilterGroup
            title="Avoid airports"
            count={filters.excludeAirports.length || undefined}
            topRight={scope("avoidAirports")}
            onReset={reset("avoidAirports")}
          >
            <AvoidAirportsGroup
              filters={filters}
              onChange={onChange}
              available={connections}
            />
          </FilterGroup>

          <FilterGroup
            title="Hour preferences"
            onReset={
              curvesChanged
                ? () =>
                    onPreferencesChange({
                      ...preferences,
                      ranking: { ...preferences.ranking, curves: DEFAULT_RANKING_CONFIG.curves },
                    })
                : undefined
            }
          >
            <HourPreferencesGroup
              preferences={preferences}
              onPreferencesChange={onPreferencesChange}
              isRoundTrip={isRoundTrip}
            />
          </FilterGroup>

          <FilterGroup title="Cabin" topRight={scope("cabin")} onReset={reset("cabin")}>
            <CabinGroup {...groupProps} />
          </FilterGroup>

          <FilterGroup title="Emissions" onReset={reset("emissions")}>
            <EmissionsGroup {...groupProps} />
          </FilterGroup>
        </div>
      </aside>
    </>
  );
}
