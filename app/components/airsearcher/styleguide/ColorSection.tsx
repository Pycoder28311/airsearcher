"use client";

import Text from "@/framework/ui/iconText/Text";
import {
  border,
  colorMain,
  colorPrimaries,
  colorRed,
  colorSecondary,
  grayLight,
  grayMid,
  grayStrong,
  radius,
  type ColorToken,
  type GrayToken,
} from "@/config/theme";
import StyleGuideSection from "../common/StyleGuideSection";
import VariantRow from "../common/VariantRow";

const TOKENS: { name: string; token: ColorToken | GrayToken }[] = [
  { name: "colorMain", token: colorMain },
  { name: "colorSecondary", token: colorSecondary },
  { name: "colorPrimaries", token: colorPrimaries },
  { name: "colorRed", token: colorRed },
  { name: "grayLight", token: grayLight },
  { name: "grayMid", token: grayMid },
  { name: "grayStrong", token: grayStrong },
];

/** Swatches straight from the theme tokens, so the palette itself is reviewable. */
export default function ColorSection() {
  return (
    <StyleGuideSection title="Colour tokens" source="app/config/theme.ts">
      {TOKENS.map(({ name, token }) => (
        <VariantRow key={name} label={name}>
          <div className={`h-10 w-24 ${token.bg} ${radius}`} />
          <div className={`h-10 w-24 bg-white ${radius} border-2 ${token.border}`} />
          <div className={`bg-white ${border} ${radius} px-3 py-2`}>
            <Text size="small" value="Text colour" className={token.text} />
          </div>
        </VariantRow>
      ))}
    </StyleGuideSection>
  );
}
