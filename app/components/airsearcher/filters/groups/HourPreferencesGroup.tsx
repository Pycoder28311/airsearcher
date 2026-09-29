"use client";

import type { StoredPreferences } from "@/lib/airsearcher/storage";
import HourCurveEditor from "../HourCurveEditor";

/**
 * When the group would rather fly. How much that matters is set with the
 * other score weights, in "What matters most".
 *
 * The reference project's "Departure vs Arrival weight" control is deliberately
 * absent — the ratio it set keeps its default in `config/ranking.ts` and is no
 * longer user-editable.
 */
export default function HourPreferencesGroup({
  preferences,
  onPreferencesChange,
  isRoundTrip,
}: {
  preferences: StoredPreferences;
  onPreferencesChange: (next: StoredPreferences) => void;
  isRoundTrip: boolean;
}) {
  const { ranking } = preferences;

  const setCurve = (which: "outbound" | "return", curve: number[]) => {
    onPreferencesChange({
      ...preferences,
      ranking: { ...ranking, curves: { ...ranking.curves, [which]: curve } },
    });
  };

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

    </div>
  );
}
