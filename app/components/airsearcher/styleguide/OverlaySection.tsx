"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { useAlert } from "@/framework/ui/useAlert";
import { useApp, useAbsoluteModal } from "@/framework/ui/context/AppContext";
import type { AlertType } from "@/framework/ui/Alert";
import { border, radius, shadow } from "@/config/theme";
import StyleGuideSection from "../common/StyleGuideSection";
import VariantRow from "../common/VariantRow";

const ALERT_TYPES: AlertType[] = ["Success", "Error", "Warning"];

/**
 * Proves the three framework overlay primitives behave with the retuned theme.
 * These are the exact patterns the search dropdowns, the sort-by menu and the
 * confirmation dialogs use later.
 */
export default function OverlaySection() {
  const { showAlert } = useAlert();
  const { openModal, closeModal } = useApp();
  const dropdown = useAbsoluteModal<HTMLButtonElement>();

  const dropdownPanel = (
    <div className={`bg-white ${border} ${radius} ${shadow} min-w-44 overflow-hidden py-1`}>
      {["Best match", "Cheapest first", "Shortest travel"].map((label) => (
        <Button
          key={label}
          styleType="nav"
          onClick={dropdown.close}
          className="w-full justify-start! rounded-none!"
        >
          {label}
        </Button>
      ))}
    </div>
  );

  return (
    <StyleGuideSection
      title="Alerts & modals"
      source="app/framework/ui/useAlert · context/AbsoluteModal · context/FixedModal"
    >
      <VariantRow label="useAlert" hint="toasts appear top-right">
        {ALERT_TYPES.map((type) => (
          <Button
            key={type}
            styleType="tertiary"
            onClick={() => showAlert(type, `This is a ${type} alert.`)}
          >
            {type}
          </Button>
        ))}
      </VariantRow>

      <VariantRow label="AbsoluteModal" hint="anchored to its trigger">
        <Button
          {...dropdown.triggerProps}
          styleType="tertiary-bordered"
          onClick={() =>
            dropdown.toggle({
              component: dropdownPanel,
              side: "bottom",
              align: "start",
              offset: 6,
            })
          }
        >
          <Text
            icon={dropdown.isOpen ? "chevron-up" : "chevron-down"}
            iconPosition="right"
            value="Open dropdown"
            size="small"
          />
        </Button>
      </VariantRow>

      <VariantRow label="FixedModal" hint="centred, max-w-md">
        <Button
          styleType="secondary"
          onClick={() =>
            openModal(
              <div className="flex flex-col gap-4">
                <Text
                  size="small"
                  value="This search will use 8 SerpApi requests."
                  className="text-gray-600"
                />
                <div className="flex justify-end gap-2">
                  <Button styleType="tertiary" onClick={closeModal}>
                    Cancel
                  </Button>
                  <Button styleType="primary" onClick={closeModal}>
                    Confirm
                  </Button>
                </div>
              </div>,
              "Confirm search cost",
            )
          }
        >
          Open dialog
        </Button>
      </VariantRow>
    </StyleGuideSection>
  );
}
