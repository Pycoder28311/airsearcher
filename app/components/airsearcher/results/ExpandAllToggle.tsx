"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";

/**
 * Opens or closes every result at once.
 *
 * The label says what pressing it will do, not what the current state is, so
 * the button is never ambiguous. Floated results are unaffected — they are
 * always shown open in their own window.
 */
export default function ExpandAllToggle({
  allOpen,
  onToggleAll,
  disabled,
}: {
  allOpen: boolean;
  onToggleAll: (open: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Button
      styleType="tertiary"
      disabled={disabled}
      onClick={() => onToggleAll(!allOpen)}
    >
      <Text
        icon={allOpen ? "chevron-up" : "chevron-down"}
        size="small"
        value={allOpen ? "Close all" : "Open all"}
      />
    </Button>
  );
}
