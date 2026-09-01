"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { colorMain } from "@/config/theme";
import { countActiveFilters, type FilterState } from "@/lib/airsearcher/config/filters";

/**
 * Shows or hides the filter sidebar.
 *
 * Purely presentational: it never touches the results or any filter value, so
 * collapsing loses nothing. The badge keeps the active-filter count visible
 * while the sidebar is away.
 */
export default function SidebarToggle({
  open,
  onToggle,
  filters,
}: {
  open: boolean;
  onToggle: () => void;
  filters: FilterState;
}) {
  const active = countActiveFilters(filters);

  return (
    <Button styleType="tertiary" onClick={onToggle} className="gap-2">
      <Text
        icon={open ? "close" : "settings"}
        size="small"
        value={open ? "Hide filters" : "Filters"}
      />
      {active > 0 && (
        <Text
          size="very small"
          value={active}
          className={`rounded-full bg-blue-50 px-1.5 tabular-nums ${colorMain.text}`}
        />
      )}
    </Button>
  );
}
