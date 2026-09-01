/**
 * What a search costs, in SerpApi requests.
 *
 * The rule this encodes, taken from the reference project: any action costing
 * more than one request must be confirmed by the user first, with the exact
 * count shown. Pure functions, so the rule is testable independently of any UI.
 */

import {
  planRequestBatches,
  type PlannedSearch,
} from "@/lib/airsearcher/queryPlan";

/**
 * SerpApi is queried once per date and direction. Every airport required for a
 * batch is sent in comma-separated `departure_id` and `arrival_id` parameters.
 * The results page later filters each response into its route arrangements.
 *
 * `planSearches` deliberately contains the individual route legs required by
 * the mock/result pool. Several of those legs can therefore belong to the same
 * billable request.
 */
export function costOf(plan: PlannedSearch[]): number {
  return planRequestBatches(plan).length;
}

export function needsConfirmation(cost: number): boolean {
  return cost > 1;
}

export function describeCost(cost: number): string {
  return `${cost} SerpApi request${cost === 1 ? "" : "s"}`;
}

type CostReason = "outbound" | "return";

const REASON_LABELS: Record<CostReason, string> = {
  outbound: "Combined outbound searches",
  return: "Combined return searches",
};

export interface CostLine {
  reason: CostReason;
  label: string;
  count: number;
}

/** Grouped breakdown for the confirmation dialog, largest first. */
export function explainCost(plan: PlannedSearch[]): CostLine[] {
  const counts = new Map<CostReason, number>();
  for (const batch of planRequestBatches(plan)) {
    counts.set(batch.direction, (counts.get(batch.direction) ?? 0) + 1);
  }

  return [...counts.entries()].map(([reason, count]) => ({
    reason,
    label: REASON_LABELS[reason],
    count,
  }));
}
