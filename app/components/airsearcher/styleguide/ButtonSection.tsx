"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { BUTTON_VARIANTS } from "@/config/buttonConfig";
import StyleGuideSection from "../common/StyleGuideSection";
import VariantRow from "../common/VariantRow";

/**
 * Every button variant in four states. Hover and :active cannot be rendered
 * statically, so the row hint says to mouse over them.
 */
export default function ButtonSection() {
  return (
    <StyleGuideSection title="Buttons" source="app/config/buttonConfig.ts">
      {BUTTON_VARIANTS.map((variant) => (
        <VariantRow key={variant} label={variant} hint="hover / press to see states">
          <Button styleType={variant}>Default</Button>
          <Button styleType={variant} disabled>
            Disabled
          </Button>
          <Button styleType={variant}>
            <Text icon="check" value="With icon" size="small" />
          </Button>
          <Button styleType={variant} href="#buttons">
            As link
          </Button>
        </VariantRow>
      ))}
    </StyleGuideSection>
  );
}
