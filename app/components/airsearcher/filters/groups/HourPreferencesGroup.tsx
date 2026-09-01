"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { DEFAULT_RANKING_CONFIG } from "@/lib/airsearcher/config/ranking";
import type { FilterState } from "@/lib/airsearcher/config/filters";
import type { StoredPreferences } from "@/lib/airsearcher/storage";
import HourCurveEditor from "../HourCurveEditor";
import WeightSelector from "../../common/WeightSelector";

/**
 * When the group would rather fly, and how much that matters.
 *
 * The reference project's "Departure vs Arrival weight" control is deliberately
 * absent — the ratio it set keeps its default in `config/ranking.ts` and is no
 * longer user-editable.
 *
 * The calendar is reachable from here too, so date exclusions and priorities
 * can be changed after a search. Editing them re-ranks the results already in
 * hand; it never triggers a new search.
 */
export default function HourPreferencesGroup({
  filters,
  onChange,
  preferences,
  onPreferencesChange,
  isRoundTrip,
  onOpenCalendar,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  preferences: StoredPreferences;
  onPreferencesChange: (next: StoredPreferences) => void;
  isRoundTrip: boolean;
  onOpenCalendar: () => void;
}) {
  const { ranking } = preferences;

  const setCurve = (which: "outbound" | "return", curve: number[]) => {
    onPreferencesChange({
      ...preferences,
      ranking: { ...ranking, curves: { ...ranking.curves, [which]: curve } },
    });
  };

  const excluded = preferences.dates.excluded.length;
  const prioritised = Object.keys(preferences.dates.priority).length;

  return (
    <div className="flex flex-col gap-4">
      <HourCurveEditor
        label="Going flight — preferred hours"
        value={ranking.curves.outbound}
        onChange={(curve) => setCurve("outbound", curve)}
      />

      {isRoundTrip && (
        <HourCurveEditor
          label="Returning flight — preferred hours"
          value={ranking.curves.return}
          onChange={(curve) => setCurve("return", curve)}
        />
      )}

      <WeightSelector
        label="How much do convenient hours matter?"
        value={filters.hourWeight}
        onChange={(hourWeight) => onChange({ ...filters, hourWeight })}
      />

      <Button
        styleType="tertiary"
        onClick={() =>
          onPreferencesChange({
            ...preferences,
            ranking: { ...ranking, curves: DEFAULT_RANKING_CONFIG.curves },
          })
        }
      >
        <Text size="very small" value="Reset the curves" />
      </Button>

      <div className="flex flex-col gap-1.5">
        <Text
          size="very small"
          value={
            excluded + prioritised === 0
              ? "No dates excluded or prioritised"
              : `${excluded} excluded · ${prioritised} prioritised`
          }
          className="text-gray-500"
        />
        <Button styleType="tertiary-bordered" onClick={onOpenCalendar}>
          <Text icon="calendar" size="small" value="Date preferences" />
        </Button>
      </div>
    </div>
  );
}
