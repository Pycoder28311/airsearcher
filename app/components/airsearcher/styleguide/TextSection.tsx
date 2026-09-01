"use client";

import Text from "@/framework/ui/iconText/Text";
import { TEXT_SIZES } from "@/config/textConfig";
import { ICONS } from "@/config/iconConfig";
import { border, radius } from "@/config/theme";
import StyleGuideSection from "../common/StyleGuideSection";
import VariantRow from "../common/VariantRow";

const ICON_NAMES = Object.keys(ICONS) as (keyof typeof ICONS)[];

/**
 * Every text size, each with and without an icon, plus the full icon set so the
 * available `icon` names are discoverable in one place.
 */
export default function TextSection() {
  return (
    <StyleGuideSection
      title="Text & icons"
      source="app/config/textConfig.ts · app/config/iconConfig.ts"
    >
      {TEXT_SIZES.map((size) => (
        <VariantRow key={size} label={size}>
          <Text size={size} value="The quick brown fox" />
          <Text size={size} icon="star" iconPosition="left" value="Icon left" />
          <Text size={size} icon="arrow-right" iconPosition="right" value="Icon right" />
        </VariantRow>
      ))}

      <VariantRow label="icon set" hint={`${ICON_NAMES.length} names`}>
        <div className="grid w-full grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {ICON_NAMES.map((name) => (
            <div
              key={name}
              className={`flex flex-col items-center gap-1 bg-white ${border} ${radius} p-2`}
            >
              <Text size="small" icon={name} />
              <Text
                size="very small"
                value={name}
                className="text-center font-mono text-gray-500"
              />
            </div>
          ))}
        </div>
      </VariantRow>
    </StyleGuideSection>
  );
}
