"use client";

import SearchInput from "@/framework/ui/searchInput/SearchInput";
import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { SEARCH_INPUT_TYPES } from "@/config/searchInputConfig";
import StyleGuideSection from "../common/StyleGuideSection";
import VariantRow from "../common/VariantRow";

export default function SearchInputSection() {
  return (
    <StyleGuideSection title="Search inputs" source="app/config/searchInputConfig.ts">
      {SEARCH_INPUT_TYPES.map((styleType) => (
        <VariantRow key={styleType} label={styleType}>
          <div className="w-full max-w-md">
            <SearchInput styleType={styleType} placeholder="Where to?" />
          </div>
        </VariantRow>
      ))}

      <VariantRow label="no icon">
        <div className="w-full max-w-md">
          <SearchInput styleType="simple" searchIcon={false} placeholder="No search icon" />
        </div>
      </VariantRow>

      <VariantRow label="leftButton">
        <div className="w-full max-w-md">
          <SearchInput
            styleType="BigSearch"
            placeholder="With a left button"
            leftButton={
              <Button styleType="tertiary" className="shrink-0">
                <Text icon="settings" value="Filters" size="small" />
              </Button>
            }
          />
        </div>
      </VariantRow>
    </StyleGuideSection>
  );
}
