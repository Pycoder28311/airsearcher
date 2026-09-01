"use client";

import Text from "@/framework/ui/iconText/Text";
import ButtonSection from "@/components/airsearcher/styleguide/ButtonSection";
import TextSection from "@/components/airsearcher/styleguide/TextSection";
import InputSection from "@/components/airsearcher/styleguide/InputSection";
import SearchInputSection from "@/components/airsearcher/styleguide/SearchInputSection";
import OverlaySection from "@/components/airsearcher/styleguide/OverlaySection";
import ColorSection from "@/components/airsearcher/styleguide/ColorSection";

/**
 * Every variation of every reusable component, in one place, so the retuned
 * theme can be reviewed and compared at a glance. Development reference only —
 * it is not part of the AirSearcher flow.
 */
export default function StyleGuidePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <Text size="large" value="Style guide" className="font-semibold text-gray-900" />
        <Text
          size="small"
          value="Every reusable component and every named style type it accepts, driven by app/config."
          className="text-gray-500"
        />
      </header>

      <ColorSection />
      <ButtonSection />
      <TextSection />
      <InputSection />
      <SearchInputSection />
      <OverlaySection />
    </div>
  );
}
