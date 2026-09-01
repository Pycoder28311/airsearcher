"use client";

import Input from "@/framework/ui/input/Input";
import { INPUT_STYLE_TYPES } from "@/config/inputConfig";
import { INPUT_TYPES } from "@/config/inputTypeConfig";
import StyleGuideSection from "../common/StyleGuideSection";
import VariantRow from "../common/VariantRow";

/** A sensible default value per native input type, so nothing renders empty. */
const SAMPLE_VALUE: Partial<Record<(typeof INPUT_TYPES)[number], string>> = {
  text: "Athens",
  number: "24",
  date: "2026-09-14",
  time: "09:30",
  email: "group@example.com",
  password: "secret123",
  color: "#2563EB",
  range: "60",
};

export default function InputSection() {
  return (
    <StyleGuideSection
      title="Inputs"
      source="app/config/inputConfig.ts · app/config/inputTypeConfig.ts"
    >
      {INPUT_STYLE_TYPES.map((styleType) => (
        <VariantRow key={styleType} label={styleType}>
          <div className="w-48">
            <Input styleType={styleType} placeholder="Placeholder" />
          </div>
          <div className="w-48">
            <Input styleType={styleType} defaultValue="Filled value" />
          </div>
          <div className="w-48">
            <Input styleType={styleType} defaultValue="Disabled" disabled />
          </div>
        </VariantRow>
      ))}

      {INPUT_TYPES.map((type) => (
        <VariantRow key={type} label={`type="${type}"`}>
          <div className={type === "range" || type === "file" ? "w-64" : "w-48"}>
            <Input type={type} defaultValue={SAMPLE_VALUE[type]} />
          </div>
        </VariantRow>
      ))}
    </StyleGuideSection>
  );
}
