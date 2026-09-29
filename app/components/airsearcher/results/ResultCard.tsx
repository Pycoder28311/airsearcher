"use client";

import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, colorSecondary, radiusBig, shadow } from "@/config/theme";
import type { Arrangement } from "@/lib/airsearcher/types";
import ResultCardClosed from "./ResultCardClosed";
import ResultCardOpen from "./ResultCardOpen";
import ResultDateHeader from "./ResultDateHeader";

/**
 * A result in the list. A thin switch between the two states, plus the controls
 * that belong to the list rather than to the card body.
 *
 * When the result has been floated its place in the list stays — so the
 * ordering never jumps — but goes inert: dimmed, with only "Bring back" live.
 */
export default function ResultCard({
  arrangement,
  cheapestPrice,
  compareWith,
  open,
  floating,
  showDateHeader = false,
  onToggle,
  onFloat,
  onUnfloat,
}: {
  arrangement: Arrangement;
  cheapestPrice: number;
  /** Every listed result, for the price comparison in the open state. */
  compareWith: Arrangement[];
  open: boolean;
  floating: boolean;
  /** Date-range searches only: the trip's dates and bounding hours on top. */
  showDateHeader?: boolean;
  onToggle: () => void;
  onFloat: () => void;
  onUnfloat: () => void;
}) {
  if (floating) {
    return (
      <article
        className={`flex items-center justify-between gap-3 bg-white ${border} ${radiusBig} p-4 opacity-50`}
      >
        <Text
          size="small"
          value="Floating — this result is open in a movable window"
          className={colorSecondary.text}
        />
        <Button styleType="tertiary" onClick={onUnfloat}>
          <Text size="small" value="Bring back" />
        </Button>
      </article>
    );
  }

  // Directly under the route summary in both states, so Open and Close sit in
  // the same place and the card never has to be scrolled to close it.
  const controls = (
    <div className="relative flex items-center justify-between gap-2">
      <Button styleType="tertiary" onClick={onToggle}>
        <Text
          icon={open ? "chevron-up" : "chevron-down"}
          iconPosition="right"
          size="small"
          value={open ? "Close" : "Open"}
        />
      </Button>

      {/*
        Free positioning is meaningless on a phone, so floating is offered
        from `lg` up only.
      */}
      {/* Centred between the buttons, in both states. */}
      <Text
        size="small"
        value={`${Math.round(arrangement.score * 100)}/100`}
        className="absolute left-1/2 -translate-x-1/2 font-semibold tabular-nums text-gray-700"
      />

      <Button styleType="tertiary" onClick={onFloat} className="hidden lg:inline-flex">
        <Text icon="upload" size="small" value="Float" />
      </Button>
    </div>
  );

  return (
    <article className={`flex flex-col gap-2 bg-white ${border} ${radiusBig} ${shadow} px-4 py-2`}>
      {showDateHeader && <ResultDateHeader arrangement={arrangement} />}

      {open ? (
        <ResultCardOpen
          arrangement={arrangement}
          cheapestPrice={cheapestPrice}
          compareWith={compareWith}
          controls={controls}
          largeHeaders={!showDateHeader}
        />
      ) : (
        <>
          <ResultCardClosed arrangement={arrangement} largeHeaders={!showDateHeader} />
          {controls}
        </>
      )}
    </article>
  );
}
